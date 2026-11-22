'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Info,
  LayoutGrid,
  Loader2,
  Monitor,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Terminal,
  Type,
  Zap,
} from 'lucide-react';
import { BACKEND_URL } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

export type GeometryCategoryKey = 'apca' | 'typography' | 'layout' | 'a11y';
export type GeometryCategoryFilter = 'all' | GeometryCategoryKey;
export type GeometryViolationSeverity = 'critical' | 'warning' | 'info';

export interface GeometryViolation {
  id: string;
  category: GeometryCategoryKey;
  severity: GeometryViolationSeverity;
  selector: string;
  message: string;
  measured: string;
  threshold: string;
  textSnippet?: string;
}

export interface GeometryCategoryScores {
  apca: number;
  typography: number;
  layout: number;
  a11y: number;
}

export interface GeometryAuditReport {
  overallScore: number;
  totalElementsScanned: number;
  textNodesAudited: number;
  latencyMs: number;
  viewport: {
    width: number;
    height: number;
  };
  categories: GeometryCategoryScores;
  violations: GeometryViolation[];
  engineeringFixDirectives: string[];
  engineeringFixPrompt?: string;
}

export interface GeometryAuditModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
  onApplyEngineeringFix: (prompt: string) => void;
}

interface CategoryGaugeMeta {
  key: GeometryCategoryKey;
  label: string;
  pillLabel: string;
  weight: string;
  icon: typeof Eye;
}

