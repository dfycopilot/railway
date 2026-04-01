// railway/src/filters.js
// FFmpeg filter graph builders for advanced video effects

/**
 * Color Grading — returns array of -vf filter strings
 */
function buildColorFilter(grading) {
  if (!grading || grading.preset === "none") return [];

  const filters = [];

  const presets = {
    cinematic:
      "curves=r='0/0 0.25/0.20 0.5/0.45 0.75/0.78 1/1':g='0/0 0.25/0.22 0.5/0.50 0.75/0.77 1/1':b='0/0 0.25/0.28 0.5/0.55 0.75/0.75 1/1'",
    teal_orange:
      "colorbalance=rs=0.15:gs=-0.05:bs=-0.15:rm=0.1:gm=-0.03:bm=-0.1",
    warm: "colortemperature=temperature=6500",
    cool: "colortemperature=temperature=4500",
    vintage: "curves=vintage",
    high_contrast: "eq=contrast=1.4:brightness=0.02:saturation=1.1",
    desaturated: "eq=saturation=0.5:contrast=1.1",
    vibrant: "eq=saturation=1.5:contrast=1.1",
    film_grain: "noise=alls=15:allf=t+u",
  };

  if (presets[grading.preset]) {
    filters.push(presets[grading.preset]);
  }

  if (
    grading.brightness !== 0 ||
    grading.contrast !== 1 ||
    grading.saturation !== 1
  ) {
    filters.push(
      `eq=brightness=${grading.brightness}:contrast=${grading.contrast}:saturation=${grading.saturation}`
    );
  }

  if (grading.vignette) {
    filters.push("vignette=PI/4");
  }

  return filters;
}

/**
 * Zoom Effects — returns a zoompan filter string
 */
