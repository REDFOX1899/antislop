'use client';

import { useState } from 'react';
import type {
  CandidateResult,
  CriticIteration,
  DecisionMetric,
  DecisionsScorecard,
  DesignManifest,
  ExecutionSpeedMode,
  StreamEvent,
  TransformRunRequest,
} from '@shared/types';
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Layers,
  Loader2,
  Mic,
  PanelRightClose,
  Pencil,
  Plus,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { resolveBackendUrl } from '@/lib/api';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { GeminiSparkleMark } from './BrandMarks';
import { NativeDialog } from './NativeDialog';

export interface QueuedEditSummary {
  id: string;
  mode: TransformRunRequest['mode'];
  label: string;
  circlesCount: number;
  createdAt: number;
}

interface CriticRailProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  scorecard?: DecisionsScorecard;
  manifest?: DesignManifest;
  iterations: CriticIteration[];
  events: StreamEvent[];
  isRunning: boolean;
  activeModeRunning: TransformRunRequest['mode'] | null;
  activeJobLabel?: string;
  thinkingBuffer: string;
  speedMode: ExecutionSpeedMode;
  assetsCount: number;
  // Continuous Talk + Circle + Edit Queue controls
  drawMode: boolean;
  onToggleDrawMode: () => void;
  drawnCirclesCount: number;
  voiceTranscript: string;
  onVoiceTranscriptChange: (val: string) => void;
  onVoiceRecorded: (payload: {
    audioBase64: string;
    mimeType: string;
    transcript: string;
  }) => void;
  onSubmitTalkEdit: () => void;
  editQueue: QueuedEditSummary[];
  onRemoveQueuedJob: (jobId: string) => void;
}

function modelBadgeStyle(model?: string): { label: string; className: string } {
  const m = (model || '').toLowerCase();
  if (m.includes('carbon')) {
    return {
      label: 'Carbon',
      className:
        'border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] text-[var(--sapphire-ice)]',
    };
  }
  if (m.includes('neon')) {
    return {
      label: 'Neon',
      className:
        'border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]',
    };
  }
  if (m.includes('hydrogen')) {
    return {
      label: 'Hydrogen',
      className:
        'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)]',
    };
  }
  if (m.includes('decision')) {
    return {
      label: 'Decision-1',
      className:
        'border-[var(--emerald-border)] bg-[var(--emerald-bg)] text-[var(--emerald)]',
    };
  }
  if (m.includes('banana')) {
    return {
      label: 'Banana 2.1',
      className:
        'border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]',
    };
  }
  if (m.includes('embed')) {
    return {
      label: 'Embed-2',
      className:
        'border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--ink-primary)]',
    };
  }
  if (m.includes('transcribe') || m.includes('live')) {
    return {
      label: '3.5-Trans',
      className:
        'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)]',
    };
  }
  return {
    label: model ? model.slice(0, 12) : 'Engine',
    className:
      'border-[var(--border-card)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)]',
  };
}

