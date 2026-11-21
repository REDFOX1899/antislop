'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CriticIteration,
  DecisionsScorecard,
  DesignManifest,
  DrawnCircleAnnotation,
  ExecutionSpeedMode,
  GitHubPrResponse,
  StreamEvent,
  TransformRunRequest,
  TransformRunResult,
  WorkspaceRepoInfo,
} from '@shared/types';
import { AlertCircle, CheckCircle2, ExternalLink, X } from 'lucide-react';
import {
  DEFAULT_PREVIEW_URL,
  getHealth,
  getRunResult,
  getWorkspaces,
  openGitHubPr,
  resetBaselineSnapshot,
  resolveBackendUrl,
  startTransformRun,
  subscribeToRunStream,
  switchWorkspace,
} from '@/lib/api';
import {
  QUICK_TASTE_STARTERS,
  buildQuickStarterVisualAsset,
  stripToMediaAssetInput,
  type LocalMediaAsset,
} from '@/lib/media';
import { CriticRail, type QueuedEditSummary } from './CriticRail';
import {
  LiveCanvas,
  type CanvasChangeSummary,
  type LiveCanvasHandle,
} from './LiveCanvas';
import { ManagedAgentPanel } from './ManagedAgentPanel';
import { RepoModal } from './RepoModal';
import { SigmaArena } from './SigmaArena';
import { TasteTray } from './TasteTray';
import { TopBar, type StudioTab } from './TopBar';

interface StudioToast {
  id: string;
  tone: 'info' | 'success' | 'error';
  message: string;
  linkUrl?: string;
  linkLabel?: string;
}

interface QueuedEditJob {
  id: string;
  mode: TransformRunRequest['mode'];
  label: string;
  createdAt: number;
  assets: LocalMediaAsset[];
  voiceTranscript?: string;
  voiceAudioBase64?: string;
  voiceAudioMimeType?: string;
  textPrompt?: string;
  drawnCircles: DrawnCircleAnnotation[];
  circleOverlayPngBase64?: string;
  speedMode: ExecutionSpeedMode;
  generateBespokeAssets: boolean;
}

const DEFAULT_LEFT_WIDTH = 228;
const DEFAULT_RIGHT_WIDTH = 272;
const COLLAPSED_RAIL_WIDTH = 42;
const MIN_LEFT_WIDTH = 196;
const MAX_LEFT_WIDTH = 340;
const MIN_RIGHT_WIDTH = 236;
const MAX_RIGHT_WIDTH = 400;

function isFullRunResult(obj: unknown): obj is TransformRunResult {
  return (
    Boolean(obj) &&
    typeof obj === 'object' &&
    'runId' in (obj as Record<string, unknown>) &&
    Array.isArray((obj as Record<string, unknown>).iterations)
  );
}

