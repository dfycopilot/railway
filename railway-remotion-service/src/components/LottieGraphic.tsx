/**
 * LottieGraphic — drop-in Lottie animation renderer.
 *
 * Two ways to use it:
 *   1. By NAME from our built-in library: `<LottieGraphic name="checkmark" />`
 *   2. By URL to a hosted .json file: `<LottieGraphic url="https://..." />`
 *
 * Why we ship a built-in library: external Lottie URLs (LottieFiles, etc.)
 * would have to be fetched at render time inside a sandboxed Chromium, which
 * is flaky and adds external dependencies the user doesn't control. A small
 * curated library means common requests like "checkmark," "arrow drawing in,"
 * "loading spinner," and "stat-counting-up" Just Work without any setup.
 *
 * The library is intentionally small — every entry adds bundle weight and
 * render-time RAM. Callers can still pass `url` for one-off needs.
 *
 * Coloring: every built-in animation has an `accentColor` recolor applied at
 * render time so the same shape can match the project's theme. We walk the
 * Lottie JSON tree and replace any layer named "accent" or any color stop
 * tagged `__accent__` with the requested color.
 */

import React, { useMemo } from "react";
import { Player } from "@remotion/lottie";

export type LottieName =
  | "checkmark"
  | "loading_spinner"
  | "arrow_right"
  | "trending_up"
  | "scissors_cut"
  | "raw_to_edited"
  | "ai_sparkle";

interface Props {
  /** Built-in library name */
  name?: LottieName;
  /** Direct URL to a .json Lottie file (overrides `name`) */
  url?: string;
  /** Playback speed multiplier (1 = real-time). Defaults to 1. */
  speed?: number;
  /** Hex color used to recolor accent layers in built-in animations. */
  accentColor?: string;
  /** If true, animation loops. Defaults to true. */
  loop?: boolean;
}

export const LottieGraphic: React.FC<Props> = ({
  name,
  url,
  speed = 1,
  accentColor = "#FFD700",
  loop = true,
}) => {
  // Resolve animation source
  const animationData = useMemo(() => {
    if (url) return null; // URL mode — Player fetches it
    const data = LIBRARY[name || "ai_sparkle"];
    return data ? recolor(data, accentColor) : LIBRARY.ai_sparkle;
  }, [name, url, accentColor]);

  if (url) {
    // @remotion/lottie supports `src` for a URL.
    return (
      <Player
        // @ts-expect-error — Player accepts `src` at runtime even if types want `animationData`
        src={url}
        loop={loop}
        playbackRate={speed}
        style={{ width: "100%", height: "100%" }}
      />
    );
  }

  return (
    <Player
      animationData={animationData}
      loop={loop}
      playbackRate={speed}
      style={{ width: "100%", height: "100%" }}
    />
  );
};

// ── Recolor helper ───────────────────────────────────────────────────

function hexToRgb01(hex: string): [number, number, number, number] {
  let h = String(hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return [1, 0.84, 0, 1]; // gold fallback
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    1,
  ];
}

function recolor(json: any, hex: string): any {
  // Lottie color values are arrays of 0-1 floats. Walk every layer; if it has
  // a name containing "accent" (case-insensitive), recolor its fill/stroke.
  const target = hexToRgb01(hex);
  const cloned = JSON.parse(JSON.stringify(json));
  const walk = (node: any, inheritAccent = false) => {
    if (!node || typeof node !== "object") return;
    const isAccent =
      inheritAccent ||
      (typeof node.nm === "string" && /accent/i.test(node.nm));
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, inheritAccent));
      return;
    }
    // Lottie shape color: { ty: "fl"|"st", c: { a:0, k: [r,g,b,a] } }
    if ((node.ty === "fl" || node.ty === "st") && node.c?.k && Array.isArray(node.c.k) && isAccent) {
      node.c.k = target;
    }
    for (const key of Object.keys(node)) {
      if (key === "nm" || key === "ty") continue;
      walk(node[key], isAccent);
    }
  };
  walk(cloned);
  return cloned;
}

// ── Built-in library ─────────────────────────────────────────────────
// Each entry is a minimal hand-authored Lottie JSON. We keep them small
// (under ~3KB each) so the entire library is well under 50KB total.
//
// Convention: any layer/shape we want recolored has nm: "accent_*". The
// recolor() helper walks the tree and swaps those colors.

