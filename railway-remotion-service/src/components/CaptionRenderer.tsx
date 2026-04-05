import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

/**
 * CaptionRenderer — Renders captions at the correct output frame positions.
 *
 * Captions arrive with frame-based timing (start_frame/end_frame) that has
 * already been remapped to the output timeline by the edge function.
 * This component simply checks the current frame against each caption's window.
 */

interface Caption {
  text: string;
  start?: number;       // seconds (output timeline)
  end?: number;         // seconds (output timeline)
  startMs?: number;     // milliseconds
  endMs?: number;       // milliseconds
  start_frame?: number; // output frame
  startFrame?: number;
  end_frame?: number;   // output frame
  endFrame?: number;
  duration_frames?: number;
  durationFrames?: number;
}

interface CaptionRendererProps {
  captions: Caption[];
  preset?: string;
  fps?: number;
}

// Get the output frame range for a caption
function getCaptionFrameRange(caption: Caption, fps: number): { from: number; to: number } {
  // Prefer explicit frame values (set by remapCaptionsToOutputFrames)
  const startFrame = caption.start_frame ?? caption.startFrame;
  const endFrame = caption.end_frame ?? caption.endFrame;

  if (typeof startFrame === "number" && typeof endFrame === "number" && endFrame > startFrame) {
    return { from: Math.round(startFrame), to: Math.round(endFrame) };
  }

  // Fall back to millisecond timestamps
  if (typeof caption.startMs === "number" && typeof caption.endMs === "number" && caption.endMs > caption.startMs) {
    return {
      from: Math.round((caption.startMs / 1000) * fps),
      to: Math.round((caption.endMs / 1000) * fps),
    };
  }

  // Fall back to second timestamps
  const start = Number(caption.start) || 0;
  const end = Number(caption.end) || start + 1;
  return {
    from: Math.round(start * fps),
    to: Math.round(end * fps),
  };
}

export const CaptionRenderer: React.FC<CaptionRendererProps> = ({
  captions,
  preset = "tiktok",
  fps: fpsProp,
}) => {
  const frame = useCurrentFrame();
  const { fps: configFps, width, height } = useVideoConfig();
  const fps = fpsProp || configFps;

  // Find the active caption for the current frame
  const activeCaption = captions.find((cap) => {
    const { from, to } = getCaptionFrameRange(cap, fps);
    return frame >= from && frame < to;
  });

  if (!activeCaption) return null;

  const { from, to } = getCaptionFrameRange(activeCaption, fps);
  const localFrame = frame - from;
  const duration = to - from;

  // Entrance animation (spring pop-in)
  const enterProgress = spring({
    frame: localFrame,
    fps,
    config: { damping: 20, stiffness: 200 },
  });

  const scale = interpolate(enterProgress, [0, 1], [0.7, 1]);
  const opacity = interpolate(enterProgress, [0, 1], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Exit fade (last 5 frames)
  const exitOpacity =
    duration - localFrame <= 5
      ? interpolate(localFrame, [duration - 5, duration], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  // Style based on preset
  const getPresetStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      left: "50%",
      transform: `translateX(-50%) scale(${scale})`,
      textAlign: "center",
      maxWidth: "80%",
      lineHeight: 1.3,
    };

    switch (preset) {
      case "tiktok":
        return {
          ...base,
          bottom: "15%",
          fontFamily: "'Arial Black', 'Impact', sans-serif",
          fontSize: Math.round(width * 0.04),
          fontWeight: 900,
          color: "#FFFFFF",
          textTransform: "uppercase" as const,
          letterSpacing: "0.02em",
          textShadow: "0 0 10px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.6), 2px 2px 0 #000",
          WebkitTextStroke: "1.5px rgba(0,0,0,0.5)",
        };

      case "cinematic":
        return {
          ...base,
          bottom: "10%",
          fontFamily: "'Georgia', serif",
          fontSize: Math.round(width * 0.032),
          fontWeight: 400,
          color: "#FFFFFF",
          fontStyle: "italic" as const,
          textShadow: "0 2px 20px rgba(0,0,0,0.7)",
          letterSpacing: "0.05em",
        };

      case "minimal":
        return {
          ...base,
          bottom: "8%",
          fontFamily: "'Helvetica Neue', 'Arial', sans-serif",
          fontSize: Math.round(width * 0.028),
          fontWeight: 300,
          color: "#FFFFFF",
          textShadow: "0 1px 4px rgba(0,0,0,0.5)",
        };

      case "karaoke":
        return {
          ...base,
          bottom: "20%",
          fontFamily: "'Arial Black', sans-serif",
          fontSize: Math.round(width * 0.045),
          fontWeight: 900,
          color: "#FFD700",
          textShadow: "0 0 15px rgba(255,215,0,0.5), 0 4px 8px rgba(0,0,0,0.8)",
          textTransform: "uppercase" as const,
        };

      default:
        return {
          ...base,
          bottom: "15%",
          fontFamily: "'Arial Black', sans-serif",
          fontSize: Math.round(width * 0.04),
          fontWeight: 900,
          color: "#FFFFFF",
          textShadow: "0 0 10px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.6)",
        };
    }
  };

  return (
    <div
      style={{
        ...getPresetStyle(),
        opacity: opacity * exitOpacity,
      }}
    >
      {activeCaption.text}
    </div>
  );
};
