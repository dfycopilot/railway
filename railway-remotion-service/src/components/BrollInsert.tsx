import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { Video } from "@remotion/media";

interface BrollInsertProps {
  videoUrl: string;
  effects?: {
    zoom?: { type?: string; from?: number; to?: number };
  };
  /**
   * Frame count for the parent Sequence so Ken Burns interpolates over the
   * scene's actual visible window instead of the whole composition.
   */
  sceneDurationFrames?: number;
}

/**
 * Renders a B-roll video clip layered above the main video.
 * Always muted — the speaker audio continues underneath via ContinuousAudio.
 *
 * Like VideoSegment, the zoom interpolation MUST use the scene's own duration,
 * not `useVideoConfig().durationInFrames`. Using the composition duration was
 * the bug that made every Ken Burns effectively static.
 */
export const BrollInsert: React.FC<BrollInsertProps> = ({
  videoUrl,
  effects,
  sceneDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames: compDuration } = useVideoConfig();

  const sceneDur = Math.max(
    1,
    Number.isFinite(sceneDurationFrames) && (sceneDurationFrames as number) > 0
      ? (sceneDurationFrames as number)
      : compDuration
  );

  let scale = 1;
  if (effects?.zoom) {
    const from = Number.isFinite(effects.zoom.from) ? Number(effects.zoom.from) : 1.05;
    const to = Number.isFinite(effects.zoom.to) ? Number(effects.zoom.to) : 1.0;
    scale = interpolate(frame, [0, sceneDur], [from, to], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else {
    // Default subtle Ken Burns push so static B-roll doesn't feel frozen
    scale = interpolate(frame, [0, sceneDur], [1.06, 1.0], {
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
          transformOrigin: "center center",
          overflow: "hidden",
          willChange: "transform",
        }}
      >
        <Video
          src={videoUrl}
          objectFit="cover"
          style={{ width: "100%", height: "100%" }}
          muted
          volume={0}
        />
      </div>
    </AbsoluteFill>
  );
};
