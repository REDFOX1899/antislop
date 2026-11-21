import { ENV } from '../config/env.js';
import { summarizeSourceFiles } from '../orchestrator/transformOrchestrator.js';
import { snapshotManager } from '../sandbox/snapshotManager.js';
import { viteManager } from '../sandbox/viteManager.js';
import { traceSpan, withV1Client } from './clientPool.js';
import { extractInteractionText, extractJsonObject } from './mediaUtils.js';

export interface DesignRecommendationItem {
  id: string;
  badge: string;
  title: string;
  rationale: string;
  prompt: string;
  enableBespokeArt: boolean;
  mode: 'antislop' | 'circle_tweak';
}

export interface RecommendationsResponse {
  workspaceId: string;
  brandSummary: string;
  recommendations: DesignRecommendationItem[];
}

const RECOMMENDER_TIMEOUT_MS = 6500;

const RECOMMENDER_SYSTEM_INSTRUCTION = `You are AntiSlop's Principal Design Critic & Creative Strategist.
Given a target website's extracted domain summary, headings, copy, and stack, generate EXACTLY 4 concrete, domain-grounded UI transformation recommendations covering:
1. CSS 3D Spatial Depth & Asymmetric Bento/Swiss Architecture (perspective(1200px), specular top-edge hairlines, focal hierarchy).
2. Museum-Grade Typography & Contrast Calibration (expressive Google Font Display + Body + Mono pairing, WCAG AA >= 4.5:1 contrast, 60/30/10 restraint).
3. Domain-Grounded Bespoke Hero Art (Nano Banana 2.1 visual depicting the site's actual product/subject — enableBespokeArt: true).
4. Interactive Polish / Targeted Surgical Refinement (compositor-only cubic-bezier(0.22, 1, 0.36, 1) motion, native primitives, or interactive focus).

Return ONLY a strictly valid JSON object:
{
  "brandSummary": "Concise 1-sentence summary of what this website is and sells/presents",
  "recommendations": [
    {
      "id": "rec-1",
      "badge": "3D SPATIAL",
      "title": "Short punchy 4-7 word action title",
      "rationale": "1 crisp sentence explaining why this elevates the specific site and eliminates AI slop.",
      "prompt": "Concrete, ready-to-run transformation prompt referencing the site's actual brand/domain and exact design engineering directives.",
      "enableBespokeArt": false,
      "mode": "antislop"
    }
  ]
}
Rules:
- Exactly 4 items in "recommendations".
- "mode" must be either "antislop" or "circle_tweak".
- "enableBespokeArt" must be boolean (set true on at least 1 art-driven recommendation).
- Ground every single title, rationale, and prompt in the target website's REAL brand/subject — zero generic boilerplate.`;

function extractBrandSnippet(domainSummary: string, workspaceName: string): {
  brandName: string;
  domainType: 'saas' | 'commerce' | 'portfolio' | 'generic';
  brandSummary: string;
} {
  const titleLine = domainSummary.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || workspaceName;
  const brandName = titleLine.split(/[—–\-|·:]/)[0]?.trim() || workspaceName;
  const lower = `${workspaceName} ${domainSummary}`.toLowerCase();

  if (
    /(coffee|ceramic|homeware|tableware|shop|store|kova|cart|product|objects|apparel|roast)/.test(lower)
  ) {
    return {
      brandName,
      domainType: 'commerce',
      brandSummary: `${brandName} — curated physical goods and tactile commerce storefront (${titleLine}).`,
    };
  }
  if (
    /(portfolio|personal|creative|developer|engineer|canvas|shader|studio|nyc|photography|halftone)/.test(
      lower
    )
  ) {
    return {
      brandName,
      domainType: 'portfolio',
      brandSummary: `${brandName} — interactive personal portfolio & creative engineering showcase (${titleLine}).`,
    };
  }
  if (/(ai|workflow|saas|platform|analytics|automation|novaflow|cloud|api|agent)/.test(lower)) {
    return {
      brandName,
      domainType: 'saas',
      brandSummary: `${brandName} — autonomous software & workflow platform (${titleLine}).`,
    };
  }
  return {
    brandName,
    domainType: 'generic',
    brandSummary: `${brandName} — ${titleLine}`,
  };
}

