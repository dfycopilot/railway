/**
 * LightLeak — Animated color bleed / lens flare effect.
 * Adds warm or cool light leaks that drift across the frame.
 */
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface Props {
  color?: string; // "warm", "cool", "purple", or hex
  opacity?: number;
}

const colorPresets: Record<string, string[]> = {
  warm: ["rgba(255, 180, 50, 0.3)", "rgba(255, 100, 50, 0.2)", "rgba(255, 200, 100, 0.15)"],
  cool: ["rgba(50, 150, 255, 0.25)", "rgba(100, 200, 255, 0.2)", "rgba(50, 100, 200, 0.15)"],
  purple: ["rgba(200, 50, 255, 0.25)", "rgba(150, 50, 200, 0.2)", "rgba(255, 100, 200, 0.15)"],
};

export const LightLeak: React.FC<Props> = ({ color = "warm", opacity = 0.15 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const colors = colorPresets[color] ?? colorPresets.warm;
  const time = frame / fps;

  // Slow drifting movement
  const x1 = Math.sin(time * 0.3) * 400 + width * 0.3;
  const y1 = Math.cos(time * 0.2) * 200 + height * 0.2;
  const x2 = Math.cos(time * 0.4) * 300 + width * 0.7;
  const y2 = Math.sin(time * 0.25) * 250 + height * 0.6;

  // Pulsing opacity
  const pulse = 0.7 + Math.sin(time * 0.8) * 0.3;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      opacity: opacity * pulse,
      mixBlendMode: "screen",
      background: `
        radial-gradient(ellipse 600px 400px at ${x1}px ${y1}px, ${colors[0]}, transparent),
        radial-gradient(ellipse 500px 350px at ${x2}px ${y2}px, ${colors[1]}, transparent),
        radial-gradient(ellipse 800px 500px at ${width * 0.5}px ${height * 0.3}px, ${colors[2]}, transparent)
      `,
      pointerEvents: "none",
    }} />
  );
};
