/**
 * CornerBrackets — Decorative corner frame brackets.
 * Adds a cinematic/premium frame around the video.
 */
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

interface Props {
  color?: string;
  animation?: string;
  thickness?: number;
  size?: number;
  margin?: number;
}

export const CornerBrackets: React.FC<Props> = ({
  color = "#D4A843",
  animation = "fade_in",
  thickness = 2,
  size = 60,
  margin = 40,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const s = spring({ frame, fps, config: { damping: 30, stiffness: 80 } });
  const opacity = interpolate(s, [0, 1], [0, 0.7]);

  const bracketStyle = (corner: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      width: size,
      height: size,
      opacity,
    };

    const borderColor = color;
    const bw = `${thickness}px`;

    switch (corner) {
      case "tl":
        return { ...base, top: margin, left: margin, borderTop: `${bw} solid ${borderColor}`, borderLeft: `${bw} solid ${borderColor}` };
      case "tr":
        return { ...base, top: margin, right: margin, borderTop: `${bw} solid ${borderColor}`, borderRight: `${bw} solid ${borderColor}` };
      case "bl":
        return { ...base, bottom: margin, left: margin, borderBottom: `${bw} solid ${borderColor}`, borderLeft: `${bw} solid ${borderColor}` };
      case "br":
        return { ...base, bottom: margin, right: margin, borderBottom: `${bw} solid ${borderColor}`, borderRight: `${bw} solid ${borderColor}` };
      default:
        return base;
    }
  };

  return (
    <>
      <div style={bracketStyle("tl")} />
      <div style={bracketStyle("tr")} />
      <div style={bracketStyle("bl")} />
      <div style={bracketStyle("br")} />
    </>
  );
};
