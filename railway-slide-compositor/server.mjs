/**
 * Slide Compositor Service
 *
 * Purpose: Take a D-ID talking-head MP4 + a slide image + position/size,
 * and return a composited MP4 where the talking head appears in a circular
 * frame on top of the slide.
 *
 * Endpoints:
 *   POST /composite-slide   — composite a single slide (Phase A.5 + B)
 *   POST /stitch-webinar    — concat N composited clips into final MP4 (Phase B)
 *   GET  /health            — health check
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
app.use(express.json({ limit: "10mb" }));

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
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-2000)}`));
    });
  });
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
  } = req.body || {};

  if (!Array.isArray(clip_urls) || clip_urls.length === 0) {
    return res.status(400).json({ error: "clip_urls must be a non-empty array" });
  }
  if (!signed_upload_url) {
    return res.status(400).json({ error: "signed_upload_url is required" });
  }

  console.log(`[${jobId}] Stitching ${clip_urls.length} clips`);

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
    const fastArgs = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      outPath,
    ];

    let method = "stream-copy";
    try {
      await runFfmpeg(fastArgs);
    } catch (fastErr) {
      console.warn(`[${jobId}] Fast concat failed, falling back to filter_complex re-encode:`, fastErr.message?.slice(0, 200));
      method = "filter-reencode";

      // Build filter_complex inputs + concat filter
      const inputArgs = [];
      for (const p of localPaths) {
        inputArgs.push("-i", p);
      }
      // [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1
      const n = localPaths.length;
      const filterInputs = localPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
      const filter = `${filterInputs}concat=n=${n}:v=1:a=1[v][a]`;

      const reencodeArgs = [
        "-y",
        ...inputArgs,
        "-filter_complex", filter,
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outPath,
      ];
      await runFfmpeg(reencodeArgs);
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

app.listen(PORT, () => {
  console.log(`[startup] slide-compositor listening on :${PORT}`);
});
