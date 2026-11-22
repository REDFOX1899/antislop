import type { Decisions } from '@google/genai';
import { ENV } from '../config/env.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';
import { normalizeMimeType, stripDataUriPrefix } from './mediaUtils.js';

// ============================================================================
// Multi-Viewport & Polarity Delta Tensor Engine
// ============================================================================

export type ViewportSliceId =
  | 'desktop_light'
  | 'desktop_dark'
  | 'mobile_light'
  | 'mobile_dark';

export interface DeltaProbeResult {
  key: string;
  slice: ViewportSliceId;
  pillar: string;
  beforeProb: number;
  afterProb: number;
  delta: number;
  regressed: boolean;
}

export interface SliceSummary {
  slice: ViewportSliceId;
  avgBefore: number;
  avgAfter: number;
  avgDelta: number;
  regressions: number;
}

export interface DeltaTensorResult {
  slicesEvaluated: ViewportSliceId[];
  netGainCount: number;
  regressionCount: number;
  silentRegressionVeto: boolean;
  vetoReasons: string[];
  sliceSummaries: SliceSummary[];
  topRegressions: DeltaProbeResult[];
  compensatoryFixPrompt: string;
  latencyMs: number;
  outputTokens: 0;
}

export interface DeltaTensorInput {
  beforeDesktopBase64: string;
  afterDesktopBase64: string;
  beforeMobileBase64?: string;
  afterMobileBase64?: string;
  beforeDesktopDarkBase64?: string;
  afterDesktopDarkBase64?: string;
  beforeMobileDarkBase64?: string;
  afterMobileDarkBase64?: string;
  brandSummary?: string;
}

interface CraftProbeSpec {
  key: string;
  pillar: 'typography' | 'layout' | 'contrast' | 'hierarchy' | 'craft' | 'interaction';
  instructions: string;
  trueDescription: string;
  falseDescription: string;
  remediationHint: string;
}

const REGRESSION_DELTA_THRESHOLD = -0.1;
const MEANINGFUL_GAIN_THRESHOLD = 0.01;

/**
 * 24 orthogonal craft probes (6 pillars x 4 probes) evaluated via gemini-decision-1
 * with 0 output tokens per viewport/polarity slice.
 */
