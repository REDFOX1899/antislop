'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Gauge,
  Loader2,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Swords,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { BACKEND_URL } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

export type ConversionCraftQuadrant =
  | 'high_yield_craft'
  | 'pretty_slop'
  | 'functional_draft'
  | 'needs_overhaul';

export interface ConversionBrandProbeResult {
  key: string;
  label: string;
  passProb: number;
  passed: boolean;
}

export interface ConversionAndBrandAuditResult {
  conversionReadinessScore: number;
  brandDriftNorm: number;
  quadrant: ConversionCraftQuadrant;
  probes: ConversionBrandProbeResult[];
  latencyMs: number;
  outputTokens: 0;
}

export interface PairwiseJudgeResult {
  winner: 'candidate' | 'baseline' | 'tie';
  debiasedCandidateWinProb: number;
  forwardWinProb: number;
  reverseWinProb: number;
  eloDelta: number;
  regressionProb: number;
  rejectedAsRegression: boolean;
  latencyMs: number;
  outputTokens: 0;
}

export interface ConversionJudgeModalProps {
  open: boolean;
  onClose: () => void;
  tasteScore?: number;
  baselineScreenshotUrl?: string;
  finalScreenshotUrl?: string;
  brandSummary?: string;
  onApplyConversionFix: (prompt: string) => void;
}

interface QuadrantMeta {
  id: ConversionCraftQuadrant;
  label: string;
  shortTag: string;
  summary: string;
  tone: 'emerald' | 'amber' | 'cobalt' | 'vermilion';
}

const QUADRANT_META: Record<ConversionCraftQuadrant, QuadrantMeta> = {
  high_yield_craft: {
    id: 'high_yield_craft',
    label: 'High-Yield Craft',
    shortTag: 'Taste ≥ 70 · Conversion ≥ 70',
    summary:
      'Museum-grade visual craft paired with clear value framing, decisive CTA hierarchy, and low brand drift.',
    tone: 'emerald',
  },
  pretty_slop: {
    id: 'pretty_slop',
    label: 'Pretty Slop',
    shortTag: 'Taste ≥ 70 · Conversion < 70',
    summary:
      'Polished surface aesthetics, but weak 3-second clarity, muted CTA dominance, or generic copy hurts conversion.',
    tone: 'amber',
  },
  functional_draft: {
    id: 'functional_draft',
    label: 'Functional Draft',
    shortTag: 'Taste < 70 · Conversion ≥ 70',
    summary:
      'Strong funnel clarity and persuasive structure, but elevated brand drift or unfinished visual craft.',
    tone: 'cobalt',
  },
  needs_overhaul: {
    id: 'needs_overhaul',
    label: 'Needs Overhaul',
    shortTag: 'Taste < 70 · Conversion < 70',
    summary:
      'Both visual taste fidelity and conversion psychology fall below production thresholds.',
    tone: 'vermilion',
  },
};

