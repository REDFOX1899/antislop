'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  Eye,
  ImagePlus,
  Loader2,
  Moon,
  Palette,
  ShieldCheck,
  Sparkles,
  Sun,
  Type,
  Zap,
} from 'lucide-react';
import { BACKEND_URL } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

export interface DesignSystemModalProps {
  open: boolean;
  onClose: () => void;
  onApplyDesignSystem: (prompt: string) => void;
  onInstantLookApplied?: () => void;
}

type Polarity = 'light' | 'dark';
type CvdMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';
type CodeTab = 'tokens.json' | 'tokens.css' | 'tailwind';
type TypographyCategory =
  | 'All'
  | 'Editorial Serif'
  | 'Swiss Grotesk'
  | 'Luxury'
  | 'Technical'
  | 'Brutalist';

interface FontPairing {
  display: string;
  body: string;
  mono: string;
}

interface VerifiedTypographyPairing {
  id: string;
  name: string;
  category: Exclude<TypographyCategory, 'All'>;
  display: string;
  body: string;
  mono: string;
  stylesheetUrl: string;
  h1Tracking: string;
  scaleRatio: number;
  opticalSizing: boolean;
  vibe: string;
}

interface ExtractedImagePalette {
  accentHex: string;
  neutralHex: string;
  mode: Polarity;
  clusters: string[];
  fileName: string;
}

interface ArchetypePreset {
  id: string;
  name: string;
  tagline: string;
  polarity: Polarity;
  accentHex: string;
  neutralHex: string;
  fontPairing: FontPairing;
  previewDots: [string, string, string, string];
}

interface OklchStep {
  step: number;
  role: string;
  hex: string;
  l: number;
  c: number;
  h: number;
  cssOklch: string;
}

interface SemanticTokens {
  canvas: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentContrast: string;
}

interface ApcaAuditRow {
  id: string;
  label: string;
  fgToken: string;
  bgToken: string;
  fgHex: string;
  bgHex: string;
  lc: number;
  targetLc: number;
  wcagRatio: number;
  status: 'PASS' | 'AUTO-REPAIRED' | 'WARN';
}

interface CompiledPalette {
  polarity: Polarity;
  accentHex: string;
  neutralHex: string;
  neutralScale: OklchStep[];
  accentScale: OklchStep[];
  semantic: SemanticTokens;
  apcaAudit: ApcaAuditRow[];
  tokensJson: string;
  tokensCss: string;
  tailwindTheme: string;
  source: 'backend' | 'local';
}

const STEP_ROLES: readonly string[] = [
  'Canvas',
  'Surface',
  'Subtle Fill',
  'Hover Fill',
  'Active Fill',
  'Subtle Border',
  'UI Border',
  'Strong Border',
  'Solid Fill',
  'Solid Hover',
  'Low-Contrast Ink',
  'High-Contrast Ink',
];

const FALLBACK_ARCHETYPES: readonly ArchetypePreset[] = [
  {
    id: 'alabaster-editorial',
    name: 'Alabaster Editorial',
    tagline: 'Warm archival paper with crisp Cobalt ink',
    polarity: 'light',
    accentHex: '#0B57D0',
    neutralHex: '#F5F3EF',
    fontPairing: {
      display: 'Instrument Serif',
      body: 'Plus Jakarta Sans',
      mono: 'JetBrains Mono',
    },
    previewDots: ['#F5F3EF', '#ECE8E1', '#0B57D0', '#161514'],
  },
  {
    id: 'obsidian-cobalt',
    name: 'Obsidian Cobalt',
    tagline: 'Pitch-black spatial studio with electric Cobalt',
    polarity: 'dark',
    accentHex: '#4285F4',
    neutralHex: '#080A0E',
    fontPairing: {
      display: 'Space Grotesk',
      body: 'Inter',
      mono: 'JetBrains Mono',
    },
    previewDots: ['#080A0E', '#12161F', '#4285F4', '#F1F3F4'],
  },
  {
    id: 'swiss-vermilion',
    name: 'Swiss Vermilion',
    tagline: 'International typographic grid with signal vermilion',
    polarity: 'light',
    accentHex: '#D9381E',
    neutralHex: '#F7F6F2',
    fontPairing: {
      display: 'Instrument Serif',
      body: 'DM Sans',
      mono: 'IBM Plex Mono',
    },
    previewDots: ['#F7F6F2', '#EAE8E1', '#D9381E', '#141312'],
  },
  {
    id: 'botanical-emerald',
    name: 'Botanical Ink',
    tagline: 'Deep forest slate paired with luminous emerald',
    polarity: 'dark',
    accentHex: '#10B981',
    neutralHex: '#09110E',
    fontPairing: {
      display: 'Fraunces',
      body: 'Plus Jakarta Sans',
      mono: 'JetBrains Mono',
    },
    previewDots: ['#09110E', '#111E19', '#10B981', '#ECFDF5'],
  },
];

const CVD_MODES: ReadonlyArray<{ id: CvdMode; label: string; short: string }> = [
  { id: 'normal', label: 'Normal', short: 'Trichromatic' },
  { id: 'protanopia', label: 'Protanopia', short: 'Red-blind' },
  { id: 'deuteranopia', label: 'Deuteranopia', short: 'Green-blind' },
  { id: 'tritanopia', label: 'Tritanopia', short: 'Blue-blind' },
];

// Machado et al. (2009) CVD simulation matrices (severity = 1.0)
const CVD_MATRICES: Record<Exclude<CvdMode, 'normal'>, string> = {
  protanopia:
    '0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0',
  deuteranopia:
    '0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0',
  tritanopia:
    '1.255528 -0.076749 -0.178779 0 0 -0.078411 0.930809 0.147602 0 0 0.004733 0.691367 0.303900 0 0 0 0 0 1 0',
};

const TYPOGRAPHY_CATEGORIES: readonly TypographyCategory[] = [
  'All',
  'Editorial Serif',
  'Swiss Grotesk',
  'Luxury',
  'Technical',
  'Brutalist',
];

const FALLBACK_TYPOGRAPHY_PAIRINGS: readonly VerifiedTypographyPairing[] = [
  {
    id: 'editorial-instrument-jakarta',
    name: 'Archival Press',
    category: 'Editorial Serif',
    display: 'Instrument Serif',
    body: 'Plus Jakarta Sans',
    mono: 'JetBrains Mono',
    stylesheetUrl:
      'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
    h1Tracking: '-0.025em',
    scaleRatio: 1.333,
    opticalSizing: false,
    vibe: 'Warm magazine display serif with crisp humanist body',
  },
  {
    id: 'editorial-fraunces-inter',
    name: 'Botanical Monograph',
    category: 'Editorial Serif',
    display: 'Fraunces',
    body: 'Inter',
    mono: 'JetBrains Mono',
    stylesheetUrl:
      'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
    h1Tracking: '-0.03em',
    scaleRatio: 1.25,
    opticalSizing: true,
    vibe: 'Soft-serif optical axis with neutral neo-grotesk UI',
  },
  {
    id: 'swiss-space-inter',
    name: 'Zurich Grid',
    category: 'Swiss Grotesk',
    display: 'Space Grotesk',
    body: 'Inter',
    mono: 'IBM Plex Mono',
    stylesheetUrl:
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
    h1Tracking: '-0.035em',
    scaleRatio: 1.25,
    opticalSizing: false,
    vibe: 'Geometric Swiss poster precision for modern product interfaces',
  },
  {
    id: 'luxury-cormorant-dm',
    name: 'Maison Couture',
    category: 'Luxury',
    display: 'Cormorant Garamond',
    body: 'DM Sans',
    mono: 'IBM Plex Mono',
    stylesheetUrl:
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400..700&family=IBM+Plex+Mono:wght@400;500&display=swap',
    h1Tracking: '-0.02em',
    scaleRatio: 1.414,
    opticalSizing: true,
    vibe: 'High-contrast Parisian serif with understated geometric sans',
  },
  {
    id: 'technical-ibm-plex',
    name: 'Telemetry Console',
    category: 'Technical',
    display: 'IBM Plex Sans',
    body: 'IBM Plex Sans',
    mono: 'IBM Plex Mono',
    stylesheetUrl:
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    h1Tracking: '-0.02em',
    scaleRatio: 1.2,
    opticalSizing: false,
    vibe: 'Engineered industrial clarity with tabular numerals',
  },
  {
    id: 'brutalist-syne-mono',
    name: 'Concrete Manifesto',
    category: 'Brutalist',
    display: 'Syne',
    body: 'Space Mono',
    mono: 'Space Mono',
    stylesheetUrl:
      'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Space+Mono:wght@400;700&display=swap',
    h1Tracking: '-0.04em',
    scaleRatio: 1.333,
    opticalSizing: false,
    vibe: 'Wide expressive avant-garde display with raw monospace body',
  },
];

