import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  spring,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { VideoSegment } from "./components/VideoSegment";
import { BrollInsert } from "./components/BrollInsert";
import { TitleCard } from "./components/TitleCard";
import { CaptionRenderer } from "./components/CaptionRenderer";
import { SnapZoom } from "./components/SnapZoom";
import { Vignette } from "./components/Vignette";
import { FilmGrain } from "./components/FilmGrain";
import { LightLeak } from "./components/LightLeak";
import { CornerBrackets } from "./components/CornerBrackets";

// ─── Transition resolver ───
function getTransitionPresentation(type) {
  switch (type) {
    case "wipe_left":
    case "wipe_right":
      return wipe({ direction: type === "wipe_right" ? "from-right" : "from-left" });
    case "slide_left":
      return slide({ direction: "from-right" });
    case "zoom_in":
    case "fade_black":
    case "crossfade":
    default:
      return fade();
  }
}

// ─── Scene renderer ───
function SceneRenderer({ scene, fps, sourceVideoUrl }) {
  const type = scene.type || "video_segment";
  const videoUrl =
    scene.videoUrl || scene.video_url || scene.src || scene.url ||
    scene.source_video_url || scene.sourceVideoUrl || sourceVideoUrl;

  if (type === "title_card") {
    return (
      <TitleCard
        title={scene.title || scene.text || ""}
        subtitle={scene.subtitle || ""}
        animation={scene.animation || "slam_in"}
        position={scene.position || "center"}
      />
    );
  }

  if (type === "broll") {
    const brollUrl =
      scene.videoUrl || scene.video_url || scene.src || scene.url ||
      scene.source_video_url || "";

    const inner = (
      <BrollInsert
        videoUrl={brollUrl}
        volume={0}
      />
    );

    // Wrap in SnapZoom if requested
    if (scene.effects?.zoom?.type === "snap_zoom") {
      return (
        <SnapZoom
          from={scene.effects.zoom.from ?? 1.0}
          to={scene.effects.zoom.to ?? 1.3}
          peakFrame={scene.effects.zoom.peakFrame}
        >
          {inner}
        </SnapZoom>
      );
    }
    return inner;
  }

  // Default: video_segment
  const inner = (
    <VideoSegment
      videoUrl={videoUrl}
      trimStart={scene.trimStart ?? scene.trim_start ?? 0}
      trimEnd={scene.trimEnd ?? scene.trim_end ?? undefined}
      volume={0}
      effects={scene.effects}
    />
  );

  if (scene.effects?.zoom?.type === "snap_zoom") {
    return (
      <SnapZoom
        from={scene.effects.zoom.from ?? 1.0}
        to={scene.effects.zoom.to ?? 1.3}
        peakFrame={scene.effects.zoom.peakFrame}
      >
        {inner}
      </SnapZoom>
    );
  }
  return inner;
}

