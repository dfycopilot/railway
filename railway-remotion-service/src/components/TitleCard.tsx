import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: oswaldFamily } = loadOswald("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: interFamily } = loadInter("normal", { weights: ["400"], subsets: ["latin"] });

interface TitleCardProps {
  title: string;
  subtitle?: string;
  animation?: string;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  animation = "slam_in",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
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
      <div style={{ textAlign: "center", ...anim }}>
        <div style={{ fontFamily: oswaldFamily, fontSize: 72, color: "white", textShadow: "0 4px 20px rgba(0,0,0,0.7)" }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontFamily: interFamily, fontSize: 32, color: "rgba(255,255,255,0.85)", marginTop: 16, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
