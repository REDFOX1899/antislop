'use client';

import { useState } from 'react';
import type {
  DecisionsScorecard,
  ExecutionSpeedMode,
  TransformRunResult,
} from '@shared/types';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Flame,
  FlaskConical,
  Loader2,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { resolveBackendUrl } from '@/lib/api';

interface SigmaArenaProps {
  speedMode: ExecutionSpeedMode;
  assetsCount: number;
  isRunning: boolean;
  activeModeRunning?: TransformRunResult['mode'] | null;
  baselineResult: TransformRunResult | null;
  antislopResult: TransformRunResult | null;
  stressTestResult: TransformRunResult | null;
  onRunExperiment: (
    mode: 'text_baseline' | 'antislop' | 'stress_test',
    textPrompt?: string
  ) => void;
}

function getLatestScorecard(
  run: TransformRunResult | null
): DecisionsScorecard | undefined {
  if (!run || !run.iterations.length) return undefined;
  return run.iterations[run.iterations.length - 1]?.scorecard;
}

function getFinalShot(run: TransformRunResult | null): string | undefined {
  if (!run) return undefined;
  const lastIterShot =
    run.iterations[run.iterations.length - 1]?.screenshotUrl;
  return resolveBackendUrl(run.finalScreenshotUrl || lastIterShot);
}

