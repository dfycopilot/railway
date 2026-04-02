import React from "react";
import { Composition } from "remotion";
import { FullComposition } from "./FullComposition";
import { compositionSchema } from "./schema";

export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
