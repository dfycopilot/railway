/**
 * FilmGrain — Subtle animated noise texture overlay.
 * Uses CSS-based noise pattern (no external assets needed).
 */
import { useCurrentFrame } from "remotion";

interface Props {
  intensity?: number; // 0.0 - 1.0
}

export const FilmGrain: React.FC<Props> = ({ intensity = 0.1 }) => {
  const frame = useCurrentFrame();

  // Shift the noise pattern each frame for animation effect
  const seed = frame * 1.7;
  const bgPos = `${(seed * 13) % 200}px ${(seed * 7) % 200}px`;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      opacity: intensity,
      mixBlendMode: "overlay",
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundPosition: bgPos,
      pointerEvents: "none",
    }} />
  );
};
