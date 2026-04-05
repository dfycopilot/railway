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
  volume?: number;
}

/**
 * Renders a segment of the main video with optional zoom and color grading.
 * Gets fps from useVideoConfig() — never from props.
 * Uses objectFit prop on <Video> (Remotion 4.x requirement).
 */
export const VideoSegment: React.FC<VideoSegmentProps> = ({
  videoUrl,
  trimStart,
  trimEnd,
  effects,
  volume = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

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

  const startFrom = Math.max(0, Math.round(trimStart * fps));
  const endAt = Math.max(startFrom + 1, Math.round(trimEnd * fps));

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
          objectFit="cover"
          style={{ width: "100%", height: "100%" }}
          startFrom={startFrom}
          endAt={endAt}
          volume={volume}
        />
      </div>
    </AbsoluteFill>
  );
};