const ORTHOGONAL_CRAFT_PROBES: readonly CraftProbeSpec[] = [
  // Pillar 1: Typography (4)
  {
    key: 'typo_scale_hierarchy',
    pillar: 'typography',
    instructions:
      'Does the UI establish a clear typographic scale separating display headings, subheadings, body copy, and metadata?',
    trueDescription: 'Yes — typographic scale is distinct, deliberate, and scannable.',
    falseDescription: 'No — text sizes blur together with weak or flat typographic hierarchy.',
    remediationHint: 'Restore distinct display/subhead/body clamp() scale ratios without shrinking mobile headings.',
  },
  {
    key: 'typo_leading_measure',
    pillar: 'typography',
    instructions:
      'Are line-heights and line lengths comfortable to read with zero cramped wrapping or awkward orphan lines?',
    trueDescription: 'Yes — leading and measure are well-proportioned and readable.',
    falseDescription: 'No — lines feel cramped, overly wide, or awkwardly wrapped.',
    remediationHint: 'Enforce 1.45-1.65 body line-height and 45-70ch max measure with balanced text wrapping.',
  },
  {
    key: 'typo_weight_contrast',
    pillar: 'typography',
    instructions:
      'Do font weights and letter-spacing create crisp optical separation between primary labels and supporting text?',
    trueDescription: 'Yes — weight and tracking contrast are intentional and clean.',
    falseDescription: 'No — typography looks uniformly flat, muddy, or over-bolded.',
    remediationHint: 'Differentiate headline weight/tracking from regular body copy and muted metadata.',
  },
  {
    key: 'typo_truncation_clean',
    pillar: 'typography',
    instructions:
      'Is all visible text cleanly contained with zero clipped headlines, mid-word breaks, or overflowing labels?',
    trueDescription: 'Yes — zero text clipping, broken wrapping, or overflow defects.',
    falseDescription: 'No — text is clipped, truncated awkwardly, or breaks mid-word.',
    remediationHint: 'Prevent text clipping with proper responsive font sizing, min-w-0 flex constraints, and overflow handling.',
  },

  // Pillar 2: Layout (4)
  {
    key: 'layout_grid_alignment',
    pillar: 'layout',
    instructions:
      'Do sections, cards, columns, and headers align cleanly along a disciplined optical grid?',
    trueDescription: 'Yes — strict grid and edge alignment across the viewport.',
    falseDescription: 'No — misaligned edges, jittery columns, or broken grid rhythm.',
    remediationHint: 'Snap container gutters, card edges, and column tracks to a unified responsive CSS grid.',
  },
  {
    key: 'layout_whitespace_rhythm',
    pillar: 'layout',
    instructions:
      'Does the layout maintain balanced vertical and horizontal whitespace rhythm without cramped clusters or awkward dead voids?',
    trueDescription: 'Yes — spacing cadence is consistent and intentional.',
    falseDescription: 'No — elements feel cramped together or separated by erratic empty gaps.',
    remediationHint: 'Normalize section vertical rhythm and card padding on a consistent 4px/8px spacing scale.',
  },
  {
    key: 'layout_no_overlap',
    pillar: 'layout',
    instructions:
      'Are all visual elements free of unintended overlaps, z-index collisions, or obscured controls?',
    trueDescription: 'Yes — zero overlapping elements or occluded UI controls.',
    falseDescription: 'No — elements collide, overlap text, or obscure interactive controls.',
    remediationHint: 'Eliminate negative-margin or absolute-position collisions and enforce clean stacking contexts.',
  },
  {
    key: 'layout_responsive_fit',
    pillar: 'layout',
    instructions:
      'Does the entire layout fit cleanly within the viewport width with zero horizontal overflow or edge clipping?',
    trueDescription: 'Yes — cleanly contained within viewport bounds with comfortable side margins.',
    falseDescription: 'No — content bleeds past viewport edges, clips horizontally, or hugs edges too tightly.',
    remediationHint: 'Constrain wide children with max-w-full, responsive padding, and wrap/stack rules on narrow viewports.',
  },

  // Pillar 3: Contrast (4)
  {
    key: 'contrast_body_wcag',
    pillar: 'contrast',
    instructions:
      'Do body copy, captions, and secondary labels maintain crisp WCAG AA contrast against their immediate background?',
    trueDescription: 'Yes — all text has strong, effortless legibility against its surface.',
    falseDescription: 'No — text is low-contrast, washed out, or hard to read against its background.',
    remediationHint: 'Raise foreground/background luminance contrast to >= 4.5:1 for body text and >= 3:1 for large text.',
  },
  {
    key: 'contrast_cta_legibility',
    pillar: 'contrast',
    instructions:
      'Do primary CTA buttons and key interactive controls have unmistakable foreground-to-background contrast?',
    trueDescription: 'Yes — primary controls and button labels are immediately legible.',
    falseDescription: 'No — CTA text or button boundaries blend weakly into the surface.',
    remediationHint: 'Use high-contrast button fill/label pairings and distinct focus/hover borders.',
  },
  {
    key: 'contrast_surface_separation',
    pillar: 'contrast',
    instructions:
      'Do cards, inputs, modals, and elevated surfaces have clean tonal or border separation without muddy haze?',
    trueDescription: 'Yes — surfaces and boundaries read cleanly and purposefully.',
    falseDescription: 'No — surfaces melt together or rely on muddy, low-definition borders.',
    remediationHint: 'Define explicit surface elevation tokens and crisp 1px structural borders with adequate contrast.',
  },
  {
    key: 'contrast_polarity_balance',
    pillar: 'contrast',
    instructions:
      'Does the color polarity (light or dark mode) feel cohesive without harsh glare, washed-out dark grays, or unadapted assets?',
    trueDescription: 'Yes — polarity tokens, icons, and surfaces are harmonious and balanced.',
    falseDescription: 'No — polarity feels broken, overly harsh, muddy, or contains unadapted elements.',
    remediationHint: 'Audit semantic surface/ink tokens and inverted media/icon fills for the active polarity.',
  },

  // Pillar 4: Hierarchy (4)
  {
    key: 'hierarchy_focal_point',
    pillar: 'hierarchy',
    instructions:
      'Is there an unmistakable primary focal point above the fold with clear visual reading order?',
    trueDescription: 'Yes — the eye lands immediately on the primary message and flows naturally.',
    falseDescription: 'No — competing blocks dilute focus or bury the primary value proposition.',
    remediationHint: 'Strengthen hero focal anchor and demote competing secondary elements above the fold.',
  },
  {
    key: 'hierarchy_cta_prominence',
    pillar: 'hierarchy',
    instructions:
      'Does the primary action stand out cleanly above secondary actions without noisy competing buttons?',
    trueDescription: 'Yes — primary CTA has clear visual priority over secondary actions.',
    falseDescription: 'No — multiple equal-weight buttons compete or the primary CTA is visually buried.',
    remediationHint: 'Limit above-the-fold solid fills to one primary CTA and style secondary actions as quiet ghost/outline controls.',
  },
  {
    key: 'hierarchy_scannability',
    pillar: 'hierarchy',
    instructions:
      'Can content groups, metrics, and section headings be scanned effortlessly in under three seconds?',
    trueDescription: 'Yes — clear grouping, concise labels, and strong visual signposts.',
    falseDescription: 'No — dense visual noise or weak grouping makes scanning slow.',
    remediationHint: 'Group related metadata tightly, increase inter-group spacing, and trim redundant decorative chrome.',
  },
  {
    key: 'hierarchy_nav_clarity',
    pillar: 'hierarchy',
    instructions:
      'Are the navigation bar and header controls uncluttered, balanced, and easy to parse at this viewport size?',
    trueDescription: 'Yes — navigation is clean, balanced, and proportionate to the viewport.',
    falseDescription: 'No — header links wrap awkwardly, crowd together, or overwhelm the viewport.',
    remediationHint: 'Simplify header item count, collapse secondary links into a clean mobile drawer, and preserve single-row alignment.',
  },

  // Pillar 5: Craft (4)
  {
    key: 'craft_zero_ai_slop',
    pillar: 'craft',
    instructions:
      'Is the design free of generic AI slop (cliché purple-blue gradients, gratuitous neon glows, redundant decorative pill badges)?',
    trueDescription: 'Yes — original, disciplined editorial craft with zero generic AI clichés.',
    falseDescription: 'No — relies on generic AI-template visual tropes or gratuitous decorative chrome.',
    remediationHint: 'Strip generic glow effects, cliché gradients, and decorative pill clutter in favor of disciplined typography and tone.',
  },
  {
    key: 'craft_border_radius_consistency',
    pillar: 'craft',
    instructions:
      'Are corner radii, border stroke weights, and shadow elevations consistent across components?',
    trueDescription: 'Yes — cohesive geometry and elevation language throughout.',
    falseDescription: 'No — mismatched corner radii, inconsistent borders, or conflicting shadow styles.',
    remediationHint: 'Unify component radii, hairline border widths, and elevation tokens across all cards and controls.',
  },
  {
    key: 'craft_media_framing',
    pillar: 'craft',
    instructions:
      'Are images, icons, charts, and visual illustrations cleanly framed with preserved aspect ratios and crisp alignment?',
    trueDescription: 'Yes — media assets are well-proportioned, sharp, and seamlessly integrated.',
    falseDescription: 'No — stretched, awkwardly cropped, or visually disconnected media/icons.',
    remediationHint: 'Enforce explicit aspect-ratio containers with object-cover/object-contain and aligned icon optical boxes.',
  },
  {
    key: 'craft_micro_polish',
    pillar: 'craft',
    instructions:
      'Do fine details — icon-text centering, badge padding, dividers, and tabular numbers — exhibit production-grade polish?',
    trueDescription: 'Yes — micro-alignment and detail craft feel bespoke and production-ready.',
    falseDescription: 'No — sloppy micro-alignments, uneven padding, or rough visual seams.',
    remediationHint: 'Tighten flex items-center optical alignment, consistent badge padding, and subtle hairline dividers.',
  },

  // Pillar 6: Interaction (4)
  {
    key: 'interaction_touch_targets',
    pillar: 'interaction',
    instructions:
      'Do interactive buttons, links, and controls provide comfortable, non-cramped hit targets with safe separation?',
    trueDescription: 'Yes — controls are generously sized and cleanly spaced for accurate clicks/taps.',
    falseDescription: 'No — tiny or tightly packed interactive targets risk mis-taps.',
    remediationHint: 'Ensure interactive controls meet >= 44px touch targets on mobile with >= 8px inter-control gap.',
  },
  {
    key: 'interaction_form_affordance',
    pillar: 'interaction',
    instructions:
      'Do inputs, selectors, and interactive controls clearly communicate clickability, state, and visual affordance?',
    trueDescription: 'Yes — interactive elements look unmistakably actionable and well-structured.',
    falseDescription: 'No — controls look flat, ambiguous, or visually indistinguishable from static text.',
    remediationHint: 'Add unmistakable input borders, clear labels/placeholders, and distinct interactive affordances.',
  },
  {
    key: 'interaction_card_density',
    pillar: 'interaction',
    instructions:
      'Are cards and data blocks balanced in information density without walls of tiny text or cramped metadata?',
    trueDescription: 'Yes — comfortable information density with clear breathing room inside cards.',
    falseDescription: 'No — cards feel overcrowded, cramped, or difficult to parse at this viewport.',
    remediationHint: 'Reduce per-card metadata density, enforce >= 16px internal padding, and stack multi-column card rows on mobile.',
  },
  {
    key: 'interaction_viewport_ergonomics',
    pillar: 'interaction',
    instructions:
      'Does the above-the-fold composition fit the viewport ergonomics naturally without awkward mid-element vertical cuts?',
    trueDescription: 'Yes — viewport framing feels natural, complete, and inviting to scroll.',
    falseDescription: 'No — awkward vertical cropping cuts through key headlines, CTAs, or media.',
    remediationHint: 'Tune hero vertical padding and media height so headline, primary CTA, and key visual frame cleanly above the fold.',
  },
] as const;

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

