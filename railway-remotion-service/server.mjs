/**
 * Railway Remotion Full Composition Service
 *
 * POST /render-composition  — accepts a full composition spec, renders via Remotion, uploads MP4
 * POST /extract-frames      — extracts N evenly-spaced frames for AI vision (Viral Clips Mode)
 * POST /render-overlay      — legacy overlay-only endpoint (backwards compat)
 * GET  /health              — health check
 */

import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.FFMPEG_AUTH_TOKEN;

// ---------- Auth middleware ----------
function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN) return next();
  const header = req.headers.authorization;
  if (!header || header !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ---------- Health ----------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "remotion-composition", version: "2.0.0" });
});

// ---------- Bundle cache ----------
let cachedBundleUrl = null;

async function getBundleUrl() {
  if (cachedBundleUrl) return cachedBundleUrl;
  console.log("[bundle] Creating Remotion bundle...");
  cachedBundleUrl = await bundle({
    entryPoint: path.resolve(__dirname, "src/index.ts"),
    webpackOverride: (config) => config,
  });
  console.log("[bundle] Bundle ready:", cachedBundleUrl);
  return cachedBundleUrl;
}

// Pre-bundle on startup
getBundleUrl().catch((e) => console.error("[bundle] Pre-bundle failed:", e));

// ---------- POST /render-composition ----------
app.post("/render-composition", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const renderId = crypto.randomUUID();
  const body = req.body;

  const job_id = body.job_id || body.jobId;
  const storage_upload = body.storage_upload || body.storageUpload;
  const output_path = body.output_path || body.outputPath;
  const callback_url = body.callback_url || body.callbackUrl;
  const callback_headers = body.callback_headers || body.callbackHeaders;

  // ─── CRITICAL FIX ───
  // The edge function sends:
  //   composition: "FullComposition"          (Remotion composition ID — a string)
  //   input_props: { specData: { ... } }      (the actual composition spec data)
  //
  // Previously this code read `composition` as the spec data, which passed
  // the string "FullComposition" instead of the real spec — causing black
  // renders with no scenes, captions, or overlays.
  //
  // Now we correctly read specData from input_props/inputProps/props.
  const inputProps = body.input_props || body.inputProps || body.props || {};
  const specData = inputProps.specData || inputProps.spec_data || inputProps;
  const compositionId = (typeof body.composition === "string" && body.composition) || "FullComposition";

  if (!job_id) {
    return res.status(400).json({ error: "job_id is required" });
  }

  if (!specData || typeof specData !== "object" || !specData.scenes) {
    console.error(`[render] Job ${job_id}: specData is missing or invalid. Keys received:`, Object.keys(specData || {}));
    return res.status(400).json({
      error: "specData is missing or has no scenes. Check input_props.specData in the payload.",
      received_keys: Object.keys(specData || {}),
    });
  }

  console.log(`[render] Job ${job_id}: received specData with ${specData.scenes?.length || 0} scenes, ${specData.captions?.length || 0} captions, overlays: ${Object.keys(specData.overlays || {}).join(",") || "none"}, css_effects: ${Object.keys(specData.css_effects || specData.cssEffects || {}).join(",") || "none"}`);

  // Respond immediately — rendering happens async
  res.json({ render_id: renderId, status: "rendering" });

  // Async render
  (async () => {
    const tmpOutput = `/tmp/render_${renderId}.mp4`;
    let browser;
    try {
      // Report progress
      await reportProgress(callback_url, callback_headers, job_id, 0);

      const bundleUrl = await getBundleUrl();

      browser = await openBrowser("chrome", {
        browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        chromiumOptions: {
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        },
        chromeMode: "chrome-for-testing",
      });

      // The actual input props for the Remotion component
      const remotionInputProps = { specData };

      // Select the composition with input props
      const comp = await selectComposition({
        serveUrl: bundleUrl,
        id: compositionId,
        puppeteerInstance: browser,
        inputProps: remotionInputProps,
      });

      await reportProgress(callback_url, callback_headers, job_id, 10);

      // Render
      await renderMedia({
        composition: comp,
        serveUrl: bundleUrl,
        codec: "h264",
        outputLocation: tmpOutput,
        puppeteerInstance: browser,
        concurrency: 1,
        muted: false,
        audioCodec: "aac",
        inputProps: remotionInputProps,
        onProgress: async ({ progress }) => {
          const pct = Math.round(10 + progress * 80); // 10-90%
          await reportProgress(callback_url, callback_headers, job_id, pct);
        },
      });

      await browser.close({ silent: false });
      browser = null;

      await reportProgress(callback_url, callback_headers, job_id, 90);

      // Upload to storage via signed URL
      if (storage_upload?.signed_url || storage_upload?.signedUrl) {
        const signedUrl = storage_upload.signed_url || storage_upload.signedUrl;
        const fileBuffer = fs.readFileSync(tmpOutput);
        const uploadResp = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: fileBuffer,
        });
        if (!uploadResp.ok) {
          throw new Error(`Upload failed: ${uploadResp.status} ${await uploadResp.text()}`);
        }
        console.log(`[render] Uploaded ${output_path} (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      }

      // Clean up temp file
      if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);

      // Callback: complete
      if (callback_url) {
        await fetch(callback_url, {
          method: "POST",
          headers: callback_headers || { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id,
            status: "complete",
            render_id: renderId,
            output_path,
            duration_ms: Date.now() - startTime,
          }),
        });
      }

      console.log(`[render] Job ${job_id} complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`[render] Job ${job_id} failed:`, err);
      if (browser) await browser.close({ silent: false }).catch(() => {});
      if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);

      // Callback: error
      if (callback_url) {
        await fetch(callback_url, {
          method: "POST",
          headers: callback_headers || { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id,
            status: "error",
            error: err.message || "Unknown render error",
          }),
        });
      }
    }
  })();
});

