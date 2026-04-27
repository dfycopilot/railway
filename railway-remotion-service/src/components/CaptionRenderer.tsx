import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";

/**
 * CaptionRenderer v3.0 — Production caption renderer with:
 * - 5 preset styles (hormozi, cinematic, tiktok, minimal, karaoke)
 * - B-roll position shifting (bottom during speaker → center during B-roll)
 * - Aspect-ratio-aware safe zone margins
 * - Word-by-word animation with staggered entrance
 * - Multiple animation types: pop_in, fade, bounce, slide_up, typewriter, karaoke
 * - Proper exit animations
 *
 * Captions arrive with frame-based timing (start_frame/end_frame) already
 * remapped to the output timeline by the edge function.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface Caption {
  text: string;
  start?: number;
  end?: number;
  startMs?: number;
  endMs?: number;
  start_frame?: number;
  startFrame?: number;
  end_frame?: number;
  endFrame?: number;
  duration_frames?: number;
  durationFrames?: number;
  is_during_broll?: boolean;
}

interface CaptionSafeZone {
  portrait_marginBottom: number;
  landscape_marginBottom: number;
  square_marginBottom: number;
}

interface CaptionConfig {
  speaker_position?: "center" | "bottom" | "bottom_left" | "top";
  broll_position?: "center" | "bottom" | "bottom_left" | "top";
  safe_zone?: CaptionSafeZone;
}

interface CaptionRendererProps {
  captions: Caption[];
  preset?: string;
  fps?: number;
  caption_config?: CaptionConfig;
}

// ─── Preset Definitions ─────────────────────────────────────────────────────

interface PresetStyle {
  font_family: string;
  font_weight: number;
  font_size_ratio: number; // ratio of width
  text_transform: "uppercase" | "lowercase" | "none";
  text_color: string;
  highlight_color: string;
  bg_style: "pill" | "box" | "none" | "gradient" | "blur";
  bg_color: string;
  position: "center" | "bottom" | "bottom_left" | "top";
  broll_position: "center" | "bottom" | "bottom_left" | "top";
  animation: "pop_in" | "fade" | "bounce" | "slide_up" | "typewriter" | "karaoke";
  word_by_word: boolean;
  max_words_per_chunk: number;
  safe_zone: CaptionSafeZone;
  stroke_width: number;
  letter_spacing: string;
}

// Position values are now expressed as a fraction of total height (0..1) measured
// from the BOTTOM. e.g. 0.18 = 18% of the height up from the bottom edge.
// 0.18 lands the caption in the lower-third overlay zone (not glued to the edge).
const PRESETS: Record<string, PresetStyle> = {
  hormozi: {
    font_family: "'Oswald', 'Arial Black', 'Impact', sans-serif",
    font_weight: 700,
    font_size_ratio: 0.048,
    text_transform: "uppercase",
    text_color: "#FFFFFF",
    highlight_color: "#FFD700",
    bg_style: "pill",
    bg_color: "rgba(0,0,0,0.75)",
    position: "bottom",
    broll_position: "bottom",
    animation: "pop_in",
    word_by_word: true,
    max_words_per_chunk: 3,
    safe_zone: { portrait_marginBottom: 0.20, landscape_marginBottom: 0.14, square_marginBottom: 0.16 },
    stroke_width: 2,
    letter_spacing: "0.02em",
  },
  cinematic: {
    font_family: "'Inter', 'Helvetica Neue', sans-serif",
    font_weight: 500,
    font_size_ratio: 0.030,
    text_transform: "none",
    text_color: "#FFFFFF",
    highlight_color: "#E0E0E0",
    bg_style: "gradient",
    bg_color: "linear-gradient(transparent, rgba(0,0,0,0.8))",
    position: "bottom",
    broll_position: "bottom",
    animation: "fade",
    word_by_word: false,
    max_words_per_chunk: 5,
    safe_zone: { portrait_marginBottom: 0.18, landscape_marginBottom: 0.12, square_marginBottom: 0.14 },
    stroke_width: 0,
    letter_spacing: "0.05em",
  },
  tiktok: {
    font_family: "'Montserrat', 'Arial Black', sans-serif",
    font_weight: 700,
    font_size_ratio: 0.044,
    text_transform: "uppercase",
    text_color: "#FFFFFF",
    highlight_color: "#FF3B5C",
    bg_style: "none",
    bg_color: "transparent",
    position: "bottom",
    broll_position: "bottom",
    animation: "bounce",
    word_by_word: true,
    max_words_per_chunk: 3,
    safe_zone: { portrait_marginBottom: 0.22, landscape_marginBottom: 0.14, square_marginBottom: 0.16 },
    stroke_width: 2,
    letter_spacing: "0.02em",
  },
  minimal: {
    font_family: "'Inter', 'Helvetica Neue', sans-serif",
    font_weight: 400,
    font_size_ratio: 0.024,
    text_transform: "lowercase",
    text_color: "#F0F0F0",
    highlight_color: "#CCCCCC",
    bg_style: "none",
    bg_color: "transparent",
    position: "bottom_left",
    broll_position: "bottom_left",
    animation: "fade",
    word_by_word: false,
    max_words_per_chunk: 6,
    safe_zone: { portrait_marginBottom: 0.16, landscape_marginBottom: 0.10, square_marginBottom: 0.12 },
    stroke_width: 0,
    letter_spacing: "0.01em",
  },
  karaoke: {
    font_family: "'Bebas Neue', 'Arial Black', sans-serif",
    font_weight: 400,
    font_size_ratio: 0.038,
    text_transform: "uppercase",
    text_color: "rgba(255,255,255,0.4)",
    highlight_color: "#00FF88",
    bg_style: "box",
    bg_color: "rgba(0,0,0,0.6)",
    position: "bottom",
    broll_position: "bottom",
    animation: "karaoke",
    word_by_word: true,
    max_words_per_chunk: 8,
    safe_zone: { portrait_marginBottom: 0.18, landscape_marginBottom: 0.12, square_marginBottom: 0.14 },
    stroke_width: 0,
    letter_spacing: "0.04em",
  },
  // KEYWORD EMPHASIS — modeled on the AgencyBloc-style reference Eric showed.
  // Prints 1–2 words at a time, very large, no pill background, with a heavy
  // stroke + drop-shadow so the text reads cleanly over any backdrop. The
  // pacing makes every word feel like a hook — perfect for short-form social
  // talking-head clips. Position lives in the lower third (not glued to the
  // edge) so the speaker's hands/gestures still carry energy beneath.
  keyword: {
    font_family: "'Oswald', 'Arial Black', 'Impact', sans-serif",
    font_weight: 800,
    font_size_ratio: 0.082,
    text_transform: "uppercase",
    text_color: "#FFFFFF",
    highlight_color: "#FFD700",
    bg_style: "none",
    bg_color: "transparent",
    position: "bottom",
    broll_position: "bottom",
    animation: "pop_in",
    word_by_word: true,
    max_words_per_chunk: 2,
    safe_zone: { portrait_marginBottom: 0.30, landscape_marginBottom: 0.18, square_marginBottom: 0.22 },
    stroke_width: 5,
    letter_spacing: "0.01em",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCaptionFrameRange(
  caption: Caption,
  fps: number
): { from: number; to: number } {
  const startFrame = caption.start_frame ?? caption.startFrame;
  const endFrame = caption.end_frame ?? caption.endFrame;

  if (
    typeof startFrame === "number" &&
    typeof endFrame === "number" &&
    endFrame > startFrame
  ) {
    return { from: Math.round(startFrame), to: Math.round(endFrame) };
  }

  if (
    typeof caption.startMs === "number" &&
    typeof caption.endMs === "number" &&
    caption.endMs > caption.startMs
  ) {
    return {
      from: Math.round((caption.startMs / 1000) * fps),
      to: Math.round((caption.endMs / 1000) * fps),
    };
  }

  const start = Number(caption.start) || 0;
  const end = Number(caption.end) || start + 1;
  return { from: Math.round(start * fps), to: Math.round(end * fps) };
}

function getAspectCategory(
  width: number,
  height: number
): "portrait" | "landscape" | "square" {
  const ratio = width / height;
  if (ratio < 0.8) return "portrait";
  if (ratio > 1.2) return "landscape";
  return "square";
}

function getPositionStyles(
  position: string,
  safeZone: CaptionSafeZone,
  width: number,
  height: number,
  _bgStyle: string
): React.CSSProperties {
  const aspect = getAspectCategory(width, height);
  // safe_zone values are now fractions of total height (0..1) measured from bottom
  const marginFraction =
    aspect === "portrait"
      ? safeZone.portrait_marginBottom
      : aspect === "square"
        ? safeZone.square_marginBottom
        : safeZone.landscape_marginBottom;

  const scaledMargin = Math.round(marginFraction * height);

  // Constrain caption width so long words can never bleed off the screen edges.
  // 78% wide with auto-wrap leaves a clean 11% gutter on each side.
  const base: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    width: "78%",
    maxWidth: "78%",
    textAlign: "center",
  };

  switch (position) {
    case "center":
      // Kept for backward-compat but no preset uses it now.
      return {
        ...base,
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
    case "top":
      return {
        ...base,
        top: `${Math.round(height * 0.08)}px`,
        transform: "translateX(-50%)",
      };
    case "bottom_left":
      return {
        ...base,
        bottom: `${scaledMargin}px`,
        left: "5%",
        transform: "none",
        textAlign: "left",
        width: "60%",
        maxWidth: "60%",
      };
    case "bottom":
    default:
      return {
        ...base,
        bottom: `${scaledMargin}px`,
        transform: "translateX(-50%)",
      };
  }
}

// ─── Animation Helpers ───────────────────────────────────────────────────────

function getEntranceAnimation(
  animation: string,
  localFrame: number,
  fps: number,
  wordIndex: number
): { opacity: number; transform: string } {
  const staggerDelay = wordIndex * 2; // 2 frames stagger per word
  const adjustedFrame = Math.max(0, localFrame - staggerDelay);

  switch (animation) {
    case "pop_in": {
      const progress = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 15, stiffness: 200 },
      });
      const scale = interpolate(progress, [0, 1], [0.3, 1]);
      const opacity = interpolate(progress, [0, 1], [0, 1], {
        extrapolateRight: "clamp",
      });
      return { opacity, transform: `scale(${scale})` };
    }

    case "bounce": {
      const progress = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 8, stiffness: 200 },
      });
      const y = interpolate(progress, [0, 1], [40, 0]);
      const scale = interpolate(progress, [0, 1], [0.5, 1]);
      const opacity = interpolate(progress, [0, 1], [0, 1], {
        extrapolateRight: "clamp",
      });
      return { opacity, transform: `translateY(${y}px) scale(${scale})` };
    }

    case "slide_up": {
      const progress = spring({
        frame: adjustedFrame,
        fps,
        config: { damping: 20, stiffness: 120 },
      });
      const y = interpolate(progress, [0, 1], [60, 0]);
      const opacity = interpolate(progress, [0, 1], [0, 1], {
        extrapolateRight: "clamp",
      });
      return { opacity, transform: `translateY(${y}px)` };
    }

    case "typewriter": {
      // Reveal one word at a time
      const revealFrame = wordIndex * 4; // 4 frames per word reveal
      const opacity = adjustedFrame >= revealFrame ? 1 : 0;
      return { opacity, transform: "none" };
    }

    case "fade": {
      const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      });
      return { opacity, transform: "none" };
    }

    case "karaoke":
    default:
      return { opacity: 1, transform: "none" };
  }
}

function getExitAnimation(
  localFrame: number,
  duration: number
): { opacity: number } {
  const exitFrames = 6;
  if (duration - localFrame <= exitFrames) {
    const opacity = interpolate(
      localFrame,
      [duration - exitFrames, duration],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    return { opacity };
  }
  return { opacity: 1 };
}

// ─── Background Component ────────────────────────────────────────────────────

const CaptionBackground: React.FC<{
  bgStyle: string;
  bgColor: string;
}> = ({ bgStyle, bgColor }) => {
  if (bgStyle === "none") return null;

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: -1,
  };

  switch (bgStyle) {
    case "pill":
      return (
        <div
          style={{
            ...baseStyle,
            background: bgColor,
            borderRadius: "999px",
            padding: "8px 24px",
            inset: "-8px -24px",
          }}
        />
      );
    case "box":
      return (
        <div
          style={{
            ...baseStyle,
            background: bgColor,
            borderRadius: "8px",
            inset: "-12px -16px",
          }}
        />
      );
    case "gradient":
      return (
        <div
          style={{
            ...baseStyle,
            background: bgColor,
            inset: "-40px -60px",
          }}
        />
      );
    case "blur":
      return (
        <div
          style={{
            ...baseStyle,
            background: "rgba(0,0,0,0.3)",
            // Note: filter blur is cheaper than backdropFilter in headless Chrome
            filter: "blur(8px)",
            borderRadius: "12px",
            inset: "-12px -16px",
          }}
        />
      );
    default:
      return null;
  }
};

// ─── Word-by-Word Renderer ───────────────────────────────────────────────────

const WordByWordCaption: React.FC<{
  text: string;
  localFrame: number;
  duration: number;
  preset: PresetStyle;
  fps: number;
  width: number;
}> = ({ text, localFrame, duration, preset, fps, width }) => {
  const words = text.split(/\s+/).filter(Boolean);
  const exitAnim = getExitAnimation(localFrame, duration);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: preset.position === "bottom_left" ? "flex-start" : "center",
        gap: `${Math.round(width * 0.008)}px`,
        position: "relative",
        opacity: exitAnim.opacity,
      }}
    >
      <CaptionBackground bgStyle={preset.bg_style} bgColor={preset.bg_color} />
      {words.map((word, i) => {
        const entrance = getEntranceAnimation(preset.animation, localFrame, fps, i);

        // For karaoke: all words visible, active word highlighted
        if (preset.animation === "karaoke") {
          const wordProgress = words.length > 1 ? i / (words.length - 1) : 0;
          const frameProgress = duration > 0 ? localFrame / duration : 0;
          const isActive = frameProgress >= wordProgress - 0.05;

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                color: isActive ? preset.highlight_color : preset.text_color,
                transition: "none", // No CSS transitions in Remotion
                fontWeight: isActive ? 900 : preset.font_weight,
                transform: isActive ? "scale(1.15)" : "scale(1)",
              }}
            >
              {word}
            </span>
          );
        }

        // For other word-by-word animations
        const isHighlighted = i === 0 || (words.length > 2 && i === words.length - 1);

        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: entrance.opacity,
              transform: entrance.transform,
              color: isHighlighted ? preset.highlight_color : preset.text_color,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const CaptionRenderer: React.FC<CaptionRendererProps> = ({
  captions,
  preset = "tiktok",
  fps: fpsProp,
  caption_config,
}) => {
  const frame = useCurrentFrame();
  const { fps: configFps, width, height } = useVideoConfig();
  const fps = fpsProp || configFps;

  if (!captions || captions.length === 0) return null;

  // Find active caption
  const activeCaption = captions.find((cap) => {
    const { from, to } = getCaptionFrameRange(cap, fps);
    return frame >= from && frame < to;
  });

  if (!activeCaption) return null;

  const { from, to } = getCaptionFrameRange(activeCaption, fps);
  const localFrame = frame - from;
  const duration = to - from;

  // Resolve preset
  const presetStyle = PRESETS[preset] || PRESETS.tiktok;

  // Determine position based on B-roll flag
  const isBroll = activeCaption.is_during_broll === true;
  const activePosition = isBroll
    ? caption_config?.broll_position || presetStyle.broll_position
    : caption_config?.speaker_position || presetStyle.position;

  const safeZone = caption_config?.safe_zone || presetStyle.safe_zone;

  // Build position + text styles
  const positionStyles = getPositionStyles(
    activePosition,
    safeZone,
    width,
    height,
    presetStyle.bg_style
  );

  // Scale font by the SHORTER dimension so landscape captions don't blow up
  // (1920 wide × 0.05 = 96px was way too big). Using min(w,h) makes a 1080p
  // landscape and a 1080p portrait render captions at the same visual weight.
  const fontReference = Math.min(width, height);
  const fontSize = Math.round(fontReference * presetStyle.font_size_ratio);

  const textStyles: React.CSSProperties = {
    fontFamily: presetStyle.font_family,
    fontWeight: presetStyle.font_weight,
    fontSize,
    textTransform: presetStyle.text_transform,
    color: presetStyle.text_color,
    letterSpacing: presetStyle.letter_spacing,
    lineHeight: 1.3,
    textShadow:
      presetStyle.stroke_width > 0
        ? `0 0 ${presetStyle.stroke_width * 4}px rgba(0,0,0,0.8), 0 ${presetStyle.stroke_width * 2}px ${presetStyle.stroke_width * 4}px rgba(0,0,0,0.6)`
        : "0 2px 8px rgba(0,0,0,0.5)",
    WebkitTextStroke:
      presetStyle.stroke_width > 0
        ? `${presetStyle.stroke_width}px rgba(0,0,0,0.5)`
        : undefined,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  // Word-by-word rendering
  if (presetStyle.word_by_word) {
    return (
      <div style={{ ...positionStyles, ...textStyles, zIndex: 100 }}>
        <WordByWordCaption
          text={activeCaption.text}
          localFrame={localFrame}
          duration={duration}
          preset={presetStyle}
          fps={fps}
          width={width}
        />
      </div>
    );
  }

  // Full-phrase rendering (cinematic, minimal)
  const entrance = getEntranceAnimation(presetStyle.animation, localFrame, fps, 0);
  const exitAnim = getExitAnimation(localFrame, duration);

  return (
    <div
      style={{
        ...positionStyles,
        ...textStyles,
        zIndex: 100,
        opacity: entrance.opacity * exitAnim.opacity,
        transform: [
          positionStyles.transform || "",
          entrance.transform !== "none" ? entrance.transform : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      }}
    >
      <div style={{ position: "relative", display: "inline-block" }}>
        <CaptionBackground
          bgStyle={presetStyle.bg_style}
          bgColor={presetStyle.bg_color}
        />
        {activeCaption.text}
      </div>
    </div>
  );
};

export default CaptionRenderer;
