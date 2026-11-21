import type { Interactions } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import type {
  DecisionsScorecard,
  DesignManifest,
  DrawnCircleAnnotation,
  ExecutionSpeedMode,
  InputModality,
  MediaAssetInput,
  TransformRunRequest,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import type {
  FastSinglePassResult,
  GeneratedCandidateCode,
  SurgicalPatchResult,
} from './contracts.js';
import { traceSpan, withV1Client } from './clientPool.js';
import { normalizeManifest } from './director.js';
import {
  estimateBase64Bytes,
  extractInteractionText,
  extractJsonObject,
  normalizeMimeType,
  resolveAssetBinary,
  stripCodeFence,
  stripDataUriPrefix,
} from './mediaUtils.js';

export interface RunFastSinglePassParams {
  assets: MediaAssetInput[];
  sourceFiles: Record<string, string>;
  voiceTranscript?: string;
  textPrompt?: string;
  annotatedScreenshotBase64?: string;
  drawnCircles?: DrawnCircleAnnotation[];
  generatedPublicPaths?: string[];
}

export interface GenerateCodeCandidatesParams {
  manifest?: DesignManifest;
  sourceFiles: Record<string, string>;
  parallelCount: number;
  generatedPublicPaths: string[];
  mode: TransformRunRequest['mode'];
  speedMode: ExecutionSpeedMode;
  textPrompt?: string;
}

export interface ApplySurgicalPatchParams {
  manifest?: DesignManifest;
  sourceFiles: Record<string, string>;
  scorecard?: DecisionsScorecard;
  currentScreenshotBase64?: string;
  annotatedScreenshotBase64?: string;
  drawnCircles?: DrawnCircleAnnotation[];
  referenceAssets?: MediaAssetInput[];
  targetRegion?: TransformRunRequest['targetRegion'];
  instruction?: string;
  errorContext?: string;
  speedMode?: ExecutionSpeedMode;
}

interface CandidateStrategy {
  label: string;
  architecturalBrief: string;
}

const CURATED_STRATEGIES: CandidateStrategy[] = [
  {
    label: 'Editorial Print Atelier',
    architecturalBrief:
      'Channel an iconic architectural & design monograph. Lead with an asymmetric editorial broadsheet hero, high-contrast serif/display headline scale, crisp 1px structural hairlines, indexed mono section labels (01 / 02 / 03), generous whitespace, pull-quote cadence, and a colophon-grade footer.',
  },
  {
    label: 'Architectural Swiss Grid',
    architecturalBrief:
      'Channel International Typographic Style (Josef Müller-Brockmann / Dieter Rams discipline). Build an authoritative 12-column grid with mathematical alignment, sharp hairline borders, bold tabular typography, zero decorative clutter, and precision interactive controls.',
  },
  {
    label: 'Warm Tactile Monograph',
    architecturalBrief:
      'Channel a museum exhibition catalog & artisanal studio journal. Emphasize warm physical materiality, calm editorial rhythm, gallery-framed bespoke hero imagery with archival metadata captions, refined subtle surface layering, and understated tactile hover states.',
  },
  {
    label: 'Avant-Garde Studio',
    architecturalBrief:
      'Channel a bold contemporary NYC/Tokyo creative studio. Pair monumental display typography with razor-sharp micro-labels, full-bleed sculpted showcase bands, dramatic positive/negative space contrast, and poised kinetic micro-interactions.',
  },
];

const SAFE_EXTERNAL_PACKAGES = new Set<string>([
  'react',
  'react-dom',
  'lucide-react',
  'clsx',
  'tailwind-merge',
]);

const CODER_SYSTEM_INSTRUCTION = `You are a Principal Frontend Design Engineer at AntiSlop. You rewrite React + TypeScript + Tailwind CSS UIs into unmistakable, bespoke, museum-grade web craft that completely eliminates generic "AI slop".

HARD TECHNICAL RULES (NON-NEGOTIABLE):
1. Return ONLY a single strictly valid JSON object with the exact shape:
   {
     "files": {
       "index.html": "...full file content...",
       "src/index.css": "...full file content...",
       "src/App.tsx": "...full file content..."
     },
     "diffSummary": "Concise 1-2 sentence summary of aesthetic & structural changes",
     "changedSections": ["hero", "palette", "typography", "navigation", "cards", "footer"]
   }
2. NEVER invent npm packages! Only import from 'react', 'lucide-react', or packages ALREADY imported in the provided source files. Stick to standard widely available lucide-react icons (ArrowUpRight, ArrowRight, Check, ChevronRight, Compass, Clock, Eye, Globe, Layers, Mail, MapPin, Menu, Minus, Play, Plus, Shield, Sliders, Star, Terminal, X, Zap).
3. In \`index.html\`: load the DesignManifest's Google Fonts stylesheet cleanly (preconnect + stylesheet link), set a tasteful <title>, and preserve the existing \`<div id="root"></div>\` and \`<script type="module" src="/src/main.tsx"></script>\` entry script verbatim.
4. In \`src/index.css\`: if the original CSS contains \`@import "tailwindcss";\`, YOU MUST PRESERVE \`@import "tailwindcss";\` on line 1! Define CSS variables (\`:root { --canvas: ...; --surface: ...; --ink-primary: ...; --ink-secondary: ...; --accent: ...; --accent-contrast: ...; }\`), set \`html, body { overflow-x: hidden; background-color: var(--canvas); color: var(--ink-primary); }\`, and add refined editorial typography & motion utilities.
5. In \`src/App.tsx\`:
   - MUST export \`export default function App()\` (or \`export default App\`).
   - Keep \`src/App.tsx\` crisp, concise, and high-craft (~160-240 lines) with clean Tailwind v4 utilities + CSS variables and zero bloated boilerplate.
   - Strictly valid TypeScript JSX (zero unused variables/imports, properly typed state/handlers, zero syntax errors).
   - Responsive and ZERO horizontal overflow at 1440px desktop and 390px mobile.
   - ZERO broken images: if generated bespoke asset paths are provided (e.g. \`/generated/hero-primary.jpg\`), showcase them prominently in crisp editorial frames with \`object-cover\`. NEVER invent unverified external image URLs (no unsplash/example.com guesses that could 404).
   - STRICT WCAG AA CONTRAST: ALWAYS maintain >= 4.5:1 contrast between ALL readable text (headlines, body copy, captions, muted metadata, navigation links, inputs, and buttons) and their background canvas/surface/button fills! Never use pale washed-out grey ink on cream/white or dark muted ink on dark surfaces.
   - Preserve the real product/brand domain, core interactive functionality (tabs, interactive controls, forms, navigation), and authentic content while elevating copy away from generic AI buzzwords.
   - Strictly enforce the manifest's antiSlopBanList: NO purple/indigo AI gradients, NO glowing neon cards, NO generic dark-slate glassmorphism, NO sparkle emoji spam.`;

const FAST_SINGLE_PASS_SYSTEM_INSTRUCTION = `You are AntiSlop's Single-Pass Creative Director + Principal Frontend Design Engineer.
In ONE single ultra-fast pass, inspect the raw visual taste references (moodboards/website captures/webcam frames) and any spoken/written direction, synthesize a cohesive editorial DesignManifest, and rewrite the target React + TypeScript + Tailwind CSS UI into museum-grade craft with ZERO generic "AI slop".

HARD TECHNICAL & SPEED RULES (NON-NEGOTIABLE):
1. Return ONLY a single strictly valid JSON object with this EXACT shape (no markdown commentary outside JSON):
   {
     "manifest": {
       "vibeTitle": "2-5 word evocative atelier title",
       "editorialRationale": "2 incisive sentences explaining palette, typography pairing, and structural rhythm.",
       "tokens": {
         "palette": {
           "canvas": "#...",
           "surface": "#...",
           "surfaceMuted": "#...",
           "inkPrimary": "#...",
           "inkSecondary": "#...",
           "accent": "#...",
           "accentContrast": "#...",
           "borderSubtle": "rgba(...)"
         },
         "typography": {
           "displayFont": "Real Google Font",
           "bodyFont": "Real Google Font",
           "monoFont": "Real Google Font",
           "googleFontsUrl": "https://fonts.googleapis.com/css2?family=...&display=swap",
           "headlineTracking": "-0.03em",
           "editorialScaleRatio": 1.333,
           "bodyLineHeight": 1.6
         },
         "geometry": {
           "borderRadiusSm": "2px",
           "borderRadiusMd": "4px",
           "borderRadiusLg": "8px",
           "borderStyle": "1px solid var(--border-subtle)",
           "elevationPhilosophy": "flat-editorial"
         },
         "motion": {
           "easingCurve": "cubic-bezier(0.22, 1, 0.36, 1)",
           "hoverDurationMs": 200,
           "entranceStyle": "Restrained editorial reveal",
           "microInteractionNotes": "Crisp hairline underlines and poised ink shifts"
         },
         "layoutDirectives": ["Asymmetric editorial grid", "Generous negative space", "Zero horizontal overflow"],
         "antiSlopBanList": ["No purple/indigo AI gradients", "No dark-navy neon cards", "No sparkle emoji spam"]
       }
     },
     "files": {
       "index.html": "...full concise HTML loading the exact Google Fonts URL...",
       "src/index.css": "...full concise Tailwind v4 + CSS variable stylesheet...",
       "src/App.tsx": "...full crisp, high-craft React component (~160-240 lines)..."
     },
     "diffSummary": "Concise 1-2 sentence summary of aesthetic & structural changes",
     "changedSections": ["hero", "palette", "typography", "navigation", "layout", "footer"]
   }
2. CONCISE HIGH-CRAFT CODE FOR SPEED: Keep \`src/App.tsx\` crisp at ~160-240 lines (clean Tailwind v4 + CSS variables, compact data arrays, zero bloated boilerplate or massive inline SVG walls) and \`src/index.css\` concise (~35-60 lines) so generation finishes fast with publication-grade visual precision!
3. STRICT WCAG AA CONTRAST (>= 4.5:1): ALWAYS guarantee >= 4.5:1 foreground-to-background contrast across ALL text, eyebrows, captions, nav links, and buttons! Ensure \`inkPrimary\` and \`inkSecondary\` are decisively dark on light canvases (or decisively bright on dark canvases), and \`accentContrast\` has >= 4.5:1 contrast on \`accent\` buttons.
4. NEVER invent npm packages! Only import from 'react', 'lucide-react', or packages ALREADY imported in the provided source files. Use only standard lucide-react icons (ArrowUpRight, ArrowRight, Check, ChevronRight, Compass, Clock, Eye, Globe, Layers, Mail, MapPin, Menu, Minus, Play, Plus, Shield, Sliders, Star, Terminal, X, Zap).
5. Preserve \`@import "tailwindcss";\` on line 1 of \`src/index.css\` if present in original, and preserve \`<div id="root"></div>\` + \`<script type="module" src="/src/main.tsx"></script>\` in \`index.html\`.
6. ZERO broken images (NEVER invent external image URLs), ZERO horizontal overflow at 1440px desktop and 390px mobile, and preserve the real product/brand domain and core interactive controls while purging all AI slop clichés.`;

const BASELINE_SYSTEM_INSTRUCTION = `You are a frontend developer updating a React + TypeScript + Tailwind CSS application based on the user's text request.
Return ONLY a strictly valid JSON object with the exact shape:
{
  "files": {
    "index.html": "...full file content...",
    "src/index.css": "...full file content...",
    "src/App.tsx": "...full file content..."
  },
  "diffSummary": "Brief summary of changes"
}
Rules:
- Only import from 'react', 'lucide-react', or packages already imported in the source files.
- Preserve '@import "tailwindcss";' in src/index.css if present in the original.
- Preserve '<div id="root"></div>' and '<script type="module" src="/src/main.tsx"></script>' in index.html.
- Ensure src/App.tsx has a valid 'export default' and compiles cleanly with TypeScript.
- Do not use broken external image URLs.`;

function normalizeChangedSections(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const cleaned = raw
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase().slice(0, 40));
  return cleaned.length > 0 ? Array.from(new Set(cleaned)).slice(0, 10) : fallback;
}

