// The scene library: each scene type draws itself from the recipe (spec.ts)
// in landscape or portrait, timed to the narration through `cues`. Since
// 2026-11-11 every scene draws in the video's look (kit.tsx useLook) and most
// types have two or three layouts (`variant`), so videos stop looking alike.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Camera,
  Caption,
  Headline,
  Logo,
  Phone,
  SectionTag,
  Stage,
  Starred,
  Tap,
  cardStyle,
  surfaceInk,
  surfaceMuted,
  useItemIn,
  useLook,
  usePortrait,
  useRise,
  visible,
  vlen,
  SceneWordsProvider,
} from "./kit";
import { mix, onColor } from "./theme";
import { DateView, Hook, Media, Profile, Quote, Screen, SocialEnd, Stamps, Tip } from "./social";
import type {
  CardsScene,
  ChecklistScene,
  ColumnsScene,
  EndScene,
  PhoneScene,
  Scene,
  StatScene,
  StepsScene,
  TableScene,
  TitleScene,
} from "./spec";

const WARN = "#C2410C";

// Frame an item appears at: its cue from the narration, or an even spread.
const cueOf = (s: Scene, i: number, spread = 20, first = 24) => {
  const c = s.cues?.[i];
  return typeof c === "number" && Number.isFinite(c) ? Math.max(0, c - 6) : first + i * spread;
};

const fit = (len: number, big: number, small: number, longAt = 28) => (len > longAt ? small : big);
const variantOf = (s: Scene, n: number) => {
  const v = Math.floor(Number(s.variant ?? 0));
  return Number.isFinite(v) ? ((v % n) + n) % n : 0;
};

const Tag: React.FC<{ s: Scene }> = ({ s }) => (s.tag ? <SectionTag label={s.tag} /> : null);

