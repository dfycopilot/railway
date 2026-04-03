import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
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
import { StatCallout } from "./components/StatCallout";
import { LowerThird } from "./components/LowerThird";
import { SnapZoom } from "./components/SnapZoom";
import { KineticText } from "./components/KineticText";
import { LightLeak } from "./components/LightLeak";
import { FilmGrain } from "./components/FilmGrain";
import { CornerBrackets } from "./components/CornerBrackets";
import { Vignette } from "./components/Vignette";

type Props = z.infer<typeof compositionSchema>;

/**
 * The main full-composition component.
 * Receives the entire composition spec as props and renders
 * cuts, zooms, transitions, captions, B-roll, and effects — all in React.
 */
export const FullComposition: React.FC<Props> = ({ specData }) => {
  const { fps } = useVideoConfig();
  const spec = specData;

  if (!spec) {
    return (
      <AbsoluteFill>
        <p>No composition spec provided</p>
      </AbsoluteFill>
    );
  }

  const scenes = spec.scenes || [];
  const transitions = spec.transitions || [];
  const captions = spec.captions || [];
  const overlays = spec.overlays || {};
  const music = spec.music;
  const captionPreset = spec.caption_preset || "hormozi";
  const sourceVideoUrl = spec.source_video_url;
  const textAnimations = spec.text_animations || [];

  // Build a transition lookup: { at_frame: transition }
  const transitionMap: Record<number, any> = {};
  transitions.forEach((t: any) => {
    transitionMap[t.at_frame] = t;
  });

  // Get the transition presentation component
  const getTransitionPresentation = (type: string) => {
    switch (type) {
      case "slide_left": return slide({ direction: "from-left" });
      case "slide_right": return slide({ direction: "from-right" });
      case "wipe": return wipe({ direction: "from-left" });
      case "crossfade":
      default: return fade();
    }
  };

  // Check if we should use TransitionSeries (if there are transitions)
  const hasTransitions = transitions.length > 0;

  return (
    <AbsoluteFill>
      {/* Layer 1: Scenes */}
      {hasTransitions ? (
        <TransitionSeries>
          {scenes.map((scene: any, i: number) => {
            const elements: React.ReactNode[] = [];

            // Add the scene sequence
            elements.push(
              <TransitionSeries.Sequence key={`scene-${i}`} durationInFrames={scene.duration_frames}>
                <SceneRenderer scene={scene} sourceVideoUrl={sourceVideoUrl} fps={fps} />
              </TransitionSeries.Sequence>
            );

            // Check if there's a transition after this scene
            const transitionAtEnd = transitionMap[scene.start_frame + scene.duration_frames];
            if (transitionAtEnd && i < scenes.length - 1) {
              elements.push(
                <TransitionSeries.Transition
                  key={`transition-${i}`}
                  presentation={getTransitionPresentation(transitionAtEnd.type)}
                  timing={linearTiming({ durationInFrames: transitionAtEnd.duration_frames || 15 })}
                />
              );
            }

            return elements;
          })}
        </TransitionSeries>
      ) : (
        // No transitions — use simple Sequences
        scenes.map((scene: any, i: number) => (
          <Sequence key={`scene-${i}`} from={scene.start_frame} durationInFrames={scene.duration_frames}>
            <SceneRenderer scene={scene} sourceVideoUrl={sourceVideoUrl} fps={fps} />
          </Sequence>
        ))
      )}

      {/* Layer 2: Text animations (stat callouts, lower thirds, kinetic text) */}
      {textAnimations.map((anim: any, i: number) => (
        <Sequence key={`text-anim-${i}`} from={anim.start_frame} durationInFrames={anim.duration_frames}>
          <TextAnimationRenderer animation={anim} fps={fps} />
        </Sequence>
      ))}

      {/* Layer 3: Captions */}
      {captions.length > 0 && (
        <CaptionRenderer captions={captions} preset={captionPreset} fps={fps} />
      )}

      {/* Layer 4: Cinematic overlays (vignette, film grain, light leaks, corner brackets) */}
      {overlays.vignette?.enabled !== false && overlays.vignette?.intensity && (
        <Vignette intensity={overlays.vignette.intensity} />
      )}
      {overlays.film_grain?.enabled !== false && overlays.film_grain?.intensity && (
        <FilmGrain intensity={overlays.film_grain.intensity} />
      )}
      {overlays.light_leak?.enabled !== false && overlays.light_leak?.intensity && (
        <LightLeak
          color={overlays.light_leak.color || "warm"}
          intensity={overlays.light_leak.intensity}
        />
      )}
      {overlays.corner_brackets?.enabled && (
        <CornerBrackets color={overlays.corner_brackets.color || "#D4A843"} />
      )}

      {/* Layer 5: Legacy/generic overlays (if your Overlays component handles other stuff) */}
      <Overlays overlays={overlays} />

      {/* Layer 6: Music */}
      {music?.url && <MusicTrack url={music.url} volume={music.volume ?? 0.15} />}
    </AbsoluteFill>
  );
};