function selectCoreFilesForFastPass(sourceFiles: Record<string, string>): Record<string, string> {
  const preferredOrder = ['index.html', 'src/index.css', 'src/App.tsx', 'src/App.jsx', 'src/styles.css'];
  const selected: Record<string, string> = {};

  for (const key of preferredOrder) {
    if (sourceFiles[key] !== undefined) {
      selected[key] = sourceFiles[key];
    }
  }

  // Fallback for non-standard repo structures (e.g. cloned GitHub repo)
  if (Object.keys(selected).length < 3) {
    for (const [filePath, content] of Object.entries(sourceFiles)) {
      if (Object.keys(selected).length >= 3) break;
      if (selected[filePath] !== undefined) continue;
      if (
        filePath.endsWith('.html') ||
        filePath.endsWith('.css') ||
        /app\.(tsx|jsx|ts|js)$/i.test(filePath) ||
        /page\.(tsx|jsx)$/i.test(filePath)
      ) {
        selected[filePath] = content;
      }
    }
  }

  if (Object.keys(selected).length === 0) {
    for (const [filePath, content] of Object.entries(sourceFiles).slice(0, 3)) {
      selected[filePath] = content;
    }
  }

  // Keep prompt payload crisp so input processing stays fast
  const trimmed: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(selected)) {
    trimmed[filePath] = content.length > 14_000 ? `${content.slice(0, 14_000)}\n/* ...truncated for fast pass... */` : content;
  }
  return trimmed;
}

