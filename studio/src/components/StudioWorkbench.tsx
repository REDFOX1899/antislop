'use client';

import dynamic from 'next/dynamic';
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
  captureReferenceUrl,
  connectGitHubRepo,
  getHealth,
  getRunResult,
  getWorkspaces,
  openGitHubPr,
  resetBaselineSnapshot,
  resolveBackendUrl,
  startTransformRun,
  subscribeToRunStream,
  switchWorkspace,
  type WorkspaceRecommendation,
} from '@/lib/api';
import {
  QUICK_TASTE_STARTERS,
  buildQuickStarterVisualAsset,
  createAssetId,
  extractDomainFromUrl,
  stripToMediaAssetInput,
  type LocalMediaAsset,
} from '@/lib/media';
import { useTheme } from '@/lib/useTheme';
import {
  CriticRail,
  type QueuedEditSummary,
  type TechnicalMissionId,
} from './CriticRail';
import { LandingHub } from './LandingHub';

// Lazy-load heavy inspection & design-system modals to minimize First Load JS
const DecisionMatrixModal = dynamic(
  () => import('./DecisionMatrixModal').then((m) => m.DecisionMatrixModal),
  { ssr: false }
);
const DesignSystemModal = dynamic(
  () => import('./DesignSystemModal').then((m) => m.DesignSystemModal),
  { ssr: false }
);
const GeometryAuditModal = dynamic(
  () => import('./GeometryAuditModal').then((m) => m.GeometryAuditModal),
  { ssr: false }
);
const ConversionJudgeModal = dynamic(
  () => import('./ConversionJudgeModal').then((m) => m.ConversionJudgeModal),
  { ssr: false }
);
const BrandMemoryModal = dynamic(
  () => import('./BrandMemoryModal').then((m) => m.BrandMemoryModal),
  { ssr: false }
);
import {
  LiveCanvas,
  type CanvasChangeSummary,
  type LiveCanvasHandle,
} from './LiveCanvas';
import { ManagedAgentPanel } from './ManagedAgentPanel';
import { RepoModal } from './RepoModal';
import { SigmaArena } from './SigmaArena';
import { TasteTray } from './TasteTray';
import { TopBar, formatWorkspaceDisplay, type StudioTab } from './TopBar';

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

const DEFAULT_LEFT_WIDTH = 212;
const DEFAULT_RIGHT_WIDTH = 296;
const COLLAPSED_LEFT_WIDTH = 44;
const MIN_LEFT_WIDTH = 188;
const MAX_LEFT_WIDTH = 300;
const MIN_RIGHT_WIDTH = 264;
const MAX_RIGHT_WIDTH = 400;

function isFullRunResult(obj: unknown): obj is TransformRunResult {
  return (
    Boolean(obj) &&
    typeof obj === 'object' &&
    'runId' in (obj as Record<string, unknown>) &&
    Array.isArray((obj as Record<string, unknown>).iterations)
  );
}

function isLikelyGitHubRepoInput(raw: string): boolean {
  const s = raw.trim();
  if (/^https?:\/\/(www\.)?github\.com\/[^/\s]+\/[^/\s]+/i.test(s)) return true;
  if (/^(www\.)?github\.com\/[^/\s]+\/[^/\s]+/i.test(s)) return true;
  // Shorthand owner/repo without a TLD dot in the first segment
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s) && !s.split('/')[0].includes('.')) {
    return true;
  }
  return false;
}

