/**
 * Caption style presets — mirrored from the Lovable client.
 * These define the visual parameters for each caption style.
 */

export interface CaptionPreset {
  id: string;
  name: string;
  font_family: string;
  font_weight: number;
  font_size: number;
  text_transform: "uppercase" | "lowercase" | "none";
  text_color: string;
  highlight_color: string;
  bg_style: "pill" | "box" | "none" | "gradient" | "blur";
  bg_color: string;
  position: "center" | "bottom" | "bottom_left" | "top";
  animation: string;
  word_by_word: boolean;
  max_words_per_chunk: number;
}

const PRESETS: CaptionPreset[] = [
  {
    id: "hormozi",
    name: "Hormozi Bold",
    font_family: "Oswald",
    font_weight: 900,
    font_size: 72,
    text_transform: "uppercase",
    text_color: "#FFFFFF",
    highlight_color: "#FFD700",
    bg_style: "pill",
    bg_color: "rgba(0,0,0,0.75)",
    position: "center",
    animation: "pop_in",
    word_by_word: true,
    max_words_per_chunk: 5,
  },
  {
    id: "cinematic",
    name: "Cinematic",
    font_family: "Inter",
    font_weight: 500,
    font_size: 48,
    text_transform: "none",
    text_color: "#FFFFFF",
    highlight_color: "#E0E0E0",
    bg_style: "gradient",
    bg_color: "linear-gradient(transparent, rgba(0,0,0,0.8))",
    position: "bottom",
    animation: "fade",
    word_by_word: false,
    max_words_per_chunk: 6,
  },
  {
    id: "tiktok",
    name: "TikTok Trendy",
    font_family: "Montserrat",
    font_weight: 800,
    font_size: 64,
    text_transform: "uppercase",
    text_color: "#FFFFFF",
    highlight_color: "#FF3B5C",
    bg_style: "none",
    bg_color: "transparent",
    position: "center",
    animation: "bounce",
    word_by_word: true,
    max_words_per_chunk: 4,
  },
  {
    id: "minimal",
    name: "Minimal",
    font_family: "Inter",
    font_weight: 400,
    font_size: 36,
    text_transform: "lowercase",
    text_color: "#F0F0F0",
    highlight_color: "#CCCCCC",
    bg_style: "none",
    bg_color: "transparent",
    position: "bottom_left",
    animation: "fade",
    word_by_word: false,
    max_words_per_chunk: 8,
  },
  {
    id: "karaoke",
    name: "Karaoke",
    font_family: "Bebas Neue",
    font_weight: 400,
    font_size: 56,
    text_transform: "uppercase",
    text_color: "rgba(255,255,255,0.4)",
    highlight_color: "#00FF88",
    bg_style: "box",
    bg_color: "rgba(0,0,0,0.6)",
    position: "bottom",
    animation: "karaoke",
    word_by_word: true,
    max_words_per_chunk: 10,
  },
];

export function getCaptionPreset(id: string): CaptionPreset {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}
