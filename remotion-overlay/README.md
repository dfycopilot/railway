# Remotion Overlay Renderer

A Railway-deployable service that renders transparent motion graphics overlays using Remotion, designed to be composited onto videos via FFmpeg.

## Architecture

```
Your App → Edge Function (remotion-render) → This Service → Transparent .webm overlay
                                                              ↓
                                          FFmpeg Worker composites overlay onto video
```

## Deployment (Railway)

1. Add this as a new service in your Railway project
2. Set environment variables:
   - `AUTH_TOKEN` — same as your FFMPEG_AUTH_TOKEN
   - `PORT` — Railway sets this automatically
3. Deploy

## API

### `POST /render-overlay`

```json
{
  "job_id": "uuid",
  "graphics_spec": {
    "duration_seconds": 30,
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "scenes": [
      {
        "start": 0, "end": 3,
        "elements": [
          { "type": "kinetic_text", "text": "STOP HUSTLING.", "style": "hero_bold", "color": "#FFFFFF", "animation": "slam_in" }
        ]
      }
    ],
    "persistent": [
      { "type": "corner_brackets", "color": "#D4A843" },
      { "type": "vignette", "intensity": 0.5 },
      { "type": "film_grain", "intensity": 0.1 }
    ]
  },
  "storage_upload": {
    "signed_url": "https://...",
    "path": "user_id/overlay_xxx.webm"
  },
  "callback_url": "https://your-supabase/functions/v1/ffmpeg-render-callback",
  "callback_headers": { "Authorization": "Bearer ..." }
}
```

### Element Types

| Type | Description | Props |
|------|-------------|-------|
| `kinetic_text` | Bold animated text | text, style, color, animation |
| `numbered_section` | "01 / TITLE / subtitle" | number, title, subtitle, position |
| `title_card` | Full-screen centered text | lines[], animation |
| `countdown_number` | Big animated number | number, label, subtitle, color |
| `corner_brackets` | Decorative corner frame | color, thickness, size |
| `light_leak` | Animated lens flare | color (warm/cool/purple), opacity |
| `film_grain` | Noise texture overlay | intensity |
| `vignette` | Edge darkening | intensity |

### Animation Types

| Animation | Effect |
|-----------|--------|
| `slam_in` | Scale from 250% with bounce |
| `slide_up` | Slide up with spring |
| `typewriter` | Character-by-character |
| `glitch_reveal` | RGB split + shake |
| `fade_reveal` | Blur-to-sharp fade |

### Text Styles

| Style | Font | Size |
|-------|------|------|
| `hero_bold` | Oswald 700 | 96px |
| `section_title` | Oswald 700 | 72px |
| `body` | Oswald 700 | 56px |
