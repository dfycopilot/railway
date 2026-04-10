"""
Railway Avatar Service — EchoMimicV2 GPU Worker
================================================
FastAPI server that runs on a Railway GPU instance.
Provides endpoints for:
  - POST /extract-features  (photo → face model, ~5 seconds)
  - POST /animate           (photo + audio → half-body video, long-running)
  - POST /compose-webinar   (avatar video + slides → final MP4)
  - GET  /status/{job_id}   (check job progress)
  - GET  /health            (health check)

Authentication: Bearer token via AVATAR_SERVICE_SECRET env var.
"""

import asyncio
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
import traceback
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import torch
import uvicorn
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("avatar-service")

# ── Config ───────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", 8080))
SECRET = os.environ.get("AVATAR_SERVICE_SECRET", "")
MODELS_DIR = Path("/app/echomimic_v2/pretrained_weights")
JOBS_DIR = Path("/tmp/avatar_jobs")
JOBS_DIR.mkdir(parents=True, exist_ok=True)

# ── Job tracking ─────────────────────────────────────────────
jobs: dict[str, dict] = {}

# ── FastAPI app ──────────────────────────────────────────────
app = FastAPI(title="Railway Avatar Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth ─────────────────────────────────────────────────────
def verify_auth(authorization: Optional[str] = Header(None)):
    if not SECRET:
        return  # No secret configured = open (dev mode)
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")
    token = authorization.replace("Bearer ", "")
    if token != SECRET:
        raise HTTPException(403, "Invalid token")


# ── Models (lazy loaded) ─────────────────────────────────────
_model = None
_model_loading = False

def get_model():
    """Lazy-load EchoMimicV2 model on first request."""
    global _model, _model_loading
    if _model is not None:
        return _model
    if _model_loading:
        raise HTTPException(503, "Model is still loading. Try again in 60 seconds.")

    _model_loading = True
    log.info("Loading EchoMimicV2 model... (this takes 30-60 seconds on first request)")

    try:
        import sys
        sys.path.insert(0, "/app/echomimic_v2")

        # Import EchoMimicV2 pipeline
        from src.pipelines.pipeline_echo_mimic_v2 import EchoMimicV2Pipeline

        device = "cuda" if torch.cuda.is_available() else "cpu"
        log.info(f"Using device: {device}")

        if device == "cuda":
            log.info(f"GPU: {torch.cuda.get_device_name(0)}, VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f}GB")

        # Load the pipeline with pretrained weights
        pipeline = EchoMimicV2Pipeline.from_pretrained(
            str(MODELS_DIR),
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        ).to(device)

        _model = {
            "pipeline": pipeline,
            "device": device,
        }
        log.info("EchoMimicV2 model loaded successfully!")
        return _model

    except Exception as e:
        _model_loading = False
        log.error(f"Failed to load model: {e}")
        log.error(traceback.format_exc())
        raise HTTPException(500, f"Model loading failed: {str(e)}")


# ── Request / Response models ────────────────────────────────

class ExtractFeaturesRequest(BaseModel):
    photo_url: str  # URL to the reference photo
    job_id: Optional[str] = None

class AnimateRequest(BaseModel):
    photo_url: str        # URL to the reference photo
    audio_url: str        # URL to the speech audio file
    job_id: Optional[str] = None
    width: int = 768      # Output video width
    height: int = 768     # Output video height
    fps: int = 24         # Output FPS
    num_inference_steps: int = 20  # Quality vs speed tradeoff
    guidance_scale: float = 3.5
    seed: int = 42
    # Callback URL to POST status updates to (e.g., Supabase edge function)
    callback_url: Optional[str] = None
    callback_secret: Optional[str] = None

class ComposeWebinarRequest(BaseModel):
    avatar_video_url: str   # URL to the animated avatar video
    slides_url: str         # URL to the PowerPoint file or image sequence
    audio_url: str          # URL to the full audio track
    job_id: Optional[str] = None
    output_width: int = 1920
    output_height: int = 1080
    avatar_position: str = "top-right"  # top-right, top-left, bottom-right, bottom-left
    avatar_size_pct: int = 25  # Avatar PiP size as percentage of video width
    avatar_shape: str = "circle"  # circle or rectangle
    callback_url: Optional[str] = None
    callback_secret: Optional[str] = None


# ── Utility functions ────────────────────────────────────────

async def download_file(url: str, dest: Path) -> Path:
    """Download a file from a URL to a local path."""
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    return dest


async def send_callback(url: str, secret: str, payload: dict):
    """Send a status update callback to the caller."""
    if not url:
        return
    try:
        headers = {"Content-Type": "application/json"}
        if secret:
            headers["X-Webhook-Secret"] = secret
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(url, json=payload, headers=headers)
    except Exception as e:
        log.warning(f"Callback failed: {e}")


def update_job(job_id: str, **kwargs):
    """Update job status in the in-memory store."""
    if job_id in jobs:
        jobs[job_id].update(kwargs)
        jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()


# ── Endpoints ────────────────────────────────────────────────

@app.get("/health")
async def health():
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
    gpu_mem = f"{torch.cuda.get_device_properties(0).total_mem / 1e9:.1f}GB" if gpu_available else None
    return {
        "status": "healthy",
        "gpu": gpu_available,
        "gpu_name": gpu_name,
        "gpu_memory": gpu_mem,
        "model_loaded": _model is not None,
        "active_jobs": sum(1 for j in jobs.values() if j.get("status") == "processing"),
        "total_jobs": len(jobs),
    }


@app.get("/status/{job_id}")
async def get_status(job_id: str):
    verify_auth()
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    return jobs[job_id]


@app.post("/extract-features")
async def extract_features(req: ExtractFeaturesRequest, authorization: Optional[str] = Header(None)):
    """Extract face features from a reference photo. Fast (~5 seconds)."""
    verify_auth(authorization)
    model = get_model()

    job_id = req.job_id or str(uuid.uuid4())
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Download photo
        photo_path = await download_file(req.photo_url, job_dir / "reference.png")

        # Extract features using EchoMimicV2's feature extractor
        from PIL import Image
        photo = Image.open(photo_path).convert("RGB")

        # For EchoMimicV2, the "features" are just the preprocessed reference image
        # The model handles feature extraction internally during animation
        # We save the processed photo for later use
        photo_resized = photo.resize((768, 768), Image.LANCZOS)
        features_path = job_dir / "features.png"
        photo_resized.save(features_path)

        return {
            "job_id": job_id,
            "status": "completed",
            "features_path": str(features_path),
            "photo_size": photo.size,
            "message": "Face features extracted. Ready for animation.",
        }

    except Exception as e:
        log.error(f"Feature extraction failed: {e}")
        raise HTTPException(500, f"Feature extraction failed: {str(e)}")


@app.post("/animate")
async def animate(req: AnimateRequest, background_tasks: BackgroundTasks, authorization: Optional[str] = Header(None)):
    """
    Generate an animated avatar video from a photo + audio.
    This is a long-running task — returns immediately with a job_id.
    Poll /status/{job_id} for progress, or provide a callback_url.
    """
    verify_auth(authorization)

    job_id = req.job_id or str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "created_at": datetime.utcnow().isoformat(),
        "type": "animate",
    }

    background_tasks.add_task(
        _run_animation,
        job_id=job_id,
        photo_url=req.photo_url,
        audio_url=req.audio_url,
        width=req.width,
        height=req.height,
        fps=req.fps,
        num_inference_steps=req.num_inference_steps,
        guidance_scale=req.guidance_scale,
        seed=req.seed,
        callback_url=req.callback_url,
        callback_secret=req.callback_secret,
    )

    return {"job_id": job_id, "status": "queued", "message": "Animation job queued. Poll /status/{job_id} for progress."}


