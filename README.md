# FFmpeg Render Worker for DFY Copilot

Custom FFmpeg rendering service that processes video edit specs from the DFY Copilot pipeline.

## Features
- **Cut & trim** segments (remove dead air/filler words)
- **B-roll splicing** with auto-scaling to portrait (1080x1920)
- **Caption burn-in** via ASS subtitles
- **Background music mixing** with configurable volume
- **Async processing** with callback-based status updates
- **Auto-upload** results to Supabase Storage

## Deploy to Railway

### Option A: New Service (Recommended)
1. Create a new **GitHub repo** and push these files to it
2. In Railway, **delete your current ffmpeg-rest service**
3. Click **"New Service" → "GitHub Repo"** → select your new repo
4. Add these **environment variables** in Railway:
   - `AUTH_TOKEN` = (generate a secure random string, e.g. `openssl rand -hex 32`)
   - `PORT` = `3000` (Railway usually sets this automatically)
5. Deploy!

### Option B: Replace Existing
1. In your existing Railway project, remove the current service
2. Deploy this repo instead using the same steps above

## After Deploying

1. Copy the Railway deployment URL (e.g. `https://your-service.up.railway.app`)
2. In Lovable, update these secrets:
   - `FFMPEG_SERVICE_URL` → your Railway URL (no trailing slash)
   - `FFMPEG_AUTH_TOKEN` → the same AUTH_TOKEN you set in Railway

## Testing

```bash
# Health check
curl https://your-service.up.railway.app/health

# Test auth
curl -H "Authorization: Bearer YOUR_AUTH_TOKEN" https://your-service.up.railway.app/health
```

## API

### POST /render
Accepts a render spec and processes it asynchronously.

**Request body:**
```json
{
  "job_id": "uuid",
  "source_video_url": "https://...",
  "output_path": "user_id/output.mp4",
  "keep_segments": [{"start": 0, "end": 5.2}, {"start": 7.1, "end": 15.0}],
  "broll_clips": [{"insert_at": 3.0, "duration": 2.5, "video_url": "https://..."}],
  "captions": [{"start": 0, "end": 2.0, "text": "Hello world"}],
  "music": {"url": "https://...", "volume": 0.15},
  "output": {"video_codec": "libx264", "crf": 23, "preset": "medium"},
  "callback_url": "https://...",
  "callback_headers": {"Authorization": "Bearer ..."},
  "storage_upload": {"url": "https://...", "authorization": "Bearer ..."}
}
```

**Response:** `{ "render_id": "uuid", "status": "processing" }`

Callback is called with progress updates and final status.
