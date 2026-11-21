import type { Interactions } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import type {
  BespokeAssetPrompt,
  DesignManifest,
  DesignTokens,
  DrawnCircleAnnotation,
  ExecutionSpeedMode,
  InputModality,
  MediaAssetInput,
  TransformRunRequest,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { traceSpan, withV1Client } from './clientPool.js';
import { ANTISLOP_DESIGN_CRAFT_DISTILLED } from './designSkill.js';
import {
  extractInteractionText,
  extractJsonObject,
  extractThoughtSummary,
  normalizeMimeType,
  resolveAssetBinary,
  stripDataUriPrefix,
} from './mediaUtils.js';

export interface SynthesizeManifestParams {
  assets: MediaAssetInput[];
  voiceTranscript?: string;
  textPrompt?: string;
  mode: TransformRunRequest['mode'];
  speedMode: ExecutionSpeedMode;
  currentCodeSummary?: string;
  projectContextSummary?: string;
  annotatedScreenshotBase64?: string;
  drawnCircles?: DrawnCircleAnnotation[];
  onThinking?: (delta: string) => void;
}

const DIRECTOR_SYSTEM_INSTRUCTION = `You are the Creative Director of AntiSlop — an elite editorial, print, industrial, and interactive design director who eliminates generic "AI slop" UI aesthetics forever.

Your mission:
1. Study EVERY raw multimodal artifact provided — moodboard photographs, packaging, physical textures, webcam frames, motion reference videos (extract real easing curves, tempo, and choreography), red-circled UI regions, and spoken voice direction.
2. Synthesize a cohesive, authentic, museum-grade DesignManifest in STRICT JSON format.
3. Explicitly BAN AI slop clichés: purple/indigo linear gradients on dark navy, generic Inter-everywhere SaaS cards, glowing neon pills, sparkle emoji bullets, stock buzzwords ("Revolutionize", "Supercharge", "Next-Gen AI"), and cluttered bento grids.
4. Ensure REAL visual legibility and accessibility: inkPrimary MUST have >= 4.5:1 WCAG AA contrast against canvas and surface; accentContrast MUST have >= 4.5:1 contrast against accent.
5. Provide a REAL, valid Google Fonts CSS2 URL (https://fonts.googleapis.com/css2?family=...&display=swap) matching displayFont, bodyFont, and monoFont.
6. When multiple conflicting visual styles are present (e.g. brutalist concrete + delicate Japanese calligraphy + warm terracotta + cyber telemetry), do NOT average them into muddy grey — resolve them into a disciplined hierarchy (dominant ground + structural typographic voice + surgical accent) and document your synthesis clearly in "conflictResolutionNotes".
7. Craft domain-grounded editorial photography/artwork prompts in "bespokeAssets" (using slotId "hero_primary" at "/generated/hero-primary.jpg" and optionally "editorial_secondary" at "/generated/editorial-secondary.jpg") that MUST depict the target website's actual product, brand subject, and domain from TARGET WEBSITE DOMAIN & SUBJECT CONTEXT while harmonizing with the moodboard palette and lighting — ZERO unrelated abstract filler and NO text inside generated imagery.

${ANTISLOP_DESIGN_CRAFT_DISTILLED}

Output ONLY a single valid JSON object matching the exact schema requested. No markdown prose outside the JSON.`;

const MANIFEST_SCHEMA_GUIDE = `{
  "vibeTitle": "Short evocative 2-5 word atelier title (e.g. 'Kyoto Paper & Foundry')",
  "editorialRationale": "2-3 incisive sentences explaining the distilled visual language, typography pairing, material palette, and spatial pacing.",
  "conflictResolutionNotes": "Required if multiple aesthetics/references conflict; explain how hierarchy resolves visual tension cleanly.",
  "tokens": {
    "palette": {
      "canvas": "#F6F2EA",
      "surface": "#EFE9DC",
      "surfaceMuted": "#E5DDD0",
      "inkPrimary": "#171512",
      "inkSecondary": "#524C43",
      "accent": "#B84224",
      "accentContrast": "#FAF7F2",
      "borderSubtle": "rgba(23, 21, 18, 0.14)"
    },
    "typography": {
      "displayFont": "Cormorant Garamond",
      "bodyFont": "Plus Jakarta Sans",
      "monoFont": "IBM Plex Mono",
      "googleFontsUrl": "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap",
      "headlineTracking": "-0.03em",
      "editorialScaleRatio": 1.333,
      "bodyLineHeight": 1.62
    },
    "geometry": {
      "borderRadiusSm": "2px",
      "borderRadiusMd": "4px",
      "borderRadiusLg": "8px",
      "borderStyle": "1px solid var(--border-subtle)",
      "elevationPhilosophy": "tactile-print"
    },
    "motion": {
      "easingCurve": "cubic-bezier(0.22, 1, 0.36, 1)",
      "hoverDurationMs": 220,
      "entranceStyle": "Restrained vertical editorial reveal with 12px rise and hairline rule expansion",
      "microInteractionNotes": "Crisp hairline underlines on nav links, subtle ink-shift buttons, zero bouncy cartoon scaling."
    },
    "layoutDirectives": [
      "Asymmetric 12-column editorial hero with generous negative space",
      "Full-bleed hairline section dividers with indexed uppercase mono section labels (01, 02, 03)",
      "Zero horizontal scroll overflow on desktop 1440px and mobile 390px"
    ],
    "antiSlopBanList": [
      "No purple-to-cyan gradients or dark-navy neon glows",
      "No generic glassmorphic cards with blurred rainbow blobs",
      "No sparkle emojis or buzzword badges",
      "No Inter default system SaaS template aesthetics"
    ]
  },
  "bespokeAssets": [
    {
      "slotId": "hero_primary",
      "targetPublicPath": "/generated/hero-primary.jpg",
      "prompt": "Editorial architectural still-life photograph matching exact moodboard lighting, tactile materials, palette harmony, clean negative space, zero text or logos.",
      "aspectRatio": "16:9"
    }
  ]
}`;

const DEFAULT_TOKENS: DesignTokens = {
  palette: {
    canvas: '#F5F0E6',
    surface: '#ECE5D8',
    surfaceMuted: '#E2D9C8',
    inkPrimary: '#181613',
    inkSecondary: '#554E45',
    accent: '#A93F23',
    accentContrast: '#FBF8F2',
    borderSubtle: 'rgba(24, 22, 19, 0.14)',
  },
  typography: {
    displayFont: 'Instrument Serif',
    bodyFont: 'DM Sans',
    monoFont: 'IBM Plex Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap',
    headlineTracking: '-0.025em',
    editorialScaleRatio: 1.333,
    bodyLineHeight: 1.6,
  },
  geometry: {
    borderRadiusSm: '2px',
    borderRadiusMd: '4px',
    borderRadiusLg: '8px',
    borderStyle: '1px solid rgba(24, 22, 19, 0.14)',
    elevationPhilosophy: 'tactile-print',
  },
  motion: {
    easingCurve: 'cubic-bezier(0.22, 1, 0.36, 1)',
    hoverDurationMs: 220,
    entranceStyle: 'Measured editorial fade-and-rise with crisp rule reveals',
    microInteractionNotes: 'Hairline underline sweeps, ink-inversion primary CTA, zero bouncy springs.',
  },
  layoutDirectives: [
    'Editorial 12-column grid with disciplined negative space and strong typographic hierarchy',
    'Crisp 1px structural hairlines instead of drop-shadow card stacks',
    'Zero horizontal overflow across 1440px desktop and 390px mobile viewports',
  ],
  antiSlopBanList: [
    'No purple/indigo AI gradients or neon glow borders',
    'No dark-slate SaaS bento templates or glassmorphic blur cards',
    'No sparkle emojis or generic AI buzzwords',
  ],
};

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeElevation(
  value: unknown
): DesignTokens['geometry']['elevationPhilosophy'] {
  const valid: Array<DesignTokens['geometry']['elevationPhilosophy']> = [
    'flat-editorial',
    'tactile-print',
    'soft-architectural',
    'brutalist-crisp',
  ];
  if (typeof value === 'string' && (valid as string[]).includes(value.trim())) {
    return value.trim() as DesignTokens['geometry']['elevationPhilosophy'];
  }
  return 'tactile-print';
}

function normalizeGoogleFontsUrl(url: unknown, displayFont: string, bodyFont: string, monoFont: string): string {
  if (
    typeof url === 'string' &&
    url.trim().startsWith('https://fonts.googleapis.com/css2?')
  ) {
    return url.trim();
  }
  const encodeFont = (name: string, weights: string) =>
    `family=${encodeURIComponent(name.replace(/['"]/g, '').trim()).replace(/%20/g, '+')}:wght@${weights}`;
  const families = [
    encodeFont(displayFont, '400;500;600;700'),
    encodeFont(bodyFont, '400;500;600'),
    encodeFont(monoFont, '400;500'),
  ];
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

function normalizeBespokeAssets(
  raw: unknown,
  vibeTitle: string,
  palette: DesignTokens['palette']
): BespokeAssetPrompt[] {
  const allowedSlots = new Set<BespokeAssetPrompt['slotId']>([
    'hero_primary',
    'editorial_secondary',
    'surface_texture',
  ]);
  const allowedRatios = new Set<BespokeAssetPrompt['aspectRatio']>([
    '16:9',
    '4:3',
    '1:1',
    '3:4',
  ]);

  const parsed: BespokeAssetPrompt[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const slotRaw = typeof obj.slotId === 'string' ? obj.slotId.trim() : 'hero_primary';
      const slotId: BespokeAssetPrompt['slotId'] = allowedSlots.has(
        slotRaw as BespokeAssetPrompt['slotId']
      )
        ? (slotRaw as BespokeAssetPrompt['slotId'])
        : 'hero_primary';
      const defaultFile =
        slotId === 'hero_primary'
          ? '/generated/hero-primary.jpg'
          : slotId === 'editorial_secondary'
            ? '/generated/editorial-secondary.jpg'
            : '/generated/surface-texture.jpg';
      const targetPublicPath = asString(obj.targetPublicPath, defaultFile);
      const prompt = asString(
        obj.prompt,
        `Bespoke editorial architectural photograph evoking "${vibeTitle}", refined studio lighting harmonizing with ${palette.canvas} and ${palette.accent}, tactile natural textures, generous calm composition, strictly zero text or logos.`
      );
      const ratioRaw = typeof obj.aspectRatio === 'string' ? obj.aspectRatio.trim() : '16:9';
      const aspectRatio: BespokeAssetPrompt['aspectRatio'] = allowedRatios.has(
        ratioRaw as BespokeAssetPrompt['aspectRatio']
      )
        ? (ratioRaw as BespokeAssetPrompt['aspectRatio'])
        : '16:9';

      parsed.push({ slotId, targetPublicPath, prompt, aspectRatio });
    }
  }

  if (parsed.length === 0) {
    parsed.push({
      slotId: 'hero_primary',
      targetPublicPath: '/generated/hero-primary.jpg',
      prompt: `Bespoke editorial photograph capturing the tactile atmosphere of "${vibeTitle}", calibrated to ground color ${palette.canvas} with subtle ${palette.accent} tonal accents, sculptural architectural light and shadow, museum catalog photography, zero embedded text or logos.`,
      aspectRatio: '16:9',
    });
  }

  return parsed.slice(0, 2);
}

export function normalizeManifest(
  raw: Record<string, unknown> | null,
  meta: {
    modalities: InputModality[];
    modelUsed: string;
    thinkingSummary?: string;
    latencyMs: number;
    mode: TransformRunRequest['mode'];
  }
): DesignManifest {
  const root = raw ?? {};
  const rawTokens =
    root.tokens && typeof root.tokens === 'object'
      ? (root.tokens as Record<string, unknown>)
      : {};
  const rawPalette =
    rawTokens.palette && typeof rawTokens.palette === 'object'
      ? (rawTokens.palette as Record<string, unknown>)
      : {};
  const rawTypo =
    rawTokens.typography && typeof rawTokens.typography === 'object'
      ? (rawTokens.typography as Record<string, unknown>)
      : {};
  const rawGeo =
    rawTokens.geometry && typeof rawTokens.geometry === 'object'
      ? (rawTokens.geometry as Record<string, unknown>)
      : {};
  const rawMotion =
    rawTokens.motion && typeof rawTokens.motion === 'object'
      ? (rawTokens.motion as Record<string, unknown>)
      : {};

  const palette: DesignTokens['palette'] = {
    canvas: asString(rawPalette.canvas, DEFAULT_TOKENS.palette.canvas),
    surface: asString(rawPalette.surface, DEFAULT_TOKENS.palette.surface),
    surfaceMuted: asString(rawPalette.surfaceMuted, DEFAULT_TOKENS.palette.surfaceMuted),
    inkPrimary: asString(rawPalette.inkPrimary, DEFAULT_TOKENS.palette.inkPrimary),
    inkSecondary: asString(rawPalette.inkSecondary, DEFAULT_TOKENS.palette.inkSecondary),
    accent: asString(rawPalette.accent, DEFAULT_TOKENS.palette.accent),
    accentContrast: asString(rawPalette.accentContrast, DEFAULT_TOKENS.palette.accentContrast),
    borderSubtle: asString(rawPalette.borderSubtle, DEFAULT_TOKENS.palette.borderSubtle),
  };

  const displayFont = asString(rawTypo.displayFont, DEFAULT_TOKENS.typography.displayFont);
  const bodyFont = asString(rawTypo.bodyFont, DEFAULT_TOKENS.typography.bodyFont);
  const monoFont = asString(rawTypo.monoFont, DEFAULT_TOKENS.typography.monoFont);

  const typography: DesignTokens['typography'] = {
    displayFont,
    bodyFont,
    monoFont,
    googleFontsUrl: normalizeGoogleFontsUrl(rawTypo.googleFontsUrl, displayFont, bodyFont, monoFont),
    headlineTracking: asString(rawTypo.headlineTracking, DEFAULT_TOKENS.typography.headlineTracking),
    editorialScaleRatio: asNumber(
      rawTypo.editorialScaleRatio,
      DEFAULT_TOKENS.typography.editorialScaleRatio,
      1.125,
      1.618
    ),
    bodyLineHeight: asNumber(
      rawTypo.bodyLineHeight,
      DEFAULT_TOKENS.typography.bodyLineHeight,
      1.35,
      1.9
    ),
  };

  const geometry: DesignTokens['geometry'] = {
    borderRadiusSm: asString(rawGeo.borderRadiusSm, DEFAULT_TOKENS.geometry.borderRadiusSm),
    borderRadiusMd: asString(rawGeo.borderRadiusMd, DEFAULT_TOKENS.geometry.borderRadiusMd),
    borderRadiusLg: asString(rawGeo.borderRadiusLg, DEFAULT_TOKENS.geometry.borderRadiusLg),
    borderStyle: asString(rawGeo.borderStyle, DEFAULT_TOKENS.geometry.borderStyle),
    elevationPhilosophy: normalizeElevation(rawGeo.elevationPhilosophy),
  };

  const motion: DesignTokens['motion'] = {
    easingCurve: asString(rawMotion.easingCurve, DEFAULT_TOKENS.motion.easingCurve),
    hoverDurationMs: Math.round(
      asNumber(rawMotion.hoverDurationMs, DEFAULT_TOKENS.motion.hoverDurationMs, 100, 650)
    ),
    entranceStyle: asString(rawMotion.entranceStyle, DEFAULT_TOKENS.motion.entranceStyle),
    microInteractionNotes: asString(
      rawMotion.microInteractionNotes,
      DEFAULT_TOKENS.motion.microInteractionNotes
    ),
  };

  const vibeTitle = asString(root.vibeTitle, 'Curated Tactile Atelier');
  const editorialRationale = asString(
    root.editorialRationale,
    'Distilled from raw multimodal taste anchors into a crisp, high-contrast editorial composition that replaces generic SaaS templates with deliberate typography, material surfaces, and measured spatial rhythm.'
  );

  const conflictResolutionNotes =
    typeof root.conflictResolutionNotes === 'string' && root.conflictResolutionNotes.trim().length > 0
      ? root.conflictResolutionNotes.trim()
      : meta.mode === 'stress_test'
        ? 'Reconciled competing multimodal visual styles by anchoring the canvas to one dominant material ground, elevating a single display typography voice, and confining contrasting color tension strictly to surgical interactive accents.'
        : undefined;

  return {
    manifestId: uuidv4(),
    vibeTitle,
    editorialRationale,
    extractedFromModalities: meta.modalities,
    tokens: {
      palette,
      typography,
      geometry,
      motion,
      layoutDirectives: asStringArray(rawTokens.layoutDirectives, DEFAULT_TOKENS.layoutDirectives),
      antiSlopBanList: asStringArray(rawTokens.antiSlopBanList, DEFAULT_TOKENS.antiSlopBanList),
    },
    bespokeAssets: normalizeBespokeAssets(root.bespokeAssets, vibeTitle, palette),
    conflictResolutionNotes,
    modelUsed: meta.modelUsed,
    thinkingSummary: meta.thinkingSummary,
    latencyMs: meta.latencyMs,
  };
}

function collectModalities(params: SynthesizeManifestParams): InputModality[] {
  const set = new Set<InputModality>();
  for (const asset of params.assets) {
    set.add(asset.modality);
  }
  if (params.voiceTranscript && params.voiceTranscript.trim().length > 0) {
    set.add('voice_audio');
  }
  if (params.annotatedScreenshotBase64 || (params.drawnCircles && params.drawnCircles.length > 0)) {
    set.add('region_annotation');
  }
  if (set.size === 0) {
    set.add('moodboard_image');
  }
  return Array.from(set);
}

/**
 * Multimodal Creative Director:
 * - `stress_test`: `gemini-4-carbon` with `thinking_level: 'high'` (conflict resolution)
 * - `deep_atelier`: `gemini-4-carbon` with `thinking_level: 'medium'` (~12-18s)
 * - `fast_demo` fallback: `gemini-4-argon` with `thinking_level: 'low'` (sub-5s)
 */
export async function synthesizeDesignManifest(
  params: SynthesizeManifestParams
): Promise<DesignManifest> {
  const startedAt = Date.now();
  const useDeepCarbon = params.speedMode === 'deep_atelier' || params.mode === 'stress_test';
  const model = useDeepCarbon ? ENV.GEMINI_MODEL_DIRECTOR : ENV.GEMINI_MODEL_FAST_CRITIC;
  const thinkingLevel: 'low' | 'medium' | 'high' =
    params.mode === 'stress_test'
      ? 'high'
      : params.speedMode === 'deep_atelier'
        ? 'medium'
        : 'low';
  const modalities = collectModalities(params);

  return traceSpan(
    'antislop.director.synthesizeManifest',
    'llm',
    {
      model,
      thinkingLevel,
      mode: params.mode,
      speedMode: params.speedMode,
      assetCount: params.assets.length,
      modalities,
      hasAnnotatedScreenshot: Boolean(params.annotatedScreenshotBase64),
      drawnCircleCount: params.drawnCircles?.length ?? 0,
      hasVoiceTranscript: Boolean(params.voiceTranscript),
    },
    async () => {
      params.onThinking?.(
        `Engaging ${model} (${thinkingLevel} thinking) across ${params.assets.length} multimodal reference artifact(s)...`
      );

      const inputBlocks: Interactions.Content[] = [];

      // Attach all raw multimodal artifacts (moodboard images, webcam frames, motion videos, raw audio)
      let imageIndex = 0;
      for (const asset of params.assets) {
        const binary = await resolveAssetBinary(asset);
        if (!binary) continue;

        if (asset.modality === 'motion_video' || binary.mimeType.startsWith('video/')) {
          inputBlocks.push({
            type: 'text',
            text: `[Motion Reference Video${asset.label ? ` — ${asset.label}` : ''}]: Extract exact pacing, easing curves, entrance cadence, and interactive feel.`,
          });
          inputBlocks.push({
            type: 'video',
            data: binary.base64,
            mime_type: binary.mimeType,
          });
        } else if (asset.modality === 'voice_audio' || binary.mimeType.startsWith('audio/')) {
          inputBlocks.push({
            type: 'text',
            text: `[Voice Creative Direction Audio${asset.label ? ` — ${asset.label}` : ''}]: Listen carefully to tone, aesthetic intent, and specific layout requests.`,
          });
          inputBlocks.push({
            type: 'audio',
            data: binary.base64,
            mime_type: binary.mimeType,
          });
        } else {
          imageIndex += 1;
          const labelTag =
            asset.modality === 'webcam_frame'
              ? `Live Webcam Material/Object Frame #${imageIndex}`
              : asset.modality === 'region_annotation'
                ? `Annotated UI Region Reference #${imageIndex}`
                : `Moodboard Taste Anchor #${imageIndex}`;
          inputBlocks.push({
            type: 'text',
            text: `[${labelTag}${asset.label ? ` (${asset.label})` : ''}]: Study material palette, typography character, grid proportions, lighting, and craft density.`,
          });
          inputBlocks.push({
            type: 'image',
            data: binary.base64,
            mime_type: binary.mimeType,
          });
        }
      }

      // Attach annotated UI screenshot with user-drawn red circles
      if (params.annotatedScreenshotBase64) {
        const { base64, detectedMime } = stripDataUriPrefix(params.annotatedScreenshotBase64);
        if (base64.length > 16) {
          const circlesSummary = (params.drawnCircles ?? [])
            .map(
              (c, idx) =>
                `Circle #${idx + 1}: x=${c.x.toFixed(2)}, y=${c.y.toFixed(2)}, w=${c.width.toFixed(2)}, h=${c.height.toFixed(2)}${c.note ? ` — "${c.note}"` : ''}`
            )
            .join('\n');

          inputBlocks.push({
            type: 'text',
            text:
              `[LIVE UI CANVAS WITH USER-DRAWN RED CIRCLES]: Focus specifically on the UI regions encircled in bright red strokes on this screenshot.` +
              (circlesSummary ? `\nNormalized circle coordinates [0..1]:\n${circlesSummary}` : ''),
          });
          inputBlocks.push({
            type: 'image',
            data: base64,
            mime_type: normalizeMimeType(detectedMime, 'image/png'),
          });
        }
      }

      // Build concise text brief
      const briefParts: string[] = [
        `Mode: ${params.mode} | Speed Tier: ${params.speedMode}`,
      ];
      if (params.voiceTranscript && params.voiceTranscript.trim()) {
        briefParts.push(`Spoken Voice Creative Direction:\n"${params.voiceTranscript.trim()}"`);
      }
      if (params.textPrompt && params.textPrompt.trim()) {
        briefParts.push(`Written Direction Notes:\n"${params.textPrompt.trim()}"`);
      }
      const domainContext = (params.projectContextSummary || params.currentCodeSummary || '').trim();
      if (domainContext) {
        briefParts.push(
          `TARGET WEBSITE DOMAIN & SUBJECT CONTEXT (preserve real domain semantics and ground ALL bespokeAssets prompts directly in this website's actual product/subject — never unrelated filler):\n${domainContext.slice(0, 2800)}`
        );
      }
      if (params.mode === 'stress_test') {
        briefParts.push(
          `ELEMENT 119 STRESS TEST DIRECTIVE: Multiple intentionally conflicting visual paradigms are attached. Synthesize a fearless, unified, museum-grade design system that resolves every conflict through disciplined visual hierarchy, and populate "conflictResolutionNotes" thoroughly.`
        );
      }

      briefParts.push(
        `Return ONLY a single strictly valid JSON object conforming to this exact structure (no markdown commentary outside JSON):\n${MANIFEST_SCHEMA_GUIDE}`
      );

      inputBlocks.push({
        type: 'text',
        text: briefParts.join('\n\n'),
      });

      let rawOutputText = '';
      const thoughtChunks: string[] = [];

      const userInputStep: Interactions.Step[] = [
        {
          type: 'user_input',
          content: inputBlocks,
        },
      ];

      // Stream when onThinking callback is provided so judges see real-time Gemini 4 reasoning
      if (params.onThinking) {
        try {
          await withV1Client(async (client) => {
            const stream = await client.interactions.create({
              model,
              system_instruction: DIRECTOR_SYSTEM_INSTRUCTION,
              input: userInputStep,
              generation_config: {
                thinking_level: thinkingLevel,
                thinking_summaries: 'auto',
              },
              stream: true,
              store: false,
            });

            for await (const event of stream) {
              if (event.event_type === 'step.start') {
                if (event.step.type === 'thought') {
                  params.onThinking?.('Reasoning across multimodal palette, typography, and layout hierarchy...');
                } else if (event.step.type === 'model_output') {
                  params.onThinking?.('Synthesizing locked DesignManifest JSON & bespoke art prompts...');
                }
              } else if (event.event_type === 'step.delta') {
                if (event.delta.type === 'thought_summary') {
                  const content = event.delta.content;
                  if (content && content.type === 'text' && content.text) {
                    thoughtChunks.push(content.text);
                    params.onThinking?.(content.text);
                  }
                } else if (event.delta.type === 'text' && event.delta.text) {
                  rawOutputText += event.delta.text;
                }
              } else if (event.event_type === 'error') {
                throw new Error(event.error?.message || 'Director stream failed');
              }
            }
          });
        } catch {
          // Graceful non-streaming fallback if stream closed early
          rawOutputText = '';
        }
      }

      // Non-streaming path (or fallback if streaming produced empty text)
      if (!rawOutputText.trim()) {
        const interaction = await withV1Client((client) =>
          client.interactions.create({
            model,
            system_instruction: DIRECTOR_SYSTEM_INSTRUCTION,
            input: userInputStep,
            generation_config: {
              thinking_level: thinkingLevel,
              thinking_summaries: 'auto',
            },
            store: false,
          })
        );
        rawOutputText = extractInteractionText(interaction);
        const extractedThought = extractThoughtSummary(interaction);
        if (extractedThought) {
          thoughtChunks.push(extractedThought);
          params.onThinking?.(extractedThought);
        }
      }

      const parsedJson = extractJsonObject<Record<string, unknown>>(rawOutputText);
      const thinkingSummary =
        thoughtChunks.length > 0 ? thoughtChunks.join('').trim().slice(0, 1800) : undefined;

      return normalizeManifest(parsedJson, {
        modalities,
        modelUsed: model,
        thinkingSummary,
        latencyMs: Date.now() - startedAt,
        mode: params.mode,
      });
    }
  );
}
