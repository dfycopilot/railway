import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useVideoConfig,
} from "remotion";
import { VideoSegment } from "./components/VideoSegment";
import { BrollInsert } from "./components/BrollInsert";
import { TitleCard } from "./components/TitleCard";
import { CaptionRenderer } from "./components/CaptionRenderer";
import { ContinuousAudio } from "./components/ContinuousAudio";
import { Overlays } from "./components/Overlays";
import { KineticText } from "./components/KineticText";
import { LowerThird } from "./components/LowerThird";
import { StatCallout } from "./components/StatCallout";

/**
 * FullComposition v3 — Sequence-based timeline.
 *
 * Key invariants this version enforces:
 *
 * 1. Each scene is placed at its absolute `start_frame` via a plain `<Sequence>`
 *    so the visual timeline matches the audio timeline frame-for-frame. No
 *    `Math.max(20, dur)` bumping, no TransitionSeries collapsing — those were
 *    the source of cumulative A/V drift.
 *
 * 2. Main video scenes and B-roll are rendered as separate layers. B-roll
 *    overlays the main video at its declared frame range; the speaker audio
 *    keeps playing underneath via the dedicated audio layer.
 *
 * 3. Speaker audio comes from `ContinuousAudio`, which slices the source
 *    file according to `audio_segments` (built from `keep_segments`). This is
 *    the single source of truth for speech timing.
 *
 * 4. ALL overlays go through the unified `<Overlays>` component, which already
 *    knows how to render every type the planner can emit (scan_lines, halftone,
 *    chromatic_aberration, duotone, etc.). The previous version only rendered
 *    4 of the 11 — the rest were silently dropped.
 *
 * 5. Text animations now route to the right component based on `type`:
 *    - title_card    → <TitleCard>
 *    - kinetic_text  → <KineticText>
 *    - lower_third   → <LowerThird>
 *    - stat_callout  → <StatCallout>
 *    The previous version only rendered title_card and silently returned null
 *    for everything else.
 *
 * 6. VideoSegment / BrollInsert now receive `sceneDurationFrames` so their
 *    zoom interpolation runs over the scene's own window instead of the entire
 *    composition's duration (which made every zoom effectively static).
 */

const num = (value: unknown, fallback = 0): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const firstUrl = (...candidates: unknown[]): string => {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};

interface FullCompositionProps {
  specData?: any;
}

