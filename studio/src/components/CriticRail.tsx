'use client';

import { useState } from 'react';
import type {
  CandidateResult,
  CriticIteration,
  DecisionMetric,
  DecisionsScorecard,
  DesignManifest,
  StreamEvent,
} from '@shared/types';
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Gauge,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { resolveBackendUrl } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

interface CriticRailProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  scorecard?: DecisionsScorecard;
  manifest?: DesignManifest;
  iterations: CriticIteration[];
  events: StreamEvent[];
  isRunning: boolean;
  thinkingBuffer: string;
}

function modelBadgeStyle(model?: string): { label: string; className: string } {
  const m = (model || '').toLowerCase();
  if (m.includes('carbon')) {
    return {
      label: 'Carbon',
      className: 'border-[#141413] bg-[#141413] text-white',
    };
  }
  if (m.includes('neon')) {
    return {
      label: 'Neon',
      className: 'border-[#B45309]/40 bg-[#FEF6EC] text-[#B45309]',
    };
  }
  if (m.includes('hydrogen')) {
    return {
      label: 'Hydrogen',
      className: 'border-[#E03E2D]/40 bg-[#FDF1EF] text-[#E03E2D]',
    };
  }
  if (m.includes('decision')) {
    return {
      label: 'Decision-1',
      className: 'border-[#15803D]/40 bg-[#EEF8F1] text-[#15803D]',
    };
  }
  if (m.includes('banana')) {
    return {
      label: 'Nano Banana 2.1',
      className: 'border-[#B45309]/40 bg-[#FEF6EC] text-[#B45309]',
    };
  }
  if (m.includes('embed')) {
    return {
      label: 'Embedding-2',
      className: 'border-[#141413]/30 bg-[#F5F3EE] text-[#141413]',
    };
  }
  if (m.includes('transcribe') || m.includes('live')) {
    return {
      label: '3.5-Transcribe',
      className: 'border-[#E03E2D]/30 bg-[#FDF1EF] text-[#E03E2D]',
    };
  }
  return {
    label: model ? model.slice(0, 14) : 'Engine',
    className: 'border-[#E5E1D8] bg-[#F5F3EE] text-[#64625D]',
  };
}

