/**
 * GlassCard — liquid-glass aesthetic primitive.
 *
 * Visual recipe:
 *   - Frosted backdrop-filter blur + saturation boost (the iOS / visionOS look)
 *   - Multi-stop gradient border to fake refraction
 *   - Soft inner highlight on the top edge
 *   - Big soft shadow for depth
 *   - Subtle gradient fill so the card isn't a flat tint
 *
 * Used by:
 *   1. The new "glass" aesthetic preset (TitleCard / LowerThird / StatCallout
 *      can render their content inside a GlassCard for a premium look)
 *   2. CompanionPanel (when companion.style === "glass")
 *
 * Accepts a `children` slot so callers can drop arbitrary text/icons inside.
 *
 * Why a backdrop-filter glass effect works in Remotion: Chromium-headless
 * (Remotion's render runtime) supports backdrop-filter natively as of Chrome
 * 76+. Our Dockerfile pins Chrome >=120 so this is safe.
 */

import React, { CSSProperties } from "react";

export type GlassTone = "light" | "dark" | "tinted";

export interface GlassCardProps {
  children?: React.ReactNode;
  /** Color theme for the glass: "light" = white tint, "dark" = black tint, "tinted" = uses accentColor */
  tone?: GlassTone;
  /** Hex accent color, used for the gradient border + (if tone="tinted") the fill */
  accentColor?: string;
  /** Border radius in px. Defaults to 24. */
  radius?: number;
  /** Padding inside the card. Defaults to "32px 40px". */
  padding?: string | number;
  /** Extra style overrides (alignment, position, etc.) */
  style?: CSSProperties;
  /** If true, wraps children in a flex column with center alignment. Defaults true. */
  centerContent?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  tone = "dark",
  accentColor = "#FFD700",
  radius = 24,
  padding = "32px 40px",
  style,
  centerContent = true,
}) => {
  const fillStart =
    tone === "light"
      ? "rgba(255,255,255,0.18)"
      : tone === "tinted"
      ? hexToRgba(accentColor, 0.18)
      : "rgba(15,15,25,0.42)";

  const fillEnd =
    tone === "light"
      ? "rgba(255,255,255,0.06)"
      : tone === "tinted"
      ? hexToRgba(accentColor, 0.05)
      : "rgba(15,15,25,0.18)";

  // The gradient border uses 3 stops — accent on top-left, white on top-right,
  // accent on bottom-right — to fake the refraction highlights you see on
  // real glass.
  const borderGradient = `linear-gradient(135deg, ${hexToRgba(accentColor, 0.85)} 0%, rgba(255,255,255,0.55) 35%, rgba(255,255,255,0.05) 60%, ${hexToRgba(accentColor, 0.6)} 100%)`;

  const innerStyle: CSSProperties = {
    position: "relative",
    borderRadius: radius,
    padding,
    background: `linear-gradient(155deg, ${fillStart} 0%, ${fillEnd} 100%)`,
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    boxShadow: [
      "0 24px 60px rgba(0,0,0,0.35)",
      "0 4px 16px rgba(0,0,0,0.18)",
      `inset 0 1px 0 rgba(255,255,255,${tone === "light" ? 0.6 : 0.25})`,
      "inset 0 -1px 0 rgba(0,0,0,0.18)",
    ].join(", "),
    color: tone === "light" ? "#0a0a14" : "#ffffff",
    overflow: "hidden",
    ...(centerContent
      ? {
          display: "flex",
          flexDirection: "column" as const,
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center" as const,
        }
      : {}),
    ...style,
  };

  // Outer wrapper provides the gradient border via padding + masked bg.
  const wrapperStyle: CSSProperties = {
    position: "relative",
    borderRadius: radius + 1,
    padding: 1.5,
    background: borderGradient,
    // Ensure the wrapper doesn't grab pointer events when used in overlays.
    pointerEvents: "none",
  };

  // Top-edge highlight (the bright sliver real glass catches from above).
  const highlightStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: "8%",
    right: "8%",
    height: "30%",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
    borderRadius: `${radius}px ${radius}px 50% 50% / ${radius}px ${radius}px 100% 100%`,
    pointerEvents: "none",
    mixBlendMode: "screen",
  };

  return (
    <div style={wrapperStyle}>
      <div style={innerStyle}>
        <div style={highlightStyle} />
        <div style={{ position: "relative", zIndex: 1, width: "100%" }}>{children}</div>
      </div>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  let h = String(hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return `rgba(255,215,0,${alpha})`; // gold fallback
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