// Checkmark draw-in (1 second, accent-colored stroke)
const CHECKMARK: any = {
  v: "5.7.0",
  fr: 30,
  ip: 0,
  op: 30,
  w: 200,
  h: 200,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "accent_check",
      sr: 1,
      ks: { o: { a: 0, k: 100 }, p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
      shapes: [
        {
          ty: "gr",
          nm: "accent",
          it: [
            {
              ty: "sh",
              ks: {
                a: 0,
                k: {
                  i: [[0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0]],
                  v: [[-50, 0], [-15, 35], [55, -35]],
                  c: false,
                },
              },
            },
            { ty: "tm", s: { a: 1, k: [{ t: 0, s: [0] }, { t: 24, s: [0] }] }, e: { a: 1, k: [{ t: 0, s: [0] }, { t: 24, s: [100] }] }, m: 1 },
            { ty: "st", c: { a: 0, k: [1, 0.84, 0, 1] }, w: { a: 0, k: 18 }, lc: 2, lj: 2, ml: 4 },
          ],
        },
      ],
      ip: 0,
      op: 30,
      st: 0,
    },
  ],
};

// Spinning loader
const LOADING_SPINNER: any = {
  v: "5.7.0",
  fr: 30,
  ip: 0,
  op: 60,
  w: 200,
  h: 200,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "accent_arc",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 1, k: [{ t: 0, s: [0] }, { t: 60, s: [360] }] },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: "gr",
          nm: "accent",
          it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] } },
            { ty: "tm", s: { a: 0, k: [0] }, e: { a: 0, k: [70] }, m: 1 },
            { ty: "st", c: { a: 0, k: [1, 0.84, 0, 1] }, w: { a: 0, k: 14 }, lc: 2, lj: 2 },
          ],
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
    },
  ],
};

// Arrow drawing in to the right
const ARROW_RIGHT: any = {
  v: "5.7.0",
  fr: 30,
  ip: 0,
  op: 36,
  w: 200,
  h: 200,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "accent_arrow",
      sr: 1,
      ks: { o: { a: 0, k: 100 }, p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
      shapes: [
        {
          ty: "gr",
          nm: "accent",
          it: [
            {
              ty: "sh",
              ks: {
                a: 0,
                k: {
                  i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                  v: [[-70, 0], [50, 0], [50, -25], [70, 0], [50, 25]],
                  c: false,
                },
              },
            },
            { ty: "tm", s: { a: 0, k: [0] }, e: { a: 1, k: [{ t: 0, s: [0] }, { t: 30, s: [100] }] }, m: 1 },
            { ty: "st", c: { a: 0, k: [1, 0.84, 0, 1] }, w: { a: 0, k: 16 }, lc: 2, lj: 2 },
          ],
        },
      ],
      ip: 0,
      op: 36,
      st: 0,
    },
  ],
};

// Up-and-to-the-right trending arrow (great for stat callouts about growth)
const TRENDING_UP: any = {
  v: "5.7.0",
  fr: 30,
  ip: 0,
  op: 36,
  w: 200,
  h: 200,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "accent_trend",
      sr: 1,
      ks: { o: { a: 0, k: 100 }, p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
      shapes: [
        {
          ty: "gr",
          nm: "accent",
          it: [
            {
              ty: "sh",
              ks: {
                a: 0,
                k: {
                  i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                  v: [[-70, 50], [-20, 10], [10, 30], [60, -30], [60, 0]],
                  c: false,
                },
              },
            },
            { ty: "tm", s: { a: 0, k: [0] }, e: { a: 1, k: [{ t: 0, s: [0] }, { t: 30, s: [100] }] }, m: 1 },
            { ty: "st", c: { a: 0, k: [1, 0.84, 0, 1] }, w: { a: 0, k: 16 }, lc: 2, lj: 2 },
          ],
        },
      ],
      ip: 0,
      op: 36,
      st: 0,
    },
  ],
};

