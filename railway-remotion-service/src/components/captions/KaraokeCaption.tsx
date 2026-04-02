import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { TikTokPage } from "@remotion/captions";
import type { CaptionPreset } from "../../presets/captionPresets";
import { loadFont } from "@remotion/google-fonts/BebasNeue";

const { fontFamily } = loadFont("normal", { weights: ["400"], subsets: ["latin"] });

/**
 * Karaoke — Full sentence visible, words highlight as they're spoken.
 * Green highlight sweeps through the text in sync with speech.
 */
export const KaraokeCaption: React.FC<{ page: TikTokPage; preset: CaptionPreset }> = ({
  page,
  preset,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  // Fade in
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Background box */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 40,
          right: 40,
          backgroundColor: preset.bg_color,
          borderRadius: 12,
          padding: "24px 32px",
          opacity: Math.min(fadeIn, fadeOut),
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "2px",
            whiteSpace: "pre",
          }}
        >
          {page.tokens.map((token, i) => {
            const isSpoken = token.fromMs <= currentTimeMs;
            const isActive = token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;

            return (
              <span
                key={token.fromMs + "-" + i}
                style={{
                  fontFamily,
                  fontSize: preset.font_size,
                  fontWeight: 400,
                  textTransform: "uppercase",
                  color: isSpoken ? preset.highlight_color : preset.text_color,
                  textShadow: isActive ? `0 0 15px ${preset.highlight_color}` : "none",
                  lineHeight: 1.3,
                }}
              >
                {token.text}
              </span>
            );
          })}
        </div>

        {/* Progress bar */}
        <div
          style={{
            marginTop: 12,
            height: 4,
            borderRadius: 2,
            backgroundColor: "rgba(255,255,255,0.15)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(frame / durationInFrames) * 100}%`,
              backgroundColor: preset.highlight_color,
              borderRadius: 2,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