/** Routes a scene to the correct component based on type */
const SceneRenderer: React.FC<{
  scene: any;
  sourceVideoUrl: string;
  fps: number;
}> = ({ scene, sourceVideoUrl, fps }) => {
  const videoSrc = scene.source === "main" ? sourceVideoUrl : scene.video_url;
  const hasSnapZoom = scene.effects?.zoom?.type === "snap_zoom";

  switch (scene.type) {
    case "video_segment": {
      const segment = (
        <VideoSegment
          src={videoSrc}
          trimStart={scene.trim_start}
          trimEnd={scene.trim_end}
          effects={scene.effects}
          fps={fps}
        />
      );
      // Wrap in SnapZoom if the AI plan says so
      if (hasSnapZoom) {
        return (
          <SnapZoom
            startFrame={scene.effects.zoom.start_frame ?? 0}
            durationFrames={scene.effects.zoom.duration_frames ?? 10}
            scale={scene.effects.zoom.scale ?? 1.4}
            focalX={scene.effects.zoom.focal_x ?? 0.5}
            focalY={scene.effects.zoom.focal_y ?? 0.3}
          >
            {segment}
          </SnapZoom>
        );
      }
      return segment;
    }
    case "broll": {
      const broll = (
        <BrollInsert
          src={scene.video_url}
          effects={scene.effects}
          fps={fps}
        />
      );
      if (hasSnapZoom) {
        return (
          <SnapZoom
            startFrame={scene.effects.zoom.start_frame ?? 0}
            durationFrames={scene.effects.zoom.duration_frames ?? 10}
            scale={scene.effects.zoom.scale ?? 1.4}
            focalX={scene.effects.zoom.focal_x ?? 0.5}
            focalY={scene.effects.zoom.focal_y ?? 0.3}
          >
            {broll}
          </SnapZoom>
        );
      }
      return broll;
    }
    case "title_card":
      return (
        <TitleCard
          title={scene.title}
          subtitle={scene.subtitle}
          animation={scene.animation}
        />
      );
    default:
      return <AbsoluteFill />;
  }
};

/** Routes a text animation to the correct component */
const TextAnimationRenderer: React.FC<{
  animation: any;
  fps: number;
}> = ({ animation, fps }) => {
  switch (animation.type) {
    case "stat_callout":
      return (
        <StatCallout
          number={animation.number}
          text={animation.text}
          position={animation.position || "center"}
          color={animation.color}
          fontSize={animation.font_size}
        />
      );
    case "lower_third":
      return (
        <LowerThird
          title={animation.title}
          subtitle={animation.subtitle}
          accentColor={animation.accent_color}
          position={animation.position}
        />
      );
    case "kinetic_text":
      return (
        <KineticText
          text={animation.text}
          style={animation.style || "slam"}
          color={animation.color}
          fontSize={animation.font_size}
        />
      );
    default:
      return null;
  }
};