function formatSourceFilesForPrompt(sourceFiles: Record<string, string>): string {
  return Object.entries(sourceFiles)
    .map(([filePath, content]) => `=== FILE: ${filePath} ===\n${content}`)
    .join('\n\n');
}

function collectExistingPackages(sourceFiles: Record<string, string>): Set<string> {
  const allowed = new Set<string>(SAFE_EXTERNAL_PACKAGES);
  const importRe = /from\s+['"]([^'"./][^'"]*)['"]/g;
  for (const content of Object.values(sourceFiles)) {
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      const pkg = m[1].startsWith('@')
        ? m[1].split('/').slice(0, 2).join('/')
        : m[1].split('/')[0];
      allowed.add(pkg);
    }
  }
  return allowed;
}

function hasDisallowedExternalImport(code: string, allowedPackages: Set<string>): boolean {
  const importRe = /from\s+['"]([^'"./][^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(code)) !== null) {
    const specifier = m[1];
    const pkg = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
    if (!allowedPackages.has(pkg)) {
      return true;
    }
  }
  return false;
}

function sanitizeAndValidateFiles(
  rawFiles: unknown,
  originalFiles: Record<string, string>
): Record<string, string> {
  if (!rawFiles || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) {
    return {};
  }

  const allowedPackages = collectExistingPackages(originalFiles);
  const validated: Record<string, string> = {};
  const originalHasTailwindV4 = Object.entries(originalFiles).some(
    ([k, v]) => k.endsWith('.css') && v.includes('@import "tailwindcss"')
  );

  for (const [rawKey, rawVal] of Object.entries(rawFiles as Record<string, unknown>)) {
    if (typeof rawVal !== 'string') continue;
    const filePath = rawKey.trim().replace(/^\/+/, '');
    if (!filePath || filePath.includes('..')) continue;

    let content = stripCodeFence(rawVal);
    if (content.trim().length < 20) continue;

    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx') || filePath.endsWith('.ts')) {
      if (filePath.endsWith('App.tsx') || filePath.endsWith('App.jsx')) {
        if (!/export\s+default\b/.test(content) || content.trim().length < 180) {
          continue;
        }
      }
      if (hasDisallowedExternalImport(content, allowedPackages)) {
        continue;
      }
      // Basic brace sanity check (extreme truncation guard)
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      if (Math.abs(openBraces - closeBraces) > 3) {
        continue;
      }
    }

    if (filePath === 'index.html' || filePath.endsWith('/index.html')) {
      if (!content.includes('root') || !content.includes('<script')) {
        continue;
      }
    }

    if (filePath.endsWith('.css')) {
      if (originalHasTailwindV4 && !content.includes('@import "tailwindcss"') && !content.includes("@import 'tailwindcss'")) {
        content = `@import "tailwindcss";\n\n${content}`;
      }
    }

    validated[filePath] = content;
  }

  return validated;
}

