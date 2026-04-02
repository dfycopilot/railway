# Remotion Full Composition Service

Renders complete videos from a JSON composition spec — cuts, zooms, transitions, styled captions, B-roll, overlays, and music. All powered by React/Remotion.

## Deploy to Railway

1. Push this directory to a GitHub repo (or add to your existing `dfycopilot/railway` repo)
2. Create a new Railway service pointing to this directory
3. Set environment variables:
   - `FFMPEG_AUTH_TOKEN` — same token your edge functions use
   - `PORT` — Railway sets this automatically
4. Deploy — the Dockerfile handles Chromium + FFmpeg installation

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FFMPEG_AUTH_TOKEN` | Yes | Auth token matching your edge function config |
| `PORT` | Auto | Set by Railway |
| `PUPPETEER_EXECUTABLE_PATH` | Auto | Set in Dockerfile (`/usr/bin/chromium`) |

## API

### `POST /render-composition`

Accepts a full composition spec and renders the video asynchronously.

**Headers:**
- `Authorization: Bearer <FFMPEG_AUTH_TOKEN>`
- `Content-Type: application/json`

**Body:**
```json
{
  "job_id": "uuid",
  "composition": {
    "fps": 30,
    "width": 1080,
    "height": 1920,
    "duration_frames": 900,
    "source_video_url": "https://...",
    "caption_preset": "hormozi",
    "scenes": [...],
    "captions": [...],
    "transitions": [...],
    "overlays": {...},
    "music": { "url": "...", "volume": 0.15 }
  },
  "storage_upload": {
    "signed_url": "https://...",
    "path": "user_id/remotion_job_id.mp4"
  },
  "output_path": "user_id/remotion_job_id.mp4",
  "callback_url": "https://your-supabase/functions/v1/remotion-render-callback",
  "callback_headers": { "Authorization": "Bearer ...", "Content-Type": "application/json" }
}
```

**Response (immediate):**
```json
{ "render_id": "uuid", "status": "rendering" }
```

The service renders asynchronously, reports progress via callback, uploads the MP4 via the signed URL, and sends a final callback when done.

### `GET /health`
Returns `{ "status": "ok" }`

## Caption Presets

| ID | Style | Description |
|----|-------|-------------|
| `hormozi` | Hormozi Bold | Word-by-word pop-in, yellow highlights, bold uppercase |
| `cinematic` | Cinematic | Clean bottom text, fade transitions, gradient backdrop |
| `tiktok` | TikTok Trendy | Bouncy animations, colorful highlights, dynamic sizing |
| `minimal` | Minimal | Small lowercase, bottom-left, simple fade |
| `karaoke` | Karaoke | Full sentence with word-by-word highlight sweep |

## File Structure

```
├── Dockerfile
├── server.mjs              # Express server with /render-composition endpoint
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts             # Remotion entry point
    ├── Root.tsx              # Composition registration
    ├── FullComposition.tsx   # Main renderer — orchestrates all layers
    ├── schema.ts             # Zod schema for input props
    ├── presets/
    │   └── captionPresets.ts # Caption style definitions
    └── components/
        ├── VideoSegment.tsx  # Main video with trim/zoom/color grade
        ├── BrollInsert.tsx   # B-roll with Ken Burns zoom
        ├── TitleCard.tsx     # Animated title/subtitle cards
        ├── CaptionRenderer.tsx # Master caption router
        ├── Overlays.tsx      # Vignette, corner brackets, film grain, light leak
        ├── MusicTrack.tsx    # Background music
        └── captions/
            ├── HormoziCaption.tsx
            ├── CinematicCaption.tsx
            ├── TikTokCaption.tsx
            ├── MinimalCaption.tsx
            └── KaraokeCaption.tsx
```
