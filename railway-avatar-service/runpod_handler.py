"""
RunPod Serverless Handler for Thumbnail Service v2
====================================================
Wraps the thumbnail processing logic for RunPod's serverless infrastructure.
RunPod Serverless calls handler(event) instead of HTTP endpoints.

Input event format:
{
  "input": {
    "photo_url": "https://...",
    "expression": "surprised",  // or null for no expression change
    "output_width": 1280,
    "output_height": 720
  }
}

Output format:
{
  "cutout_base64": "data:image/png;base64,...",
  "expression_applied": "surprised",
  "processing_time_ms": 2300
}
"""

import base64
import io
import logging
import os
import time
from pathlib import Path

import numpy as np
import runpod
import torch
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("thumbnail-handler")

EXPRESSIONS_DIR = Path("/app/expressions")
LIVEPORTRAIT_DIR = Path("/app/LivePortrait")

# ── Global model references (loaded once at cold start) ──
rembg_session = None
liveportrait_pipeline = None
expression_images = {}


def load_models():
    """Load rembg and LivePortrait models once at startup."""
    global rembg_session, liveportrait_pipeline, expression_images

    log.info("Loading rembg model...")
    try:
        from rembg import new_session
        rembg_session = new_session("u2net")
        log.info("rembg loaded")
    except Exception as e:
        log.error(f"rembg failed: {e}")

    log.info("Loading LivePortrait...")
    try:
        import sys
        sys.path.insert(0, str(LIVEPORTRAIT_DIR))
        from src.live_portrait_pipeline import LivePortraitPipeline
        from src.config.inference_config import InferenceConfig
        from src.config.crop_config import CropConfig

        inference_cfg = InferenceConfig()
        crop_cfg = CropConfig()
        liveportrait_pipeline = LivePortraitPipeline(
            inference_cfg=inference_cfg,
            crop_cfg=crop_cfg,
        )
        log.info("LivePortrait loaded")
    except Exception as e:
        log.warning(f"LivePortrait unavailable: {e}")
        liveportrait_pipeline = None

    log.info("Loading expression images...")
    log.info(f"Expressions dir: {EXPRESSIONS_DIR}, exists: {EXPRESSIONS_DIR.exists()}")
    if EXPRESSIONS_DIR.exists():
        log.info(f"Contents: {list(EXPRESSIONS_DIR.glob('*'))}")
    if EXPRESSIONS_DIR.exists():
        for f in EXPRESSIONS_DIR.glob("*.png"):
            try:
                expression_images[f.stem] = Image.open(f).convert("RGB")
                log.info(f"  {f.stem}")
            except Exception as e:
                log.error(f"  Failed {f.stem}: {e}")
    log.info(f"Loaded {len(expression_images)} expressions")


def handler(event):
    """RunPod serverless handler — processes one thumbnail request."""
    started = time.time()

    inp = event.get("input", {})
    photo_url = inp.get("photo_url")
    expression = inp.get("expression")
    output_width = inp.get("output_width", 1280)
    output_height = inp.get("output_height", 720)

    if not photo_url:
        return {"error": "Missing photo_url"}

    log.info(f"Processing: expression={expression} size={output_width}x{output_height}")

    # 1. Download photo
    import httpx
    try:
        resp = httpx.get(photo_url, timeout=30.0)
        resp.raise_for_status()
        source_image = Image.open(io.BytesIO(resp.content)).convert("RGB")
        log.info(f"Downloaded: {source_image.size}")
    except Exception as e:
        return {"error": f"Download failed: {e}"}

    # 2. Remove background
    cutout_rgba = None
    if rembg_session:
        try:
            from rembg import remove
            cutout_rgba = remove(source_image, session=rembg_session)
            log.info(f"Background removed: {cutout_rgba.size}")
        except Exception as e:
            log.error(f"rembg failed: {e}")

    if cutout_rgba is None:
        cutout_rgba = source_image.convert("RGBA")

    # 3. Apply expression
    if expression and expression != "none" and liveportrait_pipeline and expression in expression_images:
        try:
            log.info(f"Applying expression: {expression}")
            driving_image = expression_images[expression]

            # Save source and driving images to temp files (LivePortrait expects file paths)
            import tempfile
            src_path = os.path.join(tempfile.gettempdir(), f"lp_src_{os.getpid()}.png")
            drv_path = os.path.join(tempfile.gettempdir(), f"lp_drv_{os.getpid()}.png")
            out_dir = os.path.join(tempfile.gettempdir(), f"lp_out_{os.getpid()}")
            os.makedirs(out_dir, exist_ok=True)

            source_image.save(src_path)
            driving_image.save(drv_path)

            # Create an args-like object for LivePortrait's execute method
            # LivePortrait expects: args.source, args.driving, args.output_dir
            from types import SimpleNamespace
            args = SimpleNamespace(
                source=src_path,
                driving=drv_path,
                output_dir=out_dir,
                flag_relative_motion=True,
                flag_do_crop=True,
                flag_pasteback=True,
                flag_do_rot=True,
                flag_stitching=True,
                driving_multiplier=1.0,
                flag_crop_driving_video=True,
                flag_eye_retargeting=False,
                flag_lip_retargeting=False,
                animation_region="all",
                flag_write_result=True,
                flag_write_gif=False,
            )

            liveportrait_pipeline.execute(args)

            # Find the output image
            output_files = list(Path(out_dir).glob("*.png")) + list(Path(out_dir).glob("*.jpg"))
            if output_files:
                result_image = Image.open(output_files[0]).convert("RGB")
                result_image = result_image.resize(cutout_rgba.size, Image.LANCZOS)
                result_rgba = result_image.convert("RGBA")
                # Apply the alpha mask from rembg
                alpha = cutout_rgba.split()[3]
                result_rgba.putalpha(alpha)
                cutout_rgba = result_rgba
                log.info(f"Expression applied: {expression}")
            else:
                log.warning("LivePortrait produced no output files")

            # Cleanup temp files
            for f in [src_path, drv_path]:
                try: os.remove(f)
                except: pass
            import shutil
            try: shutil.rmtree(out_dir)
            except: pass

        except Exception as e:
            log.error(f"Expression failed: {e}")
            import traceback
            traceback.print_exc()

    # 4. Resize
    target_h = int(output_height * 0.85)
    aspect = cutout_rgba.width / cutout_rgba.height
    target_w = int(target_h * aspect)
    cutout_rgba = cutout_rgba.resize((target_w, target_h), Image.LANCZOS)

    # 5. Encode
    buf = io.BytesIO()
    cutout_rgba.save(buf, format="PNG")
    cutout_base64 = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"

    elapsed = time.time() - started
    log.info(f"Done in {elapsed:.1f}s")

    return {
        "cutout_base64": cutout_base64,
        "expression_applied": expression or "none",
        "processing_time_ms": int(elapsed * 1000),
        "cutout_width": cutout_rgba.width,
        "cutout_height": cutout_rgba.height,
    }


# Load models at import time (RunPod cold start)
load_models()

# Start RunPod serverless handler
runpod.serverless.start({"handler": handler})