function formatMsShort(ms?: number): string {
  if (!ms || ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type NodeVisualState = 'idle' | 'active' | 'passed' | 'looping';

function nodeColors(state: NodeVisualState): {
  fill: string;
  stroke: string;
  titleFill: string;
  subFill: string;
} {
  if (state === 'passed') {
    return {
      fill: 'var(--svg-pass-fill)',
      stroke: 'var(--svg-pass-stroke)',
      titleFill: 'var(--svg-title-fill)',
      subFill: 'var(--emerald)',
    };
  }
  if (state === 'active') {
    return {
      fill: 'var(--svg-active-fill)',
      stroke: 'var(--svg-active-stroke)',
      titleFill: 'var(--svg-title-fill)',
      subFill: 'var(--sapphire-ice)',
    };
  }
  if (state === 'looping') {
    return {
      fill: 'var(--svg-loop-fill)',
      stroke: 'var(--svg-loop-stroke)',
      titleFill: 'var(--svg-title-fill)',
      subFill: 'var(--amber)',
    };
  }
  return {
    fill: 'var(--svg-idle-fill)',
    stroke: 'var(--svg-idle-stroke)',
    titleFill: 'var(--svg-title-fill)',
    subFill: 'var(--svg-sub-fill)',
  };
}

function DecisionPipelineGraph({
  events,
  isRunning,
  activeModeRunning,
  manifest,
  scorecard,
  iterations,
  assetsCount,
  drawnCirclesCount,
}: {
  events: StreamEvent[];
  isRunning: boolean;
  activeModeRunning: TransformRunRequest['mode'] | null;
  manifest?: DesignManifest;
  scorecard?: DecisionsScorecard;
  iterations: CriticIteration[];
  assetsCount: number;
  drawnCirclesCount: number;
}) {
  const eventTypes = new Set(events.map((e) => e.type));
  const lastEvent = events[events.length - 1];

  const hasRefinementLoop =
    eventTypes.has('refinement_triggered') ||
    iterations.some((it) => it.phase === 'refinement');
  const isCircleRun = activeModeRunning === 'circle_tweak';

  const hasManifest = Boolean(manifest) || eventTypes.has('manifest_ready');
  const hasCandidateWritten =
    eventTypes.has('candidate_written') ||
    eventTypes.has('hmr_reloaded') ||
    iterations.length > 0;
  const hasScored =
    Boolean(scorecard) ||
    eventTypes.has('candidate_scored') ||
    eventTypes.has('iteration_complete');
  const hasPassed =
    Boolean(scorecard?.passedAllGates) ||
    (!isRunning && eventTypes.has('run_completed') && Boolean(scorecard));

  const refState: NodeVisualState =
    isRunning &&
    (events.length === 0 ||
      lastEvent?.type === 'run_started' ||
      lastEvent?.type === 'snapshot_captured' ||
      lastEvent?.type === 'voice_transcribed')
      ? 'active'
      : assetsCount > 0 || drawnCirclesCount > 0 || events.length > 0 || hasScored
      ? 'passed'
      : 'idle';

  const directorState: NodeVisualState =
    isRunning && lastEvent?.type === 'director_thinking'
      ? 'active'
      : hasManifest || (isCircleRun && hasCandidateWritten)
      ? 'passed'
      : isRunning && !isCircleRun && refState === 'passed' && !hasCandidateWritten
      ? 'active'
      : 'idle';

  const coderState: NodeVisualState =
    isRunning &&
    (lastEvent?.type === 'candidate_started' ||
      lastEvent?.type === 'asset_generated' ||
      lastEvent?.type === 'refinement_triggered' ||
      (isCircleRun && !hasCandidateWritten && refState === 'passed'))
      ? hasRefinementLoop
        ? 'looping'
        : 'active'
      : hasCandidateWritten || hasScored
      ? 'passed'
      : 'idle';

  const decisionState: NodeVisualState =
    isRunning &&
    (lastEvent?.type === 'candidate_written' || lastEvent?.type === 'hmr_reloaded')
      ? 'active'
      : hasScored
      ? scorecard?.passedAllGates
        ? 'passed'
        : hasRefinementLoop || isRunning
        ? 'looping'
        : 'passed'
      : 'idle';

  const passState: NodeVisualState = hasPassed
    ? 'passed'
    : isRunning && hasScored && !scorecard?.passedAllGates
    ? 'looping'
    : 'idle';

  const latestIter = iterations[iterations.length - 1];
  const winnerCand =
    latestIter?.candidates?.find((c) => c.selectedAsWinner) ||
    latestIter?.candidates?.[0];

  const refSub =
    drawnCirclesCount > 0
      ? `${drawnCirclesCount} circle${drawnCirclesCount > 1 ? 's' : ''}`
      : assetsCount > 0
      ? `${assetsCount} ref${assetsCount > 1 ? 's' : ''}`
      : 'ready';

  const directorSub = manifest?.latencyMs
    ? formatMsShort(manifest.latencyMs)
    : isCircleRun
    ? 'direct'
    : directorState === 'active'
    ? 'thinking…'
    : 'carbon';

  const coderSub = winnerCand?.latencyMs
    ? formatMsShort(winnerCand.latencyMs)
    : coderState === 'active' || coderState === 'looping'
    ? 'coding…'
    : isCircleRun
    ? 'hydrogen'
    : 'neon';

  const decisionSub = scorecard?.latencyMs
    ? formatMsShort(scorecard.latencyMs)
    : decisionState === 'active'
    ? 'scoring…'
    : '12 probes';

  const passSub = scorecard
    ? `${Math.round(scorecard.overallTasteScore)}/100`
    : 'gate';

  const cRef = nodeColors(refState);
  const cDir = nodeColors(directorState);
  const cCode = nodeColors(coderState);
  const cDec = nodeColors(decisionState);
  const cPass = nodeColors(passState);

  const loopActive =
    hasRefinementLoop || (isRunning && lastEvent?.type === 'refinement_triggered');

  return (
    <section
      aria-label="Live Decisions API pipeline graph"
      className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-2.5"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-secondary)]">
          Decisions API Pipeline
        </span>
        {loopActive ? (
          <span className="rounded-full border border-[var(--amber-border)] bg-[var(--amber-bg)] px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-[var(--amber)]">
            Auto-Fix ↺
          </span>
        ) : hasPassed ? (
          <span className="font-mono text-[9px] font-semibold text-[var(--emerald)]">
            Verified ✓
          </span>
        ) : isRunning ? (
          <span className="font-mono text-[9px] font-medium text-[var(--sapphire-ice)]">
            Live
          </span>
        ) : (
          <span className="font-mono text-[8.5px] text-[var(--ink-muted)]">
            decision-1
          </span>
        )}
      </div>

      <svg
        viewBox="0 0 248 122"
        className="h-[118px] w-full overflow-visible"
        role="img"
        aria-label="AntiSlop Gemini 4 and Decisions API pipeline flow graph"
      >
        <defs>
          <marker
            id="as-arrow-idle"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--svg-idle-arrow)" />
          </marker>
          <marker
            id="as-arrow-ok"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--emerald)" />
          </marker>
          <marker
            id="as-arrow-active"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--sapphire-ice)" />
          </marker>
          <marker
            id="as-arrow-loop"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--amber)" />
          </marker>
        </defs>

        {/* Connector 1: Ref / Circles -> Director */}
        <line
          x1="112"
          y1="22"
          x2="132"
          y2="22"
          stroke={
            directorState === 'active'
              ? 'var(--sapphire-ice)'
              : directorState === 'passed'
              ? 'var(--emerald)'
              : 'var(--svg-idle-arrow)'
          }
          strokeWidth="1.4"
          className={directorState === 'active' ? 'atelier-svg-flow' : undefined}
          markerEnd={
            directorState === 'active'
              ? 'url(#as-arrow-active)'
              : directorState === 'passed'
              ? 'url(#as-arrow-ok)'
              : 'url(#as-arrow-idle)'
          }
        />

        {/* Connector 2: Director -> Neon Coder */}
        <path
          d="M 190 38 L 190 47 L 42 47 L 42 56"
          fill="none"
          stroke={
            coderState === 'active'
              ? 'var(--sapphire-ice)'
              : coderState === 'passed' || coderState === 'looping'
              ? 'var(--emerald)'
              : 'var(--svg-idle-arrow)'
          }
          strokeWidth="1.4"
          strokeLinejoin="round"
          className={coderState === 'active' ? 'atelier-svg-flow' : undefined}
          markerEnd={
            coderState === 'active'
              ? 'url(#as-arrow-active)'
              : coderState === 'passed' || coderState === 'looping'
              ? 'url(#as-arrow-ok)'
              : 'url(#as-arrow-idle)'
          }
        />

        {/* Connector 3: Neon Coder -> Decision-1 Gate */}
        <line
          x1="80"
          y1="75"
          x2="90"
          y2="75"
          stroke={
            decisionState === 'active'
              ? 'var(--sapphire-ice)'
              : decisionState === 'passed' || decisionState === 'looping'
              ? 'var(--emerald)'
              : 'var(--svg-idle-arrow)'
          }
          strokeWidth="1.4"
          className={decisionState === 'active' ? 'atelier-svg-flow' : undefined}
          markerEnd={
            decisionState === 'active'
              ? 'url(#as-arrow-active)'
              : decisionState === 'passed' || decisionState === 'looping'
              ? 'url(#as-arrow-ok)'
              : 'url(#as-arrow-idle)'
          }
        />

        {/* Connector 4: Decision-1 Gate -> Pass */}
        <line
          x1="174"
          y1="75"
          x2="184"
          y2="75"
          stroke={passState === 'passed' ? 'var(--emerald)' : 'var(--svg-idle-arrow)'}
          strokeWidth="1.4"
          markerEnd={
            passState === 'passed' ? 'url(#as-arrow-ok)' : 'url(#as-arrow-idle)'
          }
        />

        {/* Curved Loop-Back Arrow */}
        <path
          d="M 133 93 C 133 114, 42 114, 42 95"
          fill="none"
          stroke={loopActive ? 'var(--amber)' : 'var(--svg-idle-stroke)'}
          strokeWidth={loopActive ? '1.6' : '1.2'}
          strokeDasharray={loopActive ? '4 3' : '3 3'}
          className={loopActive && isRunning ? 'atelier-svg-flow' : undefined}
          markerEnd={loopActive ? 'url(#as-arrow-loop)' : 'url(#as-arrow-idle)'}
        />
        <rect
          x="61"
          y="104"
          width="54"
          height="13"
          rx="6.5"
          fill={loopActive ? 'var(--svg-loop-fill)' : 'var(--bg-card)'}
          stroke={loopActive ? 'var(--amber)' : 'var(--svg-idle-stroke)'}
          strokeWidth="0.9"
        />
        <text
          x="88"
          y="113"
          textAnchor="middle"
          fill={loopActive ? 'var(--amber)' : 'var(--ink-muted)'}
          className="font-mono text-[7.5px] font-semibold"
        >
          Auto-Fix ↺
        </text>

        {/* Node 1: Ref / Circles */}
        <g>
          <rect
            x="4"
            y="6"
            width="108"
            height="32"
            rx="6"
            fill={cRef.fill}
            stroke={cRef.stroke}
            strokeWidth={refState === 'active' ? '1.5' : '1.1'}
          />
          {refState === 'active' && (
            <circle
              cx="13"
              cy="15"
              r="2.4"
              fill="var(--sapphire-ice)"
              className="animate-studio-pulse"
            />
          )}
          <text
            x="58"
            y="20"
            textAnchor="middle"
            fill={cRef.titleFill}
            className="font-mono text-[8.5px] font-semibold"
          >
            Ref / Circles
          </text>
          <text
            x="58"
            y="31"
            textAnchor="middle"
            fill={cRef.subFill}
            className="font-mono text-[7.5px]"
          >
            {refSub}
          </text>
        </g>

        {/* Node 2: Director */}
        <g>
          <rect
            x="136"
            y="6"
            width="108"
            height="32"
            rx="6"
            fill={cDir.fill}
            stroke={cDir.stroke}
            strokeWidth={directorState === 'active' ? '1.5' : '1.1'}
          />
          {directorState === 'active' && (
            <circle
              cx="145"
              cy="15"
              r="2.4"
              fill="var(--sapphire-ice)"
              className="animate-studio-pulse"
            />
          )}
          <text
            x="190"
            y="20"
            textAnchor="middle"
            fill={cDir.titleFill}
            className="font-mono text-[8.5px] font-semibold"
          >
            Director
          </text>
          <text
            x="190"
            y="31"
            textAnchor="middle"
            fill={cDir.subFill}
            className="font-mono text-[7.5px]"
          >
            {directorSub}
          </text>
        </g>

        {/* Node 3: Neon Coder */}
        <g>
          <rect
            x="4"
            y="58"
            width="76"
            height="34"
            rx="6"
            fill={cCode.fill}
            stroke={cCode.stroke}
            strokeWidth={
              coderState === 'active' || coderState === 'looping' ? '1.5' : '1.1'
            }
          />
          {(coderState === 'active' || coderState === 'looping') && (
            <circle
              cx="12"
              cy="67"
              r="2.3"
              fill={coderState === 'looping' ? 'var(--amber)' : 'var(--sapphire-ice)'}
              className="animate-studio-pulse"
            />
          )}
          <text
            x="42"
            y="73"
            textAnchor="middle"
            fill={cCode.titleFill}
            className="font-mono text-[8px] font-semibold"
          >
            Neon Coder
          </text>
          <text
            x="42"
            y="84"
            textAnchor="middle"
            fill={cCode.subFill}
            className="font-mono text-[7.5px]"
          >
            {coderSub}
          </text>
        </g>

        {/* Node 4: Decision-1 Gate */}
        <g>
          <rect
            x="92"
            y="58"
            width="82"
            height="34"
            rx="6"
            fill={cDec.fill}
            stroke={cDec.stroke}
            strokeWidth={
              decisionState === 'active' || decisionState === 'looping'
                ? '1.5'
                : '1.1'
            }
          />
          {decisionState === 'active' && (
            <circle
              cx="100"
              cy="67"
              r="2.3"
              fill="var(--sapphire-ice)"
              className="animate-studio-pulse"
            />
          )}
          <text
            x="133"
            y="73"
            textAnchor="middle"
            fill={cDec.titleFill}
            className="font-mono text-[8px] font-semibold"
          >
            Decision-1 Gate
          </text>
          <text
            x="133"
            y="84"
            textAnchor="middle"
            fill={cDec.subFill}
            className="font-mono text-[7.5px]"
          >
            {decisionSub}
          </text>
        </g>

        {/* Node 5: Pass */}
        <g>
          <rect
            x="186"
            y="58"
            width="58"
            height="34"
            rx="6"
            fill={cPass.fill}
            stroke={cPass.stroke}
            strokeWidth={passState === 'passed' ? '1.5' : '1.1'}
          />
          <text
            x="215"
            y="73"
            textAnchor="middle"
            fill={cPass.titleFill}
            className="font-mono text-[8px] font-semibold"
          >
            Pass ✓
          </text>
          <text
            x="215"
            y="84"
            textAnchor="middle"
            fill={cPass.subFill}
            className="font-mono text-[7.5px]"
          >
            {passSub}
          </text>
        </g>
      </svg>
    </section>
  );
}

