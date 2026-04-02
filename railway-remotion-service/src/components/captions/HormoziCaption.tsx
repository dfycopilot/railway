import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { TikTokPage } from "@remotion/captions";
import type { CaptionPreset } from "../../presets/captionPresets";
import { loadFont } from "@remotion/google-fonts/Oswald";

const { fontFamily } = loadFont("normal", { weights: ["700"], subsets: ["latin"] });

/**
 * Hormozi Bold — Alex Hormozi / Ali Abdaal style
 * Bold uppercase, word-by-word pop-in, yellow highlight on current word.
 * Large centered text with pill background.
 */
export const HormoziCaption: React.FC<{ page: TikTokPage; preset: CaptionPreset }> = ({
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
          gap: "8px 12px",
          whiteSpace: "pre",
        }}
      >
        {page.tokens.map((token, i) => {
          const isActive = token.fromMs <= currentTimeMs && token.toMs > currentTimeMs;
          const isPast = token.toMs <= currentTimeMs;

          // Pop-in animation for each word
          const wordDelay = i * 3; // stagger by 3 frames
          const s = spring({
            frame: frame - wordDelay,
            fps,
            config: { damping: 12, stiffness: 200 },
          });
          const scale = interpolate(s, [0, 1], [0.3, 1]);
          const opacity = interpolate(s, [0, 1], [0, 1]);

          return (
            <span
              key={token.fromMs + "-" + i}
              style={{
                fontFamily,
                fontSize: preset.font_size,
                fontWeight: 700,
                textTransform: "uppercase",
                transform: `scale(${scale})`,
                opacity,
                color: isActive ? preset.highlight_color : "white",
                backgroundColor: isActive
                  ? "rgba(0,0,0,0.85)"
                  : isPast
                    ? "rgba(0,0,0,0.5)"
                    : "rgba(0,0,0,0.7)",
                padding: "6px 16px",
                borderRadius: 8,
                textShadow: isActive
                  ? `0 0 20px ${preset.highlight_color}, 0 2px 4px rgba(0,0,0,0.8)`
                  : "0 2px 4px rgba(0,0,0,0.8)",
                transition: "none",
                lineHeight: 1.3,
              }}
            >
              {token.text.trim()}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
