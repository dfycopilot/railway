// The scene library: each scene type draws itself from the recipe (spec.ts)
// in landscape or portrait, timed to the narration through `cues`.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Brand,
  Camera,
  Caption,
  Headline,
  INK,
  Logo,
  MUTED,
  Phone,
  SANS,
  SERIF,
  SectionTag,
  Stage,
  Tap,
  usePortrait,
  useRise,
} from "./kit";
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

const WARN = "#A2461B";

// Frame an item appears at: its cue from the narration, or an even spread.
const cueOf = (s: Scene, i: number, spread = 20, first = 24) => {
  const c = s.cues?.[i];
  return typeof c === "number" && Number.isFinite(c) ? Math.max(0, c - 6) : first + i * spread;
};

// "*word*" → accent italic, inline (for small headings that don't animate per word).
const Starred: React.FC<{ text: string; accent: string }> = ({ text, accent }) => (
  <>
    {text.split(/(\*[^*]+\*)/g).map((part, i) =>
      part.startsWith("*") && part.endsWith("*") ? (
        <span key={i} style={{ fontStyle: "italic", color: accent }}>
          {part.slice(1, -1)}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

const fit = (len: number, big: number, small: number, longAt = 28) => (len > longAt ? small : big);

// ── title ────────────────────────────────────────────────────────────────
const Title: React.FC<{ s: TitleScene; brand: Brand }> = ({ s, brand }) => {
  const P = usePortrait();
  const size = fit(s.headline.length, P ? 124 : 150, P ? 100 : 118, 24);
  return (
    <Stage dark>
      <Camera>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 36, padding: P ? "0 70px" : "0 140px" }}>
          <Headline text={s.headline} size={size} accent={brand.accent} />
          {s.subline ? (
            <div style={{ ...useRise(30), fontSize: P ? 44 : 38, color: "#CFC9BF", fontWeight: 500, textAlign: "center" }}>
              {s.subline}
            </div>
          ) : null}
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── cards ────────────────────────────────────────────────────────────────
const Card: React.FC<{ badge: string; title: string; text: string; color: string; delay: number; width: number }> = ({
  badge,
  title,
  text,
  color,
  delay,
  width,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 18, mass: 0.9 } });
  const short = badge.length <= 2;
  return (
    <div
      style={{
        width,
        minHeight: 360,
        borderRadius: 28,
        background: "#FFFFFF",
        boxShadow: "0 30px 60px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)",
        padding: 44,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        opacity: Math.min(1, p * 1.4),
        transform: `perspective(1400px) translateY(${(1 - p) * 140}px) rotateX(${(1 - p) * 18}deg)`,
      }}
    >
      <div
        style={{
          alignSelf: "flex-start",
          minWidth: 100,
          height: 100,
          padding: short ? 0 : "0 26px",
          borderRadius: 50,
          background: color,
          color: "#fff",
          fontFamily: SERIF,
          fontSize: short ? 64 : 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {badge}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 52, lineHeight: 1.05 }}>{title}</div>
      <div style={{ fontSize: 28, color: MUTED, lineHeight: 1.4 }}>{text}</div>
    </div>
  );
};

const Cards: React.FC<{ s: CardsScene; brand: Brand }> = ({ s, brand }) => {
  const P = usePortrait();
  const cards = (s.cards ?? []).slice(0, 3);
  const colors = [brand.primary, brand.accent, INK];
  const w = P ? 900 : cards.length >= 3 ? 500 : 560;
  return (
    <Stage>
      {s.tag ? <SectionTag label={s.tag} /> : null}
      <Camera>
        <AbsoluteFill
          style={
            P
              ? { alignItems: "center", justifyContent: "center", paddingBottom: 260, gap: 50 }
              : { alignItems: "center", paddingTop: 130, gap: 60 }
          }
        >
          <Headline text={s.headline} size={P ? 96 : 84} accent={brand.accent} />
          <div style={{ display: "flex", flexDirection: P ? "column" : "row", gap: P ? 36 : 50 }}>
            {cards.map((c, i) => (
              <Card key={i} {...c} color={colors[i]} delay={cueOf(s, i, 40, 18)} width={w} />
            ))}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── checklist ────────────────────────────────────────────────────────────
const Check: React.FC<{ text: string; delay: number; color: string }> = ({ text, delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const P = usePortrait();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const tick = interpolate(frame - delay, [6, 18], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        opacity: p,
        transform: `translateX(${(1 - p) * 60}px)`,
        background: "#FFFFFF",
        borderRadius: 18,
        padding: "20px 28px",
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        width: P ? 920 : 820,
      }}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
        <circle cx="22" cy="22" r="22" fill={color} />
        <path
          d="M12 23 L19 30 L32 15"
          stroke="#fff"
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="24"
          strokeDashoffset={tick}
        />
      </svg>
      <div style={{ fontSize: 32, fontWeight: 500 }}>{text}</div>
    </div>
  );
};

const Checklist: React.FC<{ s: ChecklistScene; brand: Brand }> = ({ s, brand }) => {
  const P = usePortrait();
  return (
    <Stage>
      {s.tag ? <SectionTag label={s.tag} /> : null}
      <Camera>
        <AbsoluteFill
          style={
            P
              ? { flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 260, gap: 50 }
              : { flexDirection: "row", alignItems: "center", padding: "0 120px", gap: 100 }
          }
        >
          <div style={{ width: P ? 920 : 620 }}>
            <Headline text={s.headline} size={fit(s.headline.length, 110, 84, 22)} accent={brand.accent} align="left" />
            {s.subline ? (
              <div style={{ ...useRise(20), fontSize: P ? 34 : 32, color: MUTED, marginTop: 28, lineHeight: 1.4 }}>
                {s.subline}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {(s.items ?? []).slice(0, 6).map((t, i) => (
              <Check key={i} text={t} delay={cueOf(s, i)} color={brand.primary} />
            ))}
          </div>
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── table ────────────────────────────────────────────────────────────────
const Table: React.FC<{ s: TableScene; brand: Brand }> = ({ s, brand }) => {
  const frame = useCurrentFrame();
  const P = usePortrait();
  const rows = (s.rows ?? []).slice(0, 6);
  const cols = (s.columns ?? []).slice(0, 3);
  const start = (i: number) => (i < rows.length ? cueOf(s, i, 45, 30) : Infinity);
  const active = rows.findIndex((_, i) => frame >= start(i) && frame < start(i + 1));
  const grid = `${P ? "1fr" : "1.1fr"} ${cols.map(() => (P ? "0.9fr" : "1.1fr")).join(" ")}`;
  const colColors = [brand.primary, brand.accent, INK];
  return (
    <Stage>
      {s.tag ? <SectionTag label={s.tag} /> : null}
      <Camera amount={0.025}>
        <AbsoluteFill
          style={
            P
              ? { alignItems: "center", justifyContent: "center", paddingBottom: 260, gap: 50 }
              : { alignItems: "center", paddingTop: 120, gap: 44 }
          }
        >
          <Headline text={s.headline} size={P ? 100 : 90} accent={brand.accent} />
          <div
            style={{
              width: P ? 980 : 1400,
              background: "#FFFFFF",
              borderRadius: 26,
              boxShadow: "0 30px 60px rgba(0,0,0,0.08)",
              overflow: "hidden",
              ...useRise(10, 60),
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                columnGap: 16,
                padding: P ? "22px 30px" : "22px 40px",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 1.5,
                color: MUTED,
                borderBottom: "1px solid #ECE8E0",
              }}
            >
              <div />
              {cols.map((c, i) => (
                <div key={i} style={{ color: colColors[i] }}>
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
                    borderBottom: i < rows.length - 1 ? "1px solid #F1EEE8" : "none",
                    background: i === active ? "#FBF6EE" : "transparent",
                    opacity: shown ? 0.35 + 0.65 * o : 0.35,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  {cols.map((_, j) => (
                    <div key={j} style={{ opacity: o, color: r.warn?.[j] ? WARN : INK }}>
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
const Column: React.FC<{ heading: string; points: string[]; color: string; accent: string; delay: number }> = ({
  heading,
  points,
  color,
  delay,
}) => {
  const P = usePortrait();
  return (
    <div style={{ width: P ? 920 : 640, display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ ...useRise(delay), fontFamily: SERIF, fontSize: fit(heading.length, 80, 64, 22) }}>
        <Starred text={heading} accent={color} />
      </div>
      {(points ?? []).slice(0, 4).map((p, i) => (
        <div
          key={i}
          style={{
            ...useRise(delay + 14 + i * 12, 30),
            fontSize: 34,
            padding: "18px 26px",
            borderLeft: `6px solid ${color}`,
            background: "#FFFFFF",
            borderRadius: 12,
          }}
        >
          {p}
        </div>
      ))}
    </div>
  );
};

const Columns: React.FC<{ s: ColumnsScene; brand: Brand }> = ({ s, brand }) => {
  const P = usePortrait();
  const colors = [brand.primary, brand.accent];
  return (
    <Stage>
      {s.tag ? <SectionTag label={s.tag} /> : null}
      <Camera>
        <AbsoluteFill
          style={{
            flexDirection: P ? "column" : "row",
            justifyContent: "center",
            alignItems: P ? "center" : "flex-start",
            paddingTop: P ? 0 : 250,
            paddingBottom: P ? 260 : 0,
            gap: P ? 70 : 110,
          }}
        >
          {(s.columns ?? []).slice(0, 2).map((c, i) => (
            <Column key={i} {...c} color={colors[i]} accent={brand.accent} delay={cueOf(s, i, 120, 8)} />
          ))}
        </AbsoluteFill>
      </Camera>
      <Caption lines={s.captions} />
    </Stage>
  );
};

// ── steps (a timeline) ───────────────────────────────────────────────────
const Steps: React.FC<{ s: StepsScene; brand: Brand }> = ({ s, brand }) => {
  const P = usePortrait();
  const frame = useCurrentFrame();
  const steps = (s.steps ?? []).slice(0, 5);
  const first = cueOf(s, 0, 40, 24);
  const last = steps.length ? cueOf(s, steps.length - 1, 40, 24) : first;
  // The range must always go up, whatever the cues say.
  const line = interpolate(frame, [first, Math.max(first + 1, last + 10)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Stage>
      {s.tag ? <SectionTag label={s.tag} /> : null}
      <Camera>
        <AbsoluteFill
          style={
            P
              ? { alignItems: "center", justifyContent: "center", paddingBottom: 260, gap: 56 }
              : { alignItems: "center", paddingTop: 150, gap: 80 }
          }
        >
          <Headline text={s.headline} size={P ? 96 : 88} accent={brand.accent} />
          <div style={{ position: "relative", display: "flex", flexDirection: P ? "column" : "row", gap: P ? 30 : 36 }}>
            {/* the line that draws itself from step to step */}
            <div
              style={{
                position: "absolute",
                background: brand.accent,
                opacity: 0.5,
                ...(P
                  ? { left: 44, top: 40, width: 4, height: `calc(${line * 100}% - 80px)` }
                  : { top: 44, left: 40, height: 4, width: `calc(${line * 100}% - 80px)` }),
              }}
            />
            {steps.map((st, i) => (
              <div
                key={i}
                style={{
                  ...useRise(cueOf(s, i, 40, 24), 40),
                  position: "relative",
                  display: "flex",
                  flexDirection: P ? "row" : "column",
                  alignItems: P ? "flex-start" : "flex-start",
                  gap: 24,
                  width: P ? 900 : Math.min(400, 1600 / steps.length - 36),
                }}
              >
                <div
                  style={{
                    width: 88,
                    height: 88,
                    flexShrink: 0,
                    borderRadius: 44,
                    background: brand.primary,
                    color: "#fff",
                    fontFamily: SERIF,
                    fontSize: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 0 8px #F3F0EA",
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 48, lineHeight: 1.05 }}>{st.label}</div>
                  <div style={{ fontSize: 28, color: MUTED, lineHeight: 1.4, marginTop: 10 }}>{st.detail}</div>
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
const Stat: React.FC<{ s: StatScene; brand: Brand }> = ({ s, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const P = usePortrait();
  const d = cueOf(s, 0, 0, 10);
  const p = spring({ frame: frame - d, fps, config: { damping: 14, mass: 0.8 } });
  const big = fit((s.value ?? "").length, P ? 300 : 340, P ? 200 : 240, 5);
  return (
    <Stage>
      {s.tag ? <SectionTag label={s.tag} /> : null}
      <Camera>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 20, padding: P ? "0 80px 260px" : "0 160px" }}>
          <div
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: big,
              lineHeight: 1,
              color: brand.accent,
              transform: `scale(${0.6 + 0.4 * p})`,
              opacity: p,
            }}
          >
            {s.value}
          </div>
          <div style={{ ...useRise(d + 12), fontFamily: SERIF, fontSize: P ? 64 : 70, textAlign: "center", lineHeight: 1.1 }}>
            {s.label}
          </div>
          {s.note ? (
            <div style={{ ...useRise(d + 24), fontSize: P ? 34 : 32, color: MUTED, textAlign: "center", maxWidth: 1100 }}>
              {s.note}
            </div>
          ) : null}
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
      color: mine ? "#fff" : INK,
      fontSize: 21,
      lineHeight: 1.35,
      padding: "14px 18px",
      borderRadius: 22,
    }}
  >
    {text}
  </div>
);

const PhoneView: React.FC<{ s: PhoneScene; brand: Brand }> = ({ s, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const P = usePortrait();
  const tapAt = Math.min(
    durationInFrames - 50,
    typeof s.cues?.[0] === "number" ? s.cues[0] - 24 : Math.round(durationInFrames * 0.7),
  );
  const booked = frame >= tapAt + 18;
  const bookedP = interpolate(frame, [tapAt + 18, tapAt + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const phoneLeft = P ? 330 : 1180;
  const phoneTop = P ? 640 : 70;
  const phoneH = P ? 840 : 820;
  const btnX = phoneLeft + 210;
  const btnY = phoneTop + phoneH - 107;
  const msgs = (s.messages ?? []).slice(0, 3);
  return (
    <Stage>
      {s.tag ? <SectionTag label={s.tag} /> : null}
      <Camera amount={0.03}>
        <AbsoluteFill>
          <div style={{ position: "absolute", left: P ? 80 : 160, top: P ? 270 : 330, width: P ? 920 : 820 }}>
            <Headline text={s.headline} size={fit(s.headline.length, P ? 112 : 120, P ? 88 : 96, 20)} accent={brand.accent} align="left" />
            <div style={{ ...useRise(24), fontSize: P ? 38 : 34, color: MUTED, marginTop: 26, lineHeight: 1.4 }}>{s.text}</div>
          </div>
          <Phone style={{ position: "absolute", left: phoneLeft, top: phoneTop, height: phoneH, ...useRise(6, 80) }}>
            <div style={{ padding: "70px 22px 0", display: "flex", alignItems: "center", gap: 12 }}>
              <Logo brand={brand} size={48} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{brand.name}</div>
                <div style={{ fontSize: 15, color: MUTED }}>Text message</div>
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
                borderRadius: 18,
                background: booked ? "#2E7D4F" : brand.primary,
                color: "#fff",
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

// ── end card ─────────────────────────────────────────────────────────────
const End: React.FC<{ s: EndScene; brand: Brand }> = ({ s, brand }) => {
  const P = usePortrait();
  const contact = [brand.phone, brand.website].filter(Boolean);
  return (
    <Stage dark>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 34, padding: P ? "0 70px 160px" : "0 120px 90px" }}>
        <div style={useRise(4)}>
          <Logo brand={brand} size={110} />
        </div>
        <Headline text={s.headline} size={fit(s.headline.length, P ? 110 : 104, P ? 88 : 84, 34)} delay={12} accent={brand.accent} />
        <div
          style={{
            ...useRise(40),
            display: "flex",
            flexDirection: P ? "column" : "row",
            gap: P ? 10 : 22,
            alignItems: "center",
            fontSize: P ? 42 : 34,
            color: "#E9E4DA",
          }}
        >
          <span style={{ fontWeight: 700 }}>{brand.name}</span>
          {contact.map((c, i) => (
            <React.Fragment key={i}>
              {!P && <span style={{ opacity: 0.4 }}>·</span>}
              <span>{c}</span>
            </React.Fragment>
          ))}
        </div>
      </AbsoluteFill>
      {s.disclaimer ? (
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
            color: "#9C968C",
            fontFamily: SANS,
          }}
        >
          {s.disclaimer}
        </div>
      ) : null}
    </Stage>
  );
};

export const SceneView: React.FC<{ scene: Scene; brand: Brand }> = ({ scene, brand }) => {
  switch (scene.type) {
    case "title":
      return <Title s={scene} brand={brand} />;
    case "cards":
      return <Cards s={scene} brand={brand} />;
    case "checklist":
      return <Checklist s={scene} brand={brand} />;
    case "table":
      return <Table s={scene} brand={brand} />;
    case "columns":
      return <Columns s={scene} brand={brand} />;
    case "steps":
      return <Steps s={scene} brand={brand} />;
    case "stat":
      return <Stat s={scene} brand={brand} />;
    case "phone":
      return <PhoneView s={scene} brand={brand} />;
    case "end":
      return <End s={scene} brand={brand} />;
    default:
      return <Stage>{null}</Stage>;
  }
};
