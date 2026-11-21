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
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Cpu,
  Gauge,
  Layers,
  Loader2,
  Mic,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { resolveBackendUrl } from '@/lib/api';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
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
      label: 'Banana 2.1',
      className: 'border-[#B45309]/40 bg-[#FEF6EC] text-[#B45309]',
    };
  }
  if (m.includes('embed')) {
    return {
      label: 'Embed-2',
      className: 'border-[#141413]/30 bg-[#F5F3EE] text-[#141413]',
    };
  }
  if (m.includes('transcribe') || m.includes('live')) {
    return {
      label: '3.5-Trans',
      className: 'border-[#E03E2D]/30 bg-[#FDF1EF] text-[#E03E2D]',
    };
  }
  return {
    label: model ? model.slice(0, 12) : 'Engine',
    className: 'border-[#E5E1D8] bg-[#F5F3EE] text-[#64625D]',
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
      fill: '#EEF8F1',
      stroke: '#15803D',
      titleFill: '#141413',
      subFill: '#15803D',
    };
  }
  if (state === 'active') {
    return {
      fill: '#FDF1EF',
      stroke: '#E03E2D',
      titleFill: '#141413',
      subFill: '#E03E2D',
    };
  }
  if (state === 'looping') {
    return {
      fill: '#FEF6EC',
      stroke: '#B45309',
      titleFill: '#141413',
      subFill: '#B45309',
    };
  }
  return {
    fill: '#FAF8F4',
    stroke: '#DCD7CC',
    titleFill: '#141413',
    subFill: '#64625D',
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

  // Derive live node states
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

  // Real latencies for crisp sub-labels
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
      className="rounded-[7px] border border-[#E5E1D8] bg-[#FFFFFF] p-2"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.11em] text-[#64625D]">
          Decisions API Pipeline
        </span>
        {loopActive ? (
          <span className="rounded bg-[#FEF6EC] px-1.5 py-0.5 font-mono text-[8px] font-semibold text-[#B45309]">
            Auto-Fix ↺
          </span>
        ) : hasPassed ? (
          <span className="font-mono text-[8.5px] font-semibold text-[#15803D]">
            Verified ✓
          </span>
        ) : isRunning ? (
          <span className="font-mono text-[8.5px] font-medium text-[#E03E2D]">
            Live
          </span>
        ) : (
          <span className="font-mono text-[8px] text-[#64625D]">
            decision-1
          </span>
        )}
      </div>

      <svg
        viewBox="0 0 248 122"
        className="h-[122px] w-full overflow-visible"
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
            <path d="M 0 1 L 7 4 L 0 7 z" fill="#BEB8AB" />
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
            <path d="M 0 1 L 7 4 L 0 7 z" fill="#15803D" />
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
            <path d="M 0 1 L 7 4 L 0 7 z" fill="#E03E2D" />
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
            <path d="M 0 1 L 7 4 L 0 7 z" fill="#B45309" />
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
              ? '#E03E2D'
              : directorState === 'passed'
              ? '#15803D'
              : '#BEB8AB'
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

        {/* Connector 2: Director -> Neon Coder (clean stepped spine, zero crossings) */}
        <path
          d="M 190 38 L 190 47 L 42 47 L 42 56"
          fill="none"
          stroke={
            coderState === 'active'
              ? '#E03E2D'
              : coderState === 'passed' || coderState === 'looping'
              ? '#15803D'
              : '#BEB8AB'
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
              ? '#E03E2D'
              : decisionState === 'passed' || decisionState === 'looping'
              ? '#15803D'
              : '#BEB8AB'
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

        {/* Connector 4: Decision-1 Gate -> Pass ✓ */}
        <line
          x1="174"
          y1="75"
          x2="184"
          y2="75"
          stroke={passState === 'passed' ? '#15803D' : '#BEB8AB'}
          strokeWidth="1.4"
          markerEnd={
            passState === 'passed' ? 'url(#as-arrow-ok)' : 'url(#as-arrow-idle)'
          }
        />

        {/* Curved Loop-Back Arrow: Decision-1 Gate -> Neon Coder (Auto-Fix ↺) */}
        <path
          d="M 133 93 C 133 114, 42 114, 42 95"
          fill="none"
          stroke={loopActive ? '#B45309' : '#D8D2C5'}
          strokeWidth={loopActive ? '1.7' : '1.2'}
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
          fill={loopActive ? '#FEF6EC' : '#FFFFFF'}
          stroke={loopActive ? '#B45309' : '#E5E1D8'}
          strokeWidth="0.9"
        />
        <text
          x="88"
          y="113"
          textAnchor="middle"
          className={`font-mono text-[7.5px] font-semibold ${
            loopActive ? 'fill-[#B45309]' : 'fill-[#8A867E]'
          }`}
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
            rx="5"
            fill={cRef.fill}
            stroke={cRef.stroke}
            strokeWidth={refState === 'active' ? '1.6' : '1.1'}
          />
          {refState === 'active' && (
            <circle cx="13" cy="15" r="2.5" fill="#E03E2D" className="animate-studio-pulse" />
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
            rx="5"
            fill={cDir.fill}
            stroke={cDir.stroke}
            strokeWidth={directorState === 'active' ? '1.6' : '1.1'}
          />
          {directorState === 'active' && (
            <circle cx="145" cy="15" r="2.5" fill="#E03E2D" className="animate-studio-pulse" />
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
            rx="5"
            fill={cCode.fill}
            stroke={cCode.stroke}
            strokeWidth={
              coderState === 'active' || coderState === 'looping' ? '1.6' : '1.1'
            }
          />
          {(coderState === 'active' || coderState === 'looping') && (
            <circle
              cx="12"
              cy="67"
              r="2.4"
              fill={coderState === 'looping' ? '#B45309' : '#E03E2D'}
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
            rx="5"
            fill={cDec.fill}
            stroke={cDec.stroke}
            strokeWidth={
              decisionState === 'active' || decisionState === 'looping'
                ? '1.6'
                : '1.1'
            }
          />
          {decisionState === 'active' && (
            <circle cx="100" cy="67" r="2.4" fill="#E03E2D" className="animate-studio-pulse" />
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

        {/* Node 5: Pass ✓ */}
        <g>
          <rect
            x="186"
            y="58"
            width="58"
            height="34"
            rx="5"
            fill={cPass.fill}
            stroke={cPass.stroke}
            strokeWidth={passState === 'passed' ? '1.6' : '1.1'}
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
    <div className="rounded-[6px] border border-[#E5E1D8] bg-[#FAF8F4] p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[8.5px] font-semibold uppercase tracking-wider text-[#64625D]">
          Convergence
        </span>
        <div className="flex items-center gap-2 font-mono text-[8.5px]">
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
        className="h-[64px] w-full overflow-visible"
        role="img"
        aria-label="Iteration taste and slop convergence sparkline"
      >
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
        {points.length > 1 && (
          <path
            d={slopPath}
            fill="none"
            stroke="#E03E2D"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        )}
        {points.length > 1 && (
          <path
            d={tastePath}
            fill="none"
            stroke="#15803D"
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
              fill="#FFFFFF"
              stroke="#E03E2D"
              strokeWidth="1.4"
            />
            <circle
              cx={xAt(i)}
              cy={yTaste(p.taste)}
              r="3"
              fill={p.passed ? '#15803D' : '#FFFFFF'}
              stroke="#15803D"
              strokeWidth="1.6"
            />
            <text
              x={xAt(i)}
              y={height - 2}
              textAnchor="middle"
              className="fill-[#64625D] font-mono text-[8px]"
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

  const latestRaceIteration = [...iterations]
    .reverse()
    .find((it) => it.candidates && it.candidates.length > 1);
  const raceCandidates = latestRaceIteration?.candidates ?? [];

  const totalQueueDisplay = (isRunning ? 1 : 0) + editQueue.length;

  if (collapsed) {
    return (
      <aside className="flex h-full w-full flex-col items-center justify-between border-l border-[#E5E1D8] bg-[#FFFFFF] py-2.5">
        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand Talk & Critic Rail"
            aria-label="Expand Talk & Critic Rail"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E5E1D8] bg-[#F5F3EE] text-[#141413] hover:border-[#141413]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="h-px w-5 bg-[#E5E1D8]" />
          <button
            type="button"
            onClick={railVoice.toggleRecording}
            title="Speak edit instruction"
            className={`flex h-7 w-7 items-center justify-center rounded-md ${
              railVoice.isRecording
                ? 'bg-[#E03E2D] text-white'
                : 'text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#141413]'
            }`}
          >
            <Mic className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-col items-center">
            <span className="font-serif text-[19px] leading-none text-[#141413]">
              {scorecard ? Math.round(scorecard.overallTasteScore) : '—'}
            </span>
            <span className="mt-0.5 font-mono text-[7.5px] uppercase text-[#64625D]">
              TASTE
            </span>
          </div>
          {totalQueueDisplay > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E03E2D] px-1 font-mono text-[9px] font-bold text-white"
              title={`${totalQueueDisplay} active/queued edit(s)`}
            >
              {totalQueueDisplay}
            </span>
          )}
        </div>
        <Gauge className="h-3.5 w-3.5 text-[#64625D]" />
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
      <aside className="flex h-full w-full min-w-0 flex-col border-l border-[#E5E1D8] bg-[#FFFFFF]">
        {/* Minimal Rail Header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#E5E1D8] px-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#141413]">
              Direct &amp; Critic
            </span>
            {isRunning && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#E03E2D] animate-studio-pulse" />
            )}
          </div>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse Critic Rail (expand canvas)"
            aria-label="Collapse Critic Rail"
            className="flex h-6 w-6 items-center justify-center rounded border border-[#E5E1D8] bg-[#FAF8F4] text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable Right Rail Stack */}
        <div className="studio-scroll flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2.5">
          {/* 1. ALWAYS-READY CONTINUOUS TALK / SPEAK & CIRCLE */}
          <section
            aria-label="Continuous talk and circle edit controls"
            className="rounded-[7px] border border-[#E5E1D8] bg-[#FAF8F4] p-2"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64625D]">
                Talk &amp; Circle
              </span>
              <span className="font-mono text-[8.5px] text-[#64625D]">
                {isRunning ? 'queue ready' : '3.5-transcribe'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={railVoice.toggleRecording}
                className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-[5px] text-[11px] font-medium transition-colors ${
                  railVoice.isRecording
                    ? 'bg-[#E03E2D] text-white'
                    : 'border border-[#E5E1D8] bg-white text-[#141413] hover:border-[#141413]'
                }`}
              >
                {railVoice.isRecording ? (
                  <>
                    <Square className="h-2.5 w-2.5 fill-current" />
                    <span className="font-mono text-[10px]">
                      0:{String(railVoice.durationSec).padStart(2, '0')}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3 w-3 text-[#E03E2D]" />
                    <span>Speak</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleDrawMode}
                className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-[5px] border text-[11px] font-medium transition-colors ${
                  drawMode
                    ? 'border-[#E03E2D] bg-[#E03E2D] text-white'
                    : 'border-[#E5E1D8] bg-white text-[#141413] hover:border-[#141413]'
                }`}
                title="Circle regions directly on the live canvas"
              >
                <Pencil className="h-3 w-3" />
                <span>Circle</span>
                {drawnCirclesCount > 0 && (
                  <span
                    className={`rounded-full px-1 font-mono text-[9px] ${
                      drawMode
                        ? 'bg-white/25 text-white'
                        : 'bg-[#FDF1EF] text-[#E03E2D]'
                    }`}
                  >
                    {drawnCirclesCount}
                  </span>
                )}
              </button>
            </div>

            {/* Live Waveform or Transcribing Indicator */}
            {(railVoice.isRecording || railVoice.isTranscribing) && (
              <div className="mt-1.5 flex h-5 items-center justify-center gap-[2px] rounded border border-[#E5E1D8] bg-white px-2">
                {railVoice.isTranscribing ? (
                  <span className="flex items-center gap-1 font-mono text-[9px] text-[#B45309]">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Transcribing voice…
                  </span>
                ) : (
                  railVoice.levels.slice(0, 16).map((lvl, idx) => (
                    <span
                      key={idx}
                      style={{ height: `${Math.round(lvl * 100)}%` }}
                      className="w-[2.5px] rounded-full bg-[#E03E2D] transition-[height] duration-75"
                    />
                  ))
                )}
              </div>
            )}

            {railVoice.error && (
              <p className="mt-1 text-[9.5px] text-[#E03E2D]">{railVoice.error}</p>
            )}

            {/* Instant Edit Prompt / Transcript + Apply or Queue */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSubmitTalkEdit();
              }}
              className="mt-1.5 flex items-center gap-1"
            >
              <input
                type="text"
                value={voiceTranscript}
                onChange={(e) => onVoiceTranscriptChange(e.target.value)}
                placeholder={
                  isRunning
                    ? 'Queue next edit while building…'
                    : 'Speak or type an edit…'
                }
                aria-label="Edit instruction or voice transcript"
                className="h-7 min-w-0 flex-1 rounded-[5px] border border-[#E5E1D8] bg-white px-2 text-[11px] text-[#141413] placeholder:text-[#96928A] focus:border-[#141413] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!voiceTranscript.trim() && drawnCirclesCount === 0}
                title={
                  isRunning
                    ? 'Add edit to live queue (auto-runs next)'
                    : 'Apply surgical edit now'
                }
                className="flex h-7 shrink-0 items-center gap-1 rounded-[5px] bg-[#141413] px-2 font-mono text-[10px] font-medium text-white transition-colors hover:bg-[#E03E2D] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isRunning ? (
                  <>
                    <Plus className="h-3 w-3" />
                    <span>Queue</span>
                  </>
                ) : (
                  <>
                    <CornerDownLeft className="h-3 w-3" />
                    <span>Go</span>
                  </>
                )}
              </button>
            </form>
          </section>

          {/* 2. VISIBLE LIVE EDIT QUEUE STRIP */}
          {totalQueueDisplay > 0 && (
            <section
              aria-label="Live edit queue"
              className="rounded-[7px] border border-[#141413]/20 bg-[#FAF8F4] p-2"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#141413]">
                  Queue ({totalQueueDisplay})
                </span>
                <span className="font-mono text-[8.5px] text-[#64625D]">
                  auto-dequeue
                </span>
              </div>

              <div className="space-y-1">
                {isRunning && (
                  <div className="flex items-center gap-1.5 rounded-[5px] border border-[#E03E2D]/30 bg-[#FDF1EF] px-2 py-1">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#E03E2D] animate-studio-pulse" />
                    <span className="shrink-0 font-mono text-[9px] font-semibold text-[#E03E2D]">
                      #1 Active
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-[#141413]">
                      {activeJobLabel || 'Transforming live app'}
                    </span>
                  </div>
                )}

                {editQueue.map((job, idx) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-1.5 rounded-[5px] border border-[#E5E1D8] bg-white px-2 py-1"
                  >
                    <span className="shrink-0 font-mono text-[9px] font-semibold text-[#64625D]">
                      #{idx + (isRunning ? 2 : 1)}
                    </span>
                    <span
                      title={job.label}
                      className="min-w-0 flex-1 truncate text-[10.5px] text-[#141413]"
                    >
                      &ldquo;{job.label}&rdquo;
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveQueuedJob(job.id)}
                      aria-label={`Remove queued edit ${job.label}`}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#E03E2D]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. COMPACT HEADLINE TASTE INDEX CARD */}
          <section
            aria-label="AntiSlop Taste Index summary"
            className="rounded-[7px] border border-[#E5E1D8] bg-[#FAF8F4] p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[#64625D]">
                  Taste Index
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="font-serif text-[38px] leading-none tracking-[-0.03em] text-[#141413]">
                    {scorecard ? Math.round(scorecard.overallTasteScore) : '—'}
                  </span>
                  <span className="font-mono text-[10px] text-[#64625D]">
                    /100
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                {scorecard ? (
                  scorecard.passedAllGates ? (
                    <span className="inline-flex items-center gap-1 rounded border border-[#15803D]/30 bg-[#EEF8F1] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#15803D]">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      PASS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded border border-[#B45309]/30 bg-[#FEF6EC] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#B45309]">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      REFINING
                    </span>
                  )
                ) : (
                  <span className="rounded border border-[#E5E1D8] bg-white px-1.5 py-0.5 font-mono text-[9px] text-[#64625D]">
                    READY
                  </span>
                )}
                <span className="font-mono text-[8.5px] text-[#64625D]">
                  {scorecard ? `${Math.round(scorecard.latencyMs)}ms` : '0 out tok'}
                </span>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <div className="rounded-[5px] border border-[#E5E1D8] bg-white px-2 py-1.5">
                <div className="font-mono text-[8.5px] uppercase tracking-wider text-[#64625D]">
                  Slop ↓
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span
                    className={`font-mono text-[15px] font-semibold ${
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
                  <span className="font-mono text-[8.5px] text-[#64625D]">/10</span>
                </div>
              </div>

              <div className="rounded-[5px] border border-[#E5E1D8] bg-white px-2 py-1.5">
                <div className="font-mono text-[8.5px] uppercase tracking-wider text-[#64625D]">
                  Match ↑
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span
                    className={`font-mono text-[15px] font-semibold ${
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
                  <span className="font-mono text-[8.5px] text-[#64625D]">/10</span>
                </div>
              </div>
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-1 font-mono text-[8.5px] text-[#64625D]">
              <span className="inline-flex items-center gap-1 truncate">
                <Cpu className="h-2.5 w-2.5 text-[#15803D]" />
                decision-1
              </span>
              <span className="inline-flex items-center gap-1 truncate">
                <Sparkles className="h-2.5 w-2.5 text-[#E03E2D]" />
                embed-2:{' '}
                {typeof scorecard?.embeddingSimilarity === 'number'
                  ? scorecard.embeddingSimilarity.toFixed(2)
                  : '—'}
              </span>
            </div>
          </section>

          {/* 4. VISUAL DECISIONS API PIPELINE GRAPH */}
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

          {/* 5. COLLAPSIBLE 12-PROBE RUBRIC & 4-WAY CANDIDATE RACE */}
          <details className="atelier-details rounded-[7px] border border-[#E5E1D8] bg-[#FFFFFF]">
            <summary className="flex items-center justify-between gap-2 px-2.5 py-2 select-none hover:bg-[#FAF8F4]">
              <div className="flex min-w-0 items-center gap-1.5">
                <ChevronDown className="atelier-chevron h-3.5 w-3.5 shrink-0 text-[#64625D]" />
                <span className="truncate font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#141413]">
                  12-Probe Rubric
                </span>
              </div>
              <span className="shrink-0 font-mono text-[8.5px] text-[#64625D]">
                {raceCandidates.length > 1
                  ? `${raceCandidates.length}× Race`
                  : scorecard
                  ? `${scorecard.passedAllGates ? '12/12' : 'inspect'}`
                  : 'details'}
              </span>
            </summary>

            <div className="space-y-2.5 border-t border-[#E5E1D8] px-2.5 py-2.5">
              {/* 4-Way Parallel Candidate Race Thumbnails */}
              {raceCandidates.length > 1 && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 font-mono text-[8.5px] font-semibold uppercase tracking-wider text-[#141413]">
                      <Layers className="h-3 w-3" />
                      {raceCandidates.length}× Candidate Race
                    </span>
                    <span className="font-mono text-[8px] text-[#64625D]">
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
                          className={`overflow-hidden rounded-[5px] border bg-white text-left transition-colors ${
                            cand.selectedAsWinner
                              ? 'border-[#15803D] ring-1 ring-[#15803D]/30'
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
                              <div className="flex h-full items-center justify-center font-mono text-[8.5px] text-[#64625D]">
                                No preview
                              </div>
                            )}
                            {cand.selectedAsWinner && (
                              <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-[#15803D] px-1 py-0.5 font-mono text-[7.5px] font-bold uppercase text-white">
                                <Award className="h-2.5 w-2.5" />
                                WIN
                              </span>
                            )}
                            <span className="absolute bottom-1 right-1 rounded bg-[#141413]/85 px-1 py-0.5 font-mono text-[8.5px] font-semibold text-white">
                              {Math.round(cand.scorecard.overallTasteScore)}
                            </span>
                          </div>
                          <div className="px-1.5 py-1">
                            <div className="truncate text-[9.5px] font-medium text-[#141413]">
                              {cand.strategyLabel}
                            </div>
                            <div className="flex items-center justify-between font-mono text-[8px] text-[#64625D]">
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

              {/* Convergence Sparkline */}
              <ConvergenceSparkline iterations={iterations} />

              {/* Deterministic Puppeteer DOM Audit */}
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
                      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                        pill.ok
                          ? 'border-[#15803D]/25 bg-[#EEF8F1] text-[#15803D]'
                          : 'border-[#E03E2D]/30 bg-[#FDF1EF] text-[#E03E2D]'
                      }`}
                    >
                      <ShieldCheck className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{pill.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 6 Calibrated Score Probe Bars */}
              {scorecard ? (
                <>
                  <div className="space-y-1.5">
                    {scoreMetrics.map((m) => {
                      const pct = Math.max(0, Math.min(100, (m.value / 10) * 100));
                      const isInverse = m.id.toLowerCase().includes('slop');
                      return (
                        <div key={m.id} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="truncate font-medium text-[#141413]">
                              {m.label}
                            </span>
                            <span className="shrink-0 font-mono text-[9.5px]">
                              <strong
                                className={
                                  m.passed ? 'text-[#15803D]' : 'text-[#E03E2D]'
                                }
                              >
                                {m.value.toFixed(1)}
                              </strong>
                              <span className="text-[#64625D]">
                                /10 · {Math.round(m.confidence * 100)}%
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
                  <div className="grid grid-cols-2 gap-1">
                    {noulMetrics.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded border px-1.5 py-1 ${
                          m.passed
                            ? 'border-[#E5E1D8] bg-[#FAF8F4]'
                            : 'border-[#E03E2D]/35 bg-[#FDF1EF]'
                        }`}
                      >
                        <div className="truncate text-[9px] font-medium text-[#141413]">
                          {m.label}
                        </div>
                        <div className="flex items-baseline justify-between font-mono">
                          <span
                            className={`text-[11px] font-semibold ${
                              m.passed ? 'text-[#15803D]' : 'text-[#E03E2D]'
                            }`}
                          >
                            {Math.round(m.value * 100)}%
                          </span>
                          <span className="text-[8px] text-[#64625D]">
                            {Math.round(m.confidence * 100)}%c
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 2 Choice Classifications */}
                  <div className="grid grid-cols-2 gap-1">
                    <div className="rounded border border-[#E5E1D8] bg-[#FAF8F4] px-1.5 py-1">
                      <div className="font-mono text-[8px] uppercase text-[#64625D]">
                        Class
                      </div>
                      <div className="truncate font-mono text-[9.5px] font-semibold text-[#141413]">
                        {scorecard.metrics.dominantAestheticClass.choiceLabel || '—'}
                      </div>
                    </div>
                    <div className="rounded border border-[#E5E1D8] bg-[#FAF8F4] px-1.5 py-1">
                      <div className="font-mono text-[8px] uppercase text-[#64625D]">
                        Defect
                      </div>
                      <div
                        className={`truncate font-mono text-[9.5px] font-semibold ${
                          scorecard.metrics.primaryDefectClass.choiceLabel === 'none'
                            ? 'text-[#15803D]'
                            : 'text-[#B45309]'
                        }`}
                      >
                        {scorecard.metrics.primaryDefectClass.choiceLabel || '—'}
                      </div>
                    </div>
                  </div>

                  {scorecard.criticActionDirective && (
                    <p className="rounded border border-[#E5E1D8] bg-[#FAF8F4] px-2 py-1.5 text-[10px] leading-snug text-[#141413]">
                      <strong className="font-mono text-[8.5px] uppercase text-[#64625D]">
                        Directive:{' '}
                      </strong>
                      {scorecard.criticActionDirective}
                    </p>
                  )}
                </>
              ) : (
                <p className="py-2 text-center font-mono text-[9.5px] text-[#64625D]">
                  Run Transform or Circle-to-Tweak to populate all 12 calibrated probes.
                </p>
              )}
            </div>
          </details>

          {/* 6. COLLAPSIBLE MANIFEST & LIVE TELEMETRY FEED */}
          <details className="atelier-details rounded-[7px] border border-[#E5E1D8] bg-[#FFFFFF]">
            <summary className="flex items-center justify-between gap-2 px-2.5 py-2 select-none hover:bg-[#FAF8F4]">
              <div className="flex min-w-0 items-center gap-1.5">
                <ChevronDown className="atelier-chevron h-3.5 w-3.5 shrink-0 text-[#64625D]" />
                <span className="truncate font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#141413]">
                  Manifest &amp; Stream
                </span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[8.5px] text-[#64625D]">
                <Activity className="h-2.5 w-2.5" />
                {events.length} ev
              </span>
            </summary>

            <div className="space-y-2 border-t border-[#E5E1D8] px-2.5 py-2.5">
              {manifest && (
                <div className="rounded-[6px] border border-[#E5E1D8] bg-[#FAF8F4] p-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-serif text-[16px] leading-tight text-[#141413]">
                      {manifest.vibeTitle}
                    </span>
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
                        className="h-3.5 flex-1 rounded-[2px] border border-[#141413]/15"
                      />
                    ))}
                  </div>
                  <div className="mt-1 truncate font-mono text-[8.5px] text-[#64625D]">
                    {manifest.tokens.typography.displayFont} +{' '}
                    {manifest.tokens.typography.bodyFont}
                  </div>
                </div>
              )}

              {thinkingBuffer && (
                <div className="rounded-[6px] border border-[#141413]/15 bg-[#FAF8F4] px-2 py-1.5 font-mono text-[9.5px] leading-relaxed text-[#64625D]">
                  <div className="mb-0.5 text-[8.5px] font-semibold uppercase text-[#141413]">
                    Director Thinking
                  </div>
                  <p className="line-clamp-4 whitespace-pre-wrap">
                    {thinkingBuffer}
                  </p>
                </div>
              )}

              <div className="studio-scroll max-h-[180px] space-y-1 overflow-y-auto rounded-[6px] border border-[#E5E1D8] bg-[#FAF8F4] p-1.5">
                {events.length === 0 ? (
                  <p className="py-3 text-center font-mono text-[9.5px] text-[#64625D]">
                    Live Gemini 4 stream idle.
                  </p>
                ) : (
                  [...events].reverse().map((ev, idx) => {
                    const badge = modelBadgeStyle(ev.model);
                    return (
                      <div
                        key={`${ev.timestamp}-${idx}`}
                        className="rounded border border-[#E5E1D8] bg-white px-2 py-1"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`rounded border px-1 font-mono text-[8px] font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          <span className="font-mono text-[8px] text-[#64625D]">
                            {new Date(ev.timestamp).toLocaleTimeString([], {
                              hour12: false,
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[9.5px] leading-snug text-[#141413]">
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