// ============================================================================
// Pure OKLCH + APCA W3 Math Engine (instant local fallback + live preview)
// ============================================================================

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function normalizeHex(input: string, fallback: string): string {
  const cleaned = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split('')
      .map((ch) => ch + ch)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = normalizeHex(hex, '#000000').slice(1);
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (v: number) =>
    clamp(Math.round(v * 255), 0, 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`.toUpperCase();
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rgbToOklch(r: number, g: number, b: number): { l: number; c: number; h: number } {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bVal * bVal);
  let H = (Math.atan2(bVal, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { l: clamp(L, 0, 1), c: Math.max(0, C), h: Number.isFinite(H) ? H : 0 };
}

function oklchToLinearRgbRaw(l: number, c: number, h: number): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const lr = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  return [lr, lg, lb];
}

function inGamut(rgb: [number, number, number]): boolean {
  return (
    rgb[0] >= -0.0005 &&
    rgb[0] <= 1.0005 &&
    rgb[1] >= -0.0005 &&
    rgb[1] <= 1.0005 &&
    rgb[2] >= -0.0005 &&
    rgb[2] <= 1.0005
  );
}

function oklchToGamutHex(l: number, c: number, h: number): { hex: string; l: number; c: number; h: number } {
  const L = clamp(l, 0, 1);
  let C = Math.max(0, c);
  const H = ((h % 360) + 360) % 360;

  let raw = oklchToLinearRgbRaw(L, C, H);
  if (!inGamut(raw) && C > 0) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      if (inGamut(oklchToLinearRgbRaw(L, mid, H))) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    C = lo;
    raw = oklchToLinearRgbRaw(L, C, H);
  }

  const sr = linearToSrgb(clamp(raw[0], 0, 1));
  const sg = linearToSrgb(clamp(raw[1], 0, 1));
  const sb = linearToSrgb(clamp(raw[2], 0, 1));

  return {
    hex: rgbToHex(sr, sg, sb),
    l: Number(L.toFixed(3)),
    c: Number(C.toFixed(3)),
    h: Math.round(H),
  };
}

function formatCssOklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${Math.round(h)})`;
}

// APCA W3 0.0.98G-4g signed Lc
function apcaLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const y = 0.2126729 * Math.pow(r, 2.4) + 0.7151522 * Math.pow(g, 2.4) + 0.072175 * Math.pow(b, 2.4);
  return y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414);
}

function computeApcaLc(fgHex: string, bgHex: string): number {
  const txtY = apcaLuminance(fgHex);
  const bgY = apcaLuminance(bgHex);
  if (Math.abs(bgY - txtY) < 0.0005) return 0;

  let sapc = 0;
  if (bgY > txtY) {
    sapc = (Math.pow(bgY, 0.56) - Math.pow(txtY, 0.57)) * 1.14;
    if (sapc < 0.1) return 0;
    return Number(((sapc - 0.027) * 100).toFixed(1));
  } else {
    sapc = (Math.pow(bgY, 0.65) - Math.pow(txtY, 0.62)) * 1.14;
    if (sapc > -0.1) return 0;
    return Number(((sapc + 0.027) * 100).toFixed(1));
  }
}

