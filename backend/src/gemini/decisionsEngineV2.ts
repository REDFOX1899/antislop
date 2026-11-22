import type { Decisions } from '@google/genai';
import { ENV } from '../config/env.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';
import { normalizeMimeType, stripDataUriPrefix } from './mediaUtils.js';

// ============================================================================
// 1. Entropy-Gated Adaptive Compute Router (Pure Math, Zero External Calls)
// ============================================================================

export type AdaptiveRouteTier =
  | 'early_stop'
  | 'gemini-4-argon'
  | 'gemini-4-neon'
  | 'gemini-4-carbon';

export interface EntropyRouteInput {
  prodReadyProb: number;
  brokenProb: number;
  domGatesPassed: boolean;
}

export interface EntropyRouteDecision {
  tier: AdaptiveRouteTier;
  entropy: number;
  rationale: string;
  estimatedLatencyMs: number;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/**
 * Computes binary Shannon entropy H(p) = -p*log2(p) - (1-p)*log2(1-p),
 * safely clamped for p in (0, 1) so boundary inputs never produce NaN.
 */
export function computeShannonEntropy(p: number): number {
  if (!Number.isFinite(p)) return 1;
  const clamped = Math.max(1e-9, Math.min(1 - 1e-9, p));
  if (p <= 0 || p >= 1) return 0;
  const h = -(clamped * Math.log2(clamped) + (1 - clamped) * Math.log2(1 - clamped));
  return Number(Math.max(0, Math.min(1, h)).toFixed(4));
}

/**
 * Tri-region entropy-gated compute router for AntiSlop's repair loop:
 * - p_prod >= 0.88 && domGatesPassed -> early_stop (0 ms)
 * - H < 0.61 && brokenProb >= 0.85   -> gemini-4-argon (fast deterministic patch)
 * - 0.61 <= H < 0.85                 -> gemini-4-neon (surgical polish pass)
 * - H >= 0.85                        -> gemini-4-carbon (deep architectural re-synthesis)
 */
export function routeByDecisionEntropy(input: EntropyRouteInput): EntropyRouteDecision {
  const prodProb = clampUnit(input.prodReadyProb);
  const brokenProb = clampUnit(input.brokenProb);
  const entropy = computeShannonEntropy(prodProb);

  if (prodProb >= 0.88 && input.domGatesPassed) {
    return {
      tier: 'early_stop',
      entropy,
      rationale: `Production-ready confidence (${(prodProb * 100).toFixed(1)}%) cleared 88% gate with all deterministic DOM invariants green; halting compute.`,
      estimatedLatencyMs: 0,
    };
  }

  if (entropy < 0.61 && brokenProb >= 0.85) {
    return {
      tier: 'gemini-4-argon',
      entropy,
      rationale: `Low decision entropy (H=${entropy.toFixed(3)}) with high defect certainty (P(broken)=${(brokenProb * 100).toFixed(1)}%); routing to fast deterministic Argon patch.`,
      estimatedLatencyMs: 1800,
    };
  }

  if (entropy < 0.85) {
    return {
      tier: 'gemini-4-neon',
      entropy,
      rationale:
        entropy >= 0.61
          ? `Moderate decision entropy (H=${entropy.toFixed(3)} in [0.61, 0.85)); routing to balanced Neon surgical craft pass.`
          : `Low entropy (H=${entropy.toFixed(3)}) without clear-stop or high-defect certainty (DOM gates=${input.domGatesPassed ? 'pass' : 'fail'}); routing to Neon targeted refinement.`,
      estimatedLatencyMs: 3600,
    };
  }

  return {
    tier: 'gemini-4-carbon',
    entropy,
    rationale: `High decision entropy (H=${entropy.toFixed(3)} >= 0.85) indicates ambiguous aesthetic/structural tradeoffs; escalating to Carbon deep synthesis.`,
    estimatedLatencyMs: 7200,
  };
}

// ============================================================================
// Shared Decisions API Helper
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

// ============================================================================
// 2. Position-Swapped Blind Pairwise Bradley-Terry A/B Judge
// ============================================================================

export interface PairwiseJudgeInput {
  baselineBase64: string;
  candidateBase64: string;
  brandSummary?: string;
}

export interface PairwiseJudgeResult {
  winner: 'candidate' | 'baseline' | 'tie';
  debiasedCandidateWinProb: number;
  forwardWinProb: number;
  reverseWinProb: number;
  eloDelta: number;
  regressionProb: number;
  rejectedAsRegression: boolean;
  latencyMs: number;
  outputTokens: 0;
}

const PAIRWISE_SUPERIORITY_CRITERIA: Decisions.NoulCriteria = {
  true_description: 'Yes — the target variant is clearly superior in visual craft, hierarchy, spacing, typography, and polish.',
  false_description: 'No — the comparison variant is equal or superior in overall visual craft.',
};

const PAIRWISE_REGRESSION_CRITERIA: Decisions.NoulCriteria = {
  true_description: 'Yes — the target variant introduces a noticeable visual regression (overlap, clipping, contrast drop, broken alignment, or AI slop).',
  false_description: 'No — the target variant introduces zero visual regressions relative to the baseline.',
};

/**
 * Runs a position-swapped blind A/B pairwise tournament using gemini-decision-1.
 * Executes [baseline, candidate] and [candidate, baseline] in parallel to eliminate
 * positional slot bias, computes Bradley-Terry Elo delta, and enforces a hard
 * regression rejection gate (p < 0.50 || regressionProb > 0.35).
 */
export async function runPairwiseBlindJudge(
  input: PairwiseJudgeInput
): Promise<PairwiseJudgeResult> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_DECISIONS;

