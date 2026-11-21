import type { Decisions } from '@google/genai';
import type { MediaAssetInput } from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';
import {
  estimateBase64Bytes,
  normalizeMimeType,
  resolveAssetBinary,
  stripDataUriPrefix,
} from './mediaUtils.js';

export type DeepDecisionAuditMode = '900_single_pass' | '1800_dual_key_sharded';

export type DeepDecisionPillarId =
  | 'spatial_grid'
  | 'typography_micro'
  | 'wcag_contrast'
  | 'anti_slop_shield'
  | 'swiss_rhythm'
  | 'interaction_affordance'
  | 'domain_art_cohesion'
  | 'responsive_resilience'
  | 'reference_dna_fidelity';

export interface DeepDecisionAuditParams {
  mode?: DeepDecisionAuditMode;
  screenshotBase64: string;
  referenceImages?: MediaAssetInput[];
  workspaceId?: string;
  brandSummary?: string;
}

export interface DeepDecisionPillarSummary {
  id: DeepDecisionPillarId;
  label: string;
  total: number;
  passed: number;
  avgConfidence: number;
}

export interface DeepDecisionSpatialCell {
  row: number;
  col: number;
  passProb: number;
  label: string;
}

export interface DeepDecisionFailure {
  key: string;
  pillar: DeepDecisionPillarId;
  zone: string;
  check: string;
  passProb: number;
}

export interface DeepDecisionAuditResult {
  mode: DeepDecisionAuditMode;
  totalDecisions: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  latencyMs: number;
  outputTokens: 0;
  pillars: DeepDecisionPillarSummary[];
  spatialHeatmap: DeepDecisionSpatialCell[][];
  matrixDots: number[];
  topFailures: DeepDecisionFailure[];
  surgicalFixPrompt: string;
}

interface ProbeMeta {
  key: string;
  pillar: DeepDecisionPillarId;
  pillarLabel: string;
  zone: string;
  check: string;
  row?: number;
  col?: number;
}

interface CheckSpec {
  id: string;
  label: string;
  rule: string;
}

interface PillarSpec {
  id: Exclude<DeepDecisionPillarId, 'spatial_grid'>;
  label: string;
  keyPrefix: string;
  checks: readonly CheckSpec[];
}

const MAX_REF_IMAGE_BYTES = 3_500_000;
const PASS_THRESHOLD = 0.5;

const POSITIVE_NOUL_CRITERIA: Decisions.NoulCriteria = {
  true_description: 'Yes — passes craft bar cleanly.',
  false_description: 'No — violates this craft rule.',
};

const UI_ZONES = [
  { id: 'nav', label: 'Top navigation bar' },
  { id: 'hero_eyebrow', label: 'Hero eyebrow kicker' },
  { id: 'hero_h1', label: 'Hero display headline' },
  { id: 'hero_body', label: 'Hero subcopy deck' },
  { id: 'cta_bar', label: 'Primary CTA cluster' },
  { id: 'features', label: 'Feature grid section' },
  { id: 'metrics', label: 'Metrics telemetry band' },
  { id: 'cards', label: 'Showcase content cards' },
  { id: 'forms', label: 'Inputs and controls' },
  { id: 'footer', label: 'Footer colophon band' },
] as const;

