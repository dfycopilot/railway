/**
 * SceneLayout — positioning helper for multi-region scene rendering.
 *
 * Why this exists: every scene historically rendered the speaker video edge-to-edge.
 * That works for vlog-style talking heads, but YouTube-style edits often want
 * the speaker on one side and a graphic / B-roll / title card on the other —
 * the "split-screen" or "picture-in-picture" look.
 *
 * Layouts:
 *   - fullscreen      — speaker fills the frame (default, legacy behavior)
 *   - split_left      — speaker on LEFT half, companion fills RIGHT half
 *   - split_right     — speaker on RIGHT half, companion fills LEFT half
 *   - split_top       — speaker on TOP half, companion fills BOTTOM half
 *   - split_bottom    — speaker on BOTTOM half, companion fills TOP half
 *   - pip_top_left    — speaker fullscreen, companion as small picture-in-picture in top-left
 *   - pip_top_right   — same, top-right
 *   - pip_bottom_left — same, bottom-left
 *   - pip_bottom_right— same, bottom-right
 *
 * The naming convention "split_<side>" describes where the SPEAKER lives, not
 * the companion. So `split_left` = speaker on left, companion on right.
 *
 * For PIP, the side describes where the COMPANION (the small inset) lives —
 * the speaker always fills the full frame underneath.
 *
 * Returned `main` and `companion` are CSS style objects ready to drop into a
 * positioned <div>. They use percent units so they scale with the composition
 * dimensions automatically.
 */

import type { CSSProperties } from "react";

export type SceneLayoutType =
  | "fullscreen"
  | "split_left"
  | "split_right"
  | "split_top"
  | "split_bottom"
  | "pip_top_left"
  | "pip_top_right"
  | "pip_bottom_left"
  | "pip_bottom_right";

export interface LayoutSlots {
  /** CSS for the main speaker-video region. */
  main: CSSProperties;
  /** CSS for the companion content region. `null` means no companion (fullscreen). */
  companion: CSSProperties | null;
}

const PIP_SIZE_PCT = 28;          // 28% of width — readable but not dominant
const PIP_INSET_PCT = 4;          // 4% margin from edges

const fill: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

export function getLayoutSlots(layout: SceneLayoutType): LayoutSlots {
  switch (layout) {
    case "split_left":
      return {
        main: { position: "absolute", left: 0, top: 0, width: "50%", height: "100%", overflow: "hidden" },
        companion: { position: "absolute", left: "50%", top: 0, width: "50%", height: "100%", overflow: "hidden" },
      };
    case "split_right":
      return {
        main: { position: "absolute", left: "50%", top: 0, width: "50%", height: "100%", overflow: "hidden" },
        companion: { position: "absolute", left: 0, top: 0, width: "50%", height: "100%", overflow: "hidden" },
      };
    case "split_top":
      return {
        main: { position: "absolute", left: 0, top: 0, width: "100%", height: "50%", overflow: "hidden" },
        companion: { position: "absolute", left: 0, top: "50%", width: "100%", height: "50%", overflow: "hidden" },
      };
    case "split_bottom":
      return {
        main: { position: "absolute", left: 0, top: "50%", width: "100%", height: "50%", overflow: "hidden" },
        companion: { position: "absolute", left: 0, top: 0, width: "100%", height: "50%", overflow: "hidden" },
      };
    case "pip_top_left":
      return {
        main: { ...fill },
        companion: {
          position: "absolute",
          left: `${PIP_INSET_PCT}%`,
          top: `${PIP_INSET_PCT}%`,
          width: `${PIP_SIZE_PCT}%`,
          height: `${PIP_SIZE_PCT}%`,
          overflow: "hidden",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        },
      };
    case "pip_top_right":
      return {
        main: { ...fill },
        companion: {
          position: "absolute",
          right: `${PIP_INSET_PCT}%`,
          top: `${PIP_INSET_PCT}%`,
          width: `${PIP_SIZE_PCT}%`,
          height: `${PIP_SIZE_PCT}%`,
          overflow: "hidden",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        },
      };
    case "pip_bottom_left":
      return {
        main: { ...fill },
        companion: {
          position: "absolute",
          left: `${PIP_INSET_PCT}%`,
          bottom: `${PIP_INSET_PCT}%`,
          width: `${PIP_SIZE_PCT}%`,
          height: `${PIP_SIZE_PCT}%`,
          overflow: "hidden",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        },
      };
    case "pip_bottom_right":
      return {
        main: { ...fill },
        companion: {
          position: "absolute",
          right: `${PIP_INSET_PCT}%`,
          bottom: `${PIP_INSET_PCT}%`,
          width: `${PIP_SIZE_PCT}%`,
          height: `${PIP_SIZE_PCT}%`,
          overflow: "hidden",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        },
      };
    case "fullscreen":
    default:
      return { main: { ...fill }, companion: null };
  }
}

/**
 * Normalizes any string we get from the planner into a valid layout enum.
 * Defaults to "fullscreen" for unknown / missing values so legacy plans keep
 * working unchanged.
 */
export function normalizeLayout(value: unknown): SceneLayoutType {
  const v = String(value || "").toLowerCase().trim();
  switch (v) {
    case "split_left":
    case "split_right":
    case "split_top":
    case "split_bottom":
    case "pip_top_left":
    case "pip_top_right":
    case "pip_bottom_left":
    case "pip_bottom_right":
      return v as SceneLayoutType;
    // Friendly aliases the planner might emit
    case "split":
    case "split-screen":
    case "split_screen":
      return "split_left";
    case "pip":
    case "picture_in_picture":
      return "pip_bottom_right";
    default:
      return "fullscreen";
  }
}