  if (!input.baselineBase64 || input.baselineBase64.trim().length < 32) {
    throw new Error('baselineBase64 is required for pairwise blind judge');
  }
  if (!input.candidateBase64 || input.candidateBase64.trim().length < 32) {
    throw new Error('candidateBase64 is required for pairwise blind judge');
  }

  const baseline = stripDataUriPrefix(input.baselineBase64);
  const candidate = stripDataUriPrefix(input.candidateBase64);
  const baselineMime = normalizeMimeType(baseline.detectedMime, 'image/jpeg');
  const candidateMime = normalizeMimeType(candidate.detectedMime, 'image/jpeg');

  const brandLine = input.brandSummary
    ? `Brand & Aesthetic Direction: ${input.brandSummary}`
    : 'Evaluate against museum-grade editorial craft, Swiss grid discipline, WCAG AA contrast, and zero generic AI slop.';

  const forwardInput: Decisions.DecisionInputContent[] = [
    { type: 'image', data: baseline.base64, mime_type: baselineMime },
    { type: 'image', data: candidate.base64, mime_type: candidateMime },
    {
      type: 'text',
      text: [
        'ANTISLOP BLIND PAIRWISE A/B TOURNAMENT (FORWARD SLOT ORDER)',
        'Image 1 is Variant A. Image 2 is Variant B.',
        brandLine,
        'Compare Variant A and Variant B strictly on rendered visual quality, typographic hierarchy, spacing rhythm, contrast legibility, and zero visual defects.',
      ].join('\n'),
    },
  ];

  const reverseInput: Decisions.DecisionInputContent[] = [
    { type: 'image', data: candidate.base64, mime_type: candidateMime },
    { type: 'image', data: baseline.base64, mime_type: baselineMime },
    {
      type: 'text',
      text: [
        'ANTISLOP BLIND PAIRWISE A/B TOURNAMENT (REVERSED SLOT ORDER)',
        'Image 1 is Variant A. Image 2 is Variant B.',
        brandLine,
        'Compare Variant A and Variant B strictly on rendered visual quality, typographic hierarchy, spacing rhythm, contrast legibility, and zero visual defects.',
      ].join('\n'),
    },
  ];

  const forwardQuestions: Record<string, Decisions.NoulQuestion> = {
    candidate_superior: {
      type: 'noul',
      instructions:
        'Does Variant B (Image 2) outperform Variant A (Image 1) in overall UI craft, typographic hierarchy, spatial balance, and editorial polish?',
      criteria: PAIRWISE_SUPERIORITY_CRITERIA,
    },
    candidate_regression: {
      type: 'noul',
      instructions:
        'Does Variant B (Image 2) introduce any visual regression (element overlap, text clipping, lower contrast, misaligned grid, or generic AI slop) compared to Variant A (Image 1)?',
      criteria: PAIRWISE_REGRESSION_CRITERIA,
    },
  };

