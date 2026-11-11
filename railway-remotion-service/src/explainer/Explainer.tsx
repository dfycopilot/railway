// The explainer video: scenes from the recipe, each with its own narration,
// joined by the look's transition, with an optional quiet music bed. The look
// (theme.ts) sets fonts, colors, texture, motion and transitions.
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { iris } from "@remotion/transitions/iris";
import { SceneView } from "./scenes";
import { LookProvider, makeLook } from "./kit";
import { cleanTheme, Theme } from "./theme";
import type { ExplainerSpec, Scene } from "./spec";

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

/** Which scenes sit on the look's dark palette. */
const isDark = (t: Theme, s: Scene, i: number) => {
  const ends = s.type === "title" || s.type === "end";
  switch (t.darkScenes) {
    case "all":
      return true;
    case "none":
      return false;
    case "alternate":
      return ends || i % 2 === 0;
    default:
      return ends;
  }
};

const DIRS = ["from-right", "from-bottom", "from-left", "from-top"] as const;

/** The look's transition; slides and wipes change direction scene to scene. */
function presentation(t: Theme, i: number, width: number, height: number): any {
  const dir = DIRS[i % DIRS.length];
  switch (t.transition) {
    case "slide":
      return slide({ direction: dir });
    case "wipe":
      return wipe({ direction: dir });
    case "flip":
      return flip({ direction: dir });
    case "iris":
      return iris({ width, height });
    default:
      return fade();
  }
}

/** "zoom": the next scene punches in from slightly big while fading. */
const ZoomIn: React.FC<{ children: React.ReactNode; frames: number; on: boolean }> = ({ children, frames, on }) => {
  if (!on) return <>{children}</>;
  return <ZoomInner frames={frames}>{children}</ZoomInner>;
};
const ZoomInner: React.FC<{ children: React.ReactNode; frames: number }> = ({ children, frames }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, frames], [1.12, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};

export const Explainer: React.FC<{ specData: ExplainerSpec }> = ({ specData }) => {
  const spec = specData;
  const { width, height } = useVideoConfig();
  const theme = React.useMemo(() => cleanTheme(spec.look ?? "editorial"), [spec.look]);
  const t = spec.transition_frames ?? 15;
  const scenes = spec.scenes;
  const timing = theme.transition === "fade" || theme.transition === "zoom"
    ? linearTiming({ durationInFrames: t })
    : springTiming({ config: { damping: 200 }, durationInFrames: t });
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {spec.music_url ? <MusicBed url={spec.music_url} volume={spec.music_volume ?? 0.1} /> : null}
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          const look = makeLook(theme, spec.brand, isDark(theme, scene, i), !!scene.image_url);
          const out = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={Math.max(1, Math.round(scene.frames))}>
              <LookProvider look={look}>
                <ZoomIn frames={t + 6} on={theme.transition === "zoom" && i > 0}>
                  <SceneView scene={scene} />
                </ZoomIn>
              </LookProvider>
              {scene.audio_url ? (
                <Sequence from={scene.audio_start ?? 15}>
                  <Audio src={src(scene.audio_url)} />
                </Sequence>
              ) : null}
            </TransitionSeries.Sequence>,
          ];
          if (i < scenes.length - 1) {
            out.push(
              <TransitionSeries.Transition key={`t${i}`} presentation={presentation(theme, i, width, height)} timing={timing} />,
            );
          }
          return out;
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
