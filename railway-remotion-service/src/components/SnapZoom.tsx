import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

interface SnapZoomProps {
  startFrame: number;
  durationFrames: number;
  zoomScale?: number;
  focusX?: number; // 0-1, default 0.5 (center)
  focusY?: number; // 0-1, default 0.5 (center)
  children: React.ReactNode;
}

/**
 * SnapZoom wraps video/image content and applies a quick punch-in zoom effect.
 * Usage: wrap a <Video> or <Img> element inside <SnapZoom>.
 *
 * The zoom snaps in fast (spring) and holds, then eases out before the end.
 *
 * In FullComposition.tsx, apply this to video_segment scenes when
 * effects.zoom.type === "snap_zoom".
 */
export const SnapZoom: React.FC<SnapZoomProps> = ({
  startFrame,
  durationFrames,
  zoomScale = 1.35,
  focusX = 0.5,
  focusY = 0.5,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0 || localFrame > durationFrames) {
    return <>{children}</>;
  }

  // Snap in — fast, punchy spring
  const snapIn = spring({
    frame: localFrame,
    fps,
    config: { damping: 22, stiffness: 300, mass: 0.8 },
  });

  // Ease out — last 10 frames
  const exitStart = durationFrames - 10;
  const easeOut = localFrame > exitStart
    ? interpolate(localFrame, [exitStart, durationFrames], [0, 1], { extrapolateRight: "clamp" })
    : 0;

  const currentScale = interpolate(snapIn, [0, 1], [1, zoomScale]) * (1 - easeOut) + easeOut * 1;

  // Translate toward focus point
  const translateX = interpolate(snapIn, [0, 1], [0, (0.5 - focusX) * 100]) * (1 - easeOut);
  const translateY = interpolate(snapIn, [0, 1], [0, (0.5 - focusY) * 100]) * (1 - easeOut);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${currentScale}) translate(${translateX}%, ${translateY}%)`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SnapZoom;
