import type { Decisions } from '@google/genai';
import { ENV } from '../config/env.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';
import { normalizeMimeType, stripDataUriPrefix } from './mediaUtils.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ZoomTileRegion {
  row: number;
  col: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  coarseProb: number;
}

export interface MicroCraftCheck {
  key: string;
  label: string;
  passProb: number;
  passed: boolean;
}

export interface ZoomTileReport {
  region: ZoomTileRegion;
  microScore: number;
  checks: MicroCraftCheck[];
  failingChecks: MicroCraftCheck[];
}

export interface CoarseFineXrayResult {
  totalMicroProbes: number;
  zoomedTiles: ZoomTileReport[];
  worstRegion: ZoomTileReport | null;
  pixelSurgicalPrompt: string;
  latencyMs: number;
  outputTokens: 0;
}

// ============================================================================
// 16 Micro-Craft Calibrated Noul Probes (2x DPR Inspection)
// ============================================================================

interface MicroCraftProbeSpec {
  key: string;
  label: string;
  passThreshold: number;
  instructions: string;
  criteria: Decisions.NoulCriteria;
  cssFix: string;
}

const MAX_ZOOM_TILES = 4;

const MICRO_CRAFT_PROBES: readonly MicroCraftProbeSpec[] = [
  {
    key: 'glyph_kerning_tracking',
    label: 'Glyph Kerning & Tracking Discipline',
    passThreshold: 0.65,
    instructions:
      'Inspect all visible headings, labels, and body copy at 2x DPR. Is letter-spacing (tracking) and glyph kerning optically balanced without cramped collisions or excessively loose default uppercase tracking?',
    criteria: {
      true_description:
        'Yes — display headings use tight optical tracking, body copy has natural kerning, and uppercase micro-labels have clean, deliberate letter-spacing.',
      false_description:
        'No — glyphs collide, look unevenly spaced, or uppercase labels/headings suffer from uncalibrated default tracking.',
    },
    cssFix:
      'Set `font-kerning: normal; font-feature-settings: "kern" 1, "liga" 1;`, tighten display headings (`letter-spacing: -0.025em`), and give uppercase micro-labels `letter-spacing: 0.08em`.',
  },
  {
    key: 'icon_stroke_weight',
    label: 'Icon Stroke Weight Consistency',
    passThreshold: 0.65,
    instructions:
      'Inspect any icons, arrows, or vector glyphs in this zoomed crop. Do all icons share a consistent stroke weight, visual density, and optical scale relative to adjacent text (or if no icons are present, are all graphic strokes consistent)?',
    criteria: {
      true_description:
        'Yes — icons and graphic marks use uniform stroke weights, crisp vector geometry, and proportional sizing next to text.',
      false_description:
        'No — icons mix mismatched stroke thicknesses, filled vs hairline styles haphazardly, or appear oversized/undersized next to labels.',
    },
    cssFix:
      'Standardize SVG icons to `stroke-width: 1.5px; vector-effect: non-scaling-stroke;` and size icons to `1em`–`1.125em` aligned with adjacent typography.',
  },
  {
    key: 'hairline_crispness',
    label: '1px Hairline & Divider Crispness',
    passThreshold: 0.65,
    instructions:
      'Inspect borders, rules, dividers, and card outlines at 2x DPR. Are 1px hairlines razor-sharp, subtle, and cleanly anti-aliased without muddy double-borders or harsh high-contrast seams?',
    criteria: {
      true_description:
        'Yes — borders and dividers render as crisp, intentional 1px hairlines with refined opacity and zero blurry or doubled edges.',
      false_description:
        'No — borders look muddy, overly heavy, inconsistently double-stacked between adjacent containers, or jaggedly anti-aliased.',
    },
    cssFix:
      'Use `border: 1px solid color-mix(in srgb, currentColor 12%, transparent);` and collapse adjacent seams with `border-collapse` or negative 1px overlap rather than stacked borders.',
  },
  {
    key: 'asymmetric_button_padding',
    label: 'Optical Button & Chip Padding Symmetry',
    passThreshold: 0.65,
    instructions:
      'Inspect interactive buttons, pills, badges, and input controls in this tile. Is internal horizontal and vertical padding optically balanced around text and leading/trailing icons (or if no controls exist, is container padding balanced)?',
    criteria: {
      true_description:
        'Yes — controls have balanced horizontal/vertical padding with optically centered labels and icons.',
      false_description:
        'No — buttons or chips exhibit lopsided top/bottom or left/right padding, cramped label edges, or off-center text.',
    },
    cssFix:
      'Apply symmetric optical padding (`padding-inline: 1rem; padding-block: 0.5625rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; line-height: 1;`).',
  },
  {
    key: 'baseline_alignment',
    label: 'Typographic & Icon Baseline Alignment',
    passThreshold: 0.65,
    instructions:
      'Inspect horizontally adjacent text, icons, prices, badges, and form labels. Do inline elements share a disciplined baseline or optical vertical center without vertical drift?',
    criteria: {
      true_description:
        'Yes — inline labels, icons, metrics, and adjacent columns align cleanly on a shared baseline or optical center.',
      false_description:
        'No — icons float 1–4px too high/low relative to text, or adjacent column labels drift off-baseline.',
    },
    cssFix:
      'Use `display: inline-flex; align-items: center;` for icon-text pairs (with `svg { flex-shrink: 0; display: block; }`) and `align-items: baseline;` for mixed-size typographic metrics.',
  },
  {
    key: 'focus_halo_clarity',
    label: 'Interactive Affordance & Focus Halo Clarity',
    passThreshold: 0.65,
    instructions:
      'Inspect interactive controls, links, inputs, and active/selected states in this crop. Are interactive boundaries, rings, and focus/hover affordances cleanly rendered without clipped focus halos or ambiguous styling?',
    criteria: {
      true_description:
        'Yes — interactive elements have clear, unclipped boundaries and refined focus/active affordances.',
      false_description:
        'No — focus rings/halos are clipped by parent overflow, look harsh/default, or interactive controls lack clear visual affordance.',
    },
    cssFix:
      'Use `outline: 2px solid var(--accent-color); outline-offset: 2px;` on `:focus-visible` and ensure parent wrappers do not clip focus halos with tight `overflow: hidden`.',
  },
  {
    key: 'subpixel_clipping',
    label: 'Zero Sub-Pixel Text or Element Clipping',
    passThreshold: 0.7,
    instructions:
      'Inspect the edges of all text ascenders, descenders (g, y, p, q), italic overhangs, badges, and rounded corners at 2x DPR. Are all elements completely unclipped with zero shaved pixels?',
    criteria: {
      true_description:
        'Yes — zero descenders, ascenders, icons, or borders are clipped by container edges or overflow masks.',
      false_description:
        'No — text descenders, italic glyphs, shadows, or child elements are subtly shaved or clipped at container boundaries.',
    },
    cssFix:
      'Increase `line-height` to at least `1.2` for display text (`1.5` for body), add `padding-block: 0.1em` on gradient-clipped text, and remove unnecessary `overflow: hidden` on tight text wrappers.',
  },
  {
    key: 'contrast_over_texture',
    label: 'Contrast Legibility Over Gradients & Media',
    passThreshold: 0.7,
    instructions:
      'Inspect all foreground text, icons, and micro-labels against their immediate background pixels (including gradients, glassmorphism blur, photography, or tinted surfaces). Does every element maintain crisp WCAG AA legibility?',
    criteria: {
      true_description:
        'Yes — all text and icons maintain strong, effortless legibility (>= 4.5:1 body, >= 3:1 large text) even over textured or gradient regions.',
      false_description:
        'No — text or icons wash out against busy imagery, low-contrast translucent surfaces, or pale tinted backgrounds.',
    },
    cssFix:
      'Add a protective scrim (`background: linear-gradient(to top, rgba(0,0,0,0.68), transparent)`) or raise surface opacity and enforce WCAG AA foreground tokens (`>= 4.5:1` contrast).',
  },
  {
    key: 'border_radius_harmony',
    label: 'Nested Corner Radius Concentricity',
    passThreshold: 0.65,
    instructions:
      'Inspect rounded cards, inner media frames, buttons, and inputs in this tile. Do nested rounded corners follow concentric geometry (inner radius = outer radius - padding) with consistent curvature?',
    criteria: {
      true_description:
        'Yes — nested containers share harmonious, concentric border-radius ratios with zero awkward pinched corner gaps.',
      false_description:
        'No — inner elements use the same or larger radius than their outer container, creating pinched or uneven corner spacing.',
    },
    cssFix:
      'Enforce concentric radii via CSS custom properties: `--r-inner: max(2px, calc(var(--r-outer) - var(--card-pad)));` on nested media and buttons.',
  },
  {
    key: 'typographic_line_height',
    label: 'Line-Height Leading & Vertical Rhythm',
    passThreshold: 0.65,
    instructions:
      'Inspect multi-line headings, paragraphs, and list items in this crop. Is vertical line-height calibrated to font size (tight leading for large display, airy leading for body copy) without cramped or disconnected lines?',
    criteria: {
      true_description:
        'Yes — multi-line text has deliberate, comfortable vertical leading appropriate to its typographic scale.',
      false_description:
        'No — multi-line headings look overly gapped or body lines collide vertically with tight leading.',
    },
    cssFix:
      'Set `line-height: 1.08`–`1.15` for display headings (`>= 32px`), `1.3` for subheadings, and `1.5`–`1.65` for body copy.',
  },
  {
    key: 'badge_pill_proportions',
    label: 'Badge & Tag Micro-Proportions',
    passThreshold: 0.65,
    instructions:
      'Inspect small metadata tags, status pills, eyebrow labels, and kbd/chip elements in this crop. Are they crisply proportioned with balanced cap-height centering and restrained visual weight?',
    criteria: {
      true_description:
        'Yes — micro-badges and eyebrow labels are optically centered, crisp, and subordinate to primary headings.',
      false_description:
        'No — badges look bloated, vertically off-center, or visually overpower primary content.',
    },
    cssFix:
      'Style micro-pills with `font-size: 0.75rem; line-height: 1; padding: 0.3125rem 0.625rem; display: inline-flex; align-items: center; gap: 0.375rem;`.',
  },
  {
    key: 'image_aspect_sharpness',
    label: '2x DPR Asset Sharpness & Aspect Integrity',
    passThreshold: 0.65,
    instructions:
      'Inspect any photography, avatars, logos, or illustrations in this zoomed tile (or crispness of rendered UI surfaces if purely typographic). Are assets sharp at 2x DPR with true aspect ratios and zero stretching, pixelation, or compression artifacts?',
    criteria: {
      true_description:
        'Yes — all visual assets and rendered surfaces are razor-sharp at 2x DPR with undistorted aspect ratios.',
      false_description:
        'No — images appear stretched, squashed, blurry/low-res, or exhibit jagged scaling artifacts.',
    },
    cssFix:
      'Apply `object-fit: cover; aspect-ratio: <natural-ratio>; width: 100%; height: auto;` and serve 2x DPR (`srcset` / SVG) assets.',
  },
  {
    key: 'grid_gutter_precision',
    label: 'Micro-Grid Alignment & Gutter Precision',
    passThreshold: 0.65,
    instructions:
      'Inspect left/right edges, column gutters, and vertical spacing between sibling elements in this tile. Do elements snap cleanly to a shared micro-grid with uniform spacing increments?',
    criteria: {
      true_description:
        'Yes — edges align cleanly on a consistent grid axis and sibling gaps follow a disciplined spacing scale.',
      false_description:
        'No — sibling elements exhibit 2–8px ragged edge misalignment or inconsistent ad-hoc gaps.',
    },
    cssFix:
      'Replace ad-hoc margins with explicit CSS Grid/Flexbox `gap` tokens (`4px`/`8px` rhythm) and align sibling edges to shared container tracks.',
  },
  {
    key: 'surface_elevation_separation',
    label: 'Surface Elevation & Layer Separation',
    passThreshold: 0.65,
    instructions:
      'Inspect overlapping surfaces, cards, popovers, and backgrounds in this crop. Is figure-ground separation crisp and natural without muddy shadows, banding, or surfaces blending ambiguously into the canvas?',
    criteria: {
      true_description:
        'Yes — surfaces separate cleanly via subtle tonal steps, hairline borders, or realistic multi-layered shadows.',
      false_description:
        'No — surfaces bleed into the background, cast harsh/muddy drop shadows, or lack clear elevation hierarchy.',
    },
    cssFix:
      'Use layered elevation: `box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 8px 24px -6px rgba(0,0,0,0.08);` paired with a 1px subtle border token.',
  },
  {
    key: 'tabular_numeral_alignment',
    label: 'Numeric & KPI Glyph Precision',
    passThreshold: 0.65,
    instructions:
      'Inspect any numbers, prices, metrics, timestamps, or data values in this crop (or typographic consistency if none appear). Are numerals cleanly formatted with consistent weight, unit spacing, and tabular alignment?',
    criteria: {
      true_description:
        'Yes — numeric values and units are cleanly spaced, aligned, and typographically authoritative.',
      false_description:
        'No — numbers jitter horizontally, crowd currency/unit symbols, or use inconsistent weights/formatting.',
    },
    cssFix:
      'Apply `font-variant-numeric: tabular-nums lining-nums;` on all KPI values, prices, and table columns with consistent unit spacing.',
  },
  {
    key: 'overflow_truncation_cleanliness',
    label: 'Clean Text Wrapping & Overflow Hygiene',
    passThreshold: 0.65,
    instructions:
      'Inspect line endings, headings, and bounded containers in this crop. Does text wrap cleanly without awkward single-word orphans, mid-word breaks, collided badges, or abrupt un-ellipsized truncation?',
    criteria: {
      true_description:
        'Yes — text wraps with balanced line lengths, clean ellipsis where truncated, and zero horizontal collisions.',
      false_description:
        'No — text collides with adjacent elements, breaks mid-word awkwardly, or cuts off abruptly without ellipsis.',
    },
    cssFix:
      'Add `text-wrap: balance;` on headings, `text-wrap: pretty;` on body copy, and `min-width: 0; overflow: hidden; text-overflow: ellipsis;` on flex-constrained labels.',
  },
];