async def _run_animation(
    job_id: str,
    photo_url: str,
    audio_url: str,
    width: int,
    height: int,
    fps: int,
    num_inference_steps: int,
    guidance_scale: float,
    seed: int,
    callback_url: Optional[str],
    callback_secret: Optional[str],
):
    """Background task that runs the actual EchoMimicV2 animation."""
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    start_time = time.time()

    try:
        update_job(job_id, status="processing", progress=5, step="downloading")
        await send_callback(callback_url, callback_secret or "", {"job_id": job_id, "status": "processing", "progress": 5, "step": "downloading"})

        # Download inputs
        photo_path = await download_file(photo_url, job_dir / "photo.png")
        audio_path = await download_file(audio_url, job_dir / "audio.wav")

        update_job(job_id, progress=10, step="loading_model")
        model = get_model()
        pipeline = model["pipeline"]
        device = model["device"]

        update_job(job_id, progress=15, step="preprocessing")
        await send_callback(callback_url, callback_secret or "", {"job_id": job_id, "status": "processing", "progress": 15, "step": "preprocessing"})

        from PIL import Image
        import librosa

        # Load and preprocess photo
        photo = Image.open(photo_path).convert("RGB")
        photo = photo.resize((width, height), Image.LANCZOS)

        # Load audio and get duration
        audio_data, sr = librosa.load(str(audio_path), sr=16000)
        audio_duration = len(audio_data) / sr
        total_frames = int(audio_duration * fps)

        log.info(f"[{job_id}] Audio: {audio_duration:.1f}s, generating {total_frames} frames at {fps}fps")
        update_job(job_id, progress=20, step="generating", total_frames=total_frames, audio_duration=audio_duration)

        # Run EchoMimicV2 inference
        # The pipeline generates video frames from the photo + audio
        output_path = job_dir / "output.mp4"

        # EchoMimicV2 inference — this is the slow part
        # For long audio (30+ min), we process in chunks to avoid OOM
        CHUNK_DURATION = 30  # seconds per chunk
        chunk_count = max(1, int(np.ceil(audio_duration / CHUNK_DURATION)))

        log.info(f"[{job_id}] Processing {chunk_count} chunk(s) of {CHUNK_DURATION}s each")

        chunk_paths = []
        for chunk_idx in range(chunk_count):
            chunk_start = chunk_idx * CHUNK_DURATION
            chunk_end = min((chunk_idx + 1) * CHUNK_DURATION, audio_duration)
            chunk_samples_start = int(chunk_start * sr)
            chunk_samples_end = int(chunk_end * sr)
            chunk_audio = audio_data[chunk_samples_start:chunk_samples_end]

            progress_pct = 20 + int((chunk_idx / chunk_count) * 70)
            update_job(job_id, progress=progress_pct, step=f"generating_chunk_{chunk_idx + 1}_of_{chunk_count}")

            if chunk_idx % 5 == 0:
                await send_callback(callback_url, callback_secret or "", {
                    "job_id": job_id, "status": "processing",
                    "progress": progress_pct,
                    "step": f"chunk {chunk_idx + 1}/{chunk_count}",
                })

            # Save chunk audio
            chunk_audio_path = job_dir / f"chunk_{chunk_idx}.wav"
            import soundfile as sf
            sf.write(str(chunk_audio_path), chunk_audio, sr)

            # Generate chunk video
            chunk_video_path = job_dir / f"chunk_{chunk_idx}.mp4"

            # Call EchoMimicV2 pipeline
            with torch.no_grad():
                result = pipeline(
                    ref_image=photo,
                    audio_path=str(chunk_audio_path),
                    width=width,
                    height=height,
                    fps=fps,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    seed=seed,
                    output_path=str(chunk_video_path),
                )

            chunk_paths.append(str(chunk_video_path))
            log.info(f"[{job_id}] Chunk {chunk_idx + 1}/{chunk_count} complete")

        # Concatenate chunks if multiple
        if len(chunk_paths) == 1:
            shutil.move(chunk_paths[0], str(output_path))
        else:
            update_job(job_id, progress=92, step="concatenating_chunks")
            concat_list = job_dir / "concat.txt"
            with open(concat_list, "w") as f:
                for cp in chunk_paths:
                    f.write(f"file '{cp}'\n")
            subprocess.run([
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", str(concat_list),
                "-c", "copy", str(output_path),
            ], check=True, capture_output=True)

        elapsed = time.time() - start_time
        file_size = output_path.stat().st_size

        update_job(
            job_id,
            status="completed",
            progress=100,
            step="done",
            output_path=str(output_path),
            duration_seconds=audio_duration,
            total_frames=total_frames,
            elapsed_seconds=round(elapsed, 1),
            file_size_mb=round(file_size / 1e6, 1),
        )

        log.info(f"[{job_id}] Animation complete: {audio_duration:.0f}s video in {elapsed:.0f}s ({file_size / 1e6:.1f}MB)")

        await send_callback(callback_url, callback_secret or "", {
            "job_id": job_id,
            "status": "completed",
            "progress": 100,
            "output_path": str(output_path),
            "duration_seconds": audio_duration,
            "elapsed_seconds": round(elapsed, 1),
        })

    except Exception as e:
        elapsed = time.time() - start_time
        error_msg = str(e)
        log.error(f"[{job_id}] Animation failed after {elapsed:.0f}s: {error_msg}")
        log.error(traceback.format_exc())

        update_job(job_id, status="failed", error=error_msg, elapsed_seconds=round(elapsed, 1))
        await send_callback(callback_url, callback_secret or "", {
            "job_id": job_id, "status": "failed", "error": error_msg,
        })


