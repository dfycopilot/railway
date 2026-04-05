import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  useVideoConfig,
  Video,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { VideoSegment } from "./components/VideoSegment";
import { BrollInsert } from "./components/BrollInsert";
import { TitleCard } from "./components/TitleCard";
import { CaptionRenderer } from "./components/CaptionRenderer";
import { Overlays } from "./components/Overlays";
import { MusicTrack } from "./components/MusicTrack";
import { compositionSchema } from "./schema";
import { z } from "zod";
import { Vignette } from "./components/Vignette";
import { FilmGrain } from "./components/FilmGrain";
import { LightLeak } from "./components/LightLeak";
import { CornerBrackets } from "./components/CornerBrackets";

type Props = z.infer<typeof compositionSchema>;

/**
 * FullComposition v2 — fixes audio continuity, caption timing, and B-roll audio.
 *
 * KEY ARCHITECTURAL CHANGE: The main video's audio is rendered as a SEPARATE
 * <Audio> layer that spans the full composition. Individual VideoSegment scenes
 * have their video audio MUTED. This ensures the speaker's voice plays
 * continuously even during B-roll cutaways.
 */
export const FullComposition: React.FC<Props> = ({ specData }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const spec = specData;

  if (!spec) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <p style={{ color: "#fff", textAlign: "center", marginTop: "50%" }}>
          No composition spec provided
        </p>
      </AbsoluteFill>
    );
  }

  const scenes = spec.scenes || [];
  const transitions = spec.transitions || [];
  const captions = spec.captions || [];
  const overlays = spec.overlays || {};
  const music = spec.music;
  const captionPreset = spec.caption_preset || spec.captionPreset || "hormozi";
  const sourceVideoUrl =
    spec.source_video_url || spec.sourceVideoUrl || spec.src || spec.url || "";
  const textAnimations = spec.text_animations || spec.textAnimations || [];
  const keepSegments = spec.keep_segments || spec.keepSegments || [];

  // Build a transition lookup: { at_frame: transition }
  const transitionMap: Record<number, any> = {};
  transitions.forEach((t: any) => {
    const atFrame =
      t.at_frame ?? t.atFrame ?? t.start_frame ?? t.startFrame ?? 0;
    transitionMap[atFrame] = t;
  });

  const getTransitionPresentation = (type: string) => {
    switch (type) {
      case "slide_left":
        return slide({ direction: "from-left" });
      case "slide_right":
        return slide({ direction: "from-right" });
      case "wipe":
      case "wipe_left":
        return wipe({ direction: "from-left" });
      case "wipe_right":
        return wipe({ direction: "from-right" });
      case "crossfade":
      default:
        return fade();
    }
  };

  const hasTransitions = transitions.length > 0;

  // ─── AUDIO CONTINUITY ───
  // Instead of relying on each VideoSegment's <Video> for audio, we render
  // the main video's audio as a separate continuous layer. Each keep_segment
  // maps to an <Audio> sequence that plays the correct portion of the source.
  // This means:
  //   - VideoSegment scenes have volume={0} (video only)
  //   - B-roll scenes are naturally muted
  //   - The speaker's voice never drops out
  const audioSegments: Array<{
    startFrame: number;
    durationFrames: number;
    trimStartSec: number;
  }> = [];

  if (sourceVideoUrl && keepSegments.length > 0) {
    let outputFrame = 0;
    for (const seg of keepSegments) {
      const segStart = Number(seg.start) || 0;
      const segEnd = Number(seg.end) || segStart + 1;
      const segDuration = Math.max(0.1, segEnd - segStart);
      const segFrames = Math.round(segDuration * fps);
      audioSegments.push({
        startFrame: outputFrame,
        durationFrames: segFrames,
        trimStartSec: segStart,
      });
      outputFrame += segFrames;
    }
  } else if (sourceVideoUrl && scenes.length > 0) {
    // Fallback: build audio segments from video_segment scenes
    for (const scene of scenes) {
      if (scene.type !== "video_segment") continue;
      const sf = scene.start_frame ?? scene.startFrame ?? 0;
      const df =
        scene.duration_frames ?? scene.durationFrames ?? scene.durationInFrames ?? 1;
      const trimStart = scene.trim_start ?? scene.trimStart ?? 0;
      audioSegments.push({
        startFrame: sf,
        durationFrames: df,
        trimStartSec: trimStart,
      });
    }
  }

  // Music URL resolution
  const musicUrl =
    music?.url || music?.src || music?.music_url || music?.musicUrl || null;
  const musicVolume = music?.volume ?? music?.level ?? 0.15;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Layer 0: Continuous main audio (speaker voice) */}
      {audioSegments.map((seg, i) => (
        <Sequence
          key={`audio-${i}`}
          from={seg.startFrame}
          durationInFrames={seg.durationFrames}
        >
          <Audio
            src={sourceVideoUrl}
            startFrom={Math.round(seg.trimStartSec * fps)}
            volume={1}
          />
        </Sequence>
      ))}

      {/* Layer 1: Video scenes (all muted — audio comes from Layer 0) */}
      {hasTransitions ? (
        <TransitionSeries>
          {scenes.map((scene: any, i: number) => {
            const elements: React.ReactNode[] = [];
            const sceneDuration =
              scene.duration_frames ??
              scene.durationFrames ??
              scene.durationInFrames ??
              30;

            elements.push(
              <TransitionSeries.Sequence
                key={`scene-${i}`}
                durationInFrames={sceneDuration}
              >
                <SceneRenderer
                  scene={scene}
                  sourceVideoUrl={sourceVideoUrl}
                  fps={fps}
                  muteVideo={true}
                />
              </TransitionSeries.Sequence>
            );

            // Check for transition after this scene
            const sceneEndFrame =
              (scene.start_frame ?? scene.startFrame ?? 0) + sceneDuration;
            const transitionAtEnd = transitionMap[sceneEndFrame];
            if (transitionAtEnd && i < scenes.length - 1) {
              const transDuration =
                transitionAtEnd.duration_frames ??
                transitionAtEnd.durationFrames ??
                15;
              elements.push(
                <TransitionSeries.Transition
                  key={`transition-${i}`}
                  presentation={getTransitionPresentation(
                    transitionAtEnd.type || "crossfade"
                  )}
                  timing={linearTiming({ durationInFrames: transDuration })}
                />
              );
            }

            return elements;
          })}
        </TransitionSeries>
      ) : (
        scenes.map((scene: any, i: number) => {
          const sf = scene.start_frame ?? scene.startFrame ?? 0;
          const df =
            scene.duration_frames ??
            scene.durationFrames ??
            scene.durationInFrames ??
            30;
          return (
            <Sequence key={`scene-${i}`} from={sf} durationInFrames={df}>
              <SceneRenderer
                scene={scene}
                sourceVideoUrl={sourceVideoUrl}
                fps={fps}
                muteVideo={true}
              />
            </Sequence>
          );
        })
      )}

      {/* Layer 2: Text animations */}
      {textAnimations.map((anim: any, i: number) => {
        const sf = anim.start_frame ?? anim.startFrame ?? 0;
        const df =
          anim.duration_frames ??
          anim.durationFrames ??
          anim.durationInFrames ??
          90;
        return (
          <Sequence key={`text-anim-${i}`} from={sf} durationInFrames={df}>
            <TextAnimationRenderer animation={anim} fps={fps} />
          </Sequence>
        );
      })}

      {/* Layer 3: Captions */}
      {captions.length > 0 && (
        <CaptionRenderer
          captions={captions}
          preset={captionPreset}
          fps={fps}
        />
      )}

      {/* Layer 4: Cinematic overlays */}
      {overlays.vignette?.intensity && (
        <Vignette intensity={overlays.vignette.intensity} />
      )}
      {overlays.film_grain?.intensity && (
        <FilmGrain intensity={overlays.film_grain.intensity} />
      )}
      {overlays.light_leak?.intensity && (
        <LightLeak
          color={overlays.light_leak.color || "warm"}
          intensity={overlays.light_leak.intensity}
        />
      )}
      {overlays.corner_brackets?.enabled && (
        <CornerBrackets
          color={overlays.corner_brackets.color || "#D4A843"}
        />
      )}

      {/* Layer 5: Legacy overlays */}
      <Overlays config={overlays} />

      {/* Layer 6: Background music */}
      {musicUrl && <MusicTrack url={musicUrl} volume={musicVolume} />}
    </AbsoluteFill>
  );
};

