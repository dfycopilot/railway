import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface OverlayConfig {
  corner_brackets?: { enabled: boolean; color?: string };
  vignette?: { enabled?: boolean; intensity?: number };
  film_grain?: { enabled?: boolean; intensity?: number };
  light_leak?: { enabled?: boolean; color?: string; intensity?: number };
  scan_lines?: { enabled?: boolean; intensity?: number };
  letterbox?: { enabled?: boolean; size?: number };
  chromatic_aberration?: { enabled?: boolean; intensity?: number };
  halftone?: { enabled?: boolean; intensity?: number };
  duotone?: { enabled?: boolean; color1?: string; color2?: string };
  noise?: { enabled?: boolean; intensity?: number };
  soft_glow?: { enabled?: boolean; intensity?: number };
}

interface OverlaysProps {
  config: OverlayConfig;
}

/**
 * Persistent visual overlays rendered on top of all scenes.
 * Corner brackets, vignette, film grain, light leaks, scan lines,
 * letterbox, chromatic aberration, halftone, duotone, noise, soft glow.
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

      {/* Scan lines (CRT retro texture) */}
      {config.scan_lines?.enabled && (
        <AbsoluteFill
          style={{
            opacity: config.scan_lines.intensity ?? 0.08,
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
            backgroundSize: "100% 4px",
            mixBlendMode: "multiply",
          }}
        />
      )}

      {/* Letterbox (cinematic black bars) */}
      {config.letterbox?.enabled && (
        <LetterboxOverlay size={config.letterbox.size ?? 0.05} />
      )}

      {/* Chromatic aberration (RGB split) */}
      {config.chromatic_aberration?.enabled && (
        <ChromaticAberrationOverlay intensity={config.chromatic_aberration.intensity ?? 0.06} />
      )}

      {/* Halftone dot pattern */}
      {config.halftone?.enabled && (
        <AbsoluteFill
          style={{
            opacity: config.halftone.intensity ?? 0.15,
            backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.4) 1px, transparent 1px)`,
            backgroundSize: "6px 6px",
            mixBlendMode: "multiply",
          }}
        />
      )}

      {/* Duotone color wash */}
      {config.duotone?.enabled && (
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, ${config.duotone.color1 ?? "#001848"}, ${config.duotone.color2 ?? "#FFD700"})`,
            mixBlendMode: "color",
            opacity: 0.4,
          }}
        />
      )}

      {/* Noise / static grain */}
      {config.noise?.enabled && (
        <AbsoluteFill
          style={{
            opacity: config.noise.intensity ?? 0.06,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.8' numOctaves='5' seed='${frame % 60}' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "512px 512px",
            mixBlendMode: "overlay",
          }}
        />
      )}

      {/* Soft glow / bloom */}
      {config.soft_glow?.enabled && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at 50% 40%, rgba(255,255,255,${config.soft_glow.intensity ?? 0.2}), transparent 70%)`,
            mixBlendMode: "soft-light",
          }}
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
      <div style={{ ...bracketStyle, top: margin, left: margin, borderTop: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }} />
      <div style={{ ...bracketStyle, top: margin, right: margin, borderTop: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }} />
      <div style={{ ...bracketStyle, bottom: margin, left: margin, borderBottom: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }} />
      <div style={{ ...bracketStyle, bottom: margin, right: margin, borderBottom: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }} />
    </AbsoluteFill>
  );
};

const LetterboxOverlay: React.FC<{ size: number }> = ({ size }) => {
  const barHeight = `${size * 100}%`;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: barHeight, background: "#000" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: barHeight, background: "#000" }} />
    </AbsoluteFill>
  );
};

const ChromaticAberrationOverlay: React.FC<{ intensity: number }> = ({ intensity }) => {
  const offset = Math.round(intensity * 100);
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      <AbsoluteFill
        style={{
          background: "rgba(255,0,0,0.04)",
          transform: `translate(${offset}px, 0)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "rgba(0,0,255,0.04)",
          transform: `translate(-${offset}px, 0)`,
        }}
      />
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
