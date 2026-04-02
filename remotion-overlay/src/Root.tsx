import { Composition } from "remotion";
import { OverlayVideo } from "./scenes/OverlayVideo";

export const RemotionRoot = () => (
  <Composition
    id="overlay"
    component={OverlayVideo}
    durationInFrames={900} // default 30s @ 30fps, overridden at render time
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{
      graphicsSpec: {
        duration_seconds: 30,
        width: 1920,
        height: 1080,
        fps: 30,
        scenes: [],
        persistent: [],
      },
    }}
  />
);