async function runSingleCandidateGeneration(args: {
  model: string;
  thinkingLevel: 'low' | 'medium' | 'high';
  strategy: CandidateStrategy;
  manifest?: DesignManifest;
  sourceFiles: Record<string, string>;
  generatedPublicPaths: string[];
  mode: TransformRunRequest['mode'];
  textPrompt?: string;
}): Promise<GeneratedCandidateCode | null> {
  const startedAt = Date.now();
  const isBaseline = args.mode === 'text_baseline';

  const systemInstruction = isBaseline ? BASELINE_SYSTEM_INSTRUCTION : CODER_SYSTEM_INSTRUCTION;

  const userPromptSections: string[] = [];

  if (isBaseline) {
    userPromptSections.push(
      `User Request: ${args.textPrompt?.trim() || 'Redesign this landing page to look modern, polished, and impressive.'}`
    );
  } else {
    userPromptSections.push(`Architectural Strategy: ${args.strategy.label}\n${args.strategy.architecturalBrief}`);

    if (args.manifest) {
      userPromptSections.push(
        `LOCKED DESIGN MANIFEST (execute with 100% visual fidelity):\n${JSON.stringify(
          {
            vibeTitle: args.manifest.vibeTitle,
            editorialRationale: args.manifest.editorialRationale,
            conflictResolutionNotes: args.manifest.conflictResolutionNotes,
            tokens: args.manifest.tokens,
          },
          null,
          2
        )}`
      );
    }

    if (args.generatedPublicPaths.length > 0) {
      userPromptSections.push(
        `BESPOKE GENERATED EDITORIAL IMAGES AVAILABLE IN PUBLIC/:\n${args.generatedPublicPaths
          .map((u, idx) => `- Slot ${idx + 1}: "${u}" (render via <img src="${u}" ... /> with crisp framing, aspect ratio discipline, and object-cover)`)
          .join('\n')}`
      );
    } else {
      userPromptSections.push(
        `No generated raster images were supplied; craft bespoke sculptural typography, SVG architectural diagrams/motifs, or pure CSS material compositions instead of inventing external URLs.`
      );
    }

    if (args.textPrompt && args.textPrompt.trim()) {
      userPromptSections.push(`Additional User Notes:\n${args.textPrompt.trim()}`);
    }
  }

  userPromptSections.push(
    `CURRENT SOURCE FILES TO TRANSFORM:\n${formatSourceFilesForPrompt(args.sourceFiles)}`
  );

  userPromptSections.push(
    `Output ONLY valid JSON matching { "files": { "index.html": "...", "src/index.css": "...", "src/App.tsx": "..." }, "diffSummary": "...", "changedSections": ["hero", "palette", "typography", ...] }.`
  );

  const interaction = await withV1Client((client) =>
    client.interactions.create({
      model: args.model,
      system_instruction: systemInstruction,
      input: userPromptSections.join('\n\n'),
      generation_config: {
        thinking_level: args.thinkingLevel,
      },
      store: false,
    })
  );

  const rawText = extractInteractionText(interaction);
  const parsed = extractJsonObject<{
    files?: unknown;
    diffSummary?: unknown;
    changedSections?: unknown;
  }>(rawText);
  if (!parsed) return null;

  const files = sanitizeAndValidateFiles(parsed.files, args.sourceFiles);
  if (Object.keys(files).length === 0) return null;

  const diffSummary =
    typeof parsed.diffSummary === 'string' && parsed.diffSummary.trim().length > 0
      ? parsed.diffSummary.trim()
      : `${args.strategy.label}: transformed ${Object.keys(files).join(', ')}`;

  const changedSections = normalizeChangedSections(parsed.changedSections, [
    'hero',
    'palette',
    'typography',
    'layout',
  ]);

  return {
    candidateId: uuidv4(),
    strategyLabel: args.strategy.label,
    modelUsed: args.model,
    files,
    diffSummary,
    changedSections,
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * Single-Pass Fast Fusion (`fast_demo` <25s live judging):
 * Sends raw reference images (max 3) + voice transcript + concise core source files
 * (`index.html`, `src/index.css`, `src/App.tsx`) in ONE SINGLE `gemini-4-hydrogen`
 * (`thinking_level: 'low'`) call returning manifest + rewritten files + changedSections.
 */
export async function runFastSinglePass(
  params: RunFastSinglePassParams
): Promise<FastSinglePassResult> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_PATCHER;

  return traceSpan(
    'antislop.coder.runFastSinglePass',
    'llm',
    {
      model,
      thinkingLevel: 'low',
      assetCount: params.assets.length,
      hasVoiceTranscript: Boolean(params.voiceTranscript),
      hasTextPrompt: Boolean(params.textPrompt),
      hasAnnotatedScreenshot: Boolean(params.annotatedScreenshotBase64),
    },
    async () => {
      const coreFiles = selectCoreFilesForFastPass(params.sourceFiles);
      const inputBlocks: Interactions.Content[] = [];
      const modalitySet = new Set<InputModality>();

      // Attach up to 3 raw reference images (+ at most 1 small motion video if provided)
      let addedImages = 0;
      let addedVideos = 0;
      for (const asset of params.assets) {
        modalitySet.add(asset.modality);
        if (asset.modality === 'voice_audio') continue;

        const binary = await resolveAssetBinary(asset);
        if (!binary) continue;

        if (asset.modality === 'motion_video' || binary.mimeType.startsWith('video/')) {
          if (addedVideos >= 1 || estimateBase64Bytes(binary.base64) > 8_000_000) continue;
          addedVideos += 1;
          inputBlocks.push({
            type: 'text',
            text: `[Motion Reference Video${asset.label ? ` — ${asset.label}` : ''}]: Match its motion easing, tempo, and visual poise.`,
          });
          inputBlocks.push({
            type: 'video',
            data: binary.base64,
            mime_type: binary.mimeType,
          });
        } else if (binary.mimeType.startsWith('image/')) {
          if (addedImages >= 3) continue;
          addedImages += 1;
          inputBlocks.push({
            type: 'text',
            text: `[Reference Taste Anchor #${addedImages}${asset.label ? ` (${asset.label})` : ''}]: Extract exact palette, material surface, typography character, and editorial grid discipline.`,
          });
          inputBlocks.push({
            type: 'image',
            data: binary.base64,
            mime_type: binary.mimeType,
          });
        }
      }

      if (params.voiceTranscript && params.voiceTranscript.trim()) {
        modalitySet.add('voice_audio');
      }

      if (params.annotatedScreenshotBase64) {
        modalitySet.add('region_annotation');
        const { base64, detectedMime } = stripDataUriPrefix(params.annotatedScreenshotBase64);
        if (base64.length > 16) {
          const circleCoords = (params.drawnCircles ?? [])
            .map(
              (c, idx) =>
                `Circle #${idx + 1}: x=${c.x.toFixed(2)}, y=${c.y.toFixed(2)}, w=${c.width.toFixed(2)}, h=${c.height.toFixed(2)}${c.note ? ` (${c.note})` : ''}`
            )
            .join('\n');
          inputBlocks.push({
            type: 'text',
            text:
              `[ANNOTATED UI CANVAS WITH RED CIRCLES]: Prioritize transforming the encircled regions while harmonizing the full page.` +
              (circleCoords ? `\nCircle coordinates [0..1]:\n${circleCoords}` : ''),
          });
          inputBlocks.push({
            type: 'image',
            data: base64,
            mime_type: normalizeMimeType(detectedMime, 'image/png'),
          });
        }
      }

      if (modalitySet.size === 0) {
        modalitySet.add('moodboard_image');
      }

      const briefSections: string[] = [
        'SINGLE-PASS FAST FUSION BRIEF: Transform this UI in ONE cohesive, high-craft pass faithful to the attached visual taste references.',
      ];

      if (params.voiceTranscript && params.voiceTranscript.trim()) {
        briefSections.push(`Spoken Voice Creative Direction:\n"${params.voiceTranscript.trim()}"`);
      }
      if (params.textPrompt && params.textPrompt.trim()) {
        briefSections.push(`Additional Creative Direction:\n"${params.textPrompt.trim()}"`);
      }
      if (params.generatedPublicPaths && params.generatedPublicPaths.length > 0) {
        briefSections.push(
          `Available Local Public Images:\n${params.generatedPublicPaths.map((p) => `- "${p}"`).join('\n')}`
        );
      }

      briefSections.push(
        'CRAFT & CONTRAST CHECKLIST:\n- Keep src/App.tsx concise (~160-240 lines) with crisp Tailwind v4 utilities + CSS variables.\n- Enforce >= 4.5:1 WCAG AA contrast on EVERY text node, label, nav link, and button.\n- Zero horizontal overflow, zero broken images, zero generic purple/indigo AI slop gradients.'
      );

      briefSections.push(
        `CURRENT CORE SOURCE FILES TO REWRITE:\n${formatSourceFilesForPrompt(coreFiles)}`
      );

      briefSections.push(
        `Output ONLY strictly valid JSON matching { "manifest": { "vibeTitle", "editorialRationale", "tokens": { ... } }, "files": { "index.html": "...", "src/index.css": "...", "src/App.tsx": "..." }, "diffSummary": "...", "changedSections": ["hero", "palette", "typography", ...] }.`
      );

      inputBlocks.push({
        type: 'text',
        text: briefSections.join('\n\n'),
      });

      const attemptOnce = async (attemptModel: string): Promise<FastSinglePassResult | null> => {
        const interaction = await withV1Client((client) =>
          client.interactions.create({
            model: attemptModel,
            system_instruction: FAST_SINGLE_PASS_SYSTEM_INSTRUCTION,
            input: [
              {
                type: 'user_input',
                content: inputBlocks,
              },
            ],
            generation_config: {
              thinking_level: 'low',
            },
            store: false,
          })
        );

        const rawText = extractInteractionText(interaction);
        const parsed = extractJsonObject<{
          manifest?: Record<string, unknown>;
          files?: unknown;
          diffSummary?: unknown;
          changedSections?: unknown;
        }>(rawText);

        if (!parsed) return null;

        const files = sanitizeAndValidateFiles(parsed.files, params.sourceFiles);
        if (Object.keys(files).length === 0) return null;

        const latencyMs = Date.now() - startedAt;
        const manifest = normalizeManifest(
          parsed.manifest && typeof parsed.manifest === 'object' ? parsed.manifest : null,
          {
            modalities: Array.from(modalitySet),
            modelUsed: attemptModel,
            latencyMs,
            mode: 'antislop',
          }
        );

        const changedSections = normalizeChangedSections(parsed.changedSections, [
          'hero',
          'palette',
          'typography',
          'navigation',
          'layout',
        ]);

        const diffSummary =
          typeof parsed.diffSummary === 'string' && parsed.diffSummary.trim().length > 0
            ? parsed.diffSummary.trim()
            : `Fast Fusion (${manifest.vibeTitle}): transformed ${Object.keys(files).join(', ')}`;

        const candidate: GeneratedCandidateCode = {
          candidateId: uuidv4(),
          strategyLabel: `Fast Fusion — ${manifest.vibeTitle}`,
          modelUsed: attemptModel,
          files,
          diffSummary,
          changedSections,
          latencyMs,
        };

        return {
          manifest,
          candidate,
          changedSections,
          latencyMs,
        };
      };

      const first = await attemptOnce(model);
      if (first) return first;

      // Single fast fallback attempt if first JSON output failed validation
      const retry = await attemptOnce(model);
      if (retry) return retry;

      throw new Error('Fast Single-Pass Fusion failed to produce valid manifest and source files');
    }
  );
}

/**
 * Generates 1 (fast_demo / text_baseline) or N parallel (deep_atelier) UI code candidates.
 */
export async function generateCodeCandidates(
  params: GenerateCodeCandidatesParams
): Promise<GeneratedCandidateCode[]> {
  return traceSpan(
    'antislop.coder.generateCandidates',
    'llm',
    {
      mode: params.mode,
      speedMode: params.speedMode,
      parallelCount: params.parallelCount,
      generatedPublicPaths: params.generatedPublicPaths,
      vibeTitle: params.manifest?.vibeTitle,
    },
    async () => {
      // Mode 1: Authentic naive text-only baseline (for 5-Sigma benchmark)
      if (params.mode === 'text_baseline') {
        const baselineCandidate = await runSingleCandidateGeneration({
          model: ENV.GEMINI_MODEL_PATCHER,
          thinkingLevel: 'low',
          strategy: {
            label: 'Naive Text-Only Baseline',
            architecturalBrief: 'Standard text-only redesign.',
          },
          sourceFiles: params.sourceFiles,
          generatedPublicPaths: [],
          mode: 'text_baseline',
          textPrompt: params.textPrompt,
        });

        if (baselineCandidate) return [baselineCandidate];
        throw new Error('Text baseline code generation failed to produce valid source files');
      }

      // Mode 2: Fast Demo (<25s live judging) — single ultra-fast surgical rewrite
      if (params.speedMode === 'fast_demo') {
        const fastCandidate = await runSingleCandidateGeneration({
          model: ENV.GEMINI_MODEL_PATCHER,
          thinkingLevel: 'low',
          strategy: CURATED_STRATEGIES[0],
          manifest: params.manifest,
          sourceFiles: params.sourceFiles,
          generatedPublicPaths: params.generatedPublicPaths,
          mode: params.mode,
          textPrompt: params.textPrompt,
        });

        if (fastCandidate) return [fastCandidate];

        // Single safe retry on gemini-4-neon (low) if first JSON failed validation
        const retryCandidate = await runSingleCandidateGeneration({
          model: ENV.GEMINI_MODEL_ARCHITECT,
          thinkingLevel: 'low',
          strategy: CURATED_STRATEGIES[1],
          manifest: params.manifest,
          sourceFiles: params.sourceFiles,
          generatedPublicPaths: params.generatedPublicPaths,
          mode: params.mode,
          textPrompt: params.textPrompt,
        });

        if (retryCandidate) return [retryCandidate];
        throw new Error('Fast-demo code generation failed to produce valid source files');
      }

      // Mode 3: Deep Atelier — N parallel candidate architectures on gemini-4-neon (low thinking) across dual Tier-3 keys
      const count = Math.min(4, Math.max(1, params.parallelCount || ENV.ANTISLOP_PARALLEL_CANDIDATES));
      const strategies = CURATED_STRATEGIES.slice(0, count);

      const settled = await Promise.allSettled(
        strategies.map((strategy) =>
          runSingleCandidateGeneration({
            model: ENV.GEMINI_MODEL_ARCHITECT,
            thinkingLevel: 'low',
            strategy,
            manifest: params.manifest,
            sourceFiles: params.sourceFiles,
            generatedPublicPaths: params.generatedPublicPaths,
            mode: params.mode,
            textPrompt: params.textPrompt,
          })
        )
      );

      const validCandidates: GeneratedCandidateCode[] = [];
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled' && outcome.value) {
          validCandidates.push(outcome.value);
        }
      }

      if (validCandidates.length > 0) {
        return validCandidates;
      }

      // Emergency fallback onto gemini-4-hydrogen so a live demo never hard-crashes
      const fallback = await runSingleCandidateGeneration({
        model: ENV.GEMINI_MODEL_PATCHER,
        thinkingLevel: 'low',
        strategy: CURATED_STRATEGIES[0],
        manifest: params.manifest,
        sourceFiles: params.sourceFiles,
        generatedPublicPaths: params.generatedPublicPaths,
        mode: params.mode,
        textPrompt: params.textPrompt,
      });

      if (fallback) return [fallback];
      throw new Error('All parallel code candidate generations failed validation');
    }
  );
}