export function StudioWorkbench() {
  const { theme, toggleTheme } = useTheme();

  // 2-Page Code Wiki Flow: Landing Hub (default) <-> Studio Workspace (also supports /?view=studio or /?workspace=1)
  const [viewMode, setViewMode] = useState<'landing' | 'studio'>('landing');
  const [activeTab, setActiveTab] = useState<StudioTab>('canvas');
  const [speedMode, setSpeedMode] = useState<ExecutionSpeedMode>('fast_demo');
  const [generateBespokeAssets, setGenerateBespokeAssets] = useState(false);

  // Landing command bar busy state
  const [landingCommandBusy, setLandingCommandBusy] = useState(false);
  const [landingCommandStatus, setLandingCommandStatus] = useState<string | null>(
    null
  );

  // 2 : 9 : 2 spatial proportions — resizable & collapsible rails
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
  const [loadingMissionId, setLoadingMissionId] =
    useState<TechnicalMissionId | null>(null);
  const [repoModalOpen, setRepoModalOpen] = useState(false);
  const [deepAuditOpen, setDeepAuditOpen] = useState(false);
  const [designSystemOpen, setDesignSystemOpen] = useState(false);
  const [geometryAuditOpen, setGeometryAuditOpen] = useState(false);
  const [conversionJudgeOpen, setConversionJudgeOpen] = useState(false);
  const [brandMemoryOpen, setBrandMemoryOpen] = useState(false);

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

  // Hydrate initial view & tab from URL query params (/?view=studio, /?workspace=1, /?tab=arena)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const workspaceParam = params.get('workspace');
    const tabParam = params.get('tab');

    if (
      viewParam === 'studio' ||
      workspaceParam === '1' ||
      workspaceParam === 'true' ||
      tabParam === 'arena' ||
      tabParam === 'managed_agent'
    ) {
      setViewMode('studio');
    }
    if (tabParam === 'arena') {
      setActiveTab('arena');
    } else if (tabParam === 'managed_agent') {
      setActiveTab('managed_agent');
    }
  }, []);

  const syncUrlQuery = useCallback((nextView: 'landing' | 'studio', nextTab?: StudioTab) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (nextView === 'studio') {
      url.searchParams.set('view', 'studio');
      url.searchParams.delete('workspace');
      if (nextTab && nextTab !== 'canvas') {
        url.searchParams.set('tab', nextTab);
      } else {
        url.searchParams.delete('tab');
      }
    } else {
      url.searchParams.delete('view');
      url.searchParams.delete('workspace');
      url.searchParams.delete('tab');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const enterStudio = useCallback(
    (tab: StudioTab = 'canvas') => {
      setActiveTab(tab);
      setViewMode('studio');
      syncUrlQuery('studio', tab);
    },
    [syncUrlQuery]
  );

  const goToLanding = useCallback(() => {
    setViewMode('landing');
    syncUrlQuery('landing');
  }, [syncUrlQuery]);

  const handleTabChange = useCallback(
    (tab: StudioTab) => {
      setActiveTab(tab);
      syncUrlQuery('studio', tab);
    },
    [syncUrlQuery]
  );

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

  const handleSpeedModeChange = (nextMode: ExecutionSpeedMode) => {
    setSpeedMode(nextMode);
    setGenerateBespokeAssets(nextMode === 'deep_atelier');
  };

  // Pointer-capture column resize handlers
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

  // Landing Hub starter card instant launch
  const handleSelectStarterFromLanding = async (workspaceId: string) => {
    enterStudio('canvas');
    if (workspaceId && workspaceId !== activeWorkspaceId) {
      await handleSwitchWorkspace(workspaceId);
    }
  };

  // Landing Hub sculptural command bar smart router (GitHub repo OR live site URL capture)
  const handleLandingCommandSubmit = async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      enterStudio('canvas');
      return;
    }

    setLandingCommandBusy(true);
    try {
      if (isLikelyGitHubRepoInput(trimmed)) {
        const normalizedRepoUrl = /^https?:\/\//i.test(trimmed)
          ? trimmed
          : /^github\.com\//i.test(trimmed)
          ? `https://${trimmed}`
          : `https://github.com/${trimmed}`;
        setLandingCommandStatus('Booting repo…');
        const res = await connectGitHubRepo(normalizedRepoUrl);
        if (res.workspace?.id) setActiveWorkspaceId(res.workspace.id);
        const resolvedNext = resolveBackendUrl(
          res.previewUrl || res.workspace?.previewUrl
        );
        if (resolvedNext) setPreviewUrl(resolvedNext);
        setDrawnCircles([]);
        setLastAppliedCircles([]);
        setLastRunSummary(null);
        setReloadNonce((n) => n + 1);
        setHmrPulseAt(Date.now());
        void refreshWorkspaces();
        enterStudio('canvas');
        pushToast(
          'success',
          `Connected & booted ${res.workspace?.name || normalizedRepoUrl} live in Studio.`
        );
      } else {
        const normalizedUrl = /^https?:\/\//i.test(trimmed)
          ? trimmed
          : `https://${trimmed}`;
        const domain = extractDomainFromUrl(normalizedUrl);
        setLandingCommandStatus(`Snapping ${domain}…`);
        const res = await captureReferenceUrl(normalizedUrl);
        const finalUrl = res.url || normalizedUrl;
        const finalDomain = extractDomainFromUrl(finalUrl);
        const mimeType = res.asset?.mimeType || 'image/png';
        const shotPreviewUrl = res.asset?.dataBase64
          ? `data:${mimeType};base64,${res.asset.dataBase64}`
          : resolveBackendUrl(res.asset?.fileUrl || res.screenshotUrl) || '';

        const cssSummary = res.extractedCssSummary?.trim();
        const titleText = res.title?.trim() || finalDomain;
        const combinedLabel = cssSummary
          ? `${titleText} (${finalDomain}) · ${cssSummary}`
          : `${titleText} (${finalDomain})`;

        const capturedAsset: LocalMediaAsset = {
          id: res.asset?.id || createAssetId('site'),
          modality: res.asset?.modality || 'moodboard_image',
          mimeType,
          dataBase64: res.asset?.dataBase64,
          fileUrl: res.asset?.fileUrl || res.screenshotUrl,
          filename: res.asset?.filename || `${finalDomain}.png`,
          label: combinedLabel,
          previewUrl: shotPreviewUrl,
          sourceUrl: finalUrl,
          sourceDomain: finalDomain,
          extractedCssSummary: cssSummary,
        };

        setAssets((prev) => [capturedAsset, ...prev].slice(0, 16));
        enterStudio('canvas');
        pushToast(
          'success',
          `Snapped ${finalDomain} — screenshot + CSS DNA loaded in References.`
        );
      }
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error
          ? err.message
          : 'Could not launch that URL — opening Studio workspace.'
      );
      enterStudio('canvas');
    } finally {
      setLandingCommandBusy(false);
      setLandingCommandStatus(null);
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

  const attachRunStreamById = useCallback(
    (
      runId: string,
      options?: {
        label?: string;
        mode?: TransformRunRequest['mode'];
        modelTag?: string;
      }
    ) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;

      setCurrentRunId(runId);
      if (options?.label) {
        isRunningRef.current = true;
        setIsRunning(true);
        setActiveModeRunning(options.mode ?? 'antislop');
        setEvents([]);
        setThinkingBuffer('');
        setLiveStatusText(`Live Voice · "${options.label.slice(0, 56)}"`);
        setLiveModelTag(options.modelTag ?? 'gemini-3.8-live');
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
    },
    [finishRunWithError, hydrateRunResult]
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

        attachRunStreamById(runId);
      } catch (err) {
        finishRunWithError(
          err instanceof Error
            ? err.message
            : 'Could not reach AntiSlop backend API.'
        );
      }
    },
    [attachRunStreamById, finishRunWithError, hydrateRunResult]
  );

  // Automatic seamless dequeue
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
      options?: { textPrompt?: string; generateBespokeAssets?: boolean }
    ) => {
      let effectiveAssets = [...assets];

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
        generateBespokeAssets:
          options?.generateBespokeAssets !== undefined
            ? options.generateBespokeAssets
            : generateBespokeAssets,
      };

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

  // Right-rail Talk & Circle submit handler
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

  const handleSelectDemoMission = async (missionId: TechnicalMissionId) => {
    if (loadingMissionId) return;
    setLoadingMissionId(missionId);
    try {
      if (missionId === 'url_transfer') {
        if (activeWorkspaceId !== 'novaflow-slop') {
          await handleSwitchWorkspace('novaflow-slop');
        }
        const res = await captureReferenceUrl('https://www.anthropic.com');
        const finalUrl = res.url || 'https://www.anthropic.com';
        const finalDomain = extractDomainFromUrl(finalUrl);
        const mimeType = res.asset?.mimeType || 'image/png';
        const shotPreviewUrl = res.asset?.dataBase64
          ? `data:${mimeType};base64,${res.asset.dataBase64}`
          : resolveBackendUrl(res.asset?.fileUrl || res.screenshotUrl) || '';
        const cssSummary = res.extractedCssSummary?.trim();
        const titleText = res.title?.trim() || finalDomain;
        const capturedAsset: LocalMediaAsset = {
          id: res.asset?.id || createAssetId('site'),
          modality: res.asset?.modality || 'moodboard_image',
          mimeType,
          dataBase64: res.asset?.dataBase64,
          fileUrl: res.asset?.fileUrl || res.screenshotUrl,
          filename: res.asset?.filename || `${finalDomain}.png`,
          label: cssSummary
            ? `${titleText} (${finalDomain}) · ${cssSummary}`
            : `${titleText} (${finalDomain})`,
          previewUrl: shotPreviewUrl,
          sourceUrl: finalUrl,
          sourceDomain: finalDomain,
          extractedCssSummary: cssSummary,
        };
        setAssets((prev) => [capturedAsset, ...prev].slice(0, 16));
        setVoiceTranscript(
          'Transfer anthropic.com warm alabaster editorial palette, serif display typography, and crisp high-contrast hierarchy — zero neon AI slop.'
        );
        pushToast(
          'success',
          'Staged Mission 1: anthropic.com CSS DNA captured — click Transform!'
        );
      } else if (missionId === 'shader_surgery') {
        setDrawMode(true);
        setVoiceTranscript(
          'Surgically transform ONLY the circled visual into a prowling cobalt tiger while preserving the surrounding layout, typography, and shader loop.'
        );
        pushToast(
          'info',
          'Staged Mission 2: Circle mode active — circle any region on the canvas, then click Apply!'
        );
      } else if (missionId === 'luxury_store') {
        if (activeWorkspaceId !== 'shopcraft-store') {
          await handleSwitchWorkspace('shopcraft-store');
        }
        const kyotoStarter = QUICK_TASTE_STARTERS.find(
          (s) => s.id === 'kyoto_ceramic'
        );
        if (kyotoStarter) {
          const starterAsset = buildQuickStarterVisualAsset(kyotoStarter);
          setAssets((prev) => [starterAsset, ...prev].slice(0, 16));
        }
        setGenerateBespokeAssets(true);
        setVoiceTranscript(
          'Transform Kova Goods into a tactile Monolith Ceramic & Plaster luxury editorial flagship with a bespoke Nano Banana stoneware hero photo and preserve all interactive cart & filter states.'
        );
        pushToast(
          'success',
          'Staged Mission 3: Kova Goods + Nano Banana 2.1 ON — click Transform!'
        );
      }
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Failed to stage mission'
      );
    } finally {
      setLoadingMissionId(null);
    }
  };

  const handleApplyRecommendation = useCallback(
    (rec: WorkspaceRecommendation) => {
      setGenerateBespokeAssets(rec.enableBespokeArt);
      setVoiceTranscript(rec.prompt);
      enqueueOrExecuteRun(rec.mode, {
        textPrompt: rec.prompt,
        generateBespokeAssets: rec.enableBespokeArt,
      });
    },
    [enqueueOrExecuteRun]
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const activeWorkspaceDisplay = activeWorkspace
    ? formatWorkspaceDisplay(activeWorkspace)
    : null;
  const workspaceCardTitle = activeWorkspace?.repoUrl
    ? activeWorkspace.repoUrl
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace('/', ' / ')
    : `REDFOX1899 / ${activeWorkspaceDisplay?.slug || activeWorkspaceId}`;

  const effectiveLeftWidth = leftCollapsed ? COLLAPSED_LEFT_WIDTH : leftRailWidth;
  const gridTemplateColumns = rightCollapsed
    ? `${effectiveLeftWidth}px minmax(0, 1fr)`
    : `${effectiveLeftWidth}px minmax(0, 1fr) ${rightRailWidth}px`;

  const queueSummaries: QueuedEditSummary[] = editQueue.map((j) => ({
    id: j.id,
    mode: j.mode,
    label: j.label,
    circlesCount: j.drawnCircles.length,
    createdAt: j.createdAt,
  }));

  const toastBanner = toast ? (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-50 flex max-w-md items-center gap-2.5 rounded-2xl border px-4 py-2.5 shadow-[var(--shadow-float)] ${
        toast.tone === 'error'
          ? 'border-[var(--vermilion-border)] bg-[var(--bg-card)] text-[var(--ink-primary)]'
          : toast.tone === 'success'
          ? 'border-[var(--emerald-border)] bg-[var(--bg-card)] text-[var(--ink-primary)]'
          : 'border-[var(--sapphire-border)] bg-[var(--bg-card)] text-[var(--ink-primary)]'
      }`}
    >
      {toast.tone === 'error' ? (
        <AlertCircle className="h-4 w-4 shrink-0 text-[var(--vermilion)]" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--emerald)]" />
      )}
      <span className="text-[12px] font-medium">{toast.message}</span>
      {toast.linkUrl && (
        <a
          href={toast.linkUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--btn-primary-bg)] px-2.5 py-1 font-mono text-[10.5px] font-semibold text-white hover:bg-[var(--btn-primary-hover)]"
        >
          {toast.linkLabel || 'Open'}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <button
        type="button"
        onClick={() => setToast(null)}
        aria-label="Dismiss notification"
        className="ml-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null;

  const repoModal = (
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
        enterStudio('canvas');
        pushToast(
          'success',
          `Connected & booted ${workspaceName || 'GitHub repository'} live in Studio Canvas.`
        );
      }}
    />
  );

  // VIEW 1 — CODE WIKI LANDING / LAUNCH HUB
  if (viewMode === 'landing') {
    return (
      <>
        <LandingHub
          theme={theme}
          onToggleTheme={toggleTheme}
          workspaces={workspaces}
          backendHealthy={backendHealthy}
          isSubmittingCommand={landingCommandBusy}
          commandStatusText={landingCommandStatus}
          onOpenStudio={() => enterStudio('canvas')}
          onOpenArena={() => enterStudio('arena')}
          onOpenRepoModal={() => setRepoModalOpen(true)}
          onSelectStarterWorkspace={(id) =>
            void handleSelectStarterFromLanding(id)
          }
          onSubmitCommand={handleLandingCommandSubmit}
        />
        {toastBanner}
        {repoModal}
      </>
    );
  }

  // VIEW 2 — ANTISLOP STUDIO WORKSPACE (3 Spatial Columns on #000000 with 14px gutters)
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-void)] text-[var(--ink-primary)]">
      {/* Uncluttered Single-Row 60px Top Bar */}
      <TopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        speedMode={speedMode}
        onSpeedModeChange={handleSpeedModeChange}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchWorkspace={(id) => void handleSwitchWorkspace(id)}
        switchingWorkspace={switchingWorkspace}
        onOpenRepoModal={() => setRepoModalOpen(true)}
        onOpenPr={() => void handleOpenPr()}
        openingPr={openingPr}
        backendHealthy={backendHealthy}
        theme={theme}
        onToggleTheme={toggleTheme}
        directorOpen={!rightCollapsed}
        onToggleDirector={() => setRightCollapsed((v) => !v)}
        onOpenDeepAudit={() => setDeepAuditOpen(true)}
        onOpenDesignSystem={() => setDesignSystemOpen(true)}
        onOpenGeometryAudit={() => setGeometryAuditOpen(true)}
        onOpenConversionJudge={() => setConversionJudgeOpen(true)}
        onOpenBrandMemory={() => setBrandMemoryOpen(true)}
        onGoLanding={goToLanding}
      />

      {/* Active Studio Surface */}
      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        {activeTab === 'canvas' && (
          <div
            style={{ gridTemplateColumns }}
            className="relative grid h-full min-h-0 w-full flex-1 gap-[14px] px-[14px] pb-[14px] pt-[2px]"
          >
            {/* LEFT RAIL — Borderless References on #000000 void */}
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
                activeTab={activeTab}
                onTabChange={handleTabChange}
                onResetBaseline={() => void handleResetBaseline()}
                resettingBaseline={resettingBaseline}
                activeWorkspaceId={activeWorkspaceId}
                onApplyRecommendation={handleApplyRecommendation}
              />

              {/* Hairline Resize Handle nested cleanly inside the 14px gutter */}
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
                  title="Drag to resize · Double-click to reset"
                  className="atelier-resize-handle -right-[14px]"
                />
              )}
            </div>

            {/* CENTER STAGE — Floating 16px-radius Obsidian Live Preview Card */}
            <div className="min-h-0 min-w-0">
              <LiveCanvas
                ref={liveCanvasRef}
                previewUrl={previewUrl}
                workspaceSlug={workspaceCardTitle}
                workspaceRepoUrl={activeWorkspace?.repoUrl}
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
                onLiveRunStarted={(runId, instruction) => {
                  attachRunStreamById(runId, {
                    label: instruction,
                    mode: 'antislop',
                    modelTag: 'gemini-3.8-live',
                  });
                  pushToast('info', `Gemini 3.8 Live executing: "${instruction.slice(0, 60)}"`);
                }}
                isRunning={isRunning}
                queueCount={editQueue.length}
                liveStatusText={liveStatusText}
                liveModelTag={liveModelTag}
                lastAppliedCircles={lastAppliedCircles}
                lastRunSummary={lastRunSummary}
                isResizingRails={resizingSide !== null}
              />
            </div>

            {/* RIGHT DIRECTOR CARD — Floating 16px-radius Gemini Panel */}
            {!rightCollapsed && (
              <div className="relative min-h-0 min-w-0">
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize director panel"
                  data-dragging={resizingSide === 'right' ? 'true' : 'false'}
                  onPointerDown={(e) => startResize('right', e)}
                  onPointerMove={(e) => handleResizeMove('right', e)}
                  onPointerUp={stopResize}
                  onPointerCancel={stopResize}
                  onDoubleClick={() => setRightRailWidth(DEFAULT_RIGHT_WIDTH)}
                  title="Drag to resize · Double-click to reset"
                  className="atelier-resize-handle -left-[14px]"
                />

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
                        : 'Voice note captured — send or queue now.'
                    );
                  }}
                  onSubmitTalkEdit={handleSubmitTalkEdit}
                  onSelectMission={(id) => void handleSelectDemoMission(id)}
                  loadingMissionId={loadingMissionId}
                  editQueue={queueSummaries}
                  onRemoveQueuedJob={handleRemoveQueuedJob}
                />
              </div>
            )}
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

        {toastBanner}
      </main>

      {repoModal}

      {deepAuditOpen && (
        <DecisionMatrixModal
          open={deepAuditOpen}
          onClose={() => setDeepAuditOpen(false)}
          screenshotUrl={finalScreenshotUrl || baselineScreenshotUrl}
          workspaceId={activeWorkspaceId}
          brandSummary={workspaceCardTitle}
          onApplySurgicalFix={(surgicalPrompt) => {
            setVoiceTranscript(surgicalPrompt);
            enqueueOrExecuteRun('antislop', { textPrompt: surgicalPrompt });
          }}
        />
      )}

      {designSystemOpen && (
        <DesignSystemModal
          open={designSystemOpen}
          onClose={() => setDesignSystemOpen(false)}
          onInstantLookApplied={() => {
            setReloadNonce((n) => n + 1);
            pushToast('success', 'Instant OKLCH palette & verified webfonts injected live (<50ms)');
          }}
          onApplyDesignSystem={(designPrompt) => {
            setVoiceTranscript(designPrompt);
            enqueueOrExecuteRun('antislop', { textPrompt: designPrompt });
          }}
        />
      )}

      {geometryAuditOpen && (
        <GeometryAuditModal
          open={geometryAuditOpen}
          onClose={() => setGeometryAuditOpen(false)}
          workspaceId={activeWorkspaceId}
          onApplyEngineeringFix={(fixPrompt) => {
            setVoiceTranscript(fixPrompt);
            enqueueOrExecuteRun('antislop', { textPrompt: fixPrompt });
          }}
        />
      )}

      {conversionJudgeOpen && (
        <ConversionJudgeModal
          open={conversionJudgeOpen}
          onClose={() => setConversionJudgeOpen(false)}
          tasteScore={scorecard?.overallTasteScore}
          baselineScreenshotUrl={baselineScreenshotUrl}
          finalScreenshotUrl={finalScreenshotUrl}
          brandSummary={workspaceCardTitle}
          onApplyConversionFix={(fixPrompt) => {
            setVoiceTranscript(fixPrompt);
            enqueueOrExecuteRun('antislop', { textPrompt: fixPrompt });
          }}
        />
      )}

      {brandMemoryOpen && (
        <BrandMemoryModal
          open={brandMemoryOpen}
          onClose={() => setBrandMemoryOpen(false)}
          workspaceId={activeWorkspaceId}
          workspaceName={workspaceCardTitle}
          onNotify={(msg) => pushToast('success', msg)}
        />
      )}
    </div>
  );
}
