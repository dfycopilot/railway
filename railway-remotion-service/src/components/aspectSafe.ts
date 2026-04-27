/**
 * aspectSafe — shared helper for aspect-ratio-aware text overlay sizing.
 *
 * Problem this solves: text components (TitleCard, KineticText, StatCallout,
 * LowerThird) historically used fixed pixel font sizes (e.g. fontSize: 72)
 * tuned for 1920×1080 landscape. When a portrait composition (1080×1920) is
 * used, those fixed sizes overflow horizontally and `whiteSpace: nowrap`
 * causes text to bleed off both edges.
 *
 * Fix: every text overlay computes a `scale` factor based on the composition
 * width AND constrains its maxWidth to a safe percentage of the composition
 * width. Long phrases now wrap inside the safe zone instead of bleeding.
 *
 * Reference width is 1920 (landscape 16:9). For portrait 9:16 (1080w) the
 * scale ends up around 0.56, which keeps a 72px hero readable but contained.
 * For square (1080×1080) we get 0.56 too. Floor of 0.5 prevents pathological
 * shrinkage on tiny exports.
 */

export type AspectCategory = "portrait" | "landscape" | "square";

export function getAspectCategory(width: number, height: number): AspectCategory {
  const ratio = width / height;
  if (ratio < 0.8) return "portrait";
  if (ratio > 1.2) return "landscape";
  return "square";
}

/**
 * Scale factor to apply to font sizes / paddings tuned for 1920px-wide
 * landscape. Portrait at 1080w scales ~0.56x, square at 1080 also ~0.56x.
 * Floor at 0.5 to keep text readable even on unusual export sizes.
 */
export function getOverlayScale(width: number): number {
  const REFERENCE_WIDTH = 1920;
  const ratio = width / REFERENCE_WIDTH;
  return Math.max(0.5, Math.min(1.0, ratio));
}

/**
 * Max width (in CSS units) for text overlays. Matches the caption gutter
 * (78% of composition width with 11% on each side), giving text room to
 * wrap without bleeding past the safe zone.
 */
export function getOverlayMaxWidth(width: number): string {
  // CaptionRenderer uses 78% across the board; we mirror that for overlays.
  return "78%";
}

/**
 * Returns true if the composition is portrait. Convenience wrapper for
 * components that only need a binary check.
 */
export function isPortraitComposition(width: number, height: number): boolean {
  return getAspectCategory(width, height) === "portrait";
}
