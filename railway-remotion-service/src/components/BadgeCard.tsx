/**
 * BadgeCard — themed callout card with icon + category label + title + tagline.
 *
 * The structure mirrors the AgencyBloc-style reference Eric showed: a small
 * uppercase category strip ("REAL", "CERTIFIED", "AUDIT RISK"), a big bold
 * title beneath it, an optional tagline, and a leading icon. Cards can be
 * stacked vertically by passing `index` so the planner can emit two or three
 * "claim badges" at once on the same beat.
 *
 * Visual contract:
 *   ┌──────────────────────────────────┐
 *   │ ◯  CATEGORY                     │
 *   │    Big Bold Title               │
 *   │    optional tagline beneath      │
 *   └──────────────────────────────────┘
 *
 * Aesthetic:
 *   - default = solid dark card with a colored border + glow
 *   - glass   = translucent GlassCard wrapper
 *   - solid_red / solid_orange / solid_green = filled card
 *
 * Icons: built-in lucide-style glyphs drawn as inline SVG so we don't need a
 * runtime icon library. Falls back to a colored dot if `icon` is unrecognized.
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { getOverlayScale } from "./aspectSafe";
import { GlassCard } from "./GlassCard";

export type BadgeIcon =
  | "warning"
  | "check"
  | "shield"
  | "star"
  | "alert"
  | "info"
  | "dollar"
  | "trending_up"
  | "trending_down"
  | "lightning"
  | "lock"
  | "none";

export type BadgeAesthetic =
  | "default"
  | "glass"
  | "solid_red"
  | "solid_orange"
  | "solid_green"
  | "solid_blue";

export interface BadgeCardItem {
  /** Tiny uppercase category label above the title (e.g. "REAL", "CERTIFIED"). Optional. */
  category?: string;
  /** The main bold title (e.g. "TAX ATTORNEYS", "AUDIT RISK"). */
  title: string;
  /** Optional small tagline that sits beneath the title. */
  tagline?: string;
  /** Built-in icon to draw on the left. Defaults to "check". */
  icon?: BadgeIcon;
  /** Override the card's accent color. Defaults to the aesthetic's stock color. */
  accentColor?: string;
}

interface BadgeCardProps {
  startFrame: number;
  durationFrames: number;
  /** One card, OR an array of cards (renders stacked vertically). */
  cards?: BadgeCardItem[];
  /** Convenience: pass a single card via top-level fields instead of `cards`. */
  category?: string;
  title?: string;
  tagline?: string;
  icon?: BadgeIcon;
  accentColor?: string;
  /** Card variant. */
  aesthetic?: BadgeAesthetic;
  /** Vertical position. center is default. */
  position?: "top" | "center" | "bottom";
}

// ─── Inline SVG icon library ────────────────────────────────────────────────
const Icons: Record<BadgeIcon, (size: number, color: string) => React.ReactNode> = {
  warning: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  check: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  shield: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  star: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  alert: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  info: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  dollar: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  trending_up: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  trending_down: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  ),
  lightning: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  lock: (size, color) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  none: () => null,
};

const AESTHETIC_COLORS: Record<BadgeAesthetic, { accent: string; background: string; border: string; titleColor: string; categoryColor: string; iconBg: string }> = {
  default: {
    accent: "#FF7A00",
    background: "rgba(0,0,0,0.92)",
    border: "#FF7A00",
    titleColor: "#FFFFFF",
    categoryColor: "#FF7A00",
    iconBg: "#FF7A00",
  },
  glass: {
    accent: "#FFD700",
    background: "rgba(0,0,0,0.0)", // GlassCard handles background
    border: "transparent",
    titleColor: "#FFFFFF",
    categoryColor: "#FFD700",
    iconBg: "#FFD700",
  },
  solid_red: {
    accent: "#FFFFFF",
    background: "#E53935",
    border: "#FFFFFF",
    titleColor: "#FFFFFF",
    categoryColor: "rgba(255,255,255,0.85)",
    iconBg: "#FFFFFF",
  },
  solid_orange: {
    accent: "#FFFFFF",
    background: "#FF7A00",
    border: "#FFFFFF",
    titleColor: "#FFFFFF",
    categoryColor: "rgba(255,255,255,0.85)",
    iconBg: "#FFFFFF",
  },
  solid_green: {
    accent: "#FFFFFF",
    background: "#16A34A",
    border: "#FFFFFF",
    titleColor: "#FFFFFF",
    categoryColor: "rgba(255,255,255,0.85)",
    iconBg: "#FFFFFF",
  },
  solid_blue: {
    accent: "#FFFFFF",
    background: "#1D4ED8",
    border: "#FFFFFF",
    titleColor: "#FFFFFF",
    categoryColor: "rgba(255,255,255,0.85)",
    iconBg: "#FFFFFF",
  },
};

