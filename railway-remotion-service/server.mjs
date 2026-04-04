/**
 * Railway Remotion Full Composition Service
 *
 * POST /render-composition  — accepts a full composition spec, renders via Remotion, uploads MP4
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

// ---------- Number sanitizers ----------
function toFiniteNumber(value, fallback) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toPositiveInt(value, fallback) {
  const num = Math.round(toFiniteNumber(value, fallback));
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function toNonNegativeInt(value, fallback = 0) {
  const num = Math.round(toFiniteNumber(value, fallback));
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

// Recursively sanitize common timing keys so Remotion never receives NaN.
function sanitizeTimingKeysDeep(input) {
  if (Array.isArray(input)) {
    return input.map(sanitizeTimingKeysDeep);
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (value && typeof value === "object") {
      out[key] = sanitizeTimingKeysDeep(value);
      continue;
    }

    switch (key) {
      case "start_frame":
      case "startFrame":
      case "at_frame":
      case "atFrame":
      case "frame":
      case "from":
      case "offset":
      case "delay":
        out[key] = toNonNegativeInt(value, 0);
        break;

      case "duration_frames":
      case "durationFrames":
        out[key] = toPositiveInt(value, 30);
        break;

      case "trim_start":
      case "trimStart":
        out[key] = toFiniteNumber(value, 0);
        break;

      case "trim_end":
      case "trimEnd":
        out[key] = toFiniteNumber(value, 1);
        break;

      case "start":
        out[key] = toFiniteNumber(value, 0);
        break;

      case "end":
      case "to":
        out[key] = toFiniteNumber(value, 0.5);
        break;

      case "fps":
        out[key] = toPositiveInt(value, 30);
        break;

      case "width":
        out[key] = toPositiveInt(value, 1920);
        break;

      case "height":
        out[key] = toPositiveInt(value, 1080);
        break;

      case "durationInFrames":
        out[key] = toPositiveInt(value, 900);
        break;

      default:
        out[key] = value;
    }
  }

  return out;
}

function sanitizeScene(scene, fps) {
  const startFrame = toNonNegativeInt(scene?.start_frame ?? scene?.startFrame, 0);
  const durationFrames = toPositiveInt(scene?.duration_frames ?? scene?.durationFrames, 30);
  const trimStart = toFiniteNumber(scene?.trim_start ?? scene?.trimStart, 0);

  let trimEnd = scene?.trim_end ?? scene?.trimEnd;
  trimEnd =
    trimEnd === undefined || trimEnd === null
      ? trimStart + durationFrames / fps
      : toFiniteNumber(trimEnd, trimStart + durationFrames / fps);

  if (trimEnd <= trimStart) {
    trimEnd = trimStart + durationFrames / fps;
  }

  return {
    ...scene,
    start_frame: startFrame,
    startFrame,
    duration_frames: durationFrames,
    durationFrames,
    trim_start: trimStart,
    trimStart,
    trim_end: trimEnd,
    trimEnd,
  };
}

function sanitizeCaption(caption) {
  const start = toFiniteNumber(caption?.start, 0);
  let end = toFiniteNumber(caption?.end, start + 0.5);
  if (end <= start) end = start + 0.5;

  const startFrame =
    caption?.start_frame !== undefined || caption?.startFrame !== undefined
      ? toNonNegativeInt(caption?.start_frame ?? caption?.startFrame, Math.round(start * 30))
      : undefined;

  const durationFrames =
    caption?.duration_frames !== undefined || caption?.durationFrames !== undefined
      ? toPositiveInt(
          caption?.duration_frames ?? caption?.durationFrames,
          Math.max(1, Math.round((end - start) * 30)),
        )
      : undefined;

  return {
    ...caption,
    start,
    end,
    ...(startFrame !== undefined
      ? { start_frame: startFrame, startFrame }
      : {}),
    ...(durationFrames !== undefined
      ? { duration_frames: durationFrames, durationFrames }
      : {}),
  };
}

function sanitizeTextAnimation(animation) {
  const startFrame = toNonNegativeInt(animation?.start_frame ?? animation?.startFrame, 0);
  const durationFrames = toPositiveInt(animation?.duration_frames ?? animation?.durationFrames, 30);

  return {
    ...animation,
    start_frame: startFrame,
    startFrame,
    duration_frames: durationFrames,
    durationFrames,
  };
}

function sanitizeTransition(transition) {
  const atFrame = toNonNegativeInt(transition?.at_frame ?? transition?.atFrame, 0);
  const durationFrames = toPositiveInt(transition?.duration_frames ?? transition?.durationFrames, 15);

  return {
    ...transition,
    at_frame: atFrame,
    atFrame,
    duration_frames: durationFrames,
    durationFrames,
  };
}

function sanitizeSpecData(rawSpecData, fps) {
  const base = sanitizeTimingKeysDeep(rawSpecData || {});

  const scenes = Array.isArray(base.scenes) ? base.scenes.map((scene) => sanitizeScene(scene, fps)) : [];
  const captions = Array.isArray(base.captions) ? base.captions.map(sanitizeCaption) : [];
  const textAnimations = Array.isArray(base.text_animations)
    ? base.text_animations.map(sanitizeTextAnimation)
    : [];
  const transitions = Array.isArray(base.transitions)
    ? base.transitions.map(sanitizeTransition)
    : [];

  return {
    ...base,
    scenes,
    captions,
    text_animations: textAnimations,
    transitions,
  };
}

// ---------- Payload extraction ----------
function extractSpecData(body) {
  if (body?.input_props?.specData && typeof body.input_props.specData === "object") {
    return body.input_props.specData;
  }
  if (body?.inputProps?.specData && typeof body.inputProps.specData === "object") {
    return body.inputProps.specData;
  }
  if (body?.props?.specData && typeof body.props.specData === "object") {
    return body.props.specData;
  }
  if (body?.specData && typeof body.specData === "object") {
    return body.specData;
  }
  if (body?.spec_data && typeof body.spec_data === "object") {
    return body.spec_data;
  }
  if (body?.composition && typeof body.composition === "object") {
    if (body.composition.specData && typeof body.composition.specData === "object") {
      return body.composition.specData;
    }
    if (Array.isArray(body.composition.scenes)) {
      return body.composition;
    }
  }
  if (Array.isArray(body?.scenes)) {
    return body;
  }

  return null;
}

function getCompositionIds(body) {
  return dedupe([
    typeof body?.composition === "string" ? body.composition : null,
    typeof body?.compositionId === "string" ? body.compositionId : null,
    "main",
    "FullComposition",
  ]);
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
  const body = req.body || {};

  const job_id = body.job_id || body.jobId;
  const rawSpecData = extractSpecData(body);
  const storage_upload = body.storage_upload || body.storageUpload;
  const output_path = body.output_path || body.outputPath;
  const callback_url = body.callback_url || body.callbackUrl;
  const callback_headers = body.callback_headers || body.callbackHeaders;

  if (!job_id || !rawSpecData) {
    return res.status(400).json({ error: "job_id and specData are required" });
  }

  const fps = toPositiveInt(body.fps ?? rawSpecData.fps, 30);
  const width = toPositiveInt(body.width ?? rawSpecData.width, 1920);
  const height = toPositiveInt(body.height ?? rawSpecData.height, 1080);
  const durationInFrames = toPositiveInt(
    body.durationInFrames ?? body.duration_frames ?? rawSpecData.durationInFrames ?? rawSpecData.duration_frames,
    900,
  );

  const specData = sanitizeSpecData(rawSpecData, fps);

  console.log("[render] Incoming payload summary:", {
    job_id,
    composition_ids: getCompositionIds(body),
    width,
    height,
    fps,
    durationInFrames,
    scene_count: specData.scenes?.length ?? 0,
    caption_count: specData.captions?.length ?? 0,
    text_animation_count: specData.text_animations?.length ?? 0,
    transition_count: specData.transitions?.length ?? 0,
    overlay_keys: Object.keys(specData.overlays || {}),
    has_music: Boolean(specData.music),
    has_source_video_url: Boolean(specData.source_video_url),
  });

  // Respond immediately — rendering happens async
  res.json({ render_id: renderId, status: "rendering" });

  (async () => {
    const tmpOutput = `/tmp/render_${renderId}.mp4`;
    const specPath = `/tmp/composition_${renderId}.json`;
    let browser = null;

    try {
      await reportProgress(callback_url, callback_headers, job_id, 0);

      const bundleUrl = await getBundleUrl();

      browser = await openBrowser("chrome", {
        browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        chromiumOptions: {
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        },
        chromeMode: "chrome-for-testing",
      });

      fs.writeFileSync(specPath, JSON.stringify(specData, null, 2));

      const inputProps = {
        specData,
        specPath,
      };

      const compositionIds = getCompositionIds(body);
      let comp = null;
      let selectedId = null;

      for (const id of compositionIds) {
        try {
          comp = await selectComposition({
            serveUrl: bundleUrl,
            id,
            puppeteerInstance: browser,
            inputProps,
          });
          selectedId = id;
          break;
        } catch (err) {
          console.warn(`[render] Could not select composition "${id}": ${err?.message || err}`);
        }
      }

      if (!comp) {
        throw new Error(`No composition found. Tried: ${compositionIds.join(", ")}`);
      }

      // Force the composition dimensions/timing from payload so landscape jobs
      // do not render with the default portrait composition config.
      comp = {
        ...comp,
        width,
        height,
        fps,
        durationInFrames,
      };

      console.log("[render] Selected composition:", {
        compositionId: selectedId,
        width: comp.width,
        height: comp.height,
        fps: comp.fps,
        durationInFrames: comp.durationInFrames,
      });

      await reportProgress(callback_url, callback_headers, job_id, 10);

      await renderMedia({
        composition: comp,
        serveUrl: bundleUrl,
        codec: "h264",
        audioCodec: "aac",
        outputLocation: tmpOutput,
        puppeteerInstance: browser,
        concurrency: 1,
        muted: false,
        inputProps,
        onProgress: async ({ progress }) => {
          const pct = Math.round(10 + progress * 80);
          await reportProgress(callback_url, callback_headers, job_id, pct);
        },
      });

      await browser.close({ silent: false });
      browser = null;

      if (fs.existsSync(specPath)) {
        fs.unlinkSync(specPath);
      }

      await reportProgress(callback_url, callback_headers, job_id, 90);

      // Upload to storage via signed URL
      const signedUrl = storage_upload?.signed_url || storage_upload?.signedUrl;
      if (signedUrl) {
        const fileBuffer = fs.readFileSync(tmpOutput);
        const uploadResp = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: fileBuffer,
        });

        if (!uploadResp.ok) {
          throw new Error(`Upload failed: ${uploadResp.status} ${await uploadResp.text()}`);
        }

        console.log(
          `[render] Uploaded ${output_path || "(no output_path provided)"} (${(
            fileBuffer.length /
            1024 /
            1024
          ).toFixed(1)}MB)`,
        );
      }

      if (fs.existsSync(tmpOutput)) {
        fs.unlinkSync(tmpOutput);
      }

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

      if (browser) {
        try {
          await browser.close({ silent: false });
        } catch (_) {}
      }

      if (fs.existsSync(tmpOutput)) {
        try {
          fs.unlinkSync(tmpOutput);
        } catch (_) {}
      }

      if (fs.existsSync(specPath)) {
        try {
          fs.unlinkSync(specPath);
        } catch (_) {}
      }

      // Callback: error
      if (callback_url) {
        try {
          await fetch(callback_url, {
            method: "POST",
            headers: callback_headers || { "Content-Type": "application/json" },
            body: JSON.stringify({
              job_id,
              status: "error",
              error: err?.message || "Unknown render error",
            }),
          });
        } catch (callbackErr) {
          console.error("[render] Error callback failed:", callbackErr);
        }
      }
    }
  })();
});

// ---------- Legacy overlay endpoint ----------
app.post("/render-overlay", authMiddleware, async (_req, res) => {
  res.json({ render_id: crypto.randomUUID(), status: "legacy_overlay_accepted" });
});

// ---------- Helpers ----------
async function reportProgress(callbackUrl, headers, jobId, progress) {
  if (!callbackUrl) return;
  try {
    await fetch(callbackUrl, {
      method: "POST",
      headers: headers || { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, status: "processing", progress }),
    });
  } catch (_) {
    // Non-fatal
  }
}

app.listen(PORT, () => {
  console.log(`Remotion Composition Service running on port ${PORT}`);
});