const PILLAR_SPECS: readonly PillarSpec[] = [
  {
    id: 'typography_micro',
    label: 'Typography Micro',
    keyPrefix: 'typo',
    checks: [
      { id: 'scale', label: 'Display Scale', rule: 'uses intentional, commanding typographic scale contrast' },
      { id: 'tracking', label: 'Tracking Discipline', rule: 'applies crisp letter-spacing suited to font size' },
      { id: 'leading', label: 'Line Height', rule: 'maintains airy vertical line-height without line collisions' },
      { id: 'measure', label: 'Line Measure', rule: 'keeps readable text line lengths without cramped or ultra-wide wrapping' },
      { id: 'tabular', label: 'Tabular Numerals', rule: 'renders numbers and stats cleanly with aligned numeric rhythm' },
      { id: 'pairing', label: 'Font Pairing', rule: 'pairs expressive display and legible body typefaces harmoniously' },
      { id: 'rag', label: 'Rag Balance', rule: 'wraps multi-line text with clean, balanced line endings' },
      { id: 'hierarchy', label: 'Weight Hierarchy', rule: 'separates heading, label, and copy weights unmistakably' },
      { id: 'restraint', label: 'Style Restraint', rule: 'avoids chaotic mixed fonts, italics, or decorative text clutter' },
      { id: 'orphans', label: 'Zero Orphans', rule: 'avoids awkward single-word orphan lines in headings or labels' },
    ],
  },
  {
    id: 'wcag_contrast',
    label: 'WCAG Contrast',
    keyPrefix: 'wcag',
    checks: [
      { id: 'body_aa', label: 'Body >=4.5:1 Contrast', rule: 'achieves >=4.5:1 WCAG AA ink-to-surface readability' },
      { id: 'boundary', label: 'Boundary >=3:1 Contrast', rule: 'maintains >=3:1 contrast on borders, controls, and focus outlines' },
      { id: 'tonal_ratio', label: '60/30/10 Tonal Restraint', rule: 'preserves disciplined 60/30/10 canvas, surface, and accent balance' },
      { id: 'surface_sep', label: 'Surface Separation', rule: 'separates elevated surfaces cleanly from the underlying canvas' },
      { id: 'caption_legible', label: 'Caption Legibility', rule: 'keeps micro-labels and metadata sharp without faint washout' },
      { id: 'btn_legible', label: 'Button Ink Legibility', rule: 'ensures button text reads crisply against button fills' },
      { id: 'state_clarity', label: 'Active State Contrast', rule: 'keeps active, badge, and link text unmistakably legible' },
      { id: 'hairline', label: 'Hairline Subtlety', rule: 'uses refined structural dividers without harsh visual noise' },
      { id: 'glare_safe', label: 'Glare & Overlay Safety', rule: 'protects text over imagery or gradients with clean contrast backing' },
      { id: 'no_muddy_grey', label: 'Zero Muddy Greys', rule: 'renders crisp neutral tones free of muddy low-contrast greys' },
    ],
  },
  {
    id: 'anti_slop_shield',
    label: 'Anti-Slop Shield',
    keyPrefix: 'slop',
    checks: [
      { id: 'no_purple_grad', label: 'Zero Purple Gradients', rule: 'remains completely free of generic purple-indigo AI gradients' },
      { id: 'no_neon_glow', label: 'Zero Neon Glows', rule: 'avoids tacky neon box-shadow glows and laser border tropes' },
      { id: 'no_glass_bento', label: 'Zero Glass Bento Slop', rule: 'avoids cookie-cutter dark glassmorphic bento card clichés' },
      { id: 'no_sparkle_spam', label: 'Zero Sparkle Spam', rule: 'avoids cliché AI sparkle icons and generic hype pills' },
      { id: 'no_saas_buzz', label: 'Zero SaaS Buzzwords', rule: 'avoids hollow generic SaaS template copy clichés' },
      { id: 'no_inter_bland', label: 'Zero Bland Template Look', rule: 'avoids flat default Inter-everywhere template sameness' },
      { id: 'bespoke_surface', label: 'Bespoke Materiality', rule: 'projects bespoke editorial materiality instead of stock UI chrome' },
      { id: 'no_emoji_clutter', label: 'Zero Emoji Clutter', rule: 'stays free of decorative emoji spam in headers or bullets' },
      { id: 'no_fake_chrome', label: 'Zero Fake Window Chrome', rule: 'avoids gratuitous fake macOS dots or placeholder status chips' },
      { id: 'authentic_voice', label: 'Human-Curated Polish', rule: 'reads as human-directed design craft rather than AI boilerplate' },
    ],
  },
  {
    id: 'swiss_rhythm',
    label: 'Swiss Rhythm',
    keyPrefix: 'rhythm',
    checks: [
      { id: 'grid_align', label: 'Grid Alignment', rule: 'aligns edges cleanly along consistent Swiss grid tracks' },
      { id: 'proximity', label: 'Gestalt Proximity', rule: 'groups related labels and actions tighter than neighboring blocks' },
      { id: 'breathing', label: 'Negative Space', rule: 'gives focal elements generous architectural breathing room' },
      { id: 'padding_even', label: 'Balanced Padding', rule: 'applies even, intentional internal padding across containers' },
      { id: 'vertical_cadence', label: 'Vertical Cadence', rule: 'steps vertical spacing cleanly between headings, copy, and actions' },
      { id: 'column_balance', label: 'Column Balance', rule: 'balances column weights without lopsided empty voids' },
      { id: 'rule_precision', label: 'Rule Precision', rule: 'terminates borders and hairlines cleanly at grid boundaries' },
      { id: 'visual_anchor', label: 'Focal Anchor', rule: 'establishes clear focal hierarchy without competing visual clutter' },
      { id: 'density_control', label: 'Scannable Density', rule: 'keeps information density calm, structured, and easy to scan' },
      { id: 'framing_intent', label: 'Intentional Framing', rule: 'exhibits deliberate editorial composition and edge discipline' },
    ],
  },
  {
    id: 'interaction_affordance',
    label: 'Interaction UX',
    keyPrefix: 'ux',
    checks: [
      { id: 'click_clarity', label: 'Click Affordance', rule: 'signals interactive buttons and links unambiguously' },
      { id: 'hit_target', label: 'Hit Target Sizing', rule: 'sizes clickable targets generously for effortless pointer or tap use' },
      { id: 'primary_focus', label: 'Primary CTA Dominance', rule: 'elevates the primary action clearly above secondary controls' },
      { id: 'focus_ready', label: 'Focus Clarity', rule: 'frames controls cleanly with visible boundaries for focus states' },
      { id: 'icon_label', label: 'Icon-Label Clarity', rule: 'pairs icons with clear labels or unmistakable visual meaning' },
      { id: 'state_feedback', label: 'State Signaling', rule: 'distinguishes active, selected, or status tags cleanly' },
      { id: 'nav_scannable', label: 'Scannable Controls', rule: 'organizes options cleanly for rapid visual scanning' },
      { id: 'cursor_flow', label: 'Natural Action Flow', rule: 'guides reading order smoothly toward the primary interaction' },
      { id: 'no_dead_deco', label: 'Zero Misleading Deco', rule: 'avoids decorative pills that look like broken interactive buttons' },
      { id: 'form_clarity', label: 'Control Predictability', rule: 'presents inputs and triggers with clean, predictable structure' },
    ],
  },
  {
    id: 'domain_art_cohesion',
    label: 'Domain & Art Cohesion',
    keyPrefix: 'art',
    checks: [
      { id: 'domain_fit', label: 'Domain Authenticity', rule: 'matches imagery and motifs authentically to the brand domain' },
      { id: 'no_broken_img', label: 'Zero Broken Media', rule: 'displays crisp loaded media with zero broken icons or blank boxes' },
      { id: 'crop_framing', label: 'Clean Crop Framing', rule: 'frames visual subjects cleanly without awkward head or edge slicing' },
      { id: 'svg_crisp', label: 'Vector Sharpness', rule: 'renders icons and SVG graphics sharply with consistent stroke weight' },
      { id: 'palette_match', label: 'Color Temp Harmony', rule: 'harmonizes image color temperature with the UI surface palette' },
      { id: 'aspect_ratio', label: 'Aspect Integrity', rule: 'preserves natural media proportions without stretching or distortion' },
      { id: 'texture_real', label: 'Tactile Surface Quality', rule: 'renders surfaces and textures crisply without muddy compression noise' },
      { id: 'art_hierarchy', label: 'Artwork Restraint', rule: 'supports editorial copy cleanly instead of competing with headlines' },
      { id: 'icon_cohesion', label: 'Unified Iconography', rule: 'maintains cohesive icon geometry and visual weight' },
      { id: 'editorial_media', label: 'Publication Art Bar', rule: 'achieves art-directed editorial quality rather than stock clip-art' },
    ],
  },
  {
    id: 'responsive_resilience',
    label: 'Responsive Resilience',
    keyPrefix: 'resp',
    checks: [
      { id: 'zero_overflow', label: 'Zero Overflow', rule: 'keeps all elements strictly inside horizontal viewport bounds' },
      { id: 'wrap_safe', label: 'Clean Line Wrapping', rule: 'wraps headlines and flex rows cleanly without clipping characters' },
      { id: 'reflow_390', label: '390px-1440px Reflow', rule: 'retains clean structure for responsive 390px to 1440px reflow' },
      { id: 'sticky_clear', label: 'Zero Occlusion', rule: 'keeps floating or sticky elements from covering underlying text' },
      { id: 'card_reflow', label: 'Stackable Grid Tracks', rule: 'structures cards and grids cleanly for responsive column collapse' },
      { id: 'image_contain', label: 'Media Containment', rule: 'constrains images and embeds cleanly inside container edges' },
      { id: 'truncation_safe', label: 'Zero Ugly Ellipsis', rule: 'displays labels in full without cramped mid-word truncation' },
      { id: 'fold_balance', label: 'Above-Fold Balance', rule: 'frames primary context cleanly inside the initial viewport fold' },
      { id: 'height_safe', label: 'Flexible Height Flow', rule: 'avoids brittle fixed-height containers that clip overflowing copy' },
      { id: 'edge_margins', label: 'Safe Viewport Gutters', rule: 'maintains clean outer margins away from viewport edges' },
    ],
  },
  {
    id: 'reference_dna_fidelity',
    label: 'Reference DNA Fidelity',
    keyPrefix: 'dna',
    checks: [
      { id: 'palette_dna', label: 'Palette DNA Transfer', rule: 'faithfully transfers reference surface, ink, and accent DNA' },
      { id: 'type_personality', label: 'Typographic Voice', rule: 'embodies the editorial typographic character of the target brand' },
      { id: 'elevation_dna', label: 'Elevation Philosophy', rule: 'applies consistent flat, tactile, or architectural depth rules' },
      { id: 'radius_cohesion', label: 'Corner Radius Cohesion', rule: 'uses consistent corner radii matching the overall visual language' },
      { id: 'mood_transfer', label: 'Atmosphere Match', rule: 'captures the intended studio atmosphere and material tone' },
      { id: 'editorial_poise', label: 'Editorial Poise', rule: 'achieves calm, publication-grade pacing and visual authority' },
      { id: 'detail_finish', label: 'Micro-Detail Finish', rule: 'finishes borders, badges, and metadata with obsessive precision' },
      { id: 'distinctiveness', label: 'Memorable Signature', rule: 'carries unmistakable bespoke identity rather than generic neutrality' },
      { id: 'cross_zone_unity', label: 'Cross-Zone Cohesion', rule: 'stays visually unified with neighboring sections across the canvas' },
      { id: 'cd_shippable', label: 'Creative Director Bar', rule: 'meets senior Creative Director launch quality without obvious flaws' },
    ],
  },
] as const;