export function StudioWorkbench() {
  const [activeTab, setActiveTab] = useState<StudioTab>('canvas');
  const [speedMode, setSpeedMode] = useState<ExecutionSpeedMode>('fast_demo');
  const [generateBespokeAssets, setGenerateBespokeAssets] = useState(false);

  // Minimal 2 : 9 : 2 proportions — resizable hairline handles + collapsible rails
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftRailWidth, setLeftRailWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightRailWidth, setRightRailWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [resizingSide, setResizingSide] = useState<'left' | 'right' | null>(null);
  const dragStartRef = useRef<{ clientX: number; initialWidth: number } | null>(
    null
  );

  // Backend & Workspace state
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(DEFAULT_PREVIEW_URL);
  const [workspaces, setWorkspaces] = useState<WorkspaceRepoInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('novaflow-slop');
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [repoModalOpen, setRepoModalOpen] = useState(false);

  // Multimodal References, Continuous Talk & Canvas Annotations
  const [assets, setAssets] = useState<LocalMediaAsset[]>([]);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceAudioBase64, setVoiceAudioBase64] = useState<string | undefined>();
  const [voiceAudioMimeType, setVoiceAudioMimeType] = useState<
    string | undefined
  >();
  const [drawnCircles, setDrawnCircles] = useState<DrawnCircleAnnotation[]>([]);
  const [drawMode, setDrawMode] = useState(false);

  // Live Run + Client-Side Edit Queue State
  const [isRunning, setIsRunning] = useState(false);
  const [activeModeRunning, setActiveModeRunning] = useState<
    TransformRunRequest['mode'] | null
  >(null);
  const [activeJob, setActiveJob] = useState<QueuedEditJob | null>(null);
  const [editQueue, setEditQueue] = useState<QueuedEditJob[]>([]);

  const [currentRunId, setCurrentRunId] = useState<string | undefined>();
  const [manifest, setManifest] = useState<DesignManifest | undefined>();
  const [scorecard, setScorecard] = useState<DecisionsScorecard | undefined>();
  const [iterations, setIterations] = useState<CriticIteration[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [thinkingBuffer, setThinkingBuffer] = useState('');
  const [baselineScreenshotUrl, setBaselineScreenshotUrl] = useState<
    string | undefined
  >();
  const [finalScreenshotUrl, setFinalScreenshotUrl] = useState<
    string | undefined
  >();
  const [liveStatusText, setLiveStatusText] = useState<string | undefined>();
  const [liveModelTag, setLiveModelTag] = useState<string | undefined>();

  // Post-Render Reveal Sweep, Fix-Glow Halos & What Changed Pill
  const [lastAppliedCircles, setLastAppliedCircles] = useState<
    DrawnCircleAnnotation[]
  >([]);
  const [lastRunSummary, setLastRunSummary] =
    useState<CanvasChangeSummary | null>(null);

  // 5-Sigma Arena Cached Run Results
  const [baselineResult, setBaselineResult] =
    useState<TransformRunResult | null>(null);
  const [antislopResult, setAntislopResult] =
    useState<TransformRunResult | null>(null);
  const [stressTestResult, setStressTestResult] =
    useState<TransformRunResult | null>(null);

  // HMR / Iframe Sync & Actions
  const [reloadNonce, setReloadNonce] = useState(1);
  const [hmrPulseAt, setHmrPulseAt] = useState<number | null>(null);
  const [resettingBaseline, setResettingBaseline] = useState(false);
  const [openingPr, setOpeningPr] = useState(false);
  const [lastPr, setLastPr] = useState<GitHubPrResponse | null>(null);
  const [toast, setToast] = useState<StudioToast | null>(null);

  const liveCanvasRef = useRef<LiveCanvasHandle | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isRunningRef = useRef(false);
  const activeJobRef = useRef<QueuedEditJob | null>(null);
  const runStartScorecardRef = useRef<DecisionsScorecard | undefined>(undefined);
  const latestScorecardRef = useRef<DecisionsScorecard | undefined>(undefined);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    latestScorecardRef.current = scorecard;
  }, [scorecard]);

  const pushToast = useCallback(
    (
      tone: StudioToast['tone'],
      message: string,
      linkUrl?: string,
      linkLabel?: string
    ) => {
      setToast({
        id: `${Date.now()}`,
        tone,
        message,
        linkUrl,
        linkLabel,
      });
    },
    []
  );

  // Auto-dismiss non-PR toasts cleanly after 6s
  useEffect(() => {
    if (!toast || toast.linkUrl) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Initial backend health & workspaces hydration
  const refreshWorkspaces = useCallback(async () => {
    try {
      const [health, wsData] = await Promise.all([
        getHealth().catch(() => null),
        getWorkspaces().catch(() => null),
      ]);

      if (health) {
        setBackendHealthy(true);
        const resolvedHealthUrl = resolveBackendUrl(health.previewUrl);
        if (resolvedHealthUrl) setPreviewUrl(resolvedHealthUrl);
        if (health.workspaces?.length) setWorkspaces(health.workspaces);
        if (health.activeWorkspace) {
          setActiveWorkspaceId(health.activeWorkspace.id);
          const resolvedActiveUrl = resolveBackendUrl(
            health.activeWorkspace.previewUrl
          );
          if (resolvedActiveUrl) {
            setPreviewUrl(resolvedActiveUrl);
          }
        }
      }

      if (wsData && wsData.workspaces.length > 0) {
        setWorkspaces(wsData.workspaces);
        if (wsData.active) {
          setActiveWorkspaceId(wsData.active.id);
          const resolvedWsUrl = resolveBackendUrl(wsData.active.previewUrl);
          if (resolvedWsUrl) {
            setPreviewUrl(resolvedWsUrl);
          }
        }
      }
    } catch {
      setBackendHealthy(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
    return () => {
      unsubscribeRef.current?.();
    };
  }, [refreshWorkspaces]);

  // Sync speed mode defaults cleanly
  const handleSpeedModeChange = (nextMode: ExecutionSpeedMode) => {
    setSpeedMode(nextMode);
    setGenerateBespokeAssets(nextMode === 'deep_atelier');
  };

  // Pointer-capture column resize handlers for 2 : 9 : 2 rails
  const startResize = (
    side: 'left' | 'right',
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizingSide(side);
    dragStartRef.current = {
      clientX: e.clientX,
      initialWidth: side === 'left' ? leftRailWidth : rightRailWidth,
    };
  };

  const handleResizeMove = (
    side: 'left' | 'right',
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (resizingSide !== side || !dragStartRef.current) return;
    const delta = e.clientX - dragStartRef.current.clientX;
    if (side === 'left') {
      const next = Math.max(
        MIN_LEFT_WIDTH,
        Math.min(MAX_LEFT_WIDTH, Math.round(dragStartRef.current.initialWidth + delta))
      );
      setLeftRailWidth(next);
    } else {
      const next = Math.max(
        MIN_RIGHT_WIDTH,
        Math.min(MAX_RIGHT_WIDTH, Math.round(dragStartRef.current.initialWidth - delta))
      );
      setRightRailWidth(next);
    }
  };

  const stopResize = () => {
    setResizingSide(null);
    dragStartRef.current = null;
  };

  // Switch active target repo workspace
  const handleSwitchWorkspace = async (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId && workspaces.length > 0) return;
    setSwitchingWorkspace(true);
    try {
      const res = await switchWorkspace(workspaceId);
      setActiveWorkspaceId(res.workspace?.id || workspaceId);
      const nextPreview = resolveBackendUrl(
        res.previewUrl || res.workspace?.previewUrl
      );
      if (nextPreview) {
        setPreviewUrl(nextPreview);
      }
      setDrawnCircles([]);
      setLastAppliedCircles([]);
      setLastRunSummary(null);
      setBaselineScreenshotUrl(undefined);
      setFinalScreenshotUrl(undefined);
      setScorecard(undefined);
      setIterations([]);
      setReloadNonce((n) => n + 1);
      await refreshWorkspaces();
      pushToast(
        'success',
        `Switched live canvas to ${res.workspace?.name || workspaceId}.`
      );
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Failed to switch workspace.'
      );
    } finally {
      setSwitchingWorkspace(false);
    }
  };

  // Reset active target repo back to original AI Slop baseline
  const handleResetBaseline = async () => {
    setResettingBaseline(true);
    try {
      const res = await resetBaselineSnapshot();
      const nextPreview = resolveBackendUrl(res.previewUrl);
      if (nextPreview) setPreviewUrl(nextPreview);
      if (res.baselineScreenshotUrl || res.screenshotUrl) {
        setBaselineScreenshotUrl(
          res.baselineScreenshotUrl || res.screenshotUrl
        );
      }
      setFinalScreenshotUrl(undefined);
      setDrawnCircles([]);
      setLastAppliedCircles([]);
      setLastRunSummary(null);
      setReloadNonce((n) => n + 1);
      setHmrPulseAt(Date.now());
      pushToast('success', 'Target app reset cleanly to original baseline.');
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Reset baseline failed.'
      );
    } finally {
      setResettingBaseline(false);
    }
  };

  // Open a real GitHub PR for the active transformation
  const handleOpenPr = async () => {
    setOpeningPr(true);
    try {
      const descriptionLines = [
        'Automated multimodal visual craft upgrade generated by **AntiSlop Studio** (Gemini 4 + Calibrated Decisions API).',
        manifest?.vibeTitle ? `\n**Direction:** ${manifest.vibeTitle}` : '',
        manifest?.editorialRationale ? `\n${manifest.editorialRationale}` : '',
        scorecard
          ? `\n**Calibrated Decisions API (\`gemini-decision-1\`)**\n- Taste Index: **${Math.round(
              scorecard.overallTasteScore
            )} / 100**\n- Slop Penalty: **${scorecard.metrics.slopPenalty.value.toFixed(
              1
            )} / 10**\n- Aesthetic Match: **${scorecard.metrics.aestheticMatch.value.toFixed(
              1
            )} / 10**\n- DOM Audit: ${scorecard.domAudit.horizontalOverflowPx}px overflow, ${
              scorecard.domAudit.overlappingTextNodes
            } overlaps, ${scorecard.domAudit.consoleErrorCount} console errors`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const pr = await openGitHubPr({
        runId: currentRunId,
        manifest,
        scorecard,
        title: manifest?.vibeTitle
          ? `AntiSlop: ${manifest.vibeTitle} (Taste ${Math.round(
              scorecard?.overallTasteScore ?? 0
            )}/100)`
          : 'AntiSlop: Multimodal Visual Craft Upgrade',
        description: descriptionLines,
      });
      setLastPr(pr);
      pushToast(
        'success',
        `Opened GitHub PR #${pr.prNumber} (${pr.filesChanged.length} files changed)`,
        pr.prUrl,
        'Open PR ↗'
      );
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Could not open GitHub PR.'
      );
    } finally {
      setOpeningPr(false);
    }
  };

  // Hydrate completed TransformRunResult into Studio + Reveal Sweep + Fix-Glow + 5-Sigma Arena
  const hydrateRunResult = useCallback((result: TransformRunResult) => {
    const completedJob = activeJobRef.current;

    setCurrentRunId(result.runId);
    if (result.manifest) setManifest(result.manifest);
    if (result.baselineScreenshotUrl) {
      setBaselineScreenshotUrl(result.baselineScreenshotUrl);
    }
    if (result.finalScreenshotUrl) {
      setFinalScreenshotUrl(result.finalScreenshotUrl);
    }

    let finalScorecard: DecisionsScorecard | undefined;
    let baselineScorecard = runStartScorecardRef.current;

    if (result.iterations?.length) {
      setIterations(result.iterations);
      const baseIter = result.iterations.find(
        (it) => it.phase === 'baseline_capture'
      );
      if (baseIter?.scorecard) {
        baselineScorecard = baseIter.scorecard;
      }
      const last = result.iterations[result.iterations.length - 1];
      if (last?.scorecard) {
        finalScorecard = last.scorecard;
        setScorecard(last.scorecard);
      }
      if (!result.finalScreenshotUrl && last?.screenshotUrl) {
        setFinalScreenshotUrl(last.screenshotUrl);
      }
    }

    if (result.mode === 'text_baseline') setBaselineResult(result);
    else if (result.mode === 'antislop') setAntislopResult(result);
    else if (result.mode === 'stress_test') setStressTestResult(result);

    // Populate Fix-Glow regions & floating "What Changed" Pill
    setLastAppliedCircles(completedJob?.drawnCircles ?? []);
    setLastRunSummary({
      completedAt: Date.now(),
      mode: result.mode,
      slopBefore: baselineScorecard?.metrics?.slopPenalty?.value,
      slopAfter: finalScorecard?.metrics?.slopPenalty?.value,
      matchAfter: finalScorecard?.metrics?.aestheticMatch?.value,
      tasteBefore: baselineScorecard?.overallTasteScore,
      tasteAfter: finalScorecard?.overallTasteScore,
      latencyMs: result.totalLatencyMs,
    });

    activeJobRef.current = null;
    setActiveJob(null);
    setReloadNonce((n) => n + 1);
    setHmrPulseAt(Date.now());
    setIsRunning(false);
    isRunningRef.current = false;
    setActiveModeRunning(null);
    setLiveStatusText(undefined);
    setLiveModelTag(undefined);
  }, []);

  const finishRunWithError = useCallback(
    (message: string) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      activeJobRef.current = null;
      setActiveJob(null);
      setIsRunning(false);
      isRunningRef.current = false;
      setActiveModeRunning(null);
      setLiveStatusText(undefined);
      setLiveModelTag(undefined);
      pushToast('error', message);
    },
    [pushToast]
  );

  // Execute a concrete frozen QueuedEditJob immediately
  const startRunFromJob = useCallback(
    async (job: QueuedEditJob) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;

      activeJobRef.current = job;
      runStartScorecardRef.current = latestScorecardRef.current;
      isRunningRef.current = true;

      setActiveJob(job);
      setIsRunning(true);
      setActiveModeRunning(job.mode);
      setEvents([]);
      setThinkingBuffer('');
      setLiveStatusText(
        job.mode === 'circle_tweak'
          ? `Surgical edit: "${job.label.slice(0, 56)}"`
          : job.mode === 'text_baseline'
          ? 'Running text-only AI Slop baseline…'
          : job.speedMode === 'fast_demo'
          ? 'Carbon + Neon synthesizing taste & live code'
          : 'Deep Atelier 4× parallel candidate race'
      );
      setLiveModelTag(
        job.mode === 'circle_tweak'
          ? 'gemini-4-hydrogen'
          : job.speedMode === 'deep_atelier'
          ? 'gemini-4-carbon'
          : 'gemini-4-neon'
      );

      const firstCircle = job.drawnCircles[0];
      const combinedInstruction = [
        job.voiceTranscript?.trim(),
        job.textPrompt?.trim(),
        ...job.drawnCircles
          .map((c, idx) => (c.note ? `Circle #${idx + 1}: ${c.note}` : ''))
          .filter(Boolean),
      ]
        .filter(Boolean)
        .join(' | ');

      const payload: TransformRunRequest = {
        mode: job.mode,
        speedMode: job.speedMode,
        assets: job.assets.map(stripToMediaAssetInput),
        voiceAudioBase64: job.voiceAudioBase64,
        voiceAudioMimeType: job.voiceAudioMimeType,
        voiceTranscript: job.voiceTranscript?.trim() || undefined,
        textPrompt:
          job.textPrompt ||
          (job.mode === 'stress_test'
            ? 'Reconcile conflicting editorial print and rugged industrial hardware aesthetics cleanly with zero slop or layout breakage.'
            : job.mode === 'circle_tweak' && !job.voiceTranscript?.trim()
            ? combinedInstruction ||
              'Refine layout craft, typographic hierarchy, and spacing cleanly.'
            : undefined),
        parallelCandidates:
          job.mode === 'text_baseline' || job.mode === 'circle_tweak'
            ? 1
            : job.speedMode === 'deep_atelier'
            ? 4
            : 1,
        maxIterations:
          job.mode === 'circle_tweak'
            ? 1
            : job.speedMode === 'fast_demo'
            ? 1
            : 2,
        generateBespokeAssets:
          job.mode === 'text_baseline' || job.mode === 'circle_tweak'
            ? false
            : job.generateBespokeAssets,
        drawnCircles:
          job.mode === 'circle_tweak' && job.drawnCircles.length > 0
            ? job.drawnCircles
            : undefined,
        circleOverlayPngBase64:
          job.mode === 'circle_tweak' ? job.circleOverlayPngBase64 : undefined,
        targetRegion:
          job.mode === 'circle_tweak' && firstCircle
            ? {
                x: firstCircle.x,
                y: firstCircle.y,
                width: firstCircle.width,
                height: firstCircle.height,
                instruction:
                  combinedInstruction ||
                  'Refine this circled region for stronger typographic hierarchy, contrast, and tactile craft.',
              }
            : undefined,
      };

      try {
        const res = await startTransformRun(payload);

        if (isFullRunResult(res) && res.status !== 'running') {
          hydrateRunResult(res);
          return;
        }

        const runId = res.runId;
        setCurrentRunId(runId);

        if ('result' in res && res.result && res.result.status !== 'running') {
          hydrateRunResult(res.result);
          return;
        }

        unsubscribeRef.current = subscribeToRunStream(
          runId,
          (ev) => {
            setEvents((prev) => [...prev.slice(-90), ev]);
            if (ev.message) setLiveStatusText(ev.message);
            if (ev.model) setLiveModelTag(ev.model);

            const data = ev.payload as Record<string, unknown> | undefined;

            switch (ev.type) {
              case 'snapshot_captured': {
                const baseUrl =
                  typeof data?.baselineScreenshotUrl === 'string'
                    ? data.baselineScreenshotUrl
                    : typeof data?.screenshotUrl === 'string'
                    ? data.screenshotUrl
                    : undefined;
                if (baseUrl) setBaselineScreenshotUrl(baseUrl);
                if (data?.scorecard) {
                  const snapCard = data.scorecard as DecisionsScorecard;
                  runStartScorecardRef.current = snapCard;
                  setScorecard(snapCard);
                }
                break;
              }
              case 'director_thinking': {
                const chunk =
                  typeof data?.delta === 'string'
                    ? data.delta
                    : ev.message || '';
                if (chunk) {
                  setThinkingBuffer((prev) =>
                    `${prev}${prev ? '\n' : ''}${chunk}`.slice(-1800)
                  );
                }
                break;
              }
              case 'manifest_ready': {
                if (data && 'vibeTitle' in data) {
                  setManifest(data as unknown as DesignManifest);
                } else if (data?.manifest) {
                  setManifest(data.manifest as DesignManifest);
                }
                break;
              }
              case 'candidate_scored': {
                if (data?.scorecard) {
                  setScorecard(data.scorecard as DecisionsScorecard);
                }
                break;
              }
              case 'iteration_complete': {
                const iter = (
                  data && 'scorecard' in data ? data : data?.iteration
                ) as CriticIteration | undefined;
                if (iter && typeof iter === 'object') {
                  setIterations((prev) => {
                    const filtered = prev.filter(
                      (p) => p.iteration !== iter.iteration
                    );
                    return [...filtered, iter].sort(
                      (a, b) => a.iteration - b.iteration
                    );
                  });
                  if (iter.scorecard) setScorecard(iter.scorecard);
                  if (iter.screenshotUrl) {
                    setFinalScreenshotUrl(iter.screenshotUrl);
                  }
                }
                setReloadNonce((n) => n + 1);
                setHmrPulseAt(Date.now());
                break;
              }
              case 'hmr_reloaded': {
                setReloadNonce((n) => n + 1);
                setHmrPulseAt(Date.now());
                break;
              }
              case 'run_completed': {
                unsubscribeRef.current?.();
                unsubscribeRef.current = null;
                if (isFullRunResult(ev.payload)) {
                  hydrateRunResult(ev.payload);
                } else {
                  getRunResult(runId)
                    .then((full) => hydrateRunResult(full))
                    .catch(() =>
                      finishRunWithError(
                        'Completed run could not be fetched from backend.'
                      )
                    );
                }
                break;
              }
              case 'run_error': {
                finishRunWithError(ev.message || 'Transform run failed.');
                break;
              }
              default:
                break;
            }
          },
          () => {
            getRunResult(runId)
              .then((full) => {
                if (full.status !== 'running') {
                  hydrateRunResult(full);
                } else {
                  finishRunWithError('Live stream closed before run completed.');
                }
              })
              .catch(() => {
                finishRunWithError('Lost connection to AntiSlop run stream.');
              });
          }
        );
      } catch (err) {
        finishRunWithError(
          err instanceof Error
            ? err.message
            : 'Could not reach AntiSlop backend API.'
        );
      }
    },
    [finishRunWithError, hydrateRunResult]
  );

  // Automatic seamless dequeue: the exact moment the active run finishes, launch the next queued edit!
  useEffect(() => {
    if (isRunning || editQueue.length === 0) return;
    const [nextJob, ...rest] = editQueue;
    setEditQueue(rest);
    void startRunFromJob(nextJob);
  }, [editQueue, isRunning, startRunFromJob]);

  // Enqueue or immediately execute a Transform / Circle-to-Tweak / Arena Run
  const enqueueOrExecuteRun = useCallback(
    (
      mode: TransformRunRequest['mode'],
      options?: { textPrompt?: string }
    ) => {
      let effectiveAssets = [...assets];

      // Helpful safeguard for 5-Sigma Arena or empty full transform
      if (
        (mode === 'antislop' || mode === 'stress_test') &&
        effectiveAssets.length === 0 &&
        !voiceTranscript.trim() &&
        !voiceAudioBase64 &&
        !options?.textPrompt?.trim()
      ) {
        if (activeTab === 'arena') {
          if (mode === 'stress_test') {
            effectiveAssets = [
              buildQuickStarterVisualAsset(QUICK_TASTE_STARTERS[0]),
              buildQuickStarterVisualAsset(QUICK_TASTE_STARTERS[2]),
            ];
            setAssets(effectiveAssets);
          } else {
            effectiveAssets = [
              buildQuickStarterVisualAsset(QUICK_TASTE_STARTERS[0]),
            ];
            setAssets(effectiveAssets);
          }
        } else {
          pushToast(
            'info',
            'Snap a live website URL, drop a moodboard image, snap webcam, or speak an edit first.'
          );
          return;
        }
      }

      if (
        mode === 'circle_tweak' &&
        drawnCircles.length === 0 &&
        !voiceTranscript.trim() &&
        !voiceAudioBase64 &&
        !options?.textPrompt?.trim()
      ) {
        pushToast('info', 'Circle a region on the canvas or speak an edit first.');
        return;
      }

      const overlayPng =
        mode === 'circle_tweak' && drawnCircles.length > 0
          ? liveCanvasRef.current?.exportOverlayPngBase64()
          : undefined;

      const circleNotes = drawnCircles
        .map((c) => c.note?.trim())
        .filter(Boolean)
        .join(' · ');
      const siteAsset = effectiveAssets.find((a) => a.sourceDomain);

      const label =
        voiceTranscript.trim() ||
        options?.textPrompt?.trim() ||
        circleNotes ||
        (mode === 'circle_tweak'
          ? `Refine ${drawnCircles.length || 1} circled region${drawnCircles.length > 1 ? 's' : ''}`
          : mode === 'text_baseline'
          ? 'Text-only AI Slop baseline'
          : mode === 'stress_test'
          ? '5-Sigma conflict stress test'
          : siteAsset?.sourceDomain
          ? `Transform from ${siteAsset.sourceDomain}`
          : 'Transform live app');

      const job: QueuedEditJob = {
        id: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        mode,
        label,
        createdAt: Date.now(),
        assets: effectiveAssets,
        voiceTranscript: voiceTranscript.trim() || undefined,
        voiceAudioBase64,
        voiceAudioMimeType,
        textPrompt: options?.textPrompt,
        drawnCircles: mode === 'circle_tweak' ? [...drawnCircles] : [],
        circleOverlayPngBase64: overlayPng,
        speedMode,
        generateBespokeAssets,
      };

      // Clear transient circle/voice draft right away so user can immediately queue another edit
      if (mode === 'circle_tweak' || isRunningRef.current) {
        setDrawnCircles([]);
        setVoiceTranscript('');
        setVoiceAudioBase64(undefined);
        setVoiceAudioMimeType(undefined);
      }

      if (isRunningRef.current) {
        setEditQueue((prev) => {
          const next = [...prev, job];
          pushToast(
            'info',
            `Queued #${next.length + 1}: "${job.label.slice(0, 52)}" — will run automatically.`
          );
          return next;
        });
        return;
      }

      void startRunFromJob(job);
    },
    [
      activeTab,
      assets,
      drawnCircles,
      generateBespokeAssets,
      pushToast,
      speedMode,
      startRunFromJob,
      voiceAudioBase64,
      voiceAudioMimeType,
      voiceTranscript,
    ]
  );

  // Right-rail Talk & Circle submit handler (automatically chooses surgical edit or full transform)
  const handleSubmitTalkEdit = useCallback(() => {
    if (drawnCircles.length > 0) {
      enqueueOrExecuteRun('circle_tweak');
      return;
    }
    if (voiceTranscript.trim() || voiceAudioBase64) {
      const mode: TransformRunRequest['mode'] =
        assets.length > 0 && !scorecard ? 'antislop' : 'circle_tweak';
      enqueueOrExecuteRun(mode);
    }
  }, [
    assets.length,
    drawnCircles.length,
    enqueueOrExecuteRun,
    scorecard,
    voiceAudioBase64,
    voiceTranscript,
  ]);

  const handleRemoveQueuedJob = useCallback((jobId: string) => {
    setEditQueue((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const effectiveLeftWidth = leftCollapsed
    ? COLLAPSED_RAIL_WIDTH
    : leftRailWidth;
  const effectiveRightWidth = rightCollapsed
    ? COLLAPSED_RAIL_WIDTH
    : rightRailWidth;

  const queueSummaries: QueuedEditSummary[] = editQueue.map((j) => ({
    id: j.id,
    mode: j.mode,
    label: j.label,
    circlesCount: j.drawnCircles.length,
    createdAt: j.createdAt,
  }));

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F5F3EE] text-[#141413]">
      {/* Top 52px Studio Bar */}
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        speedMode={speedMode}
        onSpeedModeChange={handleSpeedModeChange}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchWorkspace={(id) => void handleSwitchWorkspace(id)}
        switchingWorkspace={switchingWorkspace}
        onOpenRepoModal={() => setRepoModalOpen(true)}
        onResetBaseline={() => void handleResetBaseline()}
        resettingBaseline={resettingBaseline}
        onOpenPr={() => void handleOpenPr()}
        openingPr={openingPr}
        backendHealthy={backendHealthy}
      />

      {/* Active Studio Surface */}
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        {activeTab === 'canvas' && (
          <div
            style={{
              gridTemplateColumns: `${effectiveLeftWidth}px minmax(0, 1fr) ${effectiveRightWidth}px`,
            }}
            className="relative grid h-full min-h-0 w-full flex-1"
          >
            {/* LEFT 2 RAIL — Live Site URL + Moodboard + Webcam + Transform */}
            <div className="relative min-h-0 min-w-0">
              <TasteTray
                collapsed={leftCollapsed}
                onToggleCollapse={() => setLeftCollapsed((v) => !v)}
                assets={assets}
                onAddAssets={(incoming) =>
                  setAssets((prev) => [...prev, ...incoming].slice(0, 16))
                }
                onRemoveAsset={(id) =>
                  setAssets((prev) => prev.filter((a) => a.id !== id))
                }
                onClearAssets={() => setAssets([])}
                onSeedVoiceHint={(hint) => {
                  if (!voiceTranscript.trim()) {
                    setVoiceTranscript(hint);
                  }
                }}
                onNotify={pushToast}
                generateBespokeAssets={generateBespokeAssets}
                onToggleBespokeAssets={setGenerateBespokeAssets}
                speedMode={speedMode}
                drawnCirclesCount={drawnCircles.length}
                isRunning={isRunning}
                queueCount={editQueue.length}
                onRunTransform={() => enqueueOrExecuteRun('antislop')}
                onRunCircleTweak={() => enqueueOrExecuteRun('circle_tweak')}
              />

              {/* Subtle Hairline Resize Handle (Left Rail <-> Center Canvas) */}
              {!leftCollapsed && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize references rail"
                  data-dragging={resizingSide === 'left' ? 'true' : 'false'}
                  onPointerDown={(e) => startResize('left', e)}
                  onPointerMove={(e) => handleResizeMove('left', e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onDoubleClick={() => setLeftRailWidth(DEFAULT_LEFT_WIDTH)}
                  title="Drag to resize · Double-click to reset 2:9:2"
                  className="atelier-resize-handle -right-[3px]"
                />
              )}
            </div>

            {/* CENTER 9 CANVAS — Zero-Flicker Live Preview + Reveal Sweep + Fix-Glow */}
            <div className="min-h-0 min-w-0">
              <LiveCanvas
                ref={liveCanvasRef}
                previewUrl={previewUrl}
                reloadNonce={reloadNonce}
                hmrPulseAt={hmrPulseAt}
                baselineScreenshotUrl={baselineScreenshotUrl}
                finalScreenshotUrl={finalScreenshotUrl}
                drawnCircles={drawnCircles}
                onDrawnCirclesChange={setDrawnCircles}
                drawMode={drawMode}
                onDrawModeChange={setDrawMode}
                voiceTranscript={voiceTranscript}
                onCanvasVoiceRecorded={(out) => {
                  setVoiceAudioBase64(out.audioBase64);
                  setVoiceAudioMimeType(out.mimeType);
                  if (out.transcript) {
                    setVoiceTranscript(out.transcript);
                  }
                  pushToast(
                    'info',
                    out.transcript
                      ? `Heard: "${out.transcript.slice(0, 80)}"`
                      : 'Voice note captured — apply or queue now.'
                  );
                }}
                onApplyCircleSpeak={() => enqueueOrExecuteRun('circle_tweak')}
                isRunning={isRunning}
                queueCount={editQueue.length}
                liveStatusText={liveStatusText}
                liveModelTag={liveModelTag}
                lastAppliedCircles={lastAppliedCircles}
                lastRunSummary={lastRunSummary}
                isResizingRails={resizingSide !== null}
              />
            </div>

            {/* RIGHT 2 RAIL — Continuous Talk + Live Queue + Visual Decisions API Graph */}
            <div className="relative min-h-0 min-w-0">
              {/* Subtle Hairline Resize Handle (Center Canvas <-> Right Rail) */}
              {!rightCollapsed && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize critic rail"
                  data-dragging={resizingSide === 'right' ? 'true' : 'false'}
                  onPointerDown={(e) => startResize('right', e)}
                  onPointerMove={(e) => handleResizeMove('right', e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onDoubleClick={() => setRightRailWidth(DEFAULT_RIGHT_WIDTH)}
                  title="Drag to resize · Double-click to reset 2:9:2"
                  className="atelier-resize-handle -left-[3px]"
                />
              )}

              <CriticRail
                collapsed={rightCollapsed}
                onToggleCollapse={() => setRightCollapsed((v) => !v)}
                scorecard={scorecard}
                manifest={manifest}
                iterations={iterations}
                events={events}
                isRunning={isRunning}
                activeModeRunning={activeModeRunning}
                activeJobLabel={activeJob?.label}
                thinkingBuffer={thinkingBuffer}
                speedMode={speedMode}
                assetsCount={assets.length}
                drawMode={drawMode}
                onToggleDrawMode={() => setDrawMode((v) => !v)}
                drawnCirclesCount={drawnCircles.length}
                voiceTranscript={voiceTranscript}
                onVoiceTranscriptChange={setVoiceTranscript}
                onVoiceRecorded={(out) => {
                  setVoiceAudioBase64(out.audioBase64);
                  setVoiceAudioMimeType(out.mimeType);
                  if (out.transcript) {
                    setVoiceTranscript(out.transcript);
                  }
                  pushToast(
                    'info',
                    out.transcript
                      ? `Heard: "${out.transcript.slice(0, 80)}"`
                      : 'Voice note captured — click Go or Queue.'
                  );
                }}
                onSubmitTalkEdit={handleSubmitTalkEdit}
                editQueue={queueSummaries}
                onRemoveQueuedJob={handleRemoveQueuedJob}
              />
            </div>
          </div>
        )}

        {activeTab === 'arena' && (
          <SigmaArena
            speedMode={speedMode}
            assetsCount={assets.length}
            isRunning={isRunning}
            activeModeRunning={activeModeRunning}
            baselineResult={baselineResult}
            antislopResult={antislopResult}
            stressTestResult={stressTestResult}
            onRunExperiment={(mode, prompt) =>
              enqueueOrExecuteRun(mode, { textPrompt: prompt })
            }
          />
        )}

        {activeTab === 'managed_agent' && (
          <ManagedAgentPanel
            defaultRepoUrl={activeWorkspace?.repoUrl}
            defaultBranch={activeWorkspace?.branch}
            manifest={manifest}
            scorecard={scorecard}
            lastPr={lastPr}
            openingPr={openingPr}
            onOpenPr={() => void handleOpenPr()}
          />
        )}

        {/* Crisp Paper Toast Notification */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={`fixed bottom-4 right-4 z-50 flex max-w-md items-center gap-2.5 rounded-lg border px-3.5 py-2.5 shadow-lg ${
              toast.tone === 'error'
                ? 'border-[#E03E2D] bg-[#FDF1EF] text-[#141413]'
                : toast.tone === 'success'
                ? 'border-[#15803D] bg-[#EEF8F1] text-[#141413]'
                : 'border-[#141413] bg-white text-[#141413]'
            }`}
          >
            {toast.tone === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-[#E03E2D]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" />
            )}
            <span className="text-[12px] font-medium">{toast.message}</span>
            {toast.linkUrl && (
              <a
                href={toast.linkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded bg-[#141413] px-2 py-1 font-mono text-[10.5px] font-semibold text-white"
              >
                {toast.linkLabel || 'Open'}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss notification"
              className="ml-1 text-[#64625D] hover:text-[#141413]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </main>

      {/* Connect GitHub Repository Modal */}
      <RepoModal
        open={repoModalOpen}
        onClose={() => setRepoModalOpen(false)}
        onRepoConnected={({ workspaceId, workspaceName, previewUrl: nextUrl }) => {
          if (workspaceId) setActiveWorkspaceId(workspaceId);
          const resolvedNext = resolveBackendUrl(nextUrl);
          if (resolvedNext) setPreviewUrl(resolvedNext);
          setDrawnCircles([]);
          setLastAppliedCircles([]);
          setLastRunSummary(null);
          setReloadNonce((n) => n + 1);
          setHmrPulseAt(Date.now());
          void refreshWorkspaces();
          pushToast(
            'success',
            `Connected & booted ${workspaceName || 'GitHub repository'} live in Studio Canvas.`
          );
        }}
      />
    </div>
  );
}