export function SigmaArena({
  speedMode,
  assetsCount,
  isRunning,
  activeModeRunning,
  baselineResult,
  antislopResult,
  stressTestResult,
  onRunExperiment,
}: SigmaArenaProps) {
  const [baselinePrompt, setBaselinePrompt] = useState(
    'Make this landing page look modern, sleek, and premium'
  );

  const baseScore = getLatestScorecard(baselineResult);
  const antiScore = getLatestScorecard(antislopResult);
  const stressScore = getLatestScorecard(stressTestResult);

  const renderMetricPair = (
    label: string,
    before: string,
    after: string,
    deltaLabel: string,
    positive: boolean
  ) => (
    <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2 font-mono text-[19px] font-semibold text-[var(--ink-primary)]">
        <span className="text-[var(--ink-secondary)]">{before}</span>
        <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
        <span
          className={
            positive ? 'text-[var(--emerald)]' : 'text-[var(--vermilion)]'
          }
        >
          {after}
        </span>
      </div>
      <div
        className={`mt-0.5 font-mono text-[10.5px] ${
          positive ? 'text-[var(--emerald)]' : 'text-[var(--amber)]'
        }`}
      >
        {deltaLabel}
      </div>
    </div>
  );

  const renderSpecimenColumn = ({
    title,
    subtitle,
    tag,
    run,
    scorecard,
    mode,
    accent,
    extraNote,
  }: {
    title: string;
    subtitle: string;
    tag: string;
    run: TransformRunResult | null;
    scorecard?: DecisionsScorecard;
    mode: 'text_baseline' | 'antislop' | 'stress_test';
    accent: 'neutral' | 'emerald' | 'amber';
    extraNote?: React.ReactNode;
  }) => {
    const shot = getFinalShot(run);
    const runningThis = isRunning && activeModeRunning === mode;

    return (
      <article className="flex flex-col overflow-hidden rounded-[16px] border border-[var(--border-card)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider ${
                accent === 'emerald'
                  ? 'border-[var(--emerald-border)] bg-[var(--emerald-bg)] text-[var(--emerald)]'
                  : accent === 'amber'
                  ? 'border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]'
                  : 'border-[var(--border-card)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)]'
              }`}
            >
              {tag}
            </span>
            {run && (
              <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                {(run.totalLatencyMs / 1000).toFixed(1)}s ·{' '}
                {run.iterations.length} iter
              </span>
            )}
          </div>
          <h3 className="mt-2 font-serif text-[23px] leading-tight text-[var(--ink-primary)]">
            {title}
          </h3>
          <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
            {subtitle}
          </p>
        </div>

        {/* Rendered Puppeteer Specimen */}
        <div className="relative aspect-[16/10] w-full border-b border-[var(--border-subtle)] bg-[var(--bg-stage-grid)]">
          {shot ? (
            <img
              src={shot}
              alt={`${title} rendered output`}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              {runningThis ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--sapphire-ice)]" />
                  <span className="font-mono text-[11px] text-[var(--ink-primary)]">
                    Executing live run &amp; Decisions API audit…
                  </span>
                </>
              ) : (
                <>
                  <FlaskConical className="h-5 w-5 text-[var(--ink-muted)]" />
                  <span className="text-[12px] text-[var(--ink-secondary)]">
                    Click run below to capture real Puppeteer render &amp;
                    calibrated score.
                  </span>
                </>
              )}
            </div>
          )}

          {scorecard && (
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)]/95 px-2.5 py-1 shadow-md">
              <span className="font-mono text-[9.5px] text-[var(--ink-muted)]">
                TASTE
              </span>
              <span className="font-serif text-[19px] leading-none text-[var(--ink-primary)]">
                {Math.round(scorecard.overallTasteScore)}
              </span>
            </div>
          )}
        </div>

        {/* Calibrated Metrics */}
        <div className="flex flex-1 flex-col justify-between p-4">
          {scorecard ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-2.5 py-1.5">
                  <div className="font-mono text-[9px] uppercase text-[var(--ink-muted)]">
                    Slop ↓
                  </div>
                  <div
                    className={`font-mono text-[15px] font-semibold ${
                      scorecard.metrics.slopPenalty.passed
                        ? 'text-[var(--emerald)]'
                        : 'text-[var(--vermilion)]'
                    }`}
                  >
                    {scorecard.metrics.slopPenalty.value.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-2.5 py-1.5">
                  <div className="font-mono text-[9px] uppercase text-[var(--ink-muted)]">
                    Match ↑
                  </div>
                  <div
                    className={`font-mono text-[15px] font-semibold ${
                      scorecard.metrics.aestheticMatch.passed
                        ? 'text-[var(--emerald)]'
                        : 'text-[var(--amber)]'
                    }`}
                  >
                    {scorecard.metrics.aestheticMatch.value.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-2.5 py-1.5">
                  <div className="font-mono text-[9px] uppercase text-[var(--ink-muted)]">
                    Cosine
                  </div>
                  <div className="font-mono text-[15px] font-semibold text-[var(--ink-primary)]">
                    {typeof scorecard.embeddingSimilarity === 'number'
                      ? scorecard.embeddingSimilarity.toFixed(2)
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[var(--ink-primary)]">
                  class:{' '}
                  {scorecard.metrics.dominantAestheticClass.choiceLabel || '—'}
                </span>
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[var(--ink-secondary)]">
                  defect:{' '}
                  {scorecard.metrics.primaryDefectClass.choiceLabel || 'none'}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[var(--ink-primary)]">
                  <ShieldCheck className="h-3 w-3 text-[var(--emerald)]" />
                  {scorecard.domAudit.horizontalOverflowPx}px ovf ·{' '}
                  {scorecard.domAudit.overlappingTextNodes} ovlp
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px]">
                {scorecard.passedAllGates ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[var(--emerald)]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Passed all 12 Decisions API gates
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[var(--vermilion)]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Failed gates ({scorecard.metrics.primaryDefectClass.choiceLabel || 'slop'})
                  </span>
                )}
              </div>

              {extraNote}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--ink-secondary)]">
              No run captured yet in this session.
            </p>
          )}

          <button
            type="button"
            disabled={isRunning}
            onClick={() =>
              onRunExperiment(
                mode,
                mode === 'text_baseline' ? baselinePrompt : undefined
              )
            }
            className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-full px-3.5 py-2.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
              mode === 'antislop'
                ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-ink)] hover:bg-[var(--btn-primary-hover)]'
                : 'border border-[var(--border-card)] bg-[var(--bg-card-elevated)] text-[var(--ink-primary)] hover:border-[var(--sapphire-border)] hover:text-[var(--sapphire-ice)]'
            }`}
          >
            {runningThis ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : mode === 'stress_test' ? (
              <Flame className="h-3.5 w-3.5" />
            ) : mode === 'antislop' ? (
              <Sparkles className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            <span>
              {mode === 'text_baseline'
                ? 'Run Text-Only Baseline'
                : mode === 'antislop'
                ? 'Run AntiSlop Multimodal Loop'
                : 'Run Element 119 Chaos Stress Test'}
            </span>
          </button>
        </div>
      </article>
    );
  };

  const slopDelta =
    baseScore && antiScore
      ? antiScore.metrics.slopPenalty.value -
        baseScore.metrics.slopPenalty.value
      : null;
  const matchDelta =
    baseScore && antiScore
      ? antiScore.metrics.aestheticMatch.value -
        baseScore.metrics.aestheticMatch.value
      : null;
  const cosDelta =
    typeof baseScore?.embeddingSimilarity === 'number' &&
    typeof antiScore?.embeddingSimilarity === 'number'
      ? antiScore.embeddingSimilarity - baseScore.embeddingSimilarity
      : null;
  const tasteDelta =
    baseScore && antiScore
      ? antiScore.overallTasteScore - baseScore.overallTasteScore
      : null;

  return (
    <div className="studio-scroll flex-1 overflow-y-auto bg-[var(--bg-void)] px-5 pb-8 pt-4">
      <div className="mx-auto max-w-[1360px] space-y-5">
        {/* Arena Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--sapphire-ice)]">
              <span>Problem Statements 1 &amp; 2</span>
              <span>·</span>
              <span>5-Sigma Empirical Proof + Element 119 Chaos Bench</span>
            </div>
            <h1 className="mt-1.5 text-[30px] font-medium leading-tight tracking-[-0.025em] text-[var(--ink-primary)]">
              Baseline vs. AntiSlop Calibration Arena
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] text-[var(--ink-secondary)]">
              Run a naïve text-only prompt head-to-head against AntiSlop&apos;s
              multimodal loop and conflicting-media stress test — scored live by{' '}
              <span className="font-mono text-[12px] text-[var(--sapphire-ice)]">
                gemini-decision-1
              </span>{' '}
              and{' '}
              <span className="font-mono text-[12px] text-[var(--sapphire-ice)]">
                gemini-embedding-2
              </span>
              .
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-3.5 py-1.5 font-mono text-[11px] text-[var(--ink-primary)]">
            <span>References: {assetsCount}</span>
            <span className="text-[var(--border-strong)]">|</span>
            <span className="text-[var(--sapphire-ice)]">
              {speedMode === 'fast_demo' ? 'Fast Demo' : 'Deep Atelier 4×'}
            </span>
          </div>
        </div>

        {/* Editable Text-Only Baseline Prompt Bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] px-4 py-3">
          <label
            htmlFor="baseline-text-prompt"
            className="shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]"
          >
            Text-Only Baseline Prompt
          </label>
          <input
            id="baseline-text-prompt"
            type="text"
            value={baselinePrompt}
            onChange={(e) => setBaselinePrompt(e.target.value)}
            className="min-w-[260px] flex-1 rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-4 py-1.5 text-[12.5px] text-[var(--ink-primary)] focus:border-[var(--border-pill-focus)] focus:outline-none"
          />
          <span className="font-mono text-[10px] text-[var(--ink-muted)]">
            Zero images · Zero Decisions loop
          </span>
        </div>

        {/* Empirical Delta Proof Bar */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {renderMetricPair(
            'Slop Penalty (0–10 ↓)',
            baseScore ? baseScore.metrics.slopPenalty.value.toFixed(1) : '—',
            antiScore ? antiScore.metrics.slopPenalty.value.toFixed(1) : '—',
            slopDelta !== null
              ? `${slopDelta <= 0 ? '' : '+'}${slopDelta.toFixed(1)} pts vs text-only`
              : 'Run Baseline + AntiSlop to compute live delta',
            slopDelta !== null ? slopDelta < 0 : true
          )}
          {renderMetricPair(
            'Aesthetic Match (0–10 ↑)',
            baseScore ? baseScore.metrics.aestheticMatch.value.toFixed(1) : '—',
            antiScore ? antiScore.metrics.aestheticMatch.value.toFixed(1) : '—',
            matchDelta !== null
              ? `${matchDelta >= 0 ? '+' : ''}${matchDelta.toFixed(1)} pts fidelity gain`
              : 'Calibrated visual reference alignment',
            matchDelta !== null ? matchDelta > 0 : true
          )}
          {renderMetricPair(
            'Embedding-2 Cosine (0–1 ↑)',
            typeof baseScore?.embeddingSimilarity === 'number'
              ? baseScore.embeddingSimilarity.toFixed(2)
              : '—',
            typeof antiScore?.embeddingSimilarity === 'number'
              ? antiScore.embeddingSimilarity.toFixed(2)
              : '—',
            cosDelta !== null
              ? `${cosDelta >= 0 ? '+' : ''}${cosDelta.toFixed(2)} multimodal vector shift`
              : 'Shared image-to-render cosine distance',
            cosDelta !== null ? cosDelta > 0 : true
          )}
          {renderMetricPair(
            'AntiSlop Taste Index (0–100 ↑)',
            baseScore ? `${Math.round(baseScore.overallTasteScore)}` : '—',
            antiScore ? `${Math.round(antiScore.overallTasteScore)}` : '—',
            tasteDelta !== null
              ? `${tasteDelta >= 0 ? '+' : ''}${Math.round(tasteDelta)} composite lift`
              : '12-probe + DOM audit composite',
            tasteDelta !== null ? tasteDelta > 0 : true
          )}
        </div>

        {/* 3-Column Live Comparison Specimens */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {renderSpecimenColumn({
            title: 'Text-Only Baseline',
            subtitle:
              'Single-shot generic text prompt without visual references or Decisions API verification.',
            tag: 'CONTROL · AI SLOP',
            run: baselineResult,
            scorecard: baseScore,
            mode: 'text_baseline',
            accent: 'neutral',
          })}

          {renderSpecimenColumn({
            title: 'AntiSlop Multimodal Loop',
            subtitle:
              'Raw moodboard + webcam + voice synthesized by Carbon, coded by Neon, gated by Decision-1.',
            tag: 'ANTISLOP · VERIFIED',
            run: antislopResult,
            scorecard: antiScore,
            mode: 'antislop',
            accent: 'emerald',
            extraNote: antislopResult?.manifest?.vibeTitle ? (
              <div className="rounded-xl border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-3 py-2 text-[11px] text-[var(--ink-primary)]">
                <span className="font-mono text-[9.5px] font-semibold uppercase text-[var(--emerald)]">
                  Synthesized Direction:{' '}
                </span>
                {antislopResult.manifest.vibeTitle}
              </div>
            ) : undefined,
          })}

          {renderSpecimenColumn({
            title: 'Element 119 Chaos Stress Test',
            subtitle:
              'Conflicting visual cues & noisy inputs testing conflict synthesis + iterative critic recovery.',
            tag: 'ELEMENT 119 · STRESS',
            run: stressTestResult,
            scorecard: stressScore,
            mode: 'stress_test',
            accent: 'amber',
            extraNote: stressTestResult ? (
              <div className="space-y-1.5 rounded-xl border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2 text-[11px] text-[var(--ink-primary)]">
                <div className="flex items-center justify-between font-mono text-[9.5px] font-semibold uppercase text-[var(--amber)]">
                  <span>Conflict Resolution Notes</span>
                  <span>
                    Stabilized in {stressTestResult.iterations.length} iter
                  </span>
                </div>
                <p className="leading-snug text-[var(--ink-secondary)]">
                  {stressTestResult.manifest?.conflictResolutionNotes ||
                    stressScore?.criticActionDirective ||
                    'Resolved conflicting style cues through dominant hierarchy & contrast gates.'}
                </p>
              </div>
            ) : undefined,
          })}
        </div>
      </div>
    </div>
  );
}
