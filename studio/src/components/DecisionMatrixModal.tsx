'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Grid3X3,
  Layers,
  Loader2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { BACKEND_URL, resolveBackendUrl } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

export type DeepDecisionAuditMode = '900_single_pass' | '1800_dual_key_sharded';

export interface DeepDecisionPillarSummary {
  id: string;
  label: string;
  total: number;
  passed: number;
  avgConfidence: number;
}

export interface DeepDecisionSpatialCell {
  row: number;
  col: number;
  passProb: number;
  label: string;
}

export interface DeepDecisionFailure {
  key: string;
  pillar: string;
  zone: string;
  check: string;
  passProb: number;
}

export interface DeepDecisionAuditResult {
  mode: DeepDecisionAuditMode;
  totalDecisions: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  latencyMs: number;
  outputTokens: 0;
  pillars: DeepDecisionPillarSummary[];
  spatialHeatmap: DeepDecisionSpatialCell[][];
  matrixDots: number[];
  topFailures: DeepDecisionFailure[];
  surgicalFixPrompt: string;
}

export interface DecisionMatrixModalProps {
  open: boolean;
  onClose: () => void;
  screenshotUrl?: string;
  screenshotBase64?: string;
  workspaceId?: string;
  brandSummary?: string;
  onApplySurgicalFix: (surgicalPrompt: string) => void;
}

const PILLAR_MOSAIC_LABELS = [
  'Spatial Grid',
  'Typography Micro',
  'WCAG Contrast',
  'Anti-Slop Shield',
  'Swiss Rhythm',
  'Interaction UX',
  'Domain & Art',
  'Responsive',
  'Reference DNA',
] as const;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read screenshot blob as base64'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

function cellOverlayClass(passProb: number): string {
  if (passProb >= 0.6) {
    return 'border border-emerald-400/20 bg-transparent hover:bg-emerald-400/15';
  }
  if (passProb >= 0.45) {
    return 'border border-amber-400/50 bg-amber-400/20 hover:bg-amber-400/30';
  }
  return 'border-2 border-[var(--vermilion)] bg-red-500/25 hover:bg-red-500/35';
}

function dotColorClass(pct: number): string {
  if (pct >= 60) return 'bg-emerald-400/85';
  if (pct >= 45) return 'bg-amber-400/85';
  return 'bg-[var(--vermilion)]';
}