/** Routes a scene to the correct component based on type */
const SceneRenderer: React.FC<{
  scene: any;
  sourceVideoUrl: string;
  fps: number;
  muteVideo: boolean;
}> = ({ scene, sourceVideoUrl, fps, muteVideo }) => {
  const type = scene.type || "video_segment";

  // Resolve the video URL for this scene
  const videoSrc =
    scene.source === "main" || type === "video_segment"
      ? scene.source_video_url ||
        scene.sourceVideoUrl ||
        scene.video_url ||
        scene.videoUrl ||
        scene.src ||
        sourceVideoUrl
      : scene.video_url ||
        scene.videoUrl ||
        scene.src ||
        scene.source_video_url ||
        sourceVideoUrl;

  switch (type) {
    case "broll":
      return (
        <BrollInsert
          videoUrl={videoSrc}
          effects={scene.effects}
          fps={fps}
        />
      );

    case "title_card":
      return (
        <TitleCard
          title={scene.title || scene.text || ""}
          subtitle={scene.subtitle || ""}
          animation={scene.animation || "slam_in"}
          fps={fps}
        />
      );

    case "video_segment":
    default:
      return (
        <VideoSegment
          videoUrl={videoSrc}
          trimStart={scene.trim_start ?? scene.trimStart ?? 0}
          trimEnd={
            scene.trim_end ??
            scene.trimEnd ??
            (scene.trim_start ?? 0) +
              ((scene.duration_frames ?? 30) / fps)
          }
          effects={scene.effects}
          fps={fps}
          volume={muteVideo ? 0 : 1}
        />
      );
  }
};

/** Routes a text animation to the correct component */
const TextAnimationRenderer: React.FC<{
  animation: any;
  fps: number;
}> = ({ animation, fps }) => {
  const type = animation.type || "title_card";

  switch (type) {
    case "title_card":
      return (
        <TitleCard
          title={animation.title || animation.text || ""}
          subtitle={animation.subtitle || ""}
          animation={animation.animation || "slam_in"}
          fps={fps}
        />
      );
    default:
      // For unsupported text animation types, render a simple title card fallback
      return (
        <TitleCard
          title={animation.title || animation.text || ""}
          subtitle={animation.subtitle || ""}
          animation={animation.animation || "fade_reveal"}
          fps={fps}
        />
      );
  }
};