function summarizeFailingScorecard(scorecard: DecisionsScorecard): string {
  const failedMetrics = Object.values(scorecard.metrics)
    .filter((m) => !m.passed)
    .map((m) => {
      const valStr =
        m.type === 'choice'
          ? `choice="${m.choiceLabel}"`
          : m.type === 'noul'
            ? `P(true)=${m.value.toFixed(2)}`
            : `score=${m.value.toFixed(1)}/10`;
      return `- ${m.label} (${m.id}): ${valStr} [FAILED gate: ${m.thresholdDescription}]`;
    });

  const domLines: string[] = [
    `Horizontal overflow: ${scorecard.domAudit.horizontalOverflowPx}px (must be <= 12px)`,
    `Overlapping text nodes: ${scorecard.domAudit.overlappingTextNodes} (must be <= 2)`,
    `Broken images: ${scorecard.domAudit.brokenImageCount} (must be 0)`,
    `Console errors: ${scorecard.domAudit.consoleErrorCount} (must be 0)`,
  ];

  return [
    `Overall AntiSlop Taste Index: ${scorecard.overallTasteScore.toFixed(1)}/100 (Passed All Gates: ${scorecard.passedAllGates})`,
    `Dominant Aesthetic Class: ${scorecard.metrics.dominantAestheticClass.choiceLabel ?? 'unknown'}`,
    `Primary Defect Class: ${scorecard.metrics.primaryDefectClass.choiceLabel ?? 'unknown'}`,
    `Critic Action Directive: ${scorecard.criticActionDirective}`,
    failedMetrics.length > 0 ? `Failed Decisions API Probes:\n${failedMetrics.join('\n')}` : 'All Decisions probes near threshold — elevate craft further.',
    `Deterministic Puppeteer DOM Audit:\n${domLines.join('\n')}`,
  ].join('\n\n');
}

