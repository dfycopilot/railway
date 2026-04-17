# Slide Compositor Service

Composites a D-ID talking-head MP4 into a circular frame on top of a slide
image. Used by DFY Copilot's Webinar Builder.

## Deploy

1. In Railway, create a new service from this repo subfolder:
   `railway-slide-compositor`
2. Set environment variables:
   - `COMPOSITOR_AUTH_TOKEN` — shared secret (also set on the Supabase edge
     function as `SLIDE_COMPOSITOR_AUTH_TOKEN`)
   - `SUPABASE_URL` — `https://witnyrlzvjyziahpyzpx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard
   - `PORT` — Railway sets this automatically
3. Deploy. Railway will build the Dockerfile (installs ffmpeg).
4. Copy the deployed URL (e.g. `https://slide-compositor-production.up.railway.app`)
   and set it as `SLIDE_COMPOSITOR_URL` in Supabase edge function secrets.

## Endpoints

### `GET /health`
Returns `{ status: "ok" }`.

### `POST /composite-slide`
**Auth:** `Authorization: Bearer <COMPOSITOR_AUTH_TOKEN>`

**Body:**
```json
{
  "talking_head_url": "https://.../head.mp4",
  "slide_image_url":  "https://.../slide.png",
  "position": "top-right",        // top-right|top-left|bottom-right|bottom-left|centered-large
  "size":     "medium",           // small|medium|large
  "slide_width":  1920,
  "slide_height": 1080,
  "storage_path": "presentations/agency/pres_id/slide_000_composited.mp4"
}
```

**Response:**
```json
{
  "success": true,
  "composited_url": "https://...supabase.co/.../slide_000_composited.mp4",
  "storage_path":   "presentations/...",
  "duration_ms":    4230,
  "size_bytes":     1842133
}
```

## How it works

Single ffmpeg invocation:
1. Loops the slide image as a video stream at 30fps
2. Center-crops the talking-head MP4 to a square
3. Scales to target size (% of slide width based on preset)
4. Uses `geq` filter to mask everything outside a circle (alpha=0)
5. Overlays the masked circle onto the scaled slide at the target position
6. Copies audio from the talking head
7. Encodes H.264 MP4 with `-preset veryfast -crf 23`

Typical render time: 3-10s for a 30-60s clip at 1920x1080.

## Local testing

```bash
cd railway-slide-compositor
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
# In another terminal:
curl -X POST http://localhost:3000/composite-slide \
  -H "Content-Type: application/json" \
  -d '{"talking_head_url":"...","slide_image_url":"...","position":"top-right","size":"medium"}'
```