const CATEGORY_META: readonly CategoryGaugeMeta[] = [
  {
    key: 'apca',
    label: 'APCA Contrast',
    pillLabel: 'APCA',
    weight: '35%',
    icon: Eye,
  },
  {
    key: 'typography',
    label: 'Typography & Measure',
    pillLabel: 'Typography',
    weight: '25%',
    icon: Type,
  },
  {
    key: 'layout',
    label: 'Layout & Rhythm',
    pillLabel: 'Layout',
    weight: '20%',
    icon: LayoutGrid,
  },
  {
    key: 'a11y',
    label: 'Semantic A11y',
    pillLabel: 'A11y',
    weight: '20%',
    icon: ShieldCheck,
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeCategoryKey(raw: unknown): GeometryCategoryKey {
  if (typeof raw !== 'string') return 'layout';
  const lowered = raw.trim().toLowerCase();
  if (lowered.includes('apca') || lowered.includes('contrast') || lowered.includes('color')) {
    return 'apca';
  }
  if (lowered.includes('typo') || lowered.includes('font') || lowered.includes('measure')) {
    return 'typography';
  }
  if (lowered.includes('a11y') || lowered.includes('access') || lowered.includes('semantic') || lowered.includes('wcag') || lowered.includes('landmark')) {
    return 'a11y';
  }
  return 'layout';
}

function normalizeSeverity(raw: unknown): GeometryViolationSeverity {
  if (typeof raw !== 'string') return 'warning';
  const lowered = raw.trim().toLowerCase();
  if (lowered === 'critical' || lowered === 'error' || lowered === 'high') return 'critical';
  if (lowered === 'info' || lowered === 'low' || lowered === 'notice') return 'info';
  return 'warning';
}

function extractCategoryScore(
  source: Record<string, unknown> | undefined,
  keys: readonly string[],
  fallback: number
): number {
  if (!source) return fallback;
  for (const key of keys) {
    const candidate = source[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return clampScore(candidate);
    }
    if (isRecord(candidate) && typeof candidate.score === 'number' && Number.isFinite(candidate.score)) {
      return clampScore(candidate.score);
    }
  }
  return fallback;
}

function normalizeGeometryAuditResponse(raw: unknown): GeometryAuditReport {
  const root = isRecord(raw) ? raw : {};
  const overallScore = clampScore(
    toFiniteNumber(root.overallScore ?? root.score ?? root.totalScore, 0)
  );

  const categorySource =
    (isRecord(root.categories) && root.categories) ||
    (isRecord(root.categoryScores) && root.categoryScores) ||
    (isRecord(root.scores) && root.scores) ||
    (isRecord(root.breakdown) && root.breakdown) ||
    undefined;

  const categories: GeometryCategoryScores = {
    apca: extractCategoryScore(
      categorySource,
      ['apca', 'apcaContrast', 'contrast', 'apca_contrast'],
      overallScore
    ),
    typography: extractCategoryScore(
      categorySource,
      ['typography', 'typographyMeasure', 'typography_measure', 'type'],
      overallScore
    ),
    layout: extractCategoryScore(
      categorySource,
      ['layout', 'layoutRhythm', 'layout_rhythm', 'rhythm', 'grid'],
      overallScore
    ),
    a11y: extractCategoryScore(
      categorySource,
      ['a11y', 'semanticA11y', 'semantic_a11y', 'accessibility', 'semantic'],
      overallScore
    ),
  };

  const rawViewport = isRecord(root.viewport) ? root.viewport : undefined;
  const viewport = {
    width: Math.round(
      toFiniteNumber(rawViewport?.width ?? root.viewportWidth, 1440)
    ),
    height: Math.round(
      toFiniteNumber(rawViewport?.height ?? root.viewportHeight, 900)
    ),
  };

  const rawViolations = Array.isArray(root.violations) ? root.violations : [];
  const violations: GeometryViolation[] = rawViolations
    .filter(isRecord)
    .map((item, idx) => {
      const snippetCandidate = item.textSnippet ?? item.snippet ?? item.text;
      return {
        id:
          typeof item.id === 'string' && item.id.trim().length > 0
            ? item.id
            : `violation-${idx}`,
        category: normalizeCategoryKey(item.category ?? item.pillar ?? item.domain),
        severity: normalizeSeverity(item.severity ?? item.level),
        selector:
          typeof item.selector === 'string' && item.selector.trim().length > 0
            ? item.selector
            : 'body',
        message:
          typeof item.message === 'string' && item.message.trim().length > 0
            ? item.message
            : 'Computed DOM constraint violation detected.',
        measured:
          item.measured !== undefined && item.measured !== null
            ? String(item.measured)
            : 'N/A',
        threshold:
          item.threshold !== undefined && item.threshold !== null
            ? String(item.threshold)
            : 'Spec',
        textSnippet:
          typeof snippetCandidate === 'string' && snippetCandidate.trim().length > 0
            ? snippetCandidate.trim()
            : undefined,
      };
    });

  const rawDirectives = Array.isArray(root.engineeringFixDirectives)
    ? root.engineeringFixDirectives
    : Array.isArray(root.fixDirectives)
      ? root.fixDirectives
      : [];
  const engineeringFixDirectives = rawDirectives
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());

  const engineeringFixPrompt =
    typeof root.engineeringFixPrompt === 'string' && root.engineeringFixPrompt.trim().length > 0
      ? root.engineeringFixPrompt.trim()
      : undefined;

  return {
    overallScore,
    totalElementsScanned: Math.round(
      toFiniteNumber(root.totalElementsScanned ?? root.elementsScanned, 0)
    ),
    textNodesAudited: Math.round(
      toFiniteNumber(root.textNodesAudited ?? root.textNodesScanned, 0)
    ),
    latencyMs: Math.round(toFiniteNumber(root.latencyMs ?? root.durationMs, 0)),
    viewport,
    categories,
    violations,
    engineeringFixDirectives,
    engineeringFixPrompt,
  };
}

function getScoreTone(score: number): {
  text: string;
  bar: string;
  badgeBg: string;
  badgeBorder: string;
  label: string;
} {
  if (score >= 85) {
    return {
      text: 'text-[var(--emerald)]',
      bar: 'bg-[var(--emerald)]',
      badgeBg: 'bg-[var(--emerald-bg)]',
      badgeBorder: 'border-[var(--emerald-border)]',
      label: 'Pass',
    };
  }
  if (score >= 65) {
    return {
      text: 'text-[var(--amber)]',
      bar: 'bg-[var(--amber)]',
      badgeBg: 'bg-[var(--amber-bg)]',
      badgeBorder: 'border-[var(--amber-border)]',
      label: 'Needs Polish',
    };
  }
  return {
    text: 'text-[var(--vermilion)]',
    bar: 'bg-[var(--vermilion)]',
    badgeBg: 'bg-[var(--vermilion-bg)]',
    badgeBorder: 'border-[var(--vermilion-border)]',
    label: 'Critical',
  };
}

function getSeverityBadgeStyle(severity: GeometryViolationSeverity): {
  pill: string;
  icon: typeof AlertOctagon;
  label: string;
} {
  if (severity === 'critical') {
    return {
      pill: 'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)]',
      icon: AlertOctagon,
      label: 'CRITICAL',
    };
  }
  if (severity === 'warning') {
    return {
      pill: 'border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]',
      icon: AlertTriangle,
      label: 'WARNING',
    };
  }
  return {
    pill: 'border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--cobalt-bright)]',
    icon: Info,
    label: 'INFO',
  };
}

function buildEngineeringFixPrompt(report: GeometryAuditReport): string {
  if (report.engineeringFixPrompt) {
    return report.engineeringFixPrompt;
  }

  const lines: string[] = [
    `Apply deterministic Computed-DOM Geometry & APCA Accessibility fixes (current score: ${report.overallScore}/100 at ${report.viewport.width}x${report.viewport.height}).`,
  ];

  if (report.engineeringFixDirectives.length > 0) {
    lines.push('', 'Mandatory Engineering Directives:');
    report.engineeringFixDirectives.forEach((directive, idx) => {
      lines.push(`${idx + 1}. ${directive}`);
    });
  }

  const priorityViolations = [...report.violations]
    .sort((a, b) => {
      const rank: Record<GeometryViolationSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      return rank[a.severity] - rank[b.severity];
    })
    .slice(0, 12);

  if (priorityViolations.length > 0) {
    lines.push('', 'Targeted DOM Violations to Resolve:');
    priorityViolations.forEach((v) => {
      lines.push(
        `- [${v.severity.toUpperCase()}][${v.category}] \`${v.selector}\`: ${v.message} (measured: ${v.measured} vs threshold: ${v.threshold})`
      );
    });
  }

  lines.push(
    '',
    'Preserve visual craft and brand hierarchy while ensuring all painted APCA contrast ratios, typography measures, grid rhythm, and WCAG semantic landmarks pass.'
  );

  return lines.join('\n');
}

export function GeometryAuditModal({
  open,
  onClose,
  workspaceId,
  onApplyEngineeringFix,
}: GeometryAuditModalProps) {
  const [report, setReport] = useState<GeometryAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<GeometryCategoryFilter>('all');

  const abortControllerRef = useRef<AbortController | null>(null);

  const runGeometryAudit = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/geometry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workspaceId ? { workspaceId } : {}),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = `Geometry audit failed (${res.status})`;
        try {
          const errBody = (await res.json()) as { error?: string; message?: string };
          if (typeof errBody.error === 'string' && errBody.error.trim().length > 0) {
            message = errBody.error;
          } else if (typeof errBody.message === 'string' && errBody.message.trim().length > 0) {
            message = errBody.message;
          }
        } catch {
          // Retain HTTP status message
        }
        throw new Error(message);
      }

      const rawData: unknown = await res.json();
      if (!controller.signal.aborted) {
        setReport(normalizeGeometryAuditResponse(rawData));
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to complete live Computed-DOM Geometry & APCA A11y scan.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
      return;
    }

    setActiveCategory('all');
    void runGeometryAudit();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [open, runGeometryAudit]);

  const violationCountsByCategory = useMemo(() => {
    const counts: Record<GeometryCategoryFilter, number> = {
      all: 0,
      apca: 0,
      typography: 0,
      layout: 0,
      a11y: 0,
    };
    if (!report) return counts;
    counts.all = report.violations.length;
    for (const violation of report.violations) {
      counts[violation.category] += 1;
    }
    return counts;
  }, [report]);

  const filteredViolations = useMemo(() => {
    if (!report) return [];
    const severityRank: Record<GeometryViolationSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    const list =
      activeCategory === 'all'
        ? report.violations
        : report.violations.filter((v) => v.category === activeCategory);
    return [...list].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  }, [activeCategory, report]);

  const handleApplyFix = useCallback(() => {
    if (!report) return;
    const prompt = buildEngineeringFixPrompt(report);
    onApplyEngineeringFix(prompt);
    onClose();
  }, [onApplyEngineeringFix, onClose, report]);

  const overallTone = report ? getScoreTone(report.overallScore) : null;

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      widthClass="w-[min(95vw,980px)]"
      title="Computed-DOM Geometry & APCA A11y Audit"
      subtitle="Deterministic browser physics check: real painted APCA contrast, typography measure, grid rhythm, and WCAG landmarks."
    >
      <div className="space-y-5">
        {/* Top Action & Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--cobalt-bright)]">
              <ScanLine className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[12px] font-medium text-[var(--ink-primary)]">
                Live Headless Chromium Physics Probe
              </div>
              <div className="text-[11px] text-[var(--ink-muted)]">
                {workspaceId ? `Workspace: ${workspaceId}` : 'Active Studio Preview'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void runGeometryAudit()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-card)] px-3.5 py-2 text-[12px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--cobalt-border-strong)] hover:text-[var(--cobalt-bright)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--cobalt-bright)]" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-[var(--cobalt-bright)]" />
            )}
            <span>{loading ? 'Scanning Live DOM…' : 'Re-Scan Live DOM'}</span>
          </button>
        </div>

        {/* Loading State (Initial) */}
        {loading && !report && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-6 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--cobalt-bright)]" />
            </div>
            <div className="space-y-1">
              <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                Auditing painted DOM geometry &amp; APCA luminance…
              </p>
              <p className="text-[12px] text-[var(--ink-secondary)]">
                Measuring computed bounding boxes, line-length measures, contrast polarity, and WCAG landmarks.
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--vermilion)]" />
              <div className="space-y-0.5">
                <p className="text-[13px] font-medium text-[var(--ink-primary)]">
                  DOM Geometry Audit Failed
                </p>
                <p className="text-[12px] text-[var(--ink-secondary)]">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void runGeometryAudit()}
              disabled={loading}
              className="rounded-lg border border-[var(--vermilion-border)] bg-[var(--bg-card)] px-3 py-1.5 text-[12px] font-medium text-[var(--vermilion)] transition-colors hover:bg-[var(--bg-card-elevated)] disabled:opacity-50"
            >
              Retry Scan
            </button>
          </div>
        )}

        {/* Main Audit Results */}
        {report && overallTone && (
          <div className={loading ? 'space-y-5 opacity-60 transition-opacity' : 'space-y-5 transition-opacity'}>
            {/* 1. Hero Score Strip */}
            <section className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-4 md:grid-cols-[auto_1fr] md:items-center md:gap-5">
              <div
                className={`flex items-baseline gap-2.5 rounded-xl border px-4 py-3 ${overallTone.badgeBg} ${overallTone.badgeBorder}`}
              >
                <span className={`font-mono text-[38px] font-semibold leading-none tabular-nums ${overallTone.text}`}>
                  {report.overallScore}
                </span>
                <div className="flex flex-col">
                  <span className="font-mono text-[12px] font-medium text-[var(--ink-secondary)] tabular-nums">
                    / 100
                  </span>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${overallTone.text}`}>
                    {overallTone.label}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                    Elements Scanned
                  </div>
                  <div className="mt-1 font-mono text-[16px] font-semibold text-[var(--ink-primary)] tabular-nums">
                    {report.totalElementsScanned.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                    Text Nodes Audited
                  </div>
                  <div className="mt-1 font-mono text-[16px] font-semibold text-[var(--ink-primary)] tabular-nums">
                    {report.textNodesAudited.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                    Scan Latency
                  </div>
                  <div className="mt-1 font-mono text-[16px] font-semibold text-[var(--cobalt-bright)] tabular-nums">
                    {report.latencyMs.toLocaleString()}ms
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] px-3 py-2.5">
                  <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                    <Monitor className="h-3 w-3" />
                    <span>Viewport</span>
                  </div>
                  <div className="mt-1 font-mono text-[15px] font-semibold text-[var(--ink-primary)] tabular-nums">
                    {report.viewport.width}×{report.viewport.height}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. 4 Category Gauges + Filter Pills */}
            <section className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {CATEGORY_META.map((meta) => {
                  const score = report.categories[meta.key];
                  const tone = getScoreTone(score);
                  const Icon = meta.icon;
                  const isSelected = activeCategory === meta.key;

                  return (
                    <button
                      key={meta.key}
                      type="button"
                      onClick={() =>
                        setActiveCategory((prev) => (prev === meta.key ? 'all' : meta.key))
                      }
                      className={`group rounded-xl border p-3.5 text-left transition-colors ${
                        isSelected
                          ? 'border-[var(--cobalt-border-strong)] bg-[var(--cobalt-tint)]'
                          : 'border-[var(--border-card)] bg-[var(--bg-card-elevated)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-primary)]">
                          <Icon className="h-3.5 w-3.5 text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]" />
                          <span className="truncate">{meta.label}</span>
                        </div>
                        <span className="shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-muted)] tabular-nums">
                          {meta.weight}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-baseline justify-between">
                        <span className={`font-mono text-[22px] font-semibold leading-none tabular-nums ${tone.text}`}>
                          {score}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
                          {violationCountsByCategory[meta.key]}{' '}
                          {violationCountsByCategory[meta.key] === 1 ? 'issue' : 'issues'}
                        </span>
                      </div>

                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-card)]">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone.bar}`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Click-to-filter category pills */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter violations by category">
                  {(
                    [
                      { key: 'all', label: 'All' },
                      { key: 'apca', label: 'APCA' },
                      { key: 'typography', label: 'Typography' },
                      { key: 'layout', label: 'Layout' },
                      { key: 'a11y', label: 'A11y' },
                    ] as const
                  ).map((pill) => {
                    const active = activeCategory === pill.key;
                    const count = violationCountsByCategory[pill.key];
                    return (
                      <button
                        key={pill.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveCategory(pill.key)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                          active
                            ? 'border-[var(--cobalt-border-strong)] bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-bright)]'
                            : 'border-[var(--border-card)] bg-[var(--bg-card-elevated)] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        <span>{pill.label}</span>
                        <span className="font-mono text-[10px] opacity-80 tabular-nums">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
                  Showing {filteredViolations.length} of {report.violations.length} violations
                </span>
              </div>
            </section>

            {/* 3. Violation Inspector List */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[var(--ink-secondary)]">
                  Violation Inspector
                </h3>
              </div>

              {filteredViolations.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-4 py-4">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--emerald)]" />
                  <div>
                    <p className="text-[13px] font-medium text-[var(--ink-primary)]">
                      {report.violations.length === 0
                        ? 'Zero DOM physics or APCA accessibility violations detected.'
                        : 'No violations in this category.'}
                    </p>
                    <p className="text-[12px] text-[var(--ink-secondary)]">
                      {report.violations.length === 0
                        ? 'Computed contrast, measure, rhythm, and semantic landmarks all meet deterministic thresholds.'
                        : 'Switch back to All to inspect remaining findings.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="studio-scroll max-h-[300px] space-y-2 overflow-y-auto pr-1">
                  {filteredViolations.map((violation) => {
                    const sev = getSeverityBadgeStyle(violation.severity);
                    const SevIcon = sev.icon;
                    return (
                      <article
                        key={violation.id}
                        className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3.5 transition-colors hover:border-[var(--border-strong)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] ${sev.pill}`}
                            >
                              <SevIcon className="h-3 w-3" />
                              {sev.label}
                            </span>
                            <code className="max-w-[420px] truncate rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[11px] text-[var(--cobalt-ice)]">
                              {violation.selector}
                            </code>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums">
                            <span className="rounded-md border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-2 py-0.5 text-[var(--vermilion)]">
                              measured: {violation.measured}
                            </span>
                            <span className="text-[var(--ink-muted)]">vs</span>
                            <span className="rounded-md border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-2 py-0.5 text-[var(--emerald)]">
                              threshold: {violation.threshold}
                            </span>
                          </div>
                        </div>

                        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-primary)]">
                          {violation.message}
                        </p>

                        {violation.textSnippet && (
                          <div className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-secondary)]">
                            &ldquo;{violation.textSnippet}&rdquo;
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 4. Deterministic Engineering Directives + 1-Click Fix CTA */}
            <section className="rounded-2xl border border-[var(--cobalt-border)] bg-[var(--bg-card-elevated)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-[var(--cobalt-bright)]" />
                  <h3 className="text-[13px] font-semibold text-[var(--ink-primary)]">
                    Deterministic Engineering Directives
                  </h3>
                  <span className="rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-secondary)] tabular-nums">
                    {report.engineeringFixDirectives.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleApplyFix}
                  disabled={
                    report.violations.length === 0 &&
                    report.engineeringFixDirectives.length === 0
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-[13px] font-semibold text-[var(--btn-primary-ink)] shadow-[var(--cobalt-glow)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Zap className="h-4 w-4" />
                  <span>⚡ Auto-Fix All DOM &amp; A11y Violations →</span>
                </button>
              </div>

              {report.engineeringFixDirectives.length > 0 ? (
                <ol className="mt-3 space-y-1.5">
                  {report.engineeringFixDirectives.map((directive, idx) => (
                    <li
                      key={`${idx}-${directive.slice(0, 24)}`}
                      className="flex items-start gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-primary)]"
                    >
                      <span className="mt-0.5 font-mono text-[11px] font-semibold text-[var(--cobalt-bright)] tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span>{directive}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2.5 text-[12px] text-[var(--ink-secondary)]">
                  {report.violations.length > 0
                    ? 'Click Auto-Fix to synthesize targeted CSS & semantic markup patches from the detected violations above.'
                    : 'No remediation directives required — live DOM physics passed all checks.'}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </NativeDialog>
  );
}
