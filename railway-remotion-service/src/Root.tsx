import React from "react";
import { Composition } from "remotion";
import { FullComposition } from "./FullComposition";
import { compositionSchema } from "./schema";
import { Explainer } from "./explainer/Explainer";
import { totalFrames, type ExplainerSpec } from "./explainer/spec";

export const RemotionRoot: React.FC = () => {
  return (
    <>
    {/* Explainer videos (2026-11-10): the recipe sets size and length. */}
    <Composition
      id="Explainer"
      component={Explainer}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ specData: { width: 1920, height: 1080, fps: 30, brand: { name: "", initials: "", primary: "#1F4E79", accent: "#C8761E", phone: "", website: "" }, scenes: [] } as ExplainerSpec }}
      calculateMetadata={async ({ props }) => {
        const spec = props.specData;
        return {
          durationInFrames: totalFrames(spec),
          fps: spec.fps || 30,
          width: spec.width || 1920,
          height: spec.height || 1080,
        };
      }}
    />
    <Composition
      id="FullComposition"
      component={FullComposition}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      schema={compositionSchema}
      calculateMetadata={async ({ props }) => {
        const spec = props.specData;
        if (!spec) return {};
        return {
          durationInFrames: spec.duration_frames || 900,
          fps: spec.fps || 30,
          width: spec.width || 1080,
          height: spec.height || 1920,
        };
      }}
    />
    </>
  );
};