function buildDeep900Spec(): {
  questions: Record<string, Decisions.NoulQuestion>;
  metaByKey: Map<string, ProbeMeta>;
  orderedKeys: string[];
} {
  const questions: Record<string, Decisions.NoulQuestion> = {};
  const metaByKey = new Map<string, ProbeMeta>();
  const orderedKeys: string[] = [];

  // Pillar 1: spatial_grid (10x10 = 100 probes: cell_r0_c0 .. cell_r9_c9)
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const key = `cell_r${row}_c${col}`;
      const yStart = row * 10;
      const yEnd = (row + 1) * 10;
      const xStart = col * 10;
      const xEnd = (col + 1) * 10;
      questions[key] = {
        type: 'noul',
        instructions: `In tile [${row},${col}] (y=${yStart}-${yEnd}%, x=${xStart}-${xEnd}%), are elements cleanly spaced, high-contrast, unclipped, and overlap-free?`,
        criteria: POSITIVE_NOUL_CRITERIA,
      };
      metaByKey.set(key, {
        key,
        pillar: 'spatial_grid',
        pillarLabel: 'Spatial Grid (10x10)',
        zone: `Tile [${row},${col}] (y=${yStart}-${yEnd}%, x=${xStart}-${xEnd}%)`,
        check: 'Contrast, spacing, alignment & zero clipping',
        row,
        col,
      });
      orderedKeys.push(key);
    }
  }

  // Pillars 2..9: 8 pillars x 10 zones x 10 checks = 800 probes
  for (const pillar of PILLAR_SPECS) {
    for (const zone of UI_ZONES) {
      for (const check of pillar.checks) {
        const key = `${pillar.keyPrefix}_${zone.id}_${check.id}`;
        questions[key] = {
          type: 'noul',
          instructions: `In the ${zone.label}, confirm it ${check.rule} with zero visual defects.`,
          criteria: POSITIVE_NOUL_CRITERIA,
        };
        metaByKey.set(key, {
          key,
          pillar: pillar.id,
          pillarLabel: pillar.label,
          zone: zone.label,
          check: check.label,
        });
        orderedKeys.push(key);
      }
    }
  }

  return { questions, metaByKey, orderedKeys };
}

