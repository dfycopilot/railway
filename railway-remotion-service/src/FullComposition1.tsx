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
      <AbsoluteFill style={{ backgroundColor: "black", justifyContent: "center", alignItems: "center" }}>
        <div style={{ color: "white", fontSize: 48 }}>No composition spec provided</div>
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
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Layer 1: Scenes */}
      {hasTransitions ? (
        <TransitionSeries>
          {scenes.map((scene: any, i: number) => {
            const elements: React.ReactNode[] = [];

            // Add the scene sequence
            elements.push(
              <TransitionSeries.Sequence
                key={`scene-${i}`}
                durationInFrames={scene.duration_frames}
              >
                <SceneRenderer scene={scene} sourceVideoUrl={sourceVideoUrl} fps={fps} />
              </TransitionSeries.Sequence>
            );

            // Check if there's a transition after this scene
            const transitionAtEnd = transitionMap[scene.start_frame + scene.duration_frames];
            if (transitionAtEnd && i < scenes.length - 1) {
              elements.push(
                <TransitionSeries.Transition
                  key={`trans-${i}`}
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
          <Sequence
            key={`scene-${i}`}
            from={scene.start_frame}
            durationInFrames={scene.duration_frames}
          >
            <SceneRenderer scene={scene} sourceVideoUrl={sourceVideoUrl} fps={fps} />
          </Sequence>
        ))
      )}

      {/* Layer 2: Captions */}
      {captions.length > 0 && (
        <CaptionRenderer
          captions={captions}
          presetId={captionPreset}
          fps={fps}
        />
      )}

      {/* Layer 3: Persistent overlays */}
      <Overlays config={overlays} />

      {/* Layer 4: Music */}
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
  switch (scene.type) {
    case "video_segment":
      return (
        <VideoSegment
          videoUrl={scene.source === "main" ? sourceVideoUrl : scene.video_url}
          trimStart={scene.trim_start}
          trimEnd={scene.trim_end}
          effects={scene.effects}
          fps={fps}
        />
      );
    case "broll":
      return (
        <BrollInsert
          videoUrl={scene.video_url}
          effects={scene.effects}
          fps={fps}
        />
      );
    case "title_card":
      return (
        <TitleCard
          title={scene.title}
          subtitle={scene.subtitle}
          animation={scene.animation}
          fps={fps}
        />
      );
    default:
      return <AbsoluteFill style={{ backgroundColor: "black" }} />;
  }
};
