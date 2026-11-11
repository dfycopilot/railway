// The explainer video "recipe" Copilot sends to the renderer. Copilot's server
// writes it: the AI picks scene types and fills their words, the voice service
// supplies each scene's audio + word timing, and the server turns that timing
// into frame numbers (cues, captions) so the renderer only has to draw.
import type { Brand } from "./kit";

export type Caption = { at: number; text: string };

type Base = {
  frames: number; // scene length, including the lead-in and tail around the voice
  audio_url?: string | null; // this scene's narration
  audio_start?: number; // frame the narration starts at (lead-in)
  captions: Caption[];
  cues: number[]; // frames where each item appears, in item order
  tag?: string; // small section label, e.g. "WHAT BOTH COVER"
  variant?: number; // which layout of this scene type (2026-11-11), any number; wraps
  image_url?: string | null; // a picture behind this scene (AI-made or the agent's own)
};

// A headline may wrap one or more words in *stars* to set them in the accent color.
export type TitleScene = Base & { type: "title"; headline: string; subline?: string };
export type CardsScene = Base & {
  type: "cards";
  headline: string;
  cards: { badge: string; title: string; text: string }[]; // 2–3
};
export type ChecklistScene = Base & {
  type: "checklist";
  headline: string;
  subline?: string;
  items: string[]; // 3–6
};
export type TableScene = Base & {
  type: "table";
  headline: string;
  columns: string[]; // 2–3 option names, e.g. ["Plan G", "Plan N"]
  rows: { label: string; values: string[]; warn?: boolean[] }[]; // 2–6
};
export type ColumnsScene = Base & {
  type: "columns";
  columns: { heading: string; points: string[] }[]; // 2, heading may use *stars*
};
export type StepsScene = Base & {
  type: "steps";
  headline: string;
  steps: { label: string; detail: string }[]; // 2–5, e.g. enrollment periods
};
export type StatScene = Base & {
  type: "stat";
  value: string; // e.g. "65", "$0", "7 months"
  label: string;
  note?: string;
};
export type PhoneScene = Base & {
  type: "phone";
  headline: string;
  text: string;
  messages: { from: "agent" | "client"; text: string }[]; // 1–3
  button: string; // e.g. "Book a free call"
  done: string; // e.g. "✓ Booked · Tue 10:30 AM"
};
export type EndScene = Base & {
  type: "end";
  headline: string;
  disclaimer?: string | null;
};

export type Scene =
  | TitleScene
  | CardsScene
  | ChecklistScene
  | TableScene
  | ColumnsScene
  | StepsScene
  | StatScene
  | PhoneScene
  | EndScene;

export type ExplainerSpec = {
  width: number;
  height: number;
  fps: number;
  brand: Brand;
  music_url?: string | null;
  music_volume?: number; // default 0.1, about 20 dB under the voice
  transition_frames?: number; // cross-fade, default 15
  // The look (2026-11-11): a built-in id ("editorial", "bold", "clean",
  // "bright", "notebook", "newsroom") or a whole custom look (theme.ts).
  look?: string | Record<string, unknown> | null;
  scenes: Scene[];
};

export const totalFrames = (spec: ExplainerSpec) => {
  const t = spec.transition_frames ?? 15;
  const sum = spec.scenes.reduce((a, s) => a + Math.max(1, Math.round(s.frames)), 0);
  return Math.max(1, sum - t * Math.max(0, spec.scenes.length - 1));
};