/**
 * Ultra-fast surgical patcher on `gemini-4-hydrogen` (`thinking_level: 'low' | 'medium'`)
 * powering both Circle-and-Speak direct manipulation and the Decisions API Critic Loop.
 */
export async function applySurgicalPatch(
  params: ApplySurgicalPatchParams
): Promise<SurgicalPatchResult> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_PATCHER;
  const thinkingLevel: 'low' | 'medium' = params.speedMode === 'deep_atelier' ? 'medium' : 'low';

  return traceSpan(
    'antislop.coder.applySurgicalPatch',
    'llm',
    {
      model,
      thinkingLevel,
      hasAnnotatedScreenshot: Boolean(params.annotatedScreenshotBase64),
      hasCurrentScreenshot: Boolean(params.currentScreenshotBase64),
      drawnCircleCount: params.drawnCircles?.length ?? 0,
      hasScorecard: Boolean(params.scorecard),
      scorecardOverall: params.scorecard?.overallTasteScore,
      hasErrorContext: Boolean(params.errorContext),
      hasInstruction: Boolean(params.instruction),
    },
    async () => {
      const inputBlocks: Interactions.Content[] = [];

      // Include up to 3 reference moodboard images so patches never drift off-taste
      if (params.referenceAssets && params.referenceAssets.length > 0) {
        let addedRefs = 0;
        for (const asset of params.referenceAssets) {
          if (addedRefs >= 3) break;
          if (asset.modality === 'motion_video' || asset.modality === 'voice_audio') continue;
          const binary = await resolveAssetBinary(asset);
          if (!binary || !binary.mimeType.startsWith('image/')) continue;
          addedRefs += 1;
          inputBlocks.push({
            type: 'text',
            text: `[Reference Moodboard Anchor #${addedRefs}]: Stay visually faithful to this material & typographic taste.`,
          });
          inputBlocks.push({
            type: 'image',
            data: binary.base64,
            mime_type: binary.mimeType,
          });
        }
      }

      // Attach annotated red-circle screenshot (Circle-and-Speak) OR current rendered screenshot (Critic Loop)
      if (params.annotatedScreenshotBase64) {
        const { base64, detectedMime } = stripDataUriPrefix(params.annotatedScreenshotBase64);
        if (base64.length > 16) {
          const circleCoords = (params.drawnCircles ?? [])
            .map(
              (c, i) =>
                `Circle #${i + 1}: x=${c.x.toFixed(2)}, y=${c.y.toFixed(2)}, w=${c.width.toFixed(2)}, h=${c.height.toFixed(2)}${c.note ? ` (${c.note})` : ''}`
            )
            .join('\n');

          inputBlocks.push({
            type: 'text',
            text:
              `[ANNOTATED UI SCREENSHOT WITH USER-DRAWN RED CIRCLES]: Apply surgical edits specifically targeting the regions circled in bright red while preserving the rest of the layout!` +
              (circleCoords ? `\nCircle coordinates [0..1]:\n${circleCoords}` : ''),
          });
          inputBlocks.push({
            type: 'image',
            data: base64,
            mime_type: normalizeMimeType(detectedMime, 'image/png'),
          });
        }
      } else if (params.currentScreenshotBase64) {
        const { base64, detectedMime } = stripDataUriPrefix(params.currentScreenshotBase64);
        if (base64.length > 16) {
          inputBlocks.push({
            type: 'text',
            text: '[CURRENT RENDERED UI SCREENSHOT]: Inspect every visual defect, spacing flaw, contrast issue, or broken element directly in this live render.',
          });
          inputBlocks.push({
            type: 'image',
            data: base64,
            mime_type: normalizeMimeType(detectedMime, 'image/png'),
          });
        }
      }

      const directiveSections: string[] = [
        'SURGICAL PATCH BRIEF: Apply targeted, high-precision fixes to the codebase without breaking working functionality or visual coherence. ALWAYS maintain >= 4.5:1 WCAG AA contrast between ink and canvas/surface/buttons.',
      ];

      if (params.instruction && params.instruction.trim()) {
        directiveSections.push(`Direct User / Voice Instruction:\n"${params.instruction.trim()}"`);
      }

      if (params.targetRegion) {
        directiveSections.push(
          `Target Region Box [0..1]: x=${params.targetRegion.x.toFixed(2)}, y=${params.targetRegion.y.toFixed(2)}, w=${params.targetRegion.width.toFixed(2)}, h=${params.targetRegion.height.toFixed(2)}\nRegion Instruction: "${params.targetRegion.instruction}"`
        );
      }

      if (params.scorecard) {
        directiveSections.push(
          `DECISIONS API CRITIC SCORECARD & DOM AUDIT (FIX EVERY FAILING GATE):\n${summarizeFailingScorecard(params.scorecard)}`
        );
      }

      if (params.errorContext && params.errorContext.trim()) {
        directiveSections.push(
          `BUILD / VITE / RUNTIME ERROR CONTEXT (MUST RESOLVE COMPLETELY):\n${params.errorContext.trim().slice(0, 2400)}`
        );
      }

      if (params.manifest) {
        directiveSections.push(
          `DESIGN MANIFEST TOKENS (KEEP ALIGNED):\n${JSON.stringify(
            {
              vibeTitle: params.manifest.vibeTitle,
              palette: params.manifest.tokens.palette,
              typography: params.manifest.tokens.typography,
              geometry: params.manifest.tokens.geometry,
              antiSlopBanList: params.manifest.tokens.antiSlopBanList,
            },
            null,
            2
          )}`
        );
      }

      directiveSections.push(
        `CURRENT SOURCE FILES:\n${formatSourceFilesForPrompt(params.sourceFiles)}`
      );

      directiveSections.push(
        `Return ONLY a strictly valid JSON object { "files": { ...updated full file contents... }, "diffSummary": "Concise summary of surgical fixes applied", "changedSections": ["hero", "contrast", ...] }.`
      );

      inputBlocks.push({
        type: 'text',
        text: directiveSections.join('\n\n'),
      });

      const interaction = await withV1Client((client) =>
        client.interactions.create({
          model,
          system_instruction: CODER_SYSTEM_INSTRUCTION,
          input: [
            {
              type: 'user_input',
              content: inputBlocks,
            },
          ],
          generation_config: {
            thinking_level: thinkingLevel,
          },
          store: false,
        })
      );

      const rawText = extractInteractionText(interaction);
      const parsed = extractJsonObject<{
        files?: unknown;
        diffSummary?: unknown;
        changedSections?: unknown;
      }>(rawText);
      const files = parsed ? sanitizeAndValidateFiles(parsed.files, params.sourceFiles) : {};

      if (Object.keys(files).length === 0) {
        return {
          modelUsed: model,
          files: {},
          diffSummary: 'Surgical patch produced no valid file updates; keeping previous build.',
          changedSections: [],
          latencyMs: Date.now() - startedAt,
        };
      }

      const diffSummary =
        parsed && typeof parsed.diffSummary === 'string' && parsed.diffSummary.trim().length > 0
          ? parsed.diffSummary.trim()
          : `Surgical patch updated ${Object.keys(files).join(', ')}`;

      const changedSections = normalizeChangedSections(
        parsed?.changedSections,
        params.drawnCircles && params.drawnCircles.length > 0
          ? ['circled-region', 'layout']
          : ['polish', 'contrast', 'layout']
      );

      return {
        modelUsed: model,
        files,
        diffSummary,
        changedSections,
        latencyMs: Date.now() - startedAt,
      };
    }
  );
}
