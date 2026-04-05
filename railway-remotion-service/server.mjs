import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "50mb" }));

const AUTH_TOKEN = process.env.AUTH_TOKEN || process.env.FFMPEG_AUTH_TOKEN;
const PORT = process.env.PORT || 3000;

// ─── Deep sanitizer: force all timing-related numeric fields to finite values ───
const TIMING_KEY_RE = /^(start|end|duration|from|trim|offset|at|frame|delay|entry)/i;

function deepSanitizeTimingFields(obj, depth = 0) {
  if (depth > 15) return obj;
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepSanitizeTimingFields(item, depth + 1));

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      result[key] = /duration/i.test(key) ? 1 : 0;
    } else if (typeof value === "object" && value !== null) {
      result[key] = deepSanitizeTimingFields(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── Resolve specData from various payload nesting patterns ───
function resolveSpecData(body) {
  // Direct specData
  if (body.specData) return body.specData;
  // Nested in input_props
  if (body.input_props?.specData) return body.input_props.specData;
  if (body.inputProps?.specData) return body.inputProps.specData;
  // Nested in props
  if (body.props?.specData) return body.props.specData;
  if (body.props?.input_props?.specData) return body.props.input_props.specData;
  if (body.props?.inputProps?.specData) return body.props.inputProps.specData;
  // Fall back to body itself if it has scenes
  if (Array.isArray(body.scenes)) return body;
  return null;
}

// ─── Bundle on startup ───
let bundlePromise = null;
let browserPromise = null;

async function getBundled() {
  if (!bundlePromise) {
    console.log("[bundle] Creating Remotion bundle...");
    bundlePromise = bundle({
      entryPoint: path.resolve(__dirname, "src/index.ts"),
      webpackOverride: (config) => config,
    }).then((b) => {
      console.log(`[bundle] Bundle ready: ${b}`);
      return b;
    });
  }
  return bundlePromise;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = openBrowser("chrome", {
      chromiumOptions: {
        args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
      },
    });
  }
  return browserPromise;
}

// Pre-bundle on startup
getBundled();

// ─── Health check ───
app.get("/health", (req, res) => res.json({ status: "ok", version: "2.2.0" }));

// ─── Main render endpoint (ASYNC — returns immediately) ───
app.post("/render-composition", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (AUTH_TOKEN && (!authHeader || authHeader !== `Bearer ${AUTH_TOKEN}`)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body;
    const jobId = body.job_id || body.jobId || "unknown";
    const compositionId = body.composition || "FullComposition";

    // Resolve specData — validate before accepting
    let specData = resolveSpecData(body);
    if (!specData) {
      console.error(`[render] No specData found in payload for job ${jobId}`);
      return res.status(400).json({ error: "No specData in payload" });
    }

    const renderId = `render_${jobId}_${Date.now()}`;
    console.log(`[render] Accepted job ${jobId} as ${renderId} — rendering in background`);

    // ✅ Return IMMEDIATELY so the edge function doesn't time out
    res.json({ render_id: renderId, status: "accepted" });

    // 🔥 Fire-and-forget background render
    renderInBackground(body, specData, jobId, compositionId, renderId).catch((err) => {
      console.error(`[render] Background render crashed for ${jobId}:`, err);
    });
  } catch (err) {
    console.error(`[render] Request validation error:`, err);
    res.status(500).json({ error: err.message || "Request failed" });
  }
});

