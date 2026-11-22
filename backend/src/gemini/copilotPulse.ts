import type { Decisions } from '@google/genai';
import { ENV } from '../config/env.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';
import { normalizeMimeType, stripDataUriPrefix } from './mediaUtils.js';

export interface CopilotPulseAlert {
  key: string;
  zone: string;
  check: string;
  passProb: number;
  spokenWarning: string;
}

export interface CopilotPulseResult {
  healthy: boolean;
  pulseScore: number;
  alerts: CopilotPulseAlert[];
  systemInjectionPrompt: string | null;
  latencyMs: number;
  outputTokens: 0;
}

export interface CopilotMicroPulseInput {
  screenshotBase64: string;
  brandSummary?: string;
  threshold?: number;
}

interface PulseGuardrailSpec {
  key: string;
  zone: string;
  check: string;
  instructions: string;
  trueDescription: string;
  falseDescription: string;
  warningTemplate: (pct: number) => string;
}

const DEFAULT_ALERT_THRESHOLD = 0.42;

const PULSE_GUARDRAILS: readonly PulseGuardrailSpec[] = [
  {
    key: 'hero_legibility',
    zone: 'Hero',
    check: 'Hero headline and subcopy legibility',
    instructions:
      'Is the hero headline and supporting subcopy immediately legible with strong figure-ground contrast and zero clipping or background noise interference?',
    trueDescription:
      'Yes — hero typography is crisp, unobstructed, and effortlessly readable at a glance.',
    falseDescription:
      'No — hero text suffers from low contrast, busy background bleed, awkward wrapping, or clipping.',
    warningTemplate: (pct) =>
      `Hold on — hero legibility just dropped to ${pct}%, so the headline is fighting the background and needs stronger contrast or cleaner scrimming.`,
  },
  {
    key: 'cta_contrast',
    zone: 'Primary CTA',
    check: 'Primary CTA contrast and visual prominence',
    instructions:
      'Does the primary call-to-action button have unmistakable WCAG AA+ contrast, clear label legibility, and clear visual prominence over secondary actions?',
    trueDescription:
      'Yes — the primary CTA pops cleanly with high text-to-fill contrast and obvious clickability.',
    falseDescription:
      'No — the primary CTA blends into the surface, has muddy label contrast, or loses hierarchy to surrounding elements.',
    warningTemplate: (pct) =>
      `Watch the primary CTA — contrast confidence fell to ${pct}%, making the main action blend into the surface instead of anchoring the viewport.`,
  },
  {
    key: 'alignment_discipline',
    zone: 'Grid & Layout',
    check: 'Grid alignment and baseline discipline',
    instructions:
      'Are columns, cards, navigation items, and section edges aligned to a disciplined grid without accidental drift, ragged edges, or colliding containers?',
    trueDescription:
      'Yes — elements snap to a clean, intentional grid with consistent edges and optical alignment.',
    falseDescription:
      'No — elements drift off-axis, cards misalign, or components collide awkwardly.',
    warningTemplate: (pct) =>
      `Grid alignment is slipping at ${pct}% — several cards or section edges are drifting off-axis and need tighter column alignment.`,
  },
  {
    key: 'viewport_overflow',
    zone: 'Viewport & Overflow',
    check: 'Zero mobile or desktop overflow and clipping',
    instructions:
      'Is the layout completely free of horizontal overflow, clipped text, truncated controls, or elements escaping their containers across the viewport?',
    trueDescription:
      'Yes — all content fits cleanly within its containers and viewport boundaries with zero clipping.',
    falseDescription:
      'No — content overflows horizontally, text gets cut off, or containers clip visible UI.',
    warningTemplate: (pct) =>
      `Overflow alert at ${pct}% — elements are clipping or pushing past their container bounds, which will break responsive viewports.`,
  },
  {
    key: 'no_purple_slop',
    zone: 'Color & Surface',
    check: 'Free of generic purple-gradient AI slop regression',
    instructions:
      'Is the interface free of generic AI-slop clichés such as neon purple/indigo glow gradients, rainbow glassmorphism blobs, and cliché SaaS sparkle aesthetics?',
    trueDescription:
      'Yes — the palette and surface treatment feel bespoke, restrained, and authentically art-directed.',
    falseDescription:
      'No — the page regressed into generic purple/indigo gradient AI slop or cliché glowing glass cards.',
    warningTemplate: (pct) =>
      `Slop regression detected at ${pct}% — the palette is drifting back toward generic purple-glow AI templates and needs a grounded surface reset.`,
  },
  {
    key: 'visual_clutter',
    zone: 'Information Density',
    check: 'Low visual clutter and clear focal point',
    instructions:
      'Does the viewport maintain breathing room and a clear focal point without competing badges, excessive borders, noisy micro-widgets, or visual clutter?',
    trueDescription:
      'Yes — the composition is calm, scannable, and free of superfluous chrome.',
    falseDescription:
      'No — too many competing pills, boxes, or visual elements crowd the screen and dilute focus.',
    warningTemplate: (pct) =>
      `Visual clutter spiked with cleanliness at ${pct}% — strip back competing badges and chrome so the main focal point can breathe.`,
  },
  {
    key: 'spacing_rhythm',
    zone: 'Spacing & Rhythm',
    check: 'Consistent vertical and internal spacing rhythm',
    instructions:
      'Do section gaps, card paddings, and element margins follow a harmonious spacing scale without cramped clusters or awkward dead voids?',
    trueDescription:
      'Yes — vertical cadence and internal padding feel rhythmic, balanced, and deliberate.',
    falseDescription:
      'No — spacing feels cramped, uneven, or broken by jarring empty gaps.',
    warningTemplate: (pct) =>
      `Spacing rhythm dropped to ${pct}% — tighten the uneven padding and restore a consistent vertical cadence between sections.`,
  },
  {
    key: 'broken_imagery',
    zone: 'Media & Imagery',
    check: 'Intact imagery with zero broken or distorted media',
    instructions:
      'Are all visible images, icons, and media frames loaded cleanly with proper aspect ratios, crisp rendering, and zero broken placeholders or awkward crops?',
    trueDescription:
      'Yes — all media assets render crisply with intentional framing and intact aspect ratios.',
    falseDescription:
      'No — there are broken image icons, stretched aspect ratios, empty media boxes, or awkward crops.',
    warningTemplate: (pct) =>
      `Media integrity fell to ${pct}% — check for broken image placeholders, stretched aspect ratios, or awkward crops in the canvas.`,
  },
  {
    key: 'typography_hierarchy',
    zone: 'Typography',
    check: 'Distinct typographic scale and hierarchy',
    instructions:
      'Is there an unmistakable typographic hierarchy separating display headlines, section titles, body copy, and metadata through deliberate size, weight, and line-height?',
    trueDescription:
      'Yes — type scale, weight contrast, and measure guide the eye effortlessly through the page.',
    falseDescription:
      'No — text sizes blur together, line lengths are unwieldy, or weights lack clear hierarchy.',
    warningTemplate: (pct) =>
      `Typography hierarchy is flat at ${pct}% — widen the scale and weight contrast between display headlines, section heads, and body copy.`,
  },
  {
    key: 'focus_affordance',
    zone: 'Interactive States',
    check: 'Clear interactive affordance and focus clarity',
    instructions:
      'Are interactive controls (buttons, links, inputs, tabs) clearly distinguishable from static content with legible boundaries and clean focus/active affordances?',
    trueDescription:
      'Yes — clickable and focusable controls have clear affordance and unmistakable interactive boundaries.',
    falseDescription:
      'No — interactive elements look flat or indistinguishable from static text, or inputs lack clear affordance.',
    warningTemplate: (pct) =>
      `Interactive affordance dipped to ${pct}% — buttons, inputs, or links need clearer clickable boundaries and focus cues.`,
  },
  {
    key: 'footer_balance',
    zone: 'Footer',
    check: 'Grounded footer and lower-fold structural balance',
    instructions:
      'Does the lower viewport or footer area feel structurally grounded and balanced without orphaned links, abrupt cutoffs, or collapsed columns?',
    trueDescription:
      'Yes — the bottom of the composition closes cleanly with balanced columns and intentional weight.',
    falseDescription:
      'No — the footer or lower fold looks unfinished, lopsided, cramped, or abruptly cut off.',
    warningTemplate: (pct) =>
      `Lower-fold balance is off at ${pct}% — the footer or bottom section looks lopsided and needs cleaner column weight.`,
  },
  {
    key: 'brand_cohesion',
    zone: 'Brand System',
    check: 'Cohesive brand tone, palette, and component language',
    instructions:
      'Do the typography, color tokens, corner radii, iconography, and surface elevation belong to a single cohesive brand system rather than mismatched components?',
    trueDescription:
      'Yes — every section speaks the same unified design language and brand personality.',
    falseDescription:
      'No — components feel pasted from mismatched design systems with conflicting radii, colors, or tone.',
    warningTemplate: (pct) =>
      `Brand cohesion slipped to ${pct}% — unify your surface tokens, radii, and type styling so every section feels like one system.`,
  },
];

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