function buildDomainFallbackRecommendations(
  workspaceName: string,
  domainSummary: string
): { brandSummary: string; recommendations: DesignRecommendationItem[] } {
  const { brandName, domainType, brandSummary } = extractBrandSnippet(domainSummary, workspaceName);

  if (domainType === 'commerce') {
    return {
      brandSummary,
      recommendations: [
        {
          id: 'rec-spatial-gallery',
          badge: '3D SPATIAL',
          title: `Sculpt 3D Tactile Showcase for ${brandName}`,
          rationale: `Frames ${brandName}'s flagship objects inside perspective(1200px) gallery planes with crisp specular top-edge hairlines and asymmetric Swiss hierarchy.`,
          prompt: `Redesign ${brandName} with an asymmetric Swiss storefront grid, perspective(1200px) product showcase cards, inset 0 1px 0 rgba(255,255,255,0.65) specular hairlines, warm stone/linen surfaces, and >= 4.5:1 WCAG AA contrast.`,
          enableBespokeArt: false,
          mode: 'antislop',
        },
        {
          id: 'rec-nano-product-art',
          badge: 'BESPOKE ART',
          title: `Generate Editorial Hero Still-Life for ${brandName}`,
          rationale: `Replaces generic placeholders with domain-grounded studio photography of ${brandName}'s signature coffee gear and ceramic tableware.`,
          prompt: `Elevate ${brandName} around a bespoke sunlit studio still-life photograph of handcrafted ceramic pour-over coffee gear and stoneware tableware with an editorial split hero and archival product specs.`,
          enableBespokeArt: true,
          mode: 'antislop',
        },
        {
          id: 'rec-type-monograph',
          badge: 'TYPOGRAPHY',
          title: `Pair Editorial Serif + Tabular Price Specs`,
          rationale: `Replaces flat system sans with Cormorant Garamond display headings and IBM Plex Mono tabular pricing indices (01 / 02 / 03).`,
          prompt: `Upgrade ${brandName}'s typography to Instrument Serif display headlines paired with DM Sans body copy and IBM Plex Mono tabular-nums pricing/material labels, anchored by 1px hairline rules.`,
          enableBespokeArt: false,
          mode: 'antislop',
        },
        {
          id: 'rec-surgical-cta',
          badge: 'MICRO-CRAFT',
          title: `Refine Product Cards & Cart Micro-Motion`,
          rationale: `Applies compositor-only cubic-bezier(0.22, 1, 0.36, 1) hover elevation and crisp high-contrast add-to-bag controls.`,
          prompt: `Surgically refine the product grid and add-to-bag buttons in ${brandName} with compositor-only transform transitions, 1px hairline borders, and high-contrast ink inversion on hover.`,
          enableBespokeArt: false,
          mode: 'circle_tweak',
        },
      ],
    };
  }

  if (domainType === 'portfolio') {
    return {
      brandSummary,
      recommendations: [
        {
          id: 'rec-spatial-archive',
          badge: '3D SPATIAL',
          title: `Add 3D Depth to ${brandName} Case Cards`,
          rationale: `Gives project tiles perspective(1200px) architectural depth and specular top-edge hairlines while keeping any canvas/shader loops intact.`,
          prompt: `Transform ${brandName} with an asymmetric Swiss index layout, perspective(1200px) project cards with specular top-edge hairlines, crisp 1px structural rules, and full preservation of interactive canvas elements.`,
          enableBespokeArt: false,
          mode: 'antislop',
        },
        {
          id: 'rec-nano-studio-art',
          badge: 'BESPOKE ART',
          title: `Craft Domain-Grounded NYC Studio Visual`,
          rationale: `Generates bespoke kinetic architectural/studio imagery tailored specifically to ${brandName}'s engineering & design craft.`,
          prompt: `Redesign ${brandName} featuring bespoke architectural studio photography grounded in creative engineering and kinetic geometry, framed in a bold asymmetric hero without obstructing interactive controls.`,
          enableBespokeArt: true,
          mode: 'antislop',
        },
        {
          id: 'rec-type-swiss',
          badge: 'TYPOGRAPHY',
          title: `Swiss Display Scale & Mono Telemetry`,
          rationale: `Introduces monumental fluid clamp() display type paired with crisp monospace index markers and >= 4.5:1 contrast.`,
          prompt: `Set ${brandName} in Syne or Instrument Serif display headings with Space Grotesk/DM Sans body and JetBrains Mono index labels (01 / 02 / 03), strict WCAG AA contrast, and 0px horizontal overflow.`,
          enableBespokeArt: false,
          mode: 'antislop',
        },
        {
          id: 'rec-surgical-nav',
          badge: 'MICRO-CRAFT',
          title: `Polish Interactive Controls & Reduced Motion`,
          rationale: `Adds GPU-composited cubic-bezier(0.22, 1, 0.36, 1) transitions gated by prefers-reduced-motion without touching native JS/canvas state.`,
          prompt: `Surgically polish navigation links, interactive hover states, and typography contrast across ${brandName} using compositor-only transform/opacity motion and crisp 1px focus rings.`,
          enableBespokeArt: false,
          mode: 'circle_tweak',
        },
      ],
    };
  }

  if (domainType === 'saas') {
    return {
      brandSummary,
      recommendations: [
        {
          id: 'rec-purge-slop',
          badge: 'ANTI-SLOP 3D',
          title: `Purge Purple Slop into 3D Swiss Bento`,
          rationale: `Eliminates generic purple-to-cyan gradients and icon-circle cards in favor of perspective(1200px) architectural modules with specular hairlines.`,
          prompt: `Purge all purple/indigo gradients, neon glows, and buzzword copy from ${brandName}. Rebuild as an authoritative Swiss/Dieter Rams 12-column architectural grid with perspective(1200px) 3D depth cards, inset 0 1px 0 rgba(255,255,255,0.14) hairlines, and surgical contrast.`,
          enableBespokeArt: false,
          mode: 'antislop',
        },
        {
          id: 'rec-nano-hardware-art',
          badge: 'BESPOKE ART',
          title: `Generate Tactile Workflow Hero Photography`,
          rationale: `Creates domain-grounded editorial hardware & autonomous workspace photography tailored to ${brandName}'s product story.`,
          prompt: `Redesign ${brandName} with a bespoke museum-grade editorial hero photograph depicting precision autonomous workflow hardware and architectural desk instruments, paired with a calm high-contrast split hero.`,
          enableBespokeArt: true,
          mode: 'antislop',
        },
        {
          id: 'rec-type-telemetry',
          badge: 'TYPOGRAPHY',
          title: `Monumental Editorial Type & Tabular Metrics`,
          rationale: `Pairs expressive display typography with tabular-nums workflow telemetry and authentic, jargon-free product copy.`,
          prompt: `Refit ${brandName} with Instrument Serif or Space Grotesk display headlines, Plus Jakarta Sans body copy, and IBM Plex Mono tabular-nums telemetry metrics, enforcing >= 4.5:1 WCAG AA contrast everywhere.`,
          enableBespokeArt: false,
          mode: 'antislop',
        },
        {
          id: 'rec-surgical-pricing',
          badge: 'MICRO-CRAFT',
          title: `Calibrate Pricing & Interactive Toggle Craft`,
          rationale: `Sharpens billing toggles, tier hierarchy, and compositor-only hover states while preserving all React state and form logic.`,
          prompt: `Surgically refine the hero CTA, metrics strip, and pricing comparison tiers on ${brandName} with crisp 1px borders, tabular numbers, and poised cubic-bezier(0.22, 1, 0.36, 1) hover transitions.`,
          enableBespokeArt: false,
          mode: 'circle_tweak',
        },
      ],
    };
  }

  return {
    brandSummary,
    recommendations: [
      {
        id: 'rec-3d-swiss',
        badge: '3D SPATIAL',
        title: `Introduce CSS 3D Depth & Swiss Hierarchy`,
        rationale: `Replaces flat repetitive blocks with perspective(1200px) architectural cards, specular top-edge hairlines, and an asymmetric focal grid.`,
        prompt: `Redesign ${brandName} around an asymmetric Swiss 12-column grid with perspective(1200px) 3D spatial cards, crisp inset specular top-edge hairlines, and 1px structural dividers.`,
        enableBespokeArt: false,
        mode: 'antislop',
      },
      {
        id: 'rec-bespoke-art',
        badge: 'BESPOKE ART',
        title: `Generate Domain-Grounded Editorial Hero Art`,
        rationale: `Creates custom Nano Banana 2.1 hero imagery depicting ${brandName}'s actual subject matter calibrated to the site palette.`,
        prompt: `Transform ${brandName} with a bespoke domain-grounded hero photograph generated for ${brandName}'s exact subject matter, framed inside an editorial split hero with fetchpriority="high".`,
        enableBespokeArt: true,
        mode: 'antislop',
      },
      {
        id: 'rec-typography-contrast',
        badge: 'TYPOGRAPHY',
        title: `Upgrade Font Pairing & WCAG AA Contrast`,
        rationale: `Establishes a 3-voice Display/Body/Mono Google Font system with fluid clamp() scales and verified >= 4.5:1 contrast.`,
        prompt: `Elevate ${brandName} typography with an expressive Display + legible Body + IBM Plex Mono voice pairing, fluid clamp() type scales, tabular-nums metrics, and strict >= 4.5:1 WCAG AA contrast.`,
        enableBespokeArt: false,
        mode: 'antislop',
      },
      {
        id: 'rec-motion-polish',
        badge: 'MICRO-CRAFT',
        title: `Refine Interactive Motion & Landmarks`,
        rationale: `Adds GPU-composited cubic-bezier(0.22, 1, 0.36, 1) transitions gated by prefers-reduced-motion with zero horizontal overflow.`,
        prompt: `Surgically refine ${brandName}'s header, interactive controls, and footer colophon with compositor-only transform/opacity transitions, semantic landmarks, and 0px horizontal overflow.`,
        enableBespokeArt: false,
        mode: 'circle_tweak',
      },
    ],
  };
}

