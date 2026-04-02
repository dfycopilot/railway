/**
 * Remotion Overlay Renderer — Railway Service
 * 
 * Accepts a graphics_spec JSON, renders a transparent .webm overlay
 * using Remotion's headless renderer, uploads to Supabase storage
 * via signed URL, and calls back when done.
 */
import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "10mb" }));

const AUTH_TOKEN = process.env.AUTH_TOKEN || process.env.FFMPEG_AUTH_TOKEN;
const PORT = process.env.PORT || 3001;

// Auth middleware
function authMiddleware(req, res, next) {
  if (AUTH_TOKEN) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token !== AUTH_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  next();
}

app.use(authMiddleware);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "remotion-overlay-renderer" });
});

// Render overlay endpoint
app.post("/render-overlay", async (req, res) => {
  const { job_id, graphics_spec, storage_upload, callback_url, callback_headers } = req.body;

  if (!job_id || !graphics_spec) {
    return res.status(400).json({ error: "job_id and graphics_spec are required" });
  }

  // Respond immediately, render in background
  const render_id = `overlay_${job_id}_${Date.now()}`;
  res.json({ render_id, status: "rendering" });

  // Background render
  (async () => {
    const outputPath = `/tmp/${render_id}.webm`;
    try {
      console.log(`[${render_id}] Starting overlay render...`);

      // Write graphics_spec to a temp file so Remotion can read it
      const specPath = `/tmp/${render_id}_spec.json`;
      fs.writeFileSync(specPath, JSON.stringify(graphics_spec));

      // Bundle the Remotion project
      const bundled = await bundle({
        entryPoint: path.resolve(__dirname, "src/index.ts"),
        webpackOverride: (config) => config,
      });

      const browser = await openBrowser("chrome", {
        chromiumOptions: {
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        },
      });

      const composition = await selectComposition({
        serveUrl: bundled,
        id: "overlay",
        puppeteerInstance: browser,
        inputProps: {
          specPath,
          graphicsSpec: graphics_spec,
        },
      });

      // Override duration based on spec
      const fps = graphics_spec.fps || 30;
      const durationInFrames = Math.ceil((graphics_spec.duration_seconds || 30) * fps);

      await renderMedia({
        composition: {
          ...composition,
          durationInFrames,
          width: graphics_spec.width || 1920,
          height: graphics_spec.height || 1080,
          fps,
        },
        serveUrl: bundled,
        codec: "vp9",
        outputLocation: outputPath,
        puppeteerInstance: browser,
        muted: true,
        concurrency: 1,
        pixelFormat: "yuva420p", // Alpha channel for transparency
        inputProps: {
          specPath,
          graphicsSpec: graphics_spec,
        },
      });

      await browser.close({ silent: false });
      console.log(`[${render_id}] Render complete: ${outputPath}`);

      // Upload to storage via signed URL
      if (storage_upload?.signed_url) {
        console.log(`[${render_id}] Uploading overlay...`);
        const fileBuffer = fs.readFileSync(outputPath);
        const uploadRes = await fetch(storage_upload.signed_url, {
          method: "PUT",
          headers: { "Content-Type": "video/webm" },
          body: fileBuffer,
        });
        if (!uploadRes.ok) {
          throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
        }
        console.log(`[${render_id}] Upload complete`);
      }

      // Callback
      if (callback_url) {
        await fetch(callback_url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...callback_headers },
          body: JSON.stringify({
            job_id,
            render_id,
            status: "completed",
            overlay_path: storage_upload?.path || outputPath,
          }),
        });
      }
    } catch (err) {
      console.error(`[${render_id}] Render failed:`, err);
      if (callback_url) {
        await fetch(callback_url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...callback_headers },
          body: JSON.stringify({
            job_id,
            render_id,
            status: "failed",
            error: err.message,
          }),
        }).catch(() => {});
      }
    } finally {
      // Cleanup temp files
      try { fs.unlinkSync(outputPath); } catch {}
      try { fs.unlinkSync(`/tmp/${render_id}_spec.json`); } catch {}
    }
  })();
});

app.listen(PORT, () => {
  console.log(`Remotion overlay renderer listening on port ${PORT}`);
});
