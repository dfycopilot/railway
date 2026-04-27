import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { getOverlayScale, getOverlayMaxWidth } from "./aspectSafe";

const { fontFamily: oswaldFamily } = loadOswald("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: interFamily } = loadInter("normal", { weights: ["400"], subsets: ["latin"] });

interface TitleCardProps {
  title: string;
  subtitle?: string;
  animation?: string;
  /**
   * Frame count of the parent Sequence so the exit fade triggers in the right
   * place. Without this, exit interpolates over the entire composition and
   * never fades the title out (or fades it the wrong amount).
   */
  durationFrames?: number;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  animation = "slam_in",
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: compDuration, width: compWidth } = useVideoConfig();
  // Scale font sizes + maxWidth so portrait compositions (1080w) don't bleed.
  const scale = getOverlayScale(compWidth);
  const maxWidth = getOverlayMaxWidth(compWidth);

  const sceneDur = Math.max(
    1,
    Number.isFinite(durationFrames) && (durationFrames as number) > 0
      ? (durationFrames as number)
      : compDuration
  );

  const exitOpacity = interpolate(
    frame,
    [Math.max(0, sceneDur - 15), sceneDur],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const getAnimation = () => {
    switch (animation) {
      case "slam_in": {
        const s = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
        const scale = interpolate(s, [0, 1], [3, 1]);
        const opacity = interpolate(s, [0, 1], [0, 1]);
        return { transform: `scale(${scale})`, opacity };
      }
      case "slide_up": {
        const s = spring({ frame, fps, config: { damping: 20, stiffness: 150 } });
        const y = interpolate(s, [0, 1], [200, 0]);
        const opacity = interpolate(s, [0, 1], [0, 1]);
        return { transform: `translateY(${y}px)`, opacity };
      }
      case "typewriter": {
        const charsVisible = Math.floor(interpolate(frame, [0, 30], [0, title.length], {
          extrapolateRight: "clamp",
        }));
        return { clipPath: `inset(0 ${100 - (charsVisible / title.length) * 100}% 0 0)` };
      }
      case "fade_reveal": {
        const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
        return { opacity };
      }
      case "glitch_reveal": {
        const s = spring({ frame, fps, config: { damping: 15 } });
        const x = frame < 10 ? (Math.random() - 0.5) * 20 : 0;
        return { transform: `translateX(${x}px)`, opacity: s };
      }
      default: {
        const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
        return { opacity };
      }
    }
  };

  const anim = getAnimation();

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: exitOpacity }}>
      <div style={{ textAlign: "center", maxWidth, ...anim }}>
        <div style={{
          fontFamily: oswaldFamily,
          fontSize: Math.round(72 * scale),
          color: "white",
          textShadow: "0 4px 20px rgba(0,0,0,0.7)",
          lineHeight: 1.1,
          wordBreak: "break-word",
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontFamily: interFamily,
            fontSize: Math.round(32 * scale),
            color: "rgba(255,255,255,0.85)",
            marginTop: Math.round(16 * scale),
            textShadow: "0 2px 10px rgba(0,0,0,0.5)",
            lineHeight: 1.3,
            wordBreak: "break-word",
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
