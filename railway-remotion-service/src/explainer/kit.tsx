// Explainer style kit: the reusable pieces (stage + background texture, scene
// picture, section tag, caption, animated headline, item entrances, camera
// push, tap ripple, phone, logo). Since 2026-11-11 every piece draws from the
// video's look (theme.ts) through LookContext, so one scene library makes six
// built-in looks — and any look a user describes — feel different.
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Palette, Theme, LOOKS, contrast, fontFamily, lum, mix, onColor, resolve } from "./theme";

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

// ── the look in use ────────────────────────────────────────────────────────
export type Look = {
  theme: Theme;
  brand: Brand;
  dark: boolean; // this scene uses the dark palette (or sits on a picture)
  pal: Palette; // resolved colors for this scene
  head: string; // headline font family
  body: string; // body font family
  picture: boolean; // a full-bleed picture is behind this scene
};

const defaultLook = (): Look => {
  const theme = LOOKS.editorial;
  const brand: Brand = { name: "", initials: "", primary: "#1F4E79", accent: "#C8761E", phone: "", website: "" };
  return { theme, brand, dark: false, pal: theme.light, head: "serif", body: "sans-serif", picture: false };
};

const LookContext = React.createContext<Look | null>(null);
export const useLook = (): Look => React.useContext(LookContext) ?? defaultLook();

export function makeLook(theme: Theme, brand: Brand, dark: boolean, picture: boolean): Look {
  const raw = dark || picture ? theme.dark : theme.light;
  let pal: Palette = {
    bg: resolve(raw.bg, brand),
    ink: resolve(raw.ink, brand),
    muted: resolve(raw.muted, brand),
    surface: resolve(raw.surface, brand),
    line: resolve(raw.line, brand),
  };
  // On a brand-colored stage the text must still read, whatever the brand color.
  if (raw.bg === "@primary" || raw.bg === "@accent") {
    const ink = onColor(pal.bg);
    pal = { ...pal, ink, muted: mix(ink, pal.bg, 0.25) };
  }
  // A picture scene sits on a darkened photo (and a near-black stage if the
  // photo won't load), so its words are always white.
  if (picture) pal = { ...pal, bg: "#121212", ink: "#FFFFFF", muted: "#E8E8E8" };
  // Any look (custom ones especially) keeps its words readable on its stage.
  if (contrast(pal.ink, pal.bg) < 4.5) {
    const ink = onColor(pal.bg);
    pal = { ...pal, ink, muted: mix(ink, pal.bg, 0.3) };
  } else if (contrast(pal.muted, pal.bg) < 3) {
    pal = { ...pal, muted: mix(pal.ink, pal.bg, 0.3) };
  }
  return { theme, brand, dark: dark || picture, pal, head: fontFamily(theme.head), body: fontFamily(theme.body), picture };
}

export const LookProvider: React.FC<{ look: Look; children: React.ReactNode }> = ({ look, children }) => (
  <LookContext.Provider value={look}>{children}</LookContext.Provider>
);

/** A brand color that still shows on this scene's background: the color itself,
 *  else the other brand color, else the text color (e.g. blue checks on a
 *  blue stage in the Bright look). */
export const visible = (L: Look, c: string): string => {
  const ratio = (x: string) => {
    const a = lum(x) + 0.05;
    const b = lum(L.pal.bg) + 0.05;
    return Math.max(a, b) / Math.min(a, b);
  };
  const far = (x: string) => ratio(x) >= 1.7;
  if (far(c)) return c;
  const other = c === L.brand.accent ? L.brand.primary : L.brand.accent;
  return far(other) ? other : L.pal.ink;
};

// Text on a card (cards are light in most looks, even on a dark scene).
export const surfaceInk = (L: Look) => (contrast(L.pal.ink, L.pal.surface) >= 4.5 ? L.pal.ink : onColor(L.pal.surface));
export const surfaceMuted = (L: Look) => mix(surfaceInk(L), L.pal.surface, 0.4);

/** A card's box: background, corners, shadow or outline, per the look. */
export const cardStyle = (L: Look): React.CSSProperties => {
  const t = L.theme;
  const ink = surfaceInk(L);
  const base: React.CSSProperties = { background: L.pal.surface, borderRadius: t.radius, color: ink };
  if (t.shadow === "soft") return { ...base, boxShadow: "0 30px 60px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)" };
  if (t.shadow === "hard") return { ...base, boxShadow: `10px 10px 0 ${L.brand.accent}`, border: `3px solid ${ink}` };
  if (t.shadow === "outline") return { ...base, border: `2px solid ${L.pal.line}` };
  return base;
};