function clampThreshold(threshold: number | undefined): number {
  if (threshold === undefined || !Number.isFinite(threshold)) {
    return DEFAULT_ALERT_THRESHOLD;
  }
  return Math.max(0.05, Math.min(0.95, threshold));
}

function buildSystemInjectionPrompt(
  alerts: readonly CopilotPulseAlert[],
  pulseScore: number
): string | null {
  if (alerts.length === 0) return null;

  const topAlerts = alerts.slice(0, 3);
  const bulletLines = topAlerts.map(
    (alert, idx) =>
      `${idx + 1}. [${alert.zone}] ${alert.check} (pass=${Math.round(alert.passProb * 100)}%): ${alert.spokenWarning}`
  );
  const overflowNote =
    alerts.length > topAlerts.length
      ? ` (+${alerts.length - topAlerts.length} additional guardrail warning${alerts.length - topAlerts.length === 1 ? '' : 's'} active)`
      : '';

  return [
    `[REAL-TIME VISUAL PULSE ALERT | SCORE ${pulseScore}/100${overflowNote}]`,
    'Speak a crisp, proactive 1-2 sentence design-director interruption right now flagging the highest-priority issue below and giving one concrete fix:',
    ...bulletLines,
  ].join('\n');
}

/**
 * Runs a single zero-output-token `gemini-decision-1` micro-pulse across 12
 * calibrated visual guardrails (<400ms target) for the Live Voice Copilot.
 * Flags any guardrail with `passProb < threshold` (default 0.42) and emits a
 * ready-to-inject prompt for `liveSession.sendRealtimeInput({ text })`.
 */
