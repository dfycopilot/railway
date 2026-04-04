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
  res.json({ status: "ok", service: "remotion-composition", version: "1.1.0" });
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
  const {
    job_id,
    composition: compositionSpec,
    storage_upload,
    output_path,
    callback_url,
    callback_headers,
  } = req.body;

  if (!job_id || !compositionSpec) {
    return res.status(400).json({ error: "job_id and composition are required" });
  }

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

      // Write composition spec to a temp file the component can read
      const specPath = `/tmp/composition_${renderId}.json`;
      fs.writeFileSync(specPath, JSON.stringify(compositionSpec));

      // Select the composition with input props
      const comp = await selectComposition({
        serveUrl: bundleUrl,
        id: "FullComposition",
        puppeteerInstance: browser,
        inputProps: {
          specPath: specPath,
          specData: compositionSpec,
        },
      });

      // --- Override composition dimensions from the payload ---
      if (compositionSpec.width) comp.width = compositionSpec.width;
      if (compositionSpec.height) comp.height = compositionSpec.height;
      if (compositionSpec.fps) comp.fps = compositionSpec.fps;
      if (compositionSpec.durationInFrames) comp.durationInFrames = compositionSpec.durationInFrames;

      console.log(`[render] Job ${job_id} — ${comp.width}x${comp.height} @ ${comp.fps}fps, ${comp.durationInFrames} frames`);

      await reportProgress(callback_url, callback_headers, job_id, 10);

      // Render
      await renderMedia({
        composition: comp,
        serveUrl: bundleUrl,
        codec: "h264",
        outputLocation: tmpOutput,
        puppeteerInstance: browser,
        concurrency: 1,
        inputProps: {
          specPath: specPath,
          specData: compositionSpec,
        },
        onProgress: async ({ progress }) => {
          const pct = Math.round(10 + progress * 80); // 10-90%
          await reportProgress(callback_url, callback_headers, job_id, pct);
        },
      });

      await browser.close({ silent: false });
      browser = null;

      // Clean up spec file
      fs.unlinkSync(specPath);

      await reportProgress(callback_url, callback_headers, job_id, 90);

      // Upload to storage via signed URL
      if (storage_upload?.signed_url) {
        const fileBuffer = fs.readFileSync(tmpOutput);
        const uploadResp = await fetch(storage_upload.signed_url, {
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

// ---------- Legacy overlay endpoint ----------
app.post("/render-overlay", authMiddleware, async (req, res) => {
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
  } catch (e) {
    // Non-fatal
  }
}

app.listen(PORT, () => {
  console.log(`Remotion Composition Service running on port ${PORT}`);
});
