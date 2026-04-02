/**
 * CountdownNumber — Large animated number with label.
 * Like the "8 EXPERT SPEAKERS" from the example video.
 */
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

const { fontFamily: oswald } = loadOswald("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: montserrat } = loadMontserrat("normal", { weights: ["400"] , subsets: ["latin"] });

interface Props {
  number: string;
  label: string;
  subtitle: string;
  color: string;
  durationFrames: number;
}

export const CountdownNumber: React.FC<Props> = ({ number, label, subtitle, color, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Number slams in
  const numS = spring({ frame, fps, config: { damping: 10, stiffness: 200 } });
  const numScale = interpolate(numS, [0, 1], [3, 1]);

  // Label slides up after number
  const labelS = spring({ frame: frame - 10, fps, config: { damping: 20, stiffness: 150 } });
  const labelY = interpolate(labelS, [0, 1], [30, 0]);

  // Subtitle fades in after label
  const subS = spring({ frame: frame - 18, fps, config: { damping: 25, stiffness: 100 } });

  // Exit
  const exitAlpha = interpolate(frame, [durationFrames - 15, durationFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      opacity: exitAlpha,
    }}>
      {/* Big number */}
      <div style={{
        fontFamily: oswald,
        fontSize: 160,
        fontWeight: 700,
        color,
        transform: `scale(${numScale})`,
        opacity: numS,
        lineHeight: 1,
        textShadow: "0 6px 40px rgba(0,0,0,0.6)",
      }}>
        {number}
      </div>

      {/* Label */}
      <div style={{
        fontFamily: oswald,
        fontSize: 56,
        fontWeight: 700,
        color: "#FFFFFF",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        transform: `translateY(${labelY}px)`,
        opacity: labelS,
        textShadow: "0 4px 20px rgba(0,0,0,0.7)",
      }}>
        {label}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          fontFamily: montserrat,
          fontSize: 24,
          fontWeight: 400,
          color: "rgba(255,255,255,0.7)",
          opacity: subS,
          textShadow: "0 2px 10px rgba(0,0,0,0.5)",
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
};