export const FullComposition: React.FC<FullCompositionProps> = ({ specData }) => {
  const { fps, durationInFrames } = useVideoConfig();

  if (!specData) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ color: "#f00", fontSize: 48, fontFamily: "sans-serif" }}>
          No specData received
        </div>
      </AbsoluteFill>
    );
  }

  const scenes: any[] = Array.isArray(specData.scenes) ? specData.scenes : [];
  const captions: any[] = Array.isArray(specData.captions) ? specData.captions : [];
  const textAnimations: any[] = Array.isArray(
    specData.text_animations || specData.textAnimations
  )
    ? specData.text_animations || specData.textAnimations
    : [];

  const overlays =
    specData.overlays && typeof specData.overlays === "object" ? specData.overlays : {};
  const cssEffects =
    (specData.css_effects && typeof specData.css_effects === "object" && specData.css_effects) ||
    (specData.cssEffects && typeof specData.cssEffects === "object" && specData.cssEffects) ||
    {};
  const allOverlays = { ...cssEffects, ...overlays };

  const captionPreset = specData.caption_preset || specData.captionPreset || "tiktok";
  const captionConfig = specData.caption_config || specData.captionConfig || undefined;

  const sourceVideoUrl = firstUrl(
    specData.source_video_url,
    specData.sourceVideoUrl,
    specData.src,
    specData.url,
    specData.main_audio_url,
    specData.mainAudioUrl
  );

  const audioSegments: any[] = Array.isArray(
    specData.audio_segments || specData.audioSegments
  )
    ? specData.audio_segments || specData.audioSegments
    : [];

  // Music
  const music = specData.music || null;
  const musicUrl = music
    ? firstUrl(music.src, music.url, music.music_url, music.musicUrl)
    : "";
  const musicVolume = music ? num(music.volume ?? music.level, 0.15) : 0.15;

  // Normalize and split scenes by type
  const normalizedScenes = scenes.map((s: any) => {
    const start = Math.max(0, Math.round(num(s?.start_frame ?? s?.startFrame)));
    const dur = Math.max(1, Math.round(num(s?.duration_frames ?? s?.durationFrames, 1)));
    return { raw: s, start, dur };
  });

  const mainScenes = normalizedScenes
    .filter(({ raw }) => raw?.type !== "broll")
    .sort((a, b) => a.start - b.start);

  const brollScenes = normalizedScenes
    .filter(({ raw }) => raw?.type === "broll")
    .sort((a, b) => a.start - b.start);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* ═══ LAYER 1: Main video scenes (absolute positioning) ═══ */}
      {mainScenes.map(({ raw: scene, start, dur }, i) => {
        const url = firstUrl(
          scene?.videoUrl,
          scene?.video_url,
          scene?.src,
          scene?.url,
          scene?.source_video_url,
          scene?.sourceVideoUrl,
          sourceVideoUrl
        );
        if (!url) return null;

        return (
          <Sequence
            key={`main-${i}-${start}`}
            from={start}
            durationInFrames={dur}
          >
            <VideoSegment
              videoUrl={url}
              trimStart={num(scene?.trim_start ?? scene?.trimStart, 0)}
              trimEnd={num(scene?.trim_end ?? scene?.trimEnd, 0)}
              effects={scene?.effects}
              sceneDurationFrames={dur}
              volume={0}
            />
          </Sequence>
        );
      })}

      {/* ═══ LAYER 2: B-roll overlays (layered on top of main video) ═══ */}
      {brollScenes.map(({ raw: scene, start, dur }, i) => {
        const url = firstUrl(
          scene?.videoUrl,
          scene?.video_url,
          scene?.src,
          scene?.url,
          scene?.source_video_url,
          scene?.sourceVideoUrl
        );
        if (!url) return null;

        return (
          <Sequence
            key={`broll-${i}-${start}`}
            from={start}
            durationInFrames={dur}
          >
            <BrollInsert
              videoUrl={url}
              effects={scene?.effects}
              sceneDurationFrames={dur}
            />
          </Sequence>
        );
      })}

      {/* ═══ LAYER 3: Continuous speaker audio ═══ */}
      {/* The speaker's voice plays continuously through the entire timeline,
          including under B-roll cutaways. Each audio_segment maps a slice of
          the source file to a specific output frame range. */}
      <AbsoluteFill style={{ opacity: 0, pointerEvents: "none" }}>
        <ContinuousAudio
          audioSegments={audioSegments}
          sourceVideoUrl={sourceVideoUrl}
          fps={fps}
        />
      </AbsoluteFill>

      {/* ═══ LAYER 4: Background music ═══ */}
      {musicUrl && (
        <Sequence from={0} durationInFrames={durationInFrames}>
          <AbsoluteFill style={{ opacity: 0, pointerEvents: "none" }}>
            <Audio src={musicUrl} volume={musicVolume} />
          </AbsoluteFill>
        </Sequence>
      )}

      {/* ═══ LAYER 5: Captions ═══ */}
      {captions.length > 0 && (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <CaptionRenderer
            captions={captions}
            preset={captionPreset}
            fps={fps}
            caption_config={captionConfig}
          />
        </AbsoluteFill>
      )}

      {/* ═══ LAYER 6: Text animations (title_card, kinetic_text, lower_third, stat_callout) ═══ */}
      {textAnimations.map((anim, i) => {
        const start = Math.max(0, Math.round(num(anim?.start_frame ?? anim?.startFrame)));
        const dur = Math.max(1, Math.round(num(anim?.duration_frames ?? anim?.durationFrames, 90)));
        const type = String(anim?.type || "").toLowerCase();
        const sequenceKey = `anim-${i}-${start}-${type}`;

        switch (type) {
          case "title_card": {
            return (
              <Sequence key={sequenceKey} from={start} durationInFrames={dur}>
                <AbsoluteFill style={{ pointerEvents: "none" }}>
                  <TitleCard
                    title={anim?.title || anim?.text || ""}
                    subtitle={anim?.subtitle || ""}
                    animation={anim?.animation || "slam_in"}
                    durationFrames={dur}
                  />
                </AbsoluteFill>
              </Sequence>
            );
          }
          case "kinetic_text": {
            const text = anim?.text || anim?.title || "";
            if (!text) return null;
            return (
              <Sequence key={sequenceKey} from={start} durationInFrames={dur}>
                <AbsoluteFill style={{ pointerEvents: "none" }}>
                  <KineticText
                    text={text}
                    style={anim?.style || "hero_bold"}
                    color={anim?.color || "#FFFFFF"}
                    animation={anim?.animation || "slam_in"}
                    durationFrames={dur}
                  />
                </AbsoluteFill>
              </Sequence>
            );
          }
          case "lower_third": {
            const title = anim?.title || anim?.text || "";
            if (!title) return null;
            return (
              <Sequence key={sequenceKey} from={start} durationInFrames={dur}>
                <AbsoluteFill style={{ pointerEvents: "none" }}>
                  <LowerThird
                    startFrame={0}
                    durationFrames={dur}
                    title={title}
                    subtitle={anim?.subtitle || ""}
                    accentColor={anim?.color || anim?.accentColor || "#FFD700"}
                    position={anim?.position === "center" ? "center" : "left"}
                  />
                </AbsoluteFill>
              </Sequence>
            );
          }
          case "stat_callout": {
            const value = anim?.value || anim?.title || anim?.text || "";
            const label = anim?.label || anim?.subtitle || "";
            if (!value) return null;
            const positionRaw = String(anim?.position || "center");
            const position: "center" | "left" | "right" =
              positionRaw === "left" ? "left" : positionRaw === "right" ? "right" : "center";
            return (
              <Sequence key={sequenceKey} from={start} durationInFrames={dur}>
                <AbsoluteFill style={{ pointerEvents: "none" }}>
                  <StatCallout
                    startFrame={0}
                    durationFrames={dur}
                    value={String(value)}
                    label={String(label)}
                    color={anim?.color || "#FFD700"}
                    position={position}
                  />
                </AbsoluteFill>
              </Sequence>
            );
          }
          default:
            return null;
        }
      })}

      {/* ═══ LAYER 7: Cinematic overlays (all 11 types via the Overlays component) ═══ */}
      <Overlays config={allOverlays} />
    </AbsoluteFill>
  );
};