function ConvergenceSparkline({ iterations }: { iterations: CriticIteration[] }) {
  if (iterations.length === 0) return null;

  const points = iterations.map((it, idx) => ({
    label:
      it.phase === 'baseline_capture'
        ? 'B0'
        : `I${it.iteration ?? idx}`,
    taste: Math.max(0, Math.min(100, it.scorecard?.overallTasteScore ?? 0)),
    slop: Math.max(
      0,
      Math.min(10, it.scorecard?.metrics?.slopPenalty?.value ?? 0)
    ),
    passed: it.scorecard?.passedAllGates ?? false,
  }));

  const width = 264;
  const height = 74;
  const padX = 16;
  const padY = 12;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2 - 12;

  const xAt = (i: number) =>
    points.length === 1
      ? padX + plotW / 2
      : padX + (i / (points.length - 1)) * plotW;

  const yTaste = (val: number) => padY + plotH - (val / 100) * plotH;
  const ySlop = (val: number) => padY + plotH - (val / 10) * plotH;

  const tastePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yTaste(p.taste).toFixed(1)}`)
    .join(' ');
  const slopPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${ySlop(p.slop).toFixed(1)}`)
    .join(' ');

  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[#64625D]">
          Convergence Curve
        </span>
        <div className="flex items-center gap-2 font-mono text-[9px]">
          <span className="flex items-center gap-1 text-[#15803D]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#15803D]" />
            Taste
          </span>
          <span className="flex items-center gap-1 text-[#E03E2D]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E03E2D]" />
            Slop
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[74px] w-full overflow-visible"
        role="img"
        aria-label="Iteration taste and slop convergence sparkline"
      >
        {/* Reference hairlines */}
        <line
          x1={padX}
          y1={padY}
          x2={width - padX}
          y2={padY}
          stroke="#E5E1D8"
          strokeDasharray="2 2"
        />
        <line
          x1={padX}
          y1={padY + plotH}
          x2={width - padX}
          y2={padY + plotH}
          stroke="#E5E1D8"
        />

        {/* Slop penalty descending curve */}
        {points.length > 1 && (
          <path
            d={slopPath}
            fill="none"
            stroke="#E03E2D"
            strokeWidth="1.75"
            strokeDasharray="3 2"
          />
        )}

        {/* Taste score ascending curve */}
        {points.length > 1 && (
          <path
            d={tastePath}
            fill="none"
            stroke="#15803D"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <circle
              cx={xAt(i)}
              cy={ySlop(p.slop)}
              r="2.8"
              fill="#FFFFFF"
              stroke="#E03E2D"
              strokeWidth="1.5"
            />
            <circle
              cx={xAt(i)}
              cy={yTaste(p.taste)}
              r="3.4"
              fill={p.passed ? '#15803D' : '#FFFFFF'}
              stroke="#15803D"
              strokeWidth="1.8"
            />
            <text
              x={xAt(i)}
              y={height - 2}
              textAnchor="middle"
              className="fill-[#64625D] font-mono text-[8.5px]"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function CriticRail({
  collapsed,
  onToggleCollapse,
  scorecard,
  manifest,
  iterations,
  events,
  isRunning,
  thinkingBuffer,
}: CriticRailProps) {
  const [inspectCandidate, setInspectCandidate] =
    useState<CandidateResult | null>(null);

  // Latest parallel race candidates across iterations (preferring latest iteration with >1 candidates)
  const latestRaceIteration = [...iterations]
    .reverse()
    .find((it) => it.candidates && it.candidates.length > 1);
  const raceCandidates = latestRaceIteration?.candidates ?? [];

  if (collapsed) {
    return (
      <aside className="flex w-[46px] shrink-0 flex-col items-center justify-between border-l border-[#E5E1D8] bg-[#FFFFFF] py-3">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand Critic Telemetry Rail"
            aria-label="Expand Critic Telemetry Rail"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E1D8] bg-[#F5F3EE] text-[#141413] hover:border-[#141413]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="h-px w-6 bg-[#E5E1D8]" />
          <div className="flex flex-col items-center">
            <span className="font-serif text-[20px] leading-none text-[#141413]">
              {scorecard ? Math.round(scorecard.overallTasteScore) : '—'}
            </span>
            <span className="mt-1 font-mono text-[8px] uppercase text-[#64625D]">
              TASTE
            </span>
          </div>
          {scorecard && (
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                scorecard.passedAllGates ? 'bg-[#15803D]' : 'bg-[#B45309]'
              }`}
              title={
                scorecard.passedAllGates
                  ? 'All Decisions API gates passed'
                  : 'Active critic refinement'
              }
            />
          )}
        </div>
        <Gauge className="h-4 w-4 text-[#64625D]" />
      </aside>
    );
  }

  const scoreMetrics: DecisionMetric[] = scorecard
    ? [
        scorecard.metrics.aestheticMatch,
        scorecard.metrics.slopPenalty,
        scorecard.metrics.typographyCraft,
        scorecard.metrics.visualRhythm,
        scorecard.metrics.colorHarmony,
        scorecard.metrics.motionCohesion,
      ]
    : [];

  const noulMetrics: DecisionMetric[] = scorecard
    ? [
        scorecard.metrics.layoutBroken,
        scorecard.metrics.contrastFailing,
        scorecard.metrics.genericAiCliché,
        scorecard.metrics.productionReady,
      ]
    : [];

  return (
    <>
      <aside className="flex w-[324px] shrink-0 flex-col border-l border-[#E5E1D8] bg-[#FFFFFF]">
        {/* Rail Header */}
        <div className="flex items-center justify-between border-b border-[#E5E1D8] px-3.5 py-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64625D]">
                Calibrated Critic
              </span>
              {isRunning && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#E03E2D] animate-studio-pulse" />
              )}
            </div>
            <p className="font-mono text-[10px] text-[#64625D]">
              gemini-decision-1 · 12 probes
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse Critic Rail for larger canvas"
            aria-label="Collapse Critic Rail"
            className="flex h-7 w-7 items-center justify-center rounded border border-[#E5E1D8] bg-[#FAF8F4] text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable Telemetry Stack */}
        <div className="studio-scroll flex-1 space-y-3.5 overflow-y-auto px-3.5 py-3">
          {/* Headline Taste Index Card */}
          <div className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#64625D]">
                  AntiSlop Taste Index
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="font-serif text-[46px] leading-none tracking-[-0.03em] text-[#141413]">
                    {scorecard ? Math.round(scorecard.overallTasteScore) : '—'}
                  </span>
                  <span className="font-mono text-[11px] text-[#64625D]">
                    / 100
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                {scorecard ? (
                  scorecard.passedAllGates ? (
                    <span className="inline-flex items-center gap-1 rounded border border-[#15803D]/30 bg-[#EEF8F1] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#15803D]">
                      <CheckCircle2 className="h-3 w-3" />
                      GATES PASSED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded border border-[#B45309]/30 bg-[#FEF6EC] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B45309]">
                      <AlertTriangle className="h-3 w-3" />
                      CRITIC ACTIVE
                    </span>
                  )
                ) : (
                  <span className="rounded border border-[#E5E1D8] bg-white px-2 py-0.5 font-mono text-[10px] text-[#64625D]">
                    AWAITING RUN
                  </span>
                )}
                {scorecard && (
                  <span className="font-mono text-[9.5px] text-[#64625D]">
                    {Math.round(scorecard.latencyMs)}ms · 0 output tokens
                  </span>
                )}
              </div>
            </div>

            {/* Slop Penalty vs Aesthetic Match Headline Dual Metric */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[#E5E1D8] bg-white px-2.5 py-2">
                <div className="font-mono text-[9.5px] uppercase tracking-wider text-[#64625D]">
                  Slop Penalty ↓
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span
                    className={`font-mono text-[18px] font-semibold ${
                      !scorecard
                        ? 'text-[#64625D]'
                        : scorecard.metrics.slopPenalty.passed
                        ? 'text-[#15803D]'
                        : 'text-[#E03E2D]'
                    }`}
                  >
                    {scorecard
                      ? scorecard.metrics.slopPenalty.value.toFixed(1)
                      : '—'}
                  </span>
                  <span className="font-mono text-[9.5px] text-[#64625D]">
                    / 10
                  </span>
                </div>
              </div>

              <div className="rounded-md border border-[#E5E1D8] bg-white px-2.5 py-2">
                <div className="font-mono text-[9.5px] uppercase tracking-wider text-[#64625D]">
                  Aesthetic Match ↑
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span
                    className={`font-mono text-[18px] font-semibold ${
                      !scorecard
                        ? 'text-[#64625D]'
                        : scorecard.metrics.aestheticMatch.passed
                        ? 'text-[#15803D]'
                        : 'text-[#B45309]'
                    }`}
                  >
                    {scorecard
                      ? scorecard.metrics.aestheticMatch.value.toFixed(1)
                      : '—'}
                  </span>
                  <span className="font-mono text-[9.5px] text-[#64625D]">
                    / 10
                  </span>
                </div>
              </div>
            </div>

            {/* Embedding-2 Cosine Similarity + Decision-1 Latency Badges */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded border border-[#E5E1D8] bg-white px-2 py-0.5 font-mono text-[9.5px] text-[#141413]">
                <Cpu className="h-3 w-3 text-[#15803D]" />
                decision-1:{' '}
                {scorecard ? `${Math.round(scorecard.latencyMs)}ms` : 'ready'}
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-[#E5E1D8] bg-white px-2 py-0.5 font-mono text-[9.5px] text-[#141413]">
                <Sparkles className="h-3 w-3 text-[#E03E2D]" />
                embedding-2:{' '}
                {typeof scorecard?.embeddingSimilarity === 'number'
                  ? `${scorecard.embeddingSimilarity.toFixed(3)} cos`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Iteration Convergence Sparkline */}
          <ConvergenceSparkline iterations={iterations} />

          {/* 4-Way Parallel Candidate Race Strip (Deep Atelier Mode) */}
          {raceCandidates.length > 1 && (
            <section
              aria-label="Parallel candidate race"
              className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] p-2.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#141413]" />
                  <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[#141413]">
                    {raceCandidates.length}× Parallel Race
                  </span>
                </div>
                <span className="font-mono text-[9px] text-[#64625D]">
                  Best-of-{raceCandidates.length}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {raceCandidates.map((cand) => {
                  const thumb = resolveBackendUrl(cand.screenshotUrl);
                  return (
                    <button
                      key={cand.candidateId}
                      type="button"
                      onClick={() => setInspectCandidate(cand)}
                      className={`group overflow-hidden rounded-md border bg-white text-left transition-all ${
                        cand.selectedAsWinner
                          ? 'border-[#15803D] ring-1 ring-[#15803D]/35'
                          : 'border-[#E5E1D8] hover:border-[#141413]'
                      }`}
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#EFECE5]">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={cand.strategyLabel}
                            className="h-full w-full object-cover object-top"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center font-mono text-[9px] text-[#64625D]">
                            No preview
                          </div>
                        )}
                        {cand.selectedAsWinner && (
                          <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-[#15803D] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase text-white">
                            <Award className="h-2.5 w-2.5" />
                            WINNER
                          </span>
                        )}
                        <span className="absolute bottom-1 right-1 rounded bg-[#141413]/85 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-white">
                          {Math.round(cand.scorecard.overallTasteScore)}
                        </span>
                      </div>
                      <div className="px-1.5 py-1">
                        <div className="truncate text-[10px] font-medium text-[#141413]">
                          {cand.strategyLabel}
                        </div>
                        <div className="flex items-center justify-between font-mono text-[8.5px] text-[#64625D]">
                          <span>
                            slop {cand.scorecard.metrics.slopPenalty.value.toFixed(1)}
                          </span>
                          <span>{(cand.latencyMs / 1000).toFixed(1)}s</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Deterministic Puppeteer DOM Audit Pills */}
          {scorecard?.domAudit && (
            <section aria-label="Deterministic Puppeteer DOM audit">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[#64625D]">
                  Deterministic DOM Audit
                </span>
                <span className="font-mono text-[9px] text-[#64625D]">
                  {scorecard.domAudit.viewportWidth}×
                  {scorecard.domAudit.viewportHeight}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  {
                    label: `${scorecard.domAudit.horizontalOverflowPx}px overflow`,
                    ok: scorecard.domAudit.horizontalOverflowPx <= 2,
                  },
                  {
                    label: `${scorecard.domAudit.overlappingTextNodes} overlaps`,
                    ok: scorecard.domAudit.overlappingTextNodes === 0,
                  },
                  {
                    label: `${scorecard.domAudit.brokenImageCount} broken imgs`,
                    ok: scorecard.domAudit.brokenImageCount === 0,
                  },
                  {
                    label: `${scorecard.domAudit.consoleErrorCount} console errs`,
                    ok: scorecard.domAudit.consoleErrorCount === 0,
                  },
                ].map((pill) => (
                  <div
                    key={pill.label}
                    className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] ${
                      pill.ok
                        ? 'border-[#15803D]/25 bg-[#EEF8F1] text-[#15803D]'
                        : 'border-[#E03E2D]/30 bg-[#FDF1EF] text-[#E03E2D]'
                    }`}
                  >
                    <ShieldCheck className="h-3 w-3 shrink-0" />
                    <span className="truncate">{pill.label}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 12-Probe Calibrated Decisions API Grid */}
          {scorecard && (
            <section
              aria-label="12-probe calibrated Decisions API metrics"
              className="space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[#64625D]">
                  12-Probe Calibrated Rubric
                </span>
                <span className="font-mono text-[9px] text-[#64625D]">
                  v1beta decisions
                </span>
              </div>

              {/* 6 Score Probes */}
              <div className="space-y-1.5 rounded-lg border border-[#E5E1D8] bg-white p-2.5">
                {scoreMetrics.map((m) => {
                  const pct = Math.max(0, Math.min(100, (m.value / 10) * 100));
                  const isInverse = m.id.toLowerCase().includes('slop');
                  return (
                    <div key={m.id} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="font-medium text-[#141413]">
                          {m.label}
                        </span>
                        <span className="font-mono text-[10px]">
                          <strong
                            className={
                              m.passed ? 'text-[#15803D]' : 'text-[#E03E2D]'
                            }
                          >
                            {m.value.toFixed(1)}
                          </strong>
                          <span className="text-[#64625D]">
                            /10 · {Math.round(m.confidence * 100)}%c
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EFECE5]">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            m.passed
                              ? 'bg-[#15803D]'
                              : isInverse
                              ? 'bg-[#E03E2D]'
                              : 'bg-[#B45309]'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 4 Noul Probability Gates */}
              <div className="grid grid-cols-2 gap-1.5">
                {noulMetrics.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md border px-2 py-1.5 ${
                      m.passed
                        ? 'border-[#E5E1D8] bg-[#FAF8F4]'
                        : 'border-[#E03E2D]/35 bg-[#FDF1EF]'
                    }`}
                  >
                    <div className="truncate text-[10px] font-medium text-[#141413]">
                      {m.label}
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between font-mono">
                      <span
                        className={`text-[12px] font-semibold ${
                          m.passed ? 'text-[#15803D]' : 'text-[#E03E2D]'
                        }`}
                      >
                        {Math.round(m.value * 100)}%
                      </span>
                      <span className="text-[9px] text-[#64625D]">
                        conf {Math.round(m.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 2 Choice Classifications */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-2 py-1.5">
                  <div className="font-mono text-[8.5px] uppercase tracking-wider text-[#64625D]">
                    Dominant Class
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] font-semibold text-[#141413]">
                    {scorecard.metrics.dominantAestheticClass.choiceLabel ||
                      '—'}
                  </div>
                </div>
                <div className="rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-2 py-1.5">
                  <div className="font-mono text-[8.5px] uppercase tracking-wider text-[#64625D]">
                    Primary Defect
                  </div>
                  <div
                    className={`mt-0.5 truncate font-mono text-[10.5px] font-semibold ${
                      scorecard.metrics.primaryDefectClass.choiceLabel ===
                      'none'
                        ? 'text-[#15803D]'
                        : 'text-[#B45309]'
                    }`}
                  >
                    {scorecard.metrics.primaryDefectClass.choiceLabel || '—'}
                  </div>
                </div>
              </div>

              {/* Critic Action Directive */}
              {scorecard.criticActionDirective && (
                <div className="rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-2.5 py-2 text-[11px] leading-snug text-[#141413]">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[#64625D]">
                    Critic Directive:{' '}
                  </span>
                  {scorecard.criticActionDirective}
                </div>
              )}
            </section>
          )}

          {/* Extracted Design Manifest Summary */}
          {manifest && (
            <section
              aria-label="Extracted Design Manifest"
              className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[#64625D]">
                  Design Manifest
                </span>
                <span className="font-mono text-[9px] text-[#64625D]">
                  {manifest.modelUsed}
                </span>
              </div>
              <div className="mt-1 font-serif text-[19px] leading-tight text-[#141413]">
                {manifest.vibeTitle}
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                {[
                  manifest.tokens.palette.canvas,
                  manifest.tokens.palette.surface,
                  manifest.tokens.palette.inkPrimary,
                  manifest.tokens.palette.accent,
                  manifest.tokens.palette.borderSubtle,
                ].map((hex, i) => (
                  <span
                    key={`${hex}-${i}`}
                    title={hex}
                    style={{ backgroundColor: hex }}
                    className="h-4 flex-1 rounded-[3px] border border-[#141413]/15"
                  />
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-[#64625D]">
                <span className="truncate">
                  {manifest.tokens.typography.displayFont} +{' '}
                  {manifest.tokens.typography.bodyFont}
                </span>
              </div>
              {manifest.conflictResolutionNotes && (
                <p className="mt-2 rounded border border-[#B45309]/25 bg-[#FEF6EC] px-2 py-1.5 text-[10.5px] leading-snug text-[#141413]">
                  <strong className="font-mono text-[9.5px] uppercase text-[#B45309]">
                    Conflict Resolved:{' '}
                  </strong>
                  {manifest.conflictResolutionNotes}
                </p>
              )}
            </section>
          )}

          {/* Live Streaming Activity & Thought Feed */}
          <section aria-label="Live Gemini 4 activity stream">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-[#64625D]" />
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[#64625D]">
                  Live Activity &amp; Thought Stream
                </span>
              </div>
              <span className="font-mono text-[9px] text-[#64625D]">
                {events.length} ev
              </span>
            </div>

            {thinkingBuffer && (
              <div className="mb-2 rounded-md border border-[#141413]/15 bg-[#FAF8F4] px-2.5 py-2 font-mono text-[10px] leading-relaxed text-[#64625D]">
                <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#141413]">
                  Director Thinking · gemini-4-carbon
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap">
                  {thinkingBuffer}
                </p>
              </div>
            )}

            <div className="studio-scroll max-h-[210px] space-y-1.5 overflow-y-auto rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] p-2">
              {events.length === 0 ? (
                <p className="py-4 text-center font-mono text-[10.5px] text-[#64625D]">
                  Drop references or circle the canvas to start live telemetry.
                </p>
              ) : (
                [...events].reverse().map((ev, idx) => {
                  const badge = modelBadgeStyle(ev.model);
                  return (
                    <div
                      key={`${ev.timestamp}-${idx}`}
                      className="rounded border border-[#E5E1D8] bg-white px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.2 font-mono text-[9px] font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        <span className="font-mono text-[9px] text-[#64625D]">
                          {new Date(ev.timestamp).toLocaleTimeString([], {
                            hour12: false,
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="mt-1 text-[10.5px] leading-snug text-[#141413]">
                        {ev.message}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </aside>

      {/* Candidate Fullscreen Specimen Inspector Dialog */}
      <NativeDialog
        open={Boolean(inspectCandidate)}
        onClose={() => setInspectCandidate(null)}
        title={inspectCandidate?.strategyLabel || 'Candidate Preview'}
        subtitle={
          inspectCandidate
            ? `${inspectCandidate.modelUsed} · Taste ${Math.round(
                inspectCandidate.scorecard.overallTasteScore
              )}/100 · Slop ${inspectCandidate.scorecard.metrics.slopPenalty.value.toFixed(
                1
              )}/10 · Match ${inspectCandidate.scorecard.metrics.aestheticMatch.value.toFixed(
                1
              )}/10`
            : undefined
        }
        widthClass="w-[min(94vw,860px)]"
      >
        {inspectCandidate && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-[#E5E1D8] bg-[#F5F3EE]">
              {resolveBackendUrl(inspectCandidate.screenshotUrl) ? (
                <img
                  src={resolveBackendUrl(inspectCandidate.screenshotUrl)}
                  alt={inspectCandidate.strategyLabel}
                  className="w-full object-contain"
                />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#64625D]">
              <span>
                Files: {inspectCandidate.filesModified.join(', ') || '—'}
              </span>
              <span>
                Latency: {(inspectCandidate.latencyMs / 1000).toFixed(2)}s
              </span>
            </div>
          </div>
        )}
      </NativeDialog>
    </>
  );
}
