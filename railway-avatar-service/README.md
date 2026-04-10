# Railway Avatar Service

GPU-powered avatar animation service using **EchoMimicV2** (Ant Group, CVPR 2025).

Generates half-body talking avatar videos from a single photo + audio file, complete with:
- Natural lip sync
- Head movement
- Hand gestures
- Upper body animation

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/extract-features` | Extract face features from a photo (~5s) |
| POST | `/animate` | Generate avatar video from photo + audio (long-running) |
| POST | `/compose-webinar` | Composite avatar PiP over slides (long-running) |
| GET | `/status/{job_id}` | Check job progress |
| GET | `/download/{job_id}` | Download completed output |
| GET | `/health` | Health check + GPU info |

## Requirements

- NVIDIA GPU with 24GB+ VRAM (A10G minimum, A100 recommended)
- CUDA 12.1+
- Docker

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 8080) |
| `AVATAR_SERVICE_SECRET` | Yes | Bearer token for authentication |

## Deploy on Railway

1. Create a new service in your Railway project
2. Enable GPU (A10G or A100)
3. Connect this directory as the source
4. Set `AVATAR_SERVICE_SECRET` in environment variables
5. Deploy — first build takes ~15 minutes (model download)

## Render Time Estimates

| Audio Duration | A100 (80GB) | A10G (24GB) |
|---------------|-------------|-------------|
| 1 minute | ~12 min | ~22 min |
| 5 minutes | ~62 min | ~112 min |
| 30 minutes | ~6.25 hrs | ~11.25 hrs |

For long webinars, the service processes in chunks and concatenates.