// ---------- POST /extract-frames ----------
//
// Extracts N evenly-spaced sample frames from a source video. Used by the
// AI Video Editor's Viral Clips Mode so Sonnet can SEE the video — energy,
// gestures, slides, on-screen text — when picking which segments are worth
// turning into shareable clips. Transcript-only selection misses ~30% of
// what makes a clip pop visually.
//
// Request body:
//   {
//     source_video_url: string,             // public URL of source mp4
//     num_frames?: number,                  // default 30, capped at 60
//     uploads: Array<{                      // pre-signed upload targets,
//       signed_url: string,                 //   one per frame, in order
//       public_url: string,                 //   what the AI will fetch
//     }>,
//   }
//
// Response (synchronous): { frame_urls: string[], duration_ms: number }
//
// Implementation: ffmpeg `select` filter at evenly-spaced timestamps,
// scaled to 512px wide (low-res keeps vision token cost down without
// hurting selection quality — Sonnet doesn't need pixel-perfect frames to
// judge "is the speaker animated here, are slides visible").
app.post("/extract-frames", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const body = req.body || {};
  const sourceUrl = body.source_video_url || body.sourceVideoUrl;
  const requestedFrames = Number(body.num_frames || body.numFrames || 30);
  const numFrames = Math.max(1, Math.min(60, requestedFrames));
  const uploads = Array.isArray(body.uploads) ? body.uploads : [];

  if (!sourceUrl) {
    return res.status(400).json({ error: "source_video_url is required" });
  }
  if (uploads.length < numFrames) {
    return res.status(400).json({
      error: `Need ${numFrames} signed upload targets, got ${uploads.length}`,
    });
  }

  const jobId = crypto.randomUUID();
  const tmpDir = `/tmp/frames_${jobId}`;
  const tmpVideo = `${tmpDir}/source.mp4`;

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    // ── 1. Download the source video ──
    console.log(`[extract-frames] Downloading source: ${sourceUrl}`);
    const dlResp = await fetch(sourceUrl);
    if (!dlResp.ok) {
      throw new Error(`Failed to download source: ${dlResp.status}`);
    }
    const dlBuf = Buffer.from(await dlResp.arrayBuffer());
    fs.writeFileSync(tmpVideo, dlBuf);
    console.log(`[extract-frames] Downloaded ${(dlBuf.length / 1024 / 1024).toFixed(1)}MB`);

    // ── 2. Probe duration so we can pick evenly-spaced timestamps ──
    const duration = await probeDurationSeconds(tmpVideo);
    if (!duration || duration < 1) {
      throw new Error(`Could not determine video duration (got ${duration}s)`);
    }
    console.log(`[extract-frames] Video duration: ${duration.toFixed(1)}s`);

    // Pick timestamps: avoid the very first/last seconds (often black frames
    // or pre-roll). Spread the rest evenly.
    const margin = Math.min(2, duration * 0.05);
    const usable = Math.max(duration - margin * 2, 1);
    const timestamps = Array.from({ length: numFrames }, (_, i) => {
      // For 1 frame, pick the middle. For N frames, evenly distribute.
      if (numFrames === 1) return margin + usable / 2;
      return margin + (usable * i) / (numFrames - 1);
    });

    // ── 3. Extract each frame ──
    const framePaths = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const outPath = `${tmpDir}/frame_${String(i).padStart(3, "0")}.jpg`;
      await runFfmpegFrame(tmpVideo, ts, outPath);
      framePaths.push(outPath);
    }
    console.log(`[extract-frames] Extracted ${framePaths.length} frames`);

    // ── 4. Upload each via the provided signed URLs ──
    const frameUrls = [];
    for (let i = 0; i < framePaths.length; i++) {
      const target = uploads[i];
      if (!target?.signed_url || !target?.public_url) {
        throw new Error(`Upload target ${i} is missing signed_url or public_url`);
      }
      const buf = fs.readFileSync(framePaths[i]);
      const upResp = await fetch(target.signed_url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: buf,
      });
      if (!upResp.ok) {
        const errText = await upResp.text().catch(() => "");
        throw new Error(`Frame ${i} upload failed: ${upResp.status} ${errText}`);
      }
      frameUrls.push(target.public_url);
    }

    // ── 5. Cleanup ──
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return res.json({
      frame_urls: frameUrls,
      frame_count: frameUrls.length,
      duration_seconds: duration,
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    console.error(`[extract-frames] Failed:`, err);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    return res.status(500).json({ error: err.message || "Frame extraction failed" });
  }
});

