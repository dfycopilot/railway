"""
Avatar Service — Hallo2 GPU Worker
====================================
FastAPI server that runs on RunPod GPU instances.
Provides endpoints for:
  - POST /animate           (photo + audio → talking head video)
  - GET  /status/{job_id}   (check job progress)
  - GET  /health            (health check)
  - GET  /download/{job_id} (download result video)

Uses Hallo2's inference_long.py as a subprocess for maximum
compatibility with their model loading code.

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

import torch
import uvicorn
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("avatar-service")

# ── Config ───────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", 8080))
SECRET = os.environ.get("AVATAR_SERVICE_SECRET", "")
HALLO2_DIR = Path("/app/hallo2")
JOBS_DIR = Path("/tmp/avatar_jobs")
JOBS_DIR.mkdir(parents=True, exist_ok=True)

# ── Job tracking ─────────────────────────────────────────────
jobs: dict[str, dict] = {}

# ── FastAPI app ──────────────────────────────────────────────
app = FastAPI(title="Hallo2 Avatar Service", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth ─────────────────────────────────────────────────────
def verify_auth(authorization: Optional[str] = None):
    if not SECRET:
        return
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")
    token = str(authorization or "").replace("Bearer ", "")
    if token != SECRET:
        raise HTTPException(403, "Invalid token")


# ── Request models ───────────────────────────────────────────

class AnimateRequest(BaseModel):
    photo_url: str
    audio_url: str
    job_id: Optional[str] = None
    width: int = 512
    height: int = 512
    fps: int = 25
    inference_steps: int = 40
    cfg_scale: float = 3.5
    seed: int = 42
    callback_url: Optional[str] = None
    callback_secret: Optional[str] = None


# ── Utility functions ────────────────────────────────────────

async def download_file(url: str, dest: Path) -> Path:
    """Download a file from a URL (or copy from local file:// path)."""
    url_str = str(url)
    if url_str.startswith("file://"):
        local_path = url_str[7:]
        shutil.copy2(local_path, dest)
        return dest
    if url_str.startswith("/"):
        shutil.copy2(url_str, dest)
        return dest

    import httpx
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.get(url_str)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    return dest


def update_job(job_id: str, **kwargs):
    if job_id in jobs:
        jobs[job_id].update(kwargs)
        jobs[job_id]["updated_at"] = datetime.utcnow().isoformat()


async def send_callback(url: str, secret: str, payload: dict):
    if not url:
        return
    try:
        import httpx
        headers = {"Content-Type": "application/json"}
        if secret:
            headers["X-Webhook-Secret"] = secret
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(url, json=payload, headers=headers)
    except Exception as e:
        log.warning(f"Callback failed: {e}")


# ── Endpoints ────────────────────────────────────────────────

@app.get("/health")
async def health():
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
    gpu_mem = f"{torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB" if gpu_available else None
    hallo2_exists = HALLO2_DIR.exists() and (HALLO2_DIR / "pretrained_models").exists()
    return {
        "status": "healthy",
        "gpu": gpu_available,
        "gpu_name": gpu_name,
        "gpu_memory": gpu_mem,
        "hallo2_installed": hallo2_exists,
        "active_jobs": sum(1 for j in jobs.values() if j.get("status") == "processing"),
        "total_jobs": len(jobs),
    }


@app.get("/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    return jobs[job_id]


@app.get("/download/{job_id}")
async def download_result(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    if job.get("status") != "completed":
        raise HTTPException(400, f"Job is {job.get('status')}, not completed")
    output_path = job.get("output_path")
    if not output_path or not Path(output_path).exists():
        raise HTTPException(404, "Output file not found")
    return FileResponse(output_path, media_type="video/mp4", filename=f"avatar_{job_id}.mp4")


@app.post("/animate")
async def animate(req: AnimateRequest, background_tasks: BackgroundTasks, authorization: Optional[str] = Header(None)):
    """Generate an animated avatar video from a photo + audio.
    Returns immediately with a job_id. Poll /status/{job_id} for progress."""
    verify_auth(authorization)

    job_id = req.job_id or str(uuid.uuid4())
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "created_at": datetime.utcnow().isoformat(),
        "type": "animate",
        "step": "queued",
    }

    background_tasks.add_task(run_hallo2_animation, job_id, req, job_dir)

    return {"job_id": job_id, "status": "queued", "message": "Animation job queued. Poll /status/{job_id} for progress."}


async def run_hallo2_animation(job_id: str, req: AnimateRequest, job_dir: Path):
    """Background task that runs Hallo2 inference."""
    start_time = time.time()

    try:
        # ── Step 1: Download inputs ──
        update_job(job_id, status="processing", step="downloading", progress=5)
        log.info(f"[{job_id}] Downloading photo from {req.photo_url}")
        photo_path = await download_file(req.photo_url, job_dir / "reference.jpg")
        log.info(f"[{job_id}] Downloading audio from {req.audio_url}")
        audio_path = await download_file(req.audio_url, job_dir / "audio.mp3")
        update_job(job_id, step="downloaded", progress=10)

        # ── Step 2: Prepare Hallo2 config ──
        update_job(job_id, step="preparing", progress=15)

        # Create a custom config YAML for this job
        config_content = f"""source_image: {str(photo_path)}
driving_audio: {str(audio_path)}

weight_dtype: fp16

data:
  n_motion_frames: 2
  n_sample_frames: 16
  source_image:
    width: {req.width}
    height: {req.height}
  driving_audio:
    sample_rate: 16000
  export_video:
    fps: {req.fps}

inference_steps: {req.inference_steps}
cfg_scale: {req.cfg_scale}

use_mask: true
mask_rate: 0.25
use_cut: true

audio_ckpt_dir: {HALLO2_DIR}/pretrained_models/hallo2

save_path: {str(job_dir)}/output/
cache_path: {str(job_dir)}/.cache

base_model_path: {HALLO2_DIR}/pretrained_models/stable-diffusion-v1-5
motion_module_path: {HALLO2_DIR}/pretrained_models/motion_module/mm_sd_v15_v2.ckpt

face_analysis:
  model_path: {HALLO2_DIR}/pretrained_models/face_analysis

wav2vec:
  model_path: {HALLO2_DIR}/pretrained_models/wav2vec/wav2vec2-base-960h
  features: all

audio_separator:
  model_path: {HALLO2_DIR}/pretrained_models/audio_separator/Kim_Vocal_2.onnx

vae:
  model_path: {HALLO2_DIR}/pretrained_models/sd-vae-ft-mse

face_expand_ratio: 1.2
pose_weight: 1.0
face_weight: 1.0
lip_weight: 1.0

unet_additional_kwargs:
  use_inflated_groupnorm: true
  unet_use_cross_frame_attention: false
  unet_use_temporal_attention: false
  use_motion_module: true
  use_audio_module: true
  motion_module_resolutions:
    - 1
    - 2
    - 4
    - 8
  motion_module_mid_block: true
  motion_module_decoder_only: false
  motion_module_type: Vanilla
  motion_module_kwargs:
    num_attention_heads: 8
    num_transformer_block: 1
    attention_block_types:
      - Temporal_Self
      - Temporal_Self
    temporal_position_encoding: true
    temporal_position_encoding_max_len: 32
    temporal_attention_dim_div: 1
  audio_attention_dim: 768
  stack_enable_blocks_name:
    - "up"
    - "down"
    - "mid"
  stack_enable_blocks_depth: [0,1,2,3]

enable_zero_snr: true

noise_scheduler_kwargs:
  beta_start: 0.00085
  beta_end: 0.012
  beta_schedule: "linear"
  clip_sample: false
  steps_offset: 1
  prediction_type: "v_prediction"
  rescale_betas_zero_snr: True
  timestep_spacing: "trailing"

sampler: DDIM
"""
        config_path = job_dir / "config.yaml"
        config_path.write_text(config_content)

        # ── Step 3: Run Hallo2 inference ──
        update_job(job_id, step="loading_model", progress=20)
        log.info(f"[{job_id}] Starting Hallo2 inference (steps={req.inference_steps}, size={req.width}x{req.height})")

        env = os.environ.copy()
        env["PYTHONPATH"] = f"{HALLO2_DIR}:{env.get('PYTHONPATH', '')}"
        env["FFMPEG_PATH"] = "/usr/bin"

        process = await asyncio.create_subprocess_exec(
            "python", str(HALLO2_DIR / "scripts" / "inference_long.py"),
            "--config", str(config_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(HALLO2_DIR),
            env=env,
        )

        update_job(job_id, step="animating", progress=30)

        stdout, stderr = await process.communicate()
        stdout_text = stdout.decode("utf-8", errors="replace")
        stderr_text = stderr.decode("utf-8", errors="replace")

        log.info(f"[{job_id}] Hallo2 process exited with code {process.returncode}")
        if stdout_text.strip():
            log.info(f"[{job_id}] stdout: {stdout_text[-500:]}")
        if stderr_text.strip():
            log.info(f"[{job_id}] stderr: {stderr_text[-500:]}")

        if process.returncode != 0:
            error_msg = stderr_text[-500:] or stdout_text[-500:] or "Unknown error"
            update_job(job_id, status="failed", step="error", error=error_msg,
                       elapsed_seconds=round(time.time() - start_time, 1))
            await send_callback(req.callback_url, req.callback_secret, jobs[job_id])
            return

        # ── Step 4: Find the output video ──
        update_job(job_id, step="finalizing", progress=90)
        output_dir = job_dir / "output"
        output_files = list(output_dir.rglob("*.mp4")) if output_dir.exists() else []

        if not output_files:
            # Hallo2 sometimes saves to a different location
            output_files = list(job_dir.rglob("*.mp4"))

        if not output_files:
            update_job(job_id, status="failed", step="error",
                       error="No output video found after inference",
                       elapsed_seconds=round(time.time() - start_time, 1))
            await send_callback(req.callback_url, req.callback_secret, jobs[job_id])
            return

        # Use the most recently created MP4
        output_file = max(output_files, key=lambda f: f.stat().st_mtime)
        final_path = job_dir / "result.mp4"
        shutil.copy2(output_file, final_path)

        elapsed = round(time.time() - start_time, 1)
        update_job(job_id, status="completed", step="done", progress=100,
                   output_path=str(final_path),
                   elapsed_seconds=elapsed)

        log.info(f"[{job_id}] Animation completed in {elapsed}s → {final_path}")
        await send_callback(req.callback_url, req.callback_secret, jobs[job_id])

    except Exception as e:
        log.error(f"[{job_id}] Animation failed: {e}")
        log.error(traceback.format_exc())
        update_job(job_id, status="failed", step="error", error=str(e),
                   elapsed_seconds=round(time.time() - start_time, 1))
        await send_callback(req.callback_url, req.callback_secret, jobs[job_id])


# ── Main ─────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info(f"Starting Avatar Service on port {PORT}")
    log.info(f"GPU available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        log.info(f"GPU: {torch.cuda.get_device_name(0)}")
        log.info(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")
    log.info(f"Hallo2 dir: {HALLO2_DIR} (exists: {HALLO2_DIR.exists()})")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