  const reverseQuestions: Record<string, Decisions.NoulQuestion> = {
    candidate_superior: {
      type: 'noul',
      instructions:
        'Does Variant A (Image 1) outperform Variant B (Image 2) in overall UI craft, typographic hierarchy, spatial balance, and editorial polish?',
      criteria: PAIRWISE_SUPERIORITY_CRITERIA,
    },
    candidate_regression: {
      type: 'noul',
      instructions:
        'Does Variant A (Image 1) introduce any visual regression (element overlap, text clipping, lower contrast, misaligned grid, or generic AI slop) compared to Variant B (Image 2)?',
      criteria: PAIRWISE_REGRESSION_CRITERIA,
    },
  };

  return traceSpan(
    'antislop.decisions.pairwiseBlindJudge',
    'llm',
    { model, hasBrandSummary: Boolean(input.brandSummary) },
    async () => {
      const [forwardRes, reverseRes] = await Promise.all([
        withV1BetaClient((client) =>
          client.decisions.create({
            model,
            input: forwardInput,
            questions: forwardQuestions,
          })
        ),
        withV1BetaClient((client) =>
          client.decisions.create({
            model,
            input: reverseInput,
            questions: reverseQuestions,
          })
        ),
      ]);

      const forwardWinProb = readNoulProbability(forwardRes.answers, 'candidate_superior');
      const reverseWinProb = readNoulProbability(reverseRes.answers, 'candidate_superior');
      const debiasedCandidateWinProb = Number(
        ((forwardWinProb + reverseWinProb) / 2).toFixed(4)
      );

      const forwardRegProb = readNoulProbability(forwardRes.answers, 'candidate_regression');
      const reverseRegProb = readNoulProbability(reverseRes.answers, 'candidate_regression');
      const regressionProb = Number(((forwardRegProb + reverseRegProb) / 2).toFixed(4));

      const pClamped = Math.max(0.01, Math.min(0.99, debiasedCandidateWinProb));
      const eloDelta = Number((400 * Math.log10(pClamped / (1 - pClamped))).toFixed(1));

      const rejectedAsRegression =
        debiasedCandidateWinProb < 0.5 || regressionProb > 0.35;

      let winner: 'candidate' | 'baseline' | 'tie';
      if (rejectedAsRegression) {
        winner = 'baseline';
      } else if (Math.abs(debiasedCandidateWinProb - 0.5) < 0.02) {
        winner = 'tie';
      } else {
        winner = 'candidate';
      }

      return {
        winner,
        debiasedCandidateWinProb,
        forwardWinProb,
        reverseWinProb,
        eloDelta,
        regressionProb,
        rejectedAsRegression,
        latencyMs: Date.now() - startedAt,
        outputTokens: 0,
      };
    }
  );
}

// ============================================================================
// 3. Conversion Readiness & Brand Drift Calibrated Audit
// ============================================================================

export type ConversionCraftQuadrant =
  | 'high_yield_craft'
  | 'pretty_slop'
  | 'functional_draft'
  | 'needs_overhaul';

export interface ConversionBrandProbeResult {
  key: string;
  label: string;
  passProb: number;
  passed: boolean;
}

export interface ConversionAndBrandAuditInput {
  screenshotBase64: string;
  referenceBase64?: string;
  brandSummary?: string;
}

export interface ConversionAndBrandAuditResult {
  conversionReadinessScore: number;
  brandDriftNorm: number;
  quadrant: ConversionCraftQuadrant;
  probes: ConversionBrandProbeResult[];
  latencyMs: number;
  outputTokens: 0;
}

interface ConversionBrandProbeSpec {
  key: string;
  label: string;
  category: 'conversion' | 'brand_drift';
  weight: number;
  instructions: string;
}

const AUDIT_PASS_THRESHOLD = 0.55;

const AUDIT_NOUL_CRITERIA: Decisions.NoulCriteria = {
  true_description: 'Yes — satisfies this conversion psychology or brand craft standard clearly.',
  false_description: 'No — fails this standard or exhibits generic AI slop / conversion friction.',
};

