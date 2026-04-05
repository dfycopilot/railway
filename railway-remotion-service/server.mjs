/**
 * Railway Remotion Full Composition Service v2.0.0
 *
 * POST /render-composition  — accepts a full composition spec, renders via Remotion, uploads MP4
 * GET  /health              — health check
 */

import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

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

// ---------- Deep sanitize timing fields ----------
// Forces all NaN/Infinity numeric values on timing-related keys to safe defaults.
// This prevents Remotion's interpolate() from crashing.
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

// ---------- POST /render-composition ----------
app.post("/render-composition", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const renderId = crypto.randomUUID();

  // The Supabase edge function sends the payload with these fields:
  // - job_id: string
  // - composition: string (composition ID, e.g. "FullComposition")
  // - input_props: { specData: { scenes, captions, overlays, music, ... } }
  // - width, height, fps, durationInFrames: number (top-level overrides)
  // - storage_upload: { signed_url }
  // - output_path: string
  // - callback_url, callback_headers
  const body = req.body;
  const job_id = body.job_id || body.jobId;

  // Resolve input props — the edge function sends specData in multiple places
  const inputProps = body.input_props || body.inputProps || body.props || {};
  const specData = inputProps.specData || inputProps.spec_data || body.specData || body.composition || {};

  // Sanitize all timing fields to prevent NaN crashes
  const sanitizedSpecData = deepSanitizeTimingFields(specData);
  const sanitizedInputProps = { specData: sanitizedSpecData };

  // Resolve composition dimensions from top-level payload OR from specData
  const width = Number(body.width) || Number(sanitizedSpecData.width) || 1920;
  const height = Number(body.height) || Number(sanitizedSpecData.height) || 1080;
  const fps = Number(body.fps) || Number(sanitizedSpecData.fps) || 30;
  const durationInFrames = Number(body.durationInFrames) || Number(body.duration_frames)
    || Number(sanitizedSpecData.durationInFrames) || Number(sanitizedSpecData.duration_frames) || 900;

  // Resolve composition ID — try multiple field names
  const compositionIds = [];
  if (typeof body.composition === "string") compositionIds.push(body.composition);
  if (body.composition_id) compositionIds.push(body.composition_id);
  compositionIds.push("FullComposition"); // always try this as fallback

  // Log incoming payload summary
  const scenes = sanitizedSpecData.scenes || [];
  const captions = sanitizedSpecData.captions || [];
  const textAnimations = sanitizedSpecData.text_animations || sanitizedSpecData.textAnimations || [];
  const transitions = sanitizedSpecData.transitions || [];
  const overlayKeys = sanitizedSpecData.overlays ? Object.keys(sanitizedSpecData.overlays) : [];
  const hasMusic = !!(sanitizedSpecData.music?.url || sanitizedSpecData.music?.src);
  const hasSourceVideoUrl = !!(sanitizedSpecData.source_video_url || sanitizedSpecData.sourceVideoUrl);

  console.log(`[render] Incoming payload summary:`, JSON.stringify({
    job_id,
    composition_ids: compositionIds,
    width,
    height,
    fps,
    durationInFrames,
    scene_count: scenes.length,
    caption_count: captions.length,
    text_animation_count: textAnimations.length,
    transition_count: transitions.length,
    overlay_keys: overlayKeys,
    has_music: hasMusic,
    has_source_video_url: hasSourceVideoUrl,
  }, null, 2));

  if (!job_id) {
    return res.status(400).json({ error: "job_id is required" });
  }

  // Storage upload config
  const storageUpload = body.storage_upload || body.storageUpload;
  const outputPath = body.output_path || body.outputPath;
  const callbackUrl = body.callback_url || body.callbackUrl;
  const callbackHeaders = body.callback_headers || body.callbackHeaders || { "Content-Type": "application/json" };

  // Respond immediately — rendering happens async
  res.json({ render_id: renderId, status: "rendering" });

  // Async render
  (async () => {
    const tmpOutput = `/tmp/render_${renderId}.mp4`;
    let browser;
    try {
      await reportProgress(callbackUrl, callbackHeaders, job_id, 0);

      const bundleUrl = await getBundleUrl();

      browser = await openBrowser("chrome", {
        browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        chromiumOptions: {
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        },
        chromeMode: "chrome-for-testing",
      });

      // Try each composition ID until one works
      let comp = null;
      for (const compId of compositionIds) {
        try {
          comp = await selectComposition({
            serveUrl: bundleUrl,
            id: compId,
            puppeteerInstance: browser,
            inputProps: sanitizedInputProps,
          });
          console.log(`[render] Selected composition: ${JSON.stringify({
            compositionId: comp.id,
            width: comp.width,
            height: comp.height,
            fps: comp.fps,
            durationInFrames: comp.durationInFrames,
          })}`);
          break;
        } catch (err) {
          console.log(`[render] Could not select composition "${compId}": ${err.message}`);
        }
      }

      if (!comp) {
        throw new Error(`No valid composition found. Tried: ${compositionIds.join(", ")}`);
      }

      // Override composition dimensions from the payload
      comp.width = width;
      comp.height = height;
      comp.fps = fps;
      comp.durationInFrames = durationInFrames;

      console.log(`[render] Final render config: ${comp.width}x${comp.height} @ ${comp.fps}fps, ${comp.durationInFrames} frames`);

      await reportProgress(callbackUrl, callbackHeaders, job_id, 10);

      // Render with audio enabled
      await renderMedia({
        composition: comp,
        serveUrl: bundleUrl,
        codec: "h264",
        audioCodec: "aac",
        outputLocation: tmpOutput,
        puppeteerInstance: browser,
        muted: false,
        concurrency: 1,
        inputProps: sanitizedInputProps,
        onProgress: async ({ progress }) => {
          const pct = Math.round(10 + progress * 80);
          await reportProgress(callbackUrl, callbackHeaders, job_id, pct);
        },
      });

      await browser.close({ silent: false });
      browser = null;

      await reportProgress(callbackUrl, callbackHeaders, job_id, 90);

      // Upload to storage via signed URL
      if (storageUpload?.signed_url || storageUpload?.signedUrl) {
        const signedUrl = storageUpload.signed_url || storageUpload.signedUrl;
        const fileBuffer = fs.readFileSync(tmpOutput);
        const uploadResp = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: fileBuffer,
        });
        if (!uploadResp.ok) {
          throw new Error(`Upload failed: ${uploadResp.status} ${await uploadResp.text()}`);
        }
        console.log(`[render] Uploaded ${outputPath} (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      }

      // Callback: complete
      if (callbackUrl) {
        await fetch(callbackUrl, {
          method: "POST",
          headers: callbackHeaders,
          body: JSON.stringify({
            job_id,
            status: "complete",
            render_id: renderId,
            output_path: outputPath,
            duration_ms: Date.now() - startTime,
          }),
        });
      }

      console.log(`[render] Job ${job_id} complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`[render] Job ${job_id} failed:`, err);
      if (browser) await browser.close({ silent: false }).catch(() => {});

      if (callbackUrl) {
        await fetch(callbackUrl, {
          method: "POST",
          headers: callbackHeaders,
          body: JSON.stringify({
            job_id,
            status: "error",
            error: err.message || "Unknown render error",
          }),
        }).catch(() => {});
      }
    } finally {
      // Clean up temp files
      if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
    }
  })();
});

// ---------- Progress reporter ----------
async function reportProgress(callbackUrl, callbackHeaders, jobId, percent) {
  if (!callbackUrl) return;
  try {
    await fetch(callbackUrl, {
      method: "POST",
      headers: callbackHeaders || { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        status: "rendering",
        progress: percent,
      }),
    });
  } catch (_e) {
    // Non-fatal
  }
}

app.listen(PORT, () => {
  console.log(`[server] Remotion composition service v2.0.0 listening on port ${PORT}`);
});