@app.post("/compose-webinar")
async def compose_webinar(req: ComposeWebinarRequest, background_tasks: BackgroundTasks, authorization: Optional[str] = Header(None)):
    """
    Composite an avatar video over presentation slides.
    The avatar appears as a PiP (picture-in-picture) overlay.
    """
    verify_auth(authorization)

    job_id = req.job_id or str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "created_at": datetime.utcnow().isoformat(),
        "type": "compose",
    }

    background_tasks.add_task(
        _run_composition,
        job_id=job_id,
        avatar_video_url=req.avatar_video_url,
        slides_url=req.slides_url,
        audio_url=req.audio_url,
        output_width=req.output_width,
        output_height=req.output_height,
        avatar_position=req.avatar_position,
        avatar_size_pct=req.avatar_size_pct,
        avatar_shape=req.avatar_shape,
        callback_url=req.callback_url,
        callback_secret=req.callback_secret,
    )

    return {"job_id": job_id, "status": "queued"}


async def _run_composition(
    job_id: str,
    avatar_video_url: str,
    slides_url: str,
    audio_url: str,
    output_width: int,
    output_height: int,
    avatar_position: str,
    avatar_size_pct: int,
    avatar_shape: str,
    callback_url: Optional[str],
    callback_secret: Optional[str],
):
    """Background task for PiP composition of avatar over slides."""
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    start_time = time.time()

    try:
        update_job(job_id, status="processing", progress=10, step="downloading")

        # Download inputs
        avatar_path = await download_file(avatar_video_url, job_dir / "avatar.mp4")
        slides_path = await download_file(slides_url, job_dir / "slides.pdf")
        audio_path = await download_file(audio_url, job_dir / "audio.wav")

        update_job(job_id, progress=30, step="compositing")

        # Calculate PiP position and size
        avatar_w = int(output_width * avatar_size_pct / 100)
        avatar_h = avatar_w  # Square for circle crop
        margin = 20

        position_map = {
            "top-right": f"{output_width - avatar_w - margin}:{margin}",
            "top-left": f"{margin}:{margin}",
            "bottom-right": f"{output_width - avatar_w - margin}:{output_height - avatar_h - margin}",
            "bottom-left": f"{margin}:{output_height - avatar_h - margin}",
        }
        overlay_pos = position_map.get(avatar_position, position_map["top-right"])

        output_path = job_dir / "webinar.mp4"

        # Build FFmpeg filter for PiP with circular mask
        if avatar_shape == "circle":
            # Create circular mask overlay
            filter_complex = (
                f"[1:v]scale={avatar_w}:{avatar_h}[avatar];"
                f"[avatar]format=yuva420p,geq="
                f"lum='p(X,Y)':a='if(gt(pow((X-{avatar_w//2}),2)+pow((Y-{avatar_h//2}),2),pow({avatar_w//2},2)),0,255)'[masked];"
                f"[0:v][masked]overlay={overlay_pos}[out]"
            )
        else:
            filter_complex = (
                f"[1:v]scale={avatar_w}:{avatar_h}[avatar];"
                f"[0:v][avatar]overlay={overlay_pos}[out]"
            )

        # Run FFmpeg composition
        # For now, use the slides as a static background image
        # TODO: Advance slides on a per-slide timing schedule from the script
        cmd = [
            "ffmpeg", "-y",
            "-i", str(slides_path),    # Background (slides)
            "-i", str(avatar_path),     # Avatar overlay
            "-i", str(audio_path),      # Audio track
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-map", "2:a",
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            "-s", f"{output_width}x{output_height}",
            "-shortest",
            str(output_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr[:500]}")

        elapsed = time.time() - start_time
        file_size = output_path.stat().st_size

        update_job(
            job_id,
            status="completed",
            progress=100,
            step="done",
            output_path=str(output_path),
            elapsed_seconds=round(elapsed, 1),
            file_size_mb=round(file_size / 1e6, 1),
        )

        await send_callback(callback_url, callback_secret or "", {
            "job_id": job_id, "status": "completed", "output_path": str(output_path),
        })

    except Exception as e:
        elapsed = time.time() - start_time
        log.error(f"[{job_id}] Composition failed: {e}")
        update_job(job_id, status="failed", error=str(e))
        await send_callback(callback_url, callback_secret or "", {
            "job_id": job_id, "status": "failed", "error": str(e),
        })


@app.get("/download/{job_id}")
async def download_output(job_id: str, authorization: Optional[str] = Header(None)):
    """Download the output file for a completed job."""
    verify_auth(authorization)
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    if job.get("status") != "completed":
        raise HTTPException(400, f"Job is {job.get('status')}, not completed")
    output_path = job.get("output_path")
    if not output_path or not Path(output_path).exists():
        raise HTTPException(404, "Output file not found")
    return FileResponse(output_path, media_type="video/mp4", filename=f"{job_id}.mp4")


# ── Run server ───────────────────────────────────────────────
if __name__ == "__main__":
    log.info(f"Starting Avatar Service on port {PORT}")
    log.info(f"GPU available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        log.info(f"GPU: {torch.cuda.get_device_name(0)}")
        log.info(f"VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f}GB")
    uvicorn.run(app, host="0.0.0.0", port=PORT, workers=1)
