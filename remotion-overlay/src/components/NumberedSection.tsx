/**
 * NumberedSection — "01 / TITLE / subtitle" lower-third overlay
 * Matches the style from the example video (bottom-left positioned).
 */
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

const { fontFamily: oswald } = loadOswald("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: montserrat } = loadMontserrat("normal", { weights: ["400", "500"], subsets: ["latin"] });

interface Props {
  number: string;
  title: string;
  subtitle: string;
  position: string;
  color: string;
  animation: string;
  durationFrames: number;
}

export const NumberedSection: React.FC<Props> = ({
  number, title, subtitle, position, color, animation, durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const s = spring({ frame, fps, config: { damping: 18, stiffness: 150 } });
  const exitAlpha = interpolate(frame, [durationFrames - 15, durationFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const y = interpolate(s, [0, 1], [40, 0]);
  const opacity = s * exitAlpha;

  // Position mapping
  const posStyle: React.CSSProperties = position === "bottom_right"
    ? { bottom: 80, right: 80 }
    : position === "top_left"
    ? { top: 80, left: 80 }
    : { bottom: 80, left: 80 }; // bottom_left default

  return (
    <div style={{
      position: "absolute",
      ...posStyle,
      transform: `translateY(${y}px)`,
      opacity,
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      {/* Number */}
      <div style={{
        fontFamily: montserrat,
        fontSize: 24,
        fontWeight: 500,
        color: "#D4A843",
        letterSpacing: "0.1em",
        opacity: 0.8,
      }}>
        {number}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: oswald,
        fontSize: 64,
        fontWeight: 700,
        color,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        lineHeight: 1,
        textShadow: "0 4px 20px rgba(0,0,0,0.7)",
      }}>
        {title}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          fontFamily: montserrat,
          fontSize: 22,
          fontWeight: 400,
          color: "rgba(255,255,255,0.8)",
          marginTop: 4,
          textShadow: "0 2px 10px rgba(0,0,0,0.6)",
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
};
