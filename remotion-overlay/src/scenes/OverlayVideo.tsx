/**
 * Main overlay composition — renders all graphics elements
 * on a transparent canvas based on the graphics_spec.
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Sequence } from "remotion";
import { KineticText } from "../components/KineticText";
import { NumberedSection } from "../components/NumberedSection";
import { TitleCard } from "../components/TitleCard";
import { CountdownNumber } from "../components/CountdownNumber";
import { CornerBrackets } from "../components/CornerBrackets";
import { LightLeak } from "../components/LightLeak";
import { FilmGrain } from "../components/FilmGrain";
import { Vignette } from "../components/Vignette";

interface GraphicsSpec {
  duration_seconds: number;
  width: number;
  height: number;
  fps: number;
  scenes: SceneSpec[];
  persistent: PersistentElement[];
}

interface SceneSpec {
  start: number;
  end: number;
  elements: ElementSpec[];
}

interface ElementSpec {
  type: string;
  text?: string;
  style?: string;
  color?: string;
  animation?: string;
  intensity?: number;
  opacity?: number;
  position?: string;
  number?: string;
  title?: string;
  subtitle?: string;
  lines?: { text: string; color?: string; size?: string }[];
}

interface PersistentElement {
  type: string;
  intensity?: number;
  color?: string;
  opacity?: number;
}

export const OverlayVideo: React.FC<{ graphicsSpec: GraphicsSpec }> = ({ graphicsSpec }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {/* Persistent elements — span entire video */}
      {graphicsSpec.persistent?.map((el, i) => (
        <PersistentLayer key={`persistent-${i}`} element={el} />
      ))}

      {/* Scene-based elements — timed sequences */}
      {graphicsSpec.scenes?.map((scene, i) => {
        const startFrame = Math.round(scene.start * fps);
        const durationFrames = Math.round((scene.end - scene.start) * fps);

        return (
          <Sequence key={`scene-${i}`} from={startFrame} durationInFrames={durationFrames}>
            <AbsoluteFill>
              {scene.elements.map((el, j) => (
                <ElementRenderer key={`el-${i}-${j}`} element={el} durationFrames={durationFrames} />
              ))}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const PersistentLayer: React.FC<{ element: PersistentElement }> = ({ element }) => {
  switch (element.type) {
    case "film_grain":
      return <FilmGrain intensity={element.intensity ?? 0.1} />;
    case "light_leak":
      return <LightLeak color={element.color ?? "warm"} opacity={element.opacity ?? 0.15} />;
    case "vignette":
      return <Vignette intensity={element.intensity ?? 0.5} />;
    case "corner_brackets":
      return <CornerBrackets color={element.color ?? "#D4A843"} />;
    default:
      return null;
  }
};

const ElementRenderer: React.FC<{ element: ElementSpec; durationFrames: number }> = ({ element, durationFrames }) => {
  switch (element.type) {
    case "kinetic_text":
      return (
        <KineticText
          text={element.text ?? ""}
          style={element.style ?? "hero_bold"}
          color={element.color ?? "#FFFFFF"}
          animation={element.animation ?? "slam_in"}
          durationFrames={durationFrames}
        />
      );
    case "numbered_section":
      return (
        <NumberedSection
          number={element.number ?? "01"}
          title={element.title ?? ""}
          subtitle={element.subtitle ?? ""}
          position={element.position ?? "bottom_left"}
          color={element.color ?? "#FFFFFF"}
          animation={element.animation ?? "slide_up"}
          durationFrames={durationFrames}
        />
      );
    case "title_card":
      return (
        <TitleCard
          lines={element.lines ?? [{ text: element.text ?? "" }]}
          animation={element.animation ?? "fade_reveal"}
          durationFrames={durationFrames}
        />
      );
    case "countdown_number":
      return (
        <CountdownNumber
          number={element.number ?? "1"}
          label={element.title ?? ""}
          subtitle={element.subtitle ?? ""}
          color={element.color ?? "#D4A843"}
          durationFrames={durationFrames}
        />
      );
    case "corner_brackets":
      return <CornerBrackets color={element.color ?? "#D4A843"} animation={element.animation} />;
    case "vignette":
      return <Vignette intensity={element.intensity ?? 0.5} />;
    case "light_leak":
      return <LightLeak color={element.color ?? "warm"} opacity={element.opacity ?? 0.2} />;
    case "film_grain":
      return <FilmGrain intensity={element.intensity ?? 0.1} />;
    default:
      return null;
  }
};
