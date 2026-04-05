import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Video } from "@remotion/media";

interface BrollInsertProps {
  videoUrl: string;
  effects?: {
    zoom?: { type: string; from: number; to: number };
  };
}

/**
 * Renders a B-roll video clip with optional Ken Burns zoom effect.
 * Gets fps from useVideoConfig() — never from props.
 * Uses objectFit prop on <Video> (Remotion 4.x requirement).
 */
export const BrollInsert: React.FC<BrollInsertProps> = ({
  videoUrl,
  effects,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  let scale = 1;
  if (effects?.zoom) {
    scale = interpolate(frame, [0, durationInFrames], [effects.zoom.from, effects.zoom.to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  return (
    <AbsoluteFill>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${scale})`,
          overflow: "hidden",
        }}
      >
        <Video
          src={videoUrl}
          objectFit="cover"
          style={{ width: "100%", height: "100%" }}
          muted
        />
      </div>
    </AbsoluteFill>
  );
};
