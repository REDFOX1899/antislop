/**
 * Deterministic OKLCH + APCA-W3 Perceptual Color Engine
 * Zero external dependencies. Pure TypeScript math.
 *
 * Implements:
 * - IEC 61966-2-1 sRGB <-> Linear sRGB <-> Björn Ottosson Oklab <-> OKLCH
 * - Binary-search chroma gamut clipping for sRGB & Display P3
 * - Official APCA-W3 (0.0.98G-4g) perceptual lightness contrast (Lc)
 * - WCAG 2.1 relative luminance contrast ratio
 * - Radix-style 12-step functional color scale generation with APCA guarantees
 * - Minimal-nudge OKLCH lightness auto-repair for full design palettes
 * - Machado (2009) linear-RGB Color Vision Deficiency (CVD) simulation
 */

export interface OklchColor {
  /** Perceptual lightness in [0, 1] */
  l: number;
  /** Chroma (unbounded, typically [0, 0.4]) */
  c: number;
  /** Hue angle in degrees [0, 360) */
  h: number;
}

export interface PaletteTokensInput {
  canvas: string;
  surface: string;
  surfaceMuted: string;
  inkPrimary: string;
  inkSecondary: string;
  accent: string;
  accentContrast: string;
  borderSubtle: string;
}

export interface ApcaPairAudit {
  pairId: string;
  foregroundToken: keyof PaletteTokensInput;
  backgroundToken: keyof PaletteTokensInput;
  targetMinLc: number;
  beforeHex: string;
  afterHex: string;
  backgroundHex: string;
  beforeLc: number;
  afterLc: number;
  beforeWcag: number;
  afterWcag: number;
  passedBefore: boolean;
  passedAfter: boolean;
  autoRepaired: boolean;
}

export interface ColorRampStep {
  step: number;
  role: string;
  hex: string;
  oklch: OklchColor;
  oklchCss: string;
  p3Css: string;
  apcaOnCanvas: number;
  wcagOnCanvas: number;
}

export interface ColorScale12 {
  seedHex: string;
  mode: 'light' | 'dark';
  neutralTint?: number;
  steps: [
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
    ColorRampStep,
  ];
}

export interface PaletteAuditReport {
  passedAll: boolean;
  repairedCount: number;
  minAbsLc: number;
  pairs: ApcaPairAudit[];
}

export type CvdMode = 'protanopia' | 'deuteranopia' | 'tritanopia';

type RgbTuple = [number, number, number];

// ---------------------------------------------------------------------------
// Internal math helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeHue(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const mod = h % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function normalizeHex(hex: string): string {
  const raw = hex.trim().replace(/^#/, '');
  if (raw.length === 3) {
    const r = raw[0] + raw[0];
    const g = raw[1] + raw[1];
    const b = raw[2] + raw[2];
    return `#${(r + g + b).toUpperCase()}`;
  }
  if (raw.length === 6 || raw.length === 8) {
    return `#${raw.slice(0, 6).toUpperCase()}`;
  }
  throw new Error(`Invalid hex color: "${hex}"`);
}