// Scissors cutting motion (perfect for "edit" / "trim" callouts)
const SCISSORS_CUT: any = {
  v: "5.7.0",
  fr: 30,
  ip: 0,
  op: 45,
  w: 200,
  h: 200,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "accent_scissors",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 1, k: [{ t: 0, s: [-15] }, { t: 22, s: [15] }, { t: 45, s: [-15] }] },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: "gr",
          nm: "accent",
          it: [
            { ty: "el", p: { a: 0, k: [-30, -25] }, s: { a: 0, k: [40, 40] } },
            { ty: "el", p: { a: 0, k: [-30, 25] }, s: { a: 0, k: [40, 40] } },
            {
              ty: "sh",
              ks: {
                a: 0,
                k: {
                  i: [[0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0]],
                  v: [[-30, -25], [50, 0], [-30, 25]],
                  c: false,
                },
              },
            },
            { ty: "st", c: { a: 0, k: [1, 0.84, 0, 1] }, w: { a: 0, k: 8 }, lc: 2, lj: 2 },
          ],
        },
      ],
      ip: 0,
      op: 45,
      st: 0,
    },
  ],
};

// "Raw becoming edited" — the conceptual transformation animation Eric's
// reference video used. Two stacked rectangles, the bottom one (raw) shrinks
// and fades while the top one (edited, accent-colored) scales in.
const RAW_TO_EDITED: any = {
  v: "5.7.0",
  fr: 30,
  ip: 0,
  op: 60,
  w: 200,
  h: 200,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "raw_layer",
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [100] }, { t: 30, s: [40] }] },
        p: { a: 1, k: [{ t: 0, s: [100, 100, 0] }, { t: 30, s: [70, 70, 0] }] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [100, 100, 100] }, { t: 30, s: [80, 80, 100] }] },
      },
      shapes: [
        {
          ty: "gr",
          nm: "raw_rect",
          it: [
            { ty: "rc", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 60] }, r: { a: 0, k: 6 } },
            { ty: "fl", c: { a: 0, k: [0.4, 0.4, 0.45, 1] } },
          ],
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: "accent_edited",
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [0] }, { t: 30, s: [100] }] },
        p: { a: 1, k: [{ t: 0, s: [100, 100, 0] }, { t: 30, s: [115, 115, 0] }] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [80, 80, 100] }, { t: 30, s: [110, 110, 100] }] },
      },
      shapes: [
        {
          ty: "gr",
          nm: "accent",
          it: [
            { ty: "rc", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [110, 70] }, r: { a: 0, k: 10 } },
            { ty: "fl", c: { a: 0, k: [1, 0.84, 0, 1] } },
          ],
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
    },
  ],
};

// AI sparkle — pulsing 4-point star, used as the default fallback
const AI_SPARKLE: any = {
  v: "5.7.0",
  fr: 30,
  ip: 0,
  op: 60,
  w: 200,
  h: 200,
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "accent_sparkle",
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: 0, s: [60] }, { t: 30, s: [100] }, { t: 60, s: [60] }] },
        r: { a: 1, k: [{ t: 0, s: [0] }, { t: 60, s: [180] }] },
        p: { a: 0, k: [100, 100, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: 0, s: [80, 80, 100] }, { t: 30, s: [110, 110, 100] }, { t: 60, s: [80, 80, 100] }] },
      },
      shapes: [
        {
          ty: "gr",
          nm: "accent",
          it: [
            {
              ty: "sh",
              ks: {
                a: 0,
                k: {
                  i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                  v: [[0, -60], [12, -12], [60, 0], [12, 12], [0, 60], [-12, 12], [-60, 0], [-12, -12]],
                  c: true,
                },
              },
            },
            { ty: "fl", c: { a: 0, k: [1, 0.84, 0, 1] } },
          ],
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
    },
  ],
};

const LIBRARY: Record<LottieName, any> = {
  checkmark: CHECKMARK,
  loading_spinner: LOADING_SPINNER,
  arrow_right: ARROW_RIGHT,
  trending_up: TRENDING_UP,
  scissors_cut: SCISSORS_CUT,
  raw_to_edited: RAW_TO_EDITED,
  ai_sparkle: AI_SPARKLE,
};

export const LOTTIE_LIBRARY_NAMES: LottieName[] = Object.keys(LIBRARY) as LottieName[];