// ─── Background render function ───
async function renderInBackground(body, rawSpecData, jobId, compositionId, renderId) {
  const start = Date.now();
  const callbackUrl = body.callback_url || body.callbackUrl;
  const callbackHeaders = body.callback_headers || body.callbackHeaders || {};
  const storageUpload = body.storage_upload || body.storageUpload;

  try {
    // Deep sanitize all timing fields to prevent NaN/Infinity crashes
    const specData = deepSanitizeTimingFields(rawSpecData);

    // Log payload summary
    console.log(`[render] Payload summary for ${jobId}:`, JSON.stringify({
      composition_id: compositionId,
      width: body.width || specData.width,
      height: body.height || specData.height,
      fps: body.fps || specData.fps,
      durationInFrames: body.durationInFrames || body.duration_frames || specData.durationInFrames || specData.duration_frames,
      scene_count: specData.scenes?.length ?? 0,
      caption_count: specData.captions?.length ?? 0,
      text_animation_count: (specData.text_animations || specData.textAnimations)?.length ?? 0,
      transition_count: specData.transitions?.length ?? 0,
      audio_segment_count: (specData.audio_segments || specData.audioSegments)?.length ?? 0,
      overlay_keys: Object.keys(specData.overlays || {}),
      has_music: Boolean(specData.music?.src || specData.music?.url),
      has_source_video_url: Boolean(specData.source_video_url || specData.sourceVideoUrl),
    }, null, 2));

    // Log first 3 captions for timing debug
    const captionSample = (specData.captions || []).slice(0, 3);
    if (captionSample.length > 0) {
      console.log(`[render] Caption timing sample:`, JSON.stringify(captionSample.map(c => ({
        text: (c.text || "").substring(0, 30),
        start: c.start,
        end: c.end,
        startMs: c.startMs,
        endMs: c.endMs,
        startFrame: c.start_frame ?? c.startFrame,
      }))));
    }

    // Log audio segments for debug
    const audioSegs = specData.audio_segments || specData.audioSegments || [];
    if (audioSegs.length > 0) {
      console.log(`[render] Audio segments:`, JSON.stringify(audioSegs.map(s => ({
        start_frame: s.start_frame,
        duration_frames: s.duration_frames,
        trim_start: s.trim_start,
        trim_end: s.trim_end,
      }))));
    }

    const bundled = await getBundled();
    const browser = await getBrowser();

    // Dimensions from top-level or specData
    const compWidth = Number(body.width || specData.width) || 1920;
    const compHeight = Number(body.height || specData.height) || 1080;
    const compFps = Number(body.fps || specData.fps) || 30;
    const compDuration = Number(
      body.durationInFrames || body.duration_frames ||
      specData.durationInFrames || specData.duration_frames
    ) || 900;

    // Select composition
    let composition;
    try {
      composition = await selectComposition({
        serveUrl: bundled,
        id: compositionId,
        inputProps: { specData },
        puppeteerInstance: browser,
      });
    } catch (err) {
      console.warn(`[render] Could not select composition "${compositionId}": ${err.message}`);
      if (compositionId !== "FullComposition") {
        composition = await selectComposition({
          serveUrl: bundled,
          id: "FullComposition",
          inputProps: { specData },
          puppeteerInstance: browser,
        });
      } else {
        throw err;
      }
    }

    // Override dimensions
    composition = {
      ...composition,
      width: compWidth,
      height: compHeight,
      fps: compFps,
      durationInFrames: compDuration,
    };

    console.log(`[render] Final render config: ${compWidth}x${compHeight} @ ${compFps}fps, ${compDuration} frames`);

    // Render to temp file
    const outputPath = `/tmp/render_${jobId}_${Date.now()}.mp4`;

    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: { specData },
      puppeteerInstance: browser,
      muted: false,
      audioCodec: "aac",
      concurrency: 1,
      timeoutInMilliseconds: 600000,
    });

    const fileStats = fs.statSync(outputPath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(1);

    // Upload to storage via signed URL
    if (storageUpload?.signed_url || storageUpload?.signedUrl) {
      const signedUrl = storageUpload.signed_url || storageUpload.signedUrl;
      const fileBuffer = fs.readFileSync(outputPath);

      const uploadResp = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: fileBuffer,
      });

      if (!uploadResp.ok) {
        const errText = await uploadResp.text();
        console.error(`[render] Upload failed: ${uploadResp.status} ${errText}`);
        throw new Error(`Storage upload failed: ${uploadResp.status}`);
      } else {
        console.log(`[render] Uploaded ${storageUpload.path} (${fileSizeMB}MB)`);
      }
    }

    // Send success callback
    if (callbackUrl) {
      try {
        await fetch(callbackUrl, {
          method: "POST",
          headers: { ...callbackHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: jobId,
            status: "complete",
            output_path: storageUpload?.path || body.output_path || body.outputPath,
            file_size_bytes: fileStats.size,
            duration_ms: Date.now() - start,
          }),
        });
        console.log(`[render] Success callback sent for job ${jobId}`);
      } catch (cbErr) {
        console.warn(`[render] Callback failed: ${cbErr.message}`);
      }
    }

    // Cleanup temp file
    try { fs.unlinkSync(outputPath); } catch (_) {}

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[render] Job ${jobId} complete in ${elapsed}s (${fileSizeMB}MB)`);

  } catch (err) {
    console.error(`[render] Background render error for ${jobId}:`, err);

    // Send error callback so the job doesn't hang
    if (callbackUrl) {
      try {
        await fetch(callbackUrl, {
          method: "POST",
          headers: { ...callbackHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: jobId,
            status: "error",
            error: err.message || "Render failed",
          }),
        });
        console.log(`[render] Error callback sent for job ${jobId}`);
      } catch (cbErr) {
        console.warn(`[render] Error callback also failed: ${cbErr.message}`);
      }
    }
  }
}

app.listen(PORT, () => {
  console.log(`Remotion render service v2.2.0 listening on port ${PORT}`);
});
