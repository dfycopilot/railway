// Social video scenes (2026-11-12): the Promo, Quick Tip, Announcement and
// Meet Your Agent videos. Fast, bold, words on screen from the first frame,
// readable with the sound off — and still drawn in the video's look (kit.tsx
// useLook): fonts, brand colors and palette all come from the look.
//
// Portrait safe area: words live between y≈140 and y≈1280; the word-by-word
// caption sits at y≈1330–1480 and the bottom ~300 px belong to the app's own
// buttons. Landscape: content above y≈920, caption along the bottom.
import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import {
  Caption,
  Camera,
  Headline,
  Logo,
  LookProvider,
  Stage,
  cardStyle,
  heavy,
  makeLook,
  mediaSrc,
  useLook,
  usePortrait,
  useRise,
  visible,
  vlen,
} from "./kit";
import { contrast, mix, onColor } from "./theme";
import type {
  DateScene,
  EndScene,
  HookScene,
  MediaKind,
  MediaScene,
  ProfileScene,
  QuoteScene,
  Scene,
  ScreenScene,
  StampsScene,
  TipScene,
} from "./spec";

// ── helpers ─────────────────────────────────────────────────────────────────
const cueOf = (s: Scene, i: number, spread = 20, first = 24) => {
  const c = s.cues?.[i];
  return typeof c === "number" && Number.isFinite(c) ? Math.max(0, c - 6) : first + i * spread;
};
const variantOf = (s: Scene, n: number) => {
  const v = Math.floor(Number(s.variant ?? 0));
  return Number.isFinite(v) ? ((v % n) + n) % n : 0;
};
/** A snappy overshoot spring, for things that pop. */
const usePop = (at: number, cfg = { damping: 12, stiffness: 170, mass: 0.7 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: cfg });
};
/** The area words and pictures may use (clear of the caption band). */
const area = (P: boolean): React.CSSProperties => ({ padding: P ? "140px 70px 640px" : "70px 120px 170px" });
/** Headline size by length: short lines big, long ones smaller. */
const sizeFor = (t: string, sizes: [number, number, number], at: [number, number] = [16, 32]) => {
  const n = vlen(t);
  return n <= at[0] ? sizes[0] : n <= at[1] ? sizes[1] : sizes[2];
};
const isVideo = (url: string, kind?: MediaKind) => kind === "video" || (!kind && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url));

const NO = "#DC2626";
const YES = "#15803D";

// ── media (the agent's photo or video), never crashing on a bad link ────────
const MediaFallback: React.FC = () => {
  const L = useLook();
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${L.brand.primary} 0%, ${mix(L.brand.primary, "#000000", 0.55)} 100%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Logo brand={L.brand} size={150} />
    </AbsoluteFill>
  );
};

// A video link is checked once before use: the looping player stops the whole
// render on a missing file (404) whatever its onError says, so a link that
// answers with an error shows the brand card instead, and a link the browser
// may not read directly (no CORS) goes through the server-side player, whose
// onError never stops the render (it can't loop, so it holds its last frame).
type Probe = "ok" | "bad" | "direct-blocked";
const probes = new Map<string, Promise<Probe>>();
const probe = (u: string): Promise<Probe> => {
  if (!probes.has(u)) {
    probes.set(
      u,
      fetch(u, { headers: { Range: "bytes=0-1" } })
        .then((r) => {
          r.body?.cancel().catch(() => undefined);
          return (r.ok ? "ok" : "bad") as Probe;
        })
        .catch(() => "direct-blocked" as Probe),
    );
  }
  return probes.get(u)!;
};
const useProbe = (u: string | null): Probe | null => {
  const [state, setState] = React.useState<Probe | null>(null);
  React.useEffect(() => {
    if (!u) return;
    let open = true;
    const h = delayRender(`Checking ${u}`);
    const done = () => {
      if (open) {
        open = false;
        continueRender(h);
      }
    };
    probe(u).then((r) => {
      setState(r);
      done();
    });
    return done;
  }, [u]);
  return state;
};

const LoopingVideo: React.FC<{ url: string; style: React.CSSProperties; onBroken: () => void }> = ({ url, style, onBroken }) => {
  const src = mediaSrc(url);
  const state = useProbe(src);
  React.useEffect(() => {
    if (state === "bad") onBroken();
  }, [state, onBroken]);
  if (state === null || state === "bad") return null;
  if (state === "direct-blocked") return <OffthreadVideo src={src} muted style={style} onError={onBroken} />;
  return (
    <Video
      src={src}
      muted
      loop
      objectFit="cover"
      style={style}
      onError={() => "fallback"}
      fallbackOffthreadVideoProps={{ onError: onBroken }}
    />
  );
};

