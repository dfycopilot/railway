"""
Thumbnail Service — LivePortrait + rembg GPU Worker
=====================================================
FastAPI server for thumbnail image processing:
  - POST /process-thumbnail  (photo → expression change + bg removal → cutout PNG)
  - GET  /health             (health check + GPU info)

Processing pipeline:
  1. Download user's photo
  2. rembg: remove background → RGBA PNG
  3. LivePortrait: transfer expression from driving image → modified face
  4. Combine: apply rembg alpha mask to LivePortrait output
  5. Return: base64 PNG cutout

Authentication: Bearer token via THUMBNAIL_SERVICE_SECRET env var.
"""

import asyncio
import base64
import io
import logging
import os
import time
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("thumbnail-service")

# ── Configuration ────────────────────────────────────────────
SECRET = os.environ.get("THUMBNAIL_SERVICE_SECRET", "test123")
EXPRESSIONS_DIR = Path("/app/expressions")
LIVEPORTRAIT_DIR = Path("/app/LivePortrait")

# ── Models (loaded at startup) ───────────────────────────────
rembg_session = None
liveportrait_pipeline = None
expression_images = {}

app = FastAPI(title="Thumbnail Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_auth(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")
    token = authorization.replace("Bearer ", "").strip()
    if token != SECRET:
        raise HTTPException(401, "Invalid token")


def load_models():
    """Load rembg and LivePortrait models at startup."""
    global rembg_session, liveportrait_pipeline, expression_images

    log.info("Loading rembg model...")
    try:
        from rembg import new_session
        rembg_session = new_session("u2net")
        log.info("rembg model loaded successfully")
    except Exception as e:
        log.error(f"Failed to load rembg: {e}")

    log.info("Loading LivePortrait pipeline...")
    try:
        import sys
        sys.path.insert(0, str(LIVEPORTRAIT_DIR))

        # LivePortrait uses a pipeline class for inference
        from src.live_portrait_pipeline import LivePortraitPipeline
        from src.config.inference_config import InferenceConfig

        cfg = InferenceConfig()
        # Use the pretrained model weights
        cfg.models_config = str(LIVEPORTRAIT_DIR / "src" / "config" / "models.yaml")

        liveportrait_pipeline = LivePortraitPipeline(cfg)
        log.info("LivePortrait pipeline loaded successfully")
    except Exception as e:
        log.warning(f"LivePortrait not available (expression changes disabled): {e}")
        liveportrait_pipeline = None

    # Load expression driving images
    log.info("Loading expression driving images...")
    if EXPRESSIONS_DIR.exists():
        for expr_file in EXPRESSIONS_DIR.glob("*.png"):
            expr_name = expr_file.stem
            try:
                img = Image.open(expr_file).convert("RGB")
                expression_images[expr_name] = img
                log.info(f"  Loaded expression: {expr_name}")
            except Exception as e:
                log.error(f"  Failed to load {expr_name}: {e}")
    log.info(f"Loaded {len(expression_images)} expression presets")


@app.on_event("startup")
async def startup():
    load_models()


class ProcessRequest(BaseModel):
    photo_url: str
    expression: Optional[str] = None  # None = no expression change, just bg removal
    output_width: int = 1280
    output_height: int = 720


@app.post("/process-thumbnail")
async def process_thumbnail(req: ProcessRequest, authorization: Optional[str] = Header(None)):
    verify_auth(authorization)
    started = time.time()

    log.info(f"Processing: expression={req.expression} size={req.output_width}x{req.output_height}")

    # 1. Download the photo
    import httpx
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(req.photo_url)
            resp.raise_for_status()
            source_image = Image.open(io.BytesIO(resp.content)).convert("RGB")
        log.info(f"Downloaded photo: {source_image.size}")
    except Exception as e:
        raise HTTPException(400, f"Failed to download photo: {e}")

    # 2. Remove background with rembg
    cutout_rgba = None
    if rembg_session:
        try:
            from rembg import remove
            log.info("Running rembg background removal...")
            cutout_rgba = remove(source_image, session=rembg_session)
            log.info(f"Background removed: {cutout_rgba.size}, mode={cutout_rgba.mode}")
        except Exception as e:
            log.error(f"rembg failed: {e}")

    if cutout_rgba is None:
        # Fallback: use original image with no transparency
        cutout_rgba = source_image.convert("RGBA")

    # 3. Apply expression change with LivePortrait (if requested and available)
    if req.expression and req.expression != "none" and liveportrait_pipeline and req.expression in expression_images:
        try:
            log.info(f"Applying expression: {req.expression}")
            driving_image = expression_images[req.expression]

            # Run LivePortrait inference
            # Source: user's photo, Driving: expression reference image
            source_np = np.array(source_image)
            driving_np = np.array(driving_image)

            # LivePortrait expects specific input format
            result = liveportrait_pipeline.execute(source_np, driving_np)

            if result is not None:
                # Result is the expression-modified face
                result_image = Image.fromarray(result).convert("RGB")

                # Apply the alpha mask from rembg to the expression-modified face
                # Resize result to match cutout dimensions
                result_image = result_image.resize(cutout_rgba.size, Image.LANCZOS)
                result_rgba = result_image.convert("RGBA")

                # Copy alpha channel from rembg result
                alpha = cutout_rgba.split()[3]
                result_rgba.putalpha(alpha)
                cutout_rgba = result_rgba

                log.info(f"Expression applied: {req.expression}")
            else:
                log.warning("LivePortrait returned None, using original face")
        except Exception as e:
            log.error(f"LivePortrait expression change failed: {e}")
            # Continue with rembg-only cutout
    elif req.expression and req.expression != "none":
        if not liveportrait_pipeline:
            log.warning("LivePortrait not loaded — skipping expression change")
        elif req.expression not in expression_images:
            log.warning(f"Expression '{req.expression}' not found in presets")

    # 4. Resize cutout to fit output dimensions while preserving aspect ratio
    # The person should fill most of the height
    target_h = int(req.output_height * 0.85)
    aspect = cutout_rgba.width / cutout_rgba.height
    target_w = int(target_h * aspect)
    cutout_rgba = cutout_rgba.resize((target_w, target_h), Image.LANCZOS)

    # 5. Convert to base64
    buf = io.BytesIO()
    cutout_rgba.save(buf, format="PNG")
    cutout_base64 = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"

    elapsed = time.time() - started
    log.info(f"Done in {elapsed:.1f}s: {cutout_rgba.size} cutout, expression={req.expression or 'none'}")

    return JSONResponse({
        "cutout_base64": cutout_base64,
        "expression_applied": req.expression or "none",
        "processing_time_ms": int(elapsed * 1000),
        "cutout_width": cutout_rgba.width,
        "cutout_height": cutout_rgba.height,
    })


@app.get("/health")
async def health():
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
    gpu_memory = f"{torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB" if gpu_available else None

    return JSONResponse({
        "status": "healthy",
        "gpu": gpu_available,
        "gpu_name": gpu_name,
        "gpu_memory": gpu_memory,
        "rembg_loaded": rembg_session is not None,
        "liveportrait_loaded": liveportrait_pipeline is not None,
        "expressions_loaded": list(expression_images.keys()),
    })


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
