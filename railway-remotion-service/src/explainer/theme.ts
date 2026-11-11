// Explainer "looks" (2026-11-11). Every scene draws from one Theme: fonts,
// colors, background texture, how text and items come in, caption and tag
// style, card shape, transitions. The six built-in looks and any look a user
// describes in words (Copilot's AI fills this same shape) are just data, so a
// made-up look can change everything about the feel without new code — and
// without anything that could break a render. `cleanTheme` fills gaps and
// clamps every field to a value the renderer knows.
import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as archivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as barlowCondensed } from "@remotion/google-fonts/BarlowCondensed";
import { loadFont as bebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as caveat } from "@remotion/google-fonts/Caveat";
import { loadFont as dmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as fraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as fredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as instrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as kalam } from "@remotion/google-fonts/Kalam";
import { loadFont as libreBaskerville } from "@remotion/google-fonts/LibreBaskerville";
import { loadFont as lora } from "@remotion/google-fonts/Lora";
import { loadFont as manrope } from "@remotion/google-fonts/Manrope";
import { loadFont as montserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as nunito } from "@remotion/google-fonts/Nunito";
import { loadFont as oswald } from "@remotion/google-fonts/Oswald";
import { loadFont as outfit } from "@remotion/google-fonts/Outfit";
import { loadFont as patrickHand } from "@remotion/google-fonts/PatrickHand";
import { loadFont as playfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as poppins } from "@remotion/google-fonts/Poppins";
import { loadFont as quicksand } from "@remotion/google-fonts/Quicksand";
import { loadFont as robotoSlab } from "@remotion/google-fonts/RobotoSlab";
import { loadFont as sora } from "@remotion/google-fonts/Sora";
import { loadFont as spaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

type Loader = () => { fontFamily: string };
const L = (fn: any, weights: string[], italic = false): Loader => () => {
  const r = fn("normal", { weights, subsets: ["latin"] });
  if (italic) {
    try {
      fn("italic", { weights: [weights[0]], subsets: ["latin"] });
    } catch {
      /* this font has no italic */
    }
  }
  return r;
};

// The fonts a look may use. Keys are what Copilot's AI picks from.
export const FONTS: Record<string, Loader> = {
  "instrument-serif": L(instrumentSerif, ["400"], true),
  playfair: L(playfair, ["600", "800"], true),
  fraunces: L(fraunces, ["600", "800"], true),
  lora: L(lora, ["500", "700"], true),
  "libre-baskerville": L(libreBaskerville, ["400", "700"], true),
  "roboto-slab": L(robotoSlab, ["500", "800"]),
  inter: L(inter, ["400", "500", "600", "700", "800"]),
  "dm-sans": L(dmSans, ["400", "500", "700"]),
  manrope: L(manrope, ["400", "600", "800"]),
  montserrat: L(montserrat, ["500", "700", "900"], true),
  poppins: L(poppins, ["400", "600", "800"]),
  outfit: L(outfit, ["400", "600", "800"]),
  sora: L(sora, ["400", "600", "800"]),
  "space-grotesk": L(spaceGrotesk, ["400", "500", "700"]),
  nunito: L(nunito, ["500", "700", "900"]),
  quicksand: L(quicksand, ["500", "700"]),
  fredoka: L(fredoka, ["500", "600"]),
  anton: L(anton, ["400"]),
  bebas: L(bebas, ["400"]),
  oswald: L(oswald, ["500", "700"]),
  "barlow-condensed": L(barlowCondensed, ["600", "800"], true),
  "archivo-black": L(archivoBlack, ["400"]),
  caveat: L(caveat, ["600", "700"]),
  "patrick-hand": L(patrickHand, ["400"]),
  kalam: L(kalam, ["400", "700"]),
};

const loaded = new Map<string, string>();
export const fontFamily = (key: string): string => {
  const k = FONTS[key] ? key : "inter";
  if (!loaded.has(k)) loaded.set(k, FONTS[k]().fontFamily);
  return loaded.get(k)!;
};

export type Palette = { bg: string; ink: string; muted: string; surface: string; line: string };

export const TEXTURES = ["none", "dots", "grid", "lines", "paper", "stripes", "glow", "halftone"] as const;
export const ENTRANCES = ["rise", "pop", "slide", "type", "blur"] as const;
export const ITEM_ENTRANCES = ["rise", "pop", "slide", "flip"] as const;
export const CAPTIONS = ["bar", "pill", "highlight", "plain", "block"] as const;
export const TAGS = ["chip", "bar", "underline", "stamp"] as const;
export const TRANSITIONS = ["fade", "slide", "wipe", "flip", "iris", "zoom"] as const;
export const SHADOWS = ["soft", "hard", "none", "outline"] as const;
export const DARK_SCENES = ["ends", "all", "none", "alternate"] as const;

export type Theme = {
  id: string;
  name: string;
  head: string; // FONTS key for headlines
  body: string; // FONTS key for everything else
  headWeight: number;
  headUpper: boolean; // headlines in capitals
  headItalicAccent: boolean; // *starred* words italic as well as colored
  headScale: number; // 0.7–1.25 × the normal headline size
  tracking: number; // headline letter spacing, px
  light: Palette;
  dark: Palette;
  darkScenes: (typeof DARK_SCENES)[number]; // which scenes use the dark palette
  texture: (typeof TEXTURES)[number];
  radius: number; // card corner radius, px
  shadow: (typeof SHADOWS)[number];
  headlineIn: (typeof ENTRANCES)[number];
  itemIn: (typeof ITEM_ENTRANCES)[number];
  caption: (typeof CAPTIONS)[number];
  tag: (typeof TAGS)[number];
  transition: (typeof TRANSITIONS)[number];
  camera: number; // slow push-in amount, 0–0.06
  tilt: number; // a playful tilt on cards, degrees (0 = straight)
  accentFill: boolean; // stat numbers / badges filled with brand color blocks
};

// Built-in looks. Colors here are the stage; the agency's own brand colors
// (primary + accent) are layered on top in every look.
export const LOOKS: Record<string, Theme> = {
  editorial: {
    id: "editorial",
    name: "Editorial",
    head: "instrument-serif",
    body: "inter",
    headWeight: 400,
    headUpper: false,
    headItalicAccent: true,
    headScale: 1,
    tracking: 0,
    light: { bg: "#F3F0EA", ink: "#1D1B18", muted: "#6B665E", surface: "#FFFFFF", line: "#ECE8E0" },
    dark: { bg: "#1D1B18", ink: "#F5F2EC", muted: "#CFC9BF", surface: "#2A2723", line: "#3A3631" },
    darkScenes: "ends",
    texture: "glow",
    radius: 28,
    shadow: "soft",
    headlineIn: "rise",
    itemIn: "rise",
    caption: "bar",
    tag: "chip",
    transition: "fade",
    camera: 0.035,
    tilt: 0,
    accentFill: false,
  },
  bold: {
    id: "bold",
    name: "Bold",
    head: "anton",
    body: "montserrat",
    headWeight: 400,
    headUpper: true,
    headItalicAccent: false,
    headScale: 1.1,
    tracking: 1,
    light: { bg: "#111111", ink: "#FFFFFF", muted: "#B8B8B8", surface: "#1E1E1E", line: "#333333" },
    dark: { bg: "#000000", ink: "#FFFFFF", muted: "#BDBDBD", surface: "#1A1A1A", line: "#333333" },
    darkScenes: "all",
    texture: "halftone",
    radius: 6,
    shadow: "hard",
    headlineIn: "pop",
    itemIn: "slide",
    caption: "highlight",
    tag: "stamp",
    transition: "zoom",
    camera: 0.05,
    tilt: 0,
    accentFill: true,
  },
  clean: {
    id: "clean",
    name: "Clean",
    head: "manrope",
    body: "manrope",
    headWeight: 800,
    headUpper: false,
    headItalicAccent: false,
    headScale: 0.9,
    tracking: -1,
    light: { bg: "#FFFFFF", ink: "#0F172A", muted: "#64748B", surface: "#F8FAFC", line: "#E2E8F0" },
    dark: { bg: "#0F172A", ink: "#F8FAFC", muted: "#94A3B8", surface: "#1E293B", line: "#334155" },
    darkScenes: "none",
    texture: "grid",
    radius: 16,
    shadow: "outline",
    headlineIn: "slide",
    itemIn: "rise",
    caption: "pill",
    tag: "underline",
    transition: "slide",
    camera: 0.02,
    tilt: 0,
    accentFill: false,
  },
  bright: {
    id: "bright",
    name: "Bright",
    head: "fredoka",
    body: "nunito",
    headWeight: 600,
    headUpper: false,
    headItalicAccent: false,
    headScale: 1,
    tracking: 0,
    light: { bg: "@tint", ink: "#1F2340", muted: "#565B7A", surface: "#FFFFFF", line: "#E7E9F5" },
    dark: { bg: "@primary", ink: "#FFFFFF", muted: "#F1F1FF", surface: "#FFFFFF", line: "#FFFFFF33" },
    darkScenes: "alternate",
    texture: "dots",
    radius: 36,
    shadow: "soft",
    headlineIn: "pop",
    itemIn: "pop",
    caption: "pill",
    tag: "chip",
    transition: "iris",
    camera: 0.03,
    tilt: 2,
    accentFill: true,
  },
  notebook: {
    id: "notebook",
    name: "Notebook",
    head: "caveat",
    body: "patrick-hand",
    headWeight: 700,
    headUpper: false,
    headItalicAccent: false,
    headScale: 1.15,
    tracking: 0,
    light: { bg: "#FBF8EF", ink: "#2B2B2B", muted: "#5E5A52", surface: "#FFFDF6", line: "#E9E2CF" },
    dark: { bg: "#23302A", ink: "#F2F2EA", muted: "#C9D2C4", surface: "#2C3B34", line: "#3E5047" },
    darkScenes: "ends",
    texture: "lines",
    radius: 10,
    shadow: "outline",
    headlineIn: "type",
    itemIn: "rise",
    caption: "plain",
    tag: "underline",
    transition: "wipe",
    camera: 0.02,
    tilt: -1.5,
    accentFill: false,
  },
  newsroom: {
    id: "newsroom",
    name: "Newsroom",
    head: "barlow-condensed",
    body: "inter",
    headWeight: 800,
    headUpper: true,
    headItalicAccent: false,
    headScale: 1.05,
    tracking: 0.5,
    light: { bg: "#EEF1F5", ink: "#0B1220", muted: "#4B5565", surface: "#FFFFFF", line: "#D5DBE3" },
    dark: { bg: "#0B1220", ink: "#FFFFFF", muted: "#AAB4C3", surface: "#152036", line: "#24314B" },
    darkScenes: "ends",
    texture: "stripes",
    radius: 4,
    shadow: "soft",
    headlineIn: "blur",
    itemIn: "slide",
    caption: "block",
    tag: "bar",
    transition: "wipe",
    camera: 0.025,
    tilt: 0,
    accentFill: true,
  },
};

export const LOOK_IDS = Object.keys(LOOKS);

const pick = <T extends readonly string[]>(list: T, v: unknown, d: T[number]): T[number] =>
  (list as readonly string[]).includes(String(v)) ? (String(v) as T[number]) : d;
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const color = (v: unknown, d: string) => {
  const s = String(v ?? "");
  return /^#[0-9a-fA-F]{3,8}$/.test(s) || s === "@tint" || s === "@primary" || s === "@accent" ? s : d;
};
const palette = (p: any, d: Palette): Palette => ({
  bg: color(p?.bg, d.bg),
  ink: color(p?.ink, d.ink),
  muted: color(p?.muted, d.muted),
  surface: color(p?.surface, d.surface),
  line: color(p?.line, d.line),
});

/** A look from the spec: a built-in id, or a whole custom look (filled out
 *  from the closest built-in and clamped to values the renderer knows). */
export function cleanTheme(t: any): Theme {
  if (typeof t === "string") return LOOKS[t] ?? LOOKS.editorial;
  const base = LOOKS[String(t?.base ?? t?.id ?? "")] ?? LOOKS.editorial;
  if (!t || typeof t !== "object") return base;
  return {
    id: String(t.id ?? base.id).slice(0, 40),
    name: String(t.name ?? base.name).slice(0, 40),
    head: FONTS[t.head] ? t.head : base.head,
    body: FONTS[t.body] ? t.body : base.body,
    headWeight: num(t.headWeight, 300, 900, base.headWeight),
    headUpper: typeof t.headUpper === "boolean" ? t.headUpper : base.headUpper,
    headItalicAccent: typeof t.headItalicAccent === "boolean" ? t.headItalicAccent : base.headItalicAccent,
    headScale: num(t.headScale, 0.7, 1.25, base.headScale),
    tracking: num(t.tracking, -3, 6, base.tracking),
    light: palette(t.light, base.light),
    dark: palette(t.dark, base.dark),
    darkScenes: pick(DARK_SCENES, t.darkScenes, base.darkScenes),
    texture: pick(TEXTURES, t.texture, base.texture),
    radius: num(t.radius, 0, 48, base.radius),
    shadow: pick(SHADOWS, t.shadow, base.shadow),
    headlineIn: pick(ENTRANCES, t.headlineIn, base.headlineIn),
    itemIn: pick(ITEM_ENTRANCES, t.itemIn, base.itemIn),
    caption: pick(CAPTIONS, t.caption, base.caption),
    tag: pick(TAGS, t.tag, base.tag),
    transition: pick(TRANSITIONS, t.transition, base.transition),
    camera: num(t.camera, 0, 0.06, base.camera),
    tilt: num(t.tilt, -4, 4, base.tilt),
    accentFill: typeof t.accentFill === "boolean" ? t.accentFill : base.accentFill,
  };
}

// ── colors ────────────────────────────────────────────────────────────────
const hex = (c: string) => {
  let h = c.replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
};
export const mix = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
/** Relative brightness 0–1: for picking readable text on a brand color. */
export const lum = (c: string) => {
  const [r, g, b] = hex(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const onColor = (c: string) => (lum(c) > 0.45 ? "#111111" : "#FFFFFF");
/** WCAG contrast ratio between two colors (1–21). */
export const contrast = (a: string, b: string) => {
  const x = lum(a) + 0.05;
  const y = lum(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
};

/** "@tint"/"@primary"/"@accent" → real colors from the brand. */
export const resolve = (c: string, brand: { primary: string; accent: string }) =>
  c === "@primary" ? brand.primary : c === "@accent" ? brand.accent : c === "@tint" ? mix(brand.primary, "#FFFFFF", 0.9) : c;