function hexToSrgbBytes(hex: string): RgbTuple {
  const clean = normalizeHex(hex).slice(1);
  const intVal = Number.parseInt(clean, 16);
  if (Number.isNaN(intVal)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  return [(intVal >> 16) & 255, (intVal >> 8) & 255, intVal & 255];
}

function hexToSrgb(hex: string): RgbTuple {
  const [r, g, b] = hexToSrgbBytes(hex);
  return [r / 255, g / 255, b / 255];
}

function srgbToHex(r: number, g: number, b: number): string {
  const toByte = (v: number): string =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/** IEC 61966-2-1 sRGB companded [0,1] -> linear light [0,1] */
function srgbToLinearChannel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** IEC 61966-2-1 linear light [0,1] -> sRGB companded [0,1] */
function linearToSrgbChannel(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function linearSrgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return [L, a, b_];
}

function oklabToLinearSrgb(L: number, a: number, b: number): RgbTuple {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_ = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, b_];
}

function oklchToLinearSrgb(l: number, c: number, hDeg: number): RgbTuple {
  const hRad = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  return oklabToLinearSrgb(l, a, b);
}

/** CSS Color 4 Linear sRGB -> Linear Display P3 matrix */
function linearSrgbToLinearP3(r: number, g: number, b: number): RgbTuple {
  const p3R = 0.8224619687 * r + 0.1775380313 * g;
  const p3G = 0.0331941989 * r + 0.9668058011 * g;
  const p3B = 0.0170826307 * r + 0.0723974407 * g + 0.9105199286 * b;
  return [p3R, p3G, p3B];
}

function isInGamut(rgb: RgbTuple, eps = 1e-6): boolean {
  return (
    rgb[0] >= -eps &&
    rgb[0] <= 1 + eps &&
    rgb[1] >= -eps &&
    rgb[1] <= 1 + eps &&
    rgb[2] >= -eps &&
    rgb[2] <= 1 + eps
  );
}

function clipChromaToLinearSrgb(l: number, c: number, h: number): RgbTuple {
  const L = clamp(l, 0, 1);
  const C = Math.max(0, c);
  const H = normalizeHue(h);

  if (L <= 0) return [0, 0, 0];
  if (L >= 1) return [1, 1, 1];

  const direct = oklchToLinearSrgb(L, C, H);
  if (isInGamut(direct)) {
    return [clamp(direct[0], 0, 1), clamp(direct[1], 0, 1), clamp(direct[2], 0, 1)];
  }

  let lo = 0;
  let hi = C;
  let best = oklchToLinearSrgb(L, 0, H);

  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) * 0.5;
    const candidate = oklchToLinearSrgb(L, mid, H);
    if (isInGamut(candidate, 0)) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return [clamp(best[0], 0, 1), clamp(best[1], 0, 1), clamp(best[2], 0, 1)];
}

function clipChromaToLinearP3(l: number, c: number, h: number): RgbTuple {
  const L = clamp(l, 0, 1);
  const C = Math.max(0, c);
  const H = normalizeHue(h);

  if (L <= 0) return [0, 0, 0];
  if (L >= 1) return [1, 1, 1];

  const directSrgb = oklchToLinearSrgb(L, C, H);
  const directP3 = linearSrgbToLinearP3(directSrgb[0], directSrgb[1], directSrgb[2]);
  if (isInGamut(directP3)) {
    return [clamp(directP3[0], 0, 1), clamp(directP3[1], 0, 1), clamp(directP3[2], 0, 1)];
  }

  let lo = 0;
  let hi = C;
  const zeroSrgb = oklchToLinearSrgb(L, 0, H);
  let best = linearSrgbToLinearP3(zeroSrgb[0], zeroSrgb[1], zeroSrgb[2]);

  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) * 0.5;
    const srgb = oklchToLinearSrgb(L, mid, H);
    const p3 = linearSrgbToLinearP3(srgb[0], srgb[1], srgb[2]);
    if (isInGamut(p3, 0)) {
      best = p3;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return [clamp(best[0], 0, 1), clamp(best[1], 0, 1), clamp(best[2], 0, 1)];
}

// ---------------------------------------------------------------------------
// Public OKLCH conversions
// ---------------------------------------------------------------------------

export function hexToOklch(hex: string): OklchColor {
  const [sr, sg, sb] = hexToSrgb(hex);
  const lr = srgbToLinearChannel(sr);
  const lg = srgbToLinearChannel(sg);
  const lb = srgbToLinearChannel(sb);
  const [L, a, b] = linearSrgbToOklab(lr, lg, lb);
  const C = Math.hypot(a, b);
  const H = C < 1e-6 ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
  return {
    l: clamp(L, 0, 1),
    c: C < 1e-6 ? 0 : C,
    h: H,
  };
}

