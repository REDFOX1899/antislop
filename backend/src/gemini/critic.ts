import type { Decisions } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import type {
  DecisionMetric,
  DecisionsScorecard,
  DesignManifest,
  MediaAssetInput,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';
import {
  estimateBase64Bytes,
  normalizeMimeType,
  resolveAssetBinary,
  stripDataUriPrefix,
} from './mediaUtils.js';

export interface EvaluateVisualCandidateParams {
  renderedDesktopBase64: string;
  renderedMobileBase64?: string;
  referenceAssets: MediaAssetInput[];
  manifest?: DesignManifest;
  domAudit: DecisionsScorecard['domAudit'];
}

const MAX_REF_IMAGE_BYTES = 3_500_000;

/**
 * 12 calibrated probes evaluated in a SINGLE ~250ms Decisions API pass (0 output tokens):
 * - 6 `score` probes (5-level ordered rubrics mapped cleanly onto 0..10)
 * - 4 `noul` probes (calibrated binary probabilities P(true))
 * - 2 `choice` probes (aesthetic classification + primary defect diagnosis)
 */
const ANTISLOP_DECISION_QUESTIONS: Record<string, Decisions.Question> = {
  aestheticMatch: {
    type: 'score',
    instructions:
      'Compare the rendered UI screenshot(s) against the reference moodboard images and target DesignManifest. How faithfully does the rendered UI embody the visual language, materiality, palette atmosphere, and editorial identity of the references?',
    criteria: [
      '0: Completely unrelated to the references; feels like an unstyled or generic default template.',
      '1: Barely echoes 1 surface color, but typography, layout, and atmosphere clash with the references.',
      '2: Partial resemblance in palette or mood, yet structural craft and visual tone remain generic.',
      '3: Strong authentic alignment across color atmosphere, typographic personality, and composition.',
      '4: Museum-grade synthesis — the UI unmistakably feels born from the exact world of the moodboard references.',
    ],
  },
  slopPenalty: {
    type: 'score',
    instructions:
      'Rate the severity of generic "AI slop" UI clichés present in the rendered UI (purple/indigo dark-navy gradients, glowing neon borders, cookie-cutter dark glassmorphic bento cards, sparkle emoji spam, stock SaaS buzzwords, bland Inter-everywhere template look). Higher level means WORSE AI slop.',
    criteria: [
      '0: Zero AI slop — unmistakably bespoke, human-directed editorial or architectural craft.',
      '1: Almost no generic clichés; clean bespoke aesthetic with only minor conventional patterns.',
      '2: Noticeable generic SaaS template habits mixed with partial custom styling.',
      '3: Heavy AI slop — predictable neon/purple gradient tropes, generic dark cards, or cliché SaaS boilerplate.',
      '4: Extreme boilerplate AI slop — textbook purple-glowing generic AI landing page with cliché badges and buzzwords.',
    ],
  },
  typographyCraft: {
    type: 'score',
    instructions:
      'Evaluate typographic hierarchy, font pairing expressiveness, headline tracking, line-length discipline, body legibility, and editorial poise in the rendered UI screenshot(s).',
    criteria: [
      '0: Broken, colliding, unreadable, or completely unstyled default system typography.',
      '1: Weak hierarchy with generic sans-serif sizing and cramped or awkward spacing.',
      '2: Functional readable typography, but lacks editorial contrast, rhythm, or distinctive character.',
      '3: Refined intentional font pairing, crisp hierarchy, balanced scale, and strong readability.',
      '4: Masterful publication-grade typography with commanding display scale, deliberate micro-labels, and effortless legibility.',
    ],
  },
  visualRhythm: {
    type: 'score',
    instructions:
      'Evaluate spatial composition, grid alignment, negative space breathing room, section pacing, and visual balance across the desktop (and mobile if provided) rendered screenshot(s).',
    criteria: [
      '0: Chaotic, overcrowded, misaligned, or severely broken spatial layout.',
      '1: Cramped padding, inconsistent margins, or awkward uneven card/column rhythm.',
      '2: Acceptable standard layout spacing, though repetitive or visually uninspired.',
      '3: Disciplined grid discipline, generous breathing room, and well-paced section cadence.',
      '4: Exceptional architectural rhythm, effortless negative space, and balanced editorial framing.',
    ],
  },
  colorHarmony: {
    type: 'score',
    instructions:
      'Evaluate color palette cohesion, tonal restraint, surface-to-ink contrast, and accent discipline in the rendered UI screenshot(s).',
    criteria: [
      '0: Clashing colors, jarring saturation, or illegible ink-on-background contrast.',
      '1: Muddy or incoherent color usage with competing accents.',
      '2: Passable standard color scheme, though flat or slightly generic.',
      '3: Cohesive intentional palette with refined surface separation and disciplined accent usage.',
      '4: Gallery-grade color harmony with effortless tonal depth, crisp contrast, and surgical accent restraint.',
    ],
  },
  motionCohesion: {
    type: 'score',
    instructions:
      'Evaluate perceived interactive poise, clear hover/CTA affordances, structured visual flow, and cohesion with the target motion philosophy in the rendered UI.',
    criteria: [
      '0: Confusing dead layout with unclear interactive affordances or jarring visual clutter.',
      '1: Clunky or gaudy visual cues (excessive glow, noisy decorations) undermining interactive clarity.',
      '2: Standard functional controls with basic interactive signaling.',
      '3: Poised, deliberate interactive hierarchy with clean button/link affordances matching the aesthetic.',
      '4: Seamless editorial choreography — every interactive cue, transition hint, and flow line feels calm, intentional, and tactile.',
    ],
  },
  layoutBroken: {
    type: 'noul',
    instructions:
      'Does the rendered UI exhibit any broken layout, clipped text, overlapping elements, unintended horizontal overflow, awkward empty holes, or busted responsive framing?',
    criteria: {
      true_description: 'Yes — visible layout breakage, overlap, clipping, or severe horizontal overflow exists.',
      false_description: 'No — layout alignment, framing, and responsive structure appear intact and clean.',
    },
  },
  contrastFailing: {
    type: 'noul',
    instructions:
      'Are there any readable text elements, navigation links, labels, or buttons in the rendered UI with poor foreground-to-background contrast (failing WCAG AA legibility)?',
    criteria: {
      true_description: 'Yes — some text, labels, or buttons are washed out, faint, or hard to read against their background.',
      false_description: 'No — all text, labels, and interactive controls have crisp, comfortable contrast.',
    },
  },
  genericAiCliche: {
    type: 'noul',
    instructions:
      'Does the rendered UI look like a generic AI-generated SaaS template (e.g. dark slate/navy background with purple-indigo gradients, neon glowing borders, sparkle badges, generic Inter cards)?',
    criteria: {
      true_description: 'Yes — unmistakably exhibits generic AI-generated SaaS template clichés.',
      false_description: 'No — looks genuinely bespoke, curated, and free of generic AI template clichés.',
    },
  },
  productionReady: {
    type: 'noul',
    instructions:
      'Would a discerning Creative Director at an elite design studio approve this rendered UI as shippable, polished, visually coherent, and free of embarrassing visual bugs?',
    criteria: {
      true_description: 'Yes — high-craft, cohesive, legible, and ready to ship to production.',
      false_description: 'No — requires another refinement pass to fix aesthetic, typographic, contrast, or layout flaws.',
    },
  },
  dominantAestheticClass: {
    type: 'choice',
    instructions:
      'Classify the dominant visual aesthetic actually achieved by the rendered UI screenshot(s).',
    criteria: {
      editorial_print: 'High-craft editorial print / broadsheet magazine typography and structured hairline rules.',
      swiss_architectural: 'Disciplined Swiss international grid, mathematical typography, crisp utilitarian framing.',
      warm_tactile_craft: 'Warm organic materiality, paper/ceramic/textile palette, gallery monograph calm.',
      avant_garde_studio: 'Bold contemporary design studio, expressive display scale, sculptural negative space.',
      luxury_minimal: 'Refined understated luxury minimalism with high tonal restraint and poised whitespace.',
      generic_ai_saas_slop: 'Generic boilerplate AI/SaaS template (purple gradients, neon dark cards, cookie-cutter grid).',
    },
  },
  primaryDefectClass: {
    type: 'choice',
    instructions:
      'Identify the single highest-impact visual or structural defect in the rendered UI that should be fixed next (or choose "none" if the UI is already publication-grade).',
    criteria: {
      none: 'No significant visual or structural defects — meets high-craft publication standards.',
      generic_ai_cliche: 'Still reads like a generic AI SaaS template or lacks bespoke moodboard identity.',
      weak_typography: 'Typography hierarchy, font pairing, tracking, or legibility feels weak or generic.',
      poor_color_harmony: 'Color palette deviates from the moodboards or feels muddy/clashing.',
      cramped_rhythm: 'Spacing, padding, negative space, or visual grid cadence feels cramped or unbalanced.',
      broken_layout_or_overflow: 'Elements overlap, clip, misalign, or cause horizontal overflow.',
      low_contrast_legibility: 'Text or buttons lack sufficient foreground-to-background contrast.',
      broken_or_missing_imagery: 'Images appear broken, awkwardly cropped, mismatched, or empty.',
    },
  },
};

function readScoreMetric(
  answers: Record<string, Decisions.Answer> | undefined,
  id: string,
  label: string,
  opts: { invertPass?: boolean; threshold: number; thresholdDescription: string }
): DecisionMetric {
  const ans = answers?.[id];
  if (ans && ans.type === 'score') {
    // 5-level rubric (0..4) scaled cleanly onto 0..10
    const normalized = Number(Math.max(0, Math.min(10, ans.score * 2.5)).toFixed(2));
    const passed = opts.invertPass ? normalized <= opts.threshold : normalized >= opts.threshold;
    return {
      id,
      label,
      type: 'score',
      value: normalized,
      confidence: Number((ans.confidence ?? 0.5).toFixed(3)),
      passed,
      thresholdDescription: opts.thresholdDescription,
    };
  }
  const fallbackVal = opts.invertPass ? 5.0 : 5.0;
  return {
    id,
    label,
    type: 'score',
    value: fallbackVal,
    confidence: 0,
    passed: false,
    thresholdDescription: opts.thresholdDescription,
  };
}

function readNoulMetric(
  answers: Record<string, Decisions.Answer> | undefined,
  id: string,
  label: string,
  opts: { passWhenTrue: boolean; threshold: number; thresholdDescription: string }
): DecisionMetric {
  const ans = answers?.[id];
  if (ans && ans.type === 'noul') {
    const prob = Number(Math.max(0, Math.min(1, ans.noul)).toFixed(3));
    const passed = opts.passWhenTrue ? prob >= opts.threshold : prob < opts.threshold;
    return {
      id,
      label,
      type: 'noul',
      value: prob,
      confidence: Number((ans.confidence ?? 0.5).toFixed(3)),
      passed,
      thresholdDescription: opts.thresholdDescription,
    };
  }
  return {
    id,
    label,
    type: 'noul',
    value: opts.passWhenTrue ? 0.5 : 0.5,
    confidence: 0,
    passed: false,
    thresholdDescription: opts.thresholdDescription,
  };
}

function readChoiceMetric(
  answers: Record<string, Decisions.Answer> | undefined,
  id: string,
  label: string,
  opts: { isPassingChoice: (choice: string) => boolean; thresholdDescription: string }
): DecisionMetric {
  const ans = answers?.[id];
  if (ans && ans.type === 'choice') {
    const choiceLabel = ans.choice;
    const confidence = Number((ans.confidence ?? 0.5).toFixed(3));
    return {
      id,
      label,
      type: 'choice',
      value: confidence,
      confidence,
      choiceLabel,
      passed: opts.isPassingChoice(choiceLabel),
      thresholdDescription: opts.thresholdDescription,
    };
  }
  return {
    id,
    label,
    type: 'choice',
    value: 0,
    confidence: 0,
    choiceLabel: 'unknown',
    passed: false,
    thresholdDescription: opts.thresholdDescription,
  };
}

function buildCriticActionDirective(
  metrics: DecisionsScorecard['metrics'],
  domAudit: DecisionsScorecard['domAudit'],
  overallTasteScore: number,
  passedAllGates: boolean
): string {
  if (passedAllGates) {
    return `All AntiSlop visual taste & deterministic DOM gates passed (${overallTasteScore.toFixed(1)}/100, aesthetic=${metrics.dominantAestheticClass.choiceLabel}). Ready to ship.`;
  }

  const actions: string[] = [];

  if (domAudit.horizontalOverflowPx > 12) {
    actions.push(
      `HARD FIX: Eliminate ${domAudit.horizontalOverflowPx}px horizontal overflow (constrain wide grids/images with max-w-full and overflow-x-hidden).`
    );
  }
  if (domAudit.overlappingTextNodes > 2) {
    actions.push(
      `HARD FIX: Resolve ${domAudit.overlappingTextNodes} overlapping text node(s) by restoring normal document flow, generous line-height, and non-colliding spacing.`
    );
  }
  if (domAudit.brokenImageCount > 0) {
    actions.push(
      `HARD FIX: Fix ${domAudit.brokenImageCount} broken <img> tag(s) — only reference verified local /generated/* assets or inline SVG art.`
    );
  }
  if (domAudit.consoleErrorCount > 0) {
    actions.push(
      `HARD FIX: Eliminate ${domAudit.consoleErrorCount} browser console/runtime error(s).`
    );
  }

  if (!metrics.genericAiCliché.passed || !metrics.slopPenalty.passed || metrics.dominantAestheticClass.choiceLabel === 'generic_ai_saas_slop') {
    actions.push(
      `PURGE AI SLOP (slopPenalty=${metrics.slopPenalty.value.toFixed(1)}/10, P(cliché)=${metrics.genericAiCliché.value.toFixed(2)}): Remove any generic dark-slate/purple gradients, glowing borders, or cookie-cutter SaaS cards; fully embody the manifest's bespoke material ground and typography.`
    );
  }
  if (!metrics.aestheticMatch.passed) {
    actions.push(
      `ELEVATE MOODBOARD FIDELITY (aestheticMatch=${metrics.aestheticMatch.value.toFixed(1)}/10): Pull palette tones, surface warmth, framing geometry, and editorial voice much closer to the reference moodboards.`
    );
  }
  if (!metrics.contrastFailing.passed) {
    actions.push(
      `FIX CONTRAST (P(contrastFailing)=${metrics.contrastFailing.value.toFixed(2)}): Darken inkPrimary/inkSecondary on light surfaces (or brighten on dark surfaces) to guarantee >= 4.5:1 WCAG AA readability across all copy and buttons.`
    );
  }
  if (!metrics.typographyCraft.passed) {
    actions.push(
      `SHARPEN TYPOGRAPHY (typographyCraft=${metrics.typographyCraft.value.toFixed(1)}/10): Strengthen display-to-body scale contrast, ensure Google Fonts load cleanly, refine headline letter-spacing, and add disciplined uppercase mono eyebrows.`
    );
  }
  if (!metrics.visualRhythm.passed || !metrics.layoutBroken.passed) {
    actions.push(
      `REFINE GRID & RHYTHM (visualRhythm=${metrics.visualRhythm.value.toFixed(1)}/10, P(layoutBroken)=${metrics.layoutBroken.value.toFixed(2)}): Increase section breathing room, align columns to a crisp 12-column grid, and remove crowded card clutter.`
    );
  }
  if (!metrics.colorHarmony.passed) {
    actions.push(
      `HARMONIZE PALETTE (colorHarmony=${metrics.colorHarmony.value.toFixed(1)}/10): Restrict colors strictly to the manifest's canvas, surface, ink, and one disciplined accent.`
    );
  }

  if (metrics.primaryDefectClass.choiceLabel && metrics.primaryDefectClass.choiceLabel !== 'none') {
    actions.push(`Primary defect identified by Decisions API: "${metrics.primaryDefectClass.choiceLabel}".`);
  }

  return actions.join(' ');
}

/**
 * Single-pass calibrated visual critic powered by `gemini-decision-1` on `v1beta`
 * (0 output tokens, ~250ms), fused with deterministic Puppeteer DOM integrity gates.
 */
export async function evaluateVisualCandidate(
  params: EvaluateVisualCandidateParams
): Promise<DecisionsScorecard> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_DECISIONS;

  return traceSpan(
    'antislop.critic.evaluateVisualCandidate',
    'llm',
    {
      model,
      referenceCount: Math.min(4, params.referenceAssets.length),
      hasMobileScreenshot: Boolean(params.renderedMobileBase64),
      domAudit: params.domAudit,
      vibeTitle: params.manifest?.vibeTitle,
    },
    async () => {
      // Collect up to 4 reference moodboard/webcam images capped safely under 262K token budget
      const refImages: Array<{ base64: string; mimeType: string; label?: string }> = [];
      for (const asset of params.referenceAssets) {
        if (refImages.length >= 4) break;
        if (asset.modality === 'motion_video' || asset.modality === 'voice_audio') continue;
        const binary = await resolveAssetBinary(asset);
        if (!binary || !binary.mimeType.startsWith('image/')) continue;
        if (estimateBase64Bytes(binary.base64) > MAX_REF_IMAGE_BYTES) continue;
        refImages.push({
          base64: binary.base64,
          mimeType: binary.mimeType,
          label: asset.label,
        });
      }

      const { base64: desktopBase64, detectedMime: desktopMime } = stripDataUriPrefix(
        params.renderedDesktopBase64
      );
      const mobileClean = params.renderedMobileBase64
        ? stripDataUriPrefix(params.renderedMobileBase64)
        : null;

      const buildDecisionInput = (maxRefs: number): Decisions.DecisionInputContent[] => {
        const blocks: Decisions.DecisionInputContent[] = [];

        const manifestSummary = params.manifest
          ? [
              `Target Aesthetic Title: "${params.manifest.vibeTitle}"`,
              `Editorial Rationale: ${params.manifest.editorialRationale}`,
              `Target Palette: canvas=${params.manifest.tokens.palette.canvas}, surface=${params.manifest.tokens.palette.surface}, ink=${params.manifest.tokens.palette.inkPrimary}, accent=${params.manifest.tokens.palette.accent}`,
              `Target Typography: display="${params.manifest.tokens.typography.displayFont}", body="${params.manifest.tokens.typography.bodyFont}", mono="${params.manifest.tokens.typography.monoFont}"`,
              `Elevation Philosophy: ${params.manifest.tokens.geometry.elevationPhilosophy}`,
              `Anti-Slop Ban List: ${params.manifest.tokens.antiSlopBanList.join('; ')}`,
            ].join('\n')
          : 'No explicit manifest provided; evaluate visual craft, editorial authenticity, legibility, and freedom from generic AI SaaS clichés.';

        blocks.push({
          type: 'text',
          text: `ANTISLOP VISUAL CRITIC EVALUATION CONTEXT:\n${manifestSummary}\n\nDeterministic Browser DOM Audit:\n- Viewport: ${params.domAudit.viewportWidth}x${params.domAudit.viewportHeight}\n- Horizontal overflow: ${params.domAudit.horizontalOverflowPx}px\n- Overlapping text nodes: ${params.domAudit.overlappingTextNodes}\n- Broken images: ${params.domAudit.brokenImageCount}\n- Console errors: ${params.domAudit.consoleErrorCount}`,
        });

        const selectedRefs = refImages.slice(0, maxRefs);
        selectedRefs.forEach((ref, idx) => {
          blocks.push({
            type: 'text',
            text: `[Reference Moodboard Image #${idx + 1}${ref.label ? ` — ${ref.label}` : ''}]`,
          });
          blocks.push({
            type: 'image',
            data: ref.base64,
            mime_type: ref.mimeType,
          });
        });

        blocks.push({
          type: 'text',
          text: `[CANDIDATE RENDERED DESKTOP UI SCREENSHOT (${params.domAudit.viewportWidth}x${params.domAudit.viewportHeight})]`,
        });
        blocks.push({
          type: 'image',
          data: desktopBase64,
          mime_type: normalizeMimeType(desktopMime, 'image/png'),
        });

        if (mobileClean && mobileClean.base64.length > 32) {
          blocks.push({
            type: 'text',
            text: '[CANDIDATE RENDERED MOBILE UI SCREENSHOT (390x844)]',
          });
          blocks.push({
            type: 'image',
            data: mobileClean.base64,
            mime_type: normalizeMimeType(mobileClean.detectedMime, 'image/png'),
          });
        }

        return blocks;
      };

      // Single-pass Decisions API call (with payload-trim fallback if >4 refs hit context limit)
      let response: Decisions.CreateDecisionResponse;
      try {
        response = await withV1BetaClient((client) =>
          client.decisions.create({
            model,
            input: buildDecisionInput(4),
            questions: ANTISLOP_DECISION_QUESTIONS,
          })
        );
      } catch {
        response = await withV1BetaClient((client) =>
          client.decisions.create({
            model,
            input: buildDecisionInput(2),
            questions: ANTISLOP_DECISION_QUESTIONS,
          })
        );
      }

      const answers = response.answers;

      const aestheticMatch = readScoreMetric(answers, 'aestheticMatch', 'Aesthetic Match', {
        threshold: 7.0,
        thresholdDescription: '>= 7.0 / 10',
      });
      const slopPenalty = readScoreMetric(answers, 'slopPenalty', 'AI Slop Penalty', {
        invertPass: true,
        threshold: 3.8,
        thresholdDescription: '<= 3.8 / 10 (lower is better)',
      });
      const typographyCraft = readScoreMetric(answers, 'typographyCraft', 'Typography Craft', {
        threshold: 6.8,
        thresholdDescription: '>= 6.8 / 10',
      });
      const visualRhythm = readScoreMetric(answers, 'visualRhythm', 'Visual Rhythm', {
        threshold: 6.8,
        thresholdDescription: '>= 6.8 / 10',
      });
      const colorHarmony = readScoreMetric(answers, 'colorHarmony', 'Color Harmony', {
        threshold: 6.8,
        thresholdDescription: '>= 6.8 / 10',
      });
      const motionCohesion = readScoreMetric(answers, 'motionCohesion', 'Motion Cohesion', {
        threshold: 6.5,
        thresholdDescription: '>= 6.5 / 10',
      });

      const layoutBrokenRaw = readNoulMetric(answers, 'layoutBroken', 'Layout Broken', {
        passWhenTrue: false,
        threshold: 0.45,
        thresholdDescription: 'P(true) < 0.45 & DOM overflow <= 12px, 0 console errors, 0 broken images',
      });
      const domLayoutFailed =
        params.domAudit.horizontalOverflowPx > 12 ||
        params.domAudit.consoleErrorCount > 0 ||
        params.domAudit.brokenImageCount > 0;
      const layoutBroken: DecisionMetric = {
        ...layoutBrokenRaw,
        passed: layoutBrokenRaw.passed && !domLayoutFailed,
      };

      const contrastFailing = readNoulMetric(answers, 'contrastFailing', 'Contrast Failing', {
        passWhenTrue: false,
        threshold: 0.45,
        thresholdDescription: 'P(true) < 0.45 (WCAG AA legibility)',
      });
      const genericAiCliché = readNoulMetric(answers, 'genericAiCliche', 'Generic AI Cliché', {
        passWhenTrue: false,
        threshold: 0.48,
        thresholdDescription: 'P(true) < 0.48',
      });
      const productionReady = readNoulMetric(answers, 'productionReady', 'Production Ready', {
        passWhenTrue: true,
        threshold: 0.50,
        thresholdDescription: 'P(true) >= 0.50',
      });

      const dominantAestheticClass = readChoiceMetric(
        answers,
        'dominantAestheticClass',
        'Dominant Aesthetic Class',
        {
          isPassingChoice: (c) => c !== 'generic_ai_saas_slop' && c !== 'unknown',
          thresholdDescription: 'Must not classify as generic_ai_saas_slop',
        }
      );

      const primaryDefectClass = readChoiceMetric(
        answers,
        'primaryDefectClass',
        'Primary Defect Class',
        {
          isPassingChoice: (c) => c === 'none',
          thresholdDescription: 'Primary defect must be "none"',
        }
      );

      const metrics: DecisionsScorecard['metrics'] = {
        aestheticMatch,
        slopPenalty,
        typographyCraft,
        visualRhythm,
        colorHarmony,
        motionCohesion,
        layoutBroken,
        contrastFailing,
        genericAiCliché,
        productionReady,
        dominantAestheticClass,
        primaryDefectClass,
      };

      // Weighted composite AntiSlop Taste Index (0..100), calibrated against V1 5-Sigma empirical runs:
      // Strong bespoke designs (slop <= 3.8, match >= 7.0, clean DOM) cleanly reach 80+,
      // while generic AI slop stays sharply penalized in the 20-55 range.
      const antiSlopQuality = Math.min(10, Math.max(0, (10 - slopPenalty.value) * 1.12));
      const rubricBase =
        (aestheticMatch.value * 0.28 +
          antiSlopQuality * 0.22 +
          typographyCraft.value * 0.17 +
          visualRhythm.value * 0.13 +
          colorHarmony.value * 0.12 +
          motionCohesion.value * 0.08) *
        10;

      // Apply hinged penalties only above calibrated baseline noise floors so minor residual uncertainty
      // never zeroes out strong designs.
      const layoutExcess = Math.max(0, layoutBroken.value - 0.25);
      const contrastExcess = Math.max(0, contrastFailing.value - 0.25);
      const clicheExcess = Math.max(0, genericAiCliché.value - 0.28);
      const noulAdjustment =
        (productionReady.value - 0.42) * 14 -
        layoutExcess * 26 -
        contrastExcess * 18 -
        clicheExcess * 24;

      const domClean =
        params.domAudit.horizontalOverflowPx <= 12 &&
        params.domAudit.overlappingTextNodes <= 2 &&
        params.domAudit.brokenImageCount === 0 &&
        params.domAudit.consoleErrorCount === 0;

      let domPenalty = 0;
      if (params.domAudit.horizontalOverflowPx > 12) domPenalty += 15;
      if (params.domAudit.overlappingTextNodes > 2) {
        domPenalty += Math.min(20, (params.domAudit.overlappingTextNodes - 2) * 6);
      }
      if (params.domAudit.brokenImageCount > 0) {
        domPenalty += Math.min(20, params.domAudit.brokenImageCount * 10);
      }
      if (params.domAudit.consoleErrorCount > 0) {
        domPenalty += Math.min(15, params.domAudit.consoleErrorCount * 5);
      }

      const cleanCraftCredit =
        domClean && slopPenalty.value <= 3.8 && aestheticMatch.value >= 7.0 ? 8.5 : 0;

      let rawTasteScore = rubricBase + noulAdjustment + cleanCraftCredit - domPenalty;
      if (
        domClean &&
        slopPenalty.value <= 3.8 &&
        aestheticMatch.value >= 7.0 &&
        layoutBroken.passed &&
        contrastFailing.passed &&
        genericAiCliché.passed &&
        productionReady.passed &&
        rawTasteScore < 80
      ) {
        rawTasteScore = 80 + Math.max(0, Math.min(2.5, (aestheticMatch.value - 7.0) * 0.8 + (3.8 - slopPenalty.value) * 0.4));
      }

      const overallTasteScore = Number(Math.max(0, Math.min(100, rawTasteScore)).toFixed(1));

      const passedAllGates =
        overallTasteScore >= 78 &&
        aestheticMatch.passed &&
        slopPenalty.passed &&
        typographyCraft.passed &&
        colorHarmony.passed &&
        layoutBroken.passed &&
        contrastFailing.passed &&
        genericAiCliché.passed &&
        productionReady.passed &&
        dominantAestheticClass.passed &&
        domClean;

      const criticActionDirective = buildCriticActionDirective(
        metrics,
        params.domAudit,
        overallTasteScore,
        passedAllGates
      );

      return {
        scorecardId: uuidv4(),
        model,
        latencyMs: Date.now() - startedAt,
        overallTasteScore,
        passedAllGates,
        metrics,
        domAudit: params.domAudit,
        criticActionDirective,
      };
    }
  );
}
