/**
 * KineticText — Bold animated display text.
 * Supports: slam_in, slide_up, typewriter, glitch_reveal, fade_reveal
 */
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Oswald";

const { fontFamily: oswald } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });

interface Props {
  text: string;
  style: string;
  color: string;
  animation: string;
  durationFrames: number;
}

export const KineticText: React.FC<Props> = ({ text, style, color, animation, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Font sizing based on style
  const fontSize = style === "hero_bold" ? 96 : style === "section_title" ? 72 : 56;

  // Exit fade (last 15 frames)
  const exitAlpha = interpolate(frame, [durationFrames - 15, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let transform = "";
  let opacity = exitAlpha;
  let filterStyle = "";

  switch (animation) {
    case "slam_in": {
      const s = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
      const scale = interpolate(s, [0, 1], [2.5, 1]);
      opacity *= s;
      transform = `scale(${scale})`;
      break;
    }
    case "slide_up": {
      const s = spring({ frame, fps, config: { damping: 20, stiffness: 180 } });
      const y = interpolate(s, [0, 1], [80, 0]);
      opacity *= s;
      transform = `translateY(${y}px)`;
      break;
    }
    case "typewriter": {
      const charsToShow = Math.floor(interpolate(frame, [0, 30], [0, text.length], {
        extrapolateRight: "clamp",
      }));
      return (
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontFamily: oswald,
          fontSize,
          fontWeight: 700,
          color,
          opacity: exitAlpha,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          textShadow: "0 4px 30px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)",
          whiteSpace: "nowrap",
        }}>
          {text.slice(0, charsToShow)}
          <span style={{ opacity: frame % 10 > 5 ? 1 : 0 }}>|</span>
        </div>
      );
    }
    case "glitch_reveal": {
      const s = spring({ frame, fps, config: { damping: 15, stiffness: 300 } });
      opacity *= s;
      const glitchOffset = frame < 8 ? Math.sin(frame * 5) * 10 : 0;
      const rgbSplit = frame < 8 ? 3 : 0;
      transform = `translateX(${glitchOffset}px)`;
      filterStyle = rgbSplit > 0 ? `drop-shadow(${rgbSplit}px 0 0 rgba(255,0,0,0.5)) drop-shadow(-${rgbSplit}px 0 0 rgba(0,255,255,0.5))` : "";
      break;
    }
    case "fade_reveal":
    default: {
      const s = spring({ frame, fps, config: { damping: 30, stiffness: 100 } });
      opacity *= s;
      const blur = interpolate(s, [0, 1], [10, 0]);
      filterStyle = `blur(${blur}px)`;
      break;
    }
  }

  return (
    <div style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: `translate(-50%, -50%) ${transform}`,
      fontFamily: oswald,
      fontSize,
      fontWeight: 700,
      color,
      opacity,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      textShadow: "0 4px 30px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)",
      whiteSpace: "nowrap",
      filter: filterStyle || undefined,
    }}>
      {text}
    </div>
  );
};