// ── stage + background ─────────────────────────────────────────────────────
const Texture: React.FC = () => {
  const L = useLook();
  const frame = useCurrentFrame();
  const ink = L.pal.ink;
  const faint = (a: number) => `${mix(L.pal.bg, ink, a)}`;
  const drift = frame * 0.15;
  switch (L.theme.texture) {
    case "dots":
      return (
        <AbsoluteFill
          style={{
            backgroundImage: `radial-gradient(${faint(0.12)} 2.5px, transparent 2.5px)`,
            backgroundSize: "44px 44px",
            backgroundPosition: `${drift}px ${drift}px`,
          }}
        />
      );
    case "grid":
      return (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${faint(0.06)} 1px, transparent 1px), linear-gradient(90deg, ${faint(0.06)} 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
            backgroundPosition: `0 ${drift}px`,
          }}
        />
      );
    case "lines":
      return (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(transparent 46px, ${faint(0.1)} 47px, transparent 48px)`,
            backgroundSize: "100% 48px",
          }}
        >
          <div style={{ position: "absolute", top: 0, bottom: 0, left: 110, width: 2, background: mix(L.pal.bg, L.brand.accent, 0.35) }} />
        </AbsoluteFill>
      );
    case "paper":
      return <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 20%, ${faint(0.03)} 0%, transparent 60%)` }} />;
    case "stripes":
      return (
        <AbsoluteFill
          style={{
            backgroundImage: `repeating-linear-gradient(135deg, ${faint(0.035)} 0 14px, transparent 14px 28px)`,
          }}
        />
      );
    case "halftone":
      return (
        <AbsoluteFill
          style={{
            backgroundImage: `radial-gradient(${mix(L.pal.bg, L.brand.accent, 0.22)} 3px, transparent 3.5px)`,
            backgroundSize: "26px 26px",
            maskImage: "linear-gradient(135deg, black 0%, transparent 55%)",
            WebkitMaskImage: "linear-gradient(135deg, black 0%, transparent 55%)",
          }}
        />
      );
    case "glow":
      return (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at 50% 30%, ${L.dark ? mix(L.pal.bg, "#FFFFFF", 0.07) : mix(L.pal.bg, "#FFFFFF", 0.6)} 0%, transparent 70%)`,
          }}
        />
      );
    default:
      return null;
  }
};

/** A scene picture behind everything: slow drift + zoom, darkened for text. */
const Picture: React.FC<{ url: string }> = ({ url }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const L = useLook();
  const s = interpolate(frame, [0, durationInFrames], [1.06, 1.16], { extrapolateRight: "clamp" });
  const x = interpolate(frame, [0, durationInFrames], [-1.5, 1.5], { extrapolateRight: "clamp" });
  const [broken, setBroken] = React.useState(false);
  if (broken) return null;
  return (
    <AbsoluteFill>
      <Img
        src={url}
        onError={() => setBroken(true)}
        maxRetries={2}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${s}) translateX(${x}%)` }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${mix("#000000", L.brand.primary, 0.25)}99 0%, #000000B3 55%, #000000D9 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const Stage: React.FC<{ children: React.ReactNode; image?: string | null }> = ({ children, image }) => {
  const L = useLook();
  return (
    <AbsoluteFill style={{ background: L.pal.bg, fontFamily: L.body, color: L.pal.ink }}>
      {image ? <Picture url={image} /> : <Texture />}
      {children}
    </AbsoluteFill>
  );
};

// Slow push-in so nothing ever sits perfectly still.
export const Camera: React.FC<{ children: React.ReactNode; amount?: number }> = ({ children, amount }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const L = useLook();
  const a = amount ?? L.theme.camera;
  const s = interpolate(frame, [0, durationInFrames], [1, 1 + a], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: "50% 45%" }}>{children}</AbsoluteFill>;
};