const PROBE_FIX_HINTS: Record<string, string> = {
  above_fold_value_clarity:
    'Rewrite the above-the-fold H1 and lead subheadline so a visitor grasps the exact product value and target user in under 3 seconds.',
  primary_cta_salience:
    'Elevate the primary CTA with unmistakable cobalt/accent contrast, decisive action-oriented microcopy, and clear hierarchy over secondary buttons.',
  trust_proof_credibility:
    'Add concrete, domain-authentic proof signals (real metrics, crisp product evidence, or editorial benchmarks) without cheesy stock badges.',
  cognitive_load_restraint:
    'Tighten section density with generous whitespace, clearer scannable chunking, and strict information hierarchy.',
  copy_specificity_authenticity:
    'Purge hollow AI buzzwords ("unleash", "revolutionize", "seamless next-gen synergy") and replace with sharp, domain-specific copy.',
  visual_funnel_flow:
    'Align spatial eye-flow from eyebrow → headline → supporting proof → primary CTA so the conversion path feels effortless.',
  palette_dna_adherence:
    'Restore disciplined 60/30/10 brand palette proportions and eliminate off-brand accent drift.',
  typography_voice_fidelity:
    'Enforce cohesive display/body font pairings, tight display tracking, and crisp editorial typographic scale.',
  zero_ai_slop_surface:
    'Strip generic AI SaaS clichés (gratuitous purple-blue neon glows, floating orb blobs, muddy glassmorphism) for crisp architectural surfaces.',
  layout_craft_originality:
    'Refine grid rhythm, asymmetric editorial framing, and card proportions so the composition feels bespoke and art-directed.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeConversionAudit(raw: unknown): ConversionAndBrandAuditResult {
  if (!isRecord(raw)) {
    throw new Error('Malformed conversion audit response from backend.');
  }

  const rawProbes = Array.isArray(raw.probes) ? raw.probes : [];
  const probes: ConversionBrandProbeResult[] = rawProbes
    .filter(isRecord)
    .map((p, idx) => {
      const passProb = clamp(toFiniteNumber(p.passProb, 0.5), 0, 1);
      const passed =
        typeof p.passed === 'boolean' ? p.passed : passProb >= 0.55;
      return {
        key:
          typeof p.key === 'string' && p.key.trim()
            ? p.key
            : `probe_${idx + 1}`,
        label:
          typeof p.label === 'string' && p.label.trim()
            ? p.label
            : `Probe ${idx + 1}`,
        passProb,
        passed,
      };
    });

  const conversionReadinessScore = clamp(
    toFiniteNumber(raw.conversionReadinessScore, 0),
    0,
    100
  );
  const brandDriftNorm = clamp(toFiniteNumber(raw.brandDriftNorm, 0.5), 0, 1);

  const validQuadrants: readonly ConversionCraftQuadrant[] = [
    'high_yield_craft',
    'pretty_slop',
    'functional_draft',
    'needs_overhaul',
  ];
  const quadrant: ConversionCraftQuadrant =
    typeof raw.quadrant === 'string' &&
    (validQuadrants as readonly string[]).includes(raw.quadrant)
      ? (raw.quadrant as ConversionCraftQuadrant)
      : conversionReadinessScore >= 70 && brandDriftNorm <= 0.3
        ? 'high_yield_craft'
        : conversionReadinessScore < 70 && brandDriftNorm <= 0.3
          ? 'pretty_slop'
          : conversionReadinessScore >= 70
            ? 'functional_draft'
            : 'needs_overhaul';

  return {
    conversionReadinessScore,
    brandDriftNorm,
    quadrant,
    probes,
    latencyMs: Math.max(0, Math.round(toFiniteNumber(raw.latencyMs, 0))),
    outputTokens: 0,
  };
}

function normalizePairwiseJudge(raw: unknown): PairwiseJudgeResult {
  if (!isRecord(raw)) {
    throw new Error('Malformed pairwise judge response from backend.');
  }
  const winnerRaw = raw.winner;
  const winner: 'candidate' | 'baseline' | 'tie' =
    winnerRaw === 'candidate' ||
    winnerRaw === 'baseline' ||
    winnerRaw === 'tie'
      ? winnerRaw
      : 'tie';

  return {
    winner,
    debiasedCandidateWinProb: clamp(
      toFiniteNumber(raw.debiasedCandidateWinProb, 0.5),
      0,
      1
    ),
    forwardWinProb: clamp(toFiniteNumber(raw.forwardWinProb, 0.5), 0, 1),
    reverseWinProb: clamp(toFiniteNumber(raw.reverseWinProb, 0.5), 0, 1),
    eloDelta: toFiniteNumber(raw.eloDelta, 0),
    regressionProb: clamp(toFiniteNumber(raw.regressionProb, 0), 0, 1),
    rejectedAsRegression: Boolean(raw.rejectedAsRegression),
    latencyMs: Math.max(0, Math.round(toFiniteNumber(raw.latencyMs, 0))),
    outputTokens: 0,
  };
}

function resolveAssetUrl(url: string): string {
  if (
    url.startsWith('data:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('blob:')
  ) {
    return url;
  }
  const base = BACKEND_URL.replace(/\/+$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

async function fetchUrlAsBase64(url: string): Promise<string> {
  if (url.startsWith('data:')) {
    return url;
  }
  const resolved = resolveAssetUrl(url);
  const res = await fetch(resolved);
  if (!res.ok) {
    throw new Error(`Failed to fetch screenshot (${res.status}): ${resolved}`);
  }
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not convert screenshot blob to base64.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('FileReader error while encoding screenshot.'));
    };
    reader.readAsDataURL(blob);
  });
}

function toneStyles(tone: 'emerald' | 'amber' | 'cobalt' | 'vermilion'): {
  text: string;
  bg: string;
  border: string;
  bar: string;
} {
  switch (tone) {
    case 'emerald':
      return {
        text: 'var(--emerald)',
        bg: 'var(--emerald-bg)',
        border: 'var(--emerald-border)',
        bar: 'var(--emerald)',
      };
    case 'amber':
      return {
        text: 'var(--amber)',
        bg: 'var(--amber-bg)',
        border: 'var(--amber-border)',
        bar: 'var(--amber)',
      };
    case 'cobalt':
      return {
        text: 'var(--cobalt-ice)',
        bg: 'var(--cobalt-tint)',
        border: 'var(--cobalt-border)',
        bar: 'var(--cobalt-bright)',
      };
    case 'vermilion':
      return {
        text: 'var(--vermilion)',
        bg: 'var(--vermilion-bg)',
        border: 'var(--vermilion-border)',
        bar: 'var(--vermilion)',
      };
  }
}

