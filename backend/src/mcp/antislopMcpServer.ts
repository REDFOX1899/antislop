/**
 * Public Remote MCP Server (Streamable HTTP JSON-RPC 2.0) for AntiSlop UI/UX.
 *
 * Implements Model Context Protocol `2025-03-26` over standard Express `Router`
 * with zero external MCP SDK dependencies so any external AI coding agent
 * (Antigravity, Claude Code, Cursor, Windsurf, Gemini CLI) can connect directly
 * to `https://antislop-engine-a53petnlfa-uc.a.run.app/mcp`.
 */

import { Router, type Request, type Response } from 'express';
import { getVerifiedArchetypes } from '../design/paletteArchetypes.js';
import {
  compileSanzoWadaToDesignSystem,
  listSanzoWadaCombinations,
} from '../design/sanzoWada.js';
import {
  compileDesignTokens,
  type CompiledDesignSystem,
} from '../design/tokenCompiler.js';
import { injectInstantLookIntoWorkspace } from '../design/tokenInjector.js';
import {
  VERIFIED_TYPOGRAPHY_PAIRINGS,
  buildTypographyCssBlock,
  resolveVerifiedTypography,
  type TypographyCategory,
} from '../design/typographyKernel.js';
import { runConversionAndBrandAudit } from '../gemini/decisionsEngineV2.js';
import { listInstalledSkills, loadSkillById } from '../gemini/skillRegistry.js';
import { puppeteerAuditor } from '../sandbox/puppeteerAuditor.js';
import { viteManager } from '../sandbox/viteManager.js';

export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const PUBLIC_MCP_URL = 'https://antislop-engine-a53petnlfa-uc.a.run.app/mcp';

export const MCP_SERVER_INFO = {
  name: 'antislop-ui-ux',
  version: '4.0.0',
} as const;

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: readonly (string | number)[];
  minimum?: number;
  maximum?: number;
  default?: string | number | boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: readonly string[];
    additionalProperties?: boolean;
  };
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcErrorObject;
}

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_INTERNAL_ERROR = -32603;