const DEEP_900_SPEC = buildDeep900Spec();

interface EvaluatedProbe {
  meta: ProbeMeta;
  passProb: number;
  confidence: number;
  passed: boolean;
  shardLabel?: string;
}

function readAnswerMaps(
  answers: Record<string, Decisions.Answer> | undefined,
  shardLabel?: string
): Map<string, EvaluatedProbe> {
  const map = new Map<string, EvaluatedProbe>();
  for (const key of DEEP_900_SPEC.orderedKeys) {
    const meta = DEEP_900_SPEC.metaByKey.get(key)!;
    const ans = answers?.[key];
    let passProb = 0.5;
    let confidence = 0.5;
    if (ans && ans.type === 'noul') {
      passProb = Number(Math.max(0.01, Math.min(0.99, ans.noul)).toFixed(3));
      confidence = Number(Math.max(0, Math.min(1, ans.confidence ?? Math.max(passProb, 1 - passProb))).toFixed(3));
    }
    map.set(key, {
      meta,
      passProb,
      confidence,
      passed: passProb >= PASS_THRESHOLD,
      shardLabel,
    });
  }
  return map;
}

function buildSurgicalFixPrompt(
  heatmap: DeepDecisionSpatialCell[][],
  pillars: DeepDecisionPillarSummary[],
  topFailures: DeepDecisionFailure[],
  mode: DeepDecisionAuditMode,
  totalDecisions: number,
  passRate: number
): string {
  const worstCells = heatmap
    .flat()
    .filter((c) => c.passProb < 0.6)
    .sort((a, b) => a.passProb - b.passProb)
    .slice(0, 4);

  const weakestPillars = [...pillars]
    .sort((a, b) => a.passed / Math.max(1, a.total) - b.passed / Math.max(1, b.total))
    .slice(0, 3);

  const parts: string[] = [
    `Surgical Gemini 4 UI upgrade directed by ${totalDecisions}-probe calibrated Decisions API audit (${passRate.toFixed(1)}% pass rate, mode=${mode}):`,
  ];

  if (worstCells.length > 0) {
    const cellSummary = worstCells
      .map(
        (c) =>
          `Cell [${c.row},${c.col}] (y=${c.row * 10}-${(c.row + 1) * 10}%, x=${c.col * 10}-${(c.col + 1) * 10}%, P(craft)=${Math.round(c.passProb * 100)}%)`
      )
      .join('; ');
    parts.push(`1) Fix spatial viewport defects in ${cellSummary} by eliminating overlap/clipping, tightening alignment, and restoring breathing room.`);
  } else {
    parts.push('1) Preserve overall spatial grid balance while tightening micro-alignment and edge margins across all viewport quadrants.');
  }

  if (weakestPillars.length > 0) {
    const pillarSummary = weakestPillars
      .map((p) => `${p.label} (${p.passed}/${p.total} passed)`)
      .join(', ');
    parts.push(`2) Reinforce weakest engineering pillars: ${pillarSummary}.`);
  }

  const actionableFailures = topFailures.slice(0, 5);
  if (actionableFailures.length > 0) {
    const failureLines = actionableFailures
      .map((f) => `${f.zone} — ${f.check} (${Math.round(f.passProb * 100)}%)`)
      .join('; ');
    parts.push(`3) Resolve top failing probes: ${failureLines}.`);
  }

  parts.push('4) Enforce >=4.5:1 WCAG AA body contrast, crisp editorial font pairing, disciplined 60/30/10 palette restraint, and zero generic AI SaaS gradients or glowing borders.');
  return parts.join(' ');
}