export const BadgeCard: React.FC<BadgeCardProps> = ({
  startFrame,
  durationFrames,
  cards,
  category,
  title,
  tagline,
  icon = "check",
  accentColor,
  aesthetic = "default",
  position = "center",
}) => {
  const frame = useCurrentFrame();
  const { fps, width: compWidth } = useVideoConfig();
  const scale = getOverlayScale(compWidth);
  const localFrame = frame - startFrame;

  if (localFrame < 0 || localFrame > durationFrames) return null;

  // Resolve list of cards (allow either `cards: []` OR top-level shorthand)
  const cardList: BadgeCardItem[] = Array.isArray(cards) && cards.length > 0
    ? cards
    : title
      ? [{ category, title, tagline, icon, accentColor }]
      : [];

  if (cardList.length === 0) return null;

  // Group entrance animation — each card enters with a small stagger so a
  // stack of 2-3 reads as a natural reveal rather than a single block.
  const opacity = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const exitStart = durationFrames - 12;
  const exitOpacity = localFrame > exitStart
    ? interpolate(localFrame, [exitStart, durationFrames], [1, 0], { extrapolateRight: "clamp" })
    : 1;

  const positionStyle: React.CSSProperties =
    position === "top"
      ? { top: "12%", left: "50%", transform: "translateX(-50%)" }
      : position === "bottom"
      ? { bottom: "12%", left: "50%", transform: "translateX(-50%)" }
      : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        opacity: opacity * exitOpacity,
        display: "flex",
        flexDirection: "column",
        gap: Math.round(14 * scale),
        zIndex: 60,
        width: "84%",
        maxWidth: "84%",
      }}
    >
      {cardList.map((card, idx) => (
        <SingleBadge
          key={idx}
          index={idx}
          localFrame={localFrame}
          fps={fps}
          scale={scale}
          aesthetic={aesthetic}
          card={card}
        />
      ))}
    </div>
  );
};

const SingleBadge: React.FC<{
  index: number;
  localFrame: number;
  fps: number;
  scale: number;
  aesthetic: BadgeAesthetic;
  card: BadgeCardItem;
}> = ({ index, localFrame, fps, scale, aesthetic, card }) => {
  const palette = AESTHETIC_COLORS[aesthetic];
  const accent = card.accentColor ?? palette.accent;
  const stagger = index * 4;

  const enterProgress = spring({
    frame: Math.max(0, localFrame - stagger),
    fps,
    config: { damping: 16, stiffness: 200, mass: 0.9 },
  });

  const animX = interpolate(enterProgress, [0, 1], [-40, 0]);
  const animScale = interpolate(enterProgress, [0, 1], [0.85, 1]);

  const iconSize = Math.round(40 * scale);
  const iconCircle = Math.round(60 * scale);

  const inner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(20 * scale),
        padding: `${Math.round(18 * scale)}px ${Math.round(28 * scale)}px`,
      }}
    >
      {card.icon !== "none" ? (
        <div
          style={{
            flex: "none",
            width: iconCircle,
            height: iconCircle,
            borderRadius: "50%",
            background: aesthetic === "glass" ? "rgba(255,255,255,0.12)" : palette.iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: aesthetic === "glass" ? "none" : `0 0 ${Math.round(20 * scale)}px ${accent}55`,
          }}
        >
          {Icons[card.icon ?? "check"](
            iconSize,
            aesthetic === "glass" || aesthetic === "default" ? "#000000" : palette.background,
          )}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: Math.round(4 * scale), minWidth: 0 }}>
        {card.category ? (
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 700,
              fontSize: Math.round(20 * scale),
              color: palette.categoryColor,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              lineHeight: 1,
              opacity: 0.95,
            }}
          >
            {card.category}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: "Oswald, sans-serif",
            fontWeight: 700,
            fontSize: Math.round(46 * scale),
            color: palette.titleColor,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            lineHeight: 1.05,
            wordBreak: "break-word",
          }}
        >
          {card.title}
        </div>
        {card.tagline ? (
          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: Math.round(20 * scale),
              color: palette.titleColor,
              opacity: 0.85,
              marginTop: Math.round(2 * scale),
              wordBreak: "break-word",
            }}
          >
            {card.tagline}
          </div>
        ) : null}
      </div>
    </div>
  );

  const wrapperStyle: React.CSSProperties = {
    transform: `translateX(${animX}px) scale(${animScale})`,
    opacity: enterProgress,
    width: "100%",
  };

  if (aesthetic === "glass") {
    return (
      <div style={wrapperStyle}>
        <GlassCard
          tone="dark"
          accentColor={accent}
          radius={Math.round(18 * scale)}
          padding="0"
          style={{ width: "100%" }}
        >
          {inner}
        </GlassCard>
      </div>
    );
  }

  return (
    <div
      style={{
        ...wrapperStyle,
        background: palette.background,
        border: `2px solid ${accent}`,
        borderRadius: Math.round(18 * scale),
        boxShadow: `0 0 ${Math.round(28 * scale)}px ${accent}55, 0 ${Math.round(8 * scale)}px ${Math.round(24 * scale)}px rgba(0,0,0,0.55)`,
      }}
    >
      {inner}
    </div>
  );
};

export default BadgeCard;