/** A photo or a muted, looping video filling its box. */
export const MediaFill: React.FC<{ url?: string | null; kind?: MediaKind; zoom?: [number, number]; position?: string }> = ({
  url,
  kind,
  zoom,
  position = "50% 35%",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [broken, setBroken] = React.useState(false);
  const onBroken = React.useCallback(() => setBroken(true), []);
  const z = zoom ? interpolate(frame, [0, durationInFrames], zoom, { extrapolateRight: "clamp" }) : 1;
  if (!url || broken) return <MediaFallback />;
  const style: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", objectPosition: position };
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#111" }}>
      <AbsoluteFill style={{ transform: `scale(${z})` }}>
        {isVideo(url, kind) ? (
          <LoopingVideo url={url} style={style} onBroken={onBroken} />
        ) : (
          <Img src={mediaSrc(url)} onError={() => setBroken(true)} maxRetries={2} style={style} />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A phone around anything. `height` in px; width follows a 9:16 screen. */
const PhoneShell: React.FC<{ height: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ height, children, style }) => {
  const pad = Math.round(height * 0.016);
  const screenH = height - pad * 2;
  const screenW = Math.round(screenH * (9 / 16));
  return (
    <div
      style={{
        width: screenW + pad * 2,
        height,
        padding: pad,
        borderRadius: height * 0.07,
        background: "#0B0B0F",
        boxShadow: "0 40px 90px rgba(0,0,0,0.45), 0 0 0 3px rgba(255,255,255,0.14)",
        flexShrink: 0,
        ...style,
      }}
    >
      <div style={{ position: "relative", width: screenW, height: screenH, borderRadius: height * 0.058, overflow: "hidden", background: "#FFFFFF" }}>
        {children}
        <div
          style={{
            position: "absolute",
            top: screenH * 0.018,
            left: "50%",
            width: screenW * 0.26,
            marginLeft: -screenW * 0.13,
            height: screenH * 0.032,
            borderRadius: 99,
            background: "#0B0B0F",
          }}
        />
      </div>
    </div>
  );
};

/** A tap: a dot lands, then a ripple in the brand color. (x, y) = center. */
const TapRipple: React.FC<{ at: number; x: number; y: number; size?: number }> = ({ at, x, y, size = 1 }) => {
  const frame = useCurrentFrame();
  const L = useLook();
  if (frame < at - 10 || frame > at + 26) return null;
  const p = interpolate(frame, [at, at + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hand = interpolate(frame, [at - 10, at], [60, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(frame, [at + 16, at + 26], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const r = 60 * size;
  const d = 26 * size;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - r,
          top: y - r,
          width: r * 2,
          height: r * 2,
          borderRadius: 999,
          border: `${6 * size}px solid ${L.brand.accent}`,
          boxShadow: "0 0 0 2px rgba(0,0,0,0.25)",
          opacity: frame >= at ? 1 - p : 0,
          transform: `scale(${0.4 + p * 1.4})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x - d + hand * size,
          top: y - d + hand * size,
          width: d * 2,
          height: d * 2,
          borderRadius: 999,
          background: "rgba(255,255,255,0.94)",
          border: `${4 * size}px solid ${L.brand.accent}`,
          boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          opacity: fadeOut,
          transform: `scale(${frame >= at && frame < at + 5 ? 0.82 : 1})`,
        }}
      />
    </>
  );
};

/** The scene's words on a full-bleed picture: white, whatever the look. */
const OnPicture: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const L = useLook();
  const look = React.useMemo(() => makeLook(L.theme, L.brand, true, true, L.lang, L.social), [L]);
  return <LookProvider look={look}>{children}</LookProvider>;
};

const Shade: React.FC<{ strength?: number }> = ({ strength = 1 }) => {
  const L = useLook();
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${mix("#000000", L.brand.primary, 0.25)}${Math.round(0xb0 * strength).toString(16).padStart(2, "0")} 0%, #00000055 40%, #00000066 62%, #000000${Math.round(0xd0 * strength).toString(16).padStart(2, "0")} 100%)`,
      }}
    />
  );
};

// ── hook: 1–3 lines, on screen from frame 0 ────────────────────────────────
export const Hook: React.FC<{ s: HookScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 2);
  const lines = (s.lines ?? []).map((x) => String(x ?? "")).filter((x) => x.trim()).slice(0, 3);
  const at = (i: number) => (i === 0 ? -14 : cueOf(s, i, 26, 34));
  let newest = 0;
  lines.forEach((_, i) => {
    if (frame >= at(i)) newest = i;
  });
  const media = !!s.media_url;
  const full = media && s.media_frame === "full";
  const phone = media && !full;
  const longest = Math.max(0, ...lines.map(vlen));
  const base = phone ? (P ? 92 : 96) : P ? 118 : 124;
  const size = Math.round(base * (longest > 30 ? 0.68 : longest > 18 ? 0.82 : 1) * (lines.length >= 3 && phone && P ? 0.88 : 1));
  const align = v === 1 || (!P && phone) ? "left" : "center";
  const accent = visible(L, L.brand.accent);
  const block = L.brand.primary === L.pal.bg || contrast(L.brand.primary, L.pal.bg) < 1.4 ? L.brand.accent : L.brand.primary;
  const blockAccent = contrast(L.brand.accent, block) >= 2.2 ? L.brand.accent : onColor(block);
  const zoom = interpolate(frame, [0, 24], [1.1, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const tilt = interpolate(frame, [0, 30], [v === 1 ? 6 : -6, v === 1 ? 2.5 : -2.5], { extrapolateRight: "clamp" });

  const words = (
    <div style={{ display: "flex", flexDirection: "column", gap: P ? 22 : 18, alignItems: align === "left" ? "flex-start" : "center", width: "100%" }}>
      {lines.map((t, i) => {
        const older = i < newest;
        const dim = older ? interpolate(frame, [at(newest), at(newest) + 6], [1, full ? 0.78 : 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
        const bump = i === newest && i > 0 ? interpolate(frame - at(i), [4, 10, 16], [1, 1.06, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
        const onBlock = v === 1 && i === newest;
        return (
          <div
            key={i}
            style={{
              opacity: dim,
              transform: `scale(${bump * (older ? 0.94 : 1)}) rotate(${onBlock ? -2 : 0}deg)`,
              transformOrigin: align === "left" ? "0% 50%" : "50% 50%",
              background: onBlock ? block : undefined,
              padding: onBlock ? `${size * 0.08}px ${size * 0.22}px ${size * 0.12}px` : undefined,
              borderRadius: onBlock ? Math.min(L.theme.radius, 18) : undefined,
              boxShadow: onBlock ? "0 14px 34px rgba(0,0,0,0.3)" : undefined,
              maxWidth: "100%",
            }}
          >
            <Headline
              text={t}
              size={size}
              delay={at(i)}
              stagger={i === 0 ? 1 : 2}
              align={align}
              color={onBlock ? onColor(block) : undefined}
              accent={onBlock ? blockAccent : accent}
            />
          </div>
        );
      })}
    </div>
  );

  if (full) {
    return (
      <Stage>
        <MediaFill url={s.media_url} kind={s.media_kind} zoom={[1.12, 1.02]} />
        <Shade />
        <OnPicture>
          <AbsoluteFill style={{ ...area(P), justifyContent: "center", alignItems: "center" }}>{words}</AbsoluteFill>
        </OnPicture>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  if (phone) {
    const h = P ? (lines.length >= 3 ? 700 : 820) : 820;
    return (
      <Stage>
        <AbsoluteFill
          style={{
            ...area(P),
            flexDirection: P ? "column" : "row",
            alignItems: "center",
            justifyContent: P ? "space-between" : "center",
            gap: P ? 30 : 90,
            ...(P ? {} : { padding: "40px 120px 150px", flexDirection: v === 1 ? "row-reverse" : "row" }),
          }}
        >
          <div style={{ flex: P ? "0 0 auto" : "1 1 0", width: P ? "100%" : undefined }}>{words}</div>
          <PhoneShell height={h} style={{ transform: `scale(${zoom}) rotate(${tilt}deg)` }}>
            <MediaFill url={s.media_url} kind={s.media_kind} />
          </PhoneShell>
        </AbsoluteFill>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  return (
    <Stage image={s.image_url}>
      <Camera>
        <AbsoluteFill style={{ ...area(P), justifyContent: "center", alignItems: "center" }}>{words}</AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── stamps: ✕ / ✓ that slam in ─────────────────────────────────────────────
const Mark: React.FC<{ yes: boolean; size: number; color: string }> = ({ yes, size, color }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
    <circle cx="20" cy="20" r="20" fill="#FFFFFF" />
    {yes ? (
      <path d="M11 21 L17.5 27.5 L29.5 13.5" stroke={color} strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="M13 13 L27 27 M27 13 L13 27" stroke={color} strokeWidth="5.5" fill="none" strokeLinecap="round" />
    )}
  </svg>
);

const Stamp: React.FC<{ text: string; yes: boolean; at: number; index: number; size: number; offset: number }> = ({ text, yes, at, index, size, offset }) => {
  const frame = useCurrentFrame();
  const L = useLook();
  const p = usePop(at, { damping: 13, stiffness: 210, mass: 0.6 });
  if (frame < at) return <div style={{ height: size * 1.55 }} />;
  const rot = (index % 2 === 0 ? -1 : 1) * (yes ? 2 : 3);
  const color = yes ? YES : NO;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.32,
        background: color,
        color: "#FFFFFF",
        ...heavy(L),
        fontSize: size,
        lineHeight: 1.05,
        padding: `${size * 0.24}px ${size * 0.6}px ${size * 0.24}px ${size * 0.28}px`,
        borderRadius: 999,
        border: "5px solid #FFFFFF",
        boxShadow: "0 16px 36px rgba(0,0,0,0.35)",
        transform: `translateX(${offset}px) scale(${1.8 - 0.8 * p}) rotate(${rot + (1 - p) * rot * 3}deg)`,
        opacity: Math.min(1, p * 2.5),
        maxWidth: "100%",
      }}
    >
      <Mark yes={yes} size={size * 1.15} color={color} />
      <span>{text}</span>
    </div>
  );
};

export const Stamps: React.FC<{ s: StampsScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 2);
  const items = (s.items ?? []).map((x) => String(x ?? "")).filter(Boolean).slice(0, 3);
  const yes = s.mode === "yes";
  const at = (i: number) => cueOf(s, i, 22, 14);
  // a little shake as each stamp lands
  let shake = 0;
  items.forEach((_, i) => {
    const d = frame - at(i);
    if (d >= 3 && d < 10) shake = Math.sin(d * 2.4) * (10 - d) * 1.4;
  });
  const longest = Math.max(0, ...items.map(vlen));
  const size = P ? (longest > 18 ? 54 : 68) : longest > 22 ? 50 : 60;
  const offsets = (i: number) => (v === 1 ? [-1, 1, -0.4][i] * (P ? 60 : 140) : 0);
  return (
    <Stage image={s.image_url}>
      <Camera>
        <AbsoluteFill style={{ ...area(P), alignItems: "center", justifyContent: "center", gap: P ? 40 : 30 }}>
          {s.headline ? (
            <div style={{ width: "100%", paddingTop: P ? 40 : 10 }}>
              <Headline text={s.headline} size={sizeFor(s.headline, P ? [104, 88, 72] : [96, 80, 66])} delay={-4} accent={visible(L, L.brand.accent)} />
            </div>
          ) : null}
          <div
            style={{
              flex: s.headline ? "1 1 0" : undefined,
              justifyContent: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: P ? 56 : 34,
              transform: `translate(${shake}px, ${shake * 0.5}px)`,
              maxWidth: P ? 940 : 1500,
            }}
          >
            {items.map((t, i) => (
              <Stamp key={i} text={t} yes={yes} at={at(i)} index={i} size={size} offset={offsets(i)} />
            ))}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── screen: a captured page in a phone or browser, with a moving camera ─────
type Cam = { at: number; cx: number; cy: number; z: number };

export const Screen: React.FC<{ s: ScreenScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const P = usePortrait();
  const L = useLook();
  const [broken, setBroken] = React.useState(false);
  const iw = Number(s.image_w) > 0 ? Number(s.image_w) : 860;
  const ih = Number(s.image_h) > 0 ? Number(s.image_h) : 2600;
  const browser = s.device === "browser";
  const head = !!s.headline;
  // Device box (outer) and the page viewport inside it, in video pixels.
  let box: { x: number; y: number; w: number; h: number };
  if (P) {
    const top = head ? 400 : 170;
    const h = 1270 - top;
    box = browser ? { x: 60, y: top, w: 960, h } : { x: 0, y: top, w: Math.round((h - 28) * 0.5) + 28, h };
    if (!browser) box.x = Math.round((1080 - box.w) / 2);
  } else {
    const h = head ? 830 : 840;
    const y = 60;
    if (browser) {
      const w = head ? 980 : 1500;
      box = { x: head ? 1920 - 110 - w : (1920 - w) / 2, y, w, h };
    } else {
      const w = Math.round((h - 28) * 0.5) + 28;
      box = { x: head ? 1180 : (1920 - w) / 2, y, w, h };
    }
  }
  const bar = browser ? 64 : 0;
  const pad = browser ? 0 : 14;
  const vw = box.w - pad * 2;
  const vh = box.h - pad * 2 - bar;
  const k = vw / iw;

  // Camera keyframes: the top of the page, then each focus box.
  const focus = (s.focus ?? []).filter((f) => f && [f.x, f.y, f.w, f.h].every((n) => Number.isFinite(Number(n)))).slice(0, 4);
  const startCy = vh / (2 * k);
  const cams: Cam[] = [{ at: 0, cx: iw / 2, cy: startCy, z: 1 }];
  const focusAt = (i: number) => cueOf(s, i, Math.max(30, Math.floor((durationInFrames - 40) / Math.max(1, focus.length))), 24);
  focus.forEach((f, i) => {
    const fitW = (0.72 * vw) / (Math.max(1, f.w) * k);
    const fitH = (0.42 * vh) / (Math.max(1, f.h) * k);
    const z = Math.max(1.15, Math.min(2.2, fitW, fitH));
    cams.push({ at: focusAt(i) - 10, cx: f.x + f.w / 2, cy: f.y + f.h / 2, z });
  });
  let cx = cams[0].cx;
  let cy = cams[0].cy;
  let z = 1;
  if (focus.length === 0) {
    // No focus: a slow scroll down the page.
    const maxCy = Math.max(startCy, ih - startCy);
    const t = interpolate(frame, [12, durationInFrames - 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
    cy = startCy + (maxCy - startCy) * t;
  } else {
    // a gentle drift before the first focus
    cy = startCy + interpolate(frame, [0, Math.max(1, cams[1].at)], [0, 80], { extrapolateRight: "clamp" });
    let prev: Cam = { ...cams[0], cy };
    for (let i = 1; i < cams.length; i++) {
      const b = cams[i];
      if (frame < b.at) break;
      const t = interpolate(frame, [b.at, b.at + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
      cx = prev.cx + (b.cx - prev.cx) * t;
      cy = prev.cy + (b.cy - prev.cy) * t;
      z = prev.z + (b.z - prev.z) * t;
      prev = { at: b.at, cx, cy, z };
    }
  }
  const sc = k * z;
  const left = Math.min(0, Math.max(vw - iw * sc, vw / 2 - cx * sc));
  const top = Math.min(0, Math.max(vh - ih * sc, vh / 2 - cy * sc));

  // Which focus is showing its ring now.
  let active = -1;
  focus.forEach((_, i) => {
    if (frame >= focusAt(i) + 4 && (i === focus.length - 1 || frame < focusAt(i + 1) - 10)) active = i;
  });
  const ringColor = L.brand.accent;
  const ring = (() => {
    if (active < 0) return null;
    const f = focus[active];
    const p = spring({ frame: frame - focusAt(active) - 4, fps, config: { damping: 12, stiffness: 170, mass: 0.7 } });
    const pulse = 0.5 + 0.5 * Math.sin((frame - focusAt(active)) / 4.5);
    const m = 10;
    return (
      <div
        style={{
          position: "absolute",
          left: left + f.x * sc - m,
          top: top + f.y * sc - m,
          width: f.w * sc + m * 2,
          height: f.h * sc + m * 2,
          borderRadius: Math.min(18, L.theme.radius + 6),
          border: `5px solid ${ringColor}`,
          boxShadow: `0 0 0 3px rgba(0,0,0,0.28), 0 0 ${14 + 16 * pulse}px ${ringColor}`,
          opacity: Math.min(1, p * 1.5),
          transform: `scale(${1.15 - 0.15 * p})`,
        }}
      />
    );
  })();
  const taps = focus.map((f, i) =>
    f.tap ? <TapRipple key={i} at={focusAt(i) + 14} x={left + (f.x + f.w / 2) * sc} y={top + (f.y + f.h / 2) * sc} size={0.85} /> : null,
  );

  const enter = usePop(-4, { damping: 16, stiffness: 150, mass: 0.8 });
  const page = (
    <div style={{ position: "absolute", left: pad, top: pad + bar, width: vw, height: vh, overflow: "hidden", background: "#FFFFFF", borderRadius: browser ? `0 0 ${Math.min(L.theme.radius, 20)}px ${Math.min(L.theme.radius, 20)}px` : 38 }}>
      {broken ? (
        <MediaFallback />
      ) : (
        <Img
          src={mediaSrc(s.image_url)}
          onError={() => setBroken(true)}
          maxRetries={2}
          style={{ position: "absolute", left, top, width: iw * sc, height: ih * sc, maxWidth: "none" }}
        />
      )}
      {ring}
      {taps}
    </div>
  );
  const device = browser ? (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderRadius: Math.min(L.theme.radius, 20),
        background: "#F1F3F6",
        boxShadow: "0 40px 90px rgba(0,0,0,0.4), 0 0 0 2px rgba(0,0,0,0.08)",
        transform: `translateY(${(1 - enter) * 120}px) scale(${0.94 + 0.06 * enter})`,
        opacity: Math.min(1, enter * 2),
      }}
    >
      <div style={{ height: bar, display: "flex", alignItems: "center", gap: 12, padding: "0 22px" }}>
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
        ))}
        <div
          dir="ltr"
          style={{
            marginLeft: 16,
            flex: 1,
            height: 36,
            borderRadius: 18,
            background: "#FFFFFF",
            color: "#555",
            fontFamily: L.body,
            fontSize: 20,
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {L.brand.website || " "}
        </div>
      </div>
      {page}
    </div>
  ) : (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderRadius: 64,
        background: "#0B0B0F",
        boxShadow: "0 40px 90px rgba(0,0,0,0.45), 0 0 0 3px rgba(255,255,255,0.14)",
        transform: `translateY(${(1 - enter) * 120}px) scale(${0.94 + 0.06 * enter})`,
        opacity: Math.min(1, enter * 2),
      }}
    >
      {page}
      <div style={{ position: "absolute", top: pad + 14, left: "50%", marginLeft: -55, width: 110, height: 30, borderRadius: 16, background: "#0B0B0F" }} />
    </div>
  );
  return (
    <Stage>
      {head ? (
        <div
          style={
            P
              ? { position: "absolute", left: 60, right: 60, top: 140, height: 240, display: "flex", alignItems: "center", justifyContent: "center" }
              : { position: "absolute", left: 140, width: box.x - 240, top: 60, height: 840, display: "flex", alignItems: "center", justifyContent: "flex-end" }
          }
        >
          <Headline
            text={s.headline!}
            size={P ? sizeFor(s.headline!, [100, 84, 70]) : sizeFor(s.headline!, [104, 88, 74], [12, 26])}
            delay={-4}
            align={P ? "center" : browser ? "left" : "center"}
            accent={visible(L, L.brand.accent)}
          />
        </div>
      ) : null}
      {device}
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── media: the agent's own photo or video ───────────────────────────────────
export const Media: React.FC<{ s: MediaScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const L = useLook();
  const head = !!s.headline;
  const accent = visible(L, L.brand.accent);
  const headline = (size: number, align: "center" | "left") =>
    head ? <Headline text={s.headline!} size={size} delay={-4} align={align} accent={accent} /> : null;
  const zoomIn = interpolate(frame, [0, 22], [1.1, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  if (s.frame === "full") {
    return (
      <Stage>
        <MediaFill url={s.media_url} kind={s.media_kind} zoom={[1.0, 1.08]} />
        {head ? <Shade strength={0.9} /> : <Shade strength={0.35} />}
        <OnPicture>
          <AbsoluteFill style={{ ...area(P), justifyContent: "flex-start", alignItems: P ? "center" : "flex-start" }}>
            <div style={{ width: P ? "100%" : 1100, paddingTop: P ? 30 : 10 }}>{headline(sizeFor(s.headline ?? "", P ? [112, 94, 78] : [110, 92, 78]), P ? "center" : "left")}</div>
          </AbsoluteFill>
        </OnPicture>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  if (s.frame === "card") {
    const kb: [number, number] = [1.04, 1.14];
    const cardP = usePop(-6, { damping: 15, stiffness: 160, mass: 0.8 });
    const radius = Math.max(18, Math.min(L.theme.radius + 10, 44));
    const card = (w: number, h: number) => (
      <div
        style={{
          position: "relative",
          width: w,
          height: h,
          borderRadius: radius,
          overflow: "hidden",
          boxShadow: "0 40px 90px rgba(0,0,0,0.35), 0 8px 20px rgba(0,0,0,0.15)",
          border: L.theme.shadow === "hard" ? `4px solid ${L.pal.ink}` : undefined,
          transform: `scale(${0.85 + 0.15 * cardP}) rotate(${(L.theme.tilt || -1.5) * (1 - cardP * 0.6)}deg)`,
          opacity: Math.min(1, cardP * 2),
          flexShrink: 0,
        }}
      >
        <MediaFill url={s.media_url} kind={s.media_kind} zoom={kb} />
      </div>
    );
    return (
      <Stage>
        <AbsoluteFill style={{ ...area(P), flexDirection: P ? "column" : "row", alignItems: "center", justifyContent: "center", gap: P ? 50 : 90 }}>
          {head ? <div style={{ width: P ? "100%" : 640 }}>{headline(P ? sizeFor(s.headline!, [100, 84, 70]) : sizeFor(s.headline!, [100, 84, 70], [12, 26]), P ? "center" : "left")}</div> : null}
          {P ? card(head ? 760 : 880, head ? 800 : 1060) : card(head ? 1000 : 1360, head ? 640 : 760)}
        </AbsoluteFill>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  // phone
  const h = P ? (head ? 820 : 1060) : 860;
  return (
    <Stage>
      <AbsoluteFill
        style={{ ...area(P), flexDirection: P ? "column" : "row", alignItems: "center", justifyContent: "center", gap: P ? 40 : 110, ...(P ? {} : { padding: "40px 120px 150px" }) }}
      >
        {head ? <div style={{ width: P ? "100%" : 820 }}>{headline(P ? sizeFor(s.headline!, [100, 84, 70]) : sizeFor(s.headline!, [104, 88, 74], [12, 26]), P ? "center" : "left")}</div> : null}
        <PhoneShell height={h} style={{ transform: `scale(${zoomIn}) rotate(${interpolate(frame, [0, 30], [4, 1.5], { extrapolateRight: "clamp" })}deg)` }}>
          <MediaFill url={s.media_url} kind={s.media_kind} />
        </PhoneShell>
      </AbsoluteFill>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── tip: one tip, big ───────────────────────────────────────────────────────
const Bulb: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path d="M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8V17h6v-1c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5z" fill={color} />
    <rect x="9" y="18.2" width="6" height="2" rx="1" fill={color} />
    <rect x="10" y="21" width="4" height="1.6" rx="0.8" fill={color} />
  </svg>
);

export const Chip: React.FC<{ label: string; at: number; size: number; icon?: boolean }> = ({ label, at, size, icon }) => {
  const L = useLook();
  const p = usePop(at);
  const bg = visible(L, L.brand.accent);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.35,
        background: bg,
        color: onColor(bg),
        ...heavy(L),
        fontSize: size,
        letterSpacing: L.lang.script === "latin" ? 3 : 0,
        padding: `${size * 0.32}px ${size * 0.7}px`,
        borderRadius: 999,
        boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
        transform: `scale(${p}) rotate(-3deg)`,
        alignSelf: "center",
      }}
    >
      {icon ? <Bulb color={onColor(bg)} size={size * 1.15} /> : null}
      {label}
    </div>
  );
};

export const Tip: React.FC<{ s: TipScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 2);
  const at = cueOf(s, 0, 0, 40);
  const left = v === 1;
  const detailStyle = useRise(at, 40);
  const headSize = P ? sizeFor(s.headline, [120, 98, 80], [24, 56]) : sizeFor(s.headline, [118, 96, 80], [28, 64]);
  return (
    <Stage image={s.image_url}>
      <Camera>
        <AbsoluteFill style={{ ...area(P), justifyContent: "center", alignItems: left ? "flex-start" : "center", gap: P ? 54 : 44 }}>
          <div style={{ alignSelf: left ? "flex-start" : "center" }}>
            <Chip label={s.label || "TIP"} at={-6} size={P ? 38 : 32} icon />
          </div>
          <div style={{ width: "100%", maxWidth: P ? 940 : 1500 }}>
            <Headline text={s.headline} size={headSize} delay={2} align={left ? "left" : "center"} accent={visible(L, L.brand.accent)} />
          </div>
          {s.detail ? (
            left ? (
              <div
                style={{
                  ...detailStyle,
                  borderInlineStart: `10px solid ${visible(L, L.brand.accent)}`,
                  paddingInlineStart: 28,
                  fontSize: P ? 44 : 38,
                  lineHeight: 1.35,
                  color: L.pal.muted,
                  fontWeight: 600,
                  maxWidth: P ? 940 : 1300,
                }}
              >
                {s.detail}
              </div>
            ) : (
              <div style={{ ...cardStyle(L), ...detailStyle, padding: P ? "28px 40px" : "24px 44px", fontSize: P ? 42 : 36, lineHeight: 1.35, fontWeight: 600, textAlign: "center", maxWidth: P ? 940 : 1300 }}>
                {s.detail}
              </div>
            )
          ) : null}
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── date: a calendar page drops in ──────────────────────────────────────────
const Calendar: React.FC<{ month: string; day: string; width: number }> = ({ month, day, width }) => {
  const L = useLook();
  const p = usePop(-2, { damping: 10, stiffness: 140, mass: 0.8 });
  const head = L.brand.primary;
  const h = width * 1.08;
  const headH = width * 0.3;
  const dayInk = contrast(L.brand.primary, "#FFFFFF") >= 3 ? L.brand.primary : "#1A1A1A";
  const dl = vlen(day);
  const daySize = width * Math.min(0.56, 0.82 / (Math.max(1, dl) * 0.8));
  const r = Math.min(L.theme.radius + 6, 32);
  return (
    <div
      style={{
        position: "relative",
        width,
        height: h,
        transform: `perspective(1600px) translateY(${(1 - p) * -700}px) rotate(${(1 - p) * -14}deg) rotateX(${(1 - Math.min(1, p)) * 30}deg)`,
        transformOrigin: "50% 0%",
        flexShrink: 0,
      }}
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: r, background: "#FFFFFF", overflow: "hidden", boxShadow: "0 40px 80px rgba(0,0,0,0.35), 0 0 0 2px rgba(0,0,0,0.06)" }}>
        <div
          style={{
            height: headH,
            background: head,
            color: onColor(head),
            ...heavy(L),
            textTransform: "uppercase",
            fontSize: headH * 0.48,
            letterSpacing: L.lang.script === "latin" ? 4 : 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: headH * 0.12,
          }}
        >
          {month}
        </div>
        <div
          style={{
            height: h - headH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: L.head,
            fontWeight: Math.max(L.theme.headWeight, 600),
            fontSize: daySize,
            lineHeight: 1,
            color: dayInk,
            textTransform: "uppercase",
            background: "linear-gradient(180deg, #FFFFFF 0%, #F3F3F3 100%)",
          }}
        >
          {day}
        </div>
      </div>
      {[0.28, 0.72].map((x) => (
        <div
          key={x}
          style={{
            position: "absolute",
            top: -width * 0.05,
            left: width * x - width * 0.03,
            width: width * 0.06,
            height: width * 0.14,
            borderRadius: 99,
            background: "#2B2B2B",
            boxShadow: "0 2px 0 rgba(255,255,255,0.4)",
          }}
        />
      ))}
    </div>
  );
};

export const DateView: React.FC<{ s: DateScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const at = cueOf(s, 0, 0, 22);
  const note = useRise(at + 10, 30);
  return (
    <Stage image={s.image_url}>
      <Camera>
        <AbsoluteFill style={{ ...area(P), flexDirection: P ? "column" : "row", justifyContent: "center", alignItems: "center", gap: P ? 70 : 110 }}>
          <Calendar month={s.month} day={s.day} width={P ? 480 : 460} />
          <div style={{ display: "flex", flexDirection: "column", gap: 26, width: P ? "100%" : 900, alignItems: P ? "center" : "flex-start" }}>
            <Headline text={s.label} size={sizeFor(s.label, P ? [108, 90, 74] : [104, 88, 74], [14, 30])} delay={at} align={P ? "center" : "left"} accent={visible(L, L.brand.accent)} />
            {s.note ? (
              <div style={{ ...note, fontSize: P ? 44 : 40, color: L.pal.muted, fontWeight: 600, textAlign: P ? "center" : "start", lineHeight: 1.3 }}>{s.note}</div>
            ) : null}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── profile: the agent ──────────────────────────────────────────────────────
const initialsOf = (name: string) =>
  (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("")
    .toUpperCase();

const Portrait: React.FC<{ url?: string | null; name: string; size: number }> = ({ url, name, size }) => {
  const frame = useCurrentFrame();
  const L = useLook();
  const [broken, setBroken] = React.useState(false);
  const p = usePop(-6, { damping: 13, stiffness: 150, mass: 0.8 });
  const ringC = visible(L, L.brand.primary);
  const arcC = visible(L, L.brand.accent);
  const ring = 12;
  const outer = size + 56;
  const fallbackBg = visible(L, L.brand.primary);
  return (
    <div style={{ position: "relative", width: outer, height: outer, transform: `scale(${0.6 + 0.4 * p})`, opacity: Math.min(1, p * 2), flexShrink: 0 }}>
      {/* a slow-turning accent arc around the photo */}
      <svg width={outer} height={outer} style={{ position: "absolute", inset: 0, transform: `rotate(${frame * 1.6}deg)` }}>
        <circle cx={outer / 2} cy={outer / 2} r={outer / 2 - 5} fill="none" stroke={arcC} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${outer * 0.9} ${outer * 0.5}`} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 28,
          width: size,
          height: size,
          borderRadius: "50%",
          border: `${ring}px solid ${ringC}`,
          overflow: "hidden",
          background: url && !broken ? "#DDD" : L.brand.logo_url ? "#FFFFFF" : fallbackBg,
          boxShadow: "0 30px 70px rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {url && !broken ? (
          <Img src={mediaSrc(url)} onError={() => setBroken(true)} maxRetries={2} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />
        ) : L.brand.logo_url ? (
          <Logo brand={L.brand} size={size * 0.55} />
        ) : (
          <span style={{ fontFamily: L.head, fontWeight: Math.max(600, L.theme.headWeight), fontSize: size * 0.36, color: onColor(fallbackBg) }}>{initialsOf(name) || L.brand.initials}</span>
        )}
      </div>
    </div>
  );
};

const BadgePill: React.FC<{ text: string; at: number; i: number; size: number }> = ({ text, at, i, size }) => {
  const L = useLook();
  const p = usePop(at);
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const bg = visible(L, i % 2 === 0 ? L.brand.primary : L.brand.accent);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.4,
        background: bg,
        color: onColor(bg),
        fontFamily: L.body,
        fontWeight: 800,
        fontSize: size,
        padding: `${size * 0.36}px ${size * 0.7}px ${size * 0.36}px ${size * 0.4}px`,
        borderRadius: 999,
        boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
        border: `3px solid ${mix(bg, "#FFFFFF", 0.35)}`,
        transform: `scale(${p}) rotate(${(i % 2 ? 1.5 : -1.5) * (1 - p)}deg)`,
        opacity: Math.min(1, p * 2),
      }}
    >
      <svg width={size * 1.1} height={size * 1.1} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="12" fill={onColor(bg)} />
        <path d="M7 12.5 L10.5 16 L17 8.5" stroke={bg} strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text}
    </div>
  );
};

export const Profile: React.FC<{ s: ProfileScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const badges = (s.badges ?? []).map((b) => String(b ?? "")).filter(Boolean).slice(0, 3);
  const title = useRise(10, 30);
  const nameSize = P ? sizeFor(s.name, [116, 96, 80], [14, 22]) : sizeFor(s.name, [112, 94, 78], [14, 22]);
  return (
    <Stage>
      <Camera amount={0.02}>
        <AbsoluteFill style={{ ...area(P), flexDirection: P ? "column" : "row", alignItems: "center", justifyContent: "center", gap: P ? 40 : 100 }}>
          <Portrait url={s.photo_url} name={s.name} size={P ? 440 : 440} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: P ? "center" : "flex-start", gap: P ? 18 : 18, maxWidth: P ? 940 : 980 }}>
            <Headline text={s.name} size={nameSize} delay={2} align={P ? "center" : "left"} stagger={2} />
            {s.title ? <div style={{ ...title, fontSize: P ? 44 : 42, fontWeight: 600, color: L.pal.muted, textAlign: P ? "center" : "start" }}>{s.title}</div> : null}
            {badges.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: P ? "center" : "flex-start", gap: 18, marginTop: P ? 18 : 22 }}>
                {badges.map((b, i) => (
                  <BadgePill key={i} text={b} at={cueOf(s, i, 18, 30)} i={i} size={P ? 34 : 32} />
                ))}
              </div>
            ) : null}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── quote ───────────────────────────────────────────────────────────────────
export const Quote: React.FC<{ s: QuoteScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 2);
  const left = v === 1;
  const n = vlen(s.text);
  const size = P ? (n <= 50 ? 100 : n <= 90 ? 82 : n <= 130 ? 70 : 60) : n <= 50 ? 100 : n <= 90 ? 84 : n <= 130 ? 72 : 62;
  const words = (s.text || "").split(/\s+/).length;
  const byAt = Math.min(60, 8 + words * 2);
  const by = useRise(byAt, 24);
  const qp = usePop(-6, { damping: 11, stiffness: 160, mass: 0.7 });
  const accent = visible(L, L.brand.accent);
  const mark = (
    <div
      style={{
        fontFamily: L.head,
        fontWeight: 700,
        fontSize: P ? 330 : 300,
        lineHeight: 0.8,
        height: P ? 170 : 150,
        color: accent,
        transform: `scale(${0.5 + 0.5 * qp}) rotate(${(1 - qp) * -16}deg)`,
        opacity: Math.min(1, qp * 2),
        alignSelf: left ? "flex-start" : "center",
        textTransform: "none",
      }}
    >
      {L.lang.rtl ? "”" : "“"}
    </div>
  );
  return (
    <Stage image={s.image_url}>
      <Camera>
        <AbsoluteFill style={{ ...area(P), justifyContent: "center", alignItems: left ? "flex-start" : "center", gap: 24 }}>
          {mark}
          <div
            style={{
              maxWidth: P ? 940 : 1500,
              width: "100%",
              ...(left ? { borderInlineStart: `10px solid ${accent}`, paddingInlineStart: 40 } : {}),
              transform: `translateY(${interpolate(frame, [0, 90], [0, -8], { extrapolateRight: "clamp" })}px)`,
            }}
          >
            <Headline text={s.text} size={size} delay={4} stagger={Math.max(1, Math.min(2.5, 60 / Math.max(1, words)))} align={left ? "left" : "center"} accent={accent} />
          </div>
          {s.by ? (
            <div style={{ ...by, ...heavy(L), fontSize: P ? 40 : 36, color: L.pal.muted, letterSpacing: L.lang.script === "latin" ? 1 : 0, marginTop: 20, alignSelf: left ? "flex-start" : "center" }}>
              {"— "}
              {s.by}
            </div>
          ) : null}
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── end card, social style: the next step as a button + a question ──────────
const Arrow: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, transform: "scaleX(var(--dir, 1))" }}>
    <path d="M4 12 H19 M13 6 L19 12 L13 18" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BigButton: React.FC<{ label: string; at: number; pressAt: number; size: number }> = ({ label, at, pressAt, size }) => {
  const frame = useCurrentFrame();
  const L = useLook();
  const p = usePop(at);
  const bg = visible(L, L.brand.primary);
  const pressed = frame >= pressAt && frame < pressAt + 6;
  const breathe = frame > pressAt + 12 ? 1 + 0.025 * Math.sin((frame - pressAt) / 6) : 1;
  return (
    <div style={{ position: "relative", transform: `scale(${p * breathe * (pressed ? 0.93 : 1)})`, opacity: Math.min(1, p * 2) }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: size * 0.4,
          background: bg,
          color: onColor(bg),
          ...heavy(L),
          fontSize: size,
          padding: `${size * 0.5}px ${size * 1.0}px`,
          borderRadius: 999,
          boxShadow: `0 ${pressed ? 6 : 16}px ${pressed ? 14 : 36}px rgba(0,0,0,0.35), 0 0 0 5px ${mix(bg, "#FFFFFF", 0.45)}`,
          whiteSpace: "nowrap",
        }}
      >
        {label}
        <span style={{ display: "inline-flex", ["--dir" as any]: L.lang.rtl ? -1 : 1 }}>
          <Arrow color={onColor(bg)} size={size * 0.95} />
        </span>
      </div>
      <div style={{ position: "absolute", left: "62%", top: "58%" }}>
        <TapRipple at={pressAt} x={0} y={0} size={1} />
      </div>
    </div>
  );
};

const QuestionBubble: React.FC<{ text: string; at: number; size: number }> = ({ text, at, size }) => {
  const L = useLook();
  const rise = useRise(at, 40);
  const bg = "#FFFFFF";
  const ink = "#15161A";
  const icon = visible({ ...L, pal: { ...L.pal, bg } }, L.brand.accent);
  return (
    <div style={{ ...rise, position: "relative", maxWidth: 900 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: size * 0.6,
          background: bg,
          color: ink,
          fontFamily: L.body,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.3,
          padding: `${size * 0.7}px ${size * 0.9}px`,
          borderRadius: 34,
          boxShadow: "0 24px 50px rgba(0,0,0,0.28), 0 0 0 2px rgba(0,0,0,0.05)",
        }}
      >
        {/* a little speech-bubble icon */}
        <div style={{ position: "relative", width: size * 1.6, height: size * 1.3, flexShrink: 0 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: size * 0.5, background: icon }} />
          <div style={{ position: "absolute", left: size * 0.25, bottom: -size * 0.28, width: size * 0.5, height: size * 0.5, background: icon, transform: "skewX(-20deg) rotate(20deg)" }} />
          {[0.38, 0.8, 1.22].map((x) => (
            <div key={x} style={{ position: "absolute", left: size * x - size * 0.09, top: size * 0.56, width: size * 0.18, height: size * 0.18, borderRadius: 99, background: onColor(icon) }} />
          ))}
        </div>
        <span>{text}</span>
      </div>
      {/* the bubble's tail */}
      <div style={{ position: "absolute", left: 70, bottom: -20, width: 44, height: 44, background: bg, transform: "rotate(45deg)", borderRadius: 6 }} />
    </div>
  );
};

export const SocialEnd: React.FC<{ s: EndScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const brand = L.brand;
  const contact = [brand.phone, brand.website].filter(Boolean);
  const btnAt = cueOf(s, 0, 0, 12);
  const qAt = cueOf(s, 1, 0, btnAt + 28);
  const disclaimer = s.disclaimer ? (
    <div
      style={{
        ...useRise(60, 10),
        position: "absolute",
        bottom: P ? 140 : 40,
        left: P ? 70 : 200,
        right: P ? 70 : 200,
        textAlign: "center",
        fontSize: P ? 24 : 19,
        lineHeight: 1.5,
        color: mix(L.pal.muted, L.pal.bg, 0.25),
        fontFamily: L.body,
      }}
    >
      {s.disclaimer}
    </div>
  ) : null;
  const headSize = sizeFor(s.headline, P ? [104, 88, 74] : [96, 80, 68], [18, 34]);
  const contactLine = (
    <div style={{ ...useRise(Math.min(qAt, btnAt) + 18, 20), display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18, fontSize: P ? 32 : 28, color: L.pal.muted, fontWeight: 600 }}>
      <span style={{ fontWeight: 800, color: L.pal.ink }}>{brand.name}</span>
      {contact.map((c, i) => (
        <React.Fragment key={i}>
          <span style={{ opacity: 0.4 }}>·</span>
          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
            {c}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
  return (
    <Stage image={s.image_url}>
      <AbsoluteFill style={{ ...area(P), ...(P ? {} : { padding: s.disclaimer ? "50px 120px 230px" : "50px 120px 160px" }), justifyContent: "center", alignItems: "center", gap: P ? 40 : 30 }}>
        <div style={useRise(-4)}>
          <Logo brand={brand} size={P ? 100 : 84} />
        </div>
        <div style={{ width: "100%", maxWidth: P ? 940 : 1500 }}>
          <Headline text={s.headline} size={headSize} delay={-2} accent={visible(L, L.brand.accent)} />
        </div>
        <div style={{ display: "flex", flexDirection: P ? "column" : "row", alignItems: "center", gap: P ? 56 : 60, marginTop: P ? 14 : 6 }}>
          {s.button ? <BigButton label={s.button} at={btnAt} pressAt={btnAt + 30} size={P ? 58 : 44} /> : null}
          {s.question ? <QuestionBubble text={s.question} at={qAt} size={P ? 42 : 32} /> : null}
        </div>
        {contactLine}
      </AbsoluteFill>
      {disclaimer}
      <Caption lines={s.captions} lift={!P && s.disclaimer ? 70 : 0} />
    </Stage>
  );
};


// ── reloop sticker (2026-11-12) ─────────────────────────────────────────────
// A curiosity line ("WAIT FOR IT…", "BEST PART NEXT ↓") slams in when the
// voice says it, so the reloop works with the sound off too. Sits above the
// caption band in portrait, bottom-right in landscape.
export const ReloopSticker: React.FC<{ reloop?: { text: string; at: number } | null }> = ({ reloop }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const P = usePortrait();
  const L = useLook();
  const text = String(reloop?.text ?? "").trim();
  const at = Number(reloop?.at);
  if (!L.social || !text || !Number.isFinite(at) || frame < at) return null;
  const p = spring({ frame: frame - at, fps, config: { damping: 11, stiffness: 180, mass: 0.7 } });
  const bg = visible(L, L.brand.accent);
  const size = P ? (vlen(text) > 18 ? 46 : 54) : vlen(text) > 18 ? 38 : 44;
  return (
    <div
      style={{
        position: "absolute",
        left: P ? 0 : undefined,
        right: P ? 0 : 90,
        top: P ? 1196 : undefined,
        bottom: P ? undefined : 190,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          ...heavy(L),
          fontSize: size,
          lineHeight: 1.1,
          textTransform: L.lang.script === "latin" || L.lang.script === "vietnamese" || L.lang.script === "cyrillic" ? "uppercase" : "none",
          color: onColor(bg),
          background: bg,
          padding: `${size * 0.28}px ${size * 0.6}px`,
          borderRadius: 999,
          maxWidth: P ? 940 : 900,
          textAlign: "center",
          boxShadow: "0 14px 34px rgba(0,0,0,0.35)",
          transform: `scale(${2 - p}) rotate(${-3 * p}deg)`,
          opacity: Math.min(1, p * 2),
        }}
      >
        {text}
      </div>
    </div>
  );
};