const CONVERSION_AND_BRAND_PROBES: readonly ConversionBrandProbeSpec[] = [
  {
    key: 'above_fold_value_clarity',
    label: 'Above-the-Fold 3s Value Clarity',
    category: 'conversion',
    weight: 0.22,
    instructions:
      'Within the first 3 seconds of scanning above the fold, is the core product value proposition immediately clear, specific, and visually anchored by the primary headline?',
  },
  {
    key: 'primary_cta_salience',
    label: 'Primary CTA Salience & Action Friction',
    category: 'conversion',
    weight: 0.2,
    instructions:
      'Does the primary call-to-action button have unmistakable visual contrast, unambiguous action copy, and clear hierarchy over secondary actions?',
  },
  {
    key: 'trust_proof_credibility',
    label: 'Trust Signals & Editorial Credibility',
    category: 'conversion',
    weight: 0.16,
    instructions:
      'Does the page establish authentic credibility (clear metrics, crisp product evidence, realistic data, or authoritative editorial framing) without fake or cheesy stock badges?',
  },
  {
    key: 'cognitive_load_restraint',
    label: 'Cognitive Load & Scannable Rhythm',
    category: 'conversion',
    weight: 0.16,
    instructions:
      'Is visual density disciplined with clear chunking, generous whitespace, and scannable hierarchy so a first-time visitor is never overwhelmed?',
  },
  {
    key: 'copy_specificity_authenticity',
    label: 'Copy Specificity (Zero AI Buzzwords)',
    category: 'conversion',
    weight: 0.14,
    instructions:
      'Is the visible UX copy concrete, domain-authentic, and free of hollow AI filler phrases (e.g., "unleash the power of", "revolutionize your workflow", "seamless next-gen synergy")?',
  },
  {
    key: 'visual_funnel_flow',
    label: 'Directional Eye-Flow & Conversion Funnel',
    category: 'conversion',
    weight: 0.12,
    instructions:
      'Does the spatial composition naturally guide the reader eye from eyebrow/headline to supporting proof and directly into the primary conversion action?',
  },
  {
    key: 'palette_dna_adherence',
    label: 'Brand Palette & 60/30/10 Token Fidelity',
    category: 'brand_drift',
    weight: 0.25,
    instructions:
      'Does the rendered color system strictly honor the intended brand palette (or reference moodboard) with disciplined 60/30/10 surface-to-accent restraint?',
  },
  {
    key: 'typography_voice_fidelity',
    label: 'Editorial Typography & Voice Consistency',
    category: 'brand_drift',
    weight: 0.25,
    instructions:
      'Do the display/body font pairings, weights, tracking, and typographic rhythm match the intended brand DNA with museum-grade editorial control?',
  },
  {
    key: 'zero_ai_slop_surface',
    label: 'Zero AI Slop Surface Clichés',
    category: 'brand_drift',
    weight: 0.25,
    instructions:
      'Is the interface completely free of generic AI SaaS clichés (gratuitous purple-blue neon gradients, glowing pill borders, floating orb blobs, or muddy dark-mode glassmorphism)?',
  },
  {
    key: 'layout_craft_originality',
    label: 'Bespoke Art-Directed Layout Cohesion',
    category: 'brand_drift',
    weight: 0.25,
    instructions:
      'Does the overall layout feel purposefully art-directed and cohesive with the brand/reference DNA rather than a generic cookie-cutter template?',
  },
] as const;

/**
 * Runs 10 orthogonal conversion/UX psychology + brand slop-drift noul probes
 * via gemini-decision-1 (0 output tokens), returning Conversion Readiness (0..100),
 * normalized Brand Drift L2 norm (0..1), and 2D Craft-vs-Conversion quadrant.
 */
