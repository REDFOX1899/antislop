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
import { CheckCircle2, ExternalLink, X, AlertCircle } from 'lucide-react';
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
import { CriticRail } from './CriticRail';
import { LiveCanvas, type LiveCanvasHandle } from './LiveCanvas';
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

  // Collapsible rails — canvas defaults to >65% viewport, expandable to >85%
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Backend & Workspace state
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(DEFAULT_PREVIEW_URL);
  const [workspaces, setWorkspaces] = useState<WorkspaceRepoInfo[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('novaflow-slop');
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [repoModalOpen, setRepoModalOpen] = useState(false);

  // Multimodal Taste Tray & Canvas Annotations
  const [assets, setAssets] = useState<LocalMediaAsset[]>([]);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceAudioBase64, setVoiceAudioBase64] = useState<string | undefined>();
  const [voiceAudioMimeType, setVoiceAudioMimeType] = useState<
    string | undefined
  >();
  const [drawnCircles, setDrawnCircles] = useState<DrawnCircleAnnotation[]>([]);

  // Live Run + Telemetry State
  const [isRunning, setIsRunning] = useState(false);
  const [activeModeRunning, setActiveModeRunning] = useState<
    TransformRunRequest['mode'] | null
  >(null);
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
      setBaselineScreenshotUrl(undefined);
      setFinalScreenshotUrl(undefined);
      setReloadNonce((n) => n + 1);
      setHmrPulseAt(Date.now());
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
      setReloadNonce((n) => n + 1);
      setHmrPulseAt(Date.now());
      pushToast('success', 'Target app reset cleanly to original AI Slop baseline.');
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

  // Hydrate completed TransformRunResult into Studio + 5-Sigma Arena state
  const hydrateRunResult = useCallback(
    (result: TransformRunResult) => {
      setCurrentRunId(result.runId);
      if (result.manifest) setManifest(result.manifest);
      if (result.baselineScreenshotUrl) {
        setBaselineScreenshotUrl(result.baselineScreenshotUrl);
      }
      if (result.finalScreenshotUrl) {
        setFinalScreenshotUrl(result.finalScreenshotUrl);
      }
      if (result.voiceTranscript && !voiceTranscript.trim()) {
        setVoiceTranscript(result.voiceTranscript);
      }
      if (result.iterations?.length) {
        setIterations(result.iterations);
        const last = result.iterations[result.iterations.length - 1];
        if (last?.scorecard) setScorecard(last.scorecard);
        if (!result.finalScreenshotUrl && last?.screenshotUrl) {
          setFinalScreenshotUrl(last.screenshotUrl);
        }
      }

      if (result.mode === 'text_baseline') setBaselineResult(result);
      else if (result.mode === 'antislop') setAntislopResult(result);
      else if (result.mode === 'stress_test') setStressTestResult(result);

      if (result.mode === 'circle_tweak') {
        setDrawnCircles([]);
      }

      setReloadNonce((n) => n + 1);
      setHmrPulseAt(Date.now());
      setIsRunning(false);
      setActiveModeRunning(null);
      setLiveStatusText(undefined);
      setLiveModelTag(undefined);
    },
    [voiceTranscript]
  );

  // Core Transform / Circle-to-Tweak / Arena Run Orchestrator
  const executeRun = useCallback(
    async (
      mode: TransformRunRequest['mode'],
      options?: { textPrompt?: string }
    ) => {
      if (isRunning) return;

      let effectiveAssets = [...assets];

      // Helpful safeguard: in 5-Sigma Arena, auto-seed real procedural visual specimens if tray is empty
      if (
        (mode === 'antislop' || mode === 'stress_test') &&
        effectiveAssets.length === 0 &&
        !voiceTranscript.trim() &&
        !voiceAudioBase64
      ) {
        if (activeTab === 'arena') {
          if (mode === 'stress_test') {
            // Seed 2 deliberately contrasting visual aesthetics for Element 119 chaos test!
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
            'Drop a moodboard image, snap a physical object via webcam, speak aloud, or tap an optional Quick-Start first.'
          );
          return;
        }
      }

      unsubscribeRef.current?.();
      unsubscribeRef.current = null;

      setIsRunning(true);
      setActiveModeRunning(mode);
      setEvents([]);
      setThinkingBuffer('');
      setLiveStatusText(
        mode === 'circle_tweak'
          ? 'Applying surgical circle-to-tweak edit via gemini-4-hydrogen…'
          : mode === 'text_baseline'
          ? 'Running text-only AI Slop baseline…'
          : speedMode === 'fast_demo'
          ? 'Fast Demo (<25s): Synthesizing taste & transforming live app…'
          : 'Deep Atelier (4× Race): Carbon high thinking + parallel Neon coding…'
      );
      setLiveModelTag(
        mode === 'circle_tweak'
          ? 'gemini-4-hydrogen'
          : speedMode === 'deep_atelier'
          ? 'gemini-4-carbon'
          : 'gemini-4-neon'
      );

      const overlayPng =
        mode === 'circle_tweak'
          ? liveCanvasRef.current?.exportOverlayPngBase64()
          : undefined;

      const firstCircle = drawnCircles[0];
      const combinedInstruction = [
        voiceTranscript.trim(),
        ...drawnCircles
          .map((c, idx) => (c.note ? `Circle #${idx + 1}: ${c.note}` : ''))
          .filter(Boolean),
      ]
        .filter(Boolean)
        .join(' | ');

      const payload: TransformRunRequest = {
        mode,
        speedMode,
        assets: effectiveAssets.map(stripToMediaAssetInput),
        voiceAudioBase64,
        voiceAudioMimeType,
        voiceTranscript: voiceTranscript.trim() || undefined,
        textPrompt:
          options?.textPrompt ||
          (mode === 'stress_test'
            ? 'Reconcile conflicting editorial print and rugged industrial hardware aesthetics cleanly with zero slop or layout breakage.'
            : undefined),
        parallelCandidates:
          mode === 'text_baseline' || mode === 'circle_tweak'
            ? 1
            : speedMode === 'deep_atelier'
            ? 4
            : 1,
        maxIterations:
          mode === 'circle_tweak'
            ? 1
            : speedMode === 'fast_demo'
            ? 1
            : 2,
        generateBespokeAssets:
          mode === 'text_baseline' || mode === 'circle_tweak'
            ? false
            : generateBespokeAssets,
        drawnCircles: mode === 'circle_tweak' ? drawnCircles : undefined,
        circleOverlayPngBase64: overlayPng,
        targetRegion:
          mode === 'circle_tweak' && firstCircle
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

        // If backend returned a finished TransformRunResult synchronously
        if (
          isFullRunResult(res) &&
          res.status !== 'running'
        ) {
          hydrateRunResult(res);
          pushToast(
            'success',
            `Completed (${(res.totalLatencyMs / 1000).toFixed(1)}s) — live preview updated.`
          );
          return;
        }

        const runId = res.runId;
        setCurrentRunId(runId);

        if ('result' in res && res.result && res.result.status !== 'running') {
          hydrateRunResult(res.result);
          return;
        }

        // Subscribe to real-time SSE StreamEvents
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
                  setScorecard(data.scorecard as DecisionsScorecard);
                }
                break;
              }
              case 'voice_transcribed': {
                if (typeof data?.transcript === 'string' && data.transcript.trim()) {
                  setVoiceTranscript(data.transcript.trim());
                }
                break;
              }
              case 'director_thinking': {
                const chunk =
                  typeof data?.delta === 'string'
                    ? data.delta
                    : ev.message || '';
                if (chunk) {
                  setThinkingBuffer((prev) => `${prev}${prev ? '\n' : ''}${chunk}`.slice(-1800));
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
                  pushToast(
                    'success',
                    `Run completed in ${(ev.payload.totalLatencyMs / 1000).toFixed(1)}s.`
                  );
                } else {
                  getRunResult(runId)
                    .then((full) => {
                      hydrateRunResult(full);
                      pushToast(
                        'success',
                        `Run completed in ${(full.totalLatencyMs / 1000).toFixed(1)}s.`
                      );
                    })
                    .catch(() => {
                      setIsRunning(false);
                      setActiveModeRunning(null);
                      setReloadNonce((n) => n + 1);
                    });
                }
                break;
              }
              case 'run_error': {
                unsubscribeRef.current?.();
                unsubscribeRef.current = null;
                setIsRunning(false);
                setActiveModeRunning(null);
                setLiveStatusText(undefined);
                pushToast('error', ev.message || 'Transform run failed.');
                break;
              }
              default:
                break;
            }
          },
          () => {
            // Stream closed unexpectedly — attempt one final GET /api/runs/:runId check
            getRunResult(runId)
              .then((full) => {
                if (full.status !== 'running') {
                  hydrateRunResult(full);
                } else {
                  setIsRunning(false);
                  setActiveModeRunning(null);
                }
              })
              .catch(() => {
                setIsRunning(false);
                setActiveModeRunning(null);
              });
          }
        );
      } catch (err) {
        setIsRunning(false);
        setActiveModeRunning(null);
        setLiveStatusText(undefined);
        pushToast(
          'error',
          err instanceof Error
            ? err.message
            : 'Could not reach AntiSlop backend API.'
        );
      }
    },
    [
      activeTab,
      assets,
      drawnCircles,
      generateBespokeAssets,
      hydrateRunResult,
      isRunning,
      pushToast,
      speedMode,
      voiceAudioBase64,
      voiceAudioMimeType,
      voiceTranscript,
    ]
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

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
          <>
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
              voiceTranscript={voiceTranscript}
              onVoiceTranscriptChange={setVoiceTranscript}
              voiceAudioBase64={voiceAudioBase64}
              onVoiceRecorded={(out) => {
                setVoiceAudioBase64(out.audioBase64);
                setVoiceAudioMimeType(out.mimeType);
                if (out.transcript) {
                  setVoiceTranscript(out.transcript);
                }
                pushToast(
                  'info',
                  out.transcript
                    ? 'Voice art direction transcribed via gemini-3.5-transcribe.'
                    : 'Voice audio clip attached to transform payload.'
                );
              }}
              onClearVoiceAudio={() => {
                setVoiceAudioBase64(undefined);
                setVoiceAudioMimeType(undefined);
              }}
              generateBespokeAssets={generateBespokeAssets}
              onToggleBespokeAssets={setGenerateBespokeAssets}
              speedMode={speedMode}
              drawnCirclesCount={drawnCircles.length}
              isRunning={isRunning}
              onRunTransform={() => void executeRun('antislop')}
              onRunCircleTweak={() => void executeRun('circle_tweak')}
            />

            <LiveCanvas
              ref={liveCanvasRef}
              previewUrl={previewUrl}
              reloadNonce={reloadNonce}
              hmrPulseAt={hmrPulseAt}
              baselineScreenshotUrl={baselineScreenshotUrl}
              finalScreenshotUrl={finalScreenshotUrl}
              drawnCircles={drawnCircles}
              onDrawnCirclesChange={setDrawnCircles}
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
                    : 'Canvas voice note captured — click Apply Now.'
                );
              }}
              onApplyCircleSpeak={() => void executeRun('circle_tweak')}
              isRunning={isRunning}
              liveStatusText={liveStatusText}
              liveModelTag={liveModelTag}
            />

            <CriticRail
              collapsed={rightCollapsed}
              onToggleCollapse={() => setRightCollapsed((v) => !v)}
              scorecard={scorecard}
              manifest={manifest}
              iterations={iterations}
              events={events}
              isRunning={isRunning}
              thinkingBuffer={thinkingBuffer}
            />
          </>
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
              void executeRun(mode, { textPrompt: prompt })
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
