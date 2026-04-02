/**
 * TitleCard — Full-screen centered text overlay with optional darkened background.
 * Used for hero moments like "PLATINUM PIPELINE 2.0"
 */
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";

const { fontFamily: oswald } = loadOswald("normal", { weights: ["700"], subsets: ["latin"] });
const { fontFamily: montserrat } = loadMontserrat("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

interface TextLine {
  text: string;
  color?: string;
  size?: string; // "xl", "lg", "md", "sm", "xs"
  font?: string; // "display" or "body"
}

interface Props {
  lines: TextLine[];
  animation: string;
  durationFrames: number;
}

const sizeMap: Record<string, number> = {
  xl: 96, lg: 72, md: 48, sm: 32, xs: 22,
};

export const TitleCard: React.FC<Props> = ({ lines, animation, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterS = spring({ frame, fps, config: { damping: 25, stiffness: 120 } });
  const exitAlpha = interpolate(frame, [durationFrames - 20, durationFrames], [1, 0], {
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
      gap: 12,
      opacity: enterS * exitAlpha,
      backgroundColor: "rgba(0,0,0,0.5)",
    }}>
      {lines.map((line, i) => {
        // Stagger each line
        const lineDelay = i * 6;
        const lineS = spring({ frame: frame - lineDelay, fps, config: { damping: 20, stiffness: 150 } });
        const y = interpolate(lineS, [0, 1], [30, 0]);
        const fontSize = sizeMap[line.size ?? "lg"] ?? 72;
        const isDisplay = (line.font ?? "display") === "display";

        return (
          <div key={i} style={{
            fontFamily: isDisplay ? oswald : montserrat,
            fontSize,
            fontWeight: isDisplay ? 700 : 500,
            color: line.color ?? "#FFFFFF",
            textTransform: isDisplay ? "uppercase" : "none",
            letterSpacing: isDisplay ? "0.04em" : "0.15em",
            textShadow: "0 4px 30px rgba(0,0,0,0.8)",
            transform: `translateY(${y}px)`,
            opacity: lineS,
            textAlign: "center",
            lineHeight: 1.1,
          }}>
            {line.text}
          </div>
        );
      })}
    </div>
  );
};
