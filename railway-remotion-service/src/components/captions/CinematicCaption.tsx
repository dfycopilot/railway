import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { TikTokPage } from "@remotion/captions";
import type { CaptionPreset } from "../../presets/captionPresets";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["500"], subsets: ["latin"] });

/**
 * Cinematic — Clean sans-serif at the bottom with smooth fade
 * and a subtle dark gradient backdrop. Professional, understated.
 */
export const CinematicCaption: React.FC<{ page: TikTokPage; preset: CaptionPreset }> = ({
  page,
  preset,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Smooth fade in/out
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  // Subtle slide up
  const y = interpolate(frame, [0, 12], [15, 0], { extrapolateRight: "clamp" });

  const text = page.tokens.map((t) => t.text).join("");

  return (
    <AbsoluteFill>
      {/* Gradient backdrop at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "30%",
          background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
          opacity,
        }}
      />
      {/* Text */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity,
          transform: `translateY(${y}px)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: preset.font_size,
            fontWeight: 500,
            color: "white",
            textAlign: "center",
            maxWidth: "80%",
            lineHeight: 1.4,
            letterSpacing: 0.5,
            whiteSpace: "pre",
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
