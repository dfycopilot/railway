const { buildFilterChain } = require("./filters");
const express = require("express");
const { execFile } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const https = require("https");
const http = require("http");

const app = express();
app.use(express.json({ limit: "10mb" }));

const AUTH_TOKEN = process.env.AUTH_TOKEN;
const PORT = process.env.PORT || 3000;
const WORK_DIR = "/tmp/renders";

// ---------- Auth middleware ----------
function authMiddleware(req, res, next) {
  if (!AUTH_TOKEN) return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ---------- Helpers ----------
async function downloadFile(url, dest) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, (resp) => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        downloadFile(resp.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (resp.statusCode !== 200) {
        reject(new Error(`Download failed: ${resp.statusCode} for ${url}`));
        return;
      }
      resp.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function uploadToSupabase(filePath, storageUpload, outputPath) {
  const fileBuffer = await fsp.readFile(filePath);

  // Support new signed-URL format (preferred) or legacy authorization format
  let uploadUrl;
  let method;
  let headers;

  if (storageUpload.signed_url) {
    // New format: use the pre-signed URL directly — no auth header needed
    uploadUrl = storageUpload.signed_url;
    method = "PUT";
    headers = {
      "Content-Type": "video/mp4",
      "Content-Length": fileBuffer.length,
    };
    console.log("Using signed upload URL (no auth header needed)");
  } else {
    // Legacy format: build URL from base + path, use Authorization header
    uploadUrl = `${storageUpload.url}/${outputPath}`;
    method = "POST";
    headers = {
      "Authorization": storageUpload.authorization,
      "Content-Type": "video/mp4",
      "Content-Length": fileBuffer.length,
      "x-upsert": "true",
    };
    console.log("Using legacy upload with Authorization header");
  }

  return new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const proto = url.protocol === "https:" ? https : http;
    const req = proto.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
    }, (resp) => {
      let data = "";
      resp.on("data", (chunk) => data += chunk);
      resp.on("end", () => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Upload failed: ${resp.statusCode} ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function sendCallback(callbackUrl, callbackHeaders, body) {
  if (!callbackUrl) return;
  try {
    const url = new URL(callbackUrl);
    const proto = url.protocol === "https:" ? https : http;
    const payload = JSON.stringify(body);
    const req = proto.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: "POST",
      headers: { ...callbackHeaders, "Content-Length": Buffer.byteLength(payload) },
    }, (resp) => {
      let d = "";
      resp.on("data", (c) => d += c);
      resp.on("end", () => console.log(`Callback response: ${resp.statusCode}`));
    });
    req.on("error", (e) => console.error("Callback error:", e.message));
    req.write(payload);
    req.end();
  } catch (e) {
    console.error("Callback send error:", e.message);
  }
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log("FFmpeg command:", "ffmpeg", args.join(" "));
    execFile("ffmpeg", args, { maxBuffer: 50 * 1024 * 1024, timeout: 600000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("FFmpeg stderr:", stderr);
        reject(new Error(`FFmpeg failed: ${err.message}\n${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Generate ASS subtitle file from captions
function generateASSFromCaptions(captions, videoWidth = 1080, videoHeight = 1920) {
  const fontSize = Math.round(videoWidth * 0.045);
  let ass = `[Script Info]
Title: Captions
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,2,0,2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const cap of captions) {
    const start = formatASSTime(cap.start);
    const end = formatASSTime(cap.end);
    const text = (cap.text || "").replace(/\n/g, "\\N");
    ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}\n`;
  }
  return ass;
}

function formatASSTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// ---------- Build FFmpeg command from render spec ----------
async function buildFFmpegCommand(spec, workDir) {
  const inputs = [];
  const filterParts = [];
  let inputIdx = 0;

  const norm = spec.normalize || {};
  const normEnabled = norm.enabled !== false;
  const outW = norm.width || 1080;
  const outH = norm.height || 1920;
  const outFps = norm.fps || 30;
  const outFmt = norm.pixel_format || "yuv420p";

  const normFilter = normEnabled
    ? `,scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,fps=${outFps},format=${outFmt}`
    : "";

  // 1. Download source video
  const srcPath = path.join(workDir, "source.mp4");
  console.log("Downloading source video...");
  await downloadFile(spec.source_video_url, srcPath);
  inputs.push("-i", srcPath);
  const srcIdx = inputIdx++;

  // 2. Download B-roll clips
  const brollPaths = [];
  for (let i = 0; i < (spec.broll_clips || []).length; i++) {
    const clip = spec.broll_clips[i];
    const brollPath = path.join(workDir, `broll_${i}.mp4`);
    console.log(`Downloading B-roll ${i}: ${clip.video_url}`);
    await downloadFile(clip.video_url, brollPath);
    brollPaths.push(brollPath);
    inputs.push("-i", brollPath);
    inputIdx++;
  }

  // 3. Download music if provided
  let musicIdx = -1;
  if (spec.music?.url) {
    const musicPath = path.join(workDir, "music.mp3");
    console.log("Downloading background music...");
    await downloadFile(spec.music.url, musicPath);
    inputs.push("-i", musicPath);
    musicIdx = inputIdx++;
  }

  // 4. Build filter_complex
  const keepSegs = spec.keep_segments || [];
  const brollClips = spec.broll_clips || [];
  const captions = spec.captions || [];

  const segLabels = [];
  for (let i = 0; i < keepSegs.length; i++) {
    const seg = keepSegs[i];
    filterParts.push(
      `[${srcIdx}:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS${normFilter}[sv${i}]`
    );
    filterParts.push(
      `[${srcIdx}:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[sa${i}]`
    );
    segLabels.push({ v: `sv${i}`, a: `sa${i}`, start: seg.start, end: seg.end, duration: seg.end - seg.start });
  }

  // --- Interleave B-roll ---
  const timeline = [];
  if (brollClips.length === 0) {
    for (let i = 0; i < segLabels.length; i++) {
      timeline.push({ type: "source", v: `[${segLabels[i].v}]`, a: `[${segLabels[i].a}]` });
    }
  } else {
    for (let bi = 0; bi < brollClips.length; bi++) {
      const brollInputIdx = srcIdx + 1 + bi;
      const clip = brollClips[bi];
      if (normEnabled) {
        filterParts.push(
          `[${brollInputIdx}:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},fps=${outFps},format=${outFmt},setpts=PTS-STARTPTS[bv${bi}]`
        );
      } else {
        filterParts.push(
          `[${brollInputIdx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=PTS-STARTPTS[bv${bi}]`
        );
      }
      filterParts.push(
        `aevalsrc=0:d=${clip.duration}[ba${bi}]`
      );
    }

    let brollIdx = 0;
    let elapsed = 0;
    for (let i = 0; i < segLabels.length; i++) {
      while (brollIdx < brollClips.length && brollClips[brollIdx].insert_at <= elapsed + segLabels[i].duration) {
        timeline.push({ type: "broll", v: `[bv${brollIdx}]`, a: `[ba${brollIdx}]` });
        brollIdx++;
      }
      timeline.push({ type: "source", v: `[${segLabels[i].v}]`, a: `[${segLabels[i].a}]` });
      elapsed += segLabels[i].duration;
    }
    while (brollIdx < brollClips.length) {
      timeline.push({ type: "broll", v: `[bv${brollIdx}]`, a: `[ba${brollIdx}]` });
      brollIdx++;
    }
  }

  // --- Concat ---
  const concatInputs = timeline.map((t) => `${t.v}${t.a}`).join("");
  filterParts.push(
    `${concatInputs}concat=n=${timeline.length}:v=1:a=1[concatv][concata]`
  );

  // --- Captions (ASS subtitles) ---
  let finalV = "[concatv]";
  if (captions.length > 0) {
    const assPath = path.join(workDir, "captions.ass");
    const assContent = generateASSFromCaptions(captions, outW, outH);
    await fsp.writeFile(assPath, assContent);
    filterParts.push(
      `${finalV}ass='${assPath.replace(/'/g, "'\\''")}'[captioned]`
    );
    finalV = "[captioned]";
  }

  // --- Advanced visual effects ---
  try {
    const vf = buildFilterChain(spec);
    if (vf && vf.trim().length > 0) {
      filterParts.push(`${finalV}${vf}[effected]`);
      finalV = "[effected]";
    }
  } catch (filterErr) {
    console.warn("Skipping advanced effects due to error:", filterErr.message);
  }

  // --- Music mixing ---
  let finalA = "[concata]";
  if (musicIdx >= 0 && spec.music) {
    const vol = spec.music.volume || 0.15;
    filterParts.push(
      `[${musicIdx}:a]volume=${vol},aloop=loop=-1:size=2e+09[musicloop]`
    );
    filterParts.push(
      `${finalA}[musicloop]amix=inputs=2:duration=first:dropout_transition=2[mixed]`
    );
    finalA = "[mixed]";
  }

  // --- Output args ---
  const outputPath = path.join(workDir, "output.mp4");
  const outputSettings = spec.output || {};

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterParts.join(";\n"),
    "-map", finalV,
    "-map", finalA,
    "-c:v", outputSettings.video_codec || "libx264",
    "-preset", outputSettings.preset || "medium",
    "-crf", String(outputSettings.crf || 23),
    "-b:v", outputSettings.video_bitrate || "8M",
    "-c:a", outputSettings.audio_codec || "aac",
    "-b:a", outputSettings.audio_bitrate || "192k",
    "-movflags", "+faststart",
    outputPath,
  ];

  return { args, outputPath };
}

// ---------- Routes ----------
app.get("/", (req, res) => {
  res.json({
    service: "FFmpeg Render Worker",
    version: "1.3.0",
    endpoints: [
      { method: "GET", path: "/health", description: "Health check" },
      { method: "POST", path: "/render", description: "Submit render job" },
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.post("/render", authMiddleware, async (req, res) => {
  const spec = req.body;
  if (!spec || !spec.job_id || !spec.source_video_url) {
    return res.status(400).json({ error: "Missing job_id or source_video_url" });
  }

  const renderId = uuidv4();
  const workDir = path.join(WORK_DIR, renderId);
  res.json({ render_id: renderId, status: "processing" });

  (async () => {
    try {
      await fsp.mkdir(workDir, { recursive: true });

      await sendCallback(spec.callback_url, spec.callback_headers, {
        job_id: spec.job_id,
        status: "processing",
        progress: 10,
      });

      console.log(`[${renderId}] Building FFmpeg command...`);
      const { args, outputPath } = await buildFFmpegCommand(spec, workDir);

      await sendCallback(spec.callback_url, spec.callback_headers, {
        job_id: spec.job_id,
        status: "processing",
        progress: 30,
      });

      console.log(`[${renderId}] Running FFmpeg...`);
      await runFFmpeg(args);

      await sendCallback(spec.callback_url, spec.callback_headers, {
        job_id: spec.job_id,
        status: "processing",
        progress: 80,
      });

      console.log(`[${renderId}] Uploading result...`);
      await uploadToSupabase(outputPath, spec.storage_upload, spec.output_path);

      await sendCallback(spec.callback_url, spec.callback_headers, {
        job_id: spec.job_id,
        status: "complete",
        output_path: spec.output_path,
      });

      console.log(`[${renderId}] ✅ Render complete!`);
    } catch (e) {
      console.error(`[${renderId}] ❌ Render failed:`, e.message);
      await sendCallback(spec.callback_url, spec.callback_headers, {
        job_id: spec.job_id,
        status: "error",
        error: e.message,
      });
    } finally {
      try { await fsp.rm(workDir, { recursive: true, force: true }); } catch {}
    }
  })();
});

app.listen(PORT, () => {
  console.log(`FFmpeg render worker listening on port ${PORT}`);
});
