/**
 * Vignette — Cinematic edge darkening effect.
 */
interface Props {
  intensity?: number; // 0.0 - 1.0
}

export const Vignette: React.FC<Props> = ({ intensity = 0.5 }) => {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${intensity}) 100%)`,
      pointerEvents: "none",
    }} />
  );
};