// ============================================================================
// Helpers
// ============================================================================

function readNoulProbability(
  answers: Record<string, Decisions.Answer> | undefined,
  key: string,
  fallback = 0.5
): number {
  const answer = answers?.[key];
  if (answer && answer.type === 'noul' && Number.isFinite(answer.noul)) {
    return Number(Math.max(0.01, Math.min(0.99, answer.noul)).toFixed(4));
  }
  return fallback;
}

function buildMicroCraftQuestions(): Record<string, Decisions.NoulQuestion> {
  const questions: Record<string, Decisions.NoulQuestion> = {};
  for (const probe of MICRO_CRAFT_PROBES) {
    questions[probe.key] = {
      type: 'noul',
      instructions: probe.instructions,
      criteria: probe.criteria,
    };
  }
  return questions;
}

function synthesizePixelSurgicalPrompt(
  zoomedTiles: ZoomTileReport[],
  brandSummary?: string
): string {
  const tilesWithFailures = zoomedTiles.filter((t) => t.failingChecks.length > 0);
  if (tilesWithFailures.length === 0) {
    return '2x DPR Coarse-to-Fine Spatial X-Ray passed all micro-craft probes across inspected hotspot tiles. No pixel-surgical CSS patches required.';
  }

  const probeByKey = new Map<string, MicroCraftProbeSpec>(
    MICRO_CRAFT_PROBES.map((spec) => [spec.key, spec])
  );

  const lines: string[] = [
    'PIXEL-SURGICAL 2x DPR REPAIR DIRECTIVE (COARSE-TO-FINE SPATIAL X-RAY)',
    ...(brandSummary ? [`Brand & Aesthetic Anchor: ${brandSummary}`] : []),
    'Apply exact, localized CSS fixes to the following verified hotspot coordinates without regressing passing regions:',
  ];

  const orderedTiles = [...tilesWithFailures].sort((a, b) => a.microScore - b.microScore);

  for (const tile of orderedTiles) {
    const { row, col, xPct, yPct, widthPct, heightPct, coarseProb } = tile.region;
    lines.push(
      `\nTile [${row}, ${col}] — Viewport Box (x=${xPct.toFixed(1)}%, y=${yPct.toFixed(1)}%, w=${widthPct.toFixed(1)}%, h=${heightPct.toFixed(1)}%) | Coarse Defect Prob: ${(coarseProb * 100).toFixed(1)}% | Micro-Craft Score: ${tile.microScore}/100`
    );

    for (const check of tile.failingChecks) {
      const spec = probeByKey.get(check.key);
      const fix = spec?.cssFix ?? 'Refine local CSS spacing, alignment, and contrast tokens.';
      lines.push(
        `  - [${row}, ${col}] FAIL ${check.label} (p=${check.passProb.toFixed(2)}): ${fix}`
      );
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Main Entrypoint: Two-Stage Coarse-to-Fine 2x DPR Spatial Zoom X-Ray Engine
// ============================================================================

/**
 * Evaluates up to 4 cropped 2x DPR hotspot tiles in parallel via `gemini-decision-1`
 * against 16 calibrated micro-craft `noul` probes (up to 64 total micro-probes, 0 output tokens),
 * then synthesizes a coordinate-cited `pixelSurgicalPrompt` with exact CSS fixes.
 */
export async function runCoarseFineZoomXray(input: {
  tileCrops: Array<{ region: ZoomTileRegion; cropBase64: string }>;
  brandSummary?: string;
}): Promise<CoarseFineXrayResult> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_DECISIONS;

  const validCrops = input.tileCrops
    .filter((item) => Boolean(item.cropBase64 && item.cropBase64.trim().length >= 32))
    .slice(0, MAX_ZOOM_TILES);

  if (validCrops.length === 0) {
    return {
      totalMicroProbes: 0,
      zoomedTiles: [],
      worstRegion: null,
      pixelSurgicalPrompt:
        'No valid 2x DPR hotspot tile crops were provided for micro-craft inspection.',
      latencyMs: Date.now() - startedAt,
      outputTokens: 0,
    };
  }

  const questions = buildMicroCraftQuestions();
  const brandLine = input.brandSummary
    ? `Brand & Aesthetic Direction: ${input.brandSummary}`
    : 'Audit against Swiss-grid precision, museum-grade typographic craft, crisp 1px hairlines, and WCAG AA contrast.';

  return traceSpan(
    'antislop.decisions.coarseFineZoomXray',
    'llm',
    {
      model,
      tileCount: validCrops.length,
      probesPerTile: MICRO_CRAFT_PROBES.length,
      hasBrandSummary: Boolean(input.brandSummary),
    },
    async () => {
      const zoomedTiles = await Promise.all(
        validCrops.map(async ({ region, cropBase64 }): Promise<ZoomTileReport> => {
          const stripped = stripDataUriPrefix(cropBase64);
          const mimeType = normalizeMimeType(stripped.detectedMime, 'image/jpeg');

          const decisionInput: Decisions.DecisionInputContent[] = [
            { type: 'image', data: stripped.base64, mime_type: mimeType },
            {
              type: 'text',
              text: [
                `ANTISLOP 2x DPR MICRO-CRAFT X-RAY — HOTSPOT TILE [${region.row}, ${region.col}]`,
                `Viewport Region: x=${region.xPct.toFixed(1)}%, y=${region.yPct.toFixed(1)}%, w=${region.widthPct.toFixed(1)}%, h=${region.heightPct.toFixed(1)}% (coarse defect probability=${region.coarseProb.toFixed(3)}).`,
                brandLine,
                'Inspect this 2x DPR zoomed crop strictly at pixel level for typography kerning, icon stroke weights, 1px hairline crispness, button padding symmetry, baseline alignment, focus halos, sub-pixel clipping, and contrast over textures.',
              ].join('\n'),
            },
          ];

          const response = await withV1BetaClient((client) =>
            client.decisions.create({
              model,
              input: decisionInput,
              questions,
            })
          );

          const checks: MicroCraftCheck[] = MICRO_CRAFT_PROBES.map((spec) => {
            const passProb = readNoulProbability(response.answers, spec.key);
            return {
              key: spec.key,
              label: spec.label,
              passProb,
              passed: passProb >= spec.passThreshold,
            };
          });

          const failingChecks = checks
            .filter((check) => !check.passed)
            .sort((a, b) => a.passProb - b.passProb);

          const meanProb =
            checks.reduce((sum, check) => sum + check.passProb, 0) /
            Math.max(1, checks.length);
          const microScore = Math.round(meanProb * 100);

          return {
            region,
            microScore,
            checks,
            failingChecks,
          };
        })
      );

      let worstRegion: ZoomTileReport | null = null;
      for (const tile of zoomedTiles) {
        if (!worstRegion || tile.microScore < worstRegion.microScore) {
          worstRegion = tile;
        }
      }

      const pixelSurgicalPrompt = synthesizePixelSurgicalPrompt(
        zoomedTiles,
        input.brandSummary
      );

      return {
        totalMicroProbes: zoomedTiles.length * MICRO_CRAFT_PROBES.length,
        zoomedTiles,
        worstRegion,
        pixelSurgicalPrompt,
        latencyMs: Date.now() - startedAt,
        outputTokens: 0,
      };
    }
  );
}
