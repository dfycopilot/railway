/**
 * CompanionPanel — renders the "other side" of a split-screen or PIP scene.
 *
 * The planner can fill the companion slot with any of these content types:
 *
 *   - color    : solid background (just `companion.color`)
 *   - gradient : two-stop linear gradient
 *   - image    : image URL fills the panel (object-fit: cover)
 *   - broll    : a second video clip plays muted
 *   - title    : big text card (uses GlassCard if style="glass")
 *   - stat     : huge stat number + label (great for split-screen punch)
 *   - lottie   : a Lottie JSON animation by name (from our library) or by URL
 *   - quote    : pull-quote with attribution
 *
 * Why this lives separately from the existing TitleCard / StatCallout: those
 * components are tuned to render fullscreen-centered with their own paddings.
 * Inside a split-screen panel that's only 50% of the frame they look wrong
 * (text bleeds, paddings double-up). CompanionPanel renders compact variants
 * sized to fit a half-frame slot.
 *
 * The `style` prop opts into the liquid-glass aesthetic for any text-based
 * companion type.
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { Video } from "@remotion/media";
import { Img } from "remotion";
import { GlassCard } from "./GlassCard";
import { LottieGraphic, type LottieName } from "./LottieGraphic";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: oswaldFamily } = loadOswald("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: interFamily } = loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

export type CompanionType =
  | "color"
  | "gradient"
  | "image"
  | "broll"
  | "title"
  | "stat"
  | "lottie"
  | "quote";

export interface CompanionSpec {
  type: CompanionType;
  // Visual style for text-heavy types ("title", "stat", "quote"):
  // "glass" wraps content in GlassCard, "solid" uses a plain background.
  style?: "glass" | "solid";
  // Background fill (used by all types as the base layer)
  background?: string;
  // color
  color?: string;
  // gradient
  gradient_from?: string;
  gradient_to?: string;
  gradient_angle?: number;
  // image
  image_url?: string;
  // broll
  broll_url?: string;
  // title / quote
  title?: string;
  subtitle?: string;
  attribution?: string;
  // stat
  value?: string;
  label?: string;
  // lottie
  lottie_name?: LottieName;
  lottie_url?: string;
  lottie_speed?: number;
  // shared theming
  text_color?: string;
  accent_color?: string;
  /** Frame count of the parent Sequence — used for entrance animation */
  durationFrames?: number;
}

interface Props {
  companion: CompanionSpec;
}

export const CompanionPanel: React.FC<Props> = ({ companion }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Soft entrance — every companion fades + scales in over ~12 frames.
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const enterScale = interpolate(enter, [0, 1], [0.96, 1]);
  const enterOpacity = interpolate(enter, [0, 1], [0, 1]);

  const style: "glass" | "solid" = companion.style === "glass" ? "glass" : "solid";
  const bg = resolveBackground(companion);
  const textColor = companion.text_color || "#FFFFFF";
  const accent = companion.accent_color || "#FFD700";

  // ── Pure visual types (no text) ─────────────────────────────
  if (companion.type === "color" || companion.type === "gradient") {
    return (
      <AbsoluteFill style={{ background: bg }} />
    );
  }

  if (companion.type === "image" && companion.image_url) {
    return (
      <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
        <Img
          src={companion.image_url}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    );
  }

  if (companion.type === "broll" && companion.broll_url) {
    return (
      <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
        <Video
          src={companion.broll_url}
          muted
          volume={0}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    );
  }

  if (companion.type === "lottie") {
    return (
      <AbsoluteFill
        style={{
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8%",
          opacity: enterOpacity,
        }}
      >
        <div style={{ width: "100%", height: "100%", maxWidth: "85%", maxHeight: "85%" }}>
          <LottieGraphic
            name={companion.lottie_name}
            url={companion.lottie_url}
            speed={companion.lottie_speed}
            accentColor={accent}
          />
        </div>
      </AbsoluteFill>
    );
  }

  // ── Text-based types (title / stat / quote) ─────────────────
  const renderTextContent = () => {
    if (companion.type === "stat") {
      return (
        <>
          <div
            style={{
              fontFamily: oswaldFamily,
              fontSize: "min(20vw, 240px)",
              fontWeight: 700,
              color: accent,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              textShadow: style === "solid" ? "0 4px 24px rgba(0,0,0,0.5)" : "none",
            }}
          >
            {companion.value || "—"}
          </div>
          {companion.label && (
            <div
              style={{
                fontFamily: interFamily,
                fontSize: "min(3.2vw, 38px)",
                fontWeight: 600,
                color: textColor,
                marginTop: 16,
                lineHeight: 1.25,
                maxWidth: "90%",
                opacity: 0.95,
              }}
            >
              {companion.label}
            </div>
          )}
        </>
      );
    }

    if (companion.type === "quote") {
      return (
        <>
          <div
            style={{
              fontFamily: oswaldFamily,
              fontSize: "min(7vw, 88px)",
              fontWeight: 700,
              color: accent,
              lineHeight: 1,
              marginBottom: 12,
            }}
          >
            “
          </div>
          <div
            style={{
              fontFamily: interFamily,
              fontSize: "min(3.6vw, 44px)",
              fontWeight: 600,
              color: textColor,
              lineHeight: 1.3,
              maxWidth: "94%",
            }}
          >
            {companion.title || ""}
          </div>
          {companion.attribution && (
            <div
              style={{
                fontFamily: interFamily,
                fontSize: "min(2.4vw, 26px)",
                fontWeight: 400,
                color: textColor,
                opacity: 0.7,
                marginTop: 18,
              }}
            >
              — {companion.attribution}
            </div>
          )}
        </>
      );
    }

    // title (default)
    return (
      <>
        <div
          style={{
            fontFamily: oswaldFamily,
            fontSize: "min(7.5vw, 96px)",
            fontWeight: 700,
            color: textColor,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            wordBreak: "break-word",
          }}
        >
          {companion.title || ""}
        </div>
        {companion.subtitle && (
          <div
            style={{
              fontFamily: interFamily,
              fontSize: "min(3.2vw, 36px)",
              fontWeight: 400,
              color: textColor,
              opacity: 0.85,
              marginTop: 18,
              lineHeight: 1.3,
              maxWidth: "92%",
            }}
          >
            {companion.subtitle}
          </div>
        )}
      </>
    );
  };

  return (
    <AbsoluteFill
      style={{
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6%",
        textAlign: "center",
        opacity: enterOpacity,
        transform: `scale(${enterScale})`,
      }}
    >
      {style === "glass" ? (
        <GlassCard
          tone="dark"
          accentColor={accent}
          radius={28}
          padding="36px 44px"
          style={{ maxWidth: "92%" }}
        >
          {renderTextContent()}
        </GlassCard>
      ) : (
        <div style={{ maxWidth: "94%" }}>{renderTextContent()}</div>
      )}
    </AbsoluteFill>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────

function resolveBackground(c: CompanionSpec): string {
  if (c.background) return c.background;
  if (c.type === "color") return c.color || "#0a0a14";
  if (c.type === "gradient") {
    const from = c.gradient_from || "#0f0f1e";
    const to = c.gradient_to || "#1a1a2e";
    const angle = Number.isFinite(c.gradient_angle) ? c.gradient_angle : 135;
    return `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;
  }
  // Default neutral dark backdrop for text/image/broll/lottie panels
  return "linear-gradient(155deg, #0d0d18 0%, #1a1a2e 100%)";
}