// ── section tag ────────────────────────────────────────────────────────────
export const SectionTag: React.FC<{ label: string }> = ({ label }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const L = useLook();
  const o = interpolate(frame, [4, 16], [0, 1], { extrapolateRight: "clamp" });
  const x = interpolate(frame, [4, 16], [-30, 0], { extrapolateRight: "clamp" });
  const pos: React.CSSProperties = {
    position: "absolute",
    top: P ? 150 : 48,
    left: P ? 60 : 56,
    opacity: o,
    transform: `translateX(${x}px)`,
    fontSize: P ? 22 : 18,
    fontWeight: 700,
    letterSpacing: 2,
    fontFamily: L.body,
  };
  switch (L.theme.tag) {
    case "bar":
      return (
        <div style={{ ...pos, background: L.brand.primary, color: onColor(L.brand.primary), padding: "10px 22px", borderLeft: `10px solid ${L.brand.accent}` }}>
          {label}
        </div>
      );
    case "underline":
      return (
        <div style={{ ...pos, color: L.pal.ink, paddingBottom: 8, borderBottom: `4px solid ${L.brand.accent}` }}>{label}</div>
      );
    case "stamp":
      return (
        <div
          style={{
            ...pos,
            color: L.brand.accent,
            border: `3px solid ${L.brand.accent}`,
            padding: "8px 18px",
            transform: `translateX(${x}px) rotate(-3deg)`,
          }}
        >
          {label}
        </div>
      );
    default:
      return (
        <div
          style={{
            ...pos,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            borderRadius: 8,
            background: L.dark ? "rgba(255,255,255,0.10)" : "#FFFFFF",
            boxShadow: L.dark ? "none" : "0 1px 3px rgba(0,0,0,0.10)",
            color: L.pal.ink,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 4, background: L.brand.accent }} />
          {label}
        </div>
      );
  }
};

