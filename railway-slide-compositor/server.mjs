/**
 * Slide Compositor Service
 *
 * Purpose: Take a D-ID talking-head MP4 + a slide image + position/size,
 * and return a composited MP4 where the talking head appears in a circular
 * frame on top of the slide.
 *
 * Endpoints:
 *   POST /composite-slide           — composite a single slide with talking head
 *   POST /composite-waveform-slide  — composite a slide with an audio-reactive
 *                                      waveform circle instead of a face (no D-ID)
 *   POST /stitch-webinar            — concat N composited clips into final MP4
 *   POST /stitch-audio              — concat per-sentence ElevenLabs MP3 chunks
 *                                      with subtle breath spacers (lipsync fix)
 *   GET  /health                    — health check
 *
 * Upload pattern: Uses signed upload URLs (same pattern as the Remotion
 * service). The edge function generates a signed URL from Supabase Storage
 * and passes it here; we PUT the file to that URL. No Supabase credentials
 * ever live on Railway.
 *
 * Auth: Bearer token (COMPOSITOR_AUTH_TOKEN env var).
 *
 * The heavy lifting is a single ffmpeg command that:
 *   1. Loads the slide image (looped for the video duration)
 *   2. Crops the talking-head video to a square (center crop)
 *   3. Scales the square to target size (% of slide width)
 *   4. Masks it to a circle via geq alpha-channel manipulation
 *   5. Overlays the circle on the slide at the requested position
 *   6. Copies audio from the talking head
 *   7. Outputs H.264 MP4
 *
 * Typical render time: 3-10s for a 30-60s clip at 1920x1080.
 */

import express from "express";
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";

const app = express();
// 50mb: stitch-audio receives base64-encoded MP3 chunks for 8-12 sentences,
// plus overhead. A 60-second script at 128kbps MP3 is ~1MB; base64 +33%;
// with a few sentences that approaches a few MB. 50mb keeps plenty of headroom.
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.COMPOSITOR_AUTH_TOKEN || process.env.AUTH_TOKEN;

// ── Auth middleware ──
function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN) {
    console.warn("[auth] COMPOSITOR_AUTH_TOKEN not set — allowing unauthenticated request");
    return next();
  }
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Health ──
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "slide-compositor", version: "1.1.0" });
});

// ── Position → overlay coordinates ──
// Given slide dimensions (W x H), avatar size in % of width, and position preset,
// return { x, y, size } in pixels for the overlay filter.
function computeOverlay(slideW, slideH, position, sizePct) {
  const size = Math.round(slideW * (sizePct / 100));
  const margin = Math.round(slideW * 0.03); // 3% of width

  switch (position) {
    case "top-right":    return { x: slideW - size - margin, y: margin, size };
    case "top-left":     return { x: margin,                  y: margin, size };
    case "bottom-right": return { x: slideW - size - margin, y: slideH - size - margin, size };
    case "bottom-left":  return { x: margin,                  y: slideH - size - margin, size };
    case "centered-large": {
      const big = Math.round(slideW * 0.35);
      return {
        x: Math.round((slideW - big) / 2),
        y: Math.round((slideH - big) / 2),
        size: big,
      };
    }
    default: // top-right fallback
      return { x: slideW - size - margin, y: margin, size };
  }
}

// Size preset → percentage of slide width
function sizeToPct(size) {
  switch (size) {
    case "small":  return 12;
    case "large":  return 22;
    case "medium":
    default:       return 17;
  }
}

// ── Download a remote URL to a temp file ──
async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const fileStream = fs.createWriteStream(dest);
  await pipeline(res.body, fileStream);
  return dest;
}