export function oklchToHex(color: OklchColor): string {
  const [lr, lg, lb] = clipChromaToLinearSrgb(color.l, color.c, color.h);
  return srgbToHex(
    linearToSrgbChannel(lr),
    linearToSrgbChannel(lg),
    linearToSrgbChannel(lb),
  );
}

export function oklchToCss(color: OklchColor): string {
  const l = roundTo(clamp(color.l, 0, 1), 4);
  const c = roundTo(Math.max(0, color.c), 4);
  const h = roundTo(normalizeHue(color.h), 2);
  return `oklch(${l} ${c} ${h})`;
}

export function oklchToP3Css(color: OklchColor): string {
  const [lr, lg, lb] = clipChromaToLinearP3(color.l, color.c, color.h);
  // Display P3 uses the identical sRGB electro-optical transfer curve.
  const r = roundTo(linearToSrgbChannel(lr), 4);
  const g = roundTo(linearToSrgbChannel(lg), 4);
  const b = roundTo(linearToSrgbChannel(lb), 4);
  return `color(display-p3 ${r} ${g} ${b})`;
}

// ---------------------------------------------------------------------------
// APCA-W3 (0.0.98G-4g) & WCAG 2.1 Contrast
// ---------------------------------------------------------------------------

const APCA_MAIN_TRC = 2.4;
const APCA_S_RCO = 0.2126729;
const APCA_S_GCO = 0.7151522;
const APCA_S_BCO = 0.072175;
const APCA_NORM_BG = 0.56;
const APCA_NORM_TXT = 0.57;
const APCA_REV_TXT = 0.62;
const APCA_REV_BG = 0.65;
const APCA_BLK_THRS = 0.022;
const APCA_BLK_CLMP = 1.414;
const APCA_SCALE_BOW = 1.14;
const APCA_SCALE_WOB = 1.14;
const APCA_LO_BOW_OFFSET = 0.027;
const APCA_LO_WOB_OFFSET = 0.027;
const APCA_LO_CLIP = 0.1;
const APCA_DELTA_Y_MIN = 0.0005;

function apcaLuminanceFromHex(hex: string): number {
  const [r8, g8, b8] = hexToSrgbBytes(hex);
  const y =
    (r8 / 255) ** APCA_MAIN_TRC * APCA_S_RCO +
    (g8 / 255) ** APCA_MAIN_TRC * APCA_S_GCO +
    (b8 / 255) ** APCA_MAIN_TRC * APCA_S_BCO;
  return y > APCA_BLK_THRS ? y : y + (APCA_BLK_THRS - y) ** APCA_BLK_CLMP;
}

/**
 * Computes signed APCA-W3 (0.0.98G-4g) lightness contrast Lc in [-108, +106].
 * Positive values indicate dark text on light background; negative values
 * indicate light text on dark background.
 */
export function calcAPCA(textHex: string, bgHex: string): number {
  const txtY = apcaLuminanceFromHex(textHex);
  const bgY = apcaLuminanceFromHex(bgHex);

  if (Math.abs(bgY - txtY) < APCA_DELTA_Y_MIN) {
    return 0;
  }

  let outputContrast = 0;
  if (bgY > txtY) {
    // Dark text on light background (BoW -> positive Lc)
    const sapc = (bgY ** APCA_NORM_BG - txtY ** APCA_NORM_TXT) * APCA_SCALE_BOW;
    outputContrast = sapc < APCA_LO_CLIP ? 0 : sapc - APCA_LO_BOW_OFFSET;
  } else {
    // Light text on dark background (WoB -> negative Lc)
    const sapc = (bgY ** APCA_REV_BG - txtY ** APCA_REV_TXT) * APCA_SCALE_WOB;
    outputContrast = sapc > -APCA_LO_CLIP ? 0 : sapc + APCA_LO_WOB_OFFSET;
  }

  return roundTo(outputContrast * 100, 2);
}

