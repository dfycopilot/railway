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

// ---------- Health ----------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "remotion-composition", version: "1.2.0" });
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

// ---------- Helpers ----------
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function firstObject(...values) {
  for (const value of values) {
    if (isPlainObject(value)) {
      return value;
    }
  }
  return null;
}

function firstPositiveInt(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return Math.round(num);
    }
  }
  return null;
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.warn(`[cleanup] Failed to remove ${filePath}:`, e?.message || e);
  }
}

function buildInputProps(specData, specPath) {
  return {
    specData,
    spec_data: specData,
    compositionSpec: specData,
    specPath,
  };
}

function summarizeSpec(specData) {
  const sceneCount = Array.isArray(specData?.scenes) ? specData.scenes.length : 0;
  const captionCount = Array.isArray(specData?.captions) ? specData.captions.length : 0;
  const overlayKeys = isPlainObject(specData?.overlays) ? Object.keys(specData.overlays) : [];
  const hasMusic = Boolean(
    firstString(
      specData?.music?.url,
      specData?.music?.src,
      specData?.music_url,
      specData?.musicUrl,
    ),
  );

  return {
    sceneCount,
    captionCount,
    overlayKeys,
    hasMusic,
  };
}

function resolveRenderRequest(body = {}) {
  const inputPropContainer =
    firstObject(body.input_props, body.inputProps, body.props) || {};

  const rawSpecData =
    firstObject(
      body.specData,
      body.spec_data,
      inputPropContainer.specData,
      inputPropContainer.spec_data,
      inputPropContainer.compositionSpec,
      isPlainObject(body.composition) ? body.composition : null,
    ) || {};

  const width = firstPositiveInt(body.width, rawSpecData.width) || 1920;
  const height = firstPositiveInt(body.height, rawSpecData.height) || 1080;
  const fps = firstPositiveInt(body.fps, rawSpecData.fps) || 30;
  const durationInFrames =
    firstPositiveInt(
      body.durationInFrames,
      body.duration_frames,
      body.durationFrames,
      rawSpecData.durationInFrames,
      rawSpecData.duration_frames,
      rawSpecData.durationFrames,
    ) || 900;

  const specData = {
    ...rawSpecData,
    width,
    height,
    fps,
    durationInFrames,
    duration_frames: durationInFrames,
    durationFrames: durationInFrames,
  };

  const requestedCompositionId = firstString(
    body.composition_id,
    body.compositionId,
    typeof body.composition === "string" ? body.composition : null,
  );

  const compositionCandidates = [
    ...new Set(
      [requestedCompositionId, "main", "FullComposition"].filter(Boolean),
    ),
  ];

  const storageUpload = firstObject(body.storage_upload, body.storageUpload) || {};
  const signedUrl = firstString(storageUpload.signed_url, storageUpload.signedUrl);
  const outputPath = firstString(body.output_path, body.outputPath, storageUpload.path);
  const callbackUrl = firstString(body.callback_url, body.callbackUrl);
  const callbackHeaders = firstObject(body.callback_headers, body.callbackHeaders);

  return {
    jobId: firstString(body.job_id, body.jobId),
    specData,
    width,
    height,
    fps,
    durationInFrames,
    compositionCandidates,
    storageUpload: {
      ...storageUpload,
      signedUrl,
    },
    outputPath,
    callbackUrl,
    callbackHeaders,
    ...summarizeSpec(specData),
  };
}

async function selectCompositionWithFallback({
  serveUrl,
  puppeteerInstance,
  inputProps,
  compositionCandidates,
}) {
  let lastError = null;

  for (const id of compositionCandidates) {
    try {
      const composition = await selectComposition({
        serveUrl,
        id,
        puppeteerInstance,
        inputProps,
      });
      return { composition, compositionId: id };
    } catch (error) {
      lastError = error;
      console.warn(
        `[render] Composition "${id}" unavailable, trying next candidate:`,
        error?.message || error,
      );
    }
  }

  throw lastError || new Error("No compatible Remotion composition found");
}