// ── Run ffmpeg, collect stderr, return on exit ──
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stderr });
      else {
        // Grab a larger tail so the ACTUAL error surface bubbles up. The
        // last 2000 chars was often just ffmpeg's stream-routing summary
        // on big webinar concats, hiding the real failure line.
        const tail = stderr.slice(-8000);
        // Try to find the specific error keyword and prefer that region.
        const errIdx = Math.max(
          stderr.lastIndexOf("Error"),
          stderr.lastIndexOf("Invalid"),
          stderr.lastIndexOf("Could not"),
          stderr.lastIndexOf("failed"),
        );
        const focused = errIdx > 0
          ? stderr.slice(Math.max(0, errIdx - 200), Math.min(stderr.length, errIdx + 1200))
          : "";
        reject(new Error(`ffmpeg exit ${code}. Focused error: ${focused || "(none found)"}. Tail: ${tail}`));
      }
    });
  });
}

// ── Concat via filter_complex, optionally with pauses ──
//
// Each clip gets tpad (video freeze on FIRST frame) + adelay (silence at start)
// prepended so there's a natural breath BEFORE each slide starts talking. Eric
// verified the D-ID avatar's first-frame pose is more neutral than the caught-
// mid-word last-frame pose, so pausing at the start of the next slide looks
// better than pausing at the end of the previous one.
//
// The first clip skips the between-slides pause (nothing before it to breathe
// after) but can still receive an explicit introPause. The last clip works
// exactly like any middle clip — the pause fires before its content and there's
// no trailing pause after it.
//
// Filter graph shape (N=3 clips, intro=0, between=1.5s):
//
//   [0:v]copy[v0]; [0:a]anull[a0];                                          // first clip: no leading pause
//   [1:v]tpad=start_duration=1.5:start_mode=clone[v1]; [1:a]adelay=1500|1500[a1];
//   [2:v]tpad=start_duration=1.5:start_mode=clone[v2]; [2:a]adelay=1500|1500[a2];
//   [v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]
async function runFilterReencodeConcat(localPaths, outPath, {
  pauseBetweenSlides = 0,
  introPause = 0,
  isHoldFlags = [],
} = {}) {
  const n = localPaths.length;
  const inputArgs = [];
  for (const p of localPaths) inputArgs.push("-i", p);

  const between = Math.max(0, Number(pauseBetweenSlides) || 0);
  const intro = Math.max(0, Number(introPause) || 0);
  const holds = Array.isArray(isHoldFlags) ? isHoldFlags : [];

  const filterParts = [];
  const concatInputs = [];

  // Force uniform frame size + rate + pixel format + sample rate on every
  // input BEFORE the concat filter. Without this, slight mismatches between
  // D-ID clips (e.g. 25.001 fps quirks, 29.97 vs 30, 44.1 vs 48kHz audio,
  // yuv420p vs yuv420p10le) can make ffmpeg's concat filter fail with
  // "Invalid argument" or a cryptic exit 1. The normalization is cheap
  // compared to the re-encode we're already doing.
  const TARGET_W = 1920;
  const TARGET_H = 1080;
  const TARGET_FPS = 30;
  const TARGET_AR = 44100;

  for (let i = 0; i < n; i++) {
    const isFirst = i === 0;
    const thisIsHold = !!holds[i];
    const prevIsHold = i > 0 && !!holds[i - 1];

    // Leading pause on this clip:
    //   - Clip 0: introPause (unless clip 0 itself is a hold slide).
    //   - Any subsequent clip: pauseBetweenSlides, UNLESS this clip is a
    //     hold slide (its own dwell IS the beat) OR the previous clip was
    //     a hold slide (the opener already provided the beat before this
    //     first-real-slide starts).
    let leadPause = isFirst ? intro : between;
    if (thisIsHold || prevIsHold) leadPause = 0;

    // Video chain: scale → fps → pixel format → optional tpad
    const vChain = [
      `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease`,
      `pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=black`,
      `setsar=1`,
      `fps=${TARGET_FPS}`,
      `format=yuv420p`,
    ];
    if (leadPause > 0) {
      vChain.push(`tpad=start_duration=${leadPause}:start_mode=clone`);
    }
    filterParts.push(`[${i}:v]${vChain.join(",")}[v${i}]`);

    // Audio chain: resample → stereo → optional adelay
    const aChain = [
      `aresample=${TARGET_AR}`,
      `aformat=sample_fmts=fltp:channel_layouts=stereo`,
    ];
    if (leadPause > 0) {
      const ms = Math.round(leadPause * 1000);
      aChain.push(`adelay=${ms}|${ms}`);
    }
    filterParts.push(`[${i}:a]${aChain.join(",")}[a${i}]`);

    concatInputs.push(`[v${i}][a${i}]`);
  }

  filterParts.push(`${concatInputs.join("")}concat=n=${n}:v=1:a=1[v][a]`);
  const filter = filterParts.join(";\n");

  // Use -filter_complex_script instead of -filter_complex so a huge filter
  // graph (hundreds of clips × multiple filter chains) doesn't blow past
  // the OS command-line length limit. ffmpeg reads the graph from a file.
  const filterScriptPath = path.join(path.dirname(outPath), "filter_graph.txt");
  fs.writeFileSync(filterScriptPath, filter, "utf8");
  console.log(`[stitch] Filter graph: ${filterParts.length} nodes, ${filter.length} chars → ${filterScriptPath}`);

  const args = [
    "-y",
    ...inputArgs,
    "-filter_complex_script", filterScriptPath,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-r", String(TARGET_FPS),
    "-c:a", "aac",
    "-ar", String(TARGET_AR),
    "-ac", "2",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outPath,
  ];

  await runFfmpeg(args);
}

