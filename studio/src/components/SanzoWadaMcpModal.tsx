'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Moon,
  Palette,
  Plug,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react';
import { BACKEND_URL } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

export interface SanzoWadaMcpModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'sanzo' | 'mcp';
  onInstantLookApplied?: () => void;
  onApplyDesignSystem: (prompt: string) => void;
}

type ModalTab = 'sanzo' | 'mcp';
type SwatchCountFilter = 'all' | 2 | 3 | 4;
type MoodFilter =
  | 'all'
  | 'warm'
  | 'cool'
  | 'earthy'
  | 'vibrant'
  | 'muted'
  | 'pastel'
  | 'dark';
type Polarity = 'light' | 'dark';
type SnippetTab = 'ide' | 'claude' | 'curl';

interface SanzoSwatch {
  name: string;
  hex: string;
  rgb?: [number, number, number];
  cmyk?: [number, number, number, number];
}

interface SanzoCombination {
  id: number;
  name: string;
  swatches: SanzoSwatch[];
  moods: string[];
  swatchCount: number;
  recommendedPolarity?: Polarity;
}

interface McpToolDescriptor {
  name: string;
  description: string;
  category?: string;
}

interface McpStatusInfo {
  online: boolean;
  name: string;
  version: string;
  protocol: string;
  transport: string;
  endpoint: string;
  tools: McpToolDescriptor[];
  latencyMs?: number;
  error?: string;
}

const SWATCH_COUNT_OPTIONS: Array<{ value: SwatchCountFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 2, label: '2-Color' },
  { value: 3, label: '3-Color' },
  { value: 4, label: '4-Color' },
];

const MOOD_OPTIONS: Array<{ value: MoodFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'warm', label: 'warm' },
  { value: 'cool', label: 'cool' },
  { value: 'earthy', label: 'earthy' },
  { value: 'vibrant', label: 'vibrant' },
  { value: 'muted', label: 'muted' },
  { value: 'pastel', label: 'pastel' },
  { value: 'dark', label: 'dark' },
];