function computeWcagRatio(fgHex: string, bgHex: string): number {
  const relLum = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = relLum(fgHex);
  const l2 = relLum(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function repairContrastColor(
  fgHex: string,
  bgHex: string,
  targetLc: number,
): { hex: string; lc: number; repaired: boolean } {
  const initialLc = computeApcaLc(fgHex, bgHex);
  if (Math.abs(initialLc) >= targetLc) {
    return { hex: fgHex, lc: initialLc, repaired: false };
  }

  const bgOklch = rgbToOklch(...hexToRgb(bgHex));
  const fgOklch = rgbToOklch(...hexToRgb(fgHex));
  const preferDarkText = bgOklch.l > 0.52;

  let bestHex = fgHex;
  let bestLc = initialLc;

  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    const nextL = preferDarkText
      ? fgOklch.l * (1 - t) + 0.06 * t
      : fgOklch.l * (1 - t) + 0.98 * t;
    const nextC = fgOklch.c * (1 - t * 0.45);
    const candidate = oklchToGamutHex(nextL, nextC, fgOklch.h).hex;
    const candidateLc = computeApcaLc(candidate, bgHex);
    if (Math.abs(candidateLc) > Math.abs(bestLc)) {
      bestHex = candidate;
      bestLc = candidateLc;
    }
    if (Math.abs(candidateLc) >= targetLc) {
      return { hex: candidate, lc: candidateLc, repaired: true };
    }
  }

  // Ultimate high-contrast anchor if hue/chroma couldn't reach target
  const poleHex = preferDarkText ? '#0A0B0D' : '#F8FAFC';
  const poleLc = computeApcaLc(poleHex, bgHex);
  if (Math.abs(poleLc) > Math.abs(bestLc)) {
    return { hex: poleHex, lc: poleLc, repaired: true };
  }
  return { hex: bestHex, lc: bestLc, repaired: bestHex !== fgHex };
}

function build12StepScale(
  seedHex: string,
  polarity: Polarity,
  kind: 'neutral' | 'accent',
): OklchStep[] {
  const seed = rgbToOklch(...hexToRgb(seedHex));
  const isDark = polarity === 'dark';

  const neutralLightL = [0.985, 0.962, 0.932, 0.896, 0.855, 0.808, 0.748, 0.652, 0.542, 0.468, 0.375, 0.165];
  const neutralDarkL = [0.115, 0.148, 0.186, 0.226, 0.268, 0.318, 0.382, 0.478, 0.568, 0.652, 0.768, 0.942];

  const accentLightL = [0.982, 0.955, 0.916, 0.868, 0.812, 0.745, 0.668, 0.592, 0.515, 0.455, 0.415, 0.265];
  const accentDarkL = [0.155, 0.192, 0.242, 0.295, 0.352, 0.418, 0.495, 0.578, 0.635, 0.695, 0.785, 0.915];

  const lCurve =
    kind === 'neutral'
      ? isDark
        ? neutralDarkL
        : neutralLightL
      : isDark
        ? accentDarkL
        : accentLightL;

  const baseChroma =
    kind === 'neutral'
      ? clamp(seed.c, 0.004, 0.022)
      : clamp(seed.c, 0.09, 0.24);

  const chromaWeights =
    kind === 'neutral'
      ? [0.45, 0.55, 0.65, 0.72, 0.8, 0.86, 0.92, 0.96, 1.0, 0.92, 0.78, 0.52]
      : [0.14, 0.24, 0.38, 0.52, 0.66, 0.78, 0.9, 0.98, 1.08, 1.02, 0.88, 0.58];

  return lCurve.map((targetL, idx) => {
    const step = idx + 1;
    // Keep step 9 close to the user's accent seed lightness when accent
    const adjustedL =
      kind === 'accent' && step === 9
        ? clamp(seed.l, isDark ? 0.54 : 0.42, isDark ? 0.72 : 0.62)
        : targetL;
    const chroma = baseChroma * chromaWeights[idx];
    const resolved = oklchToGamutHex(adjustedL, chroma, seed.h);
    return {
      step,
      role: STEP_ROLES[idx] ?? `Step ${step}`,
      hex: resolved.hex,
      l: resolved.l,
      c: resolved.c,
      h: resolved.h,
      cssOklch: formatCssOklch(resolved.l, resolved.c, resolved.h),
    };
  });
}

function buildCodeExports(
  polarity: Polarity,
  neutralScale: OklchStep[],
  accentScale: OklchStep[],
  semantic: SemanticTokens,
  fontPairing: FontPairing,
): { tokensJson: string; tokensCss: string; tailwindTheme: string } {
  const w3cTokens = {
    $schema: 'https://tr.designtokens.org/format/',
    meta: {
      compiler: 'AntiSlop OKLCH + APCA Color Kernel',
      polarity,
    },
    color: {
      semantic: {
        canvas: { $value: semantic.canvas, $type: 'color' },
        surface: { $value: semantic.surface, $type: 'color' },
        surfaceElevated: { $value: semantic.surfaceElevated, $type: 'color' },
        border: { $value: semantic.border, $type: 'color' },
        borderStrong: { $value: semantic.borderStrong, $type: 'color' },
        inkPrimary: { $value: semantic.inkPrimary, $type: 'color' },
        inkSecondary: { $value: semantic.inkSecondary, $type: 'color' },
        inkMuted: { $value: semantic.inkMuted, $type: 'color' },
        accent: { $value: semantic.accent, $type: 'color' },
        accentHover: { $value: semantic.accentHover, $type: 'color' },
        accentSoft: { $value: semantic.accentSoft, $type: 'color' },
        accentContrast: { $value: semantic.accentContrast, $type: 'color' },
      },
      neutral: Object.fromEntries(
        neutralScale.map((s) => [
          String(s.step),
          {
            $value: s.hex,
            $type: 'color',
            $extensions: { oklch: s.cssOklch, role: s.role },
          },
        ]),
      ),
      accent: Object.fromEntries(
        accentScale.map((s) => [
          String(s.step),
          {
            $value: s.hex,
            $type: 'color',
            $extensions: { oklch: s.cssOklch, role: s.role },
          },
        ]),
      ),
    },
    typography: {
      display: { $value: fontPairing.display, $type: 'fontFamily' },
      body: { $value: fontPairing.body, $type: 'fontFamily' },
      mono: { $value: fontPairing.mono, $type: 'fontFamily' },
    },
  };

  const tokensJson = JSON.stringify(w3cTokens, null, 2);

  const tokensCss = [
    `/* AntiSlop OKLCH + APCA Verified Design Tokens (${polarity}) */`,
    `:root {`,
    `  color-scheme: ${polarity};`,
    `  --color-canvas: ${semantic.canvas};`,
    `  --color-surface: ${semantic.surface};`,
    `  --color-surface-elevated: ${semantic.surfaceElevated};`,
    `  --color-border: ${semantic.border};`,
    `  --color-border-strong: ${semantic.borderStrong};`,
    `  --color-ink-primary: ${semantic.inkPrimary};`,
    `  --color-ink-secondary: ${semantic.inkSecondary};`,
    `  --color-ink-muted: ${semantic.inkMuted};`,
    `  --color-accent: ${semantic.accent};`,
    `  --color-accent-hover: ${semantic.accentHover};`,
    `  --color-accent-soft: ${semantic.accentSoft};`,
    `  --color-accent-contrast: ${semantic.accentContrast};`,
    ``,
    `  /* 12-Step Functional Neutral OKLCH Ramp */`,
    ...neutralScale.map((s) => `  --neutral-${s.step}: ${s.cssOklch}; /* ${s.hex} · ${s.role} */`),
    ``,
    `  /* 12-Step Functional Accent OKLCH Ramp */`,
    ...accentScale.map((s) => `  --accent-${s.step}: ${s.cssOklch}; /* ${s.hex} · ${s.role} */`),
    ``,
    `  /* Typography */`,
    `  --font-display: "${fontPairing.display}", Georgia, serif;`,
    `  --font-sans: "${fontPairing.body}", -apple-system, BlinkMacSystemFont, sans-serif;`,
    `  --font-mono: "${fontPairing.mono}", ui-monospace, monospace;`,
    `}`,
  ].join('\n');

  const tailwindTheme = [
    `/* Tailwind CSS v4 @theme Design System */`,
    `@import "tailwindcss";`,
    ``,
    `@theme {`,
    `  --color-canvas: ${semantic.canvas};`,
    `  --color-surface: ${semantic.surface};`,
    `  --color-surface-elevated: ${semantic.surfaceElevated};`,
    `  --color-border: ${semantic.border};`,
    `  --color-border-strong: ${semantic.borderStrong};`,
    `  --color-ink-primary: ${semantic.inkPrimary};`,
    `  --color-ink-secondary: ${semantic.inkSecondary};`,
    `  --color-ink-muted: ${semantic.inkMuted};`,
    `  --color-accent: ${semantic.accent};`,
    `  --color-accent-hover: ${semantic.accentHover};`,
    `  --color-accent-soft: ${semantic.accentSoft};`,
    `  --color-accent-contrast: ${semantic.accentContrast};`,
    ``,
    ...neutralScale.map((s) => `  --color-neutral-${s.step}: ${s.cssOklch};`),
    ...accentScale.map((s) => `  --color-accent-${s.step}: ${s.cssOklch};`),
    ``,
    `  --font-display: "${fontPairing.display}", Georgia, serif;`,
    `  --font-sans: "${fontPairing.body}", sans-serif;`,
    `  --font-mono: "${fontPairing.mono}", monospace;`,
    `}`,
  ].join('\n');

  return { tokensJson, tokensCss, tailwindTheme };
}

function compilePaletteLocally(
  accentInput: string,
  neutralInput: string,
  polarity: Polarity,
  fontPairing: FontPairing,
): CompiledPalette {
  const accentHex = normalizeHex(accentInput, '#0B57D0');
  const neutralHex = normalizeHex(neutralInput, polarity === 'dark' ? '#080A0E' : '#F5F3EF');

  const neutralScale = build12StepScale(neutralHex, polarity, 'neutral');
  const accentScale = build12StepScale(accentHex, polarity, 'accent');

  const canvas = neutralScale[0].hex;
  const surface = neutralScale[1].hex;
  const surfaceElevated = neutralScale[2].hex;
  const border = neutralScale[5].hex;
  const borderStrong = neutralScale[7].hex;

  const rawInkPrimary = neutralScale[11].hex;
  const rawInkSecondary = neutralScale[10].hex;
  const rawInkMuted = neutralScale[9].hex;
  const rawAccent = accentScale[8].hex;
  const accentHover = accentScale[9].hex;
  const accentSoft = accentScale[2].hex;

  // Pick optimal white/ink contrast on accent
  const whiteOnAccent = Math.abs(computeApcaLc('#FFFFFF', rawAccent));
  const darkOnAccent = Math.abs(computeApcaLc('#0A0B0D', rawAccent));
  const rawAccentContrast = whiteOnAccent >= darkOnAccent ? '#FFFFFF' : '#0A0B0D';

  const p1 = repairContrastColor(rawInkPrimary, canvas, 75);
  const p2 = repairContrastColor(p1.hex, surface, 70);
  const p3 = repairContrastColor(rawInkSecondary, canvas, 55);
  const p4 = repairContrastColor(rawAccentContrast, rawAccent, 60);
  const p5 = repairContrastColor(rawAccent, canvas, 45);

  const semantic: SemanticTokens = {
    canvas,
    surface,
    surfaceElevated,
    border,
    borderStrong,
    inkPrimary: p2.hex,
    inkSecondary: p3.hex,
    inkMuted: rawInkMuted,
    accent: p5.hex,
    accentHover,
    accentSoft,
    accentContrast: p4.hex,
  };

  const makeRow = (
    id: string,
    label: string,
    fgToken: string,
    bgToken: string,
    fgHex: string,
    bgHex: string,
    targetLc: number,
    repaired: boolean,
  ): ApcaAuditRow => {
    const lc = computeApcaLc(fgHex, bgHex);
    const wcagRatio = computeWcagRatio(fgHex, bgHex);
    const passes = Math.abs(lc) >= targetLc;
    const status: ApcaAuditRow['status'] = repaired ? 'AUTO-REPAIRED' : passes ? 'PASS' : 'WARN';
    return { id, label, fgToken, bgToken, fgHex, bgHex, lc, targetLc, wcagRatio, status };
  };

  const apcaAudit: ApcaAuditRow[] = [
    makeRow('inkPrimary-canvas', 'inkPrimary / canvas', 'inkPrimary', 'canvas', semantic.inkPrimary, semantic.canvas, 75, p1.repaired),
    makeRow('inkPrimary-surface', 'inkPrimary / surface', 'inkPrimary', 'surface', semantic.inkPrimary, semantic.surface, 70, p2.repaired),
    makeRow('inkSecondary-canvas', 'inkSecondary / canvas', 'inkSecondary', 'canvas', semantic.inkSecondary, semantic.canvas, 55, p3.repaired),
    makeRow('accentContrast-accent', 'accentContrast / accent', 'accentContrast', 'accent', semantic.accentContrast, semantic.accent, 60, p4.repaired),
    makeRow('accent-canvas', 'accent / canvas', 'accent', 'canvas', semantic.accent, semantic.canvas, 45, p5.repaired),
  ];

  const { tokensJson, tokensCss, tailwindTheme } = buildCodeExports(
    polarity,
    neutralScale,
    accentScale,
    semantic,
    fontPairing,
  );

  return {
    polarity,
    accentHex,
    neutralHex,
    neutralScale,
    accentScale,
    semantic,
    apcaAudit,
    tokensJson,
    tokensCss,
    tailwindTheme,
    source: 'local',
  };
}

// ============================================================================
// Defensive Normalization for Backend API Payloads
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseArchetypesResponse(raw: unknown): ArchetypePreset[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.archetypes)
      ? raw.archetypes
      : isRecord(raw) && Array.isArray(raw.presets)
        ? raw.presets
        : [];

  const parsed: ArchetypePreset[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const name = asString(item.name);
    if (!id || !name) continue;
    const polarity: Polarity = item.polarity === 'dark' || item.mode === 'dark' ? 'dark' : 'light';
    const accentHex = normalizeHex(
      asString(item.accentHex ?? item.accent ?? item.seedAccent),
      polarity === 'dark' ? '#4285F4' : '#0B57D0',
    );
    const neutralHex = normalizeHex(
      asString(item.neutralHex ?? item.neutral ?? item.seedNeutral ?? item.canvas),
      polarity === 'dark' ? '#080A0E' : '#F5F3EF',
    );
    const fp = isRecord(item.fontPairing) ? item.fontPairing : isRecord(item.fonts) ? item.fonts : {};
    const fontPairing: FontPairing = {
      display: asString(fp.display, 'Instrument Serif'),
      body: asString(fp.body ?? fp.sans, 'Plus Jakarta Sans'),
      mono: asString(fp.mono, 'JetBrains Mono'),
    };
    const dotsRaw = Array.isArray(item.previewDots)
      ? item.previewDots
      : Array.isArray(item.swatches)
        ? item.swatches
        : [];
    const fallbackDots: [string, string, string, string] = [
      neutralHex,
      polarity === 'dark' ? '#141820' : '#EAE8E2',
      accentHex,
      polarity === 'dark' ? '#F1F3F4' : '#141517',
    ];
    const previewDots: [string, string, string, string] = [
      normalizeHex(asString(dotsRaw[0]), fallbackDots[0]),
      normalizeHex(asString(dotsRaw[1]), fallbackDots[1]),
      normalizeHex(asString(dotsRaw[2]), fallbackDots[2]),
      normalizeHex(asString(dotsRaw[3]), fallbackDots[3]),
    ];

    parsed.push({
      id,
      name,
      tagline: asString(item.tagline ?? item.description, `${polarity === 'dark' ? 'Dark' : 'Light'} OKLCH system`),
      polarity,
      accentHex,
      neutralHex,
      fontPairing,
      previewDots,
    });
  }

  return parsed.length > 0 ? parsed : [...FALLBACK_ARCHETYPES];
}

