import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { TikTokPage } from "@remotion/captions";
import type { CaptionPreset } from "../../presets/captionPresets";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });

/**
 * TikTok Trendy — Bouncy spring animations, colorful word highlighting,
 * dynamic sizing. Bold and energetic for social media.
 */
export const TikTokCaption: React.FC<{ page: TikTokPage; preset: CaptionPreset }> = ({
  page,
  preset,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = page.startMs + (frame / fps) * 1000;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          maxWidth: "85%",
          gap: "4px 8px",
          whiteSpace: "pre",
        }}
      >
        {page.tokens.map((token, i) => {
          const isActive = token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;

          // Bouncy spring entrance
          const s = spring({
            frame: frame - i * 2,
            fps,
            config: { damping: 8, stiffness: 200 },
          });
          const scale = interpolate(s, [0, 1], [0, 1]);
          const y = interpolate(s, [0, 1], [40, 0]);

          // Active word gets bigger and colored
          const activeScale = isActive ? 1.25 : 1;
          const rotation = isActive ? -3 + Math.random() * 6 : 0;

          return (
            <span
              key={token.fromMs + "-" + i}
              style={{
                fontFamily,
                fontSize: preset.font_size,
                fontWeight: 800,
                textTransform: "uppercase",
                color: isActive ? preset.highlight_color : "white",
                transform: `scale(${scale * activeScale}) translateY(${y}px) rotate(${rotation}deg)`,
                textShadow: isActive
                  ? `0 0 30px ${preset.highlight_color}, 0 4px 8px rgba(0,0,0,0.9)`
                  : "0 4px 8px rgba(0,0,0,0.9), 0 0 0 rgba(0,0,0,0.3)",
                lineHeight: 1.3,
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