// ── title ────────────────────────────────────────────────────────────────
const Title: React.FC<{ s: TitleScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 3);
  const frame = useCurrentFrame();
  const size = fit(vlen(s.headline), P ? 124 : 150, P ? 100 : 118, 24);
  const sub = s.subline ? (
    <div style={{ ...useRise(30), fontSize: P ? 44 : 38, color: L.pal.muted, fontWeight: 500, textAlign: v === 1 ? "start" : "center" }}>
      {s.subline}
    </div>
  ) : null;
  if (v === 1) {
    // Left-aligned with a brand bar that draws itself.
    const bar = interpolate(frame, [0, 22], [0, 1], { extrapolateRight: "clamp" });
    return (
      <Stage image={s.image_url}>
        <Camera>
          <AbsoluteFill style={{ justifyContent: "center", padding: P ? "0 80px" : "0 160px", gap: 36 }}>
            <div style={{ width: 220 * bar, height: 14, background: L.brand.accent, borderRadius: 7 }} />
            <Headline text={s.headline} size={size} align="left" />
            {sub}
          </AbsoluteFill>
        </Camera>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  if (v === 2 && !s.image_url) {
    // A brand-color panel slides in; headline sits on it.
    const p = spring({ frame, fps: 30, config: { damping: 200 } });
    return (
      <Stage>
        <AbsoluteFill
          style={{
            background: L.brand.primary,
            clipPath: P ? `inset(${(1 - p) * 100}% 0 0 0)` : `inset(0 ${(1 - p) * 100}% 0 0)`,
          }}
        />
        <Camera>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 36, padding: P ? "0 70px" : "0 140px" }}>
            <Headline text={s.headline} size={size} color={onColor(L.brand.primary)} delay={8} />
            {s.subline ? (
              <div style={{ ...useRise(34), fontSize: P ? 44 : 38, color: mix(onColor(L.brand.primary), L.brand.primary, 0.25), fontWeight: 500, textAlign: "center" }}>
                {s.subline}
              </div>
            ) : null}
          </AbsoluteFill>
        </Camera>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  return (
    <Stage image={s.image_url}>
      <Camera>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 36, padding: P ? "0 70px" : "0 140px" }}>
          <Headline text={s.headline} size={size} />
          {sub}
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── cards ────────────────────────────────────────────────────────────────
const Badge: React.FC<{ badge: string; color: string; size?: number }> = ({ badge, color, size = 100 }) => {
  const L = useLook();
  const short = badge.length <= 2;
  return (
    <div
      style={{
        alignSelf: "flex-start",
        minWidth: size,
        height: size,
        padding: short ? 0 : `0 ${size * 0.26}px`,
        borderRadius: Math.min(size / 2, L.theme.radius + 30),
        background: color,
        color: onColor(color),
        fontFamily: L.head,
        fontWeight: L.theme.headWeight,
        fontSize: short ? size * 0.6 : size * 0.38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {badge}
    </div>
  );
};

const Card: React.FC<{ badge: string; title: string; text: string; color: string; delay: number; width: number; index: number; row?: boolean }> = ({
  badge,
  title,
  text,
  color,
  delay,
  width,
  index,
  row,
}) => {
  const L = useLook();
  return (
    <div
      style={{
        ...cardStyle(L),
        width,
        minHeight: row ? 0 : 360,
        padding: row ? "30px 40px" : 44,
        display: "flex",
        flexDirection: row ? "row" : "column",
        alignItems: row ? "center" : undefined,
        gap: row ? 34 : 20,
        ...useItemIn(delay, index),
      }}
    >
      <Badge badge={badge} color={color} size={row ? 90 : 100} />
      <div>
        <div style={{ fontFamily: L.head, fontWeight: L.theme.headWeight, fontSize: row ? 46 : 52, lineHeight: 1.05, textTransform: L.theme.headUpper ? "uppercase" : "none" }}>
          {title}
        </div>
        <div style={{ fontSize: L.social ? 36 : 28, color: surfaceMuted(L), lineHeight: L.social ? 1.35 : 1.4, marginTop: row ? 8 : 18 }}>{text}</div>
      </div>
    </div>
  );
};

const Cards: React.FC<{ s: CardsScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 2);
  const cards = (s.cards ?? []).slice(0, 3);
  const colors = [L.brand.primary, L.brand.accent, mix(L.brand.primary, "#000000", 0.45)];
  if (v === 1) {
    // Stacked rows, full width — reads like a list of three big ideas.
    return (
      <Stage image={s.image_url}>
        <Tag s={s} />
        <Camera>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: P ? 260 : 60, paddingTop: P ? 0 : 80, gap: P ? 50 : 40 }}>
            <Headline text={s.headline} size={P ? 92 : 78} />
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {cards.map((c, i) => (
                <Card key={i} {...c} color={colors[i]} delay={cueOf(s, i, 40, 18)} width={P ? 940 : 1300} index={i} row />
              ))}
            </div>
          </AbsoluteFill>
        </Camera>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  const w = P ? 900 : cards.length >= 3 ? 500 : 560;
  return (
    <Stage image={s.image_url}>
      <Tag s={s} />
      <Camera>
        <AbsoluteFill
          style={P ? { alignItems: "center", justifyContent: "center", paddingBottom: 260, gap: 50 } : { alignItems: "center", paddingTop: 130, gap: 60 }}
        >
          <Headline text={s.headline} size={P ? 96 : 84} />
          <div style={{ display: "flex", flexDirection: P ? "column" : "row", gap: P ? 36 : 50 }}>
            {cards.map((c, i) => (
              <Card key={i} {...c} color={colors[i]} delay={cueOf(s, i, 40, 18)} width={w} index={i} />
            ))}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── checklist ────────────────────────────────────────────────────────────
const Check: React.FC<{ text: string; delay: number; color: string; width: number; index: number; plain?: boolean }> = ({
  text,
  delay,
  color: wanted,
  width,
  index,
  plain,
}) => {
  const frame = useCurrentFrame();
  const L = useLook();
  const color = plain ? visible(L, wanted) : wanted;
  const tick = interpolate(frame - delay, [6, 18], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Social videos are watched on a phone, often small: bigger items (2026-11-12).
  const big = L.social;
  const box = plain ? { color: L.pal.ink, padding: "10px 4px" } : { ...cardStyle(L), padding: big ? "26px 32px" : "20px 28px" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: big ? 28 : 24, width, ...box, ...useItemIn(delay, index) }}>
      <svg width={big ? 58 : 44} height={big ? 58 : 44} viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
        {L.theme.shadow === "outline" || L.theme.texture === "lines" ? (
          <rect x="3" y="3" width="38" height="38" rx={Math.min(10, L.theme.radius)} fill="none" stroke={color} strokeWidth="4" />
        ) : (
          <circle cx="22" cy="22" r="22" fill={color} />
        )}
        <path
          d="M12 23 L19 30 L32 15"
          stroke={L.theme.shadow === "outline" || L.theme.texture === "lines" ? color : onColor(color)}
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="24"
          strokeDashoffset={tick}
        />
      </svg>
      <div style={{ fontSize: big ? 44 : 32, fontWeight: big ? 700 : 500, ...(big ? { lineHeight: 1.2 } : {}) }}>{text}</div>
    </div>
  );
};

const Checklist: React.FC<{ s: ChecklistScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 3);
  const items = (s.items ?? []).slice(0, 6);
  const sub = s.subline ? (
    <div style={{ ...useRise(20), fontSize: P ? 34 : 32, color: L.pal.muted, marginTop: 28, lineHeight: 1.4, textAlign: v === 0 || P ? "start" : "center" }}>
      {s.subline}
    </div>
  ) : null;
  if (v === 1 || (v === 2 && P)) {
    // Headline on top, items centered beneath.
    return (
      <Stage image={s.image_url}>
        <Tag s={s} />
        <Camera>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 44, paddingBottom: P ? 260 : 40, paddingTop: P ? 0 : 70 }}>
            <div style={{ maxWidth: P ? 940 : 1400 }}>
              <Headline text={s.headline} size={fit(vlen(s.headline), P ? 100 : 92, P ? 80 : 76, 26)} />
              {sub}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {items.map((t, i) => (
                <Check key={i} text={t} delay={cueOf(s, i)} color={L.brand.primary} width={P ? 940 : 1000} index={i} />
              ))}
            </div>
          </AbsoluteFill>
        </Camera>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  if (v === 2) {
    // Landscape: two columns of ticks, no boxes — airy.
    const half = Math.ceil(items.length / 2);
    return (
      <Stage image={s.image_url}>
        <Tag s={s} />
        <Camera>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 60, paddingTop: 60 }}>
            <div style={{ maxWidth: 1500 }}>
              <Headline text={s.headline} size={fit(vlen(s.headline), 96, 78, 26)} />
              {sub}
            </div>
            <div style={{ display: "flex", gap: 80 }}>
              {[items.slice(0, half), items.slice(half)].map((col, c) => (
                <div key={c} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {col.map((t, j) => {
                    const i = c * half + j;
                    return <Check key={i} text={t} delay={cueOf(s, i)} color={i % 2 ? L.brand.accent : L.brand.primary} width={640} index={i} plain />;
                  })}
                </div>
              ))}
            </div>
          </AbsoluteFill>
        </Camera>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  return (
    <Stage image={s.image_url}>
      <Tag s={s} />
      <Camera>
        <AbsoluteFill
          style={
            P
              ? { flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 260, gap: 50 }
              : { flexDirection: "row", alignItems: "center", padding: "0 120px", gap: 100 }
          }
        >
          <div style={{ width: P ? 920 : 620 }}>
            <Headline text={s.headline} size={fit(vlen(s.headline), 110, 84, 22)} align="left" />
            {sub}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {items.map((t, i) => (
              <Check key={i} text={t} delay={cueOf(s, i)} color={L.brand.primary} width={P ? 920 : 820} index={i} />
            ))}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── table ────────────────────────────────────────────────────────────────
const Table: React.FC<{ s: TableScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 2);
  const rows = (s.rows ?? []).slice(0, 6);
  const cols = (s.columns ?? []).slice(0, 3);
  const start = (i: number) => (i < rows.length ? cueOf(s, i, 45, 30) : Infinity);
  const active = rows.findIndex((_, i) => frame >= start(i) && frame < start(i + 1));
  const grid = `${P ? "1fr" : "1.1fr"} ${cols.map(() => (P ? "0.9fr" : "1.1fr")).join(" ")}`;
  const colColors = [L.brand.primary, L.brand.accent, mix(L.brand.primary, "#000000", 0.45)];
  const ink = surfaceInk(L);
  const headerFilled = v === 1 || L.theme.accentFill;
  return (
    <Stage image={s.image_url}>
      <Tag s={s} />
      <Camera amount={Math.min(0.025, L.theme.camera)}>
        <AbsoluteFill style={P ? { alignItems: "center", justifyContent: "center", paddingBottom: 260, gap: 50 } : { alignItems: "center", paddingTop: 120, gap: 44 }}>
          <Headline text={s.headline} size={P ? 100 : 90} />
          <div style={{ ...cardStyle(L), width: P ? 980 : 1400, overflow: "hidden", ...useRise(10, 60) }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                columnGap: 16,
                padding: P ? "22px 30px" : "22px 40px",
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: 1.5,
                color: surfaceMuted(L),
                borderBottom: `1px solid ${L.pal.line}`,
                background: headerFilled ? L.brand.primary : undefined,
              }}
            >
              <div />
              {cols.map((c, i) => (
                <div key={i} style={{ color: headerFilled ? onColor(L.brand.primary) : colColors[i] }}>
                  {c.toUpperCase()}
                </div>
              ))}
            </div>
            {rows.map((r, i) => {
              const shown = frame >= start(i);
              const o = interpolate(frame - start(i), [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: grid,
                    columnGap: 16,
                    alignItems: "center",
                    padding: P ? "28px 30px" : "24px 40px",
                    fontSize: P ? 30 : 32,
                    color: ink,
                    borderBottom: i < rows.length - 1 ? `1px solid ${L.pal.line}` : "none",
                    background: i === active ? mix(L.pal.surface, L.brand.accent, 0.12) : v === 1 && i % 2 ? mix(L.pal.surface, ink, 0.03) : "transparent",
                    opacity: shown ? 0.35 + 0.65 * o : 0.35,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{r.label}</div>
                  {cols.map((_, j) => (
                    <div key={j} style={{ opacity: o, color: r.warn?.[j] ? WARN : ink }}>
                      {r.values?.[j] ?? ""}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── columns ("which fits you") ───────────────────────────────────────────
const Column: React.FC<{ heading: string; points: string[]; color: string; delay: number; width: number }> = ({
  heading,
  points,
  color,
  delay,
  width,
}) => {
  const L = useLook();
  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: 22 }}>
      <div
        style={{
          ...useRise(delay),
          fontFamily: L.head,
          fontWeight: L.theme.headWeight,
          textTransform: L.theme.headUpper ? "uppercase" : "none",
          fontSize: fit(vlen(heading), 80, 64, 22) * L.theme.headScale,
        }}
      >
        <Starred text={heading} />
      </div>
      {(points ?? []).slice(0, 4).map((p, i) => (
        <div
          key={i}
          style={{
            ...cardStyle(L),
            ...useItemIn(delay + 14 + i * 12, i),
            fontSize: 34,
            padding: "18px 26px",
            borderLeft: `8px solid ${color}`,
          }}
        >
          {p}
        </div>
      ))}
    </div>
  );
};

const Columns: React.FC<{ s: ColumnsScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 2);
  const frame = useCurrentFrame();
  const colors = [L.brand.primary, L.brand.accent];
  const cols = (s.columns ?? []).slice(0, 2);
  const vsP = spring({ frame: frame - (cueOf(s, 1, 120, 8) - 10), fps: 30, config: { damping: 12 } });
  return (
    <Stage image={s.image_url}>
      <Tag s={s} />
      <Camera>
        <AbsoluteFill
          style={{
            flexDirection: P ? "column" : "row",
            justifyContent: "center",
            alignItems: P ? "center" : "flex-start",
            paddingTop: P ? 0 : 250,
            paddingBottom: P ? 260 : 0,
            gap: P ? 70 : v === 1 ? 170 : 110,
          }}
        >
          {cols.map((c, i) => (
            <Column key={i} {...c} color={colors[i]} delay={cueOf(s, i, 120, 8)} width={P ? 920 : 640} />
          ))}
        </AbsoluteFill>
      </Camera>
      {v === 1 && cols.length === 2 ? (
        // A "VS" badge between the two sides.
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none", paddingTop: P ? 0 : 120, paddingBottom: P ? 200 : 0 }}>
          <div
            style={{
              width: 130,
              height: 130,
              borderRadius: 65,
              background: L.brand.accent,
              color: onColor(L.brand.accent),
              fontFamily: L.head,
              fontWeight: 800,
              fontSize: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${vsP}) rotate(${(1 - vsP) * -40}deg)`,
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
            }}
          >
            VS
          </div>
        </AbsoluteFill>
      ) : null}
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── steps (a timeline) ───────────────────────────────────────────────────
const Steps: React.FC<{ s: StepsScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const frame = useCurrentFrame();
  const v = variantOf(s, 2);
  const steps = (s.steps ?? []).slice(0, 5);
  const first = cueOf(s, 0, 40, 24);
  const last = steps.length ? cueOf(s, steps.length - 1, 40, 24) : first;
  // The range must always go up, whatever the cues say.
  const line = interpolate(frame, [first, Math.max(first + 1, last + 10)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const vertical = P || v === 1;
  const dotBg = (i: number) => (i % 2 && L.theme.accentFill ? L.brand.accent : L.brand.primary);
  const dot = (i: number) => (
    <div
      style={{
        width: 88,
        height: 88,
        flexShrink: 0,
        borderRadius: Math.min(44, L.theme.radius + 20),
        background: dotBg(i),
        color: onColor(dotBg(i)),
        fontFamily: L.head,
        fontWeight: L.theme.headWeight,
        fontSize: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 0 0 8px ${L.pal.bg}`,
      }}
    >
      {i + 1}
    </div>
  );
  return (
    <Stage image={s.image_url}>
      <Tag s={s} />
      <Camera>
        <AbsoluteFill
          style={
            P
              ? { alignItems: "center", justifyContent: "center", paddingBottom: 260, gap: 56 }
              : vertical
                ? { flexDirection: "row", alignItems: "center", padding: "0 140px", gap: 90 }
                : { alignItems: "center", paddingTop: 150, gap: 80 }
          }
        >
          <div style={{ width: !P && vertical ? 620 : undefined }}>
            <Headline text={s.headline} size={P ? 96 : 88} align={!P && vertical ? "left" : "center"} />
          </div>
          <div style={{ position: "relative", display: "flex", flexDirection: vertical ? "column" : "row", gap: vertical ? 30 : 36 }}>
            {/* the line that draws itself from step to step */}
            <div
              style={{
                position: "absolute",
                background: L.brand.accent,
                opacity: 0.5,
                ...(vertical
                  ? { left: 42, top: 40, width: 4, height: `calc(${line * 100}% - 80px)` }
                  : { top: 42, left: 40, height: 4, width: `calc(${line * 100}% - 80px)` }),
              }}
            />
            {steps.map((st, i) => (
              <div
                key={i}
                style={{
                  ...useItemIn(cueOf(s, i, 40, 24), i),
                  position: "relative",
                  display: "flex",
                  flexDirection: vertical ? "row" : "column",
                  gap: 24,
                  width: vertical ? (P ? 900 : 860) : Math.min(400, 1600 / Math.max(1, steps.length) - 36),
                }}
              >
                {dot(i)}
                <div>
                  <div style={{ fontFamily: L.head, fontWeight: L.theme.headWeight, fontSize: (L.social ? 58 : 48) * L.theme.headScale, lineHeight: 1.05, textTransform: L.theme.headUpper ? "uppercase" : "none" }}>
                    {st.label}
                  </div>
                  <div style={{ fontSize: L.social ? 38 : 28, color: L.pal.muted, lineHeight: 1.4, marginTop: 10 }}>{st.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── stat (one big number) ────────────────────────────────────────────────
const Stat: React.FC<{ s: StatScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const P = usePortrait();
  const L = useLook();
  const v = variantOf(s, 2);
  const d = cueOf(s, 0, 0, 10);
  const p = spring({ frame: frame - d, fps, config: { damping: 14, mass: 0.8 } });
  const big = fit(vlen(s.value ?? ""), P ? 300 : 340, P ? 200 : 240, 5) * L.theme.headScale;
  const valueStyle: React.CSSProperties = {
    fontFamily: L.head,
    fontWeight: L.theme.headWeight,
    fontStyle: L.theme.headItalicAccent ? "italic" : "normal",
    fontSize: big,
    lineHeight: 1,
    color: L.brand.accent,
    transform: `scale(${0.6 + 0.4 * p})`,
    opacity: p,
  };
  if (L.theme.accentFill) {
    Object.assign(valueStyle, {
      color: onColor(L.brand.accent),
      background: L.brand.accent,
      padding: `${big * 0.08}px ${big * 0.18}px`,
      borderRadius: L.theme.radius,
    });
  }
  const label = (
    <div style={{ ...useRise(d + 12), fontFamily: L.head, fontWeight: L.theme.headWeight, fontSize: P ? 64 : 70, textAlign: v === 1 && !P ? "start" : "center", lineHeight: 1.1, textTransform: L.theme.headUpper ? "uppercase" : "none" }}>
      {s.label}
    </div>
  );
  const note = s.note ? (
    <div style={{ ...useRise(d + 24), fontSize: P ? 34 : 32, color: L.pal.muted, textAlign: v === 1 && !P ? "start" : "center", maxWidth: 1100, marginTop: 16 }}>{s.note}</div>
  ) : null;
  if (v === 1 && !P) {
    return (
      <Stage image={s.image_url}>
        <Tag s={s} />
        <Camera>
          <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 90, padding: "0 140px" }}>
            <div style={{ ...valueStyle, transformOrigin: "100% 50%" }}>{s.value}</div>
            <div style={{ maxWidth: 760 }}>
              {label}
              {note}
            </div>
          </AbsoluteFill>
        </Camera>
        <Caption lines={s.captions} />
      </Stage>
    );
  }
  return (
    <Stage image={s.image_url}>
      <Tag s={s} />
      <Camera>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 20, padding: P ? "0 80px 260px" : "0 160px" }}>
          <div style={valueStyle}>{s.value}</div>
          {label}
          {note}
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── phone (a text from the agent, then a tap to book) ────────────────────
const Bubble: React.FC<{ text: string; mine?: boolean; delay: number; color: string }> = ({ text, mine, delay, color }) => (
  <div
    style={{
      ...useRise(delay, 20),
      alignSelf: mine ? "flex-end" : "flex-start",
      maxWidth: 300,
      background: mine ? color : "#ECEAE6",
      color: mine ? onColor(color) : "#1D1B18",
      fontSize: 21,
      lineHeight: 1.35,
      padding: "14px 18px",
      borderRadius: 22,
    }}
  >
    {text}
  </div>
);

const PhoneView: React.FC<{ s: PhoneScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const P = usePortrait();
  const L = useLook();
  const brand = L.brand;
  const flip = variantOf(s, 2) === 1 && !P; // phone on the left
  const tapAt = Math.min(durationInFrames - 50, typeof s.cues?.[0] === "number" ? s.cues[0] - 24 : Math.round(durationInFrames * 0.7));
  const booked = frame >= tapAt + 18;
  const bookedP = interpolate(frame, [tapAt + 18, tapAt + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const phoneLeft = P ? 330 : flip ? 260 : 1180;
  const phoneTop = P ? 640 : 70;
  const phoneH = P ? 840 : 820;
  const btnX = phoneLeft + 210;
  const btnY = phoneTop + phoneH - 107;
  const msgs = (s.messages ?? []).slice(0, 3);
  return (
    <Stage image={s.image_url}>
      <Tag s={s} />
      <Camera amount={Math.min(0.03, L.theme.camera)}>
        <AbsoluteFill>
          <div style={{ position: "absolute", left: P ? 80 : flip ? 860 : 160, top: P ? 270 : 330, width: P ? 920 : 820 }}>
            <Headline text={s.headline} size={fit(vlen(s.headline), P ? 112 : 120, P ? 88 : 96, 20)} align="left" />
            <div style={{ ...useRise(24), fontSize: P ? 38 : 34, color: L.pal.muted, marginTop: 26, lineHeight: 1.4 }}>{s.text}</div>
          </div>
          <Phone style={{ position: "absolute", left: phoneLeft, top: phoneTop, height: phoneH, ...useRise(6, 80) }}>
            <div style={{ padding: "70px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
              <Logo brand={brand} size={48} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{brand.name}</div>
                <div style={{ fontSize: 15, color: "#6B665E" }}>Text message</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "26px 20px" }}>
              {msgs.map((m, i) => (
                <Bubble key={i} delay={30 + i * 40} mine={m.from === "client"} color={brand.primary} text={m.text} />
              ))}
            </div>
            <div
              style={{
                position: "absolute",
                left: 30,
                right: 30,
                bottom: 70,
                height: 74,
                borderRadius: Math.min(18, L.theme.radius + 6),
                background: booked ? "#2E7D4F" : brand.primary,
                color: booked ? "#fff" : onColor(brand.primary),
                fontSize: 24,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: "0 12px",
                ...useRise(30 + msgs.length * 40, 20),
              }}
            >
              {booked ? <span style={{ opacity: bookedP }}>{s.done}</span> : s.button}
            </div>
          </Phone>
          <Tap from={[btnX + 160, btnY + 220]} to={[btnX, btnY]} start={tapAt} />
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// Social videos get their own end card (button + question); explainers keep theirs.
const EndView: React.FC<{ s: EndScene }> = ({ s }) => (useLook().social ? <SocialEnd s={s} /> : <End s={s} />);

// ── end card ─────────────────────────────────────────────────────────────
const End: React.FC<{ s: EndScene }> = ({ s }) => {
  const P = usePortrait();
  const L = useLook();
  const brand = L.brand;
  const v = variantOf(s, 2);
  const contact = [brand.phone, brand.website].filter(Boolean);
  const disclaimer = s.disclaimer ? (
    <div
      style={{
        ...useRise(60, 10),
        position: "absolute",
        bottom: P ? 140 : 48,
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
  if (v === 1 && !P) {
    // Split: headline left, a contact card right.
    return (
      <Stage image={s.image_url}>
        <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 100, padding: "0 140px 120px" }}>
          <div style={{ width: 860 }}>
            <Headline text={s.headline} size={fit(vlen(s.headline), 104, 84, 34)} delay={8} align="left" />
          </div>
          <div style={{ ...cardStyle(L), ...useItemIn(30), padding: 50, width: 560, display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-start" }}>
            <Logo brand={brand} size={100} />
            <div style={{ fontSize: 38, fontWeight: 800 }}>{brand.name}</div>
            {contact.map((c, i) => (
              <div key={i} dir="ltr" style={{ fontSize: 32, color: surfaceMuted(L), unicodeBidi: "isolate" }}>
                {c}
              </div>
            ))}
          </div>
        </AbsoluteFill>
        {disclaimer}
      </Stage>
    );
  }
  return (
    <Stage image={s.image_url}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 34, padding: P ? "0 70px 160px" : "0 120px 90px" }}>
        <div style={useRise(4)}>
          <Logo brand={brand} size={110} />
        </div>
        <Headline text={s.headline} size={fit(vlen(s.headline), P ? 110 : 104, P ? 88 : 84, 34)} delay={12} />
        <div
          style={{
            ...useRise(40),
            display: "flex",
            flexDirection: P ? "column" : "row",
            gap: P ? 10 : 22,
            alignItems: "center",
            fontSize: P ? 42 : 34,
            color: L.pal.muted,
          }}
        >
          <span style={{ fontWeight: 700, color: L.pal.ink }}>{brand.name}</span>
          {contact.map((c, i) => (
            <React.Fragment key={i}>
              {!P && <span style={{ opacity: 0.4 }}>·</span>}
              <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{c}</span>
            </React.Fragment>
          ))}
        </div>
      </AbsoluteFill>
      {disclaimer}
    </Stage>
  );
};

export const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => (
  <SceneWordsProvider words={scene.words}>
    <SceneBody scene={scene} />
  </SceneWordsProvider>
);

const SceneBody: React.FC<{ scene: Scene }> = ({ scene }) => {
  switch (scene.type) {
    case "title":
      return <Title s={scene} />;
    case "cards":
      return <Cards s={scene} />;
    case "checklist":
      return <Checklist s={scene} />;
    case "table":
      return <Table s={scene} />;
    case "columns":
      return <Columns s={scene} />;
    case "steps":
      return <Steps s={scene} />;
    case "stat":
      return <Stat s={scene} />;
    case "phone":
      return <PhoneView s={scene} />;
    case "end":
      return <EndView s={scene} />;
    case "hook":
      return <Hook s={scene} />;
    case "stamps":
      return <Stamps s={scene} />;
    case "screen":
      return <Screen s={scene} />;
    case "media":
      return <Media s={scene} />;
    case "tip":
      return <Tip s={scene} />;
    case "date":
      return <DateView s={scene} />;
    case "profile":
      return <Profile s={scene} />;
    case "quote":
      return <Quote s={scene} />;
    default:
      return <Stage>{null}</Stage>;
  }
};
