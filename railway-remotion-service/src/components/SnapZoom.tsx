import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface SnapZoomProps {
  children: React.ReactNode;
  startFrame?: number;
  durationFrames?: number;
  scale?: number;
  focalX?: number;
  focalY?: number;
}

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

/**
 * Safe snap-zoom wrapper for Remotion.
 * Avoids spring()-based NaN crashes by using clamped frame interpolation only.
 */
export const SnapZoom: React.FC<SnapZoomProps> = ({
  children,
  startFrame = 0,
  durationFrames = 12,
  scale = 1.15,
  focalX = 0.5,
  focalY = 0.35,
}) => {
  const frame = useCurrentFrame();

  const safeDurationFrames = Math.max(6, Math.round(toFiniteNumber(durationFrames, 12)));
  const rawStartFrame = toFiniteNumber(startFrame, 0);
  const safeStartFrame =
    rawStartFrame >= 0 && rawStartFrame < safeDurationFrames
      ? Math.round(rawStartFrame)
      : 0;

  const safeScale = Math.max(1, toFiniteNumber(scale, 1.15));
  const safeFocalX = clamp(toFiniteNumber(focalX, 0.5), 0, 1);
  const safeFocalY = clamp(toFiniteNumber(focalY, 0.35), 0, 1);

  const localFrame = Math.max(0, frame - safeStartFrame);

  const peakFrame = Math.max(1, Math.round(safeDurationFrames * 0.3));
  const settleFrame = Math.max(peakFrame + 1, Math.round(safeDurationFrames * 0.65));
  const settleScale = 1 + (safeScale - 1) * 0.45;

  const zoomScale = interpolate(
    localFrame,
    [0, peakFrame, settleFrame, safeDurationFrames],
    [1, safeScale, settleScale, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${zoomScale})`,
          transformOrigin: `${safeFocalX * 100}% ${safeFocalY * 100}%`,
          willChange: "transform",
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