function probeTone(prob: number): 'emerald' | 'amber' | 'vermilion' {
  if (prob >= 0.72) return 'emerald';
  if (prob >= 0.55) return 'amber';
  return 'vermilion';
}

function classifyQuadrantFromCoords(
  taste: number,
  conversion: number
): ConversionCraftQuadrant {
  const highTaste = taste >= 70;
  const highConversion = conversion >= 70;
  if (highTaste && highConversion) return 'high_yield_craft';
  if (highTaste && !highConversion) return 'pretty_slop';
  if (!highTaste && highConversion) return 'functional_draft';
  return 'needs_overhaul';
}

function buildConversionFixPrompt(
  result: ConversionAndBrandAuditResult,
  effectiveTaste: number,
  activeQuadrant: ConversionCraftQuadrant,
  brandSummary?: string
): string {
  const failingProbes = result.probes
    .filter((p) => !p.passed || p.passProb < 0.72)
    .sort((a, b) => a.passProb - b.passProb);

  const targetProbes =
    failingProbes.length > 0
      ? failingProbes
      : [...result.probes].sort((a, b) => a.passProb - b.passProb).slice(0, 3);

  const quadrantInfo = QUADRANT_META[activeQuadrant];
  const lines: string[] = [
    `Fix the Conversion Psychology, Copy Specificity & Brand Drift gaps identified by Decisions API v2:`,
    `- Current Quadrant: ${quadrantInfo.label} (Taste Index: ${effectiveTaste.toFixed(0)}/100, Conversion Readiness: ${result.conversionReadinessScore.toFixed(1)}/100, Brand Drift L2 Norm: ${result.brandDriftNorm.toFixed(2)}).`,
  ];

  if (brandSummary && brandSummary.trim()) {
    lines.push(`- Brand Context: ${brandSummary.trim()}`);
  }

  lines.push('', 'Priority Probes to Remediate:');
  for (const probe of targetProbes) {
    const pct = `${(probe.passProb * 100).toFixed(0)}%`;
    const hint =
      PROBE_FIX_HINTS[probe.key] ??
      `Significantly strengthen "${probe.label}" to clear the 75%+ calibrated probability threshold.`;
    lines.push(`- [${pct}] ${probe.label}: ${hint}`);
  }

  lines.push(
    '',
    'Preserve existing working interactions and layout stability while elevating above-the-fold clarity, CTA contrast, authentic domain copy, and 60/30/10 brand token discipline.'
  );

  return lines.join('\n');
}

