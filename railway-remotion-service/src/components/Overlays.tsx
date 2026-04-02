import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface OverlaysProps {
  config: {
    corner_brackets?: { enabled: boolean; color?: string };
    vignette?: { intensity?: number };
    film_grain?: { intensity?: number };
    light_leak?: { color?: string; intensity?: number };
  };
}

/**
 * Persistent visual overlays rendered on top of all scenes.
 * Corner brackets, vignette, film grain, and light leaks.
 */
export const Overlays: React.FC<OverlaysProps> = ({ config }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Vignette */}
      {config.vignette && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${config.vignette.intensity ?? 0.4}) 100%)`,
          }}
        />
      )}

      {/* Corner brackets */}
      {config.corner_brackets?.enabled && (
        <CornerBrackets color={config.corner_brackets.color || "#D4A843"} />
      )}

      {/* Film grain overlay */}
      {config.film_grain && (
        <AbsoluteFill
          style={{
            opacity: config.film_grain.intensity ?? 0.08,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: "256px 256px",
            mixBlendMode: "overlay",
          }}
        />
      )}

      {/* Light leak */}
      {config.light_leak && (
        <LightLeakOverlay
          color={config.light_leak.color || "warm"}
          intensity={config.light_leak.intensity ?? 0.1}
          frame={frame}
          totalFrames={durationInFrames}
        />
      )}
    </AbsoluteFill>
  );
};

const CornerBrackets: React.FC<{ color: string }> = ({ color }) => {
  const size = 60;
  const thickness = 3;
  const margin = 40;
  const bracketStyle = {
    position: "absolute" as const,
    width: size,
    height: size,
  };

  return (
    <AbsoluteFill>
      {/* Top-left */}
      <div style={{ ...bracketStyle, top: margin, left: margin, borderTop: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }} />
      {/* Top-right */}
      <div style={{ ...bracketStyle, top: margin, right: margin, borderTop: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }} />
      {/* Bottom-left */}
      <div style={{ ...bracketStyle, bottom: margin, left: margin, borderBottom: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }} />
      {/* Bottom-right */}
      <div style={{ ...bracketStyle, bottom: margin, right: margin, borderBottom: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }} />
    </AbsoluteFill>
  );
};

const LightLeakOverlay: React.FC<{
  color: string;
  intensity: number;
  frame: number;
  totalFrames: number;
}> = ({ color, intensity, frame, totalFrames }) => {
  const colorMap: Record<string, string> = {
    warm: "rgba(255, 180, 50, VAL)",
    cool: "rgba(100, 150, 255, VAL)",
    pink: "rgba(255, 100, 150, VAL)",
  };
  const baseColor = colorMap[color] || colorMap.warm;

  // Subtle pulsing light leak
  const pulse = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [intensity * 0.3, intensity],
  );

  const x = interpolate(frame, [0, totalFrames], [-20, 120], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at ${x}% 30%, ${baseColor.replace("VAL", String(pulse))}, transparent 70%)`,
        mixBlendMode: "screen",
      }}
    />
  );
};
