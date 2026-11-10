// Explainer style kit: the reusable look (fonts, background, section tag,
// caption bar, rising serif headline, slow camera push, tap ripple, phone).
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  Img,
} from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";

const serif = loadSerif("normal", { weights: ["400"], subsets: ["latin"] });
loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
const sans = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });

export const SERIF = serif.fontFamily;
export const SANS = sans.fontFamily;

export type Brand = {
  name: string;
  initials: string;
  primary: string; // main brand color
  accent: string; // highlight color
  phone: string;
  website: string;
  logo_url?: string | null; // the agency's own logo, when it has one
};

// True when rendering a tall (portrait) video.
export const usePortrait = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};

export const LIGHT_BG = "#F3F0EA";
export const DARK_BG = "#1D1B18";
export const INK = "#1D1B18";
export const MUTED = "#6B665E";

export const Stage: React.FC<{ dark?: boolean; children: React.ReactNode }> = ({
  dark,
  children,
}) => (
  <AbsoluteFill
    style={{
      background: dark
        ? `radial-gradient(ellipse at 50% 35%, #2A2723 0%, ${DARK_BG} 70%)`
        : `radial-gradient(ellipse at 50% 30%, #FBFAF7 0%, ${LIGHT_BG} 75%)`,
      fontFamily: SANS,
      color: dark ? "#F5F2EC" : INK,
    }}
  >
    {children}
  </AbsoluteFill>
);

// Slow push-in so nothing ever sits perfectly still.
export const Camera: React.FC<{ children: React.ReactNode; amount?: number }> = ({
  children,
  amount = 0.035,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = interpolate(frame, [0, durationInFrames], [1, 1 + amount], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: "50% 45%" }}>
      {children}
    </AbsoluteFill>
  );
};

export const SectionTag: React.FC<{ label: string; dark?: boolean }> = ({ label, dark }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const o = interpolate(frame, [4, 16], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: P ? 150 : 48,
        left: P ? 60 : 56,
        opacity: o,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderRadius: 8,
        background: dark ? "rgba(255,255,255,0.10)" : "#FFFFFF",
        boxShadow: dark ? "none" : "0 1px 3px rgba(0,0,0,0.10)",
        fontSize: P ? 22 : 18,
        fontWeight: 700,
        letterSpacing: 2,
        color: dark ? "#F5F2EC" : INK,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 4, background: "currentColor" }} />
      {label}
    </div>
  );
};

// Bottom caption bar. Pass several lines with start frames to change mid-scene.
export const Caption: React.FC<{ lines: { at: number; text: string }[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const current = [...lines].reverse().find((l) => frame >= l.at);
  if (!current) return null;
  const local = frame - current.at;
  const o = interpolate(local, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        bottom: P ? 300 : 56,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: o,
      }}
    >
      <div
        style={{
          maxWidth: P ? 940 : 1300,
          background: "rgba(20,19,17,0.82)",
          color: "#FFFFFF",
          fontSize: P ? 40 : 30,
          fontWeight: 500,
          lineHeight: 1.35,
          padding: "12px 26px",
          borderRadius: 10,
          textAlign: "center",
        }}
      >
        {current.text}
      </div>
    </div>
  );
};

// Serif headline whose words rise in one after another. Wrap a word in *stars*
// to set it in italic brand color, like the reference video.
export const Headline: React.FC<{
  text: string;
  size?: number;
  delay?: number;
  accent: string;
  align?: "center" | "left";
  color?: string;
}> = ({ text, size = 110, delay = 0, accent, align = "center", color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div
      style={{
        fontFamily: SERIF,
        fontSize: size,
        lineHeight: 1.05,
        textAlign: align,
        color,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: size * 0.26,
      }}
    >
      {words.map((w, i) => {
        const italic = w.startsWith("*");
        const clean = w.replace(/\*/g, "");
        const p = spring({ frame: frame - delay - i * 3, fps, config: { damping: 200 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${(1 - p) * size * 0.45}px)`,
              fontStyle: italic ? "italic" : "normal",
              color: italic ? accent : undefined,
            }}
          >
            {clean}
          </span>
        );
      })}
    </div>
  );
};

// Fade + rise helper for any block.
export const useRise = (delay: number, distance = 40) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` } as React.CSSProperties;
};

// A finger-tap marker: dot glides to a spot, then a ripple.
export const Tap: React.FC<{
  from: [number, number];
  to: [number, number];
  start: number;
  travel?: number;
}> = ({ from, to, start, travel = 18 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + travel], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const x = from[0] + (to[0] - from[0]) * t;
  const y = from[1] + (to[1] - from[1]) * t;
  const appear = interpolate(frame, [start - 8, start], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const press = frame - (start + travel);
  const ring = interpolate(press, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const leave = interpolate(press, [20, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const squash = press >= 0 && press < 6 ? 0.82 : 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: appear * leave, pointerEvents: "none" }}>
      {press >= 0 && (
        <div
          style={{
            position: "absolute",
            left: -40 * ring,
            top: -40 * ring,
            width: 80 * ring,
            height: 80 * ring,
            borderRadius: "50%",
            border: "3px solid rgba(29,27,24,0.45)",
            opacity: 1 - ring,
            transform: "translate(0,0)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: -22,
          top: -22,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(29,27,24,0.28)",
          border: "3px solid rgba(255,255,255,0.9)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          transform: `scale(${squash})`,
        }}
      />
    </div>
  );
};

// Simple modern phone frame.
export const Phone: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      width: 420,
      height: 860,
      borderRadius: 64,
      background: "#111",
      padding: 14,
      boxShadow: "0 40px 80px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.15)",
      ...style,
    }}
  >
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: 52,
        background: "#FFFFFF",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          marginLeft: -60,
          width: 120,
          height: 34,
          borderRadius: 20,
          background: "#111",
          zIndex: 2,
        }}
      />
      {children}
    </div>
  </div>
);

export const Logo: React.FC<{ brand: Brand; size?: number }> = ({ brand, size = 96 }) => {
  // A logo that won't load falls back to the initials instead of stopping the render.
  const [broken, setBroken] = React.useState(false);
  return brand.logo_url && !broken ? (
    // The agency's own logo on a white tile so any logo reads on any background.
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: size * 0.12,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      <Img
        src={brand.logo_url}
        onError={() => setBroken(true)}
        maxRetries={1}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
      />
    </div>
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: brand.primary,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SERIF,
        fontSize: size * 0.48,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      {brand.initials}
    </div>
  );
};
