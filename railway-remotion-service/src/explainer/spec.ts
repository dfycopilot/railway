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
  // Social videos (2026-11-12): every spoken word and the frame it starts at,
  // for word-by-word captions. Absent on explainer videos.
  words?: Caption[];
  // Social videos (2026-11-12): a curiosity "reloop" sticker (e.g. "WAIT FOR
  // IT…") that pops in at the frame the voice says the reloop line.
  reloop?: { text: string; at: number } | null;
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
  button?: string; // social videos: the next step, e.g. "Book a free call"
  question?: string; // social videos: a question for the comments
};

// ── social video scenes (2026-11-12: Promo, Quick Tip, Announcement, Meet Your Agent) ──
// A picture or video the agent uploaded (or one of their finished videos).
export type MediaKind = "image" | "video";

/** The opening: 1–3 short hook lines stacked one after another (one cue per
 *  line), over or beside the agent's media. Text is on screen from frame 0. */
export type HookScene = Base & {
  type: "hook";
  lines: string[]; // 1–3, each may *star* one word
  media_url?: string | null;
  media_kind?: MediaKind;
  media_frame?: "phone" | "full"; // in a phone frame, or full-bleed behind the words
};
/** ✕ or ✓ stamps that slam in, one per cue. */
export type StampsScene = Base & {
  type: "stamps";
  headline?: string;
  mode: "no" | "yes";
  items: string[]; // 1–3, short
};
/** A web page (captured) or a screenshot, in a phone or browser frame; the
 *  camera zooms to each focus box (screenshot pixels) at its cue, with a ring
 *  and, if tap, a tap. */
export type ScreenScene = Base & {
  type: "screen";
  headline?: string;
  image_url: string;
  image_w: number;
  image_h: number;
  device: "phone" | "browser";
  focus: { x: number; y: number; w: number; h: number; tap?: boolean }[]; // 0–4
};
/** The agent's own photo or video, full-bleed, in a phone, or on a card. */
export type MediaScene = Base & {
  type: "media";
  headline?: string;
  media_url: string;
  media_kind: MediaKind;
  frame: "phone" | "full" | "card";
};
/** One tip, big. The detail line appears at the cue. */
export type TipScene = Base & {
  type: "tip";
  label: string; // e.g. "QUICK TIP" or "TIP #2"
  headline: string; // the tip itself, may *star* a word
  detail?: string;
};
/** A date reveal (calendar page) for announcements. */
export type DateScene = Base & {
  type: "date";
  month: string; // e.g. "OCT"
  day: string; // e.g. "15" (or a short word like "NOW")
  label: string; // what happens then
  note?: string; // e.g. "Runs through Dec 7"
};
/** The agent: photo, name, title, and up to 3 badges (one cue per badge). */
export type ProfileScene = Base & {
  type: "profile";
  photo_url?: string | null;
  name: string;
  title?: string;
  badges: string[]; // 0–3
};
/** A short quote in big type, with who said it. */
export type QuoteScene = Base & {
  type: "quote";
  text: string;
  by?: string;
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
  | EndScene
  | HookScene
  | StampsScene
  | ScreenScene
  | MediaScene
  | TipScene
  | DateScene
  | ProfileScene
  | QuoteScene;

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
  // The video's language (2026-11-11): which letters the fonts need, whether
  // it reads right to left, and whether it's written without spaces.
  language?: { code: string; script: string; rtl?: boolean; no_spaces?: boolean } | null;
  // "social" (2026-11-12): word-by-word captions, quick punch cuts, bigger
  // type — the Promo / Quick Tip / Announcement / Meet Your Agent videos.
  style?: "explainer" | "social";
  kind?: "explainer" | "promo" | "tip" | "announcement" | "intro";
  scenes: Scene[];
};

export const totalFrames = (spec: ExplainerSpec) => {
  const t = spec.transition_frames ?? 15;
  const sum = spec.scenes.reduce((a, s) => a + Math.max(1, Math.round(s.frames)), 0);
  return Math.max(1, sum - t * Math.max(0, spec.scenes.length - 1));
};
