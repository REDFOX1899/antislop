import type { Interactions } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import type {
  DecisionsScorecard,
  DesignManifest,
  DrawnCircleAnnotation,
  ExecutionSpeedMode,
  MediaAssetInput,
  TransformRunRequest,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import type { GeneratedCandidateCode, SurgicalPatchResult } from './contracts.js';
import { traceSpan, withV1Client } from './clientPool.js';
import {
  extractInteractionText,
  extractJsonObject,
  normalizeMimeType,
  resolveAssetBinary,
  stripCodeFence,
  stripDataUriPrefix,
} from './mediaUtils.js';

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
     "diffSummary": "Concise 1-2 sentence summary of aesthetic & structural changes"
   }
2. NEVER invent npm packages! Only import from 'react', 'lucide-react', or packages ALREADY imported in the provided source files. Stick to standard widely available lucide-react icons (ArrowUpRight, ArrowRight, Check, ChevronRight, Compass, Clock, Eye, Globe, Layers, Mail, MapPin, Menu, Minus, Play, Plus, Shield, Sliders, Star, Terminal, X, Zap).
3. In \`index.html\`: load the DesignManifest's Google Fonts stylesheet cleanly (preconnect + stylesheet link), set a tasteful <title>, and preserve the existing \`<div id="root"></div>\` and \`<script type="module" src="/src/main.tsx"></script>\` entry script verbatim.
4. In \`src/index.css\`: if the original CSS contains \`@import "tailwindcss";\`, YOU MUST PRESERVE \`@import "tailwindcss";\` on line 1! Define CSS variables (\`:root { --canvas: ...; --surface: ...; --ink-primary: ...; --accent: ...; }\`), set \`html, body { overflow-x: hidden; background-color: var(--canvas); color: var(--ink-primary); }\`, and add refined editorial typography & motion utilities.
5. In \`src/App.tsx\`:
   - MUST export \`export default function App()\` (or \`export default App\`).
   - Strictly valid TypeScript JSX (zero unused variables/imports, properly typed state/handlers, zero syntax errors).
   - Responsive and ZERO horizontal overflow at 1440px desktop and 390px mobile.
   - ZERO broken images: if generated bespoke asset paths are provided (e.g. \`/generated/hero-primary.jpg\`), showcase them prominently in crisp editorial frames with \`object-cover\`. NEVER invent unverified external image URLs (no unsplash/example.com guesses that could 404).
   - Achieve >= 4.5:1 WCAG AA contrast for all readable body text and buttons.
   - Preserve the real product/brand domain, core interactive functionality (tabs, interactive controls, forms, navigation), and authentic content while elevating copy away from generic AI buzzwords.
   - Strictly enforce the manifest's antiSlopBanList: NO purple/indigo AI gradients, NO glowing neon cards, NO generic dark-slate glassmorphism, NO sparkle emoji spam.`;

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
    `Output ONLY valid JSON matching { "files": { "index.html": "...", "src/index.css": "...", "src/App.tsx": "..." }, "diffSummary": "..." }.`
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
  const parsed = extractJsonObject<{ files?: unknown; diffSummary?: unknown }>(rawText);
  if (!parsed) return null;

  const files = sanitizeAndValidateFiles(parsed.files, args.sourceFiles);
  if (Object.keys(files).length === 0) return null;

  const diffSummary =
    typeof parsed.diffSummary === 'string' && parsed.diffSummary.trim().length > 0
      ? parsed.diffSummary.trim()
      : `${args.strategy.label}: transformed ${Object.keys(files).join(', ')}`;

  return {
    candidateId: uuidv4(),
    strategyLabel: args.strategy.label,
    modelUsed: args.model,
    files,
    diffSummary,
    latencyMs: Date.now() - startedAt,
  };
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

      // Mode 3: Deep Atelier — N parallel candidate architectures on gemini-4-neon across dual Tier-3 keys
      const count = Math.min(4, Math.max(1, params.parallelCount || ENV.ANTISLOP_PARALLEL_CANDIDATES));
      const strategies = CURATED_STRATEGIES.slice(0, count);

      const settled = await Promise.allSettled(
        strategies.map((strategy) =>
          runSingleCandidateGeneration({
            model: ENV.GEMINI_MODEL_ARCHITECT,
            thinkingLevel: 'medium',
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
        thinkingLevel: 'medium',
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
    `Horizontal overflow: ${scorecard.domAudit.horizontalOverflowPx}px (must be <= 8px)`,
    `Overlapping text nodes: ${scorecard.domAudit.overlappingTextNodes} (must be 0)`,
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
 * Ultra-fast surgical patcher on `gemini-4-hydrogen` (`thinking_level: 'medium'`)
 * powering both Circle-and-Speak direct manipulation and the Decisions API Critic Loop.
 */
export async function applySurgicalPatch(
  params: ApplySurgicalPatchParams
): Promise<SurgicalPatchResult> {
  const startedAt = Date.now();
  const model = ENV.GEMINI_MODEL_PATCHER;

  return traceSpan(
    'antislop.coder.applySurgicalPatch',
    'llm',
    {
      model,
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
        'SURGICAL PATCH BRIEF: Apply targeted, high-precision fixes to the codebase without breaking working functionality or visual coherence.',
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
        `Return ONLY a strictly valid JSON object { "files": { ...updated full file contents... }, "diffSummary": "Concise summary of surgical fixes applied" }.`
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
            thinking_level: 'medium',
          },
          store: false,
        })
      );

      const rawText = extractInteractionText(interaction);
      const parsed = extractJsonObject<{ files?: unknown; diffSummary?: unknown }>(rawText);
      const files = parsed ? sanitizeAndValidateFiles(parsed.files, params.sourceFiles) : {};

      if (Object.keys(files).length === 0) {
        return {
          modelUsed: model,
          files: {},
          diffSummary: 'Surgical patch produced no valid file updates; keeping previous build.',
          latencyMs: Date.now() - startedAt,
        };
      }

      const diffSummary =
        parsed && typeof parsed.diffSummary === 'string' && parsed.diffSummary.trim().length > 0
          ? parsed.diffSummary.trim()
          : `Surgical patch updated ${Object.keys(files).join(', ')}`;

      return {
        modelUsed: model,
        files,
        diffSummary,
        latencyMs: Date.now() - startedAt,
      };
    }
  );
}
