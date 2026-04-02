import React, { useMemo } from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption } from "@remotion/captions";
import { getCaptionPreset } from "../presets/captionPresets";
import { HormoziCaption } from "./captions/HormoziCaption";
import { CinematicCaption } from "./captions/CinematicCaption";
import { TikTokCaption } from "./captions/TikTokCaption";
import { MinimalCaption } from "./captions/MinimalCaption";
import { KaraokeCaption } from "./captions/KaraokeCaption";

interface CaptionRendererProps {
  captions: Array<{ start: number; end: number; text: string; words?: any[] }>;
  presetId: string;
  fps: number;
}

/**
 * Master caption renderer. Converts raw caption data to @remotion/captions format,
 * creates TikTok-style pages, and renders the selected preset component.
 */
export const CaptionRenderer: React.FC<CaptionRendererProps> = ({
  captions,
  presetId,
  fps,
}) => {
  const preset = getCaptionPreset(presetId);
  const { width, height } = useVideoConfig();

  // Convert our caption format to @remotion/captions Caption format
  const remotionCaptions: Caption[] = useMemo(() => {
    const result: Caption[] = [];
    for (const cap of captions) {
      if (cap.words && cap.words.length > 0) {
        // Word-level timestamps available
        for (const word of cap.words) {
          result.push({
            text: word.text || word.word || "",
            startMs: (word.start ?? cap.start) * 1000,
            endMs: (word.end ?? cap.end) * 1000,
            timestampMs: (word.start ?? cap.start) * 1000,
            confidence: word.confidence ?? 1,
          });
        }
      } else {
        // Sentence-level only
        result.push({
          text: cap.text,
          startMs: cap.start * 1000,
          endMs: cap.end * 1000,
          timestampMs: cap.start * 1000,
          confidence: 1,
        });
      }
    }
    return result;
  }, [captions]);

  // Group into pages
  const switchEveryMs = preset.word_by_word
    ? preset.max_words_per_chunk * 300 // ~300ms per word
    : preset.max_words_per_chunk * 400;

  const { pages } = useMemo(() => {
    return createTikTokStyleCaptions({
      captions: remotionCaptions,
      combineTokensWithinMilliseconds: switchEveryMs,
    });
  }, [remotionCaptions, switchEveryMs]);

  // Select the caption component based on preset
  const CaptionComponent = getCaptionComponent(presetId);

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const endFrame = Math.min(
          nextPage ? Math.round((nextPage.startMs / 1000) * fps) : Infinity,
          startFrame + Math.round((switchEveryMs / 1000) * fps),
        );
        const durationInFrames = endFrame - startFrame;

        if (durationInFrames <= 0) return null;

        return (
          <Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
            <CaptionComponent page={page} preset={preset} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

function getCaptionComponent(presetId: string) {
  switch (presetId) {
    case "hormozi": return HormoziCaption;
    case "cinematic": return CinematicCaption;
    case "tiktok": return TikTokCaption;
    case "minimal": return MinimalCaption;
    case "karaoke": return KaraokeCaption;
    default: return HormoziCaption;
  }
}