const FALLBACK_MCP_TOOLS: McpToolDescriptor[] = [
  {
    name: 'search_sanzo_wada',
    description:
      'Search Sanzo Wada’s 1933 Dictionary of Color Combinations (348 historic Japanese palettes) by mood, swatch count, or pigment name.',
  },
  {
    name: 'compile_design_tokens',
    description:
      'Compile a Sanzo Wada combination or seed hex into APCA-verified OKLCH light/dark CSS custom properties and Tailwind v4 tokens.',
  },
  {
    name: 'apply_instant_palette',
    description:
      'Inject compiled OKLCH design tokens directly into the active preview sandbox in 0ms without waiting for full LLM code generation.',
  },
  {
    name: 'audit_apca_contrast',
    description:
      'Verify perceptual APCA Lc contrast ratios across foreground/background pairs and auto-correct failing ink tokens.',
  },
  {
    name: 'pair_editorial_typography',
    description:
      'Recommend and emit high-craft display, body, and tabular mono font pairings tailored to brand polarity and domain.',
  },
  {
    name: 'get_brand_memory',
    description:
      'Inspect the active workspace Brand Memory profile including locked typography, banned slop tropes, and taste score history.',
  },
  {
    name: 'extract_image_palette',
    description:
      'Extract dominant OKLCH color roles and surface polarity from a reference screenshot or brand image.',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeHex(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '#888888';
  const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
  return withHash.toUpperCase();
}

function normalizeSwatch(raw: unknown, index: number): SanzoSwatch | null {
  if (typeof raw === 'string') {
    const hex = normalizeHex(raw);
    return { name: `Swatch ${index + 1}`, hex };
  }
  if (!isRecord(raw)) return null;
  const hexRaw = readString(raw.hex ?? raw.color ?? raw.value);
  if (!hexRaw) return null;
  const name =
    readString(raw.name ?? raw.label ?? raw.title).trim() ||
    `Swatch ${index + 1}`;
  const rgb =
    Array.isArray(raw.rgb) &&
    raw.rgb.length === 3 &&
    raw.rgb.every((v) => typeof v === 'number')
      ? ([raw.rgb[0], raw.rgb[1], raw.rgb[2]] as [number, number, number])
      : undefined;
  const cmyk =
    Array.isArray(raw.cmyk) &&
    raw.cmyk.length === 4 &&
    raw.cmyk.every((v) => typeof v === 'number')
      ? ([raw.cmyk[0], raw.cmyk[1], raw.cmyk[2], raw.cmyk[3]] as [
          number,
          number,
          number,
          number,
        ])
      : undefined;
  return {
    name,
    hex: normalizeHex(hexRaw),
    rgb,
    cmyk,
  };
}

function normalizeCombination(raw: unknown): SanzoCombination | null {
  if (!isRecord(raw)) return null;
  const id =
    readNumber(raw.id) ??
    readNumber(raw.combinationId) ??
    readNumber(raw.index);
  if (id === undefined) return null;

  const rawSwatches = Array.isArray(raw.colors)
    ? raw.colors
    : Array.isArray(raw.swatches)
      ? raw.swatches
      : Array.isArray(raw.palette)
        ? raw.palette
        : [];

  const swatches: SanzoSwatch[] = [];
  for (let i = 0; i < rawSwatches.length; i += 1) {
    const s = normalizeSwatch(rawSwatches[i], i);
    if (s) swatches.push(s);
  }
  if (swatches.length === 0) return null;

  const moodsRaw = raw.moods ?? raw.mood ?? raw.tags;
  const moods: string[] = [];
  if (Array.isArray(moodsRaw)) {
    for (const m of moodsRaw) {
      if (typeof m === 'string' && m.trim()) {
        moods.push(m.trim().toLowerCase());
      }
    }
  } else if (typeof moodsRaw === 'string' && moodsRaw.trim()) {
    moods.push(moodsRaw.trim().toLowerCase());
  }

  const name =
    readString(raw.name ?? raw.title).trim() ||
    swatches.map((s) => s.name).join(' · ');

  const polarityRaw = readString(
    raw.recommendedPolarity ?? raw.polarity
  ).toLowerCase();
  const recommendedPolarity: Polarity | undefined =
    polarityRaw === 'light' || polarityRaw === 'dark' ? polarityRaw : undefined;

  return {
    id,
    name,
    swatches,
    moods,
    swatchCount: readNumber(raw.swatchCount ?? raw.count) ?? swatches.length,
    recommendedPolarity,
  };
}

function parseSanzoResponse(payload: unknown): {
  combinations: SanzoCombination[];
  total: number;
} {
  let list: unknown[] = [];
  let total = 0;

  if (Array.isArray(payload)) {
    list = payload;
    total = payload.length;
  } else if (isRecord(payload)) {
    const candidate =
      payload.combinations ??
      payload.items ??
      payload.results ??
      payload.data ??
      payload.palettes;
    if (Array.isArray(candidate)) {
      list = candidate;
    }
    total =
      readNumber(payload.total) ??
      readNumber(payload.totalCount) ??
      readNumber(payload.matched) ??
      list.length;
  }

  const combinations: SanzoCombination[] = [];
  for (const item of list) {
    const parsed = normalizeCombination(item);
    if (parsed) combinations.push(parsed);
  }

  return {
    combinations,
    total: total > 0 ? total : combinations.length,
  };
}

function parseMcpStatus(
  payload: unknown,
  endpoint: string,
  latencyMs: number
): McpStatusInfo {
  const base: McpStatusInfo = {
    online: true,
    name: 'AntiSlop Remote MCP Server',
    version: '2.0.0',
    protocol: 'Streamable HTTP (JSON-RPC 2.0)',
    transport: 'streamable-http',
    endpoint,
    tools: [],
    latencyMs,
  };

  if (!isRecord(payload)) {
    return { ...base, tools: FALLBACK_MCP_TOOLS };
  }

  const serverObj = isRecord(payload.server) ? payload.server : payload;
  const name =
    readString(serverObj.name ?? payload.service).trim() || base.name;
  const version = readString(serverObj.version).trim() || base.version;
  const protocol =
    readString(
      payload.protocol ?? payload.protocolVersion ?? serverObj.protocolVersion
    ).trim() || base.protocol;
  const transport =
    readString(payload.transport).trim() || base.transport;

  const rawTools = Array.isArray(payload.tools)
    ? payload.tools
    : isRecord(payload.capabilities) && Array.isArray(payload.capabilities.tools)
      ? payload.capabilities.tools
      : [];

  const tools: McpToolDescriptor[] = [];
  for (const item of rawTools) {
    if (typeof item === 'string' && item.trim()) {
      tools.push({
        name: item.trim(),
        description: 'Remote MCP tool exposed over Streamable HTTP.',
      });
    } else if (isRecord(item)) {
      const toolName = readString(item.name ?? item.id).trim();
      if (!toolName) continue;
      tools.push({
        name: toolName,
        description:
          readString(item.description ?? item.summary).trim() ||
          'Remote MCP tool exposed over Streamable HTTP.',
        category: readString(item.category).trim() || undefined,
      });
    }
  }

  return {
    online: true,
    name,
    version,
    protocol,
    transport,
    endpoint,
    tools: tools.length > 0 ? tools : FALLBACK_MCP_TOOLS,
    latencyMs,
  };
}

/**
 * Authentic Haishoku Sokan (1933) asymmetric proportion bands per swatch count.
 */
function getBandProportions(count: number): number[] {
  if (count === 2) return [62, 38];
  if (count === 3) return [48, 32, 20];
  if (count === 4) return [38, 26, 21, 15];
  if (count <= 1) return [100];
  const equal = Math.floor(100 / count);
  return Array.from({ length: count }, () => equal);
}

function formatPlateId(id: number): string {
  return `#${String(id).padStart(3, '0')}`;
}

function buildSanzoDesignSystemPrompt(
  combo: SanzoCombination,
  polarity: Polarity
): string {
  const swatchLines = combo.swatches
    .map((s, idx) => `  ${idx + 1}. ${s.name} (${s.hex})`)
    .join('\n');
  const moodLabel =
    combo.moods.length > 0 ? combo.moods.join(', ') : 'editorial archival';

  return [
    `Redesign the entire application using Sanzo Wada's 1933 Dictionary of Color Combinations (配色事典) Plate ${formatPlateId(combo.id)} in a ${polarity.toUpperCase()} polarity design system.`,
    '',
    `Exact Sanzo Wada Swatches (${combo.swatches.length}-Color · ${moodLabel}):`,
    swatchLines,
    '',
    'Design System Directives:',
    `- Compile these exact pigments into an APCA-verified OKLCH token hierarchy optimized for ${polarity} mode (surface canvas, elevated cards, hairline borders, primary/secondary ink with >= 75 Lc body contrast, and disciplined accent roles).`,
    '- Preserve the historic Japanese print-plate restraint: asymmetrical visual breathing room, crisp 1px borders, zero generic purple/neon AI gradients, and high-craft editorial typography with tabular numerals.',
    '- Apply the palette consistently across hero framing, navigation, interactive controls, badges, and data surfaces while keeping every interactive affordance crystal clear.',
  ].join('\n');
}

export function SanzoWadaMcpModal({
  open,
  onClose,
  initialTab = 'sanzo',
  onInstantLookApplied,
  onApplyDesignSystem,
}: SanzoWadaMcpModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);

  // Tab 1: Sanzo Wada state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [swatchFilter, setSwatchFilter] = useState<SwatchCountFilter>('all');
  const [moodFilter, setMoodFilter] = useState<MoodFilter>('all');
  const [combinations, setCombinations] = useState<SanzoCombination[]>([]);
  const [totalCount, setTotalCount] = useState<number>(348);
  const [loadingSanzo, setLoadingSanzo] = useState(false);
  const [sanzoError, setSanzoError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [polarity, setPolarity] = useState<Polarity>('dark');
  const [applyingInstant, setApplyingInstant] = useState(false);
  const [instantSuccess, setInstantSuccess] = useState<string | null>(null);
  const [instantError, setInstantError] = useState<string | null>(null);

  // Tab 2: Remote MCP state
  const [mcpStatus, setMcpStatus] = useState<McpStatusInfo | null>(null);
  const [loadingMcp, setLoadingMcp] = useState(false);
  const [snippetTab, setSnippetTab] = useState<SnippetTab>('ide');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mcpEndpoint = `${BACKEND_URL}/mcp`;

  // Sync tab on modal open
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setInstantSuccess(null);
      setInstantError(null);
    }
  }, [open, initialTab]);

  // Cleanup copy feedback timer
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Sanzo Wada combinations
  const fetchSanzoCombinations = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingSanzo(true);
      setSanzoError(null);
      try {
        const params = new URLSearchParams();
        params.set('limit', '60');
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (swatchFilter !== 'all') params.set('count', String(swatchFilter));
        if (moodFilter !== 'all') params.set('mood', moodFilter);

        const res = await fetch(
          `${BACKEND_URL}/api/design/sanzo-wada?${params.toString()}`,
          {
            cache: 'no-store',
            signal,
          }
        );

        if (!res.ok) {
          let message = `Failed to load Sanzo Wada catalog (${res.status})`;
          try {
            const errJson: unknown = await res.json();
            if (isRecord(errJson) && typeof errJson.error === 'string') {
              message = errJson.error;
            }
          } catch {
            // ignore parse error
          }
          throw new Error(message);
        }

        const data: unknown = await res.json();
        const parsed = parseSanzoResponse(data);
        setCombinations(parsed.combinations);
        setTotalCount(parsed.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSanzoError(
          err instanceof Error
            ? err.message
            : 'Unable to reach Sanzo Wada catalog endpoint.'
        );
      } finally {
        setLoadingSanzo(false);
      }
    },
    [debouncedQuery, swatchFilter, moodFilter]
  );

  useEffect(() => {
    if (!open || activeTab !== 'sanzo') return;
    const controller = new AbortController();
    void fetchSanzoCombinations(controller.signal);
    return () => controller.abort();
  }, [open, activeTab, fetchSanzoCombinations]);

  // Ping Remote MCP endpoint when MCP tab is active
  const pingMcpServer = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingMcp(true);
      const started = performance.now();
      try {
        const res = await fetch(mcpEndpoint, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal,
        });
        const latencyMs = Math.max(1, Math.round(performance.now() - started));
        if (!res.ok) {
          throw new Error(`MCP endpoint returned HTTP ${res.status}`);
        }
        const data: unknown = await res.json();
        setMcpStatus(parseMcpStatus(data, mcpEndpoint, latencyMs));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setMcpStatus({
          online: false,
          name: 'AntiSlop Remote MCP Server',
          version: '2.0.0',
          protocol: 'Streamable HTTP (JSON-RPC 2.0)',
          transport: 'streamable-http',
          endpoint: mcpEndpoint,
          tools: FALLBACK_MCP_TOOLS,
          error:
            err instanceof Error
              ? err.message
              : 'Could not reach Remote MCP server.',
        });
      } finally {
        setLoadingMcp(false);
      }
    },
    [mcpEndpoint]
  );

  useEffect(() => {
    if (!open || activeTab !== 'mcp') return;
    const controller = new AbortController();
    void pingMcpServer(controller.signal);
    return () => controller.abort();
  }, [open, activeTab, pingMcpServer]);

  const selectedCombo = useMemo(
    () => combinations.find((c) => c.id === selectedId) ?? null,
    [combinations, selectedId]
  );

  const handleCopy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Clipboard blocked in non-secure context; ignore gracefully
    }
  }, []);

  const handleInstantApply = useCallback(async () => {
    if (!selectedCombo || applyingInstant) return;
    setApplyingInstant(true);
    setInstantSuccess(null);
    setInstantError(null);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/design/sanzo-wada/${encodeURIComponent(
          String(selectedCombo.id)
        )}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ polarity }),
        }
      );

      if (!res.ok) {
        let message = `Instant apply failed (${res.status})`;
        try {
          const errBody: unknown = await res.json();
          if (isRecord(errBody) && typeof errBody.error === 'string') {
            message = errBody.error;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      setInstantSuccess(
        `Applied Plate ${formatPlateId(selectedCombo.id)} (${polarity} OKLCH) live to preview.`
      );
      onInstantLookApplied?.();
    } catch (err) {
      setInstantError(
        err instanceof Error ? err.message : 'Failed to apply instant palette.'
      );
    } finally {
      setApplyingInstant(false);
    }
  }, [selectedCombo, applyingInstant, polarity, onInstantLookApplied]);

  const handleFullAiRedesign = useCallback(() => {
    if (!selectedCombo) return;
    const prompt = buildSanzoDesignSystemPrompt(selectedCombo, polarity);
    onApplyDesignSystem(prompt);
    onClose();
  }, [selectedCombo, polarity, onApplyDesignSystem, onClose]);

  const snippets = useMemo(() => {
    const ideJson = JSON.stringify(
      {
        mcpServers: {
          antislop: {
            url: mcpEndpoint,
            transport: 'streamable-http',
          },
        },
      },
      null,
      2
    );

    const claudeCli = [
      `# Add AntiSlop live Remote MCP server to Claude Code`,
      `claude mcp add --transport http antislop ${mcpEndpoint}`,
      ``,
      `# Verify connection & list all 7 design-system tools`,
      `claude mcp list`,
    ].join('\n');

    const rawCurl = [
      `# 1. Discover all live MCP tools via JSON-RPC 2.0`,
      `curl -sS -X POST "${mcpEndpoint}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "Accept: application/json, text/event-stream" \\`,
      `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`,
      ``,
      `# 2. Query Sanzo Wada 1933 combinations directly from any agent`,
      `curl -sS -X POST "${mcpEndpoint}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "Accept: application/json, text/event-stream" \\`,
      `  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_sanzo_wada","arguments":{"mood":"earthy","count":3,"limit":5}}}'`,
    ].join('\n');

    return {
      ide: ideJson,
      claude: claudeCli,
      curl: rawCurl,
    };
  }, [mcpEndpoint]);

  const activeSnippet = snippets[snippetTab];

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      widthClass="w-[min(95vw,1080px)]"
      title="Sanzo Wada 348 Color Dictionary & Remote MCP"
      subtitle="Historic 1933 Japanese color combinations compiled into APCA-verified OKLCH design systems + live Streamable HTTP MCP access for any AI coding agent."
    >
      <div className="flex flex-col gap-4">
        {/* Top Segmented Tab Bar */}
        <div
          role="tablist"
          aria-label="Sanzo Wada and Remote MCP tabs"
          className="inline-flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-1.5"
        >
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'sanzo'}
              onClick={() => setActiveTab('sanzo')}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all sm:flex-none ${
                activeTab === 'sanzo'
                  ? 'border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--ink-primary)] shadow-xs'
                  : 'border border-transparent text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-[var(--cobalt-ice)]" />
              <span>配色事典 · Sanzo Wada 348</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'mcp'}
              onClick={() => setActiveTab('mcp')}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all sm:flex-none ${
                activeTab === 'mcp'
                  ? 'border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--ink-primary)] shadow-xs'
                  : 'border border-transparent text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <Plug className="h-3.5 w-3.5 text-[var(--emerald)]" />
              <span>Connect Remote MCP</span>
              {mcpStatus?.online && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--emerald)]">
                  {mcpStatus.tools.length}
                </span>
              )}
            </button>
          </div>

          <div className="hidden items-center gap-2 pr-2 font-mono text-[11px] text-[var(--ink-muted)] md:flex">
            <span>APCA OKLCH</span>
            <span aria-hidden="true">·</span>
            <span>Haishoku Sōkan 1933</span>
          </div>
        </div>

        {/* ============================================================
            TAB 1: SANZO WADA 348 COLOR DICTIONARY (配色事典)
           ============================================================ */}
        {activeTab === 'sanzo' && (
          <div className="flex flex-col gap-4">
            {/* Search & Filter Controls */}
            <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3.5">
              <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                {/* Search input */}
                <label className="relative flex flex-1 items-center">
                  <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[var(--ink-muted)]" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search pigment name, #ID, or hex (e.g. Hermosa Pink, Indigo, 42)..."
                    className="w-full rounded-lg border border-[var(--border-pill)] bg-[var(--bg-card)] py-2 pr-3 pl-9 text-[13px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--cobalt-ice)] focus:outline-none"
                  />
                </label>

                {/* Swatch count filter */}
                <div
                  role="group"
                  aria-label="Filter by swatch count"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1"
                >
                  {SWATCH_COUNT_OPTIONS.map((opt) => {
                    const active = swatchFilter === opt.value;
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setSwatchFilter(opt.value)}
                        className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                          active
                            ? 'bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)]'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mood filter pills + result telemetry */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label="Filter by mood"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {MOOD_OPTIONS.map((opt) => {
                    const active = moodFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMoodFilter(opt.value)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11.5px] capitalize transition-colors ${
                          active
                            ? 'border-[var(--cobalt-border-strong)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <div className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
                  {loadingSanzo
                    ? 'Loading plates...'
                    : `Showing ${combinations.length} of ${totalCount} plates`}
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {sanzoError && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-4 py-3 text-[12.5px] text-[var(--vermilion)]">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{sanzoError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchSanzoCombinations()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--vermilion-border)] px-2.5 py-1 text-[11.5px] font-medium hover:bg-[var(--bg-card)]/40"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            )}

            {/* Selected Palette Action Bar (pinned above grid for instant reach) */}
            {selectedCombo && (
              <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-xl border border-[var(--cobalt-border-strong)] bg-[var(--bg-card-elevated)]/95 p-3.5 shadow-[var(--shadow-card)] backdrop-blur-md">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  {/* Selected summary */}
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--border-strong)]">
                      {selectedCombo.swatches.map((s, idx) => {
                        const proportions = getBandProportions(
                          selectedCombo.swatches.length
                        );
                        return (
                          <div
                            key={`${selectedCombo.id}-bar-${idx}`}
                            style={{
                              backgroundColor: s.hex,
                              width: `${proportions[idx] ?? 25}%`,
                            }}
                            title={`${s.name} (${s.hex})`}
                          />
                        );
                      })}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] font-semibold text-[var(--cobalt-ice)]">
                          Plate {formatPlateId(selectedCombo.id)}
                        </span>
                        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-secondary)]">
                          {selectedCombo.swatches.length}-Color
                        </span>
                      </div>
                      <p className="truncate text-[12px] text-[var(--ink-secondary)]">
                        {selectedCombo.swatches
                          .map((s) => `${s.name} ${s.hex}`)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>

                  {/* Polarity toggle + Instant Live Preview + Full AI Redesign */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      role="group"
                      aria-label="Target design system polarity"
                      className="inline-flex items-center rounded-lg border border-[var(--border-pill)] bg-[var(--bg-card)] p-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => setPolarity('light')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                          polarity === 'light'
                            ? 'bg-[var(--btn-contrast-bg)] text-[var(--btn-contrast-ink)]'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        <Sun className="h-3.5 w-3.5" />
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setPolarity('dark')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                          polarity === 'dark'
                            ? 'bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)]'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        <Moon className="h-3.5 w-3.5" />
                        Dark
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleInstantApply()}
                      disabled={applyingInstant}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--emerald)] transition-colors hover:brightness-110 disabled:opacity-60"
                    >
                      {applyingInstant ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      <span>⚡ Instant Live Preview (0ms)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleFullAiRedesign}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--btn-primary-bg)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--btn-primary-ink)] transition-colors hover:bg-[var(--btn-primary-hover)]"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Apply Full AI Redesign</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {instantSuccess && (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-3 py-1.5 text-[12px] text-[var(--emerald)]">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>{instantSuccess}</span>
                  </div>
                )}

                {instantError && (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-3 py-1.5 text-[12px] text-[var(--vermilion)]">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{instantError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Japanese Book Plate Grid */}
            {loadingSanzo && combinations.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 9 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-48 animate-pulse rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)]/70"
                  />
                ))}
              </div>
            ) : combinations.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card-elevated)]/50 px-6 py-12 text-center">
                <Palette className="h-7 w-7 text-[var(--ink-muted)]" />
                <p className="mt-2.5 text-[14px] font-medium text-[var(--ink-primary)]">
                  No Sanzo Wada combinations match your filters
                </p>
                <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                  Try clearing your search query or switching mood / swatch count.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSwatchFilter('all');
                    setMoodFilter('all');
                  }}
                  className="mt-4 rounded-lg border border-[var(--border-pill)] bg-[var(--bg-card)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--ink-primary)] hover:border-[var(--border-strong)]"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {combinations.map((combo) => {
                  const isSelected = selectedId === combo.id;
                  const proportions = getBandProportions(combo.swatches.length);

                  return (
                    <button
                      key={combo.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(combo.id);
                        setInstantSuccess(null);
                        setInstantError(null);
                      }}
                      aria-pressed={isSelected}
                      className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-[var(--cobalt-ice)] bg-[var(--bg-card-elevated)] ring-2 ring-[var(--cobalt-border)]'
                          : 'border-[var(--border-card)] bg-[var(--bg-card-elevated)]/65 hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-elevated)]'
                      }`}
                    >
                      {/* Proportional 1933 Print-Plate Color Bands */}
                      <div className="relative flex h-20 w-full border-b border-[var(--border-subtle)]">
                        {combo.swatches.map((swatch, idx) => (
                          <div
                            key={`${combo.id}-${idx}`}
                            style={{
                              backgroundColor: swatch.hex,
                              width: `${proportions[idx] ?? 25}%`,
                            }}
                            className="h-full transition-transform duration-300 group-hover:scale-[1.01]"
                            title={`${swatch.name} · ${swatch.hex}`}
                          />
                        ))}
                        <span className="absolute top-2 left-2 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-tight text-white backdrop-blur-xs">
                          {formatPlateId(combo.id)}
                        </span>
                        {isSelected && (
                          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-[var(--cobalt-core)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
                            <Check className="h-3 w-3" />
                            Selected
                          </span>
                        )}
                      </div>

                      {/* Specimen Details */}
                      <div className="flex flex-1 flex-col justify-between gap-2.5 p-3">
                        <div className="flex flex-col gap-1.5">
                          {combo.swatches.map((swatch, idx) => (
                            <div
                              key={`${combo.id}-legend-${idx}`}
                              className="flex items-center justify-between gap-2 text-[11.5px]"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="h-3 w-3 shrink-0 rounded-[3px] border border-white/15"
                                  style={{ backgroundColor: swatch.hex }}
                                />
                                <span className="truncate font-medium text-[var(--ink-primary)]">
                                  {swatch.name}
                                </span>
                              </div>
                              <span className="shrink-0 font-mono text-[10.5px] text-[var(--ink-muted)]">
                                {swatch.hex}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Mood badges + Swatch count */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-[var(--border-subtle)] pt-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {combo.moods.slice(0, 3).map((m) => (
                              <span
                                key={`${combo.id}-mood-${m}`}
                                className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-0.5 text-[10px] capitalize text-[var(--ink-secondary)]"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                          <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                            {combo.swatches.length}c
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            TAB 2: CONNECT REMOTE MCP (Streamable HTTP)
           ============================================================ */}
        {activeTab === 'mcp' && (
          <div className="flex flex-col gap-4">
            {/* Live Status + Endpoint Card */}
            <div className="flex flex-col gap-3.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {loadingMcp ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--cobalt-ice)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Pinging MCP...
                    </span>
                  ) : mcpStatus?.online ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--emerald)]">
                      <span className="h-2 w-2 rounded-full bg-[var(--emerald)]" />
                      Online
                      {mcpStatus.latencyMs !== undefined && (
                        <span className="font-mono text-[10.5px] opacity-80">
                          · {mcpStatus.latencyMs}ms
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--amber-border)] bg-[var(--amber-bg)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--amber)]">
                      <AlertCircle className="h-3 w-3" />
                      Unreachable
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 font-mono text-[11px] text-[var(--ink-primary)]">
                    <Wrench className="h-3 w-3 text-[var(--cobalt-ice)]" />
                    {(mcpStatus?.tools.length ?? FALLBACK_MCP_TOOLS.length)} Tools
                  </span>

                  <span className="hidden rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 font-mono text-[11px] text-[var(--ink-secondary)] sm:inline-flex">
                    {mcpStatus?.protocol ?? 'Streamable HTTP'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void pingMcpServer()}
                  disabled={loadingMcp}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-pill)] bg-[var(--bg-card)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)] disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loadingMcp ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </button>
              </div>

              {mcpStatus?.error && (
                <p className="text-[12px] text-[var(--amber)]">
                  {mcpStatus.error} — showing documented endpoint &amp; tool
                  catalog below.
                </p>
              )}

              {/* Live Remote MCP Endpoint URL */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">
                  Live Remote MCP Endpoint URL
                </span>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-pill)] bg-[var(--bg-card)] px-3 py-2">
                  <code className="min-w-0 truncate font-mono text-[12.5px] text-[var(--cobalt-ice)]">
                    {mcpEndpoint}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopy('endpoint', mcpEndpoint)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--cobalt-border)] hover:text-[var(--cobalt-ice)]"
                  >
                    {copiedKey === 'endpoint' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[var(--emerald)]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy URL
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* 1-Click Client Setup Snippets */}
            <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 text-[var(--cobalt-ice)]" />
                  <span className="text-[12.5px] font-medium text-[var(--ink-primary)]">
                    5-Second Client Setup
                  </span>
                </div>

                <div
                  role="tablist"
                  aria-label="MCP client setup snippets"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5"
                >
                  {(
                    [
                      { id: 'ide', label: 'Antigravity / Cursor' },
                      { id: 'claude', label: 'Claude Code CLI' },
                      { id: 'curl', label: 'Raw JSON-RPC curl' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={snippetTab === item.id}
                      onClick={() => setSnippetTab(item.id)}
                      className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                        snippetTab === item.id
                          ? 'bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)]'
                          : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative bg-[var(--bg-card)] p-3.5">
                <button
                  type="button"
                  onClick={() =>
                    void handleCopy(`snippet-${snippetTab}`, activeSnippet)
                  }
                  className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-pill)] bg-[var(--bg-card-elevated)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--cobalt-border)] hover:text-[var(--cobalt-ice)]"
                >
                  {copiedKey === `snippet-${snippetTab}` ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--emerald)]" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Snippet
                    </>
                  )}
                </button>
                <pre className="studio-scroll overflow-x-auto pr-28 font-mono text-[12px] leading-relaxed text-[var(--ink-primary)]">
                  <code>{activeSnippet}</code>
                </pre>
              </div>
            </div>

            {/* Exposed Remote MCP Tools List */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-medium text-[var(--ink-primary)]">
                  Exposed Remote MCP Tools (
                  {(mcpStatus?.tools ?? FALLBACK_MCP_TOOLS).length})
                </h3>
                <span className="font-mono text-[11px] text-[var(--ink-muted)]">
                  POST {mcpEndpoint}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {(mcpStatus?.tools ?? FALLBACK_MCP_TOOLS).map((tool) => (
                  <div
                    key={tool.name}
                    className="flex flex-col gap-1 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)]/70 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-[12.5px] font-semibold text-[var(--cobalt-ice)]">
                        {tool.name}
                      </code>
                      <span className="rounded-full border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-2 py-0.5 font-mono text-[10px] text-[var(--emerald)]">
                        tool
                      </span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                      {tool.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </NativeDialog>
  );
}
