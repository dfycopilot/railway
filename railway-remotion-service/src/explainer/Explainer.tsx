// The explainer video: scenes from the recipe, each with its own narration,
// cross-faded, with an optional quiet music bed underneath.
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { SceneView } from "./scenes";
import type { ExplainerSpec } from "./spec";

// Remote files (Copilot's signed links) are used as-is; bare names come from public/.
const src = (u: string) => (/^https?:\/\//.test(u) ? u : staticFile(u));

const MusicBed: React.FC<{ url: string; volume: number }> = ({ url, volume }) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={src(url)}
      volume={(f) =>
        interpolate(f, [0, 30, durationInFrames - 75, durationInFrames - 5], [0, volume, volume, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      }
    />
  );
};

export const Explainer: React.FC<{ specData: ExplainerSpec }> = ({ specData }) => {
  const spec = specData;
  const t = spec.transition_frames ?? 15;
  const scenes = spec.scenes;
  return (
    <AbsoluteFill style={{ background: "#1D1B18" }}>
      {spec.music_url ? <MusicBed url={spec.music_url} volume={spec.music_volume ?? 0.1} /> : null}
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const out = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={Math.max(1, Math.round(scene.frames))}>
              <SceneView scene={scene} brand={spec.brand} />
              {scene.audio_url ? (
                <Sequence from={scene.audio_start ?? 15}>
                  <Audio src={src(scene.audio_url)} />
                </Sequence>
              ) : null}
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            out.push(
              <TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={linearTiming({ durationInFrames: t })} />,
            );
          }
          return out;
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