function buildProbeQuestions(): Record<string, Decisions.NoulQuestion> {
  const questions: Record<string, Decisions.NoulQuestion> = {};
  for (const probe of ORTHOGONAL_CRAFT_PROBES) {
    questions[probe.key] = {
      type: 'noul',
      instructions: probe.instructions,
      criteria: {
        true_description: probe.trueDescription,
        false_description: probe.falseDescription,
      },
    };
  }
  return questions;
}

function describeSlice(slice: ViewportSliceId): string {
  switch (slice) {
    case 'desktop_light':
      return 'Desktop Viewport (Light Polarity)';
    case 'desktop_dark':
      return 'Desktop Viewport (Dark Polarity)';
    case 'mobile_light':
      return 'Mobile Viewport (Light Polarity)';
    case 'mobile_dark':
      return 'Mobile Viewport (Dark Polarity)';
  }
}

interface SlicePair {
  slice: ViewportSliceId;
  beforeBase64: string;
  afterBase64: string;
}

function hasImagePayload(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length >= 32;
}

async function evaluateScreenshotProbes(
  model: string,
  slice: ViewportSliceId,
  phase: 'before' | 'after',
  rawBase64: string,
  questions: Record<string, Decisions.NoulQuestion>,
  brandLine: string
): Promise<Record<string, number>> {
  const stripped = stripDataUriPrefix(rawBase64);
  const mime = normalizeMimeType(stripped.detectedMime, 'image/jpeg');

  const decisionInput: Decisions.DecisionInputContent[] = [
    { type: 'image', data: stripped.base64, mime_type: mime },
    {
      type: 'text',
      text: [
        `ANTISLOP MULTI-VIEWPORT DELTA TENSOR PROBE (${describeSlice(slice)} — ${phase.toUpperCase()})`,
        brandLine,
        'Score each orthogonal craft dimension strictly on what is rendered in this screenshot.',
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

  const probs: Record<string, number> = {};
  for (const probe of ORTHOGONAL_CRAFT_PROBES) {
    probs[probe.key] = readNoulProbability(response.answers, probe.key);
  }
  return probs;
}

function synthesizeCompensatoryFixPrompt(
  topRegressions: DeltaProbeResult[],
  silentRegressionVeto: boolean,
  vetoReasons: string[],
  slicesEvaluated: ViewportSliceId[]
): string {
  if (topRegressions.length === 0) {
    return `No regressions detected across ${slicesEvaluated.join(', ')} (${ORTHOGONAL_CRAFT_PROBES.length} probes/slice). Preserve current responsive breakpoints, WCAG contrast tokens, and layout grid invariants.`;
  }

  const probeSpecByKey = new Map(ORTHOGONAL_CRAFT_PROBES.map((p) => [p.key, p]));
  const lines: string[] = [];

  lines.push(
    silentRegressionVeto
      ? 'SILENT REGRESSION VETO ACTIVE — DO NOT SHIP UNTIL COMPENSATORY FIXES LAND:'
      : 'DELTA TENSOR REGRESSION REPORT — APPLY TARGETED COMPENSATORY FIXES:'
  );

  if (vetoReasons.length > 0) {
    lines.push('Veto triggers:');
    for (const reason of vetoReasons) {
      lines.push(`- ${reason}`);
    }
  }

  lines.push('Priority probe regressions to repair without undoing desktop craft gains:');
  for (const reg of topRegressions) {
    const spec = probeSpecByKey.get(reg.key);
    const deltaPct = `${(reg.delta * 100).toFixed(1)}pp`;
    const beforePct = `${(reg.beforeProb * 100).toFixed(1)}%`;
    const afterPct = `${(reg.afterProb * 100).toFixed(1)}%`;
    lines.push(
      `- [${reg.slice} | ${reg.pillar} | ${reg.key}] ${beforePct} -> ${afterPct} (${deltaPct}): ${spec?.remediationHint ?? 'Restore pre-edit visual quality on this slice.'}`
    );
  }

  lines.push(
    'Constraint: Keep all positive desktop improvements intact while scoping responsive/polarity overrides cleanly via CSS media queries and semantic contrast tokens.'
  );

  return lines.join('\n');
}

/**
 * Evaluates before vs after screenshots across 24 orthogonal craft probes per
 * available viewport/polarity slice in parallel via gemini-decision-1 (noul probes,
 * 0 output tokens). Computes exact delta_i = p_i(after) - p_i(before), triggers
 * `silentRegressionVeto` when desktop gains coincide with mobile or contrast/dark
 * regressions (delta < -0.10), and synthesizes a targeted `compensatoryFixPrompt`.
 */
export async function runMultiViewportDeltaTensor(
  input: DeltaTensorInput
): Promise<DeltaTensorResult> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_DECISIONS;

  if (!hasImagePayload(input.beforeDesktopBase64)) {
    throw new Error('beforeDesktopBase64 is required for multi-viewport delta tensor');
  }
  if (!hasImagePayload(input.afterDesktopBase64)) {
    throw new Error('afterDesktopBase64 is required for multi-viewport delta tensor');
  }

  const slicePairs: SlicePair[] = [
    {
      slice: 'desktop_light',
      beforeBase64: input.beforeDesktopBase64,
      afterBase64: input.afterDesktopBase64,
    },
  ];

  if (hasImagePayload(input.beforeMobileBase64) && hasImagePayload(input.afterMobileBase64)) {
    slicePairs.push({
      slice: 'mobile_light',
      beforeBase64: input.beforeMobileBase64,
      afterBase64: input.afterMobileBase64,
    });
  }

  if (
    hasImagePayload(input.beforeDesktopDarkBase64) &&
    hasImagePayload(input.afterDesktopDarkBase64)
  ) {
    slicePairs.push({
      slice: 'desktop_dark',
      beforeBase64: input.beforeDesktopDarkBase64,
      afterBase64: input.afterDesktopDarkBase64,
    });
  }

  if (
    hasImagePayload(input.beforeMobileDarkBase64) &&
    hasImagePayload(input.afterMobileDarkBase64)
  ) {
    slicePairs.push({
      slice: 'mobile_dark',
      beforeBase64: input.beforeMobileDarkBase64,
      afterBase64: input.afterMobileDarkBase64,
    });
  }

  const slicesEvaluated: ViewportSliceId[] = slicePairs.map((pair) => pair.slice);
  const questions = buildProbeQuestions();
  const brandLine = input.brandSummary
    ? `Brand & Aesthetic Direction: ${input.brandSummary}`
    : 'Evaluate against museum-grade editorial craft, Swiss grid discipline, WCAG AA contrast, and zero generic AI slop.';

  return traceSpan(
    'antislop.decisions.multiViewportDeltaTensor',
    'llm',
    {
      model,
      slicesCount: slicesEvaluated.length,
      slicesEvaluated: slicesEvaluated.join(','),
      probesPerSlice: ORTHOGONAL_CRAFT_PROBES.length,
    },
    async () => {
      const evaluatedSlices = await Promise.all(
        slicePairs.map(async (pair) => {
          const [beforeProbs, afterProbs] = await Promise.all([
            evaluateScreenshotProbes(
              model,
              pair.slice,
              'before',
              pair.beforeBase64,
              questions,
              brandLine
            ),
            evaluateScreenshotProbes(
              model,
              pair.slice,
              'after',
              pair.afterBase64,
              questions,
              brandLine
            ),
          ]);

          const results: DeltaProbeResult[] = ORTHOGONAL_CRAFT_PROBES.map((probe) => {
            const beforeProb = beforeProbs[probe.key] ?? 0.5;
            const afterProb = afterProbs[probe.key] ?? 0.5;
            const delta = Number((afterProb - beforeProb).toFixed(4));
            const regressed = delta < REGRESSION_DELTA_THRESHOLD;
            return {
              key: probe.key,
              slice: pair.slice,
              pillar: probe.pillar,
              beforeProb,
              afterProb,
              delta,
              regressed,
            };
          });

          const count = results.length || 1;
          const avgBefore = Number(
            (results.reduce((acc, r) => acc + r.beforeProb, 0) / count).toFixed(4)
          );
          const avgAfter = Number(
            (results.reduce((acc, r) => acc + r.afterProb, 0) / count).toFixed(4)
          );
          const avgDelta = Number(
            (results.reduce((acc, r) => acc + r.delta, 0) / count).toFixed(4)
          );
          const regressions = results.filter((r) => r.regressed).length;

          const summary: SliceSummary = {
            slice: pair.slice,
            avgBefore,
            avgAfter,
            avgDelta,
            regressions,
          };

          return { results, summary };
        })
      );

      const allProbes: DeltaProbeResult[] = evaluatedSlices.flatMap((entry) => entry.results);
      const sliceSummaries: SliceSummary[] = evaluatedSlices.map((entry) => entry.summary);

      const netGainCount = allProbes.filter((p) => p.delta > MEANINGFUL_GAIN_THRESHOLD).length;
      const allRegressions = allProbes.filter((p) => p.regressed);
      const regressionCount = allRegressions.length;

      const topRegressions = [...allRegressions]
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 8);

      // Silent regression veto detection:
      // Trigger if any desktop gain coincides with a mobile, contrast, or dark-polarity regression (delta < -0.10)
      const desktopSummary = sliceSummaries.find((s) => s.slice === 'desktop_light');
      const desktopProbes = allProbes.filter(
        (p) => p.slice === 'desktop_light' || p.slice === 'desktop_dark'
      );
      const hasDesktopGain =
        (desktopSummary !== undefined && desktopSummary.avgDelta > 0) ||
        desktopProbes.some((p) => p.delta > MEANINGFUL_GAIN_THRESHOLD);

      const mobileRegressions = allRegressions.filter(
        (p) => p.slice === 'mobile_light' || p.slice === 'mobile_dark'
      );
      const contrastRegressions = allRegressions.filter((p) => p.pillar === 'contrast');
      const darkPolarityRegressions = allRegressions.filter(
        (p) => p.slice === 'desktop_dark' || p.slice === 'mobile_dark'
      );

      const vetoReasons: string[] = [];
      if (hasDesktopGain && mobileRegressions.length > 0) {
        const worst = [...mobileRegressions].sort((a, b) => a.delta - b.delta)[0];
        vetoReasons.push(
          `Desktop gain coincided with ${mobileRegressions.length} mobile regression(s) (worst: ${worst.slice}/${worst.key} Δ=${(worst.delta * 100).toFixed(1)}pp).`
        );
      }
      if (hasDesktopGain && contrastRegressions.length > 0) {
        const worst = [...contrastRegressions].sort((a, b) => a.delta - b.delta)[0];
        vetoReasons.push(
          `Desktop gain coincided with ${contrastRegressions.length} WCAG/contrast regression(s) (worst: ${worst.slice}/${worst.key} Δ=${(worst.delta * 100).toFixed(1)}pp).`
        );
      }
      if (hasDesktopGain && darkPolarityRegressions.length > 0) {
        const worst = [...darkPolarityRegressions].sort((a, b) => a.delta - b.delta)[0];
        vetoReasons.push(
          `Desktop gain coincided with ${darkPolarityRegressions.length} dark-polarity regression(s) (worst: ${worst.slice}/${worst.key} Δ=${(worst.delta * 100).toFixed(1)}pp).`
        );
      }

      const silentRegressionVeto = vetoReasons.length > 0;
      const compensatoryFixPrompt = synthesizeCompensatoryFixPrompt(
        topRegressions,
        silentRegressionVeto,
        vetoReasons,
        slicesEvaluated
      );

      return {
        slicesEvaluated,
        netGainCount,
        regressionCount,
        silentRegressionVeto,
        vetoReasons,
        sliceSummaries,
        topRegressions,
        compensatoryFixPrompt,
        latencyMs: Date.now() - startedAt,
        outputTokens: 0,
      };
    }
  );
}
