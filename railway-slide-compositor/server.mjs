/**
 * Slide Compositor Service
 *
 * Purpose: Take a D-ID talking-head MP4 + a slide image + position/size,
 * and return a composited MP4 where the talking head appears in a circular
 * frame on top of the slide.
 *
 * Endpoints:
 *   POST /composite-slide   — composite a single slide (Phase A.5 + B)
 *   GET  /health            — health check
 *
 * Auth: Bearer token (COMPOSITOR_AUTH_TOKEN env var). Same pattern as the
 * existing remotion-composition service so the edge function proxy can
 * reuse its auth helper.
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
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.COMPOSITOR_AUTH_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn("[startup] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — uploads will fail");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

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
  res.json({ status: "ok", service: "slide-compositor", version: "1.0.0" });
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
    storage_path,  // e.g. "presentations/agency/pres_id/slide_000_composited.mp4"
  } = req.body || {};

  if (!talking_head_url || !slide_image_url) {
    return res.status(400).json({ error: "talking_head_url and slide_image_url are required" });
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

    // 4) Upload to Supabase storage
    if (!supabase) {
      throw new Error("Supabase credentials not configured on this service");
    }
    const finalPath = storage_path || `presentations/composited/${Date.now()}_${jobId}.mp4`;
    const buf = fs.readFileSync(outPath);
    const { error: upErr } = await supabase.storage
      .from("generated-files")
      .upload(finalPath, buf, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: urlData } = supabase.storage
      .from("generated-files")
      .getPublicUrl(finalPath);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error("Failed to resolve public URL");

    console.log(`[${jobId}] Uploaded to ${publicUrl}`);

    res.json({
      success: true,
      composited_url: publicUrl,
      storage_path: finalPath,
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

app.listen(PORT, () => {
  console.log(`[startup] slide-compositor listening on :${PORT}`);
});