function normalizeRecommendations(
  raw: unknown,
  fallback: DesignRecommendationItem[]
): DesignRecommendationItem[] {
  if (!Array.isArray(raw)) return fallback;
  const items: DesignRecommendationItem[] = [];
  for (let i = 0; i < raw.length && items.length < 4; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim() : '';
    const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
    if (!title || !prompt) continue;
    const badge =
      typeof obj.badge === 'string' && obj.badge.trim()
        ? obj.badge.trim().toUpperCase().slice(0, 18)
        : fallback[items.length]?.badge || 'CRAFT';
    const mode: 'antislop' | 'circle_tweak' =
      obj.mode === 'circle_tweak' ? 'circle_tweak' : 'antislop';
    items.push({
      id:
        typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim().slice(0, 40)
          : `rec-${items.length + 1}`,
      badge,
      title: title.slice(0, 80),
      rationale: (rationale || fallback[items.length]?.rationale || title).slice(0, 240),
      prompt: prompt.slice(0, 500),
      enableBespokeArt: Boolean(obj.enableBespokeArt),
      mode,
    });
  }
  while (items.length < 4 && items.length < fallback.length) {
    items.push(fallback[items.length]);
  }
  return items.slice(0, 4);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms (${label})`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function generateWorkspaceRecommendations(options?: {
  focus?: string;
}): Promise<RecommendationsResponse> {
  const activeWs = viteManager.getActiveWorkspace();
  if (!activeWs) {
    throw new Error('No active target workspace is running.');
  }

  const editableFiles = await snapshotManager.readEditableFiles(activeWs.localPath);
  const domainSummary = summarizeSourceFiles(editableFiles);
  const fallback = buildDomainFallbackRecommendations(activeWs.name, domainSummary);

  return traceSpan(
    'antislop.recommender.generate',
    'llm',
    {
      workspaceId: activeWs.id,
      model: ENV.GEMINI_MODEL_FAST_CRITIC,
      focus: options?.focus?.slice(0, 120),
    },
    async () => {
      if (!ENV.GEMINI_API_KEY && !ENV.GEMINI_API_KEY_SECONDARY) {
        return {
          workspaceId: activeWs.id,
          brandSummary: fallback.brandSummary,
          recommendations: fallback.recommendations,
        };
      }

      const userPrompt = [
        `Active Workspace: ${activeWs.name} (id: ${activeWs.id}, framework: ${activeWs.framework})`,
        options?.focus?.trim() ? `User Focus Area: "${options.focus.trim()}"` : null,
        domainSummary,
        `Return 4 tailored, high-impact recommendations grounded in this specific site's domain.`,
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        const interaction = await withTimeout(
          withV1Client((client) =>
            client.interactions.create({
              model: ENV.GEMINI_MODEL_FAST_CRITIC,
              system_instruction: RECOMMENDER_SYSTEM_INSTRUCTION,
              input: userPrompt,
              generation_config: {
                thinking_level: 'low',
              },
              store: false,
            })
          ),
          RECOMMENDER_TIMEOUT_MS,
          'recommender-argon'
        );

        const rawText = extractInteractionText(interaction);
        const parsed = extractJsonObject<{
          brandSummary?: unknown;
          recommendations?: unknown;
        }>(rawText);

        if (!parsed) {
          return {
            workspaceId: activeWs.id,
            brandSummary: fallback.brandSummary,
            recommendations: fallback.recommendations,
          };
        }

        const brandSummary =
          typeof parsed.brandSummary === 'string' && parsed.brandSummary.trim().length > 0
            ? parsed.brandSummary.trim().slice(0, 240)
            : fallback.brandSummary;

        return {
          workspaceId: activeWs.id,
          brandSummary,
          recommendations: normalizeRecommendations(parsed.recommendations, fallback.recommendations),
        };
      } catch (err) {
        console.warn(
          '[Recommender] Using domain-aware fallback recommendations:',
          err instanceof Error ? err.message : String(err)
        );
        return {
          workspaceId: activeWs.id,
          brandSummary: fallback.brandSummary,
          recommendations: fallback.recommendations,
        };
      }
    }
  );
}