// ── POST /composite-slide ──
app.post("/composite-slide", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const jobId = crypto.randomUUID().slice(0, 8);

  const {
    talking_head_url,
    slide_image_url,
    position = "top-right",
    size = "medium",
    slide_width = 1920,
    slide_height = 1080,
    // Signed upload URL (from Supabase storage.createSignedUploadUrl).
    // Railway PUTs the composited file to this URL — no Supabase creds needed here.
    signed_upload_url,
  } = req.body || {};

  if (!talking_head_url || !slide_image_url) {
    return res.status(400).json({ error: "talking_head_url and slide_image_url are required" });
  }
  if (!signed_upload_url) {
    return res.status(400).json({ error: "signed_upload_url is required — edge function must generate one from Supabase storage" });
  }

  console.log(`[${jobId}] Compositing: pos=${position} size=${size} slide=${slide_width}x${slide_height}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "composite-"));
  const headPath = path.join(tmpDir, "head.mp4");
  const slidePath = path.join(tmpDir, "slide.png");
  const outPath = path.join(tmpDir, "out.mp4");

  try {
    // 1) Download both inputs
    await Promise.all([
      downloadTo(talking_head_url, headPath),
      downloadTo(slide_image_url, slidePath),
    ]);
    console.log(`[${jobId}] Inputs downloaded`);

    // 2) Compute overlay geometry
    const { x, y, size: avatarPx } = computeOverlay(
      slide_width,
      slide_height,
      position,
      sizeToPct(size),
    );
    const halfSize = Math.round(avatarPx / 2);

    // 3) Build filter graph
    //
    //   [1:v] — talking head video
    //     crop to square (center crop)
    //     scale to avatarPx × avatarPx
    //     format=yuva420p (add alpha channel)
    //     geq filter: set alpha=0 for pixels outside the inscribed circle
    //
    //   [0:v] — slide image (looped)
    //     scale to slide dimensions
    //
    //   overlay the masked head on the scaled slide at (x, y)
    //
    // The `-loop 1 -framerate 30` on the slide input gives us a video stream
    // we can overlay onto, and `-shortest` stops when the head audio ends.
    const filterComplex = [
      `[1:v]crop='min(iw\\,ih)':'min(iw\\,ih)',scale=${avatarPx}:${avatarPx},format=yuva420p,geq='r=r(X,Y):g=g(X,Y):b=b(X,Y):a=if(gt(pow(X-${halfSize},2)+pow(Y-${halfSize},2),pow(${halfSize},2)),0,255)'[circle]`,
      `[0:v]scale=${slide_width}:${slide_height}:force_original_aspect_ratio=decrease,pad=${slide_width}:${slide_height}:(ow-iw)/2:(oh-ih)/2:color=black[bg]`,
      `[bg][circle]overlay=${x}:${y}:shortest=1[v]`,
    ].join(";");

    const args = [
      "-y",
      "-loop", "1", "-framerate", "30", "-i", slidePath,
      "-i", headPath,
      "-filter_complex", filterComplex,
      "-map", "[v]",
      "-map", "1:a?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ];

    console.log(`[${jobId}] Running ffmpeg (overlay at ${x},${y} size ${avatarPx}px)`);
    await runFfmpeg(args);

    const stat = fs.statSync(outPath);
    console.log(`[${jobId}] ffmpeg done in ${Date.now() - startTime}ms — ${(stat.size / 1024).toFixed(0)}KB`);

    // 4) Upload via signed URL (PUT). Same pattern as the Remotion service —
    //    the edge function already generated this URL from Supabase storage,
    //    so Railway never needs service_role credentials.
    const fileBuffer = fs.readFileSync(outPath);
    const uploadResp = await fetch(signed_upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: fileBuffer,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => "");
      throw new Error(`Signed-URL upload failed ${uploadResp.status}: ${errText.slice(0, 300)}`);
    }
    console.log(`[${jobId}] Uploaded via signed URL (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);

    res.json({
      success: true,
      duration_ms: Date.now() - startTime,
      size_bytes: stat.size,
    });
  } catch (err) {
    console.error(`[${jobId}] Error:`, err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    // Cleanup temp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

// ── POST /render-hold-slide ──
//
// Turn a single slide image + a duration into a silent-audio MP4 clip that
// stitch-webinar can concatenate alongside the D-ID clips. Used for the
// "Webinar Will Be Starting Soon" opener and the "Thank you for joining"
// closer — no avatar, no script, just a still frame that holds for N
// seconds. The MP4's codec params are chosen to match D-ID's output so the
// stream-copy fast-path in stitch-webinar still works when possible.
app.post("/render-hold-slide", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const jobId = crypto.randomUUID().slice(0, 8);

  const {
    slide_image_url,
    duration_sec,
    signed_upload_url,
    // Match D-ID/composite-slide output so stitch-webinar's -c copy path
    // works cross-clip. Override if a project uses different dims.
    width = 1920,
    height = 1080,
    fps = 25,
  } = req.body || {};

  const durationSec = Number(duration_sec);
  if (!slide_image_url) return res.status(400).json({ error: "slide_image_url is required" });
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 120) {
    return res.status(400).json({ error: "duration_sec must be 0 < d <= 120" });
  }
  if (!signed_upload_url) return res.status(400).json({ error: "signed_upload_url is required" });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hold-"));
  const imgPath = path.join(tmpDir, "slide.png");
  const outPath = path.join(tmpDir, "hold.mp4");

  try {
    // 1) Download slide image
    await downloadTo(slide_image_url, imgPath);

    // 2) Render silent MP4:
    //   - Video: loop the still image for durationSec at fps
    //   - Audio: anullsrc (silent stereo 44.1kHz)
    //   - Force pixel format + AAC to match D-ID clips → -c copy in the
    //     stitch step doesn't have to re-encode
    const args = [
      "-y",
      "-loop", "1",
      "-i", imgPath,
      "-f", "lavfi",
      "-i", "anullsrc=r=44100:cl=stereo",
      "-t", String(durationSec),
      "-r", String(fps),
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-tune", "stillimage",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-ar", "44100",
      "-ac", "2",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ];

    console.log(`[${jobId}] Rendering hold slide (${durationSec}s @ ${width}x${height} ${fps}fps)`);
    await runFfmpeg(args);
    const stat = fs.statSync(outPath);
    console.log(`[${jobId}] Hold slide rendered in ${Date.now() - startTime}ms — ${(stat.size / 1024).toFixed(0)}KB`);

    // 3) Upload via signed URL
    const fileBuffer = fs.readFileSync(outPath);
    const uploadResp = await fetch(signed_upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: fileBuffer,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => "");
      throw new Error(`Signed-URL upload failed ${uploadResp.status}: ${errText.slice(0, 300)}`);
    }

    res.json({
      success: true,
      duration_ms: Date.now() - startTime,
      size_bytes: stat.size,
      duration_sec: durationSec,
    });
  } catch (err) {
    console.error(`[${jobId}] Hold slide render failed:`, err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ── POST /stitch-webinar ──
//
// Concatenates N composited slide clips into one final webinar MP4.
//
// Strategy: First attempt the concat demuxer with `-c copy` (no re-encode,
// fastest). If that fails (slides have mismatched codec params), fall back
// to the filter_complex concat which re-encodes — slower but always works.
//
// Typical times:
//   38 × 60s clips via -c copy: 5-10 seconds
//   Same with filter re-encode: 1-3 minutes
app.post("/stitch-webinar", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const jobId = crypto.randomUUID().slice(0, 8);

  const {
    clip_urls,
    signed_upload_url,
    // Optional pause knobs. Default 1.5s between slides + 1.5s before the
    // first slide. Values in seconds; 0 disables. Callers can override.
    pause_between_slides_sec: pauseBetweenRaw,
    intro_pause_sec: introPauseRaw,
    // Optional per-clip flag: `true` = this clip is a "hold" slide (silent
    // opener/closer with no avatar). Suppresses the leading between-slides
    // pause on any clip whose predecessor is a hold — the hold slide's own
    // dwell already provides the beat, so tacking on another 1.5s would
    // stall the pacing. Also suppresses the leading pause on hold slides
    // themselves (their whole point is to hold their own duration).
    is_hold_flags: isHoldFlagsRaw,
  } = req.body || {};

  const pauseBetweenSlides = Math.max(0, Math.min(10, Number(pauseBetweenRaw ?? 1.5)));
  const introPause = Math.max(0, Math.min(10, Number(introPauseRaw ?? 1.5)));
  const anyPause = pauseBetweenSlides > 0 || introPause > 0;
  const isHoldFlags = Array.isArray(isHoldFlagsRaw) ? isHoldFlagsRaw.map((v) => !!v) : [];

  if (!Array.isArray(clip_urls) || clip_urls.length === 0) {
    return res.status(400).json({ error: "clip_urls must be a non-empty array" });
  }
  if (!signed_upload_url) {
    return res.status(400).json({ error: "signed_upload_url is required" });
  }

  console.log(`[${jobId}] Stitching ${clip_urls.length} clips (intro pause=${introPause}s, between=${pauseBetweenSlides}s)`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stitch-"));
  const listPath = path.join(tmpDir, "concat.txt");
  const outPath = path.join(tmpDir, "final.mp4");

  try {
    // 1) Download all clips in parallel
    const localPaths = [];
    await Promise.all(clip_urls.map(async (url, i) => {
      const localPath = path.join(tmpDir, `clip_${String(i).padStart(3, "0")}.mp4`);
      await downloadTo(url, localPath);
      localPaths[i] = localPath;
    }));
    console.log(`[${jobId}] Downloaded ${clip_urls.length} clips in ${Date.now() - startTime}ms`);

    // 2) Build concat list file
    // Format: one line per file, path must be quoted, single-quote escaping is \\'
    const listContents = localPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listPath, listContents, "utf8");

    // 3) Attempt fast path: concat demuxer + stream copy
    // Skip the fast path entirely when pauses are requested — stream copy
    // can't insert gaps or freeze frames. Re-encode is the only way.
    let method = anyPause ? "filter-reencode-pauses" : "stream-copy";

    if (!anyPause) {
      const fastArgs = [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        "-movflags", "+faststart",
        outPath,
      ];

      try {
        await runFfmpeg(fastArgs);
      } catch (fastErr) {
        console.warn(`[${jobId}] Fast concat failed, falling back to filter_complex re-encode:`, fastErr.message?.slice(0, 200));
        method = "filter-reencode";
        await runFilterReencodeConcat(localPaths, outPath, {
          pauseBetweenSlides: 0,
          introPause: 0,
          isHoldFlags,
        });
      }
    } else {
      // Pauses requested → go straight to filter_complex with tpad/apad
      await runFilterReencodeConcat(localPaths, outPath, {
        pauseBetweenSlides,
        introPause,
        isHoldFlags,
      });
    }

    const stat = fs.statSync(outPath);
    console.log(`[${jobId}] Stitched (${method}) in ${Date.now() - startTime}ms — ${(stat.size / 1024 / 1024).toFixed(1)}MB`);

    // 4) Upload via signed URL
    const fileBuffer = fs.readFileSync(outPath);
    const uploadResp = await fetch(signed_upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: fileBuffer,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => "");
      throw new Error(`Signed-URL upload failed ${uploadResp.status}: ${errText.slice(0, 300)}`);
    }
    console.log(`[${jobId}] Uploaded final webinar MP4`);

    res.json({
      success: true,
      duration_ms: Date.now() - startTime,
      size_bytes: stat.size,
      method,
      clip_count: clip_urls.length,
    });
  } catch (err) {
    console.error(`[${jobId}] Stitch error:`, err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

/**
 * POST /composite-waveform-slide
 *
 * Like /composite-slide but renders an audio-reactive waveform animation
 * in the overlay circle instead of a talking-head video. Used when a slide
 * is set to "Voice Waveform" mode — no D-ID call required on the way in.
 *
 * Input:
 *   {
 *     audio_url:         string   // required — MP3 of the narration
 *     slide_image_url:   string   // required — slide background PNG
 *     position:          string   // top-right / top-left / bottom-right /
 *                                    bottom-left / centered-large / waveform
 *     size:              string   // small / medium / large
 *     waveform_style:    string   // "line" (Jarvis-style) or "bars" (Siri-style)
 *     slide_width:       number
 *     slide_height:      number
 *     signed_upload_url: string
 *   }
 *
 * Output: { success, duration_ms, size_bytes, method }
 */
app.post("/composite-waveform-slide", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const jobId = crypto.randomUUID().slice(0, 8);

  const {
    audio_url,
    slide_image_url,
    position = "top-right",
    size = "medium",
    waveform_style = "line",
    slide_width = 1920,
    slide_height = 1080,
    signed_upload_url,
  } = req.body || {};

  if (!audio_url || !slide_image_url) {
    return res.status(400).json({ error: "audio_url and slide_image_url are required" });
  }
  if (!signed_upload_url) {
    return res.status(400).json({ error: "signed_upload_url is required" });
  }

  // "waveform" position just means "put the circle in the default top-right
  // spot with the chosen size". Translate so computeOverlay() gets a real
  // placement. "hidden" position skips placement entirely (handled below).
  const visualPos = position === "waveform" ? "top-right" : position;
  const isHidden = waveform_style === "none" || position === "hidden";

  console.log(`[${jobId}] Audio-only composite: style=${waveform_style} pos=${visualPos} size=${size} slide=${slide_width}x${slide_height}${isHidden ? " (no visualizer)" : ""}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wave-composite-"));
  const audioPath = path.join(tmpDir, "audio.mp3");
  const slidePath = path.join(tmpDir, "slide.png");
  const outPath = path.join(tmpDir, "out.mp4");

  try {
    // 1) Download audio + slide
    await Promise.all([
      downloadTo(audio_url, audioPath),
      downloadTo(slide_image_url, slidePath),
    ]);

    // 2) Compute overlay geometry (reuse the talking-head logic).
    // Hidden mode has no overlay, so skip geometry.
    let x = 0, y = 0, circlePx = 0, halfSize = 0;
    if (!isHidden) {
      const geo = computeOverlay(
        slide_width,
        slide_height,
        visualPos,
        sizeToPct(size),
      );
      x = geo.x; y = geo.y; circlePx = geo.size;
      halfSize = Math.round(circlePx / 2);
    }

    // 3) Build the filter graph.
    //
    // Hidden mode → no overlay, just slide as looped video + audio.
    // Waveform modes → generate visualizer, circle-mask, overlay on slide.
    //
    // Color for waveform: cyan-blue (0x00AAFF) glow on black. Reads as
    // "AI assistant", contrasts well on most slide designs.
    let filterComplex;
    if (isHidden) {
      filterComplex = `[1:v]scale=${slide_width}:${slide_height}:force_original_aspect_ratio=decrease,pad=${slide_width}:${slide_height}:(ow-iw)/2:(oh-ih)/2:color=black[v]`;
    } else {
      let vizFilter;
      switch (waveform_style) {
        case "bars":
          // showfreqs: frequency-domain bars, log scale so voice mid-range
          // (200-4000Hz) dominates the visual.
          vizFilter = `[0:a]showfreqs=s=${circlePx}x${circlePx}:mode=bar:ascale=log:fscale=log:win_size=2048:colors=0x00AAFF|0x0077CC,format=yuva420p[viz]`;
          break;
        case "line":
        default:
          // showwaves: time-domain waveform line, Jarvis-style.
          vizFilter = `[0:a]showwaves=s=${circlePx}x${circlePx}:mode=line:colors=0x00AAFF:rate=30:draw=full,format=yuva420p[viz]`;
          break;
      }
      filterComplex = [
        vizFilter,
        `[viz]geq='r=r(X,Y):g=g(X,Y):b=b(X,Y):a=if(gt(pow(X-${halfSize},2)+pow(Y-${halfSize},2),pow(${halfSize},2)),0,255)'[circle]`,
        `[1:v]scale=${slide_width}:${slide_height}:force_original_aspect_ratio=decrease,pad=${slide_width}:${slide_height}:(ow-iw)/2:(oh-ih)/2:color=black[bg]`,
        `[bg][circle]overlay=${x}:${y}:shortest=1[v]`,
      ].join(";");
    }

    const args = [
      "-y",
      "-i", audioPath,                        // [0] audio (drives viz)
      "-loop", "1", "-framerate", "30",
      "-i", slidePath,                        // [1] slide image
      "-filter_complex", filterComplex,
      "-map", "[v]",
      "-map", "0:a",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ];

    console.log(`[${jobId}] Running ffmpeg (viz=${waveform_style} at ${x},${y} size ${circlePx}px)`);
    await runFfmpeg(args);

    const stat = fs.statSync(outPath);
    console.log(`[${jobId}] Done in ${Date.now() - startTime}ms — ${(stat.size / 1024).toFixed(0)}KB`);

    // 4) Upload via signed URL
    const fileBuffer = fs.readFileSync(outPath);
    const uploadResp = await fetch(signed_upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: fileBuffer,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => "");
      throw new Error(`Signed-URL upload failed ${uploadResp.status}: ${errText.slice(0, 300)}`);
    }

    res.json({
      success: true,
      method: `waveform-${waveform_style}`,
      duration_ms: Date.now() - startTime,
      size_bytes: stat.size,
    });
  } catch (err) {
    console.error(`[${jobId}] Error:`, err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

/**
 * POST /stitch-audio
 *
 * Takes N base64-encoded audio chunks (one per sentence from ElevenLabs),
 * inserts a short subtle breath-like spacer between each, concatenates them
 * into one MP3, and PUTs it to the signed upload URL.
 *
 * Why: D-ID's audio-mode lip sync drifts on long clips with hard silences.
 * By rendering each sentence as its own clean TTS call and splicing them
 * with a non-silent (pink-noise breath-like) spacer, we give D-ID a
 * continuous audio signal to sync against — much better fidelity AND more
 * natural pacing than injecting <break> tags inline.
 *
 * Input:
 *   {
 *     sentence_audios: string[]     // base64 MP3 bytes, one per sentence
 *     breath_ms: number             // duration of inter-sentence breath in ms (default 450)
 *     signed_upload_url: string     // Supabase Storage signed upload URL
 *   }
 *
 * Output: { success, audio_url?, duration_ms, sentence_count, method }
 */
app.post("/stitch-audio", authMiddleware, async (req, res) => {
  const startedAt = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stitch-audio-"));

  try {
    const { sentence_audios, breath_ms, signed_upload_url } = req.body || {};

    if (!Array.isArray(sentence_audios) || sentence_audios.length === 0) {
      return res.status(400).json({ success: false, error: "sentence_audios (array) required" });
    }
    if (!signed_upload_url) {
      return res.status(400).json({ success: false, error: "signed_upload_url required" });
    }

    const breathDurSec = Math.max(0.15, Math.min(1.2, (breath_ms ?? 450) / 1000));

    // 1. Decode each chunk to a temp file
    const chunkPaths = [];
    for (let i = 0; i < sentence_audios.length; i++) {
      const b64 = sentence_audios[i];
      if (typeof b64 !== "string" || b64.length === 0) {
        return res.status(400).json({ success: false, error: `sentence_audios[${i}] empty` });
      }
      const buf = Buffer.from(b64, "base64");
      const p = path.join(tmpDir, `chunk_${i}.mp3`);
      fs.writeFileSync(p, buf);
      chunkPaths.push(p);
    }

    // 2. Generate a subtle breath spacer with ffmpeg.
    //
    // We use very low-amplitude pink noise (~-40dB) with a 60ms fade in/out
    // to simulate a soft breath sound. D-ID's sync model sees this as a
    // continuous (non-silent) audio signal and keeps the mouth closed/resting
    // instead of ghost-chewing through dead silence.
    //
    // Output format matches ElevenLabs MP3 output so we can concat cleanly.
    const breathPath = path.join(tmpDir, "breath.mp3");
    await runFfmpeg([
      "-f", "lavfi",
      "-i", `anoisesrc=d=${breathDurSec.toFixed(2)}:c=pink:r=44100:a=0.008`,
      "-af", `afade=t=in:ss=0:d=0.08,afade=t=out:st=${(breathDurSec - 0.08).toFixed(2)}:d=0.08`,
      "-ac", "1",
      "-ar", "44100",
      "-b:a", "128k",
      "-y",
      breathPath,
    ]);

    // 3. Short-circuit: if there's only one sentence, no stitching needed —
    //    just upload the single chunk as-is. (We still re-encode below for
    //    consistent format, but we could skip that.)
    const isSingle = chunkPaths.length === 1;

    // 4. Build an interleaved sequence: [chunk0, breath, chunk1, breath, ..., chunkN]
    //    and concat with filter_complex so the mixer handles any format drift.
    const inputs = [];
    if (isSingle) {
      inputs.push(chunkPaths[0]);
    } else {
      for (let i = 0; i < chunkPaths.length; i++) {
        inputs.push(chunkPaths[i]);
        if (i < chunkPaths.length - 1) inputs.push(breathPath);
      }
    }

    const finalPath = path.join(tmpDir, "final.mp3");
    const ffargs = [];
    for (const f of inputs) ffargs.push("-i", f);
    // Build filter: [0:a][1:a]...[N-1:a]concat=n=N:v=0:a=1[out]
    const filter = inputs
      .map((_, i) => `[${i}:a]`)
      .join("") + `concat=n=${inputs.length}:v=0:a=1[out]`;
    ffargs.push(
      "-filter_complex", filter,
      "-map", "[out]",
      "-ac", "1",
      "-ar", "44100",
      "-b:a", "128k",
      "-y",
      finalPath,
    );
    await runFfmpeg(ffargs);

    // 5. Upload via signed URL
    const body = fs.readFileSync(finalPath);
    const uploadRes = await fetch(signed_upload_url, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg", "x-upsert": "true" },
      body,
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      throw new Error(`Upload failed ${uploadRes.status}: ${errText.slice(0, 500)}`);
    }

    return res.json({
      success: true,
      sentence_count: sentence_audios.length,
      breath_ms: Math.round(breathDurSec * 1000),
      duration_ms: Date.now() - startedAt,
      method: isSingle ? "passthrough" : "concat",
      bytes: body.length,
    });
  } catch (err) {
    console.error("[stitch-audio] error:", err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`[startup] slide-compositor listening on :${PORT}`);
});
