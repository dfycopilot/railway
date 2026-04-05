import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Video } from "@remotion/media";

interface VideoSegmentProps {
  videoUrl: string;
  trimStart: number; // seconds
  trimEnd: number;   // seconds
  effects?: {
    zoom?: { type: string; from: number; to: number };
    color_grade?: string;
  };
  fps: number;
  volume?: number; // 0 = muted (audio from separate layer), 1 = full volume
}

/**
 * Renders a segment of the main video with optional zoom and color grading.
 * Audio is controlled via the volume prop — typically 0 because the main
 * composition plays audio through a separate <Audio> layer for continuity.
 */
export const VideoSegment: React.FC<VideoSegmentProps> = ({
  videoUrl,
  trimStart,
  trimEnd,
  effects,
  fps,
  volume = 0,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Zoom effect
  let scale = 1;
  if (effects?.zoom) {
    const { from = 1, to = 1 } = effects.zoom;
    scale = interpolate(frame, [0, durationInFrames], [from, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  // Color grading via CSS filters
  const getColorFilter = (grade?: string): string => {
    switch (grade) {
      case "cinematic":
        return "contrast(1.1) saturate(0.9) brightness(0.95)";
      case "warm":
        return "saturate(1.2) sepia(0.15) brightness(1.05)";
      case "cool":
        return "saturate(0.85) hue-rotate(10deg) brightness(0.95)";
      case "bw":
        return "grayscale(1) contrast(1.2)";
      case "vintage":
        return "sepia(0.3) contrast(1.1) saturate(0.8)";
      case "teal_orange":
        return "contrast(1.1) saturate(1.15) brightness(0.97)";
      case "high_contrast":
        return "contrast(1.3) brightness(0.95)";
      case "desaturated":
        return "saturate(0.6) contrast(1.05)";
      case "vibrant":
        return "saturate(1.4) contrast(1.05) brightness(1.02)";
      default:
        return "none";
    }
  };

  return (
    <AbsoluteFill>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale})`,
          filter: getColorFilter(effects?.color_grade),
          overflow: "hidden",
        }}
      >
        <Video
          src={videoUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          startFrom={Math.round(trimStart * fps)}
          endAt={Math.round(trimEnd * fps)}
          volume={volume}
        />
      </div>
    </AbsoluteFill>
  );
};
