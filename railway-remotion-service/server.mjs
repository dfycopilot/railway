/**
 * Railway Remotion Full Composition Service
 *
 * POST /render-composition  — accepts a full composition spec, renders via Remotion, uploads MP4
 * POST /extract-frames      — extracts N evenly-spaced frames for AI vision (Viral Clips Mode)
 * POST /frames-at           — small frames at given moments, inline (AI Editor final check)
 * POST /extract-audio       — the speech track of a (long) video as a small MP3, for listening (AI Editor)
 * POST /render-overlay      — legacy overlay-only endpoint (backwards compat)
 * POST /capture-page        — phone-sized screenshot + element boxes of a public web page (capture.mjs)
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
import { registerCaptureRoute } from "./capture.mjs";

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

  if (compositionId === "Explainer" && explainerWaiting >= EXPLAINER_MAX_WAITING) {
    return res.status(503).json({ error: "Too many explainer videos waiting; try again in a few minutes." });
  }

  // Respond immediately — rendering happens async
  res.json({ render_id: renderId, status: "rendering" });

  // Async render. Explainer videos wait their turn (one at a time): a landscape
  // and a portrait of the same video arrive together, and two Chromes at once
  // can run this container out of memory.
  const run = async () => {
    const tmpOutput = `/tmp/render_${renderId}.mp4`;
    let browser;
    try {
      // Report progress — only when it moves 5 points, not on every frame
      // (each report is a call to Copilot's server).
      let lastPct = -100;
      const report = async (pct) => {
        if (pct < 90 && pct - lastPct < 5) return;
        lastPct = pct;
        await reportProgress(callback_url, callback_headers, job_id, pct);
      };
      await report(0);

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

      await report(10);

      // Render
      await renderMedia({
        composition: comp,
        serveUrl: bundleUrl,
        codec: "h264",
        outputLocation: tmpOutput,
        puppeteerInstance: browser,
        concurrency: compositionId === "Explainer" ? 2 : 1,
        muted: false,
        audioCodec: "aac",
        inputProps: remotionInputProps,
        onProgress: async ({ progress }) => {
          const pct = Math.round(10 + progress * 80); // 10-90%
          await report(pct);
        },
      });

      await browser.close({ silent: false });
      browser = null;

      await report(90);

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

      // Callback: complete (retried — a lost "done" would leave the video stuck)
      if (callback_url) {
        await postWithRetry(callback_url, callback_headers, {
          job_id,
          status: "complete",
          render_id: renderId,
          output_path,
          duration_ms: Date.now() - startTime,
        });
      }

      console.log(`[render] Job ${job_id} complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`[render] Job ${job_id} failed:`, err);
      if (browser) await browser.close({ silent: false }).catch(() => {});
      if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);

      // Callback: error (retried; never throws)
      if (callback_url) {
        await postWithRetry(callback_url, callback_headers, {
          job_id,
          status: "error",
          error: err.message || "Unknown render error",
        });
      }
    }
  };
  if (compositionId === "Explainer") {
    explainerWaiting++;
    explainerQueue = explainerQueue
      .then(run, run)
      .catch((e) => console.error(`[render] explainer job ${job_id} crashed:`, e))
      .finally(() => { explainerWaiting--; });
  } else {
    run().catch((e) => console.error(`[render] job ${job_id} crashed:`, e));
  }
});

// One explainer render at a time (see above), and a cap on the line: upload
// links expire after 2 hours, so a much longer line would render for nothing.
let explainerQueue = Promise.resolve();
let explainerWaiting = 0;
const EXPLAINER_MAX_WAITING = Number(process.env.EXPLAINER_MAX_WAITING) || 12;

/** POST a JSON report to Copilot, up to 4 tries; never throws. */
async function postWithRetry(url, headers, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: headers || { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429)) return;
    } catch (e) {
      // network trouble — try again
    }
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  console.error(`[render] couldn't report ${body.status} for ${body.job_id}`);
}

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

// ---------- POST /frames-at ----------
//
// The AI Editor's final check (2026-11-13) looks at what is already on screen
// in the recording where it plans to put a title or graphic. This grabs
// single frames at given moments, small, and returns them inline. ffmpeg
// seeks over HTTPS itself (range requests), so a multi-GB recording is never
// downloaded — each frame takes a second or two.
//
// Request body: { source_video_url, times: [seconds…] (max 16), width? }
// Answer: { frames: [{ t, jpeg_base64 | null }] }
app.post("/frames-at", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const sourceUrl = String(body.source_video_url || "");
  if (!/^https:\/\//.test(sourceUrl)) return res.status(400).json({ error: "source_video_url (https) is required" });
  const times = (Array.isArray(body.times) ? body.times : [])
    .map(Number).filter((t) => Number.isFinite(t) && t >= 0).slice(0, 16);
  if (times.length === 0) return res.status(400).json({ error: "times is required" });
  const width = Math.max(160, Math.min(720, Number(body.width) || 480));
  const grab = (t) => new Promise((resolve) => {
    const proc = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", String(t), "-i", sourceUrl,
      "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "6",
      "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    const timer = setTimeout(() => proc.kill("SIGKILL"), 20000);
    proc.stdout.on("data", (c) => chunks.push(c));
    proc.on("close", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      resolve(code === 0 && buf.length > 0 ? buf.toString("base64") : null);
    });
    proc.on("error", () => { clearTimeout(timer); resolve(null); });
  });
  try {
    const frames = [];
    // Four at a time: quick, without opening sixteen connections at once.
    for (let i = 0; i < times.length; i += 4) {
      const batch = times.slice(i, i + 4);
      const got = await Promise.all(batch.map(grab));
      batch.forEach((t, k) => frames.push({ t, jpeg_base64: got[k] }));
    }
    return res.json({ frames });
  } catch (err) {
    console.error("[frames-at] failed:", err);
    return res.status(500).json({ error: err?.message || "frames failed" });
  }
});

