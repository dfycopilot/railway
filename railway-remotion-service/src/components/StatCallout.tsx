import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { getOverlayScale } from "./aspectSafe";

interface StatCalloutProps {
  startFrame: number;
  durationFrames: number;
  value: string;
  label: string;
  color?: string;
  position?: "center" | "left" | "right";
}

export const StatCallout: React.FC<StatCalloutProps> = ({
  startFrame,
  durationFrames,
  value,
  label,
  color = "#FFD700",
  position = "center",
}) => {
  const frame = useCurrentFrame();
  const { fps, width: compWidth } = useVideoConfig();
  const scale = getOverlayScale(compWidth);
  const localFrame = frame - startFrame;

  if (localFrame < 0 || localFrame > durationFrames) return null;

  const enterProgress = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 180, mass: 1 },
  });

  const exitStart = durationFrames - 15;
  const exitOpacity = localFrame > exitStart
    ? interpolate(localFrame, [exitStart, durationFrames], [1, 0], { extrapolateRight: "clamp" })
    : 1;

  const animScale = interpolate(enterProgress, [0, 1], [0.3, 1]);
  const opacity = enterProgress * exitOpacity;

  const counterProgress = interpolate(localFrame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  const numericValue = parseFloat(value.replace(/[^0-9.]/g, ""));
  const prefix = value.replace(/[0-9.,]+.*/, "");
  const suffix = value.replace(/.*[0-9.,]/, "");
  const displayNum = isNaN(numericValue)
    ? value
    : `${prefix}${Math.round(numericValue * counterProgress).toLocaleString()}${suffix}`;

  const positionStyle: React.CSSProperties =
    position === "left"
      ? { left: "10%", top: "50%", transform: `translateY(-50%) scale(${animScale})` }
      : position === "right"
      ? { right: "10%", top: "50%", transform: `translateY(-50%) scale(${animScale})` }
      : { left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${animScale})` };

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(12px)",
          borderRadius: Math.round(16 * scale),
          padding: `${Math.round(24 * scale)}px ${Math.round(48 * scale)}px`,
          border: `2px solid ${color}`,
          boxShadow: `0 0 40px ${color}44, 0 8px 32px rgba(0,0,0,0.5)`,
          textAlign: "center",
          maxWidth: "78%",
        }}
      >
        <div
          style={{
            fontFamily: "Oswald, sans-serif",
            fontWeight: 700,
            fontSize: Math.round(72 * scale),
            color,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            wordBreak: "break-word",
          }}
        >
          {displayNum}
        </div>
        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: Math.round(22 * scale),
            color: "#FFFFFF",
            marginTop: Math.round(8 * scale),
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            opacity: 0.85,
            wordBreak: "break-word",
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
};

export default StatCallout;