// ── caption ────────────────────────────────────────────────────────────────
// Pass several lines with start frames to change mid-scene.
export const Caption: React.FC<{ lines: { at: number; text: string }[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const L = useLook();
  const current = [...lines].reverse().find((l) => frame >= l.at);
  if (!current) return null;
  const local = frame - current.at;
  const o = interpolate(local, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const size = P ? 40 : 30;
  const box: React.CSSProperties = {
    maxWidth: P ? 940 : 1300,
    fontSize: size,
    fontWeight: 600,
    lineHeight: 1.35,
    textAlign: "center",
    fontFamily: L.body,
  };
  let inner: React.ReactNode;
  switch (L.theme.caption) {
    case "pill":
      inner = (
        <div style={{ ...box, background: visible(L, L.brand.primary), color: onColor(visible(L, L.brand.primary)), padding: "12px 30px", borderRadius: 999 }}>
          {current.text}
        </div>
      );
      break;
    case "highlight":
      inner = (
        <div style={{ ...box, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
          <span
            style={{
              background: L.brand.accent,
              color: onColor(L.brand.accent),
              padding: "6px 14px",
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
              lineHeight: 1.6,
            }}
          >
            {current.text}
          </span>
        </div>
      );
      break;
    case "plain":
      inner = (
        <div
          style={{
            ...box,
            color: L.pal.ink,
            textShadow: L.dark ? "0 2px 8px rgba(0,0,0,0.6)" : "0 1px 0 rgba(255,255,255,0.8)",
            fontSize: size * 1.1,
          }}
        >
          {current.text}
        </div>
      );
      break;
    case "block":
      inner = (
        <div style={{ ...box, display: "flex", alignItems: "stretch", textAlign: "left" }}>
          <div style={{ background: L.brand.accent, color: onColor(L.brand.accent), padding: "12px 16px", fontWeight: 800 }}>▶</div>
          <div style={{ background: "#FFFFFF", color: "#0B1220", padding: "12px 22px" }}>{current.text}</div>
        </div>
      );
      break;
    default:
      inner = (
        <div style={{ ...box, fontWeight: 500, background: "rgba(20,19,17,0.82)", color: "#FFFFFF", padding: "12px 26px", borderRadius: 10 }}>
          {current.text}
        </div>
      );
  }
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
        transform: `translateY(${(1 - o) * 10}px)`,
      }}
    >
      {inner}
    </div>
  );
};

// ── headline ───────────────────────────────────────────────────────────────
// Words come in one after another, in the look's style. Wrap a word in *stars*
// to set it in the accent color.
export const Headline: React.FC<{
  text: string;
  size?: number;
  delay?: number;
  align?: "center" | "left";
  color?: string;
}> = ({ text, size = 110, delay = 0, align = "center", color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLook();
  const t = L.theme;
  const sz = Math.round(size * t.headScale * (t.headUpper ? 0.82 : 1));
  const words = (text || "").split(" ").filter(Boolean);
  let shown = 0; // for "type": letters revealed so far
  const letterRate = 1.6; // letters per frame
  const totalLetters = Math.max(0, (frame - delay) * letterRate);
  return (
    <div
      style={{
        fontFamily: L.head,
        fontWeight: t.headWeight,
        fontSize: sz,
        lineHeight: t.headUpper ? 1.0 : 1.08,
        letterSpacing: t.tracking,
        textTransform: t.headUpper ? "uppercase" : "none",
        textAlign: align,
        color: color ?? L.pal.ink,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        columnGap: sz * 0.26,
      }}
    >
      {words.map((w, i) => {
        const starred = w.includes("*");
        const clean = w.replace(/\*/g, "");
        const style: React.CSSProperties = {
          display: "inline-block",
          fontStyle: starred && t.headItalicAccent ? "italic" : "normal",
          color: starred ? L.brand.accent : undefined,
        };
        if (starred && t.accentFill) {
          Object.assign(style, {
            color: onColor(L.brand.accent),
            background: L.brand.accent,
            padding: `0 ${sz * 0.12}px`,
            borderRadius: Math.min(t.radius, 12),
          });
        }
        const p = spring({ frame: frame - delay - i * 3, fps, config: { damping: t.headlineIn === "pop" ? 11 : 200 } });
        switch (t.headlineIn) {
          case "pop":
            Object.assign(style, { opacity: Math.min(1, p * 1.5), transform: `scale(${0.4 + 0.6 * p})` });
            break;
          case "slide":
            Object.assign(style, { opacity: p, transform: `translateX(${(1 - p) * sz * 0.8}px)` });
            break;
          case "blur":
            Object.assign(style, { opacity: p, filter: `blur(${(1 - p) * 14}px)`, transform: `scale(${1.15 - 0.15 * p})` });
            break;
          case "type": {
            const start = shown;
            shown += clean.length + 1;
            const n = Math.max(0, Math.min(clean.length, Math.floor(totalLetters - start)));
            return (
              <span key={i} style={style}>
                <span>{clean.slice(0, n)}</span>
                <span style={{ opacity: 0 }}>{clean.slice(n)}</span>
              </span>
            );
          }
          default:
            Object.assign(style, { opacity: p, transform: `translateY(${(1 - p) * sz * 0.45}px)` });
        }
        return (
          <span key={i} style={style}>
            {clean}
          </span>
        );
      })}
    </div>
  );
};

/** "*word*" → accent color inline (for small headings that don't animate per word). */
export const Starred: React.FC<{ text: string }> = ({ text }) => {
  const L = useLook();
  return (
    <>
      {(text || "").split(/(\*[^*]+\*)/g).map((part, i) =>
        part.startsWith("*") && part.endsWith("*") ? (
          <span key={i} style={{ fontStyle: L.theme.headItalicAccent ? "italic" : "normal", color: L.brand.accent }}>
            {part.slice(1, -1)}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};

// Fade + rise helper for any block.
export const useRise = (delay: number, distance = 40) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` } as React.CSSProperties;
};

/** How a card / list item comes in, per the look. `index` staggers tilt. */
export const useItemIn = (delay: number, index = 0): React.CSSProperties => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLook();
  const t = L.theme;
  const tilt = t.tilt ? (index % 2 === 0 ? t.tilt : -t.tilt) : 0;
  const bouncy = t.itemIn === "pop" || t.itemIn === "flip";
  const p = spring({ frame: frame - delay, fps, config: bouncy ? { damping: 14, mass: 0.8 } : { damping: 200 } });
  const o = Math.min(1, p * 1.4);
  switch (t.itemIn) {
    case "pop":
      return { opacity: o, transform: `scale(${0.5 + 0.5 * p}) rotate(${tilt}deg)` };
    case "slide":
      return { opacity: o, transform: `translateX(${(1 - p) * -160}px) rotate(${tilt}deg)` };
    case "flip":
      return { opacity: o, transform: `perspective(1400px) translateY(${(1 - p) * 140}px) rotateX(${(1 - p) * 18}deg) rotate(${tilt}deg)` };
    default:
      return { opacity: o, transform: `translateY(${(1 - p) * 60}px) rotate(${tilt}deg)` };
  }
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
  const appear = interpolate(frame, [start - 8, start], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const press = frame - (start + travel);
  const ring = interpolate(press, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const leave = interpolate(press, [20, 30], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
export const Phone: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
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
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 52, background: "#FFFFFF", overflow: "hidden", color: "#1D1B18" }}>
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
  const L = useLook();
  return brand.logo_url && !broken ? (
    // The agency's own logo on a white tile so any logo reads on any background.
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.min(size * 0.24, L.theme.radius + 8),
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
        borderRadius: Math.min(size * 0.24, L.theme.radius + 8),
        background: visible(L, brand.primary),
        color: onColor(visible(L, brand.primary)),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: L.head,
        fontWeight: L.theme.headWeight,
        fontSize: size * 0.44,
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      {brand.initials}
    </div>
  );
};