export async function runCopilotMicroPulse(
  input: CopilotMicroPulseInput
): Promise<CopilotPulseResult> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_DECISIONS;
  const threshold = clampThreshold(input.threshold);

  if (!input.screenshotBase64 || input.screenshotBase64.trim().length < 32) {
    throw new Error('screenshotBase64 is required for copilot micro-pulse');
  }

  const stripped = stripDataUriPrefix(input.screenshotBase64);
  const mimeType = normalizeMimeType(stripped.detectedMime, 'image/jpeg');

  const brandDirective = input.brandSummary?.trim()
    ? `Brand & Art Direction: ${input.brandSummary.trim()}`
    : 'Evaluate against museum-grade editorial UI craft, WCAG AA+ contrast, crisp grid discipline, and zero generic AI slop.';

  const decisionInput: Decisions.DecisionInputContent[] = [
    { type: 'image', data: stripped.base64, mime_type: mimeType },
    {
      type: 'text',
      text: [
        'ANTISLOP REAL-TIME LIVE VOICE COPILOT MICRO-PULSE (12 GUARDRAILS)',
        brandDirective,
        'Score each visual guardrail strictly on the rendered pixels shown in this frame.',
      ].join('\n'),
    },
  ];

  const questions: Record<string, Decisions.NoulQuestion> = {};
  for (const spec of PULSE_GUARDRAILS) {
    questions[spec.key] = {
      type: 'noul',
      instructions: spec.instructions,
      criteria: {
        true_description: spec.trueDescription,
        false_description: spec.falseDescription,
      },
    };
  }

  return traceSpan(
    'antislop.decisions.copilotMicroPulse',
    'llm',
    {
      model,
      guardrailCount: PULSE_GUARDRAILS.length,
      threshold,
      hasBrandSummary: Boolean(input.brandSummary),
    },
    async () => {
      const response = await withV1BetaClient((client) =>
        client.decisions.create({
          model,
          input: decisionInput,
          questions,
        })
      );

      let probSum = 0;
      const alerts: CopilotPulseAlert[] = [];

      for (const spec of PULSE_GUARDRAILS) {
        const passProb = readNoulProbability(response.answers, spec.key);
        probSum += passProb;

        if (passProb < threshold) {
          const pct = Math.round(passProb * 100);
          alerts.push({
            key: spec.key,
            zone: spec.zone,
            check: spec.check,
            passProb,
            spokenWarning: spec.warningTemplate(pct),
          });
        }
      }

      alerts.sort((a, b) => a.passProb - b.passProb);

      const pulseScore = Math.round((probSum / PULSE_GUARDRAILS.length) * 100);
      const systemInjectionPrompt = buildSystemInjectionPrompt(alerts, pulseScore);

      return {
        healthy: alerts.length === 0,
        pulseScore,
        alerts,
        systemInjectionPrompt,
        latencyMs: Date.now() - startedAt,
        outputTokens: 0,
      };
    }
  );
}
