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
  ArrowUp,
  Award,
  ChevronDown,
  Layers,
  Loader2,
  Mic,
  PanelRightClose,
  Pencil,
  Plus,
  ShieldCheck,
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

export type TechnicalMissionId = 'url_transfer' | 'shader_surgery' | 'luxury_store';

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
  onSelectMission?: (missionId: TechnicalMissionId) => void;
  loadingMissionId?: TechnicalMissionId | null;
  editQueue: QueuedEditSummary[];
  onRemoveQueuedJob: (jobId: string) => void;
}

function modelBadgeStyle(model?: string): { label: string; className: string } {
  const m = (model || '').toLowerCase();
  if (m.includes('carbon')) {
    return {
      label: 'Carbon',
      className:
        'border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]',
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
      'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)]',
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
      subFill: 'var(--cobalt-ice)',
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
      ? `3.8 Live · ${assetsCount} ref${assetsCount > 1 ? 's' : ''}`
      : '3.8 Live · ready';

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
    : 'neon · 4×';

  const decisionSub = scorecard?.latencyMs
    ? formatMsShort(scorecard.latencyMs)
    : decisionState === 'active'
    ? 'scoring…'
    : '~250ms · 12p';

  const passSub = scorecard
    ? `${Math.round(scorecard.overallTasteScore)}/100`
    : 'gate';

  const handoffState: NodeVisualState = hasPassed
    ? 'passed'
    : isRunning && hasScored
    ? 'active'
    : 'idle';

  const cRef = nodeColors(refState);
  const cDir = nodeColors(directorState);
  const cCode = nodeColors(coderState);
  const cDec = nodeColors(decisionState);
  const cPass = nodeColors(passState);
  const cHandoff = nodeColors(handoffState);

  const loopActive =
    hasRefinementLoop || (isRunning && lastEvent?.type === 'refinement_triggered');

  return (
    <svg
      viewBox="0 0 252 152"
      className="h-[148px] w-full overflow-visible"
      role="img"
      aria-label="AntiSlop Gemini 3.8 Live, Gemini 4, Decisions API, and Managed Agent pipeline flow graph"
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
          <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--cobalt-ice)" />
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

      {/* Connector 1: 3.8 Live / Refs -> Director */}
      <line
        x1="114"
        y1="22"
        x2="134"
        y2="22"
        stroke={
          directorState === 'active'
            ? 'var(--cobalt-ice)'
            : directorState === 'passed'
            ? 'var(--emerald)'
            : 'var(--svg-idle-arrow)'
        }
        strokeWidth={directorState === 'idle' ? '1.35' : '1.8'}
        className={directorState === 'active' ? 'atelier-svg-flow' : undefined}
        markerEnd={
          directorState === 'active'
            ? 'url(#as-arrow-active)'
            : directorState === 'passed'
            ? 'url(#as-arrow-ok)'
            : 'url(#as-arrow-idle)'
        }
      />

      {/* Connector 2: Director -> Neon/Hydrogen Coder */}
      <path
        d="M 192 38 L 192 47 L 43 47 L 43 56"
        fill="none"
        stroke={
          coderState === 'active'
            ? 'var(--cobalt-ice)'
            : coderState === 'passed' || coderState === 'looping'
            ? 'var(--emerald)'
            : 'var(--svg-idle-arrow)'
        }
        strokeWidth={coderState === 'idle' ? '1.35' : '1.8'}
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
        x1="82"
        y1="75"
        x2="92"
        y2="75"
        stroke={
          decisionState === 'active'
            ? 'var(--cobalt-ice)'
            : decisionState === 'passed' || decisionState === 'looping'
            ? 'var(--emerald)'
            : 'var(--svg-idle-arrow)'
        }
        strokeWidth={decisionState === 'idle' ? '1.35' : '1.8'}
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
        x1="176"
        y1="75"
        x2="186"
        y2="75"
        stroke={passState === 'passed' ? 'var(--emerald)' : 'var(--svg-idle-arrow)'}
        strokeWidth={passState === 'passed' ? '1.8' : '1.35'}
        markerEnd={
          passState === 'passed' ? 'url(#as-arrow-ok)' : 'url(#as-arrow-idle)'
        }
      />

      {/* Connector 5: Pass -> Managed Agent Handoff */}
      <path
        d="M 217 92 L 217 110 L 182 110"
        fill="none"
        stroke={
          handoffState === 'passed'
            ? 'var(--emerald)'
            : handoffState === 'active'
            ? 'var(--cobalt-ice)'
            : 'var(--svg-idle-arrow)'
        }
        strokeWidth={handoffState === 'idle' ? '1.3' : '1.75'}
        strokeLinejoin="round"
        className={handoffState === 'active' ? 'atelier-svg-flow' : undefined}
        markerEnd={
          handoffState === 'passed'
            ? 'url(#as-arrow-ok)'
            : handoffState === 'active'
            ? 'url(#as-arrow-active)'
            : 'url(#as-arrow-idle)'
        }
      />

      {/* Curved Loop-Back Arrow */}
      <path
        d="M 135 93 C 135 112, 43 112, 43 95"
        fill="none"
        stroke={loopActive ? 'var(--amber)' : 'var(--svg-idle-stroke)'}
        strokeWidth={loopActive ? '1.75' : '1.25'}
        strokeDasharray={loopActive ? '4 3' : '3 3'}
        className={loopActive && isRunning ? 'atelier-svg-flow' : undefined}
        markerEnd={loopActive ? 'url(#as-arrow-loop)' : 'url(#as-arrow-idle)'}
      />
      <rect
        x="62"
        y="100"
        width="54"
        height="13"
        rx="6.5"
        fill={loopActive ? 'var(--svg-loop-fill)' : 'var(--bg-card)'}
        stroke={loopActive ? 'var(--amber)' : 'var(--svg-idle-stroke)'}
        strokeWidth="0.95"
      />
      <text
        x="89"
        y="109"
        textAnchor="middle"
        fill={loopActive ? 'var(--amber)' : 'var(--ink-secondary)'}
        className="font-mono text-[7.5px] font-semibold"
      >
        Auto-Fix ↺
      </text>

      {/* Node 1: 3.8 Live / Refs / Circles */}
      <g>
        <rect
          x="4"
          y="6"
          width="110"
          height="32"
          rx="6"
          fill={cRef.fill}
          stroke={cRef.stroke}
          strokeWidth={refState === 'active' ? '1.7' : '1.2'}
        />
        {refState === 'active' && (
          <circle
            cx="13"
            cy="15"
            r="2.4"
            fill="var(--cobalt-ice)"
            className="animate-studio-pulse"
          />
        )}
        <text
          x="59"
          y="20"
          textAnchor="middle"
          fill={cRef.titleFill}
          className="font-mono text-[8.2px] font-semibold"
        >
          Refs · 3.8 Live
        </text>
        <text
          x="59"
          y="31"
          textAnchor="middle"
          fill={cRef.subFill}
          className="font-mono text-[7.2px]"
        >
          {refSub}
        </text>
      </g>

      {/* Node 2: Director */}
      <g>
        <rect
          x="138"
          y="6"
          width="110"
          height="32"
          rx="6"
          fill={cDir.fill}
          stroke={cDir.stroke}
          strokeWidth={directorState === 'active' ? '1.7' : '1.2'}
        />
        {directorState === 'active' && (
          <circle
            cx="147"
            cy="15"
            r="2.4"
            fill="var(--cobalt-ice)"
            className="animate-studio-pulse"
          />
        )}
        {directorState === 'passed' && (
          <g>
            <rect
              x="217"
              y="9"
              width="27"
              height="10"
              rx="5"
              fill="var(--emerald-bg)"
              stroke="var(--emerald-border)"
              strokeWidth="0.7"
            />
            <text
              x="230.5"
              y="16"
              textAnchor="middle"
              fill="var(--emerald)"
              className="font-mono text-[6.3px] font-bold"
            >
              OK
            </text>
          </g>
        )}
        <text
          x="193"
          y="20"
          textAnchor="middle"
          fill={cDir.titleFill}
          className="font-mono text-[8.2px] font-semibold"
        >
          Director
        </text>
        <text
          x="193"
          y="31"
          textAnchor="middle"
          fill={cDir.subFill}
          className="font-mono text-[7.2px]"
        >
          {directorSub}
        </text>
      </g>

      {/* Node 3: Neon / Hydrogen Coder */}
      <g>
        <rect
          x="4"
          y="58"
          width="78"
          height="34"
          rx="6"
          fill={cCode.fill}
          stroke={cCode.stroke}
          strokeWidth={
            coderState === 'active' || coderState === 'looping' ? '1.7' : '1.2'
          }
        />
        {(coderState === 'active' || coderState === 'looping') && (
          <circle
            cx="12"
            cy="67"
            r="2.3"
            fill={coderState === 'looping' ? 'var(--amber)' : 'var(--cobalt-ice)'}
            className="animate-studio-pulse"
          />
        )}
        <text
          x="43"
          y="73"
          textAnchor="middle"
          fill={cCode.titleFill}
          className="font-mono text-[8px] font-semibold"
        >
          Neon Coder
        </text>
        <text
          x="43"
          y="84"
          textAnchor="middle"
          fill={cCode.subFill}
          className="font-mono text-[7.2px]"
        >
          {coderSub}
        </text>
      </g>

      {/* Node 4: Decision-1 Gate */}
      <g>
        <rect
          x="94"
          y="58"
          width="82"
          height="34"
          rx="6"
          fill={cDec.fill}
          stroke={cDec.stroke}
          strokeWidth={
            decisionState === 'active' || decisionState === 'looping'
              ? '1.7'
              : '1.2'
          }
        />
        {decisionState === 'active' && (
          <circle
            cx="102"
            cy="67"
            r="2.3"
            fill="var(--cobalt-ice)"
            className="animate-studio-pulse"
          />
        )}
        <text
          x="135"
          y="73"
          textAnchor="middle"
          fill={cDec.titleFill}
          className="font-mono text-[8px] font-semibold"
        >
          Decision-1
        </text>
        <text
          x="135"
          y="84"
          textAnchor="middle"
          fill={cDec.subFill}
          className="font-mono text-[7.2px]"
        >
          {decisionSub}
        </text>
      </g>

      {/* Node 5: Pass */}
      <g>
        <rect
          x="188"
          y="58"
          width="60"
          height="34"
          rx="6"
          fill={cPass.fill}
          stroke={cPass.stroke}
          strokeWidth={passState === 'passed' ? '1.75' : '1.2'}
        />
        <text
          x="218"
          y="73"
          textAnchor="middle"
          fill={cPass.titleFill}
          className="font-mono text-[8px] font-semibold"
        >
          {passState === 'passed' ? 'PASS ✓' : 'Gate'}
        </text>
        <text
          x="218"
          y="84"
          textAnchor="middle"
          fill={cPass.subFill}
          className="font-mono text-[7.2px]"
        >
          {passSub}
        </text>
      </g>

      {/* Node 6: Managed Agent Handoff */}
      <g>
        <rect
          x="4"
          y="120"
          width="176"
          height="28"
          rx="7"
          fill={cHandoff.fill}
          stroke={cHandoff.stroke}
          strokeWidth={handoffState === 'passed' ? '1.6' : '1.15'}
        />
        <text
          x="92"
          y="132.5"
          textAnchor="middle"
          fill={cHandoff.titleFill}
          className="font-mono text-[7.8px] font-semibold"
        >
          Managed Agent Handoff
        </text>
        <text
          x="92"
          y="142.5"
          textAnchor="middle"
          fill={cHandoff.subFill}
          className="font-mono text-[6.8px]"
        >
          {handoffState === 'passed'
            ? 'Verified Manifest → Remote VM PR Ready'
            : 'antigravity-preview-09-2026 · v1beta'}
        </text>
      </g>
    </svg>
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
  const height = 60;
  const padX = 14;
  const padY = 8;
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
    <div className="space-y-1">
      <div className="flex items-center justify-between font-mono text-[8.5px]">
        <span className="uppercase tracking-wider text-[var(--ink-muted)]">
          Convergence
        </span>
        <div className="flex items-center gap-2">
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
        className="h-[60px] w-full overflow-visible"
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

/* 3 Verified High-Impact Technical Missions for Immediate Testing & Live Demo */
const TECHNICAL_DEMO_MISSIONS: Array<{
  id: TechnicalMissionId;
  badge: string;
  title: string;
  subtitle: string;
}> = [
  {
    id: 'url_transfer',
    badge: 'URL → CSS DNA',
    title: 'Transfer anthropic.com editorial system',
    subtitle: 'Snap live URL & compile Warm Alabaster SaaS',
  },
  {
    id: 'shader_surgery',
    badge: 'Circle + Voice',
    title: 'Surgical <canvas> / hero region edit',
    subtitle: 'Draw vermilion circle & patch targeted code only',
  },
  {
    id: 'luxury_store',
    badge: '5 Models + Art',
    title: 'Kova Goods + Nano Banana 2.1 hero',
    subtitle: 'Bespoke product photography & working React cart',
  },
];

const GEMINI_STACK_PILLS = ['Carbon', 'Neon', 'Hydrogen', 'Decision-1', 'Banana 2.1'];

type ArchNodeId =
  | 'intake'
  | 'director'
  | 'coder'
  | 'decision'
  | 'manifest'
  | 'vm'
  | 'build'
  | 'pr';

interface ArchNodeSpec {
  id: ArchNodeId;
  loop: 'critic' | 'ship';
  label: string;
  sub: string;
  apiBadge: string;
  detail: string;
}

const ARCH_NODES: Record<ArchNodeId, ArchNodeSpec> = {
  intake: {
    id: 'intake',
    loop: 'critic',
    label: 'Refs / URL / 3.8-Live',
    sub: 'Moodboard · Cam · Voice',
    apiBadge: 'gemini-3.8-live · 3.5-transcribe',
    detail:
      'Captures live site screenshots + CSS DNA, moodboard frames, webcam swatches, and streaming voice directives.',
  },
  director: {
    id: 'director',
    loop: 'critic',
    label: 'Carbon/Hydrogen + SKILL.md',
    sub: 'v1 interactions · Manifest',
    apiBadge: 'gemini-4-carbon / hydrogen (v1)',
    detail:
      'Synthesizes a typed DesignManifest using Design Craft Skill v1 and thinking_level control without slop clichés.',
  },
  coder: {
    id: 'coder',
    loop: 'critic',
    label: 'Vite HMR + Nano Banana 2.1',
    sub: '4× Race · Bespoke Art',
    apiBadge: 'gemini-4-neon · nano-banana-2.1',
    detail:
      'Compiles multi-file React/CSS edits into the live Vite sandbox and generates art-directed bespoke hero assets.',
  },
  decision: {
    id: 'decision',
    loop: 'critic',
    label: 'Decision-1 · 12 Probes',
    sub: '~250ms feedback arc',
    apiBadge: 'gemini-decision-1 (v1beta) + embed-2',
    detail:
      'Evaluates 6 score probes, 4 noul probabilities, 2 classifications, and DOM layout checks, feeding Auto-Fix loops.',
  },
  manifest: {
    id: 'manifest',
    loop: 'ship',
    label: 'Verified Manifest',
    sub: 'Taste ≥ 80 · 0 Slop',
    apiBadge: 'DesignManifest + Scorecard',
    detail:
      'Gate-passed visual tokens, diff summary, and calibrated Decision-1 scorecard packaged for autonomous repo shipping.',
  },
  vm: {
    id: 'vm',
    loop: 'ship',
    label: 'Antigravity Remote VM',
    sub: 'environment: remote',
    apiBadge: 'antigravity-preview-09-2026 (v1beta)',
    detail:
      'Provisions a Google-hosted remote Linux sandbox mounting the target repository and .agents/skills context.',
  },
  build: {
    id: 'build',
    loop: 'ship',
    label: 'tsc & vite build',
    sub: 'Exit-0 Hook Gate',
    apiBadge: 'Deterministic Verification',
    detail:
      'Executes full TypeScript and production bundle checks inside the remote Linux sandbox before allowing PR creation.',
  },
  pr: {
    id: 'pr',
    loop: 'ship',
    label: 'GitHub PR',
    sub: 'Branch · Commit · Diff',
    apiBadge: 'POST /api/github/pr',
    detail:
      'Opens a clean branch, commits verified source surgery, and attaches the Decision-1 proof scorecard to the PR body.',
  },
};

function SystemArchitectureFlow({
  events,
  isRunning,
  manifest,
  scorecard,
  assetsCount,
  drawnCirclesCount,
}: {
  events: StreamEvent[];
  isRunning: boolean;
  manifest?: DesignManifest;
  scorecard?: DecisionsScorecard;
  assetsCount: number;
  drawnCirclesCount: number;
}) {
  const [selectedNode, setSelectedNode] = useState<ArchNodeId>('decision');
  const eventTypes = new Set(events.map((e) => e.type));

  const intakeActive = isRunning && events.length <= 2;
  const intakeDone = assetsCount > 0 || drawnCirclesCount > 0 || events.length > 0;
  const directorActive = isRunning && eventTypes.has('director_thinking') && !manifest;
  const directorDone = Boolean(manifest) || eventTypes.has('manifest_ready');
  const coderActive =
    isRunning && (eventTypes.has('candidate_started') || eventTypes.has('asset_generated')) && !eventTypes.has('candidate_scored');
  const coderDone = eventTypes.has('candidate_written') || eventTypes.has('hmr_reloaded') || Boolean(scorecard);
  const decisionActive = isRunning && eventTypes.has('candidate_written') && !scorecard;
  const decisionDone = Boolean(scorecard);
  const shipReady = Boolean(scorecard?.passedAllGates);

  const stageColor = (active: boolean, done: boolean): NodeVisualState =>
    active ? 'active' : done ? 'passed' : 'idle';

  const sIntake = nodeColors(stageColor(intakeActive, intakeDone));
  const sDir = nodeColors(stageColor(directorActive, directorDone));
  const sCode = nodeColors(stageColor(coderActive, coderDone));
  const sDec = nodeColors(stageColor(decisionActive, decisionDone));
  const sManifest = nodeColors(shipReady ? 'passed' : 'idle');
  const sShipIdle = nodeColors('idle');

  const activeSpec = ARCH_NODES[selectedNode];

  const renderInteractiveNode = (
    id: ArchNodeId,
    x: number,
    y: number,
    w: number,
    h: number,
    colors: ReturnType<typeof nodeColors>,
    isActivePulse: boolean
  ) => {
    const spec = ARCH_NODES[id];
    const isSelected = selectedNode === id;
    return (
      <g
        key={id}
        role="button"
        tabIndex={0}
        aria-label={`${spec.label}: ${spec.sub}. Inspect architecture details`}
        aria-pressed={isSelected}
        onClick={() => setSelectedNode(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSelectedNode(id);
          }
        }}
        className="cursor-pointer focus:outline-none"
      >
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx="7"
          fill={isSelected ? 'var(--cobalt-tint)' : colors.fill}
          stroke={isSelected ? 'var(--cobalt-ice)' : colors.stroke}
          strokeWidth={isSelected ? '1.8' : '1.2'}
        />
        {isActivePulse && (
          <circle
            cx={x + 9}
            cy={y + 9}
            r="2.3"
            fill="var(--cobalt-ice)"
            className="animate-studio-pulse"
          />
        )}
        <text
          x={x + w / 2}
          y={y + 14.5}
          textAnchor="middle"
          fill={colors.titleFill}
          className="font-mono text-[7.8px] font-semibold"
        >
          {spec.label}
        </text>
        <text
          x={x + w / 2}
          y={y + 25}
          textAnchor="middle"
          fill={isSelected ? 'var(--cobalt-ice)' : colors.subFill}
          className="font-mono text-[6.8px]"
        >
          {spec.sub}
        </text>
      </g>
    );
  };

  return (
    <div className="w-full space-y-2.5 text-left">
      <div className="flex items-center justify-between px-0.5">
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--cobalt-ice)]">
          Dual-Loop Pipeline
        </span>
        <span className="font-mono text-[9px] text-[var(--ink-secondary)]">
          tap node to inspect
        </span>
      </div>

      <svg
        viewBox="0 0 260 326"
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label="AntiSlop Dual-Loop System Architecture showing Real-Time Critic Loop and Remote Ship Loop"
      >
        <defs>
          <marker
            id="arch-arrow-cobalt"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--cobalt-ice)" />
          </marker>
          <marker
            id="arch-arrow-emerald"
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
            id="arch-arrow-amber"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--amber)" />
          </marker>
          <marker
            id="arch-arrow-idle"
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--svg-idle-arrow)" />
          </marker>
        </defs>

        {/* LOOP 1 FRAME: Real-Time Critic Loop */}
        <rect
          x="2"
          y="2"
          width="256"
          height="182"
          rx="10"
          fill="var(--bg-card-elevated)"
          stroke="var(--cobalt-border)"
          strokeWidth="1.1"
        />
        <text
          x="12"
          y="16"
          fill="var(--cobalt-ice)"
          className="font-mono text-[7.5px] font-semibold uppercase tracking-wider"
        >
          LOOP 1 · REAL-TIME CRITIC
        </text>
        <rect
          x="198"
          y="7"
          width="50"
          height="13"
          rx="6.5"
          fill="var(--cobalt-tint)"
          stroke="var(--cobalt-border)"
          strokeWidth="0.7"
        />
        <text
          x="223"
          y="16"
          textAnchor="middle"
          fill="var(--cobalt-ice)"
          className="font-mono text-[6.8px] font-semibold"
        >
          ~250ms
        </text>

        {/* Loop 1 Nodes */}
        {renderInteractiveNode('intake', 12, 24, 178, 31, sIntake, intakeActive)}
        {renderInteractiveNode('director', 12, 65, 178, 31, sDir, directorActive)}
        {renderInteractiveNode('coder', 12, 106, 178, 31, sCode, coderActive)}
        {renderInteractiveNode('decision', 12, 147, 178, 31, sDec, decisionActive)}

        {/* Vertical Loop 1 Connectors */}
        <line
          x1="101"
          y1="55"
          x2="101"
          y2="63"
          stroke="var(--cobalt-ice)"
          strokeWidth="1.5"
          markerEnd="url(#arch-arrow-cobalt)"
        />
        <line
          x1="101"
          y1="96"
          x2="101"
          y2="104"
          stroke="var(--cobalt-ice)"
          strokeWidth="1.5"
          markerEnd="url(#arch-arrow-cobalt)"
        />
        <line
          x1="101"
          y1="137"
          x2="101"
          y2="145"
          stroke="var(--cobalt-ice)"
          strokeWidth="1.5"
          markerEnd="url(#arch-arrow-cobalt)"
        />

        {/* ~250ms Feedback Arc from Decision-1 -> Carbon/Hydrogen */}
        <path
          d="M 192 162 C 234 162, 234 80, 194 80"
          fill="none"
          stroke="var(--amber)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          className={isRunning ? 'atelier-svg-flow' : undefined}
          markerEnd="url(#arch-arrow-amber)"
        />
        <rect
          x="197"
          y="112"
          width="54"
          height="20"
          rx="5"
          fill="var(--bg-card)"
          stroke="var(--amber-border)"
          strokeWidth="0.9"
        />
        <text
          x="224"
          y="121"
          textAnchor="middle"
          fill="var(--amber)"
          className="font-mono text-[6.3px] font-semibold"
        >
          ~250ms
        </text>
        <text
          x="224"
          y="129"
          textAnchor="middle"
          fill="var(--ink-secondary)"
          className="font-mono text-[6px]"
        >
          feedback arc
        </text>

        {/* Bridge Connector: Loop 1 -> Loop 2 */}
        <line
          x1="101"
          y1="184"
          x2="101"
          y2="200"
          stroke={shipReady ? 'var(--emerald)' : 'var(--cobalt-ice)'}
          strokeWidth="1.6"
          markerEnd={shipReady ? 'url(#arch-arrow-emerald)' : 'url(#arch-arrow-cobalt)'}
        />
        <text
          x="110"
          y="195"
          fill={shipReady ? 'var(--emerald)' : 'var(--ink-secondary)'}
          className="font-mono text-[6.8px] font-medium"
        >
          verified handoff
        </text>

        {/* LOOP 2 FRAME: Remote Ship Loop */}
        <rect
          x="2"
          y="202"
          width="256"
          height="120"
          rx="10"
          fill="var(--bg-card-elevated)"
          stroke={shipReady ? 'var(--emerald-border)' : 'var(--border-subtle)'}
          strokeWidth="1.1"
        />
        <text
          x="12"
          y="216"
          fill="var(--emerald)"
          className="font-mono text-[7.5px] font-semibold uppercase tracking-wider"
        >
          LOOP 2 · REMOTE SHIP LOOP
        </text>
        <rect
          x="206"
          y="207"
          width="42"
          height="13"
          rx="6.5"
          fill="var(--emerald-bg)"
          stroke="var(--emerald-border)"
          strokeWidth="0.7"
        />
        <text
          x="227"
          y="216"
          textAnchor="middle"
          fill="var(--emerald)"
          className="font-mono text-[6.8px] font-semibold"
        >
          v1beta
        </text>

        {/* Loop 2 Nodes (2x2 Grid) */}
        {renderInteractiveNode('manifest', 12, 226, 110, 34, sManifest, false)}
        {renderInteractiveNode('vm', 138, 226, 110, 34, sShipIdle, false)}
        {renderInteractiveNode('build', 138, 276, 110, 34, sShipIdle, false)}
        {renderInteractiveNode('pr', 12, 276, 110, 34, sShipIdle, false)}

        {/* Loop 2 Connectors: Manifest -> Remote VM -> Build -> PR */}
        <line
          x1="122"
          y1="243"
          x2="136"
          y2="243"
          stroke={shipReady ? 'var(--emerald)' : 'var(--svg-idle-arrow)'}
          strokeWidth="1.4"
          markerEnd={shipReady ? 'url(#arch-arrow-emerald)' : 'url(#arch-arrow-idle)'}
        />
        <line
          x1="193"
          y1="260"
          x2="193"
          y2="274"
          stroke="var(--svg-idle-arrow)"
          strokeWidth="1.4"
          markerEnd="url(#arch-arrow-idle)"
        />
        <line
          x1="138"
          y1="293"
          x2="124"
          y2="293"
          stroke="var(--svg-idle-arrow)"
          strokeWidth="1.4"
          markerEnd="url(#arch-arrow-idle)"
        />
      </svg>

      {/* Interactive Node Detail Card */}
      <div className="rounded-xl border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11.5px] font-semibold text-[var(--ink-primary)]">
            {activeSpec.label}
          </span>
          <span className="shrink-0 rounded-full border border-[var(--cobalt-border)] bg-[var(--bg-card)] px-1.5 py-0.5 font-mono text-[8.5px] text-[var(--cobalt-ice)]">
            {activeSpec.loop === 'critic' ? 'Loop 1' : 'Loop 2'}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-[9.5px] text-[var(--cobalt-ice)]">
          {activeSpec.apiBadge}
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-[var(--ink-secondary)]">
          {activeSpec.detail}
        </p>
      </div>
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
  onSelectMission,
  loadingMissionId = null,
  editQueue,
  onRemoveQueuedJob,
}: CriticRailProps) {
  const [inspectCandidate, setInspectCandidate] =
    useState<CandidateResult | null>(null);
  const [idleViewTab, setIdleViewTab] = useState<'missions' | 'system_flow'>(
    'missions'
  );

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

  const canSubmit = Boolean(voiceTranscript.trim()) || drawnCirclesCount > 0;

  return (
    <>
      {/* Floating 16px-radius Obsidian Director Card (#080A0E, 296px width) — Pure Code Wiki Gemini Panel */}
      <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[16px] border border-[var(--border-card)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
        {/* Minimal 48px Header with Missions | System Flow Segmented Toggle */}
        <div className="flex h-[48px] shrink-0 items-center justify-between gap-1.5 px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <GeminiSparkleMark className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-[12px] font-medium text-[var(--ink-secondary)]">
              Director
            </span>
            {isRunning && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cobalt-bright)] animate-studio-pulse" />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <div
              role="group"
              aria-label="Director panel view"
              className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] p-0.5"
            >
              <button
                type="button"
                aria-pressed={idleViewTab === 'missions'}
                onClick={() => setIdleViewTab('missions')}
                className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] font-medium transition-colors ${
                  idleViewTab === 'missions'
                    ? 'bg-[var(--cobalt-core)] text-white'
                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {isFreshIdle ? 'Missions' : 'Live'}
              </button>
              <button
                type="button"
                aria-pressed={idleViewTab === 'system_flow'}
                onClick={() => setIdleViewTab('system_flow')}
                className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] font-medium transition-colors ${
                  idleViewTab === 'system_flow'
                    ? 'bg-[var(--cobalt-core)] text-white'
                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                System Flow
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse Director panel"
              aria-label="Collapse Director panel"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Middle Body: System Flow OR Serene Code Wiki Idle Missions OR Live Scored Disclosures */}
        {idleViewTab === 'system_flow' ? (
          <div className="studio-scroll flex flex-1 flex-col justify-between overflow-y-auto px-3.5 pb-3 pt-1">
            <SystemArchitectureFlow
              events={events}
              isRunning={isRunning}
              manifest={manifest}
              scorecard={scorecard}
              assetsCount={assetsCount}
              drawnCirclesCount={drawnCirclesCount}
            />
          </div>
        ) : isFreshIdle ? (
          <div className="codewiki-sparkle-aura studio-scroll flex flex-1 flex-col items-center justify-between overflow-y-auto px-4 pb-3 pt-6 text-center">
            <div className="flex flex-col items-center">
              <GeminiSparkleMark className="h-11 w-11" glow />
              <h2 className="mt-4 text-[19px] font-medium tracking-[-0.02em] text-[var(--ink-primary)]">
                Direct this interface
              </h2>
              <p className="mt-1 max-w-[230px] text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                Circle the canvas, snap a live site, or launch a verified technical mission.
              </p>
            </div>

            {/* 3 Technical One-Click Missions */}
            <div className="my-5 flex w-full flex-col gap-2 text-left">
              {TECHNICAL_DEMO_MISSIONS.map((mission) => {
                const isBusy = loadingMissionId === mission.id;
                return (
                  <button
                    key={mission.id}
                    type="button"
                    disabled={Boolean(loadingMissionId)}
                    onClick={() => {
                      if (onSelectMission) {
                        onSelectMission(mission.id);
                      } else {
                        onVoiceTranscriptChange(mission.title);
                      }
                    }}
                    className="group flex flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)]/65 px-3 py-2.5 text-left transition-all hover:border-[var(--cobalt-border-strong)] hover:bg-[var(--cobalt-tint)] disabled:opacity-55"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.06em] text-[var(--cobalt-ice)]">
                        {mission.badge}
                      </span>
                      {isBusy && (
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--cobalt-ice)]" />
                      )}
                    </div>
                    <span className="text-[12px] font-medium leading-snug text-[var(--ink-primary)]">
                      {mission.title}
                    </span>
                    <span className="text-[11px] leading-snug text-[var(--ink-secondary)]">
                      {mission.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quiet Multi-Model Engine Telemetry Strip */}
            <div className="flex w-full flex-wrap items-center justify-center gap-1 border-t border-[var(--border-subtle)] pt-3">
              {GEMINI_STACK_PILLS.map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[9px] text-[var(--ink-muted)]"
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-3 pt-1">
            {/* 1. ONE Serene Score Summary Strip (Taste · Slop · Match) */}
            <section
              aria-label="Score summary"
              className="border-b border-[var(--border-subtle)] pb-3.5"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                  Calibrated Score
                </span>
                {scorecard ? (
                  <span
                    className={`inline-flex items-center gap-1 font-mono text-[10px] font-medium ${
                      scorecard.passedAllGates
                        ? 'text-[var(--emerald)]'
                        : 'text-[var(--amber)]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        scorecard.passedAllGates
                          ? 'bg-[var(--emerald)]'
                          : 'bg-[var(--amber)]'
                      }`}
                    />
                    {scorecard.passedAllGates ? 'Verified' : 'Refining'}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-[var(--cobalt-ice)]">
                    Scoring…
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10.5px] text-[var(--ink-muted)]">Taste</div>
                  <div className="mt-0.5 font-mono text-[16px] font-semibold tracking-tight text-[var(--ink-primary)]">
                    {scorecard ? scorecard.overallTasteScore.toFixed(1) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-[var(--ink-muted)]">Slop</div>
                  <div
                    className={`mt-0.5 font-mono text-[16px] font-semibold tracking-tight ${
                      !scorecard
                        ? 'text-[var(--ink-muted)]'
                        : scorecard.metrics.slopPenalty.passed
                        ? 'text-[var(--emerald)]'
                        : 'text-[var(--vermilion)]'
                    }`}
                  >
                    {scorecard
                      ? scorecard.metrics.slopPenalty.value.toFixed(2)
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-[var(--ink-muted)]">Match</div>
                  <div
                    className={`mt-0.5 font-mono text-[16px] font-semibold tracking-tight ${
                      !scorecard
                        ? 'text-[var(--ink-muted)]'
                        : scorecard.metrics.aestheticMatch.passed
                        ? 'text-[var(--cobalt-ice)]'
                        : 'text-[var(--amber)]'
                    }`}
                  >
                    {scorecard
                      ? scorecard.metrics.aestheticMatch.value.toFixed(1)
                      : '—'}
                  </div>
                </div>
              </div>

              {manifest && (
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="truncate font-serif text-[14px] text-[var(--ink-secondary)]">
                    {manifest.vibeTitle}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {[
                      manifest.tokens.palette.canvas,
                      manifest.tokens.palette.surface,
                      manifest.tokens.palette.inkPrimary,
                      manifest.tokens.palette.accent,
                    ].map((hex, i) => (
                      <span
                        key={`${hex}-${i}`}
                        title={hex}
                        style={{ backgroundColor: hex }}
                        className="h-2.5 w-2.5 rounded-full border border-white/15"
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 2. Live Edit Queue — Shown ONLY When Queued / Active */}
            {totalQueueDisplay > 0 && (
              <section
                aria-label="Live edit queue"
                className="border-b border-[var(--border-subtle)] py-3"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                    Live Queue ({totalQueueDisplay})
                  </span>
                  <span className="font-mono text-[9.5px] text-[var(--cobalt-ice)]">
                    active
                  </span>
                </div>

                <div className="space-y-1.5">
                  {isRunning && (
                    <div className="flex items-center gap-2 rounded-lg bg-[var(--cobalt-tint)] px-2.5 py-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cobalt-bright)] animate-studio-pulse" />
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-primary)]">
                        {activeJobLabel || 'Transforming live app'}
                      </span>
                    </div>
                  )}

                  {editQueue.map((job, idx) => (
                    <div
                      key={job.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]"
                    >
                      <span className="shrink-0 font-mono text-[9.5px] text-[var(--ink-muted)]">
                        #{idx + (isRunning ? 2 : 1)}
                      </span>
                      <span
                        title={job.label}
                        className="min-w-0 flex-1 truncate text-[var(--ink-primary)]"
                      >
                        {job.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveQueuedJob(job.id)}
                        aria-label={`Remove queued edit ${job.label}`}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--vermilion)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Clean Hairline <details> Disclosures (Never a Dense Metrics Wall!) */}
            <div className="divide-y divide-[var(--border-subtle)]">
              {/* Disclosure A: Decision Graph (open by default so judges see live pipeline) */}
              <details className="atelier-details" open>
                <summary className="flex select-none items-center justify-between gap-2 py-3 text-[12px] text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronDown className="atelier-chevron h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                    <span className="font-medium">Decision Graph</span>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                    decision-1
                  </span>
                </summary>
                <div className="pb-3.5 pt-1">
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
                </div>
              </details>

              {/* Disclosure B: 12-Probe Rubric */}
              <details className="atelier-details">
                <summary className="flex select-none items-center justify-between gap-2 py-3 text-[12px] text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronDown className="atelier-chevron h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                    <span className="font-medium">12-Probe Rubric</span>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                    {raceCandidates.length > 1
                      ? `${raceCandidates.length}× Race`
                      : scorecard
                      ? `${Math.round(scorecard.latencyMs)}ms`
                      : '12 probes'}
                  </span>
                </summary>

                <div className="space-y-3 pb-3.5 pt-1">
                  {/* 4-Way Candidate Race */}
                  {raceCandidates.length > 1 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between font-mono text-[9.5px] text-[var(--ink-muted)]">
                        <span className="inline-flex items-center gap-1 uppercase">
                          <Layers className="h-3 w-3 text-[var(--cobalt-ice)]" />
                          {raceCandidates.length}× Race
                        </span>
                        <span>tap to inspect</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {raceCandidates.map((cand) => {
                          const thumb = resolveBackendUrl(cand.screenshotUrl);
                          return (
                            <button
                              key={cand.candidateId}
                              type="button"
                              onClick={() => setInspectCandidate(cand)}
                              className={`overflow-hidden rounded-lg border bg-[var(--bg-card-elevated)] text-left transition-colors ${
                                cand.selectedAsWinner
                                  ? 'border-[var(--emerald)]'
                                  : 'border-[var(--border-subtle)] hover:border-[var(--cobalt-border)]'
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
                                  <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-[var(--emerald)] px-1 py-0.5 font-mono text-[7.5px] font-bold uppercase text-[#080A0E]">
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
                          className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] ${
                            pill.ok
                              ? 'bg-[var(--emerald-bg)] text-[var(--emerald)]'
                              : 'bg-[var(--vermilion-bg)] text-[var(--vermilion)]'
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
                      <div className="space-y-2">
                        {scoreMetrics.map((m) => {
                          const pct = Math.max(0, Math.min(100, (m.value / 10) * 100));
                          const isInverse = m.id.toLowerCase().includes('slop');
                          return (
                            <div key={m.id} className="space-y-1">
                              <div className="flex items-center justify-between text-[10.5px]">
                                <span className="truncate text-[var(--ink-secondary)]">
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
                              <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-subtle-hover)]">
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
                      <div className="grid grid-cols-2 gap-1.5">
                        {noulMetrics.map((m) => (
                          <div
                            key={m.id}
                            className={`rounded-lg border px-2 py-1 ${
                              m.passed
                                ? 'border-[var(--border-subtle)] bg-transparent'
                                : 'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)]'
                            }`}
                          >
                            <div className="truncate text-[9px] text-[var(--ink-secondary)]">
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

                      {/* 2 Choice Classifications + Embed-2 */}
                      <div className="flex items-center justify-between gap-2 font-mono text-[9.5px] text-[var(--ink-muted)]">
                        <span className="truncate">
                          {scorecard.metrics.dominantAestheticClass.choiceLabel || '—'}
                        </span>
                        <span className="shrink-0">
                          embed-2:{' '}
                          {typeof scorecard.embeddingSimilarity === 'number'
                            ? scorecard.embeddingSimilarity.toFixed(2)
                            : '—'}
                        </span>
                      </div>

                      {scorecard.criticActionDirective && (
                        <p className="text-[10.5px] leading-snug text-[var(--ink-secondary)]">
                          {scorecard.criticActionDirective}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="py-1 font-mono text-[10px] text-[var(--ink-muted)]">
                      12 calibrated probes populate as each render completes.
                    </p>
                  )}
                </div>
              </details>

              {/* Disclosure C: Stream */}
              <details className="atelier-details">
                <summary className="flex select-none items-center justify-between gap-2 py-3 text-[12px] text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronDown className="atelier-chevron h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                    <span className="font-medium">Stream</span>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                    {events.length} events
                  </span>
                </summary>

                <div className="space-y-2 pb-3.5 pt-1">
                  {manifest && (
                    <div className="truncate font-mono text-[9.5px] text-[var(--ink-muted)]">
                      {manifest.tokens.typography.displayFont} +{' '}
                      {manifest.tokens.typography.bodyFont}
                    </div>
                  )}

                  {thinkingBuffer && (
                    <div className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-2 font-mono text-[9.5px] leading-relaxed text-[var(--ink-secondary)]">
                      <div className="mb-0.5 text-[8.5px] uppercase text-[var(--cobalt-ice)]">
                        Director Thinking
                      </div>
                      <p className="line-clamp-4 whitespace-pre-wrap">
                        {thinkingBuffer}
                      </p>
                    </div>
                  )}

                  <div className="studio-scroll max-h-[180px] space-y-1.5 overflow-y-auto">
                    {events.length === 0 ? (
                      <p className="py-2 font-mono text-[9.5px] text-[var(--ink-muted)]">
                        Stream idle.
                      </p>
                    ) : (
                      [...events].reverse().map((ev, idx) => {
                        const badge = modelBadgeStyle(ev.model);
                        return (
                          <div
                            key={`${ev.timestamp}-${idx}`}
                            className="space-y-0.5 border-l border-[var(--border-subtle)] pl-2"
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
                            <p className="text-[10px] leading-snug text-[var(--ink-secondary)]">
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
          </div>
        )}

        {/* Bottom-Anchored Exact Code Wiki Rounded-Full Pill Input (#141820) */}
        <div className="shrink-0 px-3.5 pb-3.5 pt-2">
          {(railVoice.isRecording || railVoice.isTranscribing) && (
            <div className="mb-2 flex h-7 items-center justify-between gap-2 rounded-full border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-3">
              {railVoice.isTranscribing ? (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--amber)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Transcribing…
                </span>
              ) : (
                <>
                  <span className="font-mono text-[10px] font-medium text-[var(--vermilion)]">
                    REC 0:{String(railVoice.durationSec).padStart(2, '0')}
                  </span>
                  <div className="flex h-3.5 items-center gap-[2px]">
                    {railVoice.levels.slice(0, 12).map((lvl, idx) => (
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitTalkEdit();
            }}
            className="flex items-center gap-1 rounded-full border border-[var(--border-composer)] bg-[var(--bg-composer)] py-1.5 pl-4 pr-1.5 transition-all focus-within:border-[var(--cobalt-ice)] focus-within:shadow-[var(--cobalt-focus-ring)]"
          >
            <input
              type="text"
              value={voiceTranscript}
              onChange={(e) => onVoiceTranscriptChange(e.target.value)}
              placeholder={
                isRunning
                  ? 'Queue next edit...'
                  : 'Speak or direct a change...'
              }
              aria-label="Speak or direct a change"
              className="h-7 min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none"
            />

            {/* Mic Icon */}
            <button
              type="button"
              onClick={railVoice.toggleRecording}
              aria-label={
                railVoice.isRecording
                  ? 'Stop recording voice'
                  : 'Record voice direction'
              }
              title={
                railVoice.isRecording
                  ? 'Stop recording'
                  : 'Speak naturally (gemini-3.5-transcribe)'
              }
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                railVoice.isRecording
                  ? 'bg-[var(--vermilion)] text-white'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {railVoice.isRecording ? (
                <Square className="h-2.5 w-2.5 fill-current" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Circle Icon */}
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

            {/* Cobalt Send Arrow */}
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label={isRunning ? 'Queue edit' : 'Send direction'}
              title={
                isRunning
                  ? 'Add edit to live queue'
                  : 'Send direction'
              }
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all ${
                canSubmit
                  ? 'bg-[var(--cobalt-core)] text-white hover:bg-[var(--cobalt-deep)]'
                  : 'cursor-not-allowed bg-transparent text-[var(--ink-muted)]'
              }`}
            >
              {isRunning ? (
                <Plus className="h-3.5 w-3.5" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5" />
              )}
            </button>
          </form>
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
              )} · Match ${inspectCandidate.scorecard.metrics.aestheticMatch.value.toFixed(
                1
              )}`
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
