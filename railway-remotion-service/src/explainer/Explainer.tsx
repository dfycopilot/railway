// The explainer video: scenes from the recipe, each with its own narration,
// joined by the look's transition, with an optional quiet music bed. The look
// (theme.ts) sets fonts, colors, texture, motion and transitions.
import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { iris } from "@remotion/transitions/iris";
import { SceneView } from "./scenes";
import { LookProvider, makeLook } from "./kit";
import { cleanLanguage, cleanTheme, themeForLanguage, Theme } from "./theme";
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
  const ends = s.type === "title" || s.type === "end" || s.type === "hook";
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

/** "zoom": the next scene punches in from slightly big while fading.
 *  Social videos use a quicker, smaller punch on every cut. */
const ZoomIn: React.FC<{ children: React.ReactNode; frames: number; on: boolean; from?: number }> = ({ children, frames, on, from }) => {
  if (!on) return <>{children}</>;
  return <ZoomInner frames={frames} from={from ?? 1.12}>{children}</ZoomInner>;
};
const ZoomInner: React.FC<{ children: React.ReactNode; frames: number; from: number }> = ({ children, frames, from }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, frames], [from, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};

export const Explainer: React.FC<{ specData: ExplainerSpec }> = ({ specData }) => {
  const spec = specData;
  const { width, height } = useVideoConfig();
  const lang = React.useMemo(() => cleanLanguage(spec.language), [spec.language]);
  const theme = React.useMemo(() => themeForLanguage(cleanTheme(spec.look ?? "editorial"), lang), [spec.look, lang]);
  const social = spec.style === "social";
  const t = spec.transition_frames ?? 15;
  const scenes = spec.scenes;
  const timing = social || theme.transition === "fade" || theme.transition === "zoom"
    ? linearTiming({ durationInFrames: t })
    : springTiming({ config: { damping: 200 }, durationInFrames: t });
  return (
    <AbsoluteFill style={{ background: "#000", direction: lang.rtl ? "rtl" : "ltr" }} lang={lang.code} dir={lang.rtl ? "rtl" : "ltr"}>
      {spec.music_url ? <MusicBed url={spec.music_url} volume={spec.music_volume ?? 0.1} /> : null}
      <TransitionSeries>
        {scenes.flatMap((scene, i) => {
          // A screen scene's image_url is the captured page itself, not a picture behind the scene.
          const picture = !!scene.image_url && !["screen", "media", "profile"].includes(scene.type);
          const look = makeLook(theme, spec.brand, isDark(theme, scene, i), picture, lang, social);
          const out = [
            <TransitionSeries.Sequence key={`s${i}`} durationInFrames={Math.max(1, Math.round(scene.frames))}>
              <LookProvider look={look}>
                <ZoomIn
                  frames={social ? Math.max(8, t) : t + 6}
                  from={social ? 1.08 : 1.12}
                  on={(social || theme.transition === "zoom") && i > 0}
                >
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
              <TransitionSeries.Transition
                key={`t${i}`}
                presentation={social ? fade() : presentation(theme, i, width, height)}
                timing={timing}
              />,
            );
          }
          return out;
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