export async function runConversionAndBrandAudit(
  input: ConversionAndBrandAuditInput
): Promise<ConversionAndBrandAuditResult> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_DECISIONS;

  if (!input.screenshotBase64 || input.screenshotBase64.trim().length < 32) {
    throw new Error('screenshotBase64 is required for conversion & brand drift audit');
  }

  const shot = stripDataUriPrefix(input.screenshotBase64);
  const shotMime = normalizeMimeType(shot.detectedMime, 'image/jpeg');

  const inputBlocks: Decisions.DecisionInputContent[] = [
    { type: 'image', data: shot.base64, mime_type: shotMime },
  ];

  let hasReference = false;
  if (input.referenceBase64 && input.referenceBase64.trim().length >= 32) {
    const ref = stripDataUriPrefix(input.referenceBase64);
    const refMime = normalizeMimeType(ref.detectedMime, 'image/jpeg');
    inputBlocks.push({ type: 'image', data: ref.base64, mime_type: refMime });
    hasReference = true;
  }

  inputBlocks.push({
    type: 'text',
    text: [
      'ANTISLOP CONVERSION PSYCHOLOGY & BRAND DRIFT CALIBRATED AUDIT',
      hasReference
        ? 'Image 1 is the rendered candidate UI. Image 2 is the target Brand DNA / Moodboard reference.'
        : 'Image 1 is the rendered candidate UI.',
      input.brandSummary
        ? `Brand & Product Context: ${input.brandSummary}`
        : 'Evaluate conversion clarity, editorial credibility, brand cohesion, and zero AI slop.',
      'Score each orthogonal conversion and brand-fidelity probe independently.',
    ].join('\n'),
  });

  const questions: Record<string, Decisions.NoulQuestion> = {};
  for (const probe of CONVERSION_AND_BRAND_PROBES) {
    questions[probe.key] = {
      type: 'noul',
      instructions: probe.instructions,
      criteria: AUDIT_NOUL_CRITERIA,
    };
  }

  return traceSpan(
    'antislop.decisions.conversionAndBrandAudit',
    'llm',
    { model, hasReference, probeCount: CONVERSION_AND_BRAND_PROBES.length },
    async () => {
      const res = await withV1BetaClient((client) =>
        client.decisions.create({
          model,
          input: inputBlocks,
          questions,
        })
      );

      const probes: ConversionBrandProbeResult[] = CONVERSION_AND_BRAND_PROBES.map((spec) => {
        const passProb = readNoulProbability(res.answers, spec.key);
        return {
          key: spec.key,
          label: spec.label,
          passProb,
          passed: passProb >= AUDIT_PASS_THRESHOLD,
        };
      });

      const probByKey = new Map<string, number>(probes.map((p) => [p.key, p.passProb]));

      // Weighted Conversion Readiness Score (0..100)
      let weightedConvSum = 0;
      let convWeightTotal = 0;
      for (const spec of CONVERSION_AND_BRAND_PROBES) {
        if (spec.category !== 'conversion') continue;
        const p = probByKey.get(spec.key) ?? 0.5;
        weightedConvSum += p * spec.weight;
        convWeightTotal += spec.weight;
      }
      const conversionReadinessScore = Number(
        ((weightedConvSum / Math.max(1e-6, convWeightTotal)) * 100).toFixed(1)
      );

      // Normalized Brand Drift L2 norm over brand_drift probes: sqrt(mean((1 - p_i)^2)) in [0, 1]
      const driftComponents: number[] = [];
      for (const spec of CONVERSION_AND_BRAND_PROBES) {
        if (spec.category !== 'brand_drift') continue;
        const p = probByKey.get(spec.key) ?? 0.5;
        driftComponents.push(1 - p);
      }
      const meanSqDrift =
        driftComponents.reduce((acc, d) => acc + d * d, 0) /
        Math.max(1, driftComponents.length);
      const brandDriftNorm = Number(Math.sqrt(meanSqDrift).toFixed(4));

      // 2D Craft-vs-Conversion Quadrant
      const highConversion = conversionReadinessScore >= 70;
      const lowBrandDrift = brandDriftNorm <= 0.3;

      let quadrant: ConversionCraftQuadrant;
      if (highConversion && lowBrandDrift) {
        quadrant = 'high_yield_craft';
      } else if (!highConversion && lowBrandDrift) {
        quadrant = 'pretty_slop';
      } else if (highConversion && !lowBrandDrift) {
        quadrant = 'functional_draft';
      } else {
        quadrant = 'needs_overhaul';
      }

      return {
        conversionReadinessScore,
        brandDriftNorm,
        quadrant,
        probes,
        latencyMs: Date.now() - startedAt,
        outputTokens: 0,
      };
    }
  );
}