// ---------- Legacy overlay endpoint ----------
app.post("/render-overlay", authMiddleware, async (req, res) => {
  res.json({ render_id: crypto.randomUUID(), status: "legacy_overlay_accepted" });
});

// ---------- ffmpeg helpers ----------

// ffprobe equivalent — uses ffmpeg's stderr output to extract Duration. We
// avoid pulling ffprobe separately since the Dockerfile only installs ffmpeg.
function probeDurationSeconds(videoPath) {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-i", videoPath, "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("close", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) return resolve(0);
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseFloat(match[3]);
      resolve(h * 3600 + m * 60 + s);
    });
    proc.on("error", () => resolve(0));
  });
}

// Extract a single frame at `timestampSec`, scaled to 512px wide, saved as JPEG.
// The -ss before -i is fast (keyframe seek); the q:v 4 setting gives reasonable
// JPEG quality without inflating file size — Anthropic's vision API doesn't
// reward higher resolution for this kind of "what's happening on screen" check.
function runFfmpegFrame(videoPath, timestampSec, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y",
      "-ss", String(timestampSec),
      "-i", videoPath,
      "-frames:v", "1",
      "-vf", "scale=512:-2",
      "-q:v", "4",
      outputPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
      }
    });
    proc.on("error", reject);
  });
}

// ---------- Helpers ----------
async function reportProgress(callbackUrl, headers, jobId, progress) {
  if (!callbackUrl) return;
  try {
    await fetch(callbackUrl, {
      method: "POST",
      headers: headers || { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, status: "processing", progress }),
    });
  } catch (e) {
    // Non-fatal
  }
}

app.listen(PORT, () => {
  console.log(`Remotion Composition Service running on port ${PORT}`);
});