const TYPOGRAPHY_CATEGORIES: readonly TypographyCategory[] = [
  'editorial_serif',
  'swiss_grotesk',
  'luxury_fashion',
  'technical_mono',
  'expressive_brutalist',
];

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'search_sanzo_wada_palettes',
    description:
      'Search Sanzo Wada’s historic Dictionary of Color Combinations (348 curated 2-, 3-, and 4-color palettes) by keyword, palette size, or mood.',
    inputSchema: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Search query matching English/Japanese color names, mood, or hex codes.',
        },
        size: {
          type: 'integer',
          enum: [2, 3, 4],
          description: 'Filter by number of colors in the combination (2, 3, or 4).',
        },
        mood: {
          type: 'string',
          description: 'Optional mood/tone filter (e.g. warm, cool, muted, vibrant, editorial).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum number of combinations to return (1–100).',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          default: 0,
          description: 'Zero-based pagination offset.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'compile_oklch_design_system',
    description:
      'Compile an APCA-W3 verified OKLCH + Display P3 design system (CSS variables, Tailwind v4 @theme, W3C DTCG JSON, 12-step neutral/accent scales, and fluid typography) from a Sanzo Wada combination ID or custom seed hex colors.',
    inputSchema: {
      type: 'object',
      properties: {
        sanzoWadaId: {
          type: 'integer',
          minimum: 1,
          maximum: 348,
          description: 'Sanzo Wada combination ID (1–348). Takes precedence over seed hex colors.',
        },
        seedAccentHex: {
          type: 'string',
          description: 'Seed brand/accent hex color (e.g. "#C9301A") when compiling without sanzoWadaId.',
        },
        seedNeutralHex: {
          type: 'string',
          description: 'Optional seed neutral/canvas hex color (e.g. "#F7F5F0").',
        },
        mode: {
          type: 'string',
          enum: ['light', 'dark'],
          description: 'Theme polarity override ("light" or "dark").',
        },
        pairingId: {
          type: 'string',
          description: 'Verified typography pairing ID from list_verified_typography.',
        },
        name: {
          type: 'string',
          description: 'Optional custom name for the compiled design system.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_verified_typography',
    description:
      'List AntiSlop’s curated, HTTP-200 verified Google Fonts & Fontshare typography pairings with optical sizing, measure, tracking, and modular scale ratios.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: TYPOGRAPHY_CATEGORIES,
          description: 'Filter pairings by typographic category.',
        },
        query: {
          type: 'string',
          description: 'Optional search string matching pairing ID, name, font family, or tagline.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_design_skills',
    description:
      'List installed AntiSlop UI/UX design craft skills (SKILL.md) or fetch the full markdown specification of a specific skill by skillId.',
    inputSchema: {
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          description:
            'Optional skill ID (e.g. "antislop-design-craft", "google-m3e-baseline-craft"). When provided, returns the full SKILL.md content.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'audit_live_geometry',
    description:
      'Run a real headless Chromium computed-geometry audit (APCA-W3 contrast, document.fonts verification, body measure in ch, touch target sizing, overflow, and A11y invariants) on the active sandbox preview or a specified URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Optional http(s) URL to audit. Defaults to the active AntiSlop sandbox preview.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'run_conversion_brand_audit',
    description:
      'Run the 10-probe gemini-decision-1 Conversion × Taste & Brand Drift audit (0 output tokens) on the active live preview, returning Conversion Readiness (0–100), Brand Drift L2 norm, and 2D quadrant.',
    inputSchema: {
      type: 'object',
      properties: {
        brandSummary: {
          type: 'string',
          description: 'Optional brand & product context to calibrate conversion and brand-fidelity probes.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'apply_instant_look',
    description:
      'Compile verified OKLCH tokens + typography from a Sanzo Wada palette ID or seed hex color and inject them live into the active workspace in <50ms with zero LLM calls.',
    inputSchema: {
      type: 'object',
      properties: {
        sanzoWadaId: {
          type: 'integer',
          minimum: 1,
          maximum: 348,
          description: 'Sanzo Wada combination ID (1–348) to compile and inject.',
        },
        seedAccentHex: {
          type: 'string',
          description: 'Seed accent hex color (used when sanzoWadaId is omitted).',
        },
        seedNeutralHex: {
          type: 'string',
          description: 'Optional seed neutral/canvas hex color.',
        },
        mode: {
          type: 'string',
          enum: ['light', 'dark'],
          description: 'Theme polarity ("light" or "dark").',
        },
        pairingId: {
          type: 'string',
          description: 'Verified typography pairing ID from list_verified_typography.',
        },
      },
      additionalProperties: false,
    },
  },
];

export const MCP_RESOURCES: readonly McpResourceDefinition[] = [
  {
    uri: 'antislop://skills/antislop-design-craft',
    name: 'AntiSlop Design Craft Skill',
    description: 'Core AntiSlop UI/UX architectural craft rules, anti-slop invariants, and typography/color directives.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'antislop://skills/google-m3e-baseline-craft',
    name: 'Google M3E Baseline Craft Skill',
    description: 'Material 3 Expressive baseline craft guidelines for contrast, motion, elevation, and spatial rhythm.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'antislop://palettes/sanzo-wada-summary',
    name: 'Sanzo Wada & Verified Archetypes Summary',
    description: 'Structured catalog summary of Sanzo Wada color combinations and AntiSlop APCA-verified design archetypes.',
    mimeType: 'application/json',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const val = args[key];
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalInteger(args: Record<string, unknown>, key: string): number | undefined {
  const val = args[key];
  if (typeof val === 'number' && Number.isInteger(val)) {
    return val;
  }
  return undefined;
}

function readOptionalMode(args: Record<string, unknown>, key: string): 'light' | 'dark' | undefined {
  const val = args[key];
  if (val === 'light' || val === 'dark') {
    return val;
  }
  return undefined;
}

function isTypographyCategory(value: string): value is TypographyCategory {
  return (TYPOGRAPHY_CATEGORIES as readonly string[]).includes(value);
}

function isCompiledDesignSystem(value: unknown): value is CompiledDesignSystem {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    (value.mode === 'light' || value.mode === 'dark') &&
    isRecord(value.palette) &&
    isRecord(value.audit) &&
    typeof value.cssVariables === 'string' &&
    isRecord(value.typography)
  );
}

function extractCompiledDesignSystem(raw: unknown): CompiledDesignSystem {
  if (isCompiledDesignSystem(raw)) {
    return raw;
  }
  if (isRecord(raw) && isCompiledDesignSystem(raw.compiled)) {
    return raw.compiled;
  }
  if (isRecord(raw) && isCompiledDesignSystem(raw.designSystem)) {
    return raw.designSystem;
  }
  throw new Error('Unable to extract CompiledDesignSystem from Sanzo Wada compiler output');
}

function validateHttpUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http:// and https:// URLs are supported (received ${parsed.protocol})`);
  }
  return parsed.toString();
}

function makeErrorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  const error: JsonRpcErrorObject = data !== undefined ? { code, message, data } : { code, message };
  return {
    jsonrpc: '2.0',
    id,
    error,
  };
}

function makeSuccessResponse(id: JsonRpcId, result: unknown): JsonRpcSuccessResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'search_sanzo_wada_palettes': {
      const q = readOptionalString(args, 'q');
      const rawSize = readOptionalInteger(args, 'size');
      const size: 2 | 3 | 4 | undefined =
        rawSize === 2 || rawSize === 3 || rawSize === 4 ? rawSize : undefined;
      if (rawSize !== undefined && size === undefined) {
        throw new Error('Parameter "size" must be 2, 3, or 4');
      }
      const mood = readOptionalString(args, 'mood');
      const rawLimit = readOptionalInteger(args, 'limit');
      const limit = rawLimit !== undefined ? Math.max(1, Math.min(100, rawLimit)) : 20;
      const rawOffset = readOptionalInteger(args, 'offset');
      const offset = rawOffset !== undefined ? Math.max(0, rawOffset) : 0;

      return listSanzoWadaCombinations({ q, size, mood, limit, offset });
    }

    case 'compile_oklch_design_system': {
      const sanzoWadaId = readOptionalInteger(args, 'sanzoWadaId');
      const mode = readOptionalMode(args, 'mode');
      const pairingId = readOptionalString(args, 'pairingId');

      if (sanzoWadaId !== undefined) {
        const result = compileSanzoWadaToDesignSystem(sanzoWadaId, mode, pairingId);
        const compiled = extractCompiledDesignSystem(result);
        const pairing = resolveVerifiedTypography({
          pairingId,
          displayFont: compiled.typography.displayFont,
          bodyFont: compiled.typography.bodyFont,
          monoFont: compiled.typography.monoFont,
        });
        return {
          source: 'sanzo-wada',
          sanzoWadaId,
          result,
          typographyPairing: pairing,
          typographyCss: buildTypographyCssBlock(pairing),
        };
      }

      const seedAccentHex = readOptionalString(args, 'seedAccentHex');
      const seedNeutralHex = readOptionalString(args, 'seedNeutralHex');
      const resolvedMode: 'light' | 'dark' = mode ?? 'light';
      const customName =
        readOptionalString(args, 'name') ??
        (seedAccentHex ? `Custom OKLCH (${seedAccentHex})` : `AntiSlop ${resolvedMode} System`);

      const pairing = resolveVerifiedTypography({ pairingId });
      const compiled = compileDesignTokens({
        name: customName,
        mode: resolvedMode,
        seedAccentHex,
        seedNeutralHex,
        typography: {
          displayFont: pairing.displayFont,
          bodyFont: pairing.bodyFont,
          monoFont: pairing.monoFont,
          googleFontsUrl: pairing.primaryGoogleFontsUrl,
        },
      });

      return {
        source: 'seed-hex',
        compiled,
        typographyPairing: pairing,
        typographyCss: buildTypographyCssBlock(pairing),
      };
    }

    case 'list_verified_typography': {
      const rawCategory = readOptionalString(args, 'category');
      if (rawCategory !== undefined && !isTypographyCategory(rawCategory)) {
        throw new Error(
          `Invalid category "${rawCategory}". Valid categories: ${TYPOGRAPHY_CATEGORIES.join(', ')}`,
        );
      }
      const query = readOptionalString(args, 'query')?.toLowerCase();

      const filtered = VERIFIED_TYPOGRAPHY_PAIRINGS.filter((pairing) => {
        if (rawCategory && pairing.category !== rawCategory) {
          return false;
        }
        if (query) {
          const haystack = [
            pairing.id,
            pairing.name,
            pairing.category,
            pairing.tagline,
            pairing.displayFont,
            pairing.bodyFont,
            pairing.monoFont,
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        }
        return true;
      });

      return {
        total: filtered.length,
        categories: TYPOGRAPHY_CATEGORIES,
        pairings: filtered,
      };
    }

    case 'list_design_skills': {
      const skillId = readOptionalString(args, 'skillId');
      if (skillId) {
        const bundle = await loadSkillById(skillId);
        if (!bundle) {
          throw new Error(`Design skill not found: "${skillId}"`);
        }
        return bundle;
      }
      const skills = await listInstalledSkills();
      return {
        total: skills.length,
        skills,
      };
    }

    case 'audit_live_geometry': {
      const requestedUrl = readOptionalString(args, 'url');
      const targetUrl = requestedUrl
        ? validateHttpUrl(requestedUrl)
        : viteManager.getProxiedPreviewUrl();
      const report = await puppeteerAuditor.auditLiveGeometry(targetUrl);
      return {
        url: targetUrl,
        report,
      };
    }

    case 'run_conversion_brand_audit': {
      const brandSummary = readOptionalString(args, 'brandSummary');
      const previewUrl = viteManager.getProxiedPreviewUrl();
      const capture = await puppeteerAuditor.captureAndAudit(
        previewUrl,
        `mcp-conversion-${Date.now()}`,
        { includeMobile: false },
      );

      const audit = await runConversionAndBrandAudit({
        screenshotBase64: capture.desktopBase64,
        brandSummary,
      });

      return {
        previewUrl,
        screenshotUrl: capture.desktopUrl,
        domAudit: capture.domAudit,
        audit,
      };
    }

    case 'apply_instant_look': {
      const sanzoWadaId = readOptionalInteger(args, 'sanzoWadaId');
      const seedAccentHex = readOptionalString(args, 'seedAccentHex');
      const seedNeutralHex = readOptionalString(args, 'seedNeutralHex');
      const mode = readOptionalMode(args, 'mode');
      const pairingId = readOptionalString(args, 'pairingId');

      if (sanzoWadaId === undefined && !seedAccentHex && !seedNeutralHex) {
        throw new Error(
          'Provide either "sanzoWadaId" (1–348) or "seedAccentHex" (e.g. "#C9301A") to apply an instant look.',
        );
      }

      let compiled: CompiledDesignSystem;
      if (sanzoWadaId !== undefined) {
        const rawCompiled = compileSanzoWadaToDesignSystem(sanzoWadaId, mode, pairingId);
        compiled = extractCompiledDesignSystem(rawCompiled);
      } else {
        const resolvedMode: 'light' | 'dark' = mode ?? 'light';
        const resolvedPairing = resolveVerifiedTypography({ pairingId });
        compiled = compileDesignTokens({
          name: seedAccentHex ? `Instant Look (${seedAccentHex})` : `Instant Look (${resolvedMode})`,
          mode: resolvedMode,
          seedAccentHex,
          seedNeutralHex,
          typography: {
            displayFont: resolvedPairing.displayFont,
            bodyFont: resolvedPairing.bodyFont,
            monoFont: resolvedPairing.monoFont,
            googleFontsUrl: resolvedPairing.primaryGoogleFontsUrl,
          },
        });
      }

      const pairing = resolveVerifiedTypography({
        pairingId,
        displayFont: compiled.typography.displayFont,
        bodyFont: compiled.typography.bodyFont,
        monoFont: compiled.typography.monoFont,
      });
      const typographyCss = buildTypographyCssBlock(pairing);
      const workspacePath = viteManager.getActiveWorkspacePath();

      const injection = await injectInstantLookIntoWorkspace({
        workspacePath,
        compiled,
        stylesheetUrls: pairing.stylesheetUrls,
        typographyCss,
        displayFont: pairing.displayFont,
        bodyFont: pairing.bodyFont,
        monoFont: pairing.monoFont,
      });

      return {
        applied: true,
        workspace: viteManager.getActiveWorkspace()?.id ?? 'active',
        designSystem: {
          name: compiled.name,
          mode: compiled.mode,
          palette: compiled.palette,
          audit: compiled.audit,
        },
        typography: {
          id: pairing.id,
          name: pairing.name,
          displayFont: pairing.displayFont,
          bodyFont: pairing.bodyFont,
          monoFont: pairing.monoFont,
        },
        injection,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function readResourceByUri(
  uri: string,
): Promise<{ uri: string; mimeType: string; text: string } | null> {
  if (uri.startsWith('antislop://skills/')) {
    const skillId = uri.slice('antislop://skills/'.length).trim();
    if (!skillId) return null;
    const bundle = await loadSkillById(skillId);
    if (!bundle) return null;
    return {
      uri,
      mimeType: 'text/markdown',
      text: bundle.content,
    };
  }

  if (uri === 'antislop://palettes/sanzo-wada-summary') {
    const sanzoCatalog = listSanzoWadaCombinations({ limit: 348, offset: 0 });
    const archetypes = getVerifiedArchetypes().map((arch) => ({
      id: arch.id,
      name: arch.name,
      tagline: arch.tagline,
      mode: arch.mode,
      seedAccentHex: arch.seedAccentHex,
      seedNeutralHex: arch.seedNeutralHex,
      palette: arch.palette,
      apcaPassedAll: arch.audit.passedAll,
    }));

    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(
        {
          source: 'AntiSlop Color Kernel + Sanzo Wada Dictionary of Color Combinations',
          verifiedArchetypesCount: archetypes.length,
          verifiedArchetypes: archetypes,
          sanzoWadaCatalog: sanzoCatalog,
        },
        null,
        2,
      ),
    };
  }

  return null;
}

const TOOL_NAMES = new Set<string>(MCP_TOOLS.map((tool) => tool.name));

async function handleJsonRpcMessage(payload: unknown): Promise<JsonRpcResponse | null> {
  if (!isRecord(payload)) {
    return makeErrorResponse(null, JSON_RPC_INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request object');
  }

  const hasId = Object.prototype.hasOwnProperty.call(payload, 'id');
  const rawId = payload.id;
  const id: JsonRpcId =
    typeof rawId === 'string' || typeof rawId === 'number' || rawId === null ? rawId : null;

  if (payload.jsonrpc !== '2.0' || typeof payload.method !== 'string' || payload.method.length === 0) {
    return makeErrorResponse(id, JSON_RPC_INVALID_REQUEST, 'Request must specify jsonrpc: "2.0" and a string method');
  }

  const method = payload.method;
  const params = isRecord(payload.params) ? payload.params : {};

  // Notifications without an id do not produce a response per JSON-RPC 2.0
  if (!hasId && method.startsWith('notifications/')) {
    return null;
  }

  try {
    switch (method) {
      case 'initialize': {
        return makeSuccessResponse(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: MCP_SERVER_INFO,
        });
      }

      case 'notifications/initialized':
      case 'ping': {
        if (!hasId) return null;
        return makeSuccessResponse(id, {});
      }

      case 'tools/list': {
        return makeSuccessResponse(id, {
          tools: MCP_TOOLS,
        });
      }

      case 'tools/call': {
        const toolName = typeof params.name === 'string' ? params.name.trim() : '';
        if (!toolName) {
          return makeErrorResponse(id, JSON_RPC_INVALID_PARAMS, 'Missing required string parameter: params.name');
        }
        if (!TOOL_NAMES.has(toolName)) {
          return makeErrorResponse(id, JSON_RPC_INVALID_PARAMS, `Unknown tool: ${toolName}`);
        }

        const rawArguments = params.arguments;
        if (rawArguments !== undefined && !isRecord(rawArguments)) {
          return makeErrorResponse(id, JSON_RPC_INVALID_PARAMS, 'Parameter params.arguments must be a JSON object');
        }
        const toolArgs = rawArguments ?? {};

        try {
          const output = await executeTool(toolName, toolArgs);
          const result: McpToolCallResult = {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            isError: false,
          };
          return makeSuccessResponse(id, result);
        } catch (toolErr) {
          const message = toolErr instanceof Error ? toolErr.message : String(toolErr);
          const errorResult: McpToolCallResult = {
            content: [{ type: 'text', text: JSON.stringify({ error: message, tool: toolName }, null, 2) }],
            isError: true,
          };
          return makeSuccessResponse(id, errorResult);
        }
      }

      case 'resources/list': {
        return makeSuccessResponse(id, {
          resources: MCP_RESOURCES,
        });
      }

      case 'resources/read': {
        const uri = typeof params.uri === 'string' ? params.uri.trim() : '';
        if (!uri) {
          return makeErrorResponse(id, JSON_RPC_INVALID_PARAMS, 'Missing required string parameter: params.uri');
        }

        const resource = await readResourceByUri(uri);
        if (!resource) {
          return makeErrorResponse(id, JSON_RPC_INVALID_PARAMS, `Resource not found: ${uri}`);
        }

        return makeSuccessResponse(id, {
          contents: [resource],
        });
      }

      default: {
        if (!hasId) return null;
        return makeErrorResponse(id, JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeErrorResponse(id, JSON_RPC_INTERNAL_ERROR, message);
  }
}

export function createMcpRouter(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
    res.status(200).json({
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      protocolVersion: MCP_PROTOCOL_VERSION,
      transport: 'streamable-http',
      endpoint: '/mcp',
      publicUrl: PUBLIC_MCP_URL,
      description:
        'AntiSlop UI/UX Remote MCP Server — Sanzo Wada palettes, APCA-W3 OKLCH design token compiler, verified typography kernel, Chromium geometry auditor, and Gemini Decisions conversion/brand evaluator.',
      capabilities: {
        tools: {},
        resources: {},
      },
      tools: MCP_TOOLS,
      resources: MCP_RESOURCES,
      clientConfig: {
        mcpServers: {
          'antislop-ui-ux': {
            url: PUBLIC_MCP_URL,
            transport: 'streamable-http',
          },
        },
      },
    });
  });

  router.post('/', async (req: Request, res: Response) => {
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
    const body: unknown = req.body;

    if (Array.isArray(body)) {
      if (body.length === 0) {
        res
          .status(400)
          .json(makeErrorResponse(null, JSON_RPC_INVALID_REQUEST, 'Empty JSON-RPC batch is not allowed'));
        return;
      }

      const responses = await Promise.all(body.map((item) => handleJsonRpcMessage(item)));
      const nonNullResponses = responses.filter((item): item is JsonRpcResponse => item !== null);

      if (nonNullResponses.length === 0) {
        res.status(202).end();
        return;
      }

      res.status(200).json(nonNullResponses);
      return;
    }

    if (!isRecord(body)) {
      res
        .status(400)
        .json(makeErrorResponse(null, JSON_RPC_INVALID_REQUEST, 'Expected a JSON-RPC 2.0 request object or batch array'));
      return;
    }

    const response = await handleJsonRpcMessage(body);
    if (response === null) {
      res.status(202).end();
      return;
    }

    res.status(200).json(response);
  });

  router.delete('/', (_req: Request, res: Response) => {
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
    res.status(204).end();
  });

  return router;
}