function parseScaleArray(raw: unknown, fallback: OklchStep[]): OklchStep[] {
  if (!Array.isArray(raw) || raw.length < 12) return fallback;
  return raw.slice(0, 12).map((entry, idx) => {
    const fb = fallback[idx];
    if (!isRecord(entry)) return fb;
    const hex = normalizeHex(asString(entry.hex), fb.hex);
    const oklchObj = isRecord(entry.oklch) ? entry.oklch : entry;
    const l = asNumber(oklchObj.l ?? oklchObj.L, fb.l);
    const c = asNumber(oklchObj.c ?? oklchObj.C, fb.c);
    const h = asNumber(oklchObj.h ?? oklchObj.H, fb.h);
    return {
      step: asNumber(entry.step, idx + 1),
      role: asString(entry.role, fb.role),
      hex,
      l: Number(l.toFixed(3)),
      c: Number(c.toFixed(3)),
      h: Math.round(h),
      cssOklch: asString(entry.cssOklch ?? entry.css, formatCssOklch(l, c, h)),
    };
  });
}

function parseCompiledResponse(
  raw: unknown,
  fallback: CompiledPalette,
  fontPairing: FontPairing,
): CompiledPalette {
  if (!isRecord(raw)) return fallback;

  const scalesObj = isRecord(raw.scales) ? raw.scales : raw;
  const neutralScale = parseScaleArray(
    scalesObj.neutralScale ?? scalesObj.neutral,
    fallback.neutralScale,
  );
  const accentScale = parseScaleArray(
    scalesObj.accentScale ?? scalesObj.accent,
    fallback.accentScale,
  );

  const semRaw = isRecord(raw.semantic)
    ? raw.semantic
    : isRecord(raw.semanticTokens)
      ? raw.semanticTokens
      : {};

  const semantic: SemanticTokens = {
    canvas: normalizeHex(asString(semRaw.canvas), fallback.semantic.canvas),
    surface: normalizeHex(asString(semRaw.surface), fallback.semantic.surface),
    surfaceElevated: normalizeHex(asString(semRaw.surfaceElevated), fallback.semantic.surfaceElevated),
    border: normalizeHex(asString(semRaw.border), fallback.semantic.border),
    borderStrong: normalizeHex(asString(semRaw.borderStrong), fallback.semantic.borderStrong),
    inkPrimary: normalizeHex(asString(semRaw.inkPrimary), fallback.semantic.inkPrimary),
    inkSecondary: normalizeHex(asString(semRaw.inkSecondary), fallback.semantic.inkSecondary),
    inkMuted: normalizeHex(asString(semRaw.inkMuted), fallback.semantic.inkMuted),
    accent: normalizeHex(asString(semRaw.accent), fallback.semantic.accent),
    accentHover: normalizeHex(asString(semRaw.accentHover), fallback.semantic.accentHover),
    accentSoft: normalizeHex(asString(semRaw.accentSoft), fallback.semantic.accentSoft),
    accentContrast: normalizeHex(asString(semRaw.accentContrast), fallback.semantic.accentContrast),
  };

  const auditRaw = Array.isArray(raw.apcaAudit)
    ? raw.apcaAudit
    : Array.isArray(raw.contrastAudit)
      ? raw.contrastAudit
      : Array.isArray(raw.audit)
        ? raw.audit
        : [];

  const parsedAudit: ApcaAuditRow[] = [];
  for (let i = 0; i < auditRaw.length; i++) {
    const row = auditRaw[i];
    if (!isRecord(row)) continue;
    const fgHex = normalizeHex(asString(row.fgHex ?? row.foreground), semantic.inkPrimary);
    const bgHex = normalizeHex(asString(row.bgHex ?? row.background), semantic.canvas);
    const lc = asNumber(row.lc ?? row.apcaLc, computeApcaLc(fgHex, bgHex));
    const targetLc = asNumber(row.targetLc ?? row.minLc, 60);
    const wcagRatio = asNumber(row.wcagRatio ?? row.wcag, computeWcagRatio(fgHex, bgHex));
    const repaired = Boolean(row.repaired ?? row.autoRepaired ?? row.status === 'AUTO-REPAIRED');
    const passes = Boolean(row.pass ?? row.passed ?? Math.abs(lc) >= targetLc);
    const status: ApcaAuditRow['status'] = repaired ? 'AUTO-REPAIRED' : passes ? 'PASS' : 'WARN';
    const label = asString(row.label ?? row.pair, `Pair ${i + 1}`);
    parsedAudit.push({
      id: asString(row.id, `pair-${i}`),
      label,
      fgToken: asString(row.fgToken, label.split('/')[0]?.trim() || 'fg'),
      bgToken: asString(row.bgToken, label.split('/')[1]?.trim() || 'bg'),
      fgHex,
      bgHex,
      lc: Number(lc.toFixed(1)),
      targetLc,
      wcagRatio: Number(wcagRatio.toFixed(2)),
      status,
    });
  }

  const apcaAudit = parsedAudit.length > 0 ? parsedAudit : fallback.apcaAudit;

  const exportsObj = isRecord(raw.exports) ? raw.exports : raw;
  const localExports = buildCodeExports(
    fallback.polarity,
    neutralScale,
    accentScale,
    semantic,
    fontPairing,
  );

  const tokensJson =
    typeof exportsObj.tokensJson === 'string'
      ? exportsObj.tokensJson
      : isRecord(exportsObj.tokensJson)
        ? JSON.stringify(exportsObj.tokensJson, null, 2)
        : localExports.tokensJson;

  const tokensCss = asString(exportsObj.tokensCss ?? exportsObj.css, localExports.tokensCss);
  const tailwindTheme = asString(
    exportsObj.tailwindTheme ?? exportsObj.tailwindCss,
    localExports.tailwindTheme,
  );

  return {
    polarity: fallback.polarity,
    accentHex: fallback.accentHex,
    neutralHex: fallback.neutralHex,
    neutralScale,
    accentScale,
    semantic,
    apcaAudit,
    tokensJson,
    tokensCss,
    tailwindTheme,
    source: 'backend',
  };
}

function normalizeTypographyCategory(raw: string): Exclude<TypographyCategory, 'All'> {
  const lower = raw.toLowerCase();
  if (lower.includes('editorial') || lower.includes('serif')) return 'Editorial Serif';
  if (lower.includes('swiss') || lower.includes('grotesk') || lower.includes('neo')) return 'Swiss Grotesk';
  if (lower.includes('luxury') || lower.includes('fashion') || lower.includes('couture')) return 'Luxury';
  if (lower.includes('tech') || lower.includes('mono') || lower.includes('dev') || lower.includes('system')) {
    return 'Technical';
  }
  if (lower.includes('brutal') || lower.includes('avant') || lower.includes('expressive')) return 'Brutalist';
  return 'Editorial Serif';
}