function buildZoomFilter(zoom, fps = 30) {
  if (!zoom) return null;

  const frames = Math.round((zoom.end - zoom.start) * fps);
  const scaleFrom = zoom.scale_from || 1;
  const scaleTo = zoom.scale_to || 1.3;
  const anchor = zoom.anchor || "center";

  const anchors = {
    center: { x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    top_left: { x: "0", y: "0" },
    top_right: { x: "iw-(iw/zoom)", y: "0" },
    bottom_left: { x: "0", y: "ih-(ih/zoom)" },
    bottom_right: { x: "iw-(iw/zoom)", y: "ih-(ih/zoom)" },
    face: { x: "iw/2-(iw/zoom/2)", y: "ih/3-(ih/zoom/3)" },
  };

  const pos = anchors[anchor] || anchors.center;

  switch (zoom.type) {
    case "ken_burns_in":
    case "slow_zoom_in":
      return `zoompan=z='${scaleFrom}+${scaleTo - scaleFrom}*on/${frames}':x='${pos.x}':y='${pos.y}':d=${frames}:s=1920x1080:fps=${fps}`;
    case "ken_burns_out":
    case "slow_zoom_out":
      return `zoompan=z='${scaleTo}-${scaleTo - scaleFrom}*on/${frames}':x='${pos.x}':y='${pos.y}':d=${frames}:s=1920x1080:fps=${fps}`;
    case "snap_zoom":
      return `zoompan=z='if(lt(on,3),${scaleFrom}+(${scaleTo}-${scaleFrom})*on/3,${scaleTo})':x='${pos.x}':y='${pos.y}':d=${frames}:s=1920x1080:fps=${fps}`;
    case "pulse_zoom":
      return `zoompan=z='${scaleFrom}+${(scaleTo - scaleFrom) / 2}*(1-cos(2*PI*on/${frames}))':x='${pos.x}':y='${pos.y}':d=${frames}:s=1920x1080:fps=${fps}`;
    default:
      return null;
  }
}

/**
 * Transitions — returns xfade spec object
 */
function buildTransitionFilter(transition) {
  if (!transition) return null;

  const typeMap = {
    crossfade: "fade",
    wipe_left: "wipeleft",
    wipe_right: "wiperight",
    wipe_up: "wipeup",
    wipe_down: "wipedown",
    slide_left: "slideleft",
    slide_right: "slideright",
    fade_black: "fadeblack",
    zoom_in: "zoomin",
    zoom_out: "squeezev",
    glitch: "pixelize",
  };

  const xfadeType = typeMap[transition.type] || "fade";
  const duration = transition.duration || 0.8;

  return {
    filter: "xfade",
    type: xfadeType,
    duration,
    offset: transition.at - duration,
  };
}

/**
 * Text Animations — returns a drawtext filter string
 */
function buildTextFilter(textAnim, fps = 30) {
  if (!textAnim) return null;

  const startFrame = Math.round(textAnim.start * fps);
  const endFrame = Math.round(textAnim.end * fps);
  const fontSize = textAnim.font_size || 48;
  const color = (textAnim.font_color || "#ffffff").replace("#", "0x");
  const bgColor = textAnim.bg_color
    ? textAnim.bg_color.replace("#", "0x")
    : null;

  const positions = {
    center: { x: "(w-text_w)/2", y: "(h-text_h)/2" },
    top: { x: "(w-text_w)/2", y: "h*0.1" },
    bottom: { x: "(w-text_w)/2", y: "h*0.85" },
    lower_third: { x: "w*0.05", y: "h*0.82" },
    bottom_left: { x: "w*0.05", y: "h*0.82" },
    bottom_center: { x: "(w-text_w)/2", y: "h*0.88" },
    top_left: { x: "w*0.05", y: "h*0.05" },
    top_right: { x: "w*0.75", y: "h*0.05" },
  };
  const pos = positions[textAnim.position] || positions.center;

  let alphaExpr;
  switch (textAnim.type) {
    case "fade_in":
      alphaExpr = `if(between(n\\,${startFrame}\\,${endFrame})\\,min((n-${startFrame})/15\\,1)\\,0)`;
      break;
    case "typewriter":
    case "slide_up":
    case "scale_in":
    case "bounce":
    case "glitch_in":
      alphaExpr = `if(between(n\\,${startFrame}\\,${endFrame})\\,min((n-${startFrame})/10\\,1)\\,0)`;
      break;
    default:
      alphaExpr = `if(between(n\\,${startFrame}\\,${endFrame})\\,1\\,0)`;
  }

  const escapedText = textAnim.text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,");

  let filter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${color}:x=${pos.x}:y=${pos.y}:alpha='${alphaExpr}'`;

  if (textAnim.font_weight === "bold") {
    filter += ":fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  }

  if (bgColor) {
    filter += `:box=1:boxcolor=${bgColor}:boxborderw=10`;
  }

  return filter;
}

/**
 * Letterboxing — returns a pad filter for 2.35:1 cinematic bars
 */
function buildLetterboxFilter(width = 1920, height = 1080) {
  const targetHeight = Math.round(width / 2.35);
  const padY = Math.round((height - targetHeight) / 2);
  return `pad=${width}:${height}:0:${padY}:black`;
}

/**
 * Picture-in-Picture — returns { scale, overlay } filter strings
 */
function buildPipFilter(pip, width = 1920, height = 1080) {
  if (!pip) return null;

  const pipW = Math.round(width * (pip.scale || 0.3));
  const pipH = Math.round(height * (pip.scale || 0.3));
  const margin = 30;

  const positions = {
    top_right: { x: width - pipW - margin, y: margin },
    top_left: { x: margin, y: margin },
    bottom_right: { x: width - pipW - margin, y: height - pipH - margin },
    bottom_left: { x: margin, y: height - pipH - margin },
  };
  const pos = positions[pip.position] || positions.top_right;

  return {
    scale: `scale=${pipW}:${pipH}`,
    overlay: `overlay=${pos.x}:${pos.y}:enable='between(t,${pip.start},${pip.end})'`,
  };
}

/**
 * Assembles all filters from a render spec into a single -vf string.
 * For simple cases without multi-input transitions/PiP.
 */
function buildFilterChain(spec, fps = 30) {
  const filters = [];

  // Color grading
  if (spec.color_grading) {
    filters.push(...buildColorFilter(spec.color_grading));
  }

  // Text animations
  for (const text of spec.text_animations || []) {
    const f = buildTextFilter(text, fps);
    if (f) filters.push(f);
  }

  // Static overlays (treated as simple drawtext)
  for (const overlay of spec.overlays || []) {
    const f = buildTextFilter(
      {
        type: "fade_in",
        start: overlay.start,
        end: overlay.end,
        text: overlay.text,
        font_size: 36,
        font_color: "#ffffff",
        bg_color: "#00000080",
        position: overlay.position || "lower_third",
      },
      fps
    );
    if (f) filters.push(f);
  }

  // Letterboxing
  if (spec.letterboxing) {
    filters.push(buildLetterboxFilter());
  }

  return filters.join(",");
}

module.exports = {
  buildColorFilter,
  buildZoomFilter,
  buildTransitionFilter,
  buildTextFilter,
  buildLetterboxFilter,
  buildPipFilter,
  buildFilterChain,
};
