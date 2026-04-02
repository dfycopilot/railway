import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { TikTokPage } from "@remotion/captions";
import type { CaptionPreset } from "../../presets/captionPresets";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["400"], subsets: ["latin"] });

/**
 * Minimal — Small lowercase text, bottom-left positioned,
 * simple fade in/out. Clean and professional.
 */
export const MinimalCaption: React.FC<{ page: TikTokPage; preset: CaptionPreset }> = ({
  page,
  preset,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const text = page.tokens.map((t) => t.text).join("");

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 60,
          right: 60,
          opacity: Math.min(fadeIn, fadeOut),
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: preset.font_size,
            fontWeight: 400,
            color: preset.text_color,
            textTransform: "lowercase",
            lineHeight: 1.5,
            letterSpacing: 0.3,
            whiteSpace: "pre",
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