function buildGoogleFontsUrl(display: string, body: string, mono: string): string {
  const unique = Array.from(new Set([display, body, mono].filter((f) => f.trim().length > 0)));
  const families = unique
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

function parseTypographyResponse(raw: unknown): VerifiedTypographyPairing[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.pairings)
      ? raw.pairings
      : isRecord(raw) && Array.isArray(raw.typography)
        ? raw.typography
        : isRecord(raw) && Array.isArray(raw.items)
          ? raw.items
          : [];

  const parsed: VerifiedTypographyPairing[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const name = asString(item.name ?? item.label ?? item.title);
    if (!id && !name) continue;

    const fontsObj = isRecord(item.fonts) ? item.fonts : isRecord(item.fontPairing) ? item.fontPairing : {};
    const display = asString(
      item.display ?? item.displayFont ?? item.headingFont ?? fontsObj.display,
      'Instrument Serif',
    );
    const body = asString(
      item.body ?? item.bodyFont ?? item.sansFont ?? fontsObj.body ?? fontsObj.sans,
      'Plus Jakarta Sans',
    );
    const mono = asString(item.mono ?? item.monoFont ?? fontsObj.mono, 'JetBrains Mono');

    const stylesheetUrl = asString(
      item.stylesheetUrl ?? item.cssUrl ?? item.googleFontsUrl ?? item.fontUrl ?? item.linkHref,
      buildGoogleFontsUrl(display, body, mono),
    );

    const h1Tracking = asString(
      item.h1Tracking ?? item.displayTracking ?? item.headingTracking ?? item.tracking,
      '-0.025em',
    );

    const rawRatio = item.scaleRatio ?? item.typeScaleRatio ?? item.ratio;
    const scaleRatio =
      typeof rawRatio === 'number' && Number.isFinite(rawRatio) && rawRatio > 1
        ? Number(rawRatio.toFixed(3))
        : typeof rawRatio === 'string' && Number.isFinite(parseFloat(rawRatio)) && parseFloat(rawRatio) > 1
          ? Number(parseFloat(rawRatio).toFixed(3))
          : 1.25;

    const opticalSizing = Boolean(
      item.opticalSizing ?? item.hasOpticalSizing ?? item.opsz ?? item.supportsOpticalSizing ?? false,
    );

    parsed.push({
      id: id || `${display}-${body}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: name || `${display} + ${body}`,
      category: normalizeTypographyCategory(asString(item.category ?? item.group ?? item.style, 'Editorial Serif')),
      display,
      body,
      mono,
      stylesheetUrl,
      h1Tracking,
      scaleRatio,
      opticalSizing,
      vibe: asString(item.vibe ?? item.description ?? item.notes, `${display} paired with ${body}`),
    });
  }

  return parsed.length > 0 ? parsed : [...FALLBACK_TYPOGRAPHY_PAIRINGS];
}

function parseExtractedPaletteResponse(
  raw: unknown,
  fileName: string,
  fallbackPolarity: Polarity,
): ExtractedImagePalette | null {
  if (!isRecord(raw)) return null;
  const source = isRecord(raw.palette) ? raw.palette : raw;

  const accentRaw = asString(
    source.accentHex ?? source.seedAccentHex ?? source.accent ?? source.primaryAccent,
  );
  const neutralRaw = asString(
    source.neutralHex ?? source.seedNeutralHex ?? source.neutral ?? source.canvasHex ?? source.canvas,
  );

  if (!accentRaw && !neutralRaw) return null;

  const modeRaw = asString(source.mode ?? source.polarity).toLowerCase();
  const mode: Polarity =
    modeRaw === 'dark' ? 'dark' : modeRaw === 'light' ? 'light' : fallbackPolarity;

  const accentHex = normalizeHex(accentRaw, mode === 'dark' ? '#4285F4' : '#0B57D0');
  const neutralHex = normalizeHex(neutralRaw, mode === 'dark' ? '#0A0D12' : '#F5F3EF');

  const rawClusters = Array.isArray(source.clusters)
    ? source.clusters
    : Array.isArray(source.swatches)
      ? source.swatches
      : Array.isArray(source.dominantColors)
        ? source.dominantColors
        : Array.isArray(raw.clusters)
          ? raw.clusters
          : [];

  const clusters: string[] = [];
  for (const c of rawClusters) {
    if (typeof c === 'string') {
      const hex = normalizeHex(c, '');
      if (hex) clusters.push(hex);
    } else if (isRecord(c)) {
      const hex = normalizeHex(asString(c.hex ?? c.color), '');
      if (hex) clusters.push(hex);
    }
    if (clusters.length >= 6) break;
  }

  if (clusters.length === 0) {
    clusters.push(neutralHex, accentHex);
  }

  return { accentHex, neutralHex, mode, clusters, fileName };
}

// ============================================================================
// Component
// ============================================================================

export function DesignSystemModal({
  open,
  onClose,
  onApplyDesignSystem,
  onInstantLookApplied,
}: DesignSystemModalProps) {
  const filterPrefix = useId().replace(/:/g, '');

  const [archetypes, setArchetypes] = useState<ArchetypePreset[]>([...FALLBACK_ARCHETYPES]);
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>(FALLBACK_ARCHETYPES[0].id);
  const [polarity, setPolarity] = useState<Polarity>(FALLBACK_ARCHETYPES[0].polarity);
  const [accentHex, setAccentHex] = useState<string>(FALLBACK_ARCHETYPES[0].accentHex);
  const [neutralHex, setNeutralHex] = useState<string>(FALLBACK_ARCHETYPES[0].neutralHex);
  const [accentInput, setAccentInput] = useState<string>(FALLBACK_ARCHETYPES[0].accentHex);
  const [neutralInput, setNeutralInput] = useState<string>(FALLBACK_ARCHETYPES[0].neutralHex);
  const [fontPairing, setFontPairing] = useState<FontPairing>(FALLBACK_ARCHETYPES[0].fontPairing);
  const [cvdMode, setCvdMode] = useState<CvdMode>('normal');
  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>('tokens.css');

  // Verified 24-Pairing Typography Studio state
  const [typographyPairings, setTypographyPairings] = useState<VerifiedTypographyPairing[]>([
    ...FALLBACK_TYPOGRAPHY_PAIRINGS,
  ]);
  const [typographyCategory, setTypographyCategory] = useState<TypographyCategory>('All');
  const [selectedPairingId, setSelectedPairingId] = useState<string>(
    FALLBACK_TYPOGRAPHY_PAIRINGS[0].id,
  );
  const [loadedStylesheetUrl, setLoadedStylesheetUrl] = useState<string>('');

  // Moodboard Image-to-OKLCH Extractor state
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [isExtractingImage, setIsExtractingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [extractedImage, setExtractedImage] = useState<ExtractedImagePalette | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Instant 0ms Live Apply state
  const [isApplyingInstant, setIsApplyingInstant] = useState(false);
  const [instantStatus, setInstantStatus] = useState<'idle' | 'applied' | 'error'>('idle');
  const [instantMessage, setInstantMessage] = useState<string | null>(null);
  const instantTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [compiled, setCompiled] = useState<CompiledPalette>(() =>
    compilePaletteLocally(
      FALLBACK_ARCHETYPES[0].accentHex,
      FALLBACK_ARCHETYPES[0].neutralHex,
      FALLBACK_ARCHETYPES[0].polarity,
      FALLBACK_ARCHETYPES[0].fontPairing,
    ),
  );
  const [isCompiling, setIsCompiling] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (instantTimerRef.current) clearTimeout(instantTimerRef.current);
    };
  }, []);

  // 1. Fetch Archetypes on modal open (with instant local fallback already hydrated)
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    fetch(`${BACKEND_URL}/api/design/archetypes`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const parsed = parseArchetypesResponse(data);
        if (parsed.length > 0) {
          setArchetypes(parsed);
        }
      })
      .catch(() => {
        // Keep local fallback archetypes silently
      });

    return () => controller.abort();
  }, [open]);

  // 1b. Fetch Verified 24-Pairing Typography Studio catalog on modal open
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    fetch(`${BACKEND_URL}/api/design/typography`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const parsed = parseTypographyResponse(data);
        if (parsed.length > 0) {
          setTypographyPairings(parsed);
          setSelectedPairingId((prev) =>
            parsed.some((p) => p.id === prev) ? prev : parsed[0].id,
          );
        }
      })
      .catch(() => {
        // Keep curated local fallback pairings silently
      });

    return () => controller.abort();
  }, [open]);

  const activeTypographyPairing = useMemo<VerifiedTypographyPairing | undefined>(
    () => typographyPairings.find((p) => p.id === selectedPairingId) ?? typographyPairings[0],
    [typographyPairings, selectedPairingId],
  );

  // Dynamically inject selected pairing's <link rel="stylesheet"> into document.head
  useEffect(() => {
    if (!open || !activeTypographyPairing?.stylesheetUrl) return;
    const href = activeTypographyPairing.stylesheetUrl;
    if (typeof document === 'undefined') return;

    const existing = document.getElementById(
      'antislop-typography-studio-font',
    ) as HTMLLinkElement | null;
    if (existing) {
      if (existing.href !== href) {
        existing.href = href;
      }
      setLoadedStylesheetUrl(href);
      return;
    }

    const link = document.createElement('link');
    link.id = 'antislop-typography-studio-font';
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-antislop-typography', 'true');
    document.head.appendChild(link);
    setLoadedStylesheetUrl(href);
  }, [open, activeTypographyPairing]);

  const filteredTypographyPairings = useMemo(() => {
    if (typographyCategory === 'All') return typographyPairings;
    return typographyPairings.filter((p) => p.category === typographyCategory);
  }, [typographyPairings, typographyCategory]);

  // 2. Compile Palette via local instant math + POST /api/design/compile-palette
  useEffect(() => {
    if (!open) return;

    const localResult = compilePaletteLocally(accentHex, neutralHex, polarity, fontPairing);
    setCompiled(localResult);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setIsCompiling(true);
      fetch(`${BACKEND_URL}/api/design/compile-palette`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          accentHex,
          neutralHex,
          polarity,
          cvdMode,
          archetypeId: selectedArchetypeId,
          pairingId: selectedPairingId,
          fontPairing,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setCompiled(parseCompiledResponse(data, localResult, fontPairing));
        })
        .catch(() => {
          // Local OKLCH + APCA compilation remains active
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsCompiling(false);
          }
        });
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, accentHex, neutralHex, polarity, cvdMode, selectedArchetypeId, selectedPairingId, fontPairing]);

  const handleSelectArchetype = useCallback(
    (preset: ArchetypePreset) => {
      setSelectedArchetypeId(preset.id);
      setPolarity(preset.polarity);
      setAccentHex(preset.accentHex);
      setAccentInput(preset.accentHex);
      setNeutralHex(preset.neutralHex);
      setNeutralInput(preset.neutralHex);
      setFontPairing(preset.fontPairing);
      const matched = typographyPairings.find(
        (p) => p.display.toLowerCase() === preset.fontPairing.display.toLowerCase(),
      );
      if (matched) {
        setSelectedPairingId(matched.id);
      }
    },
    [typographyPairings],
  );

  const handleSelectTypographyPairing = useCallback((pairing: VerifiedTypographyPairing) => {
    setSelectedPairingId(pairing.id);
    setFontPairing({
      display: pairing.display,
      body: pairing.body,
      mono: pairing.mono,
    });
  }, []);

  const handleExtractImageFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setExtractError('Please choose an image file (PNG, JPG, WebP).');
        return;
      }

      setIsExtractingImage(true);
      setExtractError(null);

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              resolve(reader.result);
            } else {
              reject(new Error('Failed to read image data'));
            }
          };
          reader.onerror = () => reject(new Error('Could not read image file'));
          reader.readAsDataURL(file);
        });

        const rawBase64 = dataUrl.replace(/^data:[^;]+;base64,/i, '').trim();
        const res = await fetch(`${BACKEND_URL}/api/design/extract-image-palette`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            dataBase64: rawBase64,
            mimeType: file.type || 'image/png',
          }),
        });

        if (!res.ok) {
          throw new Error(`Palette extraction returned ${res.status}`);
        }

        const data: unknown = await res.json();
        const extracted = parseExtractedPaletteResponse(data, file.name, polarity);
        if (!extracted) {
          throw new Error('Could not parse Oklab clusters from image response.');
        }

        setExtractedImage(extracted);
        setPolarity(extracted.mode);
        setAccentHex(extracted.accentHex);
        setAccentInput(extracted.accentHex);
        setNeutralHex(extracted.neutralHex);
        setNeutralInput(extracted.neutralHex);
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : 'Image palette extraction failed');
      } finally {
        setIsExtractingImage(false);
        if (imageInputRef.current) {
          imageInputRef.current.value = '';
        }
      }
    },
    [polarity],
  );

  const handleApplyInstantLook = useCallback(async () => {
    const activeArchetype = archetypes.find((a) => a.id === selectedArchetypeId);
    setIsApplyingInstant(true);
    setInstantStatus('idle');
    setInstantMessage(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/design/apply-instant-look`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeArchetype?.name ?? 'Custom OKLCH System',
          mode: polarity,
          seedAccentHex: accentHex,
          seedNeutralHex: neutralHex,
          pairingId: selectedPairingId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Instant apply failed (${res.status})`);
      }

      setInstantStatus('applied');
      setInstantMessage('Injected OKLCH tokens + live webfonts into preview');
      onInstantLookApplied?.();

      if (instantTimerRef.current) clearTimeout(instantTimerRef.current);
      instantTimerRef.current = setTimeout(() => {
        setInstantStatus('idle');
        setInstantMessage(null);
      }, 3200);
    } catch (err) {
      setInstantStatus('error');
      setInstantMessage(err instanceof Error ? err.message : 'Instant live preview failed');
    } finally {
      setIsApplyingInstant(false);
    }
  }, [
    archetypes,
    selectedArchetypeId,
    polarity,
    accentHex,
    neutralHex,
    selectedPairingId,
    onInstantLookApplied,
  ]);

  const handlePolaritySwitch = useCallback((nextPolarity: Polarity) => {
    setPolarity(nextPolarity);
    setNeutralHex((prev) => {
      const lum = apcaLuminance(prev);
      if (nextPolarity === 'dark' && lum > 0.35) {
        const next = '#0A0D12';
        setNeutralInput(next);
        return next;
      }
      if (nextPolarity === 'light' && lum < 0.35) {
        const next = '#F6F5F1';
        setNeutralInput(next);
        return next;
      }
      return prev;
    });
  }, []);

  const activeCodeContent = useMemo(() => {
    if (activeCodeTab === 'tokens.json') return compiled.tokensJson;
    if (activeCodeTab === 'tokens.css') return compiled.tokensCss;
    return compiled.tailwindTheme;
  }, [activeCodeTab, compiled]);

  const cvdFilterStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (cvdMode === 'normal') return undefined;
    return { filter: `url(#${filterPrefix}-${cvdMode})` };
  }, [cvdMode, filterPrefix]);

  const repairedCount = useMemo(
    () => compiled.apcaAudit.filter((r) => r.status === 'AUTO-REPAIRED').length,
    [compiled.apcaAudit],
  );

  const handleApplyToApp = useCallback(() => {
    const activeArchetype = archetypes.find((a) => a.id === selectedArchetypeId);
    const s = compiled.semantic;
    const accent9 = compiled.accentScale[8];
    const neutral1 = compiled.neutralScale[0];
    const neutral12 = compiled.neutralScale[11];

    const auditSummary = compiled.apcaAudit
      .map((row) => `${row.label}: Lc ${row.lc >= 0 ? '+' : ''}${row.lc} (${row.wcagRatio}:1, ${row.status})`)
      .join('; ');

    const pairingMeta = activeTypographyPairing
      ? [
          `Verified Typography Pairing: ${activeTypographyPairing.name} (${activeTypographyPairing.category} · id: ${activeTypographyPairing.id})`,
          `- Display: ${activeTypographyPairing.display} (h1Tracking: ${activeTypographyPairing.h1Tracking}, scaleRatio: ${activeTypographyPairing.scaleRatio}×, opticalSizing: ${activeTypographyPairing.opticalSizing ? 'enabled (opsz)' : 'standard'})`,
          `- Body: ${activeTypographyPairing.body}`,
          `- Mono: ${activeTypographyPairing.mono}`,
          `- Stylesheet: ${activeTypographyPairing.stylesheetUrl}`,
        ]
      : [
          `Typography Pairing:`,
          `- Display: ${fontPairing.display}`,
          `- Body: ${fontPairing.body}`,
          `- Mono: ${fontPairing.mono}`,
        ];

    const prompt = [
      `Apply this APCA-verified OKLCH Design System (${activeArchetype?.name ?? 'Custom Palette'} · ${compiled.polarity.toUpperCase()} polarity) across the entire live application:`,
      '',
      `Semantic Tokens (Hex + OKLCH):`,
      `- Canvas: ${s.canvas} (${neutral1?.cssOklch ?? ''})`,
      `- Surface: ${s.surface} | Elevated Surface: ${s.surfaceElevated}`,
      `- Borders: ${s.border} (subtle) / ${s.borderStrong} (strong)`,
      `- Ink Primary: ${s.inkPrimary} (${neutral12?.cssOklch ?? ''}) | Ink Secondary: ${s.inkSecondary} | Ink Muted: ${s.inkMuted}`,
      `- Accent: ${s.accent} (${accent9?.cssOklch ?? ''}) | Hover: ${s.accentHover} | Soft Tint: ${s.accentSoft} | On-Accent Contrast: ${s.accentContrast}`,
      '',
      ...pairingMeta,
      '',
      `APCA Contrast Verification: ${auditSummary}.`,
      `Update CSS custom properties / Tailwind @theme tokens, load the verified typography stylesheet, and ensure all surfaces, typography, borders, badges, and primary CTAs strictly use these verified tokens with crisp editorial hierarchy.`,
    ].join('\n');

    onApplyDesignSystem(prompt);
    onClose();
  }, [
    archetypes,
    selectedArchetypeId,
    compiled,
    activeTypographyPairing,
    fontPairing,
    onApplyDesignSystem,
    onClose,
  ]);

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      widthClass="w-[min(95vw,1060px)]"
      title="OKLCH + APCA Color Kernel & Token Compiler"
      subtitle="Perceptually uniform 12-step OKLCH scales, APCA Lc contrast auto-repair, CVD simulation, and W3C Design Token exports."
    >
      {/* Hidden SVG Color Vision Deficiency (CVD) Filters */}
      <svg aria-hidden="true" className="pointer-events-none fixed h-0 w-0 opacity-0">
        <defs>
          {(Object.keys(CVD_MATRICES) as Array<Exclude<CvdMode, 'normal'>>).map((mode) => (
            <filter key={mode} id={`${filterPrefix}-${mode}`} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={CVD_MATRICES[mode]} />
            </filter>
          ))}
        </defs>
      </svg>

      <div className="flex flex-col gap-5">
        {/* 1. Archetype Selector Bar */}
        <section aria-label="Design Archetypes" className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              <Palette className="h-3.5 w-3.5 text-[var(--cobalt-bright)]" />
              <span>Archetype Presets</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
              {isCompiling ? (
                <span className="inline-flex items-center gap-1.5 text-[var(--cobalt-ice)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Syncing kernel…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px]">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        compiled.source === 'backend' ? 'var(--emerald)' : 'var(--cobalt-bright)',
                    }}
                  />
                  {compiled.source === 'backend' ? 'Kernel API Verified' : 'Live OKLCH Kernel'}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {archetypes.map((preset) => {
              const isSelected = preset.id === selectedArchetypeId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectArchetype(preset)}
                  className="group flex flex-col gap-2 rounded-xl border p-3 text-left transition-all"
                  style={{
                    backgroundColor: isSelected ? 'var(--cobalt-tint)' : 'var(--bg-card-elevated)',
                    borderColor: isSelected ? 'var(--cobalt-border-strong)' : 'var(--border-card)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center -space-x-1">
                      {preset.previewDots.map((dotHex, idx) => (
                        <span
                          key={`${preset.id}-dot-${idx}`}
                          className="h-4 w-4 rounded-full border border-white/20 shadow-xs"
                          style={{ backgroundColor: dotHex }}
                        />
                      ))}
                    </div>
                    <span
                      className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em]"
                      style={{
                        borderColor: 'var(--border-pill)',
                        backgroundColor: 'var(--bg-card)',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      {preset.polarity}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-[var(--ink-primary)]">
                      {preset.name}
                    </div>
                    <div className="truncate text-[11px] text-[var(--ink-secondary)]">
                      {preset.fontPairing.display} + {preset.fontPairing.body}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Live Seed Customizer, Polarity Switch & CVD Vision Simulator */}
        <section
          aria-label="Seed Customizer and Vision Simulator"
          className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3.5 lg:grid-cols-12"
        >
          {/* Accent Hex */}
          <div className="flex flex-col gap-1.5 lg:col-span-3">
            <label
              htmlFor="dsm-accent-hex"
              className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]"
            >
              Accent Seed
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-2.5 py-1.5">
              <input
                type="color"
                aria-label="Pick accent color"
                value={accentHex}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setAccentHex(next);
                  setAccentInput(next);
                }}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                id="dsm-accent-hex"
                type="text"
                value={accentInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setAccentInput(val);
                  if (/^#?[0-9a-fA-F]{6}$/.test(val.trim())) {
                    setAccentHex(normalizeHex(val, accentHex));
                  }
                }}
                onBlur={() => setAccentInput(accentHex)}
                className="w-full bg-transparent font-mono text-[12px] text-[var(--ink-primary)] outline-none"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Neutral Hex */}
          <div className="flex flex-col gap-1.5 lg:col-span-3">
            <label
              htmlFor="dsm-neutral-hex"
              className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]"
            >
              Neutral Seed
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-2.5 py-1.5">
              <input
                type="color"
                aria-label="Pick neutral color"
                value={neutralHex}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setNeutralHex(next);
                  setNeutralInput(next);
                }}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                id="dsm-neutral-hex"
                type="text"
                value={neutralInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setNeutralInput(val);
                  if (/^#?[0-9a-fA-F]{6}$/.test(val.trim())) {
                    setNeutralHex(normalizeHex(val, neutralHex));
                  }
                }}
                onBlur={() => setNeutralInput(neutralHex)}
                className="w-full bg-transparent font-mono text-[12px] text-[var(--ink-primary)] outline-none"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Polarity Switch */}
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              Polarity
            </span>
            <div className="grid grid-cols-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] p-1">
              <button
                type="button"
                onClick={() => handlePolaritySwitch('light')}
                className="inline-flex items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: polarity === 'light' ? 'var(--cobalt-tint-strong)' : 'transparent',
                  color: polarity === 'light' ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                }}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                type="button"
                onClick={() => handlePolaritySwitch('dark')}
                className="inline-flex items-center justify-center gap-1 rounded-md py-1 text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: polarity === 'dark' ? 'var(--cobalt-tint-strong)' : 'transparent',
                  color: polarity === 'dark' ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                }}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          </div>

          {/* CVD Vision Simulator */}
          <div className="flex flex-col gap-1.5 lg:col-span-4">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              <Eye className="h-3 w-3 text-[var(--cobalt-bright)]" />
              CVD Vision Simulator
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CVD_MODES.map((mode) => {
                const active = cvdMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setCvdMode(mode.id)}
                    title={mode.short}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--cobalt-tint-strong)' : 'var(--bg-card)',
                      borderColor: active ? 'var(--cobalt-border-strong)' : 'var(--border-card)',
                      color: active ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                    }}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Moodboard Image-to-OKLCH Color Extractor */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--border-subtle)] pt-3 lg:col-span-12">
            <div className="flex min-w-0 items-center gap-2.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handleExtractImageFile(e.target.files?.[0]);
                }}
              />
              <button
                type="button"
                disabled={isExtractingImage}
                onClick={() => imageInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(true);
                }}
                onDragLeave={() => setIsDraggingImage(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(false);
                  void handleExtractImageFile(e.dataTransfer.files?.[0]);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-60"
                style={{
                  backgroundColor: isDraggingImage ? 'var(--cobalt-tint-strong)' : 'var(--bg-card)',
                  borderColor: isDraggingImage ? 'var(--cobalt-border-strong)' : 'var(--border-strong)',
                  color: 'var(--ink-primary)',
                }}
              >
                {isExtractingImage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--cobalt-bright)]" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5 text-[var(--cobalt-bright)]" />
                )}
                <span>
                  {isExtractingImage
                    ? 'Clustering Oklab pixels…'
                    : isDraggingImage
                      ? 'Drop moodboard image'
                      : 'Extract Palette from Image'}
                </span>
              </button>

              {extractedImage ? (
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex items-center -space-x-1">
                    {extractedImage.clusters.map((hex, idx) => (
                      <span
                        key={`cluster-${hex}-${idx}`}
                        title={hex}
                        className="h-4 w-4 rounded-full border border-white/25"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <span className="truncate font-mono text-[10px] text-[var(--ink-secondary)]">
                    Oklab extracted ({extractedImage.mode}) · {extractedImage.fileName}
                  </span>
                </div>
              ) : extractError ? (
                <span className="font-mono text-[10px] text-[var(--vermilion)]">
                  {extractError}
                </span>
              ) : (
                <span className="text-[11px] text-[var(--ink-muted)]">
                  Drop or upload a moodboard image to auto-derive Accent, Neutral &amp; Polarity via Oklab k-means.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* 2b. Verified 24-Pairing Typography Studio */}
        <section
          aria-label="Verified Typography Studio"
          className="flex flex-col gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
              <Type className="h-3.5 w-3.5 text-[var(--cobalt-bright)]" />
              <span>Verified Typography Studio ({typographyPairings.length} Pairings)</span>
            </div>

            {activeTypographyPairing && (
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                <span className="rounded-full border border-[var(--border-pill)] bg-[var(--bg-card)] px-2 py-0.5 text-[var(--ink-secondary)]">
                  h1Tracking: <strong className="text-[var(--ink-primary)]">{activeTypographyPairing.h1Tracking}</strong>
                </span>
                <span className="rounded-full border border-[var(--border-pill)] bg-[var(--bg-card)] px-2 py-0.5 text-[var(--ink-secondary)]">
                  scale: <strong className="text-[var(--ink-primary)]">{activeTypographyPairing.scaleRatio}×</strong>
                </span>
                {activeTypographyPairing.opticalSizing && (
                  <span
                    className="rounded-full border px-2 py-0.5 font-semibold"
                    style={{
                      backgroundColor: 'var(--emerald-bg)',
                      borderColor: 'var(--emerald-border)',
                      color: 'var(--emerald)',
                    }}
                  >
                    Optical Sizing (opsz)
                  </span>
                )}
                {loadedStylesheetUrl && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] px-2 py-0.5 text-[var(--cobalt-ice)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--cobalt-bright)]" />
                    Live Webfont
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPOGRAPHY_CATEGORIES.map((category) => {
              const active = typographyCategory === category;
              const count =
                category === 'All'
                  ? typographyPairings.length
                  : typographyPairings.filter((p) => p.category === category).length;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setTypographyCategory(category)}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--cobalt-tint-strong)' : 'var(--bg-card)',
                    borderColor: active ? 'var(--cobalt-border-strong)' : 'var(--border-card)',
                    color: active ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                  }}
                >
                  {category}{' '}
                  <span className="ml-0.5 font-mono text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Pairing Cards Grid */}
          <div className="studio-scroll grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTypographyPairings.map((pairing) => {
              const isSelected = pairing.id === activeTypographyPairing?.id;
              return (
                <button
                  key={pairing.id}
                  type="button"
                  onClick={() => handleSelectTypographyPairing(pairing)}
                  className="flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-all"
                  style={{
                    backgroundColor: isSelected ? 'var(--cobalt-tint)' : 'var(--bg-card)',
                    borderColor: isSelected ? 'var(--cobalt-border-strong)' : 'var(--border-card)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-semibold text-[var(--ink-primary)]">
                      {pairing.name}
                    </span>
                    <span className="shrink-0 rounded-full border border-[var(--border-pill)] bg-[var(--bg-card-elevated)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-secondary)]">
                      {pairing.category}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-[var(--ink-secondary)]">
                    <span className="font-medium text-[var(--ink-primary)]">{pairing.display}</span>
                    {' + '}
                    <span>{pairing.body}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 font-mono text-[9px] text-[var(--ink-muted)]">
                    <span>track {pairing.h1Tracking}</span>
                    <span>·</span>
                    <span>ratio {pairing.scaleRatio}×</span>
                    {pairing.opticalSizing && (
                      <span
                        className="ml-auto rounded px-1.5 py-0.5 font-semibold"
                        style={{
                          backgroundColor: 'var(--emerald-bg)',
                          color: 'var(--emerald)',
                        }}
                      >
                        opsz
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. 12-Step Functional OKLCH Scale Visualizer */}
        <section aria-label="12-Step OKLCH Scales" className="flex flex-col gap-3">
          {(
            [
              { label: 'Neutral 12-Step Functional Scale', key: 'neutral', steps: compiled.neutralScale },
              { label: 'Accent 12-Step Functional Scale', key: 'accent', steps: compiled.accentScale },
            ] as const
          ).map((ramp) => (
            <div
              key={ramp.key}
              className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3.5"
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                  {ramp.label}
                </span>
                <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                  Click any swatch to copy hex
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
                {ramp.steps.map((swatch) => {
                  const swatchCopyId = `${ramp.key}-${swatch.step}`;
                  const isCopied = copiedKey === swatchCopyId;
                  const onDark = Math.abs(computeApcaLc('#FFFFFF', swatch.hex));
                  const onLight = Math.abs(computeApcaLc('#0A0B0D', swatch.hex));
                  const labelColor = onDark >= onLight ? '#FFFFFF' : '#0A0B0D';

                  return (
                    <button
                      key={swatchCopyId}
                      type="button"
                      onClick={() => handleCopy(swatch.hex, swatchCopyId)}
                      title={`Step ${swatch.step} (${swatch.role}) · ${swatch.hex} · ${swatch.cssOklch}`}
                      className="group flex flex-col overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] text-left transition-transform hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
                    >
                      <div
                        className="flex h-11 w-full items-start justify-between p-1.5"
                        style={{ backgroundColor: swatch.hex, color: labelColor }}
                      >
                        <span className="font-mono text-[10px] font-bold leading-none">
                          {swatch.step}
                        </span>
                        {isCopied && <Check className="h-3 w-3 shrink-0" />}
                      </div>
                      <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
                        <span className="truncate font-mono text-[10px] font-medium text-[var(--ink-primary)]">
                          {isCopied ? 'Copied' : swatch.hex}
                        </span>
                        <span className="truncate font-mono text-[9px] text-[var(--ink-muted)]">
                          {swatch.l.toFixed(2)}/{swatch.c.toFixed(2)}/{swatch.h}°
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* 4. APCA Lc Contrast Audit Matrix + Live Miniature UI Preview */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* APCA Audit Table */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3.5 lg:col-span-7">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--emerald)]" />
                <span>APCA Lc Contrast Audit Matrix</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--ink-secondary)]">
                {repairedCount > 0 ? `${repairedCount} auto-repaired` : 'All pairs verified'}
              </span>
            </div>

            <div className="flex flex-col divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)]">
              {compiled.apcaAudit.map((row) => {
                const isPass = row.status === 'PASS';
                const isRepaired = row.status === 'AUTO-REPAIRED';
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-[12px]"
                  >
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <span
                        className="flex h-6 w-8 shrink-0 items-center justify-center rounded border border-white/15 font-mono text-[10px] font-bold"
                        style={{ backgroundColor: row.bgHex, color: row.fgHex }}
                      >
                        Aa
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11px] font-medium text-[var(--ink-primary)]">
                          {row.label}
                        </div>
                        <div className="truncate font-mono text-[9px] text-[var(--ink-muted)]">
                          {row.fgHex} on {row.bgHex}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2 text-right font-mono text-[11px] font-semibold text-[var(--ink-primary)]">
                      Lc {row.lc >= 0 ? `+${row.lc.toFixed(1)}` : row.lc.toFixed(1)}
                    </div>

                    <div className="col-span-2 text-right font-mono text-[11px] text-[var(--ink-secondary)]">
                      {row.wcagRatio.toFixed(1)}:1
                    </div>

                    <div className="col-span-3 flex justify-end">
                      <span
                        className="rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.04em]"
                        style={{
                          backgroundColor: isPass
                            ? 'var(--emerald-bg)'
                            : isRepaired
                              ? 'var(--amber-bg)'
                              : 'var(--vermilion-bg)',
                          borderColor: isPass
                            ? 'var(--emerald-border)'
                            : isRepaired
                              ? 'var(--amber-border)'
                              : 'var(--vermilion-border)',
                          color: isPass
                            ? 'var(--emerald)'
                            : isRepaired
                              ? 'var(--amber)'
                              : 'var(--vermilion)',
                        }}
                      >
                        {row.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Miniature UI Preview Card (CVD-filterable) */}
          <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3.5 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                Live UI Token Preview
              </span>
              <span className="rounded-full border border-[var(--border-pill)] bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-secondary)]">
                {cvdMode === 'normal' ? 'Normal Vision' : `CVD: ${cvdMode}`}
              </span>
            </div>

            <div
              className="flex flex-1 flex-col justify-between gap-3 rounded-xl border p-4 transition-colors"
              style={{
                ...cvdFilterStyle,
                backgroundColor: compiled.semantic.canvas,
                borderColor: compiled.semantic.border,
                color: compiled.semantic.inkPrimary,
                fontFamily: `"${fontPairing.body}", -apple-system, BlinkMacSystemFont, sans-serif`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{
                    backgroundColor: compiled.semantic.accentSoft,
                    color: compiled.semantic.accent,
                    fontFamily: `"${fontPairing.mono}", ui-monospace, monospace`,
                  }}
                >
                  {compiled.polarity} · OKLCH
                </span>
                <span
                  className="truncate text-[10px]"
                  style={{
                    color: compiled.semantic.inkSecondary,
                    fontFamily: `"${fontPairing.mono}", ui-monospace, monospace`,
                  }}
                >
                  {fontPairing.display} · {activeTypographyPairing?.scaleRatio ?? 1.25}×
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <h3
                  className="text-[22px] font-semibold leading-tight"
                  style={{
                    color: compiled.semantic.inkPrimary,
                    fontFamily: `"${fontPairing.display}", Georgia, serif`,
                    letterSpacing: activeTypographyPairing?.h1Tracking ?? '-0.02em',
                    fontOpticalSizing: activeTypographyPairing?.opticalSizing ? 'auto' : 'none',
                  }}
                >
                  Editorial Precision at Scale
                </h3>
                <p
                  className="text-[12px] leading-relaxed"
                  style={{
                    color: compiled.semantic.inkSecondary,
                    fontFamily: `"${fontPairing.body}", -apple-system, BlinkMacSystemFont, sans-serif`,
                  }}
                >
                  Every surface, border, and ink pairing is mathematically verified against APCA perceptual lightness contrast.
                </p>
              </div>

              <div
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                style={{
                  backgroundColor: compiled.semantic.surface,
                  borderColor: compiled.semantic.border,
                }}
              >
                <div className="min-w-0">
                  <div
                    className="text-[10px] uppercase tracking-[0.05em]"
                    style={{
                      color: compiled.semantic.inkSecondary,
                      fontFamily: `"${fontPairing.mono}", ui-monospace, monospace`,
                    }}
                  >
                    Contrast Score · {activeTypographyPairing?.h1Tracking ?? '-0.02em'}
                  </div>
                  <div
                    className="text-[14px] font-semibold"
                    style={{
                      color: compiled.semantic.inkPrimary,
                      fontFamily: `"${fontPairing.mono}", ui-monospace, monospace`,
                    }}
                  >
                    Lc {Math.abs(compiled.apcaAudit[0]?.lc ?? 90).toFixed(1)}
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: compiled.semantic.accent,
                    color: compiled.semantic.accentContrast,
                    fontFamily: `"${fontPairing.body}", -apple-system, BlinkMacSystemFont, sans-serif`,
                  }}
                >
                  Primary CTA
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 5. W3C tokens.json / tokens.css / Tailwind v4 @theme Code Tabs */}
        <section
          aria-label="Design Token Code Exports"
          className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <Code2 className="mr-1 h-3.5 w-3.5 text-[var(--cobalt-bright)]" />
              {(
                [
                  { id: 'tokens.json', label: 'W3C tokens.json' },
                  { id: 'tokens.css', label: 'tokens.css' },
                  { id: 'tailwind', label: 'Tailwind v4 @theme' },
                ] as const
              ).map((tab) => {
                const active = activeCodeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCodeTab(tab.id)}
                    className="rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--cobalt-tint-strong)' : 'transparent',
                      borderColor: active ? 'var(--cobalt-border-strong)' : 'transparent',
                      color: active ? 'var(--ink-primary)' : 'var(--ink-secondary)',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleCopy(activeCodeContent, `code-${activeCodeTab}`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
            >
              {copiedKey === `code-${activeCodeTab}` ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[var(--emerald)]" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Code
                </>
              )}
            </button>
          </div>

          <pre className="studio-scroll max-h-52 overflow-auto bg-[var(--bg-card)] p-3.5 font-mono text-[11px] leading-relaxed text-[var(--ink-secondary)]">
            <code>{activeCodeContent}</code>
          </pre>
        </section>

        {/* Footer CTA */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2 text-[12px] text-[var(--ink-secondary)]">
              <Sparkles className="h-4 w-4 shrink-0 text-[var(--cobalt-bright)]" />
              <span className="truncate">
                APCA-verified OKLCH tokens +{' '}
                <strong className="font-medium text-[var(--ink-primary)]">
                  {activeTypographyPairing?.name ?? fontPairing.display}
                </strong>{' '}
                ({fontPairing.display} / {fontPairing.body})
              </span>
            </div>
            {instantMessage && (
              <span
                className="pl-6 font-mono text-[10px]"
                style={{
                  color: instantStatus === 'error' ? 'var(--vermilion)' : 'var(--emerald)',
                }}
              >
                {instantMessage}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isApplyingInstant}
              onClick={() => void handleApplyInstantLook()}
              className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[12px] font-semibold transition-colors disabled:opacity-60"
              style={{
                backgroundColor:
                  instantStatus === 'applied' ? 'var(--emerald-bg)' : 'var(--cobalt-tint)',
                borderColor:
                  instantStatus === 'applied'
                    ? 'var(--emerald-border)'
                    : 'var(--cobalt-border-strong)',
                color:
                  instantStatus === 'applied' ? 'var(--emerald)' : 'var(--ink-primary)',
              }}
            >
              {isApplyingInstant ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : instantStatus === 'applied' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Zap className="h-3.5 w-3.5 text-[var(--cobalt-bright)]" />
              )}
              <span>
                {isApplyingInstant
                  ? 'Applying…'
                  : instantStatus === 'applied'
                    ? 'Applied Live (0ms)'
                    : '⚡ Instant Live Preview (0ms)'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleApplyToApp}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-5 py-2.5 text-[13px] font-semibold text-[var(--btn-primary-ink)] shadow-[var(--cobalt-glow)] transition-colors hover:bg-[var(--btn-primary-hover)]"
            >
              <span>Apply Full AI Redesign</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </NativeDialog>
  );
}
