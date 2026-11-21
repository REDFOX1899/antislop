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
    <div className="rounded-lg border border-[#E5E1D8] bg-white px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#64625D]">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2 font-mono text-[19px] font-semibold text-[#141413]">
        <span className="text-[#64625D]">{before}</span>
        <ArrowRight className="h-3.5 w-3.5 text-[#64625D]" />
        <span className={positive ? 'text-[#15803D]' : 'text-[#E03E2D]'}>
          {after}
        </span>
      </div>
      <div
        className={`mt-0.5 font-mono text-[10.5px] ${
          positive ? 'text-[#15803D]' : 'text-[#B45309]'
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
      <article className="flex flex-col overflow-hidden rounded-xl border border-[#E5E1D8] bg-white">
        <div className="border-b border-[#E5E1D8] bg-[#FAF8F4] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider ${
                accent === 'emerald'
                  ? 'border-[#15803D]/30 bg-[#EEF8F1] text-[#15803D]'
                  : accent === 'amber'
                  ? 'border-[#B45309]/30 bg-[#FEF6EC] text-[#B45309]'
                  : 'border-[#E5E1D8] bg-white text-[#64625D]'
              }`}
            >
              {tag}
            </span>
            {run && (
              <span className="font-mono text-[10px] text-[#64625D]">
                {(run.totalLatencyMs / 1000).toFixed(1)}s ·{' '}
                {run.iterations.length} iter
              </span>
            )}
          </div>
          <h3 className="mt-1.5 font-serif text-[22px] leading-tight text-[#141413]">
            {title}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-[#64625D]">{subtitle}</p>
        </div>

        {/* Rendered Puppeteer Specimen */}
        <div className="relative aspect-[16/10] w-full border-b border-[#E5E1D8] bg-[#EFECE5]">
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
                  <Loader2 className="h-5 w-5 animate-spin text-[#E03E2D]" />
                  <span className="font-mono text-[11px] text-[#141413]">
                    Executing live run &amp; Decisions API audit…
                  </span>
                </>
              ) : (
                <>
                  <FlaskConical className="h-5 w-5 text-[#96928A]" />
                  <span className="text-[12px] text-[#64625D]">
                    Click run below to capture real Puppeteer render &amp;
                    calibrated score.
                  </span>
                </>
              )}
            </div>
          )}

          {scorecard && (
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-md border border-[#E5E1D8] bg-white/95 px-2 py-1 shadow-xs">
              <span className="font-mono text-[10px] text-[#64625D]">
                TASTE
              </span>
              <span className="font-serif text-[20px] leading-none text-[#141413]">
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
                <div className="rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-2.5 py-1.5">
                  <div className="font-mono text-[9px] uppercase text-[#64625D]">
                    Slop ↓
                  </div>
                  <div
                    className={`font-mono text-[15px] font-semibold ${
                      scorecard.metrics.slopPenalty.passed
                        ? 'text-[#15803D]'
                        : 'text-[#E03E2D]'
                    }`}
                  >
                    {scorecard.metrics.slopPenalty.value.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-2.5 py-1.5">
                  <div className="font-mono text-[9px] uppercase text-[#64625D]">
                    Match ↑
                  </div>
                  <div
                    className={`font-mono text-[15px] font-semibold ${
                      scorecard.metrics.aestheticMatch.passed
                        ? 'text-[#15803D]'
                        : 'text-[#B45309]'
                    }`}
                  >
                    {scorecard.metrics.aestheticMatch.value.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-2.5 py-1.5">
                  <div className="font-mono text-[9px] uppercase text-[#64625D]">
                    Cosine
                  </div>
                  <div className="font-mono text-[15px] font-semibold text-[#141413]">
                    {typeof scorecard.embeddingSimilarity === 'number'
                      ? scorecard.embeddingSimilarity.toFixed(2)
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                <span className="rounded border border-[#E5E1D8] bg-white px-2 py-0.5 text-[#141413]">
                  class:{' '}
                  {scorecard.metrics.dominantAestheticClass.choiceLabel || '—'}
                </span>
                <span className="rounded border border-[#E5E1D8] bg-white px-2 py-0.5 text-[#64625D]">
                  defect:{' '}
                  {scorecard.metrics.primaryDefectClass.choiceLabel || 'none'}
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-[#E5E1D8] bg-white px-2 py-0.5 text-[#141413]">
                  <ShieldCheck className="h-3 w-3 text-[#15803D]" />
                  {scorecard.domAudit.horizontalOverflowPx}px ovf ·{' '}
                  {scorecard.domAudit.overlappingTextNodes} ovlp
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[11px]">
                {scorecard.passedAllGates ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[#15803D]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Passed all 12 Decisions API gates
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[#E03E2D]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Failed gates ({scorecard.metrics.primaryDefectClass.choiceLabel || 'slop'})
                  </span>
                )}
              </div>

              {extraNote}
            </div>
          ) : (
            <p className="text-[11.5px] text-[#64625D]">
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
            className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-[7px] px-3 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
              mode === 'antislop'
                ? 'bg-[#E03E2D] text-white hover:bg-[#C53222]'
                : 'border border-[#141413] bg-white text-[#141413] hover:bg-[#141413] hover:text-white'
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
    <div className="studio-scroll flex-1 overflow-y-auto bg-[#F5F3EE] p-6">
      <div className="mx-auto max-w-[1360px] space-y-5">
        {/* Editorial Arena Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E5E1D8] pb-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#64625D]">
              <span>Problem Statements 1 &amp; 2</span>
              <span>·</span>
              <span>5-Sigma Empirical Proof + Element 119 Chaos Bench</span>
            </div>
            <h1 className="mt-1 font-serif text-[34px] leading-none tracking-[-0.02em] text-[#141413]">
              Baseline vs. AntiSlop Calibration Arena
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] text-[#64625D]">
              Run a naïve text-only prompt head-to-head against AntiSlop&apos;s
              multimodal loop and conflicting-media stress test — scored live by{' '}
              <span className="font-mono text-[12px] text-[#141413]">
                gemini-decision-1
              </span>{' '}
              and{' '}
              <span className="font-mono text-[12px] text-[#141413]">
                gemini-embedding-2
              </span>
              .
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2 rounded-md border border-[#E5E1D8] bg-white px-3 py-1.5 font-mono text-[11px] text-[#141413]">
              <span>Taste Tray Refs: {assetsCount}</span>
              <span className="text-[#E5E1D8]">|</span>
              <span>
                Mode: {speedMode === 'fast_demo' ? 'Fast Demo' : 'Deep Atelier 4×'}
              </span>
            </div>
          </div>
        </div>

        {/* Editable Text-Only Baseline Prompt Bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#E5E1D8] bg-white px-4 py-3">
          <label
            htmlFor="baseline-text-prompt"
            className="shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#64625D]"
          >
            Text-Only Baseline Prompt
          </label>
          <input
            id="baseline-text-prompt"
            type="text"
            value={baselinePrompt}
            onChange={(e) => setBaselinePrompt(e.target.value)}
            className="min-w-[260px] flex-1 rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-3 py-1.5 text-[12.5px] text-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none"
          />
          <span className="font-mono text-[10px] text-[#64625D]">
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
              <div className="rounded-md border border-[#15803D]/25 bg-[#EEF8F1] px-2.5 py-2 text-[11px] text-[#141413]">
                <span className="font-mono text-[9.5px] font-semibold uppercase text-[#15803D]">
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
              <div className="space-y-1.5 rounded-md border border-[#B45309]/30 bg-[#FEF6EC] px-2.5 py-2 text-[11px] text-[#141413]">
                <div className="flex items-center justify-between font-mono text-[9.5px] font-semibold uppercase text-[#B45309]">
                  <span>Conflict Resolution Notes</span>
                  <span>
                    Stabilized in {stressTestResult.iterations.length} iter
                  </span>
                </div>
                <p className="leading-snug">
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