// ─── Main composition ───
export const FullComposition = ({ specData }) => {
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  if (!specData) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#f00", fontSize: 48, fontFamily: "sans-serif" }}>
          No specData received
        </div>
      </AbsoluteFill>
    );
  }

  const scenes = Array.isArray(specData.scenes) ? specData.scenes : [];
  const transitions = Array.isArray(specData.transitions) ? specData.transitions : [];
  const captions = Array.isArray(specData.captions) ? specData.captions : [];
  const textAnimations = Array.isArray(specData.text_animations || specData.textAnimations)
    ? (specData.text_animations || specData.textAnimations)
    : [];
  const overlays = specData.overlays || {};
  const music = specData.music || null;
  const captionPreset = specData.caption_preset || specData.captionPreset || "tiktok";
  const sourceVideoUrl =
    specData.source_video_url || specData.sourceVideoUrl ||
    specData.src || specData.url || "";

  // ─── AUDIO SEGMENTS ───
  // audio_segments are derived from video_segment scenes with OUTPUT frame positions.
  // Each has: start_frame, duration_frames, trim_start, trim_end, source_url
  // This is the DEFINITIVE audio layer — it accounts for title cards, B-roll, and transitions.
  const audioSegments = Array.isArray(specData.audio_segments || specData.audioSegments)
    ? (specData.audio_segments || specData.audioSegments)
    : [];

  // Fallback: if no audio_segments provided, build from video_segment scenes
  const effectiveAudioSegments = audioSegments.length > 0
    ? audioSegments
    : scenes
        .filter((s) => s.type === "video_segment" && s.trim_start != null)
        .map((s) => ({
          start_frame: s.start_frame ?? s.startFrame ?? 0,
          duration_frames: s.duration_frames ?? s.durationFrames ?? 1,
          trim_start: s.trim_start ?? s.trimStart ?? 0,
          trim_end: s.trim_end ?? s.trimEnd ?? 0,
          source_url: s.source_video_url ?? s.sourceVideoUrl ?? s.videoUrl ?? s.video_url ?? sourceVideoUrl,
        }));

  // ─── Transition lookup ───
  const transitionMap = {};
  for (const t of transitions) {
    const atFrame = t.at_frame ?? t.atFrame ?? 0;
    transitionMap[atFrame] = t;
  }

  // Build TransitionSeries sequences
  const sortedScenes = [...scenes].sort(
    (a, b) => (a.start_frame ?? a.startFrame ?? 0) - (b.start_frame ?? b.startFrame ?? 0)
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>

      {/* ═══ LAYER 1: Video scenes via TransitionSeries ═══ */}
      <AbsoluteFill>
        <TransitionSeries>
          {sortedScenes.map((scene, i) => {
            const startFrame = scene.start_frame ?? scene.startFrame ?? 0;
            const dur = Math.max(20, scene.duration_frames ?? scene.durationFrames ?? 90);
            const transition = transitionMap[startFrame];

            const elements = [];

            // Insert transition before this scene (not before the first)
            if (i > 0 && transition) {
              const tDur = Math.min(
                transition.duration_frames ?? transition.durationFrames ?? 15,
                Math.floor(dur / 2)
              );
              elements.push(
                <TransitionSeries.Transition
                  key={`t-${i}`}
                  presentation={getTransitionPresentation(transition.type)}
                  timing={linearTiming({ durationInFrames: tDur })}
                />
              );
            }

            elements.push(
              <TransitionSeries.Sequence key={`s-${i}`} durationInFrames={dur}>
                <SceneRenderer
                  scene={scene}
                  fps={fps}
                  sourceVideoUrl={sourceVideoUrl}
                />
              </TransitionSeries.Sequence>
            );

            return elements;
          }).flat()}
        </TransitionSeries>
      </AbsoluteFill>

      {/* ═══ LAYER 2: Continuous speaker audio ═══ */}
      {/* Each audio_segment maps a source trim window to a specific output frame position.
          This ensures the speaker's voice stays in sync even when title cards, B-roll,
          and transitions shift the visual timeline. */}
      <AbsoluteFill style={{ opacity: 0 }}>
        {effectiveAudioSegments.map((seg, i) => {
          const segStartFrame = Number(seg.start_frame) || 0;
          const segDurationFrames = Math.max(1, Number(seg.duration_frames) || 1);
          const trimStartFrames = Math.round((Number(seg.trim_start) || 0) * fps);
          const trimEndFrames = Math.round((Number(seg.trim_end) || 0) * fps);
          const audioSrc = seg.source_url || sourceVideoUrl;

          if (!audioSrc) return null;

          return (
            <Sequence
              key={`audio-${i}`}
              from={segStartFrame}
              durationInFrames={segDurationFrames}
            >
              <Audio
                src={audioSrc}
                startFrom={trimStartFrames}
                endAt={trimEndFrames}
                volume={1}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>

      {/* ═══ LAYER 3: Background music ═══ */}
      {music && (music.src || music.url || music.music_url || music.musicUrl) && (
        <AbsoluteFill style={{ opacity: 0 }}>
          <Audio
            src={music.src || music.url || music.music_url || music.musicUrl}
            volume={Number(music.volume ?? music.level ?? 0.15)}
          />
        </AbsoluteFill>
      )}

      {/* ═══ LAYER 4: Captions ═══ */}
      {captions.length > 0 && (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <CaptionRenderer
            captions={captions}
            preset={captionPreset}
            fps={fps}
          />
        </AbsoluteFill>
      )}

      {/* ═══ LAYER 5: Text animations (title cards placed as overlays) ═══ */}
      {textAnimations.map((anim, i) => {
        const animStart = anim.start_frame ?? anim.startFrame ?? 0;
        const animDur = Math.max(1, anim.duration_frames ?? anim.durationFrames ?? 90);

        if (anim.type === "title_card") {
          return (
            <Sequence key={`ta-${i}`} from={animStart} durationInFrames={animDur}>
              <AbsoluteFill style={{ pointerEvents: "none" }}>
                <TitleCard
                  title={anim.title || anim.text || ""}
                  subtitle={anim.subtitle || ""}
                  animation={anim.animation || "slam_in"}
                  position={anim.position || "center"}
                />
              </AbsoluteFill>
            </Sequence>
          );
        }

        // Other text animation types (stat_callout, lower_third, kinetic_text)
        // are filtered out by the edge function for now to prevent interpolate() crashes.
        return null;
      })}

      {/* ═══ LAYER 6: Cinematic overlays ═══ */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {overlays.vignette && (
          <Vignette
            intensity={overlays.vignette.intensity ?? 0.35}
          />
        )}
        {overlays.film_grain && (
          <FilmGrain
            intensity={overlays.film_grain.intensity ?? 0.04}
          />
        )}
        {overlays.light_leak && (
          <LightLeak
            color={overlays.light_leak.color || "warm"}
            intensity={overlays.light_leak.intensity ?? 0.1}
          />
        )}
        {overlays.corner_brackets && (
          <CornerBrackets
            color={overlays.corner_brackets.color || "#D4A843"}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