function ConvergenceSparkline({ iterations }: { iterations: CriticIteration[] }) {
  if (iterations.length === 0) return null;

  const points = iterations.map((it, idx) => ({
    label: it.phase === 'baseline_capture' ? 'B0' : `I${it.iteration ?? idx}`,
    taste: Math.max(0, Math.min(100, it.scorecard?.overallTasteScore ?? 0)),
    slop: Math.max(
      0,
      Math.min(10, it.scorecard?.metrics?.slopPenalty?.value ?? 0)
    ),
    passed: it.scorecard?.passedAllGates ?? false,
  }));

  const width = 236;
  const height = 64;
  const padX = 14;
  const padY = 10;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2 - 12;

  const xAt = (i: number) =>
    points.length === 1
      ? padX + plotW / 2
      : padX + (i / (points.length - 1)) * plotW;

  const yTaste = (val: number) => padY + plotH - (val / 100) * plotH;
  const ySlop = (val: number) => padY + plotH - (val / 10) * plotH;

  const tastePath = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yTaste(p.taste).toFixed(1)}`
    )
    .join(' ');
  const slopPath = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${ySlop(p.slop).toFixed(1)}`
    )
    .join(' ');

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[8.5px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
          Convergence
        </span>
        <div className="flex items-center gap-2 font-mono text-[8.5px]">
          <span className="flex items-center gap-1 text-[var(--emerald)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" />
            Taste
          </span>
          <span className="flex items-center gap-1 text-[var(--vermilion)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--vermilion)]" />
            Slop
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[64px] w-full overflow-visible"
        role="img"
        aria-label="Iteration taste and slop convergence sparkline"
      >
        <line
          x1={padX}
          y1={padY}
          x2={width - padX}
          y2={padY}
          stroke="var(--svg-idle-stroke)"
          strokeDasharray="2 2"
        />
        <line
          x1={padX}
          y1={padY + plotH}
          x2={width - padX}
          y2={padY + plotH}
          stroke="var(--svg-idle-stroke)"
        />
        {points.length > 1 && (
          <path
            d={slopPath}
            fill="none"
            stroke="var(--vermilion)"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        )}
        {points.length > 1 && (
          <path
            d={tastePath}
            fill="none"
            stroke="var(--emerald)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <circle
              cx={xAt(i)}
              cy={ySlop(p.slop)}
              r="2.4"
              fill="var(--bg-card)"
              stroke="var(--vermilion)"
              strokeWidth="1.4"
            />
            <circle
              cx={xAt(i)}
              cy={yTaste(p.taste)}
              r="3"
              fill={p.passed ? 'var(--emerald)' : 'var(--bg-card)'}
              stroke="var(--emerald)"
              strokeWidth="1.6"
            />
            <text
              x={xAt(i)}
              y={height - 2}
              textAnchor="middle"
              fill="var(--ink-secondary)"
              className="font-mono text-[8px]"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const IDLE_QUICK_DIRECTIVES = [
  'Elevate typography & generous editorial spacing',
  'Remove AI-slop gradients and sharpen contrast',
  'Match reference palette & hairline discipline',
];

export function CriticRail({
  collapsed,
  onToggleCollapse,
  scorecard,
  manifest,
  iterations,
  events,
  isRunning,
  activeModeRunning,
  activeJobLabel,
  thinkingBuffer,
  assetsCount,
  drawMode,
  onToggleDrawMode,
  drawnCirclesCount,
  voiceTranscript,
  onVoiceTranscriptChange,
  onVoiceRecorded,
  onSubmitTalkEdit,
  editQueue,
  onRemoveQueuedJob,
}: CriticRailProps) {
  const [inspectCandidate, setInspectCandidate] =
    useState<CandidateResult | null>(null);

  const railVoice = useVoiceRecorder((out) => {
    onVoiceRecorded({
      audioBase64: out.audioBase64,
      mimeType: out.mimeType,
      transcript: out.transcript,
    });
  });

  if (collapsed) {
    return null;
  }

  const latestRaceIteration = [...iterations]
    .reverse()
    .find((it) => it.candidates && it.candidates.length > 1);
  const raceCandidates = latestRaceIteration?.candidates ?? [];

  const totalQueueDisplay = (isRunning ? 1 : 0) + editQueue.length;
  const isFreshIdle =
    !isRunning &&
    !scorecard &&
    !manifest &&
    editQueue.length === 0 &&
    events.length === 0;

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
      {/* Floating 16px-radius Obsidian Director Card mirroring Code Wiki's Gemini panel */}
      <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[16px] border border-[var(--border-card)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
        {/* Top Header: Subtle Taste Index Pill + Code Wiki Collapse Icon (|▸) */}
        <div className="flex h-[50px] shrink-0 items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-2">
            {scorecard ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--emerald)]">
                <span>{scorecard.overallTasteScore.toFixed(1)}</span>
                <span className="opacity-70">/ 100</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--ink-secondary)]">
                <GeminiSparkleMark className="h-3.5 w-3.5" />
                <span>Director</span>
              </span>
            )}
            {isRunning && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--sapphire)] animate-studio-pulse" />
            )}
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse Director panel"
            aria-label="Collapse Director panel"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        {/* Middle Body: Iconic Code Wiki Calm Idle Sparkle OR Active Telemetry Stack */}
        {isFreshIdle ? (
          <div className="codewiki-sparkle-aura flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex flex-col items-center py-4">
              <GeminiSparkleMark className="h-12 w-12" glow />
              <h2 className="mt-5 text-[21px] font-medium tracking-[-0.02em] text-[var(--ink-primary)]">
                Direct this interface
              </h2>
              <p className="mt-2 max-w-[235px] text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                Circle any element on the canvas, snap a reference URL, or speak your taste.
              </p>
            </div>

            {/* Quiet clickable starter directions */}
            <div className="mt-2 flex w-full flex-col gap-1.5">
              {IDLE_QUICK_DIRECTIVES.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onVoiceTranscriptChange(prompt)}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-left text-[11.5px] text-[var(--ink-secondary)] transition-colors hover:border-[var(--sapphire-border)] hover:bg-[var(--sapphire-tint)] hover:text-[var(--ink-primary)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="studio-scroll flex-1 space-y-2.5 overflow-y-auto px-3.5 pb-3 pt-1">
            {/* 1. Sleek Minimal Edit Queue Strip */}
            {totalQueueDisplay > 0 && (
              <section
                aria-label="Live edit queue"
                className="rounded-xl border border-[var(--sapphire-border)] bg-[var(--bg-card-elevated)] p-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-primary)]">
                    Queue ({totalQueueDisplay})
                  </span>
                  <span className="font-mono text-[8.5px] text-[var(--ink-muted)]">
                    auto-dequeue
                  </span>
                </div>

                <div className="space-y-1">
                  {isRunning && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] px-2 py-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sapphire-ice)] animate-studio-pulse" />
                      <span className="shrink-0 font-mono text-[9px] font-semibold text-[var(--sapphire-ice)]">
                        #1
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-primary)]">
                        {activeJobLabel || 'Transforming live app'}
                      </span>
                    </div>
                  )}

                  {editQueue.map((job, idx) => (
                    <div
                      key={job.id}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1"
                    >
                      <span className="shrink-0 font-mono text-[9px] font-semibold text-[var(--ink-muted)]">
                        #{idx + (isRunning ? 2 : 1)}
                      </span>
                      <span
                        title={job.label}
                        className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-primary)]"
                      >
                        &ldquo;{job.label}&rdquo;
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveQueuedJob(job.id)}
                        aria-label={`Remove queued edit ${job.label}`}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--vermilion)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 2. Compact Taste & Slop Score Row */}
            <section
              aria-label="AntiSlop Taste Index summary"
              className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                    Taste Index
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1">
                    <span className="font-serif text-[34px] leading-none tracking-[-0.02em] text-[var(--ink-primary)]">
                      {scorecard ? scorecard.overallTasteScore.toFixed(1) : '—'}
                    </span>
                    <span className="font-mono text-[10.5px] text-[var(--ink-muted)]">
                      /100
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  {scorecard ? (
                    scorecard.passedAllGates ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-2 py-0.5 font-mono text-[9px] font-semibold text-[var(--emerald)]">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        PASS
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--amber-border)] bg-[var(--amber-bg)] px-2 py-0.5 font-mono text-[9px] font-semibold text-[var(--amber)]">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        REFINING
                      </span>
                    )
                  ) : (
                    <span className="rounded-full border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] px-2 py-0.5 font-mono text-[9px] text-[var(--sapphire-ice)]">
                      SCORING
                    </span>
                  )}
                  <span className="font-mono text-[9px] text-[var(--ink-muted)]">
                    {scorecard ? `${Math.round(scorecard.latencyMs)}ms` : 'decision-1'}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5">
                  <div className="font-mono text-[8.5px] uppercase tracking-wider text-[var(--ink-muted)]">
                    Slop ↓
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between">
                    <span
                      className={`font-mono text-[15px] font-semibold ${
                        !scorecard
                          ? 'text-[var(--ink-muted)]'
                          : scorecard.metrics.slopPenalty.passed
                          ? 'text-[var(--emerald)]'
                          : 'text-[var(--vermilion)]'
                      }`}
                    >
                      {scorecard
                        ? scorecard.metrics.slopPenalty.value.toFixed(1)
                        : '—'}
                    </span>
                    <span className="font-mono text-[8.5px] text-[var(--ink-muted)]">
                      /10
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5">
                  <div className="font-mono text-[8.5px] uppercase tracking-wider text-[var(--ink-muted)]">
                    Match ↑
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between">
                    <span
                      className={`font-mono text-[15px] font-semibold ${
                        !scorecard
                          ? 'text-[var(--ink-muted)]'
                          : scorecard.metrics.aestheticMatch.passed
                          ? 'text-[var(--emerald)]'
                          : 'text-[var(--amber)]'
                      }`}
                    >
                      {scorecard
                        ? scorecard.metrics.aestheticMatch.value.toFixed(1)
                        : '—'}
                    </span>
                    <span className="font-mono text-[8.5px] text-[var(--ink-muted)]">
                      /10
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-1 font-mono text-[9px] text-[var(--ink-muted)]">
                <span className="inline-flex items-center gap-1 truncate">
                  <Cpu className="h-2.5 w-2.5 text-[var(--emerald)]" />
                  decision-1
                </span>
                <span className="inline-flex items-center gap-1 truncate">
                  <Sparkles className="h-2.5 w-2.5 text-[var(--sapphire-ice)]" />
                  embed-2:{' '}
                  {typeof scorecard?.embeddingSimilarity === 'number'
                    ? scorecard.embeddingSimilarity.toFixed(2)
                    : '—'}
                </span>
              </div>
            </section>

            {/* 3. Compact Inline SVG Decisions API Pipeline Graph */}
            <DecisionPipelineGraph
              events={events}
              isRunning={isRunning}
              activeModeRunning={activeModeRunning}
              manifest={manifest}
              scorecard={scorecard}
              iterations={iterations}
              assetsCount={assetsCount}
              drawnCirclesCount={drawnCirclesCount}
            />

            {/* 4. Collapsed-by-Default Native <details>: 12-Probe Rubric */}
            <details className="atelier-details rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)]">
              <summary className="flex select-none items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <ChevronDown className="atelier-chevron h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                  <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-primary)]">
                    12-Probe Rubric
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[9px] text-[var(--ink-muted)]">
                  {raceCandidates.length > 1
                    ? `${raceCandidates.length}× Race`
                    : scorecard
                    ? `${scorecard.passedAllGates ? '12/12' : 'inspect'}`
                    : 'details'}
                </span>
              </summary>

              <div className="space-y-2.5 border-t border-[var(--border-subtle)] px-3 py-2.5">
                {/* 4-Way Candidate Race */}
                {raceCandidates.length > 1 && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                        <Layers className="h-3 w-3 text-[var(--sapphire-ice)]" />
                        {raceCandidates.length}× Candidate Race
                      </span>
                      <span className="font-mono text-[8.5px] text-[var(--ink-muted)]">
                        tap to inspect
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
                            className={`overflow-hidden rounded-lg border bg-[var(--bg-card)] text-left transition-colors ${
                              cand.selectedAsWinner
                                ? 'border-[var(--emerald)] ring-1 ring-[var(--emerald-border)]'
                                : 'border-[var(--border-card)] hover:border-[var(--sapphire-border)]'
                            }`}
                          >
                            <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/40">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={cand.strategyLabel}
                                  className="h-full w-full object-cover object-top"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center font-mono text-[8.5px] text-[var(--ink-muted)]">
                                  No preview
                                </div>
                              )}
                              {cand.selectedAsWinner && (
                                <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-[var(--emerald)] px-1 py-0.5 font-mono text-[7.5px] font-bold uppercase text-[#0B0D10]">
                                  <Award className="h-2.5 w-2.5" />
                                  WIN
                                </span>
                              )}
                              <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 font-mono text-[8.5px] font-semibold text-white">
                                {Math.round(cand.scorecard.overallTasteScore)}
                              </span>
                            </div>
                            <div className="px-1.5 py-1">
                              <div className="truncate text-[9.5px] font-medium text-[var(--ink-primary)]">
                                {cand.strategyLabel}
                              </div>
                              <div className="flex items-center justify-between font-mono text-[8px] text-[var(--ink-muted)]">
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
                  </div>
                )}

                <ConvergenceSparkline iterations={iterations} />

                {/* Deterministic DOM Audit */}
                {scorecard?.domAudit && (
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      {
                        label: `${scorecard.domAudit.horizontalOverflowPx}px ovf`,
                        ok: scorecard.domAudit.horizontalOverflowPx <= 2,
                      },
                      {
                        label: `${scorecard.domAudit.overlappingTextNodes} overlap`,
                        ok: scorecard.domAudit.overlappingTextNodes === 0,
                      },
                      {
                        label: `${scorecard.domAudit.brokenImageCount} img err`,
                        ok: scorecard.domAudit.brokenImageCount === 0,
                      },
                      {
                        label: `${scorecard.domAudit.consoleErrorCount} console`,
                        ok: scorecard.domAudit.consoleErrorCount === 0,
                      },
                    ].map((pill) => (
                      <div
                        key={pill.label}
                        className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] ${
                          pill.ok
                            ? 'border-[var(--emerald-border)] bg-[var(--emerald-bg)] text-[var(--emerald)]'
                            : 'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)]'
                        }`}
                      >
                        <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{pill.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 6 Score Probe Bars */}
                {scorecard ? (
                  <>
                    <div className="space-y-1.5">
                      {scoreMetrics.map((m) => {
                        const pct = Math.max(0, Math.min(100, (m.value / 10) * 100));
                        const isInverse = m.id.toLowerCase().includes('slop');
                        return (
                          <div key={m.id} className="space-y-0.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="truncate font-medium text-[var(--ink-primary)]">
                                {m.label}
                              </span>
                              <span className="shrink-0 font-mono text-[9.5px]">
                                <strong
                                  className={
                                    m.passed
                                      ? 'text-[var(--emerald)]'
                                      : 'text-[var(--vermilion)]'
                                  }
                                >
                                  {m.value.toFixed(1)}
                                </strong>
                                <span className="text-[var(--ink-muted)]">
                                  /10 · {Math.round(m.confidence * 100)}%
                                </span>
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle-hover)]">
                              <div
                                style={{ width: `${pct}%` }}
                                className={`h-full rounded-full transition-all duration-300 ${
                                  m.passed
                                    ? 'bg-[var(--emerald)]'
                                    : isInverse
                                    ? 'bg-[var(--vermilion)]'
                                    : 'bg-[var(--amber)]'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 4 Noul Probability Gates */}
                    <div className="grid grid-cols-2 gap-1">
                      {noulMetrics.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-md border px-1.5 py-1 ${
                            m.passed
                              ? 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
                              : 'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)]'
                          }`}
                        >
                          <div className="truncate text-[9px] font-medium text-[var(--ink-primary)]">
                            {m.label}
                          </div>
                          <div className="flex items-baseline justify-between font-mono">
                            <span
                              className={`text-[11px] font-semibold ${
                                m.passed
                                  ? 'text-[var(--emerald)]'
                                  : 'text-[var(--vermilion)]'
                              }`}
                            >
                              {Math.round(m.value * 100)}%
                            </span>
                            <span className="text-[8px] text-[var(--ink-muted)]">
                              {Math.round(m.confidence * 100)}%c
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 2 Choice Classifications */}
                    <div className="grid grid-cols-2 gap-1">
                      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-1">
                        <div className="font-mono text-[8px] uppercase text-[var(--ink-muted)]">
                          Class
                        </div>
                        <div className="truncate font-mono text-[9.5px] font-semibold text-[var(--ink-primary)]">
                          {scorecard.metrics.dominantAestheticClass.choiceLabel || '—'}
                        </div>
                      </div>
                      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-1">
                        <div className="font-mono text-[8px] uppercase text-[var(--ink-muted)]">
                          Defect
                        </div>
                        <div
                          className={`truncate font-mono text-[9.5px] font-semibold ${
                            scorecard.metrics.primaryDefectClass.choiceLabel === 'none'
                              ? 'text-[var(--emerald)]'
                              : 'text-[var(--amber)]'
                          }`}
                        >
                          {scorecard.metrics.primaryDefectClass.choiceLabel || '—'}
                        </div>
                      </div>
                    </div>

                    {scorecard.criticActionDirective && (
                      <p className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1.5 text-[10px] leading-snug text-[var(--ink-secondary)]">
                        <strong className="font-mono text-[8.5px] uppercase text-[var(--ink-primary)]">
                          Directive:{' '}
                        </strong>
                        {scorecard.criticActionDirective}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="py-2 text-center font-mono text-[9.5px] text-[var(--ink-muted)]">
                    Calibrated 12-probe scores populate live as each render finishes.
                  </p>
                )}
              </div>
            </details>

            {/* 5. Collapsed-by-Default Native <details>: Manifest & Stream */}
            <details className="atelier-details rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)]">
              <summary className="flex select-none items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-[var(--bg-subtle)]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <ChevronDown className="atelier-chevron h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                  <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-primary)]">
                    Manifest &amp; Stream
                  </span>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[9px] text-[var(--ink-muted)]">
                  <Activity className="h-2.5 w-2.5" />
                  {events.length} ev
                </span>
              </summary>

              <div className="space-y-2 border-t border-[var(--border-subtle)] px-3 py-2.5">
                {manifest && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2">
                    <span className="font-serif text-[16px] leading-tight text-[var(--ink-primary)]">
                      {manifest.vibeTitle}
                    </span>
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
                          className="h-3.5 flex-1 rounded-[3px] border border-white/15"
                        />
                      ))}
                    </div>
                    <div className="mt-1 truncate font-mono text-[8.5px] text-[var(--ink-muted)]">
                      {manifest.tokens.typography.displayFont} +{' '}
                      {manifest.tokens.typography.bodyFont}
                    </div>
                  </div>
                )}

                {thinkingBuffer && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1.5 font-mono text-[9.5px] leading-relaxed text-[var(--ink-secondary)]">
                    <div className="mb-0.5 text-[8.5px] font-semibold uppercase text-[var(--sapphire-ice)]">
                      Director Thinking
                    </div>
                    <p className="line-clamp-4 whitespace-pre-wrap">
                      {thinkingBuffer}
                    </p>
                  </div>
                )}

                <div className="studio-scroll max-h-[180px] space-y-1 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1.5">
                  {events.length === 0 ? (
                    <p className="py-3 text-center font-mono text-[9.5px] text-[var(--ink-muted)]">
                      Live Gemini 4 stream idle.
                    </p>
                  ) : (
                    [...events].reverse().map((ev, idx) => {
                      const badge = modelBadgeStyle(ev.model);
                      return (
                        <div
                          key={`${ev.timestamp}-${idx}`}
                          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-2 py-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`rounded border px-1 font-mono text-[8px] font-medium ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <span className="font-mono text-[8px] text-[var(--ink-muted)]">
                              {new Date(ev.timestamp).toLocaleTimeString([], {
                                hour12: false,
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[9.5px] leading-snug text-[var(--ink-primary)]">
                            {ev.message}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </details>
          </div>
        )}

        {/* Bottom-Anchored Code Wiki Pill Input + Voice Bar */}
        <div className="shrink-0 px-3.5 pb-3.5 pt-2">
          {/* Live Voice Waveform Strip right above Pill when recording/transcribing */}
          {(railVoice.isRecording || railVoice.isTranscribing) && (
            <div className="mb-2 flex h-7 items-center justify-between gap-2 rounded-full border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-3">
              {railVoice.isTranscribing ? (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--amber)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Transcribing with gemini-3.5-transcribe…
                </span>
              ) : (
                <>
                  <span className="font-mono text-[10px] font-medium text-[var(--vermilion)]">
                    REC 0:{String(railVoice.durationSec).padStart(2, '0')}
                  </span>
                  <div className="flex h-3.5 items-center gap-[2px]">
                    {railVoice.levels.slice(0, 14).map((lvl, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${Math.round(lvl * 100)}%` }}
                        className="w-[2px] rounded-full bg-[var(--vermilion)] transition-[height] duration-75"
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {railVoice.error && (
            <p className="mb-1.5 px-2 text-[10px] text-[var(--vermilion)]">
              {railVoice.error}
            </p>
          )}

          {/* Sculptural Bottom Pill Composer (Code Wiki exact aesthetic) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitTalkEdit();
            }}
            className="flex items-center gap-1 rounded-full border border-[var(--border-card)] bg-[var(--bg-composer)] py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-[var(--sapphire-ice)]"
          >
            <input
              type="text"
              value={voiceTranscript}
              onChange={(e) => onVoiceTranscriptChange(e.target.value)}
              placeholder={
                isRunning
                  ? 'Queue next edit while building…'
                  : 'Speak or direct a change…'
              }
              aria-label="Speak or direct a change"
              className="h-7 min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none"
            />

            {/* Live Mic Button */}
            <button
              type="button"
              onClick={railVoice.toggleRecording}
              aria-label={railVoice.isRecording ? 'Stop recording voice' : 'Record voice direction'}
              title={
                railVoice.isRecording
                  ? 'Stop recording'
                  : 'Speak naturally (gemini-3.5-transcribe)'
              }
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                railVoice.isRecording
                  ? 'bg-[var(--vermilion)] text-white'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--vermilion)]'
              }`}
            >
              {railVoice.isRecording ? (
                <Square className="h-2.5 w-2.5 fill-current" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Circle Mode Toggle */}
            <button
              type="button"
              onClick={onToggleDrawMode}
              aria-label="Toggle draw circle mode"
              title="Circle elements on the live canvas"
              className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                drawMode
                  ? 'bg-[var(--vermilion)] text-white'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <Pencil className="h-3.5 w-3.5" />
              {drawnCirclesCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--vermilion)] px-1 font-mono text-[8px] font-bold text-white ring-1 ring-[var(--bg-composer)]">
                  {drawnCirclesCount}
                </span>
              )}
            </button>

            {/* Send / Queue Button */}
            <button
              type="submit"
              disabled={!voiceTranscript.trim() && drawnCirclesCount === 0}
              aria-label={isRunning ? 'Queue edit' : 'Apply edit'}
              title={
                isRunning
                  ? 'Add edit to live queue (auto-runs next)'
                  : 'Apply direction now'
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--btn-primary-bg)] text-white transition-colors hover:bg-[var(--btn-primary-hover)] disabled:cursor-not-allowed disabled:bg-transparent disabled:text-[var(--ink-muted)]"
            >
              {isRunning ? (
                <Plus className="h-3.5 w-3.5" />
              ) : (
                <SendHorizontal className="h-3.5 w-3.5" />
              )}
            </button>
          </form>

          <p className="mt-2 text-center text-[10px] text-[var(--ink-muted)]">
            Gemini 4 + calibrated Decisions API · Voice via 3.5-transcribe
          </p>
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
            <div className="overflow-hidden rounded-xl border border-[var(--border-card)] bg-black/30">
              {resolveBackendUrl(inspectCandidate.screenshotUrl) ? (
                <img
                  src={resolveBackendUrl(inspectCandidate.screenshotUrl)}
                  alt={inspectCandidate.strategyLabel}
                  className="w-full object-contain"
                />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[var(--ink-secondary)]">
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