// ---------- POST /extract-audio ----------
//
// The AI Editor listens to a recording before it plans the edit (2026-11-12).
// A 45-minute phone recording is 2–6 GB; sending that whole file to be
// transcribed timed out. This pulls just the speech track — mono, 16 kHz,
// 48 kbps MP3, about 16 MB for 45 minutes — and uploads it.
//
// Answers 202 at once and works in the background (long files take a few
// minutes); reports to callback_url with the callback headers it was given.
// ffmpeg reads the source over HTTPS itself (range requests), so a multi-GB
// video never sits in this server's memory or disk.
//
// Request body: { job_id, source_video_url, upload: { signed_url, path },
//                 parts?: [{ signed_url, path, start, duration }],
//                 callback_url, callback_headers }
// parts: the same audio cut into pieces (seconds) — a 45-minute recording
// can't be listened to inside one 150-second call; five minutes can.
app.post("/extract-audio", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const { job_id, source_video_url, upload, callback_url, callback_headers } = body;
  const parts = Array.isArray(body.parts) ? body.parts.slice(0, 40) : [];
  if (!job_id || typeof source_video_url !== "string" || !/^https:\/\//.test(source_video_url)) {
    return res.status(400).json({ error: "job_id and an https source_video_url are required" });
  }
  if (!upload?.signed_url || !upload?.path) {
    return res.status(400).json({ error: "upload.signed_url and upload.path are required" });
  }
  res.status(202).json({ status: "processing", job_id });

  const started = Date.now();
  const out = `/tmp/audio_${crypto.randomUUID()}.mp3`;
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "10",
        "-i", source_video_url,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k",
        out,
      ]);
      let err = "";
      proc.stderr.on("data", (d) => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
      // A stuck read must not hang forever: 20 minutes is far more than a
      // 2-hour recording needs.
      const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("audio extraction timed out")); }, 20 * 60 * 1000);
      proc.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(-500)}`)); });
      proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    const buf = fs.readFileSync(out);
    const up = await fetch(upload.signed_url, { method: "PUT", headers: { "Content-Type": "audio/mpeg" }, body: buf });
    if (!up.ok) throw new Error(`audio upload failed: ${up.status} ${(await up.text().catch(() => "")).slice(0, 300)}`);
    // The pieces, cut from the MP3 just made (stream copy: seconds each).
    const doneParts = [];
    for (const p of parts) {
      if (!p?.signed_url || !p?.path) continue;
      const start = Math.max(0, Number(p.start) || 0);
      const dur = Math.max(1, Number(p.duration) || 600);
      const partFile = `${out}.${doneParts.length}.mp3`;
      try {
        await new Promise((resolve, reject) => {
          const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(start), "-t", String(dur), "-i", out, "-c", "copy", partFile]);
          proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`part ffmpeg exited ${code}`)));
          proc.on("error", reject);
        });
        const pb = fs.readFileSync(partFile);
        if (pb.length < 1000) break; // past the end of the recording
        const pu = await fetch(p.signed_url, { method: "PUT", headers: { "Content-Type": "audio/mpeg" }, body: pb });
        if (!pu.ok) throw new Error(`part upload failed: ${pu.status}`);
        doneParts.push({ path: p.path, start });
      } finally {
        try { fs.unlinkSync(partFile); } catch {}
      }
    }
    console.log(`[extract-audio] ${job_id}: ${(buf.length / 1024 / 1024).toFixed(1)}MB, ${doneParts.length} parts, in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (callback_url) {
      await postWithRetry(callback_url, { "Content-Type": "application/json", ...(callback_headers || {}) }, {
        job_id, status: "complete", audio_path: upload.path, parts: doneParts, bytes: buf.length, duration_ms: Date.now() - started,
      });
    }
  } catch (err) {
    console.error(`[extract-audio] ${job_id} failed:`, err);
    if (callback_url) {
      await postWithRetry(callback_url, { "Content-Type": "application/json", ...(callback_headers || {}) }, {
        job_id, status: "error", error: String(err?.message || err).slice(0, 500),
      });
    }
  } finally {
    try { fs.unlinkSync(out); } catch {}
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

// ---------- POST /capture-page ----------
registerCaptureRoute(app, authMiddleware);

app.listen(PORT, () => {
  console.log(`Remotion Composition Service running on port ${PORT}`);
});
