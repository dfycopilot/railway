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
}

/**
 * Renders a segment of the main video with optional zoom and color grading.
 * Replaces FFmpeg's trim + zoompan + eq filter chains with React.
 */
export const VideoSegment: React.FC<VideoSegmentProps> = ({
  videoUrl,
  trimStart,
  trimEnd,
  effects,
  fps,
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
          trimBefore={Math.round(trimStart * fps)}
          trimAfter={Math.round(trimEnd * fps)}
          volume={1}
        />
      </div>
    </AbsoluteFill>
  );
};