function wcagLuminanceFromHex(hex: string): number {
  const [sr, sg, sb] = hexToSrgb(hex);
  const r = srgbToLinearChannel(sr);
  const g = srgbToLinearChannel(sg);
  const b = srgbToLinearChannel(sb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Computes WCAG 2.1 contrast ratio in [1, 21]. */
export function calcWcagRatio(fgHex: string, bgHex: string): number {
  const l1 = wcagLuminanceFromHex(fgHex);
  const l2 = wcagLuminanceFromHex(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return roundTo((lighter + 0.05) / (darker + 0.05), 2);
}

// ---------------------------------------------------------------------------
// Minimal OKLCH Lightness Nudge Helper
// ---------------------------------------------------------------------------

function minAbsApcaAgainst(fgHex: string, backgrounds: readonly string[]): number {
  let minAbs = Number.POSITIVE_INFINITY;
  for (const bg of backgrounds) {
    const absLc = Math.abs(calcAPCA(fgHex, bg));
    if (absLc < minAbs) {
      minAbs = absLc;
    }
  }
  return minAbs;
}

/**
 * Minimally nudges OKLCH lightness `l` (preserving hue & chroma) until `fgHex`
 * achieves `|Lc| >= targetMinLc` against every background in `backgrounds`.
 */
function nudgeLightnessForApca(
  fgHex: string,
  backgrounds: readonly string[],
  targetMinLc: number,
): string {
  const normalizedFg = normalizeHex(fgHex);
  if (minAbsApcaAgainst(normalizedFg, backgrounds) >= targetMinLc) {
    return normalizedFg;
  }

  const start = hexToOklch(normalizedFg);
  const avgBgL =
    backgrounds.reduce((acc, bg) => acc + hexToOklch(bg).l, 0) /
    Math.max(1, backgrounds.length);

  // Search both directions (toward dark 0 and toward light 1) and pick the
  // passing candidate with the smallest |ΔL|. If neither reaches targetMinLc,
  // pick whichever maximizes min |Lc|.
  const searchDirection = (
    dir: -1 | 1,
  ): { hex: string; passed: boolean; deltaL: number; achievedLc: number } => {
    const step = 0.002;
    let bestHex = normalizedFg;
    let bestLc = minAbsApcaAgainst(normalizedFg, backgrounds);
    let bestDelta = 0;

    for (let i = 1; i <= 500; i += 1) {
      const candidateL = clamp(start.l + dir * i * step, 0, 1);
      const candidateHex = oklchToHex({ l: candidateL, c: start.c, h: start.h });
      const lc = minAbsApcaAgainst(candidateHex, backgrounds);
      const delta = Math.abs(candidateL - start.l);

      if (lc >= targetMinLc) {
        return { hex: candidateHex, passed: true, deltaL: delta, achievedLc: lc };
      }
      if (lc > bestLc) {
        bestLc = lc;
        bestHex = candidateHex;
        bestDelta = delta;
      }
      if (candidateL === 0 || candidateL === 1) {
        break;
      }
    }

    return { hex: bestHex, passed: false, deltaL: bestDelta, achievedLc: bestLc };
  };

  const darker = searchDirection(-1);
  const lighter = searchDirection(1);

  if (darker.passed && lighter.passed) {
    // Prefer smaller perceptual lightness shift; break ties using polarity away from bg
    if (Math.abs(darker.deltaL - lighter.deltaL) < 0.01) {
      return avgBgL >= 0.5 ? darker.hex : lighter.hex;
    }
    return darker.deltaL <= lighter.deltaL ? darker.hex : lighter.hex;
  }
  if (darker.passed) return darker.hex;
  if (lighter.passed) return lighter.hex;

  return darker.achievedLc >= lighter.achievedLc ? darker.hex : lighter.hex;
}

// ---------------------------------------------------------------------------
// 12-Step Functional Scale (Radix-style)
// ---------------------------------------------------------------------------

const STEP_ROLES: readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
] = [
  'App canvas background',
  'Subtle surface background',
  'UI element background',
  'Hovered UI element background',
  'Active / selected UI element background',
  'Subtle borders and separators',
  'UI element border and focus rings',
  'Hovered UI element border',
  'Solid accent background',
  'Hovered solid accent background',
  'Secondary low-contrast text',
  'Primary high-contrast text',
];

const LIGHT_L_CURVE: readonly number[] = [
  0.988, // 1: canvas
  0.968, // 2: subtle surface
  0.938, // 3: ui rest
  0.905, // 4: ui hover
  0.868, // 5: ui active
  0.825, // 6: border subtle
  0.765, // 7: border ui
  0.685, // 8: border hover
  0.545, // 9: solid accent
  0.485, // 10: solid accent hover
  0.44,  // 11: secondary text
  0.22,  // 12: primary text
];

const DARK_L_CURVE: readonly number[] = [
  0.145, // 1: canvas
  0.185, // 2: subtle surface
  0.228, // 3: ui rest
  0.268, // 4: ui hover
  0.312, // 5: ui active
  0.365, // 6: border subtle
  0.435, // 7: border ui
  0.525, // 8: border hover
  0.645, // 9: solid accent
  0.705, // 10: solid accent hover
  0.775, // 11: secondary text
  0.945, // 12: primary text
];

const CHROMATIC_C_MULTIPLIER: readonly number[] = [
  0.06, // 1
  0.12, // 2
  0.22, // 3
  0.32, // 4
  0.42, // 5
  0.48, // 6
  0.58, // 7
  0.72, // 8
  1.0,  // 9
  0.96, // 10
  0.78, // 11
  0.32, // 12
];

const NEUTRAL_C_MULTIPLIER: readonly number[] = [
  0.4, 0.5, 0.65, 0.75, 0.85, 0.9, 0.95, 1.0, 0.95, 0.9, 0.75, 0.5,
];

export function generate12StepScale(
  seedHex: string,
  mode: 'light' | 'dark',
  neutralTint?: number,
): ColorScale12 {
  const normalizedSeed = normalizeHex(seedHex);
  const seed = hexToOklch(normalizedSeed);
  const lCurve = mode === 'light' ? LIGHT_L_CURVE : DARK_L_CURVE;
  const isNeutral = neutralTint !== undefined;
  const clampedTint = isNeutral ? clamp(neutralTint, 0, 1) : 1;

  // Base chroma ceiling: neutral scales stay subtle, chromatic scales preserve seed saturation
  const baseChroma = isNeutral
    ? Math.min(Math.max(seed.c, 0.015), 0.04) * clampedTint
    : Math.max(seed.c, 0.04);

  const cMultipliers = isNeutral ? NEUTRAL_C_MULTIPLIER : CHROMATIC_C_MULTIPLIER;

  const rawHexes: string[] = [];
  for (let idx = 0; idx < 12; idx += 1) {
    let targetL = lCurve[idx];
    let targetC = baseChroma * cMultipliers[idx];

    // Preserve seed's perceptual anchor at Step 9 for chromatic scales when appropriate
    if (!isNeutral && idx === 8) {
      targetL =
        mode === 'light'
          ? clamp(seed.l, 0.36, 0.66)
          : clamp(seed.l, 0.52, 0.78);
      targetC = seed.c;
    } else if (!isNeutral && idx === 9) {
      const step9L =
        mode === 'light'
          ? clamp(seed.l, 0.36, 0.66)
          : clamp(seed.l, 0.52, 0.78);
      targetL =
        mode === 'light'
          ? clamp(step9L - 0.06, 0.25, 0.62)
          : clamp(step9L + 0.06, 0.58, 0.86);
      targetC = seed.c * 0.96;
    }

    rawHexes.push(oklchToHex({ l: targetL, c: targetC, h: seed.h }));
  }

  // Enforce APCA contrast guarantees on Step 11 (>= 60 Lc) and Step 12 (>= 75 Lc)
  // against both Step 1 (canvas) and Step 2 (subtle surface).
  const surfaceBgs = [rawHexes[0], rawHexes[1]];
  rawHexes[10] = nudgeLightnessForApca(rawHexes[10], surfaceBgs, 60);
  rawHexes[11] = nudgeLightnessForApca(rawHexes[11], surfaceBgs, 75);

  const canvasHex = rawHexes[0];
  const steps = rawHexes.map((hex, idx): ColorRampStep => {
    const oklch = hexToOklch(hex);
    return {
      step: idx + 1,
      role: STEP_ROLES[idx],
      hex,
      oklch,
      oklchCss: oklchToCss(oklch),
      p3Css: oklchToP3Css(oklch),
      apcaOnCanvas: calcAPCA(hex, canvasHex),
      wcagOnCanvas: calcWcagRatio(hex, canvasHex),
    };
  }) as ColorScale12['steps'];

  return {
    seedHex: normalizedSeed,
    mode,
    ...(neutralTint !== undefined ? { neutralTint: clampedTint } : {}),
    steps,
  };
}

// ---------------------------------------------------------------------------
// Palette APCA Enforcement & Audit
// ---------------------------------------------------------------------------

export function enforceApcaPalette(palette: PaletteTokensInput): {
  repaired: PaletteTokensInput;
  report: PaletteAuditReport;
} {
  const original: PaletteTokensInput = {
    canvas: normalizeHex(palette.canvas),
    surface: normalizeHex(palette.surface),
    surfaceMuted: normalizeHex(palette.surfaceMuted),
    inkPrimary: normalizeHex(palette.inkPrimary),
    inkSecondary: normalizeHex(palette.inkSecondary),
    accent: normalizeHex(palette.accent),
    accentContrast: normalizeHex(palette.accentContrast),
    borderSubtle: normalizeHex(palette.borderSubtle),
  };

  const repaired: PaletteTokensInput = { ...original };

  // 1. Repair inkPrimary against both canvas and surface (|Lc| >= 75)
  repaired.inkPrimary = nudgeLightnessForApca(
    repaired.inkPrimary,
    [repaired.canvas, repaired.surface],
    75,
  );

  // 2. Repair inkSecondary against both canvas and surface (|Lc| >= 60)
  repaired.inkSecondary = nudgeLightnessForApca(
    repaired.inkSecondary,
    [repaired.canvas, repaired.surface],
    60,
  );

  // 3. Repair accent against canvas (|Lc| >= 45) BEFORE accentContrast
  repaired.accent = nudgeLightnessForApca(repaired.accent, [repaired.canvas], 45);

  // 3b. Ensure accent is outside the mid-luminance dead zone where neither #000 nor #FFF
  // can achieve |Lc| >= 60 against it, while preserving |Lc(accent, canvas)| >= 45.
  const maxContrastOnAccent = (hex: string): number =>
    Math.max(Math.abs(calcAPCA('#FFFFFF', hex)), Math.abs(calcAPCA('#000000', hex)));

  if (maxContrastOnAccent(repaired.accent) < 60) {
    const accentOklch = hexToOklch(repaired.accent);
    const canvasL = hexToOklch(repaired.canvas).l;
    // Move accent further away from canvas lightness (darker on light canvas, lighter on dark canvas)
    const dir: -1 | 1 = canvasL >= 0.5 ? -1 : 1;
    for (let i = 1; i <= 500; i += 1) {
      const candidateL = clamp(accentOklch.l + dir * i * 0.002, 0, 1);
      const candidateHex = oklchToHex({ l: candidateL, c: accentOklch.c, h: accentOklch.h });
      if (
        Math.abs(calcAPCA(candidateHex, repaired.canvas)) >= 45 &&
        maxContrastOnAccent(candidateHex) >= 60
      ) {
        repaired.accent = candidateHex;
        break;
      }
      if (candidateL === 0 || candidateL === 1) break;
    }
  }

  // 4. Repair accentContrast against the (possibly repaired) accent (|Lc| >= 60)
  repaired.accentContrast = nudgeLightnessForApca(
    repaired.accentContrast,
    [repaired.accent],
    60,
  );

  const pairSpecs: ReadonlyArray<{
    pairId: string;
    fg: keyof PaletteTokensInput;
    bg: keyof PaletteTokensInput;
    minLc: number;
  }> = [
    { pairId: 'inkPrimary-on-canvas', fg: 'inkPrimary', bg: 'canvas', minLc: 75 },
    { pairId: 'inkPrimary-on-surface', fg: 'inkPrimary', bg: 'surface', minLc: 75 },
    { pairId: 'inkSecondary-on-canvas', fg: 'inkSecondary', bg: 'canvas', minLc: 60 },
    { pairId: 'inkSecondary-on-surface', fg: 'inkSecondary', bg: 'surface', minLc: 60 },
    { pairId: 'accentContrast-on-accent', fg: 'accentContrast', bg: 'accent', minLc: 60 },
    { pairId: 'accent-on-canvas', fg: 'accent', bg: 'canvas', minLc: 45 },
  ];

  const pairs: ApcaPairAudit[] = pairSpecs.map((spec) => {
    const beforeHex = original[spec.fg];
    const afterHex = repaired[spec.fg];
    const beforeBgHex = original[spec.bg];
    const afterBgHex = repaired[spec.bg];

    const beforeLc = calcAPCA(beforeHex, beforeBgHex);
    const afterLc = calcAPCA(afterHex, afterBgHex);
    const beforeWcag = calcWcagRatio(beforeHex, beforeBgHex);
    const afterWcag = calcWcagRatio(afterHex, afterBgHex);
    const passedBefore = Math.abs(beforeLc) >= spec.minLc;
    const passedAfter = Math.abs(afterLc) >= spec.minLc;
    const autoRepaired = beforeHex !== afterHex || beforeBgHex !== afterBgHex;

    return {
      pairId: spec.pairId,
      foregroundToken: spec.fg,
      backgroundToken: spec.bg,
      targetMinLc: spec.minLc,
      beforeHex,
      afterHex,
      backgroundHex: afterBgHex,
      beforeLc,
      afterLc,
      beforeWcag,
      afterWcag,
      passedBefore,
      passedAfter,
      autoRepaired,
    };
  });

  const passedAll = pairs.every((p) => p.passedAfter);
  const repairedCount = pairs.filter((p) => p.autoRepaired).length;
  const minAbsLc = pairs.reduce(
    (minVal, p) => Math.min(minVal, Math.abs(p.afterLc)),
    Number.POSITIVE_INFINITY,
  );

  return {
    repaired,
    report: {
      passedAll,
      repairedCount,
      minAbsLc: Number.isFinite(minValOrZero(minAbsLc)) ? roundTo(minAbsLc, 2) : 0,
      pairs,
    },
  };
}

function minValOrZero(val: number): number {
  return Number.isFinite(val) ? val : 0;
}

// ---------------------------------------------------------------------------
// Color Vision Deficiency (CVD) Simulation — Machado (2009) Severity 1.0
// ---------------------------------------------------------------------------

type Matrix3x3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const CVD_MATRICES: Record<CvdMode, Matrix3x3> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function simulateCvdHex(hex: string, mode: CvdMode): string {
  const [sr, sg, sb] = hexToSrgb(hex);
  const r = srgbToLinearChannel(sr);
  const g = srgbToLinearChannel(sg);
  const b = srgbToLinearChannel(sb);

  const m = CVD_MATRICES[mode];
  const simR = clamp(m[0][0] * r + m[0][1] * g + m[0][2] * b, 0, 1);
  const simG = clamp(m[1][0] * r + m[1][1] * g + m[1][2] * b, 0, 1);
  const simB = clamp(m[2][0] * r + m[2][1] * g + m[2][2] * b, 0, 1);

  return srgbToHex(
    linearToSrgbChannel(simR),
    linearToSrgbChannel(simG),
    linearToSrgbChannel(simB),
  );
}