export function ConversionJudgeModal({
  open,
  onClose,
  tasteScore,
  baselineScreenshotUrl,
  finalScreenshotUrl,
  brandSummary,
  onApplyConversionFix,
}: ConversionJudgeModalProps) {
  const [auditResult, setAuditResult] =
    useState<ConversionAndBrandAuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [pairwiseResult, setPairwiseResult] =
    useState<PairwiseJudgeResult | null>(null);
  const [pairwiseLoading, setPairwiseLoading] = useState(false);
  const [pairwiseError, setPairwiseError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const runConversionAudit = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAuditLoading(true);
    setAuditError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/decisions/conversion-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandSummary: brandSummary?.trim() || undefined,
        }),
        signal: controller.signal,
      });

      const payload: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : `Conversion audit failed with HTTP ${res.status}`;
        throw new Error(message);
      }

      setAuditResult(normalizeConversionAudit(payload));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setAuditError(
        err instanceof Error ? err.message : 'Unable to run conversion audit.'
      );
    } finally {
      if (abortRef.current === controller) {
        setAuditLoading(false);
      }
    }
  }, [brandSummary]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }
    void runConversionAudit();
    return () => {
      abortRef.current?.abort();
    };
  }, [open, runConversionAudit]);

  const canRunPairwise = Boolean(baselineScreenshotUrl && finalScreenshotUrl);

  const runPairwiseJudge = useCallback(async () => {
    if (!baselineScreenshotUrl || !finalScreenshotUrl) return;
    setPairwiseLoading(true);
    setPairwiseError(null);

    try {
      const [baselineBase64, candidateBase64] = await Promise.all([
        fetchUrlAsBase64(baselineScreenshotUrl),
        fetchUrlAsBase64(finalScreenshotUrl),
      ]);

      const res = await fetch(`${BACKEND_URL}/api/decisions/pairwise-judge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baselineBase64,
          candidateBase64,
          brandSummary: brandSummary?.trim() || undefined,
        }),
      });

      const payload: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : `Pairwise A/B judge failed with HTTP ${res.status}`;
        throw new Error(message);
      }

      setPairwiseResult(normalizePairwiseJudge(payload));
    } catch (err) {
      setPairwiseError(
        err instanceof Error
          ? err.message
          : 'Unable to run blind pairwise A/B tournament.'
      );
    } finally {
      setPairwiseLoading(false);
    }
  }, [baselineScreenshotUrl, finalScreenshotUrl, brandSummary]);

  // Effective X-axis Taste Index: prefer explicit tasteScore prop, otherwise derive from (1 - brandDriftNorm)*100
  const effectiveTasteScore = useMemo(() => {
    if (typeof tasteScore === 'number' && Number.isFinite(tasteScore)) {
      return clamp(tasteScore, 0, 100);
    }
    if (auditResult) {
      return clamp(Number(((1 - auditResult.brandDriftNorm) * 100).toFixed(1)), 0, 100);
    }
    return 72;
  }, [tasteScore, auditResult]);

  const activeQuadrant: ConversionCraftQuadrant = useMemo(() => {
    if (!auditResult) return 'high_yield_craft';
    if (typeof tasteScore === 'number' && Number.isFinite(tasteScore)) {
      return classifyQuadrantFromCoords(
        effectiveTasteScore,
        auditResult.conversionReadinessScore
      );
    }
    return auditResult.quadrant;
  }, [auditResult, tasteScore, effectiveTasteScore]);

  const quadrantMeta = QUADRANT_META[activeQuadrant];
  const quadrantTone = toneStyles(quadrantMeta.tone);

  const failingProbeCount = useMemo(() => {
    if (!auditResult) return 0;
    return auditResult.probes.filter((p) => !p.passed).length;
  }, [auditResult]);

  const handleApplyFix = useCallback(() => {
    if (!auditResult) return;
    const prompt = buildConversionFixPrompt(
      auditResult,
      effectiveTasteScore,
      activeQuadrant,
      brandSummary
    );
    onApplyConversionFix(prompt);
    onClose();
  }, [
    auditResult,
    effectiveTasteScore,
    activeQuadrant,
    brandSummary,
    onApplyConversionFix,
    onClose,
  ]);

  // SVG Quadrant Chart geometry
  const chart = {
    viewW: 440,
    viewH: 300,
    padLeft: 48,
    padRight: 20,
    padTop: 18,
    padBottom: 40,
  };
  const plotW = chart.viewW - chart.padLeft - chart.padRight;
  const plotH = chart.viewH - chart.padTop - chart.padBottom;
  const thresholdX = chart.padLeft + (70 / 100) * plotW;
  const thresholdY = chart.padTop + (1 - 70 / 100) * plotH;
  const dotX = chart.padLeft + (effectiveTasteScore / 100) * plotW;
  const dotY =
    chart.padTop +
    (1 - (auditResult?.conversionReadinessScore ?? 0) / 100) * plotH;

  const driftPct = auditResult ? Math.round(auditResult.brandDriftNorm * 100) : 0;
  const driftTone = !auditResult
    ? toneStyles('cobalt')
    : auditResult.brandDriftNorm <= 0.3
      ? toneStyles('emerald')
      : auditResult.brandDriftNorm <= 0.5
        ? toneStyles('amber')
        : toneStyles('vermilion');

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      widthClass="w-[min(95vw,1000px)]"
      title="Decisions API v2 · Conversion × Taste & Blind A/B Judge"
      subtitle="Zero-output-token calibrated UX psychology probes, Pretty-Slop quadrant detection & position-swapped Bradley-Terry Elo judging."
    >
      <div className="flex flex-col gap-5">
        {/* Top Action & Telemetry Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5 text-[12px]">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium"
              style={{
                color: 'var(--cobalt-ice)',
                background: 'var(--cobalt-tint)',
                borderColor: 'var(--cobalt-border)',
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              gemini-decision-1 · 0 output tokens
            </span>
            {auditResult && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-1 font-mono text-[11px] text-[var(--ink-secondary)]">
                  {auditResult.latencyMs}ms
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-1 font-mono text-[11px] text-[var(--ink-secondary)]">
                  {auditResult.probes.length} calibrated probes
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runConversionAudit()}
              disabled={auditLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-pill-hover)] disabled:opacity-50"
            >
              {auditLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Re-Run Conversion Audit
            </button>

            <button
              type="button"
              onClick={handleApplyFix}
              disabled={!auditResult || auditLoading}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-45"
              style={{
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-ink)',
              }}
            >
              <Zap className="h-3.5 w-3.5" />
              Fix Conversion &amp; Copy Gaps
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {auditError && (
          <div
            className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-[13px]"
            style={{
              background: 'var(--vermilion-bg)',
              borderColor: 'var(--vermilion-border)',
              color: 'var(--vermilion)',
            }}
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Conversion Audit Failed</p>
                <p className="mt-0.5 text-[12px] opacity-90">{auditError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void runConversionAudit()}
              className="shrink-0 rounded-full border border-current px-3 py-1 text-[11px] font-medium hover:opacity-80"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {auditLoading && !auditResult && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] py-16 text-center">
            <Loader2
              className="h-7 w-7 animate-spin"
              style={{ color: 'var(--cobalt-ice)' }}
            />
            <div>
              <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                Running 10 Calibrated Conversion &amp; Brand Drift Probes…
              </p>
              <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                Evaluating above-the-fold 3-second clarity, CTA salience, copy specificity &amp; 60/30/10 palette fidelity.
              </p>
            </div>
          </div>
        )}

        {/* Main 2-Column Analytics Grid */}
        {auditResult && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Left Column: 2D Quadrant Chart + Brand Drift Norm Meter */}
            <div className="flex flex-col gap-4 lg:col-span-6">
              {/* 2D SVG Quadrant Chart */}
              <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                      <Compass className="h-3.5 w-3.5" />
                      Conversion × Taste Quadrant
                    </div>
                    <div className="mt-1 flex items-baseline gap-2.5">
                      <span className="font-mono text-[26px] font-semibold tracking-tight text-[var(--ink-primary)] tabular-nums">
                        {auditResult.conversionReadinessScore.toFixed(1)}
                      </span>
                      <span className="text-[12px] text-[var(--ink-secondary)]">
                        / 100 Conversion Readiness
                      </span>
                    </div>
                  </div>

                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold"
                    style={{
                      color: quadrantTone.text,
                      background: quadrantTone.bg,
                      borderColor: quadrantTone.border,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: quadrantTone.bar }}
                    />
                    {quadrantMeta.label}
                  </span>
                </div>

                {/* SVG Plot */}
                <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2">
                  <svg
                    viewBox={`0 0 ${chart.viewW} ${chart.viewH}`}
                    className="h-auto w-full select-none"
                    role="img"
                    aria-label={`Conversion versus Taste quadrant plot: Taste Index ${effectiveTasteScore.toFixed(1)}, Conversion Readiness ${auditResult.conversionReadinessScore.toFixed(1)}, Quadrant ${quadrantMeta.label}`}
                  >
                    {/* 4 Quadrant Tinted Zones */}
                    {/* Top-Left: Functional Draft */}
                    <rect
                      x={chart.padLeft}
                      y={chart.padTop}
                      width={thresholdX - chart.padLeft}
                      height={thresholdY - chart.padTop}
                      fill="var(--cobalt-tint)"
                      opacity={activeQuadrant === 'functional_draft' ? 0.55 : 0.2}
                    />
                    {/* Top-Right: High-Yield Craft */}
                    <rect
                      x={thresholdX}
                      y={chart.padTop}
                      width={chart.padLeft + plotW - thresholdX}
                      height={thresholdY - chart.padTop}
                      fill="var(--emerald-bg)"
                      opacity={activeQuadrant === 'high_yield_craft' ? 0.9 : 0.35}
                    />
                    {/* Bottom-Left: Needs Overhaul */}
                    <rect
                      x={chart.padLeft}
                      y={thresholdY}
                      width={thresholdX - chart.padLeft}
                      height={chart.padTop + plotH - thresholdY}
                      fill="var(--vermilion-bg)"
                      opacity={activeQuadrant === 'needs_overhaul' ? 0.85 : 0.25}
                    />
                    {/* Bottom-Right: Pretty Slop */}
                    <rect
                      x={thresholdX}
                      y={thresholdY}
                      width={chart.padLeft + plotW - thresholdX}
                      height={chart.padTop + plotH - thresholdY}
                      fill="var(--amber-bg)"
                      opacity={activeQuadrant === 'pretty_slop' ? 0.9 : 0.3}
                    />

                    {/* Minor Gridlines (25, 50, 75) */}
                    {[25, 50, 75].map((tick) => {
                      const gx = chart.padLeft + (tick / 100) * plotW;
                      const gy = chart.padTop + (1 - tick / 100) * plotH;
                      return (
                        <g key={tick}>
                          <line
                            x1={gx}
                            y1={chart.padTop}
                            x2={gx}
                            y2={chart.padTop + plotH}
                            stroke="var(--border-subtle)"
                            strokeWidth={1}
                          />
                          <line
                            x1={chart.padLeft}
                            y1={gy}
                            x2={chart.padLeft + plotW}
                            y2={gy}
                            stroke="var(--border-subtle)"
                            strokeWidth={1}
                          />
                        </g>
                      );
                    })}

                    {/* Outer Plot Border */}
                    <rect
                      x={chart.padLeft}
                      y={chart.padTop}
                      width={plotW}
                      height={plotH}
                      fill="none"
                      stroke="var(--border-strong)"
                      strokeWidth={1}
                    />

                    {/* 70/70 Quadrant Threshold Lines */}
                    <line
                      x1={thresholdX}
                      y1={chart.padTop}
                      x2={thresholdX}
                      y2={chart.padTop + plotH}
                      stroke="var(--ink-muted)"
                      strokeWidth={1.2}
                      strokeDasharray="4 4"
                    />
                    <line
                      x1={chart.padLeft}
                      y1={thresholdY}
                      x2={chart.padLeft + plotW}
                      y2={thresholdY}
                      stroke="var(--ink-muted)"
                      strokeWidth={1.2}
                      strokeDasharray="4 4"
                    />

                    {/* Quadrant Corner Labels */}
                    <text
                      x={chart.padLeft + 10}
                      y={chart.padTop + 18}
                      fill="var(--cobalt-ice)"
                      fontSize={10}
                      fontWeight={600}
                      opacity={activeQuadrant === 'functional_draft' ? 1 : 0.7}
                    >
                      Functional Draft
                    </text>
                    <text
                      x={chart.padLeft + plotW - 10}
                      y={chart.padTop + 18}
                      textAnchor="end"
                      fill="var(--emerald)"
                      fontSize={10}
                      fontWeight={600}
                      opacity={activeQuadrant === 'high_yield_craft' ? 1 : 0.75}
                    >
                      High-Yield Craft
                    </text>
                    <text
                      x={chart.padLeft + 10}
                      y={chart.padTop + plotH - 10}
                      fill="var(--vermilion)"
                      fontSize={10}
                      fontWeight={600}
                      opacity={activeQuadrant === 'needs_overhaul' ? 1 : 0.7}
                    >
                      Needs Overhaul
                    </text>
                    <text
                      x={chart.padLeft + plotW - 10}
                      y={chart.padTop + plotH - 10}
                      textAnchor="end"
                      fill="var(--amber)"
                      fontSize={10}
                      fontWeight={600}
                      opacity={activeQuadrant === 'pretty_slop' ? 1 : 0.75}
                    >
                      Pretty Slop
                    </text>

                    {/* Axis Tick Labels */}
                    {[0, 50, 70, 100].map((tick) => {
                      const tx = chart.padLeft + (tick / 100) * plotW;
                      const ty = chart.padTop + (1 - tick / 100) * plotH;
                      return (
                        <g key={`lbl-${tick}`}>
                          <text
                            x={tx}
                            y={chart.padTop + plotH + 15}
                            textAnchor="middle"
                            fill="var(--ink-muted)"
                            fontSize={10}
                            fontFamily="var(--font-mono)"
                          >
                            {tick}
                          </text>
                          <text
                            x={chart.padLeft - 8}
                            y={ty + 3}
                            textAnchor="end"
                            fill="var(--ink-muted)"
                            fontSize={10}
                            fontFamily="var(--font-mono)"
                          >
                            {tick}
                          </text>
                        </g>
                      );
                    })}

                    {/* Axis Titles */}
                    <text
                      x={chart.padLeft + plotW / 2}
                      y={chart.viewH - 6}
                      textAnchor="middle"
                      fill="var(--ink-secondary)"
                      fontSize={11}
                      fontWeight={500}
                    >
                      Taste Index ({typeof tasteScore === 'number' ? 'Composite' : '1 − Drift'}) →
                    </text>
                    <text
                      x={14}
                      y={chart.padTop + plotH / 2}
                      textAnchor="middle"
                      fill="var(--ink-secondary)"
                      fontSize={11}
                      fontWeight={500}
                      transform={`rotate(-90 14 ${chart.padTop + plotH / 2})`}
                    >
                      Conversion Readiness →
                    </text>

                    {/* Crosshair Guide to Plotted Dot */}
                    <line
                      x1={dotX}
                      y1={dotY}
                      x2={dotX}
                      y2={chart.padTop + plotH}
                      stroke={quadrantTone.bar}
                      strokeWidth={1}
                      strokeDasharray="2 3"
                      opacity={0.55}
                    />
                    <line
                      x1={chart.padLeft}
                      y1={dotY}
                      x2={dotX}
                      y2={dotY}
                      stroke={quadrantTone.bar}
                      strokeWidth={1}
                      strokeDasharray="2 3"
                      opacity={0.55}
                    />

                    {/* Plotted App Dot with Halo */}
                    <circle
                      cx={dotX}
                      cy={dotY}
                      r={13}
                      fill={quadrantTone.bar}
                      opacity={0.18}
                    />
                    <circle
                      cx={dotX}
                      cy={dotY}
                      r={6.5}
                      fill={quadrantTone.bar}
                      stroke="var(--bg-card)"
                      strokeWidth={2}
                    />

                    {/* Coordinate Callout Pill */}
                    {(() => {
                      const label = `(${effectiveTasteScore.toFixed(0)}, ${auditResult.conversionReadinessScore.toFixed(0)})`;
                      const boxW = 66;
                      const boxH = 20;
                      const placeLeft = dotX > chart.padLeft + plotW - 90;
                      const bx = placeLeft ? dotX - boxW - 10 : dotX + 10;
                      const by = clamp(
                        dotY - boxH / 2,
                        chart.padTop + 4,
                        chart.padTop + plotH - boxH - 4
                      );
                      return (
                        <g>
                          <rect
                            x={bx}
                            y={by}
                            width={boxW}
                            height={boxH}
                            rx={6}
                            fill="var(--bg-card-elevated)"
                            stroke={quadrantTone.border}
                            strokeWidth={1}
                          />
                          <text
                            x={bx + boxW / 2}
                            y={by + 13.5}
                            textAnchor="middle"
                            fill="var(--ink-primary)"
                            fontSize={10}
                            fontWeight={600}
                            fontFamily="var(--font-mono)"
                          >
                            {label}
                          </text>
                        </g>
                      );
                    })()}
                  </svg>
                </div>

                <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                  {quadrantMeta.summary}
                </p>
              </div>

              {/* Brand Drift L2 Norm Meter */}
              <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                    <Gauge className="h-3.5 w-3.5" />
                    Brand Drift L2 Norm
                  </div>
                  <span
                    className="rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums"
                    style={{
                      color: driftTone.text,
                      background: driftTone.bg,
                      borderColor: driftTone.border,
                    }}
                  >
                    ‖drift‖₂ = {auditResult.brandDriftNorm.toFixed(3)} ·{' '}
                    {auditResult.brandDriftNorm <= 0.3
                      ? 'Locked'
                      : auditResult.brandDriftNorm <= 0.5
                        ? 'Moderate Drift'
                        : 'High Slop Drift'}
                  </span>
                </div>

                <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${clamp(driftPct, 2, 100)}%`,
                      background: driftTone.bar,
                    }}
                  />
                  {/* 0.30 Target Gate Marker */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-[var(--ink-primary)] opacity-70"
                    style={{ left: '30%' }}
                    title="0.30 Brand Lock Threshold"
                  />
                </div>

                <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[var(--ink-muted)]">
                  <span>0.00 (Exact DNA)</span>
                  <span>0.30 Gate</span>
                  <span>1.00 (Total Drift)</span>
                </div>
              </div>
            </div>

            {/* Right Column: 10 UX & Conversion Psychology Probe Bars */}
            <div className="flex flex-col rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-4 lg:col-span-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                  <TrendingUp className="h-3.5 w-3.5" />
                  10 UX &amp; Conversion Psychology Probes
                </div>
                <span className="font-mono text-[11px] text-[var(--ink-secondary)] tabular-nums">
                  {auditResult.probes.length - failingProbeCount}/
                  {auditResult.probes.length} passed
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2.5">
                {auditResult.probes.map((probe) => {
                  const pct = Math.round(probe.passProb * 100);
                  const tone = toneStyles(probeTone(probe.passProb));
                  return (
                    <div
                      key={probe.key}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-[12px]">
                        <div className="flex min-w-0 items-center gap-2">
                          {probe.passed ? (
                            <CheckCircle2
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: tone.text }}
                            />
                          ) : (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: tone.text }}
                            />
                          )}
                          <span className="truncate font-medium text-[var(--ink-primary)]">
                            {probe.label}
                          </span>
                        </div>
                        <span
                          className="shrink-0 font-mono text-[12px] font-semibold tabular-nums"
                          style={{ color: tone.text }}
                        >
                          {pct}%
                        </span>
                      </div>

                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${clamp(pct, 2, 100)}%`,
                            background: tone.bar,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Blind Pairwise Bradley-Terry A/B Judge Card */}
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl border"
                style={{
                  background: 'var(--cobalt-tint)',
                  borderColor: 'var(--cobalt-border)',
                  color: 'var(--cobalt-ice)',
                }}
              >
                <Swords className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-[14px] font-medium text-[var(--ink-primary)]">
                  Blind Pairwise Bradley-Terry A/B Judge
                </h3>
                <p className="text-[12px] text-[var(--ink-secondary)]">
                  Evaluates [Baseline, Candidate] and [Candidate, Baseline] in parallel to eliminate positional slot bias &amp; compute ΔElo.
                </p>
              </div>
            </div>

            {canRunPairwise && (
              <button
                type="button"
                onClick={() => void runPairwiseJudge()}
                disabled={pairwiseLoading}
                className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
                style={{
                  color: 'var(--cobalt-ice)',
                  background: 'var(--cobalt-tint)',
                  borderColor: 'var(--cobalt-border)',
                }}
              >
                {pairwiseLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Scale className="h-3.5 w-3.5" />
                )}
                Run Blind A/B Elo Tournament
              </button>
            )}
          </div>

          {!canRunPairwise && (
            <div className="mt-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-[12px] text-[var(--ink-muted)]">
              Capture both a Baseline and Final screenshot in a build or polish run to unlock the position-swapped Blind A/B Elo Tournament.
            </div>
          )}

          {pairwiseError && (
            <div
              className="mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12px]"
              style={{
                background: 'var(--vermilion-bg)',
                borderColor: 'var(--vermilion-border)',
                color: 'var(--vermilion)',
              }}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{pairwiseError}</span>
            </div>
          )}

          {pairwiseResult && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Debiased Win Probability */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  Debiased Win Prob
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className="font-mono text-[22px] font-semibold tabular-nums"
                    style={{
                      color:
                        pairwiseResult.winner === 'candidate'
                          ? 'var(--emerald)'
                          : pairwiseResult.winner === 'baseline'
                            ? 'var(--vermilion)'
                            : 'var(--amber)',
                    }}
                  >
                    {(pairwiseResult.debiasedCandidateWinProb * 100).toFixed(1)}%
                  </span>
                  <span className="text-[11px] capitalize text-[var(--ink-secondary)]">
                    {pairwiseResult.winner === 'tie'
                      ? 'Tie'
                      : `${pairwiseResult.winner} wins`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${clamp(
                        Math.round(pairwiseResult.debiasedCandidateWinProb * 100),
                        2,
                        100
                      )}%`,
                      background:
                        pairwiseResult.winner === 'candidate'
                          ? 'var(--emerald)'
                          : pairwiseResult.winner === 'baseline'
                            ? 'var(--vermilion)'
                            : 'var(--amber)',
                    }}
                  />
                </div>
              </div>

              {/* Signed ΔElo */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  Bradley-Terry ΔElo
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className="font-mono text-[22px] font-semibold tabular-nums"
                    style={{
                      color:
                        pairwiseResult.eloDelta > 0
                          ? 'var(--emerald)'
                          : pairwiseResult.eloDelta < 0
                            ? 'var(--vermilion)'
                            : 'var(--ink-primary)',
                    }}
                  >
                    {pairwiseResult.eloDelta > 0 ? '+' : ''}
                    {pairwiseResult.eloDelta.toFixed(1)}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--ink-muted)]">
                    Elo
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[10px] text-[var(--ink-muted)]">
                  {pairwiseResult.latencyMs}ms · 0 output tokens
                </p>
              </div>

              {/* Forward & Reverse Slot Scores */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                  Slot-Swapped Scores
                </div>
                <div className="mt-2 flex flex-col gap-1.5 font-mono text-[12px] tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-secondary)]">
                      Forward [A, B]
                    </span>
                    <span className="font-semibold text-[var(--ink-primary)]">
                      {(pairwiseResult.forwardWinProb * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-secondary)]">
                      Reverse [B, A]
                    </span>
                    <span className="font-semibold text-[var(--ink-primary)]">
                      {(pairwiseResult.reverseWinProb * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Regression Veto Gate */}
              <div
                className="rounded-xl border p-3.5"
                style={{
                  background: pairwiseResult.rejectedAsRegression
                    ? 'var(--vermilion-bg)'
                    : 'var(--emerald-bg)',
                  borderColor: pairwiseResult.rejectedAsRegression
                    ? 'var(--vermilion-border)'
                    : 'var(--emerald-border)',
                }}
              >
                <div
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]"
                  style={{
                    color: pairwiseResult.rejectedAsRegression
                      ? 'var(--vermilion)'
                      : 'var(--emerald)',
                  }}
                >
                  {pairwiseResult.rejectedAsRegression ? (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  Regression Veto
                </div>
                <div
                  className="mt-1.5 text-[14px] font-semibold"
                  style={{
                    color: pairwiseResult.rejectedAsRegression
                      ? 'var(--vermilion)'
                      : 'var(--emerald)',
                  }}
                >
                  {pairwiseResult.rejectedAsRegression
                    ? 'VETOED · Regression'
                    : 'PASSED · Cleared'}
                </div>
                <p className="mt-1 font-mono text-[11px] text-[var(--ink-secondary)] tabular-nums">
                  P(regression) = {(pairwiseResult.regressionProb * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </NativeDialog>
  );
}