async function postCallback(callbackUrl, headers, payload) {
  if (!callbackUrl) return;

  await fetch(callbackUrl, {
    method: "POST",
    headers: headers || { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function createProgressReporter(callbackUrl, headers, jobId) {
  let lastProgress = null;

  return async (progress) => {
    if (!callbackUrl) return;

    const normalized = Math.max(0, Math.min(100, Math.round(progress)));
    if (normalized === lastProgress) return;
    lastProgress = normalized;

    try {
      await postCallback(callbackUrl, headers, {
        job_id: jobId,
        status: "processing",
        progress: normalized,
      });
    } catch (_e) {
      // Non-fatal
    }
  };
}

// ---------- POST /render-composition ----------
app.post("/render-composition", authMiddleware, async (req, res) => {
  const startTime = Date.now();
  const renderId = crypto.randomUUID();
  const renderRequest = resolveRenderRequest(req.body);

  if (!renderRequest.jobId) {
    return res.status(400).json({ error: "job_id is required" });
  }

  if (!isPlainObject(renderRequest.specData) || Object.keys(renderRequest.specData).length === 0) {
    return res.status(400).json({
      error: "No composition spec found. Expected input_props.specData (or equivalent).",
    });
  }

  if (!renderRequest.storageUpload?.signedUrl || !renderRequest.outputPath) {
    return res.status(400).json({
      error: "Missing storage_upload.signed_url or output_path",
    });
  }

  // Respond immediately — rendering happens async
  res.json({ render_id: renderId, status: "rendering" });

  // Async render
  (async () => {
    const tmpOutput = `/tmp/render_${renderId}.mp4`;
    const specPath = `/tmp/composition_${renderId}.json`;
    const reportProgress = createProgressReporter(
      renderRequest.callbackUrl,
      renderRequest.callbackHeaders,
      renderRequest.jobId,
    );

    let browser = null;

    try {
      await reportProgress(0);

      const bundleUrl = await getBundleUrl();

      browser = await openBrowser("chrome", {
        browserExecutable:
          process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        chromiumOptions: {
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        },
        chromeMode: "chrome-for-testing",
      });

      fs.writeFileSync(specPath, JSON.stringify(renderRequest.specData, null, 2));

      const inputProps = buildInputProps(renderRequest.specData, specPath);

      const { composition: selectedComposition, compositionId } =
        await selectCompositionWithFallback({
          serveUrl: bundleUrl,
          puppeteerInstance: browser,
          inputProps,
          compositionCandidates: renderRequest.compositionCandidates,
        });

      const renderComposition = {
        ...selectedComposition,
        width: renderRequest.width,
        height: renderRequest.height,
        fps: renderRequest.fps,
        durationInFrames: renderRequest.durationInFrames,
      };

      console.log(
        `[render] Job ${renderRequest.jobId}: composition="${compositionId}" ` +
          `${renderComposition.width}x${renderComposition.height} @ ${renderComposition.fps}fps ` +
          `for ${renderComposition.durationInFrames} frames`,
      );

      console.log(
        `[render] Job ${renderRequest.jobId}: scenes=${renderRequest.sceneCount}, ` +
          `captions=${renderRequest.captionCount}, ` +
          `overlays=${renderRequest.overlayKeys.length ? renderRequest.overlayKeys.join(",") : "none"}, ` +
          `music=${renderRequest.hasMusic ? "yes" : "no"}`,
      );

      await reportProgress(10);

      await renderMedia({
        composition: renderComposition,
        serveUrl: bundleUrl,
        codec: "h264",
        audioCodec: "aac",
        outputLocation: tmpOutput,
        puppeteerInstance: browser,
        concurrency: 1,
        muted: false,
        inputProps,
        onProgress: async ({ progress }) => {
          const pct = Math.round(10 + progress * 80); // 10-90%
          await reportProgress(pct);
        },
      });

      await browser.close({ silent: false });
      browser = null;

      await reportProgress(92);

      const fileBuffer = fs.readFileSync(tmpOutput);
      const uploadResp = await fetch(renderRequest.storageUpload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: fileBuffer,
      });

      if (!uploadResp.ok) {
        throw new Error(
          `Upload failed: ${uploadResp.status} ${await uploadResp.text()}`,
        );
      }

      console.log(
        `[render] Uploaded ${renderRequest.outputPath} ` +
          `(${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`,
      );

      await reportProgress(100);

      await postCallback(renderRequest.callbackUrl, renderRequest.callbackHeaders, {
        job_id: renderRequest.jobId,
        status: "complete",
        render_id: renderId,
        output_path: renderRequest.outputPath,
        duration_ms: Date.now() - startTime,
      });

      console.log(
        `[render] Job ${renderRequest.jobId} complete in ${(
          (Date.now() - startTime) /
          1000
        ).toFixed(1)}s`,
      );
    } catch (err) {
      const errorMessage = err?.message || "Unknown render error";
      console.error(`[render] Job ${renderRequest.jobId} failed:`, err);

      try {
        await postCallback(renderRequest.callbackUrl, renderRequest.callbackHeaders, {
          job_id: renderRequest.jobId,
          status: "error",
          error: errorMessage,
        });
      } catch (_callbackErr) {
        // Non-fatal
      }
    } finally {
      if (browser) {
        await browser.close({ silent: false }).catch(() => {});
      }
      safeUnlink(specPath);
      safeUnlink(tmpOutput);
    }
  })();
});

// ---------- Legacy overlay endpoint ----------
app.post("/render-overlay", authMiddleware, async (_req, res) => {
  res.json({ render_id: crypto.randomUUID(), status: "legacy_overlay_accepted" });
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Remotion Composition Service running on port ${PORT}`);
});
