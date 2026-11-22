/**
 * Sanzo Wada 348 Color Combinations Engine (A Dictionary of Color Combinations, Vol. 1)
 *
 * Lazily parses and caches the MIT-licensed 159-swatch / 348-combination dataset,
 * computes OKLCH perceptual coordinates, derives mood tags and seed tokens, and
 * compiles any combination into a 100% APCA-verified AntiSlop v2 Design System.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKEND_ROOT, REPO_ROOT } from '../config/env.js';
import { hexToOklch, normalizeHex } from './colorKernel.js';
import {
  compileDesignTokens,
  type CompiledDesignSystem,
} from './tokenCompiler.js';
import {
  resolveVerifiedTypography,
  type VerifiedTypographyPairing,
} from './typographyKernel.js';

export interface SanzoWadaSwatch {
  name: string;
  hex: string;
  rgb: [number, number, number];
  lab: [number, number, number];
  oklch: { l: number; c: number; h: number };
}

export interface SanzoWadaCombination {
  id: number;
  name: string;
  size: 2 | 3 | 4;
  swatches: SanzoWadaSwatch[];
  moodTags: string[];
  suggestedMode: 'light' | 'dark';
  seedNeutralHex: string;
  seedAccentHex: string;
}

export interface SanzoWadaSearchOptions {
  q?: string;
  size?: 2 | 3 | 4;
  mood?: string;
  limit?: number;
  offset?: number;
}

export interface SanzoWadaSearchResult {
  total: number;
  filteredTotal: number;
  combinations: SanzoWadaCombination[];
}

export interface SanzoWadaCompiledDesignSystem {
  combination: SanzoWadaCombination;
  pairing: VerifiedTypographyPairing;
  compiled: CompiledDesignSystem;
}

interface RawSanzoWadaEntry {
  name: string;
  combinations: number[];
  swatch: number;
  cmyk: [number, number, number, number];
  lab: [number, number, number];
  rgb: [number, number, number];
  hex: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedCombinations: SanzoWadaCombination[] | null = null;
let cachedById: Map<number, SanzoWadaCombination> | null = null;

function resolveDatasetPath(): string {
  const candidates = [
    path.join(BACKEND_ROOT, 'src', 'design', 'data', 'sanzo-wada-colors.json'),
    path.join(REPO_ROOT, 'backend', 'src', 'design', 'data', 'sanzo-wada-colors.json'),
    path.join(__dirname, 'data', 'sanzo-wada-colors.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Sanzo Wada dataset not found. Checked:\n${candidates.map((c) => `  - ${c}`).join('\n')}`,
  );
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toSwatch(raw: RawSanzoWadaEntry): SanzoWadaSwatch {
  const hex = normalizeHex(raw.hex);
  const oklch = hexToOklch(hex);
  return {
    name: raw.name.trim(),
    hex,
    rgb: [raw.rgb[0], raw.rgb[1], raw.rgb[2]],
    lab: [round(raw.lab[0], 3), round(raw.lab[1], 3), round(raw.lab[2], 3)],
    oklch: {
      l: round(oklch.l, 4),
      c: round(oklch.c, 4),
      h: round(oklch.h, 2),
    },
  };
}

function pickSeedNeutral(swatches: SanzoWadaSwatch[]): SanzoWadaSwatch {
  let best = swatches[0];
  let bestScore = -Infinity;

  for (const swatch of swatches) {
    const lowChromaScore = 1 - Math.min(swatch.oklch.c / 0.16, 1);
    const extremeLightnessScore = Math.abs(swatch.oklch.l - 0.5) * 2;
    const score = lowChromaScore * 0.68 + extremeLightnessScore * 0.32;
    if (score > bestScore) {
      bestScore = score;
      best = swatch;
    }
  }

  return best;
}

function pickSeedAccent(
  swatches: SanzoWadaSwatch[],
  neutralSwatch: SanzoWadaSwatch,
): SanzoWadaSwatch {
  let best = swatches[0];
  let maxChroma = -Infinity;

  for (const swatch of swatches) {
    if (swatch.oklch.c > maxChroma) {
      maxChroma = swatch.oklch.c;
      best = swatch;
    }
  }

  // If the highest-chroma swatch also won neutral (e.g. near-monochrome combo),
  // prefer the highest-chroma distinct swatch so neutral and accent diverge.
  if (best.hex === neutralSwatch.hex && swatches.length > 1) {
    let fallback: SanzoWadaSwatch | null = null;
    let fallbackScore = -Infinity;
    for (const swatch of swatches) {
      if (swatch.hex === neutralSwatch.hex) continue;
      const lightnessDelta = Math.abs(swatch.oklch.l - neutralSwatch.oklch.l);
      const score = swatch.oklch.c * 2 + lightnessDelta;
      if (score > fallbackScore) {
        fallbackScore = score;
        fallback = swatch;
      }
    }
    if (fallback) return fallback;
  }

  return best;
}

function deriveSuggestedMode(swatches: SanzoWadaSwatch[]): 'light' | 'dark' {
  let minL = Infinity;
  let sumL = 0;

  for (const swatch of swatches) {
    if (swatch.oklch.l < minL) minL = swatch.oklch.l;
    sumL += swatch.oklch.l;
  }

  const meanL = sumL / swatches.length;
  return minL < 0.32 && meanL < 0.55 ? 'dark' : 'light';
}

function deriveMoodTags(
  swatches: SanzoWadaSwatch[],
  suggestedMode: 'light' | 'dark',
): string[] {
  const tags = new Set<string>();
  const count = swatches.length;

  let minL = Infinity;
  let maxL = -Infinity;
  let sumL = 0;
  let maxC = -Infinity;
  let sumC = 0;

  let warmCount = 0;
  let coolCount = 0;
  let earthyHueCount = 0;
  let chromaticCount = 0;
  let hasNeutral = false;

  for (const { oklch } of swatches) {
    const { l, c, h } = oklch;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
    sumL += l;

    if (c > maxC) maxC = c;
    sumC += c;

    if (c < 0.045) {
      hasNeutral = true;
    } else {
      chromaticCount += 1;
      if (h < 105 || h >= 325) {
        warmCount += 1;
      } else if (h >= 135 && h < 310) {
        coolCount += 1;
      }
      if (h >= 15 && h <= 135 && c <= 0.13) {
        earthyHueCount += 1;
      }
    }
  }

  const meanL = sumL / count;
  const meanC = sumC / count;
  const contrastSpan = maxL - minL;

  if (chromaticCount > 0) {
    if (warmCount >= coolCount && warmCount > 0) {
      tags.add('warm');
    }
    if (coolCount >= warmCount && coolCount > 0) {
      tags.add('cool');
    }
  }

  if (
    earthyHueCount > 0 &&
    meanC >= 0.025 &&
    meanC <= 0.115 &&
    meanL <= 0.72
  ) {
    tags.add('earthy');
  }

  if (maxC >= 0.145 || meanC >= 0.11) {
    tags.add('vibrant');
  }

  if (meanC < 0.075 && maxC < 0.115) {
    tags.add('muted');
  }

  if (meanL >= 0.72 && minL >= 0.52 && maxC <= 0.14) {
    tags.add('pastel');
  }

  if (suggestedMode === 'dark' || meanL < 0.44) {
    tags.add('dark');
  }

  if (contrastSpan >= 0.44) {
    tags.add('high-contrast');
  }

  if (
    (count >= 3 && contrastSpan >= 0.3 && meanC <= 0.125) ||
    (hasNeutral && maxC >= 0.07 && contrastSpan >= 0.28)
  ) {
    tags.add('editorial');
  }

  if (tags.size === 0) {
    tags.add('editorial');
  }

  return Array.from(tags);
}

function buildCombinationName(id: number, swatches: SanzoWadaSwatch[]): string {
  const topTwo = swatches
    .slice(0, 2)
    .map((s) => s.name)
    .join(' & ');
  return `Combo #${id} · ${topTwo}`;
}

function toCombinationSize(length: number): 2 | 3 | 4 {
  if (length <= 2) return 2;
  if (length === 3) return 3;
  return 4;
}

function ensureLoaded(): {
  list: SanzoWadaCombination[];
  byId: Map<number, SanzoWadaCombination>;
} {
  if (cachedCombinations && cachedById) {
    return { list: cachedCombinations, byId: cachedById };
  }

  const datasetPath = resolveDatasetPath();
  const rawJson = fs.readFileSync(datasetPath, 'utf8');
  const entries = JSON.parse(rawJson) as RawSanzoWadaEntry[];

  const grouped = new Map<number, SanzoWadaSwatch[]>();

  for (const entry of entries) {
    const swatch = toSwatch(entry);
    for (const comboId of entry.combinations) {
      let list = grouped.get(comboId);
      if (!list) {
        list = [];
        grouped.set(comboId, list);
      }
      list.push(swatch);
    }
  }

  const sortedIds = Array.from(grouped.keys()).sort((a, b) => a - b);
  const combinations: SanzoWadaCombination[] = [];
  const byId = new Map<number, SanzoWadaCombination>();

  for (const id of sortedIds) {
    const swatches = grouped.get(id);
    if (!swatches || swatches.length === 0) continue;

    const suggestedMode = deriveSuggestedMode(swatches);
    const neutralSwatch = pickSeedNeutral(swatches);
    const accentSwatch = pickSeedAccent(swatches, neutralSwatch);
    const moodTags = deriveMoodTags(swatches, suggestedMode);

    const combination: SanzoWadaCombination = {
      id,
      name: buildCombinationName(id, swatches),
      size: toCombinationSize(swatches.length),
      swatches,
      moodTags,
      suggestedMode,
      seedNeutralHex: neutralSwatch.hex,
      seedAccentHex: accentSwatch.hex,
    };

    combinations.push(combination);
    byId.set(id, combination);
  }

  cachedCombinations = combinations;
  cachedById = byId;

  return { list: combinations, byId };
}

export function listSanzoWadaCombinations(
  opts?: SanzoWadaSearchOptions,
): SanzoWadaSearchResult {
  const { list } = ensureLoaded();
  let filtered = list;

  if (opts?.size !== undefined) {
    filtered = filtered.filter((combo) => combo.size === opts.size);
  }

  if (opts?.mood) {
    const targetMood = opts.mood.trim().toLowerCase();
    if (targetMood) {
      filtered = filtered.filter((combo) =>
        combo.moodTags.some((tag) => tag.toLowerCase() === targetMood),
      );
    }
  }

  if (opts?.q) {
    const terms = opts.q
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 0);

    if (terms.length > 0) {
      filtered = filtered.filter((combo) => {
        const haystack = [
          String(combo.id),
          `#${combo.id}`,
          combo.name,
          combo.suggestedMode,
          ...combo.moodTags,
          ...combo.swatches.flatMap((s) => [s.name, s.hex]),
        ]
          .join(' ')
          .toLowerCase();

        return terms.every((term) => haystack.includes(term));
      });
    }
  }

  const filteredTotal = filtered.length;
  const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
  const limit =
    opts?.limit !== undefined
      ? Math.max(0, Math.floor(opts.limit))
      : filteredTotal;

  const combinations = filtered.slice(offset, offset + limit);

  return {
    total: list.length,
    filteredTotal,
    combinations,
  };
}

export function getSanzoWadaCombination(
  id: number,
): SanzoWadaCombination | undefined {
  if (!Number.isInteger(id) || id <= 0) return undefined;
  const { byId } = ensureLoaded();
  return byId.get(id);
}

export function compileSanzoWadaToDesignSystem(
  id: number,
  modeOverride?: 'light' | 'dark',
  pairingId?: string,
): SanzoWadaCompiledDesignSystem {
  const combination = getSanzoWadaCombination(id);
  if (!combination) {
    throw new Error(
      `Sanzo Wada combination #${id} not found (valid range: 1..348).`,
    );
  }

  const mode = modeOverride ?? combination.suggestedMode;
  const pairing = resolveVerifiedTypography({
    pairingId,
    mood: combination.moodTags.join(' '),
  });

  const compiled = compileDesignTokens({
    name: combination.name,
    mode,
    seedNeutralHex: combination.seedNeutralHex,
    seedAccentHex: combination.seedAccentHex,
    typography: {
      displayFont: pairing.displayFont,
      bodyFont: pairing.bodyFont,
      monoFont: pairing.monoFont,
      googleFontsUrl: pairing.primaryGoogleFontsUrl,
    },
  });

  return {
    combination,
    pairing,
    compiled,
  };
}
