import type { Page } from 'puppeteer';
import {
  enforceApcaPalette,
  generate12StepScale,
  hexToOklch,
  oklchToHex,
  type PaletteTokensInput,
} from './colorKernel.js';

export type SwatchRole = 'canvas' | 'surface' | 'accent' | 'secondary_accent' | 'ink';

export interface ExtractedSwatch {
  hex: string;
  oklch: { l: number; c: number; h: number };
  weight: number;
  role: SwatchRole;
}

export interface ImagePaletteExtractionResult {
  mode: 'light' | 'dark';
  seedNeutralHex: string;
  seedAccentHex: string;
  swatches: ExtractedSwatch[];
  palette: PaletteTokensInput;
  latencyMs: number;
}

interface OklabPoint {
  l: number;
  a: number;
  b: number;
}

interface ClusterSummary {
  centroid: OklabPoint;
  hex: string;
  oklch: { l: number; c: number; h: number };
  chroma: number;
  weight: number;
  count: number;
}

const CLUSTER_COUNT = 6;
const KMEANS_ITERATIONS = 12;
const FIXED_PRNG_SEED = 0x5f3759df;
const CANVAS_SAMPLE_SIZE = 64;
const LOW_CHROMA_THRESHOLD = 0.06;

// ---------------------------------------------------------------------------
// Pure-math sRGB -> Oklab conversion (Björn Ottosson / IEC 61966-2-1)
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function srgbByteToLinear(channel: number): number {
  const s = clamp(channel / 255, 0, 1);
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function rgbToOklab(r: number, g: number, b: number): OklabPoint {
  const lr = srgbByteToLinear(r);
  const lg = srgbByteToLinear(g);
  const lb = srgbByteToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const lCube = Math.cbrt(l);
  const mCube = Math.cbrt(m);
  const sCube = Math.cbrt(s);

  return {
    l: 0.2104542553 * lCube + 0.793617785 * mCube - 0.0040720468 * sCube,
    a: 1.9779984951 * lCube - 2.428592205 * mCube + 0.4505937099 * sCube,
    b: 0.0259040371 * lCube + 0.7827717662 * mCube - 0.808675766 * sCube,
  };
}

function oklabDistanceSq(p: OklabPoint, q: OklabPoint): number {
  const dl = p.l - q.l;
  const da = p.a - q.a;
  const db = p.b - q.b;
  return dl * dl + da * da + db * db;
}

function oklabToOklch(p: OklabPoint): { l: number; c: number; h: number } {
  const c = Math.sqrt(p.a * p.a + p.b * p.b);
  const rawHue = (Math.atan2(p.b, p.a) * 180) / Math.PI;
  const h = rawHue < 0 ? rawHue + 360 : rawHue;
  return {
    l: clamp(p.l, 0, 1),
    c,
    h: Number.isFinite(h) ? h : 0,
  };
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (Mulberry32) for reproducible k-means++ seeding
// ---------------------------------------------------------------------------

function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initKmeansPlusPlus(points: readonly OklabPoint[], k: number): OklabPoint[] {
  const rng = createDeterministicRng(FIXED_PRNG_SEED);
  const n = points.length;
  const centroids: OklabPoint[] = [];

  const firstIdx = Math.floor(rng() * n);
  centroids.push({ ...points[firstIdx] });

  const minDistSq = new Float64Array(n);
  minDistSq.fill(Number.POSITIVE_INFINITY);

  for (let c = 1; c < k; c += 1) {
    const latest = centroids[c - 1];
    let totalDistSq = 0;

    for (let i = 0; i < n; i += 1) {
      const d2 = oklabDistanceSq(points[i], latest);
      if (d2 < minDistSq[i]) {
        minDistSq[i] = d2;
      }
      totalDistSq += minDistSq[i];
    }

    if (totalDistSq <= 1e-12) {
      const fallbackIdx = (firstIdx + c) % n;
      centroids.push({ ...points[fallbackIdx] });
      continue;
    }

    const threshold = rng() * totalDistSq;
    let cumulative = 0;
    let chosenIdx = n - 1;
    for (let i = 0; i < n; i += 1) {
      cumulative += minDistSq[i];
      if (cumulative >= threshold) {
        chosenIdx = i;
        break;
      }
    }
    centroids.push({ ...points[chosenIdx] });
  }

  return centroids;
}

function runDeterministicKmeans(
  points: readonly OklabPoint[],
  k: number,
  iterations: number,
): { centroids: OklabPoint[]; counts: number[] } {
  const centroids = initKmeansPlusPlus(points, k);
  const n = points.length;
  const assignments = new Int32Array(n);
  const counts = new Array<number>(k).fill(0);

  for (let iter = 0; iter < iterations; iter += 1) {
    const sumL = new Float64Array(k);
    const sumA = new Float64Array(k);
    const sumB = new Float64Array(k);
    counts.fill(0);

    for (let i = 0; i < n; i += 1) {
      const pt = points[i];
      let bestCluster = 0;
      let bestDist = oklabDistanceSq(pt, centroids[0]);

      for (let c = 1; c < k; c += 1) {
        const d2 = oklabDistanceSq(pt, centroids[c]);
        if (d2 < bestDist) {
          bestDist = d2;
          bestCluster = c;
        }
      }

      assignments[i] = bestCluster;
      counts[bestCluster] += 1;
      sumL[bestCluster] += pt.l;
      sumA[bestCluster] += pt.a;
      sumB[bestCluster] += pt.b;
    }

    for (let c = 0; c < k; c += 1) {
      if (counts[c] > 0) {
        centroids[c] = {
          l: sumL[c] / counts[c],
          a: sumA[c] / counts[c],
          b: sumB[c] / counts[c],
        };
      }
    }
  }

  return { centroids, counts };
}

function computeWeightedMedianLightness(clusters: readonly ClusterSummary[]): number {
  const sorted = [...clusters].sort((a, b) => a.centroid.l - b.centroid.l);
  let cumulativeWeight = 0;
  for (const cluster of sorted) {
    cumulativeWeight += cluster.weight;
    if (cumulativeWeight >= 0.5) {
      return cluster.centroid.l;
    }
  }
  return sorted[sorted.length - 1]?.centroid.l ?? 0.5;
}

// ---------------------------------------------------------------------------
// Pure-Math Oklab Pixel-to-Palette Clustering
// ---------------------------------------------------------------------------

export function clusterRgbPixelsInOklab(
  pixels: Array<[number, number, number]>,
  modeHint?: 'light' | 'dark',
): ImagePaletteExtractionResult {
  const startMs = performance.now();

  const safePixels: Array<[number, number, number]> =
    pixels.length > 0
      ? pixels
      : [
          [248, 249, 250],
          [233, 236, 239],
          [33, 37, 41],
          [59, 130, 246],
          [99, 102, 241],
          [108, 117, 125],
        ];

  const points: OklabPoint[] = new Array(safePixels.length);
  for (let i = 0; i < safePixels.length; i += 1) {
    const [r, g, b] = safePixels[i];
    points[i] = rgbToOklab(r, g, b);
  }

  const { centroids, counts } = runDeterministicKmeans(points, CLUSTER_COUNT, KMEANS_ITERATIONS);
  const totalPixels = safePixels.length;

  const clusters: ClusterSummary[] = centroids.map((centroid, idx) => {
    const rawOklch = oklabToOklch(centroid);
    const hex = oklchToHex(rawOklch);
    const oklch = hexToOklch(hex);
    const count = counts[idx];
    return {
      centroid,
      hex,
      oklch,
      chroma: rawOklch.c,
      weight: totalPixels > 0 ? count / totalPixels : 0,
      count,
    };
  });

  // Determine light vs dark polarity from weighted median L unless modeHint is provided
  const weightedMedianL = computeWeightedMedianLightness(clusters);
  const mode: 'light' | 'dark' = modeHint ?? (weightedMedianL >= 0.5 ? 'light' : 'dark');

  // 1. Pick seedNeutralHex: highest-weight low-chroma cluster
  let neutralIdx = 0;
  const lowChromaIndices = clusters
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => c.chroma <= LOW_CHROMA_THRESHOLD && c.weight > 0);

  if (lowChromaIndices.length > 0) {
    lowChromaIndices.sort((a, b) => b.c.weight - a.c.weight || a.c.chroma - b.c.chroma);
    neutralIdx = lowChromaIndices[0].idx;
  } else {
    // Fallback: pick cluster with lowest chroma-to-weight ratio
    let bestNeutralScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < clusters.length; i += 1) {
      const score = clusters[i].chroma / Math.max(Math.sqrt(clusters[i].weight), 0.05);
      if (score < bestNeutralScore) {
        bestNeutralScore = score;
        neutralIdx = i;
      }
    }
  }

  // 2. Pick seedAccentHex: highest perceptual-salience chroma cluster: C * sqrt(weight)
  let accentIdx = 0;
  let bestSalience = -1;
  for (let i = 0; i < clusters.length; i += 1) {
    const salience = clusters[i].chroma * Math.sqrt(clusters[i].weight);
    if (salience > bestSalience) {
      bestSalience = salience;
      accentIdx = i;
    }
  }

  // Avoid accent === neutral when another chromatic cluster exists
  if (accentIdx === neutralIdx) {
    let altAccentIdx = -1;
    let altBestSalience = -1;
    for (let i = 0; i < clusters.length; i += 1) {
      if (i === neutralIdx) continue;
      const salience = clusters[i].chroma * Math.sqrt(clusters[i].weight);
      if (salience > altBestSalience) {
        altBestSalience = salience;
        altAccentIdx = i;
      }
    }
    if (altAccentIdx !== -1 && altBestSalience > 0) {
      accentIdx = altAccentIdx;
    }
  }

  const seedNeutralHex = clusters[neutralIdx].hex;
  const seedAccentHex = clusters[accentIdx].hex;

  // Assign semantic roles to all 6 extracted swatches
  const roles = new Array<SwatchRole>(clusters.length).fill('surface');
  roles[neutralIdx] = 'canvas';
  roles[accentIdx] = 'accent';

  const unassignedIndices = (): number[] => {
    const res: number[] = [];
    for (let i = 0; i < clusters.length; i += 1) {
      if (i !== neutralIdx && i !== accentIdx && roles[i] === 'surface') {
        res.push(i);
      }
    }
    return res;
  };

  // Secondary accent: next highest salience chromatic cluster
  let secondaryAccentIdx = -1;
  let bestSecondarySalience = -1;
  for (const idx of unassignedIndices()) {
    const salience = clusters[idx].chroma * Math.sqrt(clusters[idx].weight);
    if (salience > bestSecondarySalience) {
      bestSecondarySalience = salience;
      secondaryAccentIdx = idx;
    }
  }
  if (secondaryAccentIdx !== -1) {
    roles[secondaryAccentIdx] = 'secondary_accent';
  }

  // Ink: cluster with highest lightness contrast opposite to mode polarity
  let inkIdx = -1;
  let bestInkScore = -1;
  for (const idx of unassignedIndices()) {
    const l = clusters[idx].oklch.l;
    const contrastScore = mode === 'light' ? 1 - l : l;
    if (contrastScore > bestInkScore) {
      bestInkScore = contrastScore;
      inkIdx = idx;
    }
  }
  if (inkIdx !== -1) {
    roles[inkIdx] = 'ink';
  }

  const swatches: ExtractedSwatch[] = clusters
    .map((cluster, idx): ExtractedSwatch => ({
      hex: cluster.hex,
      oklch: {
        l: roundTo(cluster.oklch.l, 4),
        c: roundTo(cluster.oklch.c, 4),
        h: roundTo(cluster.oklch.h, 2),
      },
      weight: roundTo(cluster.weight, 4),
      role: roles[idx],
    }))
    .sort((a, b) => b.weight - a.weight);

  // Build 12-step functional scales and enforce APCA-W3 contrast guarantees
  const neutralScale = generate12StepScale(seedNeutralHex, mode, 0.35);
  const accentScale = generate12StepScale(seedAccentHex, mode);

  const accentStep9 = accentScale.steps[8];
  const rawPalette: PaletteTokensInput = {
    canvas: neutralScale.steps[0].hex,
    surface: neutralScale.steps[1].hex,
    surfaceMuted: neutralScale.steps[2].hex,
    inkPrimary: neutralScale.steps[11].hex,
    inkSecondary: neutralScale.steps[10].hex,
    accent: accentStep9.hex,
    accentContrast: accentStep9.oklch.l > 0.62 ? '#111111' : '#FFFFFF',
    borderSubtle: neutralScale.steps[5].hex,
  };

  const { repaired } = enforceApcaPalette(rawPalette);
  const latencyMs = roundTo(performance.now() - startMs, 2);

  return {
    mode,
    seedNeutralHex,
    seedAccentHex,
    swatches,
    palette: repaired,
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Puppeteer Offscreen Canvas Base64 Image Pixel Extractor
// ---------------------------------------------------------------------------

export async function extractPaletteFromImageBase64(
  page: Page,
  imageBase64: string,
  mimeType = 'image/png',
  modeHint?: 'light' | 'dark',
): Promise<ImagePaletteExtractionResult> {
  const startMs = performance.now();

  const trimmed = imageBase64.trim();
  const dataUri = trimmed.startsWith('data:')
    ? trimmed
    : `data:${mimeType};base64,${trimmed}`;

  const pixels = await page.evaluate(
    async (src: string, size: number): Promise<Array<[number, number, number]>> => {
      return new Promise<Array<[number, number, number]>>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
              reject(new Error('Failed to acquire 2D canvas context for color extraction'));
              return;
            }
            ctx.drawImage(img, 0, 0, size, size);
            const { data } = ctx.getImageData(0, 0, size, size);
            const sampled: Array<[number, number, number]> = [];
            for (let i = 0; i < data.length; i += 4) {
              const alpha = data[i + 3];
              if (alpha >= 16) {
                sampled.push([data[i], data[i + 1], data[i + 2]]);
              }
            }
            resolve(sampled);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        };
        img.onerror = () => {
          reject(new Error('Failed to decode base64 image in offscreen canvas'));
        };
        img.src = src;
      });
    },
    dataUri,
    CANVAS_SAMPLE_SIZE,
  );

  const result = clusterRgbPixelsInOklab(pixels, modeHint);
  return {
    ...result,
    latencyMs: roundTo(performance.now() - startMs, 2),
  };
}
