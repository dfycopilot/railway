import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { getOverlayScale } from "./aspectSafe";
import { GlassCard } from "./GlassCard";

interface StatCalloutProps {
  startFrame: number;
  durationFrames: number;
  value: string;
  label: string;
  color?: string;
  position?: "center" | "left" | "right";
  aesthetic?: "default" | "glass";
}

export const StatCallout: React.FC<StatCalloutProps> = ({
  startFrame,
  durationFrames,
  value,
  label,
  color = "#FFD700",
  position = "center",
  aesthetic = "default",
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

  // Count up only a plain number ("$325", "8 sprays", "45%"). Anything else —
  // a rule or a phrase — shows as written. (The old split also dropped words
  // after a number: "Lasts 8 hours." showed "Lasts 8".)
  const numMatch = /^(\D{0,3}?)(\d[\d,]*(?:\.\d+)?)(\D{0,14})$/.exec(value.trim());
  const displayNum = numMatch
    ? `${numMatch[1]}${Math.round(parseFloat(numMatch[2].replace(/,/g, "")) * counterProgress).toLocaleString()}${numMatch[3]}`
    : value;

  // Big on a phone, smaller as the text gets longer, never broken mid-word
  // (2026-11-13: "impressio / ns", "SPRAY / S" — the box was squeezed into
  // half the screen because it was centered from the middle).
  const len = value.trim().length;
  const valueSize = Math.round((len <= 6 ? 140 : len <= 12 ? 116 : len <= 22 ? 96 : 80) * scale);
  const labelSize = Math.round(34 * scale);
  const noBreak: React.CSSProperties = { wordBreak: "normal", overflowWrap: "normal", hyphens: "none", whiteSpace: "normal" };

  // The lane the box sits in: most of the screen width for the center,
  // a wide side lane for left/right. The box itself fits its text inside it.
  const lane: React.CSSProperties =
    position === "left"
      ? { left: "5%", width: "62%", top: "50%", justifyContent: "flex-start" }
      : position === "right"
      ? { right: "5%", width: "62%", top: "50%", justifyContent: "flex-end" }
      : { left: "7%", right: "7%", top: "50%", justifyContent: "center" };
  const positionStyle: React.CSSProperties = {
    ...lane,
    transform: `translateY(-50%) scale(${animScale})`,
    transformOrigin: position === "left" ? "left center" : position === "right" ? "right center" : "center center",
  };

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        opacity,
        display: "flex",
        zIndex: 50,
      }}
    >
      {aesthetic === "glass" ? (
        <GlassCard
          tone="dark"
          accentColor={color}
          radius={Math.round(20 * scale)}
          padding={`${Math.round(28 * scale)}px ${Math.round(52 * scale)}px`}
          style={{ maxWidth: "100%", textAlign: "center" }}
        >
          <div
            style={{
              fontFamily: "Oswald, sans-serif",
              fontWeight: 700,
              fontSize: valueSize,
              color,
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              ...noBreak,
            }}
          >
            {displayNum}
          </div>
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: labelSize,
              color: "#FFFFFF",
              marginTop: Math.round(12 * scale),
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              opacity: 0.9,
              ...noBreak,
            }}
          >
            {label}
          </div>
        </GlassCard>
      ) : (
        <div
          style={{
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(12px)",
            borderRadius: Math.round(16 * scale),
            padding: `${Math.round(28 * scale)}px ${Math.round(44 * scale)}px`,
            border: `2px solid ${color}`,
            boxShadow: `0 0 40px ${color}44, 0 8px 32px rgba(0,0,0,0.5)`,
            textAlign: "center",
            maxWidth: "100%",
          }}
        >
          <div
            style={{
              fontFamily: "Oswald, sans-serif",
              fontWeight: 700,
              fontSize: valueSize,
              color,
              lineHeight: 1.05,
              letterSpacing: "-0.01em",
              ...noBreak,
            }}
          >
            {displayNum}
          </div>
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: labelSize,
              color: "#FFFFFF",
              marginTop: Math.round(12 * scale),
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              opacity: 0.85,
              ...noBreak,
            }}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatCallout;
