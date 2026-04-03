import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

interface LowerThirdProps {
  startFrame: number;
  durationFrames: number;
  title: string;
  subtitle?: string;
  accentColor?: string;
  position?: "left" | "center";
}

export const LowerThird: React.FC<LowerThirdProps> = ({
  startFrame,
  durationFrames,
  title,
  subtitle,
  accentColor = "#FFD700",
  position = "left",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - startFrame;

  if (localFrame < 0 || localFrame > durationFrames) return null;

  const barWidth = spring({
    frame: localFrame,
    fps,
    config: { damping: 20, stiffness: 200 },
  });

  const textSlide = spring({
    frame: localFrame - 5,
    fps,
    config: { damping: 18, stiffness: 160 },
  });

  const subtitleSlide = spring({
    frame: localFrame - 12,
    fps,
    config: { damping: 18, stiffness: 160 },
  });

  const exitStart = durationFrames - 12;
  const exitProgress = localFrame > exitStart
    ? interpolate(localFrame, [exitStart, durationFrames], [0, 1], { extrapolateRight: "clamp" })
    : 0;

  const exitX = interpolate(exitProgress, [0, 1], [0, -120]);
  const exitOpacity = 1 - exitProgress;

  const alignStyle: React.CSSProperties =
    position === "center"
      ? { left: "50%", transform: `translateX(-50%) translateX(${exitX}px)` }
      : { left: "6%" , transform: `translateX(${exitX}px)` };

  return (
    <div
      style={{
        position: "absolute",
        bottom: "12%",
        ...alignStyle,
        opacity: exitOpacity,
        zIndex: 50,
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          width: interpolate(barWidth, [0, 1], [0, 4]),
          height: subtitle ? 72 : 48,
          backgroundColor: accentColor,
          position: "absolute",
          left: 0,
          top: 0,
          borderRadius: 2,
        }}
      />

      {/* Content container */}
      <div style={{ marginLeft: 16 }}>
        {/* Title */}
        <div
          style={{
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontFamily: "Oswald, sans-serif",
              fontWeight: 700,
              fontSize: 36,
              color: "#FFFFFF",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              transform: `translateX(${interpolate(textSlide, [0, 1], [-200, 0])}px)`,
              opacity: textSlide,
              textShadow: "0 2px 12px rgba(0,0,0,0.7)",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
        </div>

        {/* Subtitle */}
        {subtitle && (
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                fontSize: 20,
                color: "#CCCCCC",
                marginTop: 4,
                transform: `translateX(${interpolate(subtitleSlide, [0, 1], [-200, 0])}px)`,
                opacity: subtitleSlide,
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                whiteSpace: "nowrap",
              }}
            >
              {subtitle}
            </div>
          </div>
        )}
      </div>

      {/* Background pill */}
      <div
        style={{
          position: "absolute",
          inset: "-8px -24px -8px -8px",
          background: "linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)",
          borderRadius: 8,
          zIndex: -1,
          opacity: barWidth,
        }}
      />
    </div>
  );
};

export default LowerThird;