export function DecisionMatrixModal({
  open,
  onClose,
  screenshotUrl,
  screenshotBase64,
  workspaceId,
  brandSummary,
  onApplySurgicalFix,
}: DecisionMatrixModalProps) {
  const [result, setResult] = useState<DeepDecisionAuditResult | null>(null);
  const [loadingMode, setLoadingMode] = useState<DeepDecisionAuditMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedImgUrl, setResolvedImgUrl] = useState<string | undefined>(undefined);
  const [hoveredCell, setHoveredCell] = useState<DeepDecisionSpatialCell | null>(null);
  const [hoveredDot, setHoveredDot] = useState<{ index: number; pct: number } | null>(null);

  const lastAutoSignatureRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const displayImgUrl = useMemo(() => {
    if (resolvedImgUrl) return resolvedImgUrl;
    if (screenshotUrl) return resolveBackendUrl(screenshotUrl) || screenshotUrl;
    if (screenshotBase64) {
      return screenshotBase64.startsWith('data:')
        ? screenshotBase64
        : `data:image/png;base64,${screenshotBase64}`;
    }
    return undefined;
  }, [resolvedImgUrl, screenshotUrl, screenshotBase64]);

  const resolveScreenshotInput = useCallback(
    async (signal: AbortSignal): Promise<{ base64: string; imgUrl?: string }> => {
      if (screenshotBase64 && screenshotBase64.trim().length > 32) {
        const imgUrl = screenshotBase64.startsWith('data:')
          ? screenshotBase64
          : `data:image/png;base64,${screenshotBase64}`;
        return { base64: screenshotBase64, imgUrl };
      }

      if (screenshotUrl?.startsWith('data:')) {
        return { base64: screenshotUrl, imgUrl: screenshotUrl };
      }

      const candidateUrl = resolveBackendUrl(screenshotUrl);
      if (candidateUrl) {
        try {
          const imgRes = await fetch(candidateUrl, { signal, cache: 'no-store' });
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            if (blob.size > 64) {
              const dataUrl = await blobToDataUrl(blob);
              return { base64: dataUrl, imgUrl: candidateUrl };
            }
          }
        } catch (err) {
          if (signal.aborted) throw err;
          // Fall back to live snapshot capture below
        }
      }

      const captureRes = await fetch(`${BACKEND_URL}/api/snapshot/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeBase64: true }),
        signal,
      });

      if (!captureRes.ok) {
        throw new Error(`Failed to capture live viewport screenshot (${captureRes.status})`);
      }

      const captureData = (await captureRes.json()) as {
        desktopBase64?: string;
        screenshotUrl?: string;
      };

      if (!captureData.desktopBase64) {
        throw new Error('Snapshot capture returned no desktop screenshot data');
      }

      const resolved =
        resolveBackendUrl(captureData.screenshotUrl) ||
        (captureData.desktopBase64.startsWith('data:')
          ? captureData.desktopBase64
          : `data:image/png;base64,${captureData.desktopBase64}`);

      return { base64: captureData.desktopBase64, imgUrl: resolved };
    },
    [screenshotBase64, screenshotUrl]
  );

  const runAudit = useCallback(
    async (mode: DeepDecisionAuditMode) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoadingMode(mode);
      setError(null);

      try {
        const { base64, imgUrl } = await resolveScreenshotInput(controller.signal);
        if (imgUrl) {
          setResolvedImgUrl(imgUrl);
        }

        const res = await fetch(`${BACKEND_URL}/api/decisions/deep-audit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            screenshotBase64: base64,
            workspaceId,
            brandSummary,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let message = `Deep audit failed (${res.status})`;
          try {
            const errJson = (await res.json()) as { error?: string; message?: string };
            if (errJson.error) message = errJson.error;
            else if (errJson.message) message = errJson.message;
          } catch {
            // Keep HTTP status message
          }
          throw new Error(message);
        }

        const data = (await res.json()) as DeepDecisionAuditResult;
        if (!controller.signal.aborted) {
          setResult(data);
          setHoveredCell(null);
          setHoveredDot(null);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to run 900-probe Decisions API X-Ray audit.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingMode(null);
        }
      }
    },
    [brandSummary, resolveScreenshotInput, workspaceId]
  );

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
      return;
    }

    const signature = `${workspaceId || 'default'}::${screenshotUrl || ''}::${screenshotBase64 ? screenshotBase64.slice(0, 48) : ''}`;
    if (!result || lastAutoSignatureRef.current !== signature) {
      lastAutoSignatureRef.current = signature;
      void runAudit('900_single_pass');
    }
  }, [open, result, runAudit, screenshotBase64, screenshotUrl, workspaceId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const worstCell = useMemo(() => {
    if (!result?.spatialHeatmap?.length) return null;
    const flat = result.spatialHeatmap.flat();
    return flat.reduce<DeepDecisionSpatialCell | null>(
      (min, cell) => (!min || cell.passProb < min.passProb ? cell : min),
      null
    );
  }, [result]);

  const activeCell = hoveredCell ?? worstCell;

  const handleApplyFix = () => {
    if (!result?.surgicalFixPrompt) return;
    onApplySurgicalFix(result.surgicalFixPrompt);
    onClose();
  };

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      widthClass="w-[min(95vw,1040px)]"
      title="Decisions API · 900-Probe Spatial X-Ray"
      subtitle="Calibrated zero-output-token Noul probability matrix across 10×10 viewport tiles and 9 UI engineering pillars."
    >
      <div className="space-y-4">
        {/* Control & Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runAudit('900_single_pass')}
              disabled={loadingMode !== null}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
                result?.mode === '900_single_pass'
                  ? 'border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--ink-primary)]'
                  : 'border-[var(--border-pill)] bg-[var(--bg-pill)] text-[var(--ink-secondary)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {loadingMode === '900_single_pass' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--cobalt-bright)]" />
              ) : (
                <Grid3X3 className="h-3.5 w-3.5 text-[var(--cobalt-bright)]" />
              )}
              <span>Run 900-Probe Pass</span>
            </button>

            <button
              type="button"
              onClick={() => void runAudit('1800_dual_key_sharded')}
              disabled={loadingMode !== null}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
                result?.mode === '1800_dual_key_sharded'
                  ? 'border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--ink-primary)]'
                  : 'border-[var(--border-pill)] bg-[var(--bg-pill)] text-[var(--ink-secondary)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {loadingMode === '1800_dual_key_sharded' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--amber)]" />
              ) : (
                <Layers className="h-3.5 w-3.5 text-[var(--amber)]" />
              )}
              <span>Push 1,800 Sharded (Break 1K Cap)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleApplyFix}
            disabled={!result?.surgicalFixPrompt || loadingMode !== null}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--btn-primary-bg)] px-4 py-1.5 text-[12px] font-semibold text-[var(--btn-primary-ink)] shadow-[var(--cobalt-glow)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>⚡ Auto-Fix Failing Probes →</span>
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-3.5 py-2.5 text-[12px] text-[var(--vermilion)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">900-Probe X-Ray Error</p>
              <p className="mt-0.5 opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Two-Column Diagnostic Stage */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left Column: 10x10 Spatial Viewport Heatmap + 30x30 Probability Mosaic */}
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                    10×10 Spatial Viewport Heatmap
                  </span>
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[9.5px] text-[var(--ink-muted)]">
                    100 Localized Probes
                  </span>
                </div>
                <div className="flex items-center gap-2.5 font-mono text-[9.5px] text-[var(--ink-secondary)]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-emerald-400/80" />
                    &ge;60%
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-amber-400/85" />
                    45–59%
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-xs bg-[var(--vermilion)]" />
                    &lt;45%
                  </span>
                </div>
              </div>

              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-void)]">
                {displayImgUrl ? (
                  <img
                    src={displayImgUrl}
                    alt="Audited UI viewport screenshot"
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[12px] text-[var(--ink-muted)]">
                    Capturing live preview viewport...
                  </div>
                )}

                {result?.spatialHeatmap && result.spatialHeatmap.length === 10 && (
                  <div
                    className="absolute inset-0 grid grid-cols-10 grid-rows-10"
                    role="grid"
                    aria-label="10 by 10 spatial craft probability grid"
                  >
                    {result.spatialHeatmap.map((rowCells) =>
                      rowCells.map((cell) => {
                        const pct = Math.round(cell.passProb * 100);
                        const isSelected =
                          hoveredCell?.row === cell.row && hoveredCell?.col === cell.col;
                        return (
                          <button
                            key={`cell-${cell.row}-${cell.col}`}
                            type="button"
                            onMouseEnter={() => setHoveredCell(cell)}
                            onFocus={() => setHoveredCell(cell)}
                            onMouseLeave={() => setHoveredCell(null)}
                            title={`Cell [${cell.row},${cell.col}] · P(craft)=${pct}%`}
                            aria-label={`Cell [${cell.row},${cell.col}] · P(craft)=${pct}%`}
                            className={`relative transition-colors focus:z-10 focus:outline-none focus:ring-2 focus:ring-[var(--cobalt-ice)] ${cellOverlayClass(cell.passProb)} ${
                              isSelected ? 'ring-1 ring-white/70' : ''
                            }`}
                          >
                            {cell.passProb < 0.45 && (
                              <span className="pointer-events-none absolute right-0.5 top-0.5 rounded bg-black/75 px-1 font-mono text-[8px] font-semibold text-[var(--vermilion)]">
                                {pct}%
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {loadingMode && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-[2px]">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--cobalt-ice)]" />
                    <span className="font-mono text-[11px] font-medium text-white">
                      {loadingMode === '1800_dual_key_sharded'
                        ? 'Running 2×900 Dual-Key Sharded Decisions API...'
                        : 'Evaluating 900 calibrated Noul probes (0 output tokens)...'}
                    </span>
                  </div>
                )}
              </div>

              {/* Active Spatial Cell Readout */}
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-[10.5px]">
                {activeCell ? (
                  <>
                    <span className="truncate text-[var(--ink-secondary)]">
                      {hoveredCell ? 'Inspecting: ' : 'Weakest tile: '}
                      <strong className="text-[var(--ink-primary)]">
                        Cell [{activeCell.row},{activeCell.col}]
                      </strong>{' '}
                      (y={activeCell.row * 10}-{(activeCell.row + 1) * 10}%, x=
                      {activeCell.col * 10}-{(activeCell.col + 1) * 10}%)
                    </span>
                    <span
                      className={`shrink-0 font-semibold ${
                        activeCell.passProb >= 0.6
                          ? 'text-[var(--emerald)]'
                          : activeCell.passProb >= 0.45
                            ? 'text-[var(--amber)]'
                            : 'text-[var(--vermilion)]'
                      }`}
                    >
                      P(craft)={Math.round(activeCell.passProb * 100)}%
                    </span>
                  </>
                ) : (
                  <span className="text-[var(--ink-muted)]">
                    Hover any 10%×10% viewport cell to inspect calibrated spatial probability.
                  </span>
                )}
              </div>
            </div>

            {/* 30x30 (900-Node) Calibrated Probability Mosaic */}
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                  30×30 (900-Node) Calibrated Probability Mosaic
                </span>
                <span className="font-mono text-[10px] text-[var(--ink-secondary)]">
                  {hoveredDot
                    ? `#${hoveredDot.index + 1} · ${PILLAR_MOSAIC_LABELS[Math.min(8, Math.floor(hoveredDot.index / 100))]} · ${hoveredDot.pct}%`
                    : result
                      ? `${result.passedCount}/${result.totalDecisions} probes ≥ 50%`
                      : '900 probes'}
                </span>
              </div>

              <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[2px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-void)] p-2">
                {(result?.matrixDots ?? Array.from({ length: 900 }, () => -1)).map((pct, idx) => (
                  <div
                    key={idx}
                    onMouseEnter={() => {
                      if (pct >= 0) setHoveredDot({ index: idx, pct });
                    }}
                    onMouseLeave={() => setHoveredDot(null)}
                    title={
                      pct >= 0
                        ? `Probe #${idx + 1} (${PILLAR_MOSAIC_LABELS[Math.min(8, Math.floor(idx / 100))]}) · P(craft)=${pct}%`
                        : `Probe #${idx + 1}`
                    }
                    className={`aspect-square rounded-[2px] transition-transform hover:scale-125 ${
                      pct >= 0 ? dotColorClass(pct) : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Telemetry Strip + 9 Pillar Bars + Top Failures + Surgical Fix Prompt */}
          <div className="space-y-4 lg:col-span-5">
            {/* Telemetry Strip */}
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-2">
                <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)]">
                  <Cpu className="h-3 w-3 text-[var(--cobalt-bright)]" />
                  <span>Output Tokens</span>
                </div>
                <p className="mt-0.5 font-mono text-[15px] font-semibold text-[var(--emerald)]">
                  {result ? result.outputTokens : 0}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-2">
                <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)]">
                  <Activity className="h-3 w-3 text-[var(--cobalt-bright)]" />
                  <span>Latency</span>
                </div>
                <p className="mt-0.5 font-mono text-[15px] font-semibold text-[var(--ink-primary)]">
                  {result ? `${(result.latencyMs / 1000).toFixed(2)}s` : '—'}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-2">
                <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)]">
                  <Sparkles className="h-3 w-3 text-[var(--cobalt-bright)]" />
                  <span>Pass Rate</span>
                </div>
                <p
                  className={`mt-0.5 font-mono text-[15px] font-semibold ${
                    !result
                      ? 'text-[var(--ink-primary)]'
                      : result.passRate >= 75
                        ? 'text-[var(--emerald)]'
                        : result.passRate >= 55
                          ? 'text-[var(--amber)]'
                          : 'text-[var(--vermilion)]'
                  }`}
                >
                  {result ? `${result.passRate.toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>

            {/* 9 Engineering Pillar Bars */}
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                  9 Engineering Pillars
                </span>
                <span className="font-mono text-[9.5px] text-[var(--ink-muted)]">
                  {result
                    ? `${result.totalDecisions.toLocaleString()} Decisions (${result.mode === '1800_dual_key_sharded' ? '2×900 Shards' : '1×900 Pass'})`
                    : '100 Probes / Pillar'}
                </span>
              </div>

              <div className="space-y-2">
                {(result?.pillars ?? []).map((pillar) => {
                  const pct = Math.round((pillar.passed / Math.max(1, pillar.total)) * 100);
                  const barColor =
                    pct >= 75
                      ? 'bg-[var(--emerald)]'
                      : pct >= 55
                        ? 'bg-[var(--amber)]'
                        : 'bg-[var(--vermilion)]';
                  return (
                    <div key={pillar.id} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-[var(--ink-primary)]">
                          {pillar.label}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--ink-secondary)]">
                          {pillar.passed}/{pillar.total} · conf{' '}
                          {pillar.avgConfidence.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle-hover)]">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {!result && (
                  <p className="py-3 text-center text-[11.5px] text-[var(--ink-muted)]">
                    Awaiting calibrated Decisions API response...
                  </p>
                )}
              </div>
            </div>

            {/* Top Failing Probes */}
            <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                  Lowest-Confidence Probes
                </span>
                <span className="font-mono text-[9.5px] text-[var(--ink-muted)]">
                  Top {result?.topFailures.length ?? 0} Priority Targets
                </span>
              </div>

              <div className="studio-scroll max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {(result?.topFailures ?? []).map((failure) => {
                  const pct = Math.round(failure.passProb * 100);
                  const badgeStyle =
                    pct < 45
                      ? 'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)]'
                      : 'border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]';
                  return (
                    <div
                      key={failure.key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-[var(--ink-primary)]">
                          {failure.zone} · {failure.check}
                        </p>
                        <p className="truncate font-mono text-[9.5px] text-[var(--ink-muted)]">
                          {failure.key}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${badgeStyle}`}
                      >
                        {pct}%
                      </span>
                    </div>
                  );
                })}
                {!result && (
                  <p className="py-2 text-center text-[11.5px] text-[var(--ink-muted)]">
                    Probe ranking will populate after pass completion.
                  </p>
                )}
              </div>
            </div>

            {/* Auto-Generated Surgical Fix Prompt */}
            <div className="rounded-xl border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                  Auto-Generated Surgical Fix Prompt
                </span>
                <button
                  type="button"
                  onClick={handleApplyFix}
                  disabled={!result?.surgicalFixPrompt || loadingMode !== null}
                  className="font-mono text-[10px] font-semibold text-[var(--cobalt-ice)] underline-offset-2 hover:underline disabled:opacity-45"
                >
                  Send to Composer &rarr;
                </button>
              </div>
              <p className="max-h-24 overflow-y-auto text-[11px] leading-relaxed text-[var(--ink-secondary)]">
                {result?.surgicalFixPrompt ||
                  'Once the 900-probe spatial pass finishes, AntiSlop synthesizes a targeted Gemini 4 patch prompt citing exact failing viewport tiles and pillars.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </NativeDialog>
  );
}