/**
 * Executes a calibrated 900-probe (or 1,800-probe dual-key sharded) spatial & UI-craft
 * Decisions API X-Ray audit in a single 0-output-token pass (or 2 parallel shards).
 */
export async function runDeepDecisionAudit(
  params: DeepDecisionAuditParams
): Promise<DeepDecisionAuditResult> {
  const mode: DeepDecisionAuditMode = params.mode ?? '900_single_pass';
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_DECISIONS;

  if (!params.screenshotBase64 || params.screenshotBase64.trim().length < 32) {
    throw new Error('screenshotBase64 is required for Deep 900 Decisions audit');
  }

  return traceSpan(
    'antislop.decisions.deepAudit',
    'llm',
    {
      model,
      mode,
      probeCount: mode === '1800_dual_key_sharded' ? 1800 : 900,
      workspaceId: params.workspaceId,
      referenceCount: Math.min(2, params.referenceImages?.length ?? 0),
    },
    async () => {
      const { base64: cleanBase64, detectedMime } = stripDataUriPrefix(params.screenshotBase64);
      const screenshotMime = normalizeMimeType(detectedMime, 'image/jpeg');

      // Resolve up to 2 reference moodboard images safely within token budget
      const refBlocks: Decisions.DecisionInputContent[] = [];
      if (Array.isArray(params.referenceImages) && params.referenceImages.length > 0) {
        let attached = 0;
        for (const asset of params.referenceImages) {
          if (attached >= 2) break;
          if (asset.modality === 'motion_video' || asset.modality === 'voice_audio') continue;
          const binary = await resolveAssetBinary(asset);
          if (!binary || !binary.mimeType.startsWith('image/')) continue;
          if (estimateBase64Bytes(binary.base64) > MAX_REF_IMAGE_BYTES) continue;
          refBlocks.push({
            type: 'image',
            data: binary.base64,
            mime_type: binary.mimeType,
          });
          attached += 1;
        }
      }

      const contextSummary = [
        'ANTISLOP 900-PROBE SPATIAL & CRAFT DECISION X-RAY',
        `Workspace: ${params.workspaceId || 'active-workspace'}`,
        params.brandSummary ? `Brand / Aesthetic Context: ${params.brandSummary}` : 'Evaluate against museum-grade editorial web craft, WCAG AA contrast, Swiss grid alignment, and zero AI slop.',
        'Evaluate the primary rendered desktop screenshot (and attached reference images if present) across all 900 orthogonal UI engineering probes.',
      ].join('\n');

      const baseInput: Decisions.DecisionInputContent[] = [
        {
          type: 'image',
          data: cleanBase64,
          mime_type: screenshotMime,
        },
        ...refBlocks,
        {
          type: 'text',
          text: contextSummary,
        },
      ];

      let shardRuns: Array<Map<string, EvaluatedProbe>>;

      if (mode === '1800_dual_key_sharded') {
        const stressInput: Decisions.DecisionInputContent[] = [
          {
            type: 'image',
            data: cleanBase64,
            mime_type: screenshotMime,
          },
          ...refBlocks,
          {
            type: 'text',
            text: `${contextSummary}\n\n[SHARD B — STRESS & EDGE RIGOR PASS: Audit the exact same 900 probes under strict 390px-to-1440px responsive reflow scrutiny, harsh glare legibility, and senior Creative Director launch-gate standards.]`,
          },
        ];

        const [resA, resB] = await Promise.all([
          withV1BetaClient((client) =>
            client.decisions.create({
              model,
              input: baseInput,
              questions: DEEP_900_SPEC.questions,
            })
          ),
          withV1BetaClient((client) =>
            client.decisions.create({
              model,
              input: stressInput,
              questions: DEEP_900_SPEC.questions,
            })
          ),
        ]);

        shardRuns = [
          readAnswerMaps(resA.answers, 'Desktop/Spatial'),
          readAnswerMaps(resB.answers, 'Stress/Edge'),
        ];
      } else {
        const res = await withV1BetaClient((client) =>
          client.decisions.create({
            model,
            input: baseInput,
            questions: DEEP_900_SPEC.questions,
          })
        );
        shardRuns = [readAnswerMaps(res.answers)];
      }

      const allEvaluations: EvaluatedProbe[] = [];
      for (const map of shardRuns) {
        for (const key of DEEP_900_SPEC.orderedKeys) {
          allEvaluations.push(map.get(key)!);
        }
      }

      const totalDecisions = allEvaluations.length;
      const passedCount = allEvaluations.filter((e) => e.passed).length;
      const failedCount = totalDecisions - passedCount;
      const passRate = Number(((passedCount / Math.max(1, totalDecisions)) * 100).toFixed(1));

      // Aggregate 9 engineering pillars
      const pillarOrder: Array<{ id: DeepDecisionPillarId; label: string }> = [
        { id: 'spatial_grid', label: 'Spatial Grid (10x10)' },
        ...PILLAR_SPECS.map((p) => ({ id: p.id, label: p.label })),
      ];

      const pillars: DeepDecisionPillarSummary[] = pillarOrder.map(({ id, label }) => {
        const items = allEvaluations.filter((e) => e.meta.pillar === id);
        const passed = items.filter((e) => e.passed).length;
        const avgConfidence =
          items.length > 0
            ? Number((items.reduce((acc, item) => acc + item.confidence, 0) / items.length).toFixed(3))
            : 0;
        return {
          id,
          label,
          total: items.length,
          passed,
          avgConfidence,
        };
      });

      // Build 10x10 spatial heatmap (averaged across shards in 1800 mode)
      const spatialHeatmap: DeepDecisionSpatialCell[][] = [];
      for (let row = 0; row < 10; row++) {
        const rowCells: DeepDecisionSpatialCell[] = [];
        for (let col = 0; col < 10; col++) {
          const key = `cell_r${row}_c${col}`;
          const shardVals = shardRuns.map((m) => m.get(key)?.passProb ?? 0.5);
          const avgProb = Number(
            (shardVals.reduce((acc, v) => acc + v, 0) / shardVals.length).toFixed(3)
          );
          rowCells.push({
            row,
            col,
            passProb: avgProb,
            label: `Cell [${row},${col}] (y=${row * 10}-${(row + 1) * 10}%, x=${col * 10}-${(col + 1) * 10}%)`,
          });
        }
        spatialHeatmap.push(rowCells);
      }

      // Build 900-dot probability mosaic (0..100 integer percentages)
      const matrixDots: number[] = DEEP_900_SPEC.orderedKeys.map((key) => {
        const shardVals = shardRuns.map((m) => m.get(key)?.passProb ?? 0.5);
        const avgProb = shardVals.reduce((acc, v) => acc + v, 0) / shardVals.length;
        return Math.max(0, Math.min(100, Math.round(avgProb * 100)));
      });

      // Top 12 lowest pass-probability probes across the audit
      const topFailures: DeepDecisionFailure[] = [...allEvaluations]
        .sort((a, b) => a.passProb - b.passProb)
        .slice(0, 12)
        .map((item) => ({
          key: item.shardLabel ? `${item.meta.key} (${item.shardLabel})` : item.meta.key,
          pillar: item.meta.pillar,
          zone: item.meta.zone,
          check: item.meta.check,
          passProb: item.passProb,
        }));

      const surgicalFixPrompt = buildSurgicalFixPrompt(
        spatialHeatmap,
        pillars,
        topFailures,
        mode,
        totalDecisions,
        passRate
      );

      return {
        mode,
        totalDecisions,
        passedCount,
        failedCount,
        passRate,
        latencyMs: Date.now() - startedAt,
        outputTokens: 0,
        pillars,
        spatialHeatmap,
        matrixDots,
        topFailures,
        surgicalFixPrompt,
      };
    }
  );
}
