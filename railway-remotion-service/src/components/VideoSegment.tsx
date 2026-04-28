import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { Video } from "@remotion/media";

interface VideoSegmentProps {
  videoUrl: string;
  trimStart: number; // seconds
  trimEnd: number; // seconds
  effects?: {
    zoom?: { type?: string; from?: number; to?: number };
    color_grade?: string;
    colorGrade?: string;
  };
  /**
   * The number of frames this scene actually plays for (passed by the parent
   * Sequence). Used to interpolate zoom over the scene window instead of the
   * full composition. If omitted we fall back to the composition duration.
   */
  sceneDurationFrames?: number;
  volume?: number;
  /**
   * Where to anchor the crop window when source aspect ≠ output aspect.
   * x and y are 0..1 fractions of the source frame. Default { x: 0.5, y: 0.4 }
   * — face-bias for talking-head content (talking heads are framed with the
   * face in the upper-middle, so a true 0.5/0.5 center-crop chops foreheads
   * when rotating landscape→square or any portrait crop-down). Set to
   * { x: 0.5, y: 0.5 } explicitly to opt out of the bias.
   */
  cropAnchor?: { x?: number; y?: number };
}

/**
 * Renders a slice of the source video with optional zoom and color grading.
 *
 * IMPORTANT: zoom uses `sceneDurationFrames` (the parent Sequence's window),
 * NOT `useVideoConfig().durationInFrames` (which is the entire composition).
 * Using the composition duration was the bug that made every "slow_zoom_in"
 * effectively static — `frame` only ever hit a tiny fraction of the full
 * composition length, so the interpolated scale barely moved.
 */
export const VideoSegment: React.FC<VideoSegmentProps> = ({
  videoUrl,
  trimStart,
  trimEnd,
  effects,
  sceneDurationFrames,
  volume = 0,
  cropAnchor,
}) => {
  // Default to face-bias anchor (50% horizontal, 40% vertical) so that when
  // the source has to be cropped to match output aspect, the face stays in
  // frame. Talking-head shooters frame faces above the geometric center;
  // a literal 50/50 center-crop chops foreheads.
  const anchorX = clampFrac(cropAnchor?.x, 0.5);
  const anchorY = clampFrac(cropAnchor?.y, 0.4);
  const frame = useCurrentFrame();
  const { fps, durationInFrames: compDuration } = useVideoConfig();

  const sceneDur = Math.max(
    1,
    Number.isFinite(sceneDurationFrames) && (sceneDurationFrames as number) > 0
      ? (sceneDurationFrames as number)
      : compDuration
  );

  // ─── Zoom ────────────────────────────────────────────
  let scale = 1;
  if (effects?.zoom) {
    const from = Number.isFinite(effects.zoom.from) ? Number(effects.zoom.from) : 1;
    const to = Number.isFinite(effects.zoom.to) ? Number(effects.zoom.to) : 1;
    const zoomType = String(effects.zoom.type || "").toLowerCase();

    if (zoomType === "snap_zoom") {
      // Quick punch-in held for the rest of the scene
      const peak = Math.max(2, Math.round(sceneDur * 0.18));
      scale = interpolate(frame, [0, peak, sceneDur], [from, to, to], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    } else if (zoomType === "pulse_zoom") {
      // Subtle in-and-out
      const mid = Math.max(1, Math.round(sceneDur / 2));
      scale = interpolate(frame, [0, mid, sceneDur], [from, to, from], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    } else if (zoomType === "slow_zoom_out") {
      scale = interpolate(frame, [0, sceneDur], [from, to], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    } else {
      // slow_zoom_in / ken_burns / default
      scale = interpolate(frame, [0, sceneDur], [from, to], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }

  // ─── Color grade ──────────────────────────────────────
  const grade = String(effects?.color_grade || effects?.colorGrade || "").toLowerCase();
  const filter = getColorFilter(grade);

  // ─── Source trim windows ──────────────────────────────
  // @remotion/media's <Video> uses trimBefore/trimAfter (in frames) to seek
  // into and clip the source. trimBefore = how many frames to skip at the
  // start of the source; trimAfter = where in the source to stop playback.
  const trimBeforeFrames = Math.max(0, Math.round(trimStart * fps));
  const effectiveTrimEndSec =
    trimEnd > trimStart ? trimEnd : trimStart + sceneDur / fps;
  const trimAfterFrames = Math.max(
    trimBeforeFrames + 1,
    Math.round(effectiveTrimEndSec * fps)
  );

  return (
    <AbsoluteFill>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          filter: filter || undefined,
          overflow: "hidden",
          willChange: "transform",
        }}
      >
        <Video
          src={videoUrl}
          objectFit="cover"
          style={{
            width: "100%",
            height: "100%",
            // Slide the cropped window so talking-head faces stay in frame
            // when source aspect ≠ output aspect. No effect when aspects match.
            objectPosition: `${(anchorX * 100).toFixed(2)}% ${(anchorY * 100).toFixed(2)}%`,
          }}
          trimBefore={trimBeforeFrames}
          trimAfter={trimAfterFrames}
          volume={volume}
        />
      </div>
    </AbsoluteFill>
  );
};

function clampFrac(v: number | undefined, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function getColorFilter(grade: string): string {
  switch (grade) {
    case "cinematic":
      return "contrast(1.12) saturate(0.92) brightness(0.96)";
    case "warm":
      return "saturate(1.18) sepia(0.14) brightness(1.04)";
    case "cool":
      return "saturate(0.88) hue-rotate(12deg) brightness(0.96)";
    case "teal_orange":
      // Teal shadows + orange highlights — modern YouTube look
      return "contrast(1.15) saturate(1.25) hue-rotate(-8deg) brightness(1.02)";
    case "high_contrast":
      return "contrast(1.35) saturate(1.05) brightness(1.0)";
    case "desaturated":
      return "saturate(0.55) contrast(1.05)";
    case "vibrant":
      return "saturate(1.45) contrast(1.1) brightness(1.05)";
    case "vintage":
      return "sepia(0.32) contrast(1.1) saturate(0.82)";
    case "bw":
    case "black_and_white":
      return "grayscale(1) contrast(1.2)";
    case "none":
    case "":
    default:
      return "";
  }
}
