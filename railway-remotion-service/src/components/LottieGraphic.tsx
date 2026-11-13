/**
 * LottieGraphic — the small animated graphics the AI Editor can drop on a
 * video ("checkmark", "arrow_right", …), by name.
 *
 * 2026-11-13: these used to be hand-made Lottie files played through
 * @remotion/lottie. They never rendered: the import named a `Player` the
 * package doesn't have (every video with one crashed — "React error #130"),
 * and with that fixed the hand-made files still never finished loading, so
 * the render would wait and time out. They are now drawn here as animated
 * SVG — frame-exact, nothing to load, recolored with `accentColor`. The names
 * and props stay the same, so plans and the side panel need no change.
 */

import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig, Easing } from "remotion";

export type LottieName =
  | "checkmark"
  | "loading_spinner"
  | "arrow_right"
  | "trending_up"
  | "scissors_cut"
  | "raw_to_edited"
  | "ai_sparkle";

interface Props {
  /** Built-in graphic name (unknown names show the sparkle). */
  name?: LottieName | string;
  /** Hosted animations aren't supported; kept so old plans still render. */
  url?: string;
  /** Playback speed multiplier (1 = real-time). */
  speed?: number;
  /** Color of the graphic. */
  accentColor?: string;
  /** Whether looping graphics (spinner, sparkle) keep moving. */
  loop?: boolean;
}

const ease = Easing.bezier(0.33, 1, 0.68, 1);

export const LottieGraphic: React.FC<Props> = ({ name, speed = 1, accentColor = "#FFD700", loop = true }) => {
  const raw = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = Number.isFinite(Number(speed)) && Number(speed) > 0 ? Number(speed) : 1;
  const f = raw * s;
  const t = (from: number, to: number) =>
    interpolate(f, [from * fps, to * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const pop = interpolate(f, [0, 0.25 * fps, 0.4 * fps], [0.6, 1.08, 1], { extrapolateRight: "clamp" });
  const color = accentColor || "#FFD700";
  const stroke = { fill: "none", stroke: color, strokeWidth: 8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  // A path that draws itself: pathLength 1, dash offset 1 → 0.
  const draw = (p: number) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - p });

  const key = String(name || "ai_sparkle");
  let body: React.ReactNode;
  switch (key) {
    case "checkmark":
      body = (
        <>
          <circle cx="50" cy="50" r="40" {...stroke} {...draw(t(0, 0.5))} />
          <path d="M30 52 L44 66 L71 36" {...stroke} strokeWidth={9} {...draw(t(0.35, 0.8))} />
        </>
      );
      break;
    case "arrow_right": {
      const nudge = loop ? Math.sin((f / fps) * Math.PI * 2) * 3 * t(0.6, 0.8) : 0;
      body = (
        <g transform={`translate(${nudge} 0)`}>
          <path d="M18 50 L78 50" {...stroke} {...draw(t(0, 0.45))} />
          <path d="M58 30 L80 50 L58 70" {...stroke} {...draw(t(0.3, 0.7))} />
        </g>
      );
      break;
    }
    case "trending_up":
      body = (
        <>
          <path d="M14 80 L86 80" {...stroke} strokeWidth={4} opacity={0.45} {...draw(t(0, 0.3))} />
          <path d="M16 72 L38 50 L54 62 L82 28" {...stroke} {...draw(t(0.15, 0.75))} />
          <path d="M64 26 L84 26 L84 46" {...stroke} {...draw(t(0.6, 0.9))} />
        </>
      );
      break;
    case "loading_spinner": {
      const turn = loop ? (f / fps) * 360 : t(0, 1.2) * 360;
      body = (
        <>
          <circle cx="50" cy="50" r="36" {...stroke} opacity={0.2} />
          <circle cx="50" cy="50" r="36" {...stroke} pathLength={1} strokeDasharray="0.28 0.72" transform={`rotate(${turn} 50 50)`} />
        </>
      );
      break;
    }
    case "scissors_cut": {
      const open = loop ? 12 * Math.abs(Math.sin((f / fps) * Math.PI * 1.5)) : 12 * (1 - t(0.2, 0.6));
      body = (
        <>
          <g transform={`rotate(${-open} 50 50)`}>
            <circle cx="24" cy="34" r="10" {...stroke} strokeWidth={6} />
            <path d="M32 40 L84 66" {...stroke} strokeWidth={6} />
          </g>
          <g transform={`rotate(${open} 50 50)`}>
            <circle cx="24" cy="66" r="10" {...stroke} strokeWidth={6} />
            <path d="M32 60 L84 34" {...stroke} strokeWidth={6} />
          </g>
          <path d="M8 50 L92 50" {...stroke} strokeWidth={3} strokeDasharray="4 6" opacity={0.5 * t(0, 0.4)} />
        </>
      );
      break;
    }
    case "raw_to_edited":
      body = (
        <>
          <path d="M10 62 L16 44 L22 70 L28 38 L34 66 L40 50" {...stroke} strokeWidth={5} opacity={0.55} {...draw(t(0, 0.4))} />
          <path d="M44 50 L56 50 M51 44 L57 50 L51 56" {...stroke} strokeWidth={5} {...draw(t(0.35, 0.6))} />
          <path d="M62 50 C70 36, 80 64, 90 50" {...stroke} strokeWidth={6} {...draw(t(0.55, 0.95))} />
        </>
      );
      break;
    default: {
      // ai_sparkle (and any name we don't know)
      const spin = loop ? (f / fps) * 25 : 0;
      const twinkle = loop ? 0.6 + 0.4 * Math.abs(Math.sin((f / fps) * Math.PI)) : 1;
      const star = (cx: number, cy: number, r: number) =>
        `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`;
      body = (
        <>
          <path d={star(46, 52, 34)} fill={color} transform={`rotate(${spin} 46 52)`} />
          <path d={star(80, 20, 11)} fill={color} opacity={twinkle * t(0.2, 0.5)} />
          <path d={star(82, 78, 7)} fill={color} opacity={(1.6 - twinkle) * t(0.35, 0.65)} />
        </>
      );
    }
  }

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: "100%", height: "100%", overflow: "visible", transform: `scale(${pop})`, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))" }}
    >
      {body}
    </svg>
  );
};
