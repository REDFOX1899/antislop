'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { DrawnCircleAnnotation, TransformRunRequest } from '@shared/types';
import {
  Columns2,
  ExternalLink,
  Loader2,
  Mic,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { resolveBackendUrl } from '@/lib/api';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { GeminiSparkleMark, GitHubMark } from './BrandMarks';

export interface LiveCanvasHandle {
  /** Exports current freehand vermilion circles + numbered pins as transparent PNG base64 */
  exportOverlayPngBase64: () => string | undefined;
}

export interface CanvasChangeSummary {
  completedAt: number;
  mode: TransformRunRequest['mode'];
  slopBefore?: number;
  slopAfter?: number;
  matchAfter?: number;
  tasteBefore?: number;
  tasteAfter?: number;
  latencyMs?: number;
}

interface LiveCanvasProps {
  previewUrl: string;
  workspaceSlug?: string;
  workspaceRepoUrl?: string;
  reloadNonce: number;
  hmrPulseAt: number | null;
  baselineScreenshotUrl?: string;
  finalScreenshotUrl?: string;
  drawnCircles: DrawnCircleAnnotation[];
  onDrawnCirclesChange: (circles: DrawnCircleAnnotation[]) => void;
  drawMode: boolean;
  onDrawModeChange: (active: boolean) => void;
  voiceTranscript: string;
  onCanvasVoiceRecorded: (payload: {
    audioBase64: string;
    mimeType: string;
    transcript: string;
  }) => void;
  onApplyCircleSpeak: () => void;
  isRunning: boolean;
  queueCount: number;
  liveStatusText?: string;
  liveModelTag?: string;
  lastAppliedCircles: DrawnCircleAnnotation[];
  lastRunSummary: CanvasChangeSummary | null;
  isResizingRails?: boolean;
}

function buildCacheBustedUrl(baseUrl: string, nonce: number, manual: number): string {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}_antislop=${nonce}_${manual}`;
}

export const LiveCanvas = forwardRef<LiveCanvasHandle, LiveCanvasProps>(
  function LiveCanvas(
    {
      previewUrl,
      workspaceSlug = 'REDFOX1899 / novaflow-slop',
      workspaceRepoUrl,
      reloadNonce,
      hmrPulseAt,
      baselineScreenshotUrl,
      finalScreenshotUrl,
      drawnCircles,
      onDrawnCirclesChange,
      drawMode,
      onDrawModeChange,
      voiceTranscript,
      onCanvasVoiceRecorded,
      onApplyCircleSpeak,
      isRunning,
      queueCount,
      liveStatusText,
      liveModelTag,
      lastAppliedCircles,
      lastRunSummary,
      isResizingRails = false,
    },
    ref
  ) {
    const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
    const [compareMode, setCompareMode] = useState(false);
    const [wipePercent, setWipePercent] = useState(50);
    const [manualReload, setManualReload] = useState(0);
    const [editingCircleId, setEditingCircleId] = useState<string | null>(null);
    const [showHmrBadge, setShowHmrBadge] = useState(false);

    // Zero-flicker double-buffered iframe state: keeps previous site visible until new frame paints
    const [slotUrls, setSlotUrls] = useState<[string, string | null]>(() => [
      buildCacheBustedUrl(previewUrl, reloadNonce, 0),
      null,
    ]);
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
    const pendingSlotRef = useRef<0 | 1 | null>(null);
    const swapFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCommittedSrcRef = useRef<string>(
      buildCacheBustedUrl(previewUrl, reloadNonce, 0)
    );

    // Dramatic Arrival Reveal Sweep + Fix-Glow + 6s What Changed Pill
    const [revealKey, setRevealKey] = useState<number>(0);
    const [showRevealEffect, setShowRevealEffect] = useState(false);
    const [showWhatChangedPill, setShowWhatChangedPill] = useState(false);

    const stageRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const activeStrokeRef = useRef<Array<{ x: number; y: number }>>([]);
    const isDrawingRef = useRef(false);

    const resolvedBaseline = resolveBackendUrl(baselineScreenshotUrl);
    const resolvedFinal = resolveBackendUrl(finalScreenshotUrl);

    const canvasVoice = useVoiceRecorder((out) => {
      onCanvasVoiceRecorded({
        audioBase64: out.audioBase64,
        mimeType: out.mimeType,
        transcript: out.transcript,
      });
    });

    const triggerArrivalReveal = useCallback(() => {
      setRevealKey((k) => k + 1);
      setShowRevealEffect(true);
    }, []);

    useEffect(() => {
      if (!showRevealEffect) return;
      const t = setTimeout(() => setShowRevealEffect(false), 3600);
      return () => clearTimeout(t);
    }, [showRevealEffect, revealKey]);

    // Queue next URL into hidden buffer iframe so active live site never blanks
    useEffect(() => {
      const nextSrc = buildCacheBustedUrl(previewUrl, reloadNonce, manualReload);
      if (nextSrc === lastCommittedSrcRef.current) return;
      lastCommittedSrcRef.current = nextSrc;

      const targetSlot: 0 | 1 = activeSlot === 0 ? 1 : 0;
      pendingSlotRef.current = targetSlot;

      setSlotUrls((prev) =>
        targetSlot === 0 ? [nextSrc, prev[1]] : [prev[0], nextSrc]
      );

      if (swapFallbackTimerRef.current) {
        clearTimeout(swapFallbackTimerRef.current);
      }
      swapFallbackTimerRef.current = setTimeout(() => {
        if (pendingSlotRef.current === targetSlot) {
          pendingSlotRef.current = null;
          setActiveSlot(targetSlot);
        }
      }, 2200);

      return () => {
        if (swapFallbackTimerRef.current) {
          clearTimeout(swapFallbackTimerRef.current);
          swapFallbackTimerRef.current = null;
        }
      };
    }, [previewUrl, reloadNonce, manualReload, activeSlot]);

    const handleIframeLoad = useCallback((slotIndex: 0 | 1) => {
      if (pendingSlotRef.current !== slotIndex) return;
      pendingSlotRef.current = null;
      if (swapFallbackTimerRef.current) {
        clearTimeout(swapFallbackTimerRef.current);
        swapFallbackTimerRef.current = null;
      }
      setTimeout(() => {
        setActiveSlot(slotIndex);
      }, 120);
    }, []);

    useEffect(() => {
      if (!hmrPulseAt) return;
      setShowHmrBadge(true);
      triggerArrivalReveal();
      const t = setTimeout(() => setShowHmrBadge(false), 3200);
      return () => clearTimeout(t);
    }, [hmrPulseAt, triggerArrivalReveal]);

    useEffect(() => {
      if (!lastRunSummary) return;
      setShowWhatChangedPill(true);
      triggerArrivalReveal();
      const t = setTimeout(() => setShowWhatChangedPill(false), 6000);
      return () => clearTimeout(t);
    }, [lastRunSummary, triggerArrivalReveal]);

    useEffect(() => {
      if (drawMode && compareMode) {
        setCompareMode(false);
      }
    }, [drawMode, compareMode]);

    // Render all saved circles + in-progress freehand stroke on HTML5 canvas
    const redrawCanvas = useCallback(
      (inProgressPoints?: Array<{ x: number; y: number }>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        const drawStroke = (
          pts: Array<{ x: number; y: number }>,
          dashed = false
        ) => {
          if (pts.length < 2) return;
          ctx.save();
          ctx.strokeStyle = '#FF5A4F';
          ctx.lineWidth = 3.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = 'rgba(255, 90, 79, 0.28)';
          ctx.shadowBlur = 5;
          if (dashed) ctx.setLineDash([6, 4]);

          ctx.beginPath();
          ctx.moveTo(pts[0].x * width, pts[0].y * height);
          for (let i = 1; i < pts.length - 1; i++) {
            const xc = ((pts[i].x + pts[i + 1].x) / 2) * width;
            const yc = ((pts[i].y + pts[i + 1].y) / 2) * height;
            ctx.quadraticCurveTo(pts[i].x * width, pts[i].y * height, xc, yc);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last.x * width, last.y * height);
          ctx.stroke();
          ctx.restore();
        };

        for (const circle of drawnCircles) {
          if (circle.points && circle.points.length >= 2) {
            drawStroke(circle.points);
          } else {
            ctx.save();
            ctx.strokeStyle = '#FF5A4F';
            ctx.lineWidth = 3;
            ctx.strokeRect(
              circle.x * width,
              circle.y * height,
              circle.width * width,
              circle.height * height
            );
            ctx.restore();
          }
        }

        if (inProgressPoints && inProgressPoints.length >= 2) {
          drawStroke(inProgressPoints);
        }

        ctx.restore();
      },
      [drawnCircles]
    );

    useEffect(() => {
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      if (!stage || !canvas) return;

      const syncSize = () => {
        const rect = stage.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        redrawCanvas(
          isDrawingRef.current ? activeStrokeRef.current : undefined
        );
      };

      syncSize();
      const observer = new ResizeObserver(syncSize);
      observer.observe(stage);
      return () => observer.disconnect();
    }, [redrawCanvas, viewportMode]);

    useEffect(() => {
      redrawCanvas();
    }, [drawnCircles, redrawCanvas]);

    useImperativeHandle(
      ref,
      () => ({
        exportOverlayPngBase64: () => {
          if (drawnCircles.length === 0) return undefined;
          const stage = stageRef.current;
          const w = Math.max(800, Math.round(stage?.clientWidth || 1280));
          const h = Math.max(500, Math.round(stage?.clientHeight || 800));

          const offscreen = document.createElement('canvas');
          offscreen.width = w;
          offscreen.height = h;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return undefined;

          drawnCircles.forEach((circle, idx) => {
            if (circle.points && circle.points.length >= 2) {
              ctx.save();
              ctx.strokeStyle = '#FF5A4F';
              ctx.lineWidth = 4;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.beginPath();
              ctx.moveTo(circle.points[0].x * w, circle.points[0].y * h);
              for (let i = 1; i < circle.points.length; i++) {
                ctx.lineTo(circle.points[i].x * w, circle.points[i].y * h);
              }
              ctx.stroke();
              ctx.restore();
            } else {
              ctx.save();
              ctx.strokeStyle = '#FF5A4F';
              ctx.lineWidth = 4;
              ctx.strokeRect(
                circle.x * w,
                circle.y * h,
                circle.width * w,
                circle.height * h
              );
              ctx.restore();
            }

            const px = Math.max(18, Math.min(w - 24, circle.x * w));
            const py = Math.max(18, Math.min(h - 24, circle.y * h));
            ctx.save();
            ctx.fillStyle = '#FF5A4F';
            ctx.beginPath();
            ctx.arc(px, py, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`#${idx + 1}`, px, py);
            ctx.restore();
          });

          const dataUrl = offscreen.toDataURL('image/png');
          const idx = dataUrl.indexOf(',');
          return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
        },
      }),
      [drawnCircles]
    );

    const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      return { x, y };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawMode) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      const pt = getNormalizedPoint(e);
      activeStrokeRef.current = [pt];
      redrawCanvas(activeStrokeRef.current);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawMode || !isDrawingRef.current) return;
      const pt = getNormalizedPoint(e);
      const pts = activeStrokeRef.current;
      const prev = pts[pts.length - 1];
      if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.004) {
        pts.push(pt);
        redrawCanvas(pts);
      }
    };

    const finishStroke = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const pts = activeStrokeRef.current;
      activeStrokeRef.current = [];

      if (pts.length < 3) {
        redrawCanvas();
        return;
      }

      let minX = 1;
      let minY = 1;
      let maxX = 0;
      let maxY = 0;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }

      const width = Math.max(0.03, maxX - minX);
      const height = Math.max(0.03, maxY - minY);

      const stride = Math.max(1, Math.ceil(pts.length / 48));
      const compactPoints = pts.filter(
        (_, i) => i % stride === 0 || i === pts.length - 1
      );

      const nextCircle: DrawnCircleAnnotation = {
        id: `circle_${Date.now().toString(36)}_${drawnCircles.length + 1}`,
        x: Number(minX.toFixed(4)),
        y: Number(minY.toFixed(4)),
        width: Number(width.toFixed(4)),
        height: Number(height.toFixed(4)),
        points: compactPoints.map((p) => ({
          x: Number(p.x.toFixed(4)),
          y: Number(p.y.toFixed(4)),
        })),
      };

      onDrawnCirclesChange([...drawnCircles, nextCircle]);
    };

    const undoCircle = () => {
      if (drawnCircles.length === 0) return;
      onDrawnCirclesChange(drawnCircles.slice(0, -1));
    };

    const clearCircles = () => {
      onDrawnCirclesChange([]);
      setEditingCircleId(null);
    };

    const updateCircleNote = (id: string, note: string) => {
      onDrawnCirclesChange(
        drawnCircles.map((c) => (c.id === id ? { ...c, note } : c))
      );
    };

    const removeCircle = (id: string) => {
      onDrawnCirclesChange(drawnCircles.filter((c) => c.id !== id));
      if (editingCircleId === id) setEditingCircleId(null);
    };

    const canCompare = Boolean(resolvedBaseline);

    const whatChangedSummaryText = (() => {
      if (!lastRunSummary) return '';
      const parts: string[] = ['Updated'];
      if (
        typeof lastRunSummary.slopBefore === 'number' &&
        typeof lastRunSummary.slopAfter === 'number'
      ) {
        parts.push(
          `Slop ${lastRunSummary.slopBefore.toFixed(1)} → ${lastRunSummary.slopAfter.toFixed(1)}`
        );
      } else if (typeof lastRunSummary.slopAfter === 'number') {
        parts.push(`Slop ${lastRunSummary.slopAfter.toFixed(1)}/10`);
      }
      if (typeof lastRunSummary.matchAfter === 'number') {
        parts.push(`Match ${lastRunSummary.matchAfter.toFixed(1)}/10`);
      }
      if (typeof lastRunSummary.latencyMs === 'number' && lastRunSummary.latencyMs > 0) {
        parts.push(`${(lastRunSummary.latencyMs / 1000).toFixed(1)}s`);
      }
      return parts.join(' · ');
    })();

    return (
      /* Floating 16px-radius Obsidian Card mirroring Code Wiki's main documentation card */
      <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[var(--border-card)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
        {/* Crisp Code Wiki Card Header: Repo Slug + [✦ Powered by Gemini 4] + Minimal Canvas Tools */}
        <div className="flex h-[50px] shrink-0 items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4">
          {/* Left: Repo Slug + Sapphire Powered by Gemini 4 Badge */}
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate text-[15px] font-medium tracking-[-0.015em] text-[var(--ink-primary)]">
              {workspaceSlug}
            </h1>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--sapphire-ice)] whitespace-nowrap lg:inline-flex">
              <GeminiSparkleMark className="h-3 w-3 shrink-0" />
              <span>Powered by Gemini 4</span>
            </span>
            {showHmrBadge && !isRunning && (
              <span className="hidden shrink-0 items-center gap-1 rounded-full border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-2 py-0.5 font-mono text-[9.5px] font-medium text-[var(--emerald)] xl:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]" />
                LIVE
              </span>
            )}
          </div>

          {/* Right: Clean Minimal Canvas Tools */}
          <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            {/* Circle Draw Toggle */}
            <button
              type="button"
              onClick={() => onDrawModeChange(!drawMode)}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors ${
                drawMode
                  ? 'border-[var(--vermilion)] bg-[var(--vermilion)] text-white'
                  : 'border-[var(--border-card)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] hover:border-[var(--border-strong)]'
              }`}
              title="Draw freehand vermilion circles directly over elements of the live app"
            >
              <Pencil className="h-3 w-3" />
              <span>{drawMode ? 'Circling' : 'Circle'}</span>
              {drawnCircles.length > 0 && (
                <span
                  className={`rounded-full px-1.5 font-mono text-[9.5px] ${
                    drawMode
                      ? 'bg-white/25 text-white'
                      : 'bg-[var(--vermilion-bg)] text-[var(--vermilion)]'
                  }`}
                >
                  {drawnCircles.length}
                </span>
              )}
            </button>

            {drawnCircles.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={undoCircle}
                  title="Undo last circle"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--border-card)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
                >
                  <Undo2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={clearCircles}
                  title="Clear all drawn circles"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--border-card)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)] hover:border-[var(--vermilion-border)] hover:text-[var(--vermilion)]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={onApplyCircleSpeak}
                  className="inline-flex h-[30px] items-center gap-1 rounded-full bg-[var(--vermilion)] px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[var(--vermilion-hover)]"
                  title={
                    isRunning
                      ? 'Add this circled region edit to the automatic queue'
                      : 'Run surgical circle-to-tweak edit via gemini-4-hydrogen'
                  }
                >
                  {isRunning ? (
                    <Plus className="h-3 w-3" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  <span>{isRunning ? 'Queue' : 'Apply'}</span>
                </button>
              </>
            )}

            {/* Inline Voice Speak Pill */}
            <div className="flex h-[30px] items-center gap-1 rounded-full border border-[var(--border-card)] bg-[var(--bg-subtle)] px-1">
              <button
                type="button"
                onClick={canvasVoice.toggleRecording}
                className={`inline-flex h-[24px] items-center gap-1 rounded-full px-2 text-[11.5px] font-medium transition-colors ${
                  canvasVoice.isRecording
                    ? 'bg-[var(--vermilion)] text-white'
                    : 'text-[var(--ink-primary)] hover:bg-[var(--bg-subtle-hover)]'
                }`}
                title="Speak an edit aloud (uses gemini-3.5-transcribe)"
              >
                {canvasVoice.isRecording ? (
                  <>
                    <Square className="h-2.5 w-2.5 fill-current" />
                    <span className="font-mono text-[10px]">
                      0:{String(canvasVoice.durationSec).padStart(2, '0')}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3 w-3 text-[var(--vermilion)]" />
                    <span>Speak</span>
                  </>
                )}
              </button>

              {(canvasVoice.isRecording || canvasVoice.isTranscribing) && (
                <div className="flex h-3.5 items-center gap-[2px] pr-1.5">
                  {canvasVoice.isTranscribing ? (
                    <span className="flex items-center gap-1 font-mono text-[9.5px] text-[var(--amber)]">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      transcribing
                    </span>
                  ) : (
                    canvasVoice.levels.slice(0, 7).map((lvl, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${Math.round(lvl * 100)}%` }}
                        className="w-[2px] rounded-full bg-[var(--vermilion)] transition-[height] duration-75"
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Before / After Toggle */}
            <button
              type="button"
              disabled={!canCompare}
              onClick={() => {
                onDrawModeChange(false);
                setCompareMode((v) => !v);
              }}
              className={`inline-flex h-[30px] items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                compareMode
                  ? 'border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] text-[var(--sapphire-ice)]'
                  : 'border-[var(--border-card)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]'
              }`}
              title={
                canCompare
                  ? 'Drag split curtain between AI Slop baseline and live transformed app'
                  : 'Run a transform first to capture the baseline screenshot'
              }
            >
              <Columns2 className="h-3 w-3" />
              <span className="hidden xl:inline">Before/After</span>
            </button>

            {/* 1440 | 390 Viewport Switcher */}
            <div className="flex h-[30px] items-center rounded-full border border-[var(--border-card)] bg-[var(--bg-subtle)] p-0.5">
              <button
                type="button"
                onClick={() => setViewportMode('desktop')}
                className={`inline-flex h-[24px] items-center gap-1 rounded-full px-2 font-mono text-[10px] transition-colors ${
                  viewportMode === 'desktop'
                    ? 'bg-[var(--bg-card-elevated)] text-[var(--ink-primary)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                }`}
                title="Desktop preview (1440px)"
              >
                <Monitor className="h-3 w-3" />
                <span className="hidden 2xl:inline">1440</span>
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('mobile')}
                className={`inline-flex h-[24px] items-center gap-1 rounded-full px-2 font-mono text-[10px] transition-colors ${
                  viewportMode === 'mobile'
                    ? 'bg-[var(--bg-card-elevated)] text-[var(--ink-primary)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                }`}
                title="Mobile preview (390px)"
              >
                <Smartphone className="h-3 w-3" />
                <span className="hidden 2xl:inline">390</span>
              </button>
            </div>

            {/* Refresh Live Preview */}
            <button
              type="button"
              onClick={() => setManualReload((n) => n + 1)}
              title="Refresh live preview seamlessly"
              aria-label="Refresh live preview"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--border-card)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
            >
              <RefreshCw className="h-3 w-3" />
            </button>

            {/* GitHub Icon / Open Live Preview Link */}
            <a
              href={workspaceRepoUrl || previewUrl}
              target="_blank"
              rel="noreferrer"
              title={
                workspaceRepoUrl
                  ? `Open repository on GitHub (${workspaceRepoUrl})`
                  : `Open live target app (${previewUrl}) in new tab`
              }
              aria-label={workspaceRepoUrl ? 'Open GitHub repository' : 'Open live preview in new tab'}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[var(--border-card)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
            >
              {workspaceRepoUrl ? (
                <GitHubMark className="h-3.5 w-3.5" />
              ) : (
                <ExternalLink className="h-3 w-3" />
              )}
            </a>
          </div>
        </div>

        {/* Slim Contextual Ink Ribbon when Circling */}
        {(drawMode || drawnCircles.length > 0) && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-4 py-1.5 text-[11.5px]">
            <div className="flex min-w-0 items-center gap-2 text-[var(--ink-primary)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--vermilion)]" />
              <span className="truncate">
                {drawMode
                  ? isRunning
                    ? 'Circle next region while current edit builds — speak or click Queue.'
                    : 'Circle any headline, card, or section, then speak or direct what to change.'
                  : `${drawnCircles.length} target region${drawnCircles.length > 1 ? 's' : ''} marked.`}
                {voiceTranscript.trim() ? (
                  <span className="ml-2 font-mono text-[10.5px] text-[var(--ink-secondary)]">
                    &ldquo;{voiceTranscript.trim().slice(0, 84)}
                    {voiceTranscript.trim().length > 84 ? '…' : ''}&rdquo;
                  </span>
                ) : null}
              </span>
            </div>
            {drawMode && (
              <button
                type="button"
                onClick={() => onDrawModeChange(false)}
                className="shrink-0 font-mono text-[10.5px] font-medium text-[var(--vermilion)] underline"
              >
                Done circling
              </button>
            )}
          </div>
        )}

        {/* Unobstructed Live Interactive Website Preview Stage */}
        <div className="atelier-stage-grid relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2.5">
          <div
            ref={stageRef}
            className={`relative flex h-full flex-col overflow-hidden rounded-[12px] border border-[var(--border-card)] bg-white shadow-[var(--shadow-card)] transition-[width] duration-200 ${
              viewportMode === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
            }`}
          >
            {/* Live Viewport Container */}
            <div className="relative flex-1 overflow-hidden bg-white">
              {/* Ultra-thin animated sapphire top-edge progress bar while building */}
              {isRunning && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[2.5px] overflow-hidden bg-black/15"
                >
                  <div className="atelier-progress-bar h-full w-1/2 bg-[#4285F4]" />
                </div>
              )}

              {/* Zero-Flicker Double-Buffered Live Iframes */}
              <iframe
                src={slotUrls[0]}
                title="Live AntiSlop Target Website Preview"
                onLoad={() => handleIframeLoad(0)}
                className={`absolute inset-0 h-full w-full border-0 bg-white transition-opacity duration-200 ${
                  activeSlot === 0
                    ? 'z-[1] opacity-100'
                    : 'pointer-events-none z-0 opacity-0'
                } ${isResizingRails ? 'pointer-events-none' : ''}`}
              />
              {slotUrls[1] && (
                <iframe
                  src={slotUrls[1]}
                  title="Live AntiSlop Target Website Preview Buffer"
                  onLoad={() => handleIframeLoad(1)}
                  className={`absolute inset-0 h-full w-full border-0 bg-white transition-opacity duration-200 ${
                    activeSlot === 1
                      ? 'z-[1] opacity-100'
                      : 'pointer-events-none z-0 opacity-0'
                  } ${isResizingRails ? 'pointer-events-none' : ''}`}
                />
              )}

              {/* 1.4s Luminous Sapphire-Emerald Hairline Reveal Sweep on Render Arrival */}
              {showRevealEffect && !compareMode && (
                <div
                  key={`sweep-${revealKey}`}
                  aria-hidden="true"
                  className="atelier-reveal-sweep pointer-events-none absolute inset-0 z-[25]"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(66,133,244,0) 0%, rgba(138,180,248,0.14) 64%, rgba(52,211,153,0.16) 94%, rgba(66,133,244,0.42) 100%)',
                    borderBottom: '2px solid #34D399',
                  }}
                />
              )}

              {/* Animated Emerald/Sapphire Fix-Glow Halos over Circled Regions OR Outer Perimeter */}
              {showRevealEffect && !compareMode && lastAppliedCircles.length > 0 && (
                <div
                  key={`halos-${revealKey}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-[25]"
                >
                  {lastAppliedCircles.map((circle, idx) => (
                    <div
                      key={`${circle.id}-${revealKey}`}
                      style={{
                        left: `${Math.max(1, circle.x * 100 - 1)}%`,
                        top: `${Math.max(1, circle.y * 100 - 1)}%`,
                        width: `${Math.min(98, circle.width * 100 + 2)}%`,
                        height: `${Math.min(98, circle.height * 100 + 2)}%`,
                        boxShadow:
                          '0 0 0 2px rgba(52,211,153,0.88), 0 0 24px 3px rgba(66,133,244,0.34), inset 0 0 18px rgba(52,211,153,0.12)',
                      }}
                      className="atelier-fix-halo absolute rounded-[8px] border border-[#34D399] bg-[#34D399]/[0.05]"
                    >
                      <span className="absolute -left-px -top-px h-2.5 w-2.5 border-l-2 border-t-2 border-[#4285F4]" />
                      <span className="absolute -right-px -top-px h-2.5 w-2.5 border-r-2 border-t-2 border-[#4285F4]" />
                      <span className="absolute -bottom-px -left-px h-2.5 w-2.5 border-b-2 border-l-2 border-[#34D399]" />
                      <span className="absolute -bottom-px -right-px h-2.5 w-2.5 border-b-2 border-r-2 border-[#34D399]" />
                      <span className="absolute -top-2.5 right-1.5 rounded-full bg-[#0B0D10] px-2 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-wider text-[#34D399] ring-1 ring-[#34D399]/50">
                        ✓ #{idx + 1} Refined
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {showRevealEffect && !compareMode && lastAppliedCircles.length === 0 && (
                <div
                  key={`frame-glow-${revealKey}`}
                  aria-hidden="true"
                  style={{
                    boxShadow:
                      'inset 0 0 0 2.5px rgba(52,211,153,0.85), inset 0 0 38px rgba(66,133,244,0.18)',
                  }}
                  className="atelier-frame-arrival pointer-events-none absolute inset-0 z-[25]"
                />
              )}

              {/* Floating "What Changed" Delta Pill at Top-Center */}
              {showWhatChangedPill && lastRunSummary && !compareMode && (
                <div
                  role="status"
                  aria-live="polite"
                  className="atelier-what-changed-pill absolute left-1/2 top-3 z-30 flex max-w-[94%] items-center gap-2 rounded-full border border-[var(--sapphire-border)] bg-[#0B0D10]/95 py-1.5 pl-3.5 pr-1.5 text-[#F1F3F4] shadow-[var(--shadow-float)]"
                >
                  <GeminiSparkleMark className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-mono text-[10.5px] font-medium">
                    {whatChangedSummaryText}
                  </span>
                  {canCompare && (
                    <button
                      type="button"
                      onClick={() => {
                        onDrawModeChange(false);
                        setCompareMode(true);
                        setShowWhatChangedPill(false);
                      }}
                      className="shrink-0 rounded-full bg-[#1A73E8] px-2.5 py-0.5 font-mono text-[9.5px] font-medium text-white transition-colors hover:bg-[#2B7DE9]"
                    >
                      Compare
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowWhatChangedPill(false)}
                    aria-label="Dismiss update summary"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#9AA0A6] hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Before / After Wipe Curtain Overlay */}
              {compareMode && resolvedBaseline && (
                <div className="absolute inset-0 z-20 overflow-hidden bg-white">
                  {resolvedFinal ? (
                    <img
                      src={resolvedFinal}
                      alt="After AntiSlop transformation"
                      className="h-full w-full select-none object-cover object-top"
                    />
                  ) : null}

                  <div
                    style={{
                      clipPath: `inset(0 ${100 - wipePercent}% 0 0)`,
                    }}
                    className="absolute inset-0 overflow-hidden bg-[#0B0D10]"
                  >
                    <img
                      src={resolvedBaseline}
                      alt="Before AI Slop baseline"
                      className="h-full w-full select-none object-cover object-top"
                    />
                  </div>

                  <div
                    style={{ left: `${wipePercent}%` }}
                    className="pointer-events-none absolute inset-y-0 z-10 w-[2px] -translate-x-1/2 bg-[#4285F4]"
                  >
                    <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#4285F4] bg-[#0B0D10] text-[#8AB4F8] shadow-lg">
                      <Columns2 className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-[#0B0D10]/90 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#F1F3F4]">
                    Before · Baseline
                  </div>
                  <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-[#34D399]/40 bg-[#0B0D10]/90 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#34D399]">
                    After · AntiSlop
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={wipePercent}
                    aria-label="Before and after comparison curtain position"
                    aria-valuetext={`${wipePercent}% baseline visible`}
                    onChange={(e) => setWipePercent(Number(e.target.value))}
                    className="wipe-range-input absolute inset-0 z-20 h-full w-full"
                  />
                </div>
              )}

              {/* Freehand Vermilion Ink HTML5 <canvas> Overlay */}
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
                className={`absolute inset-0 z-10 h-full w-full touch-none ${
                  drawMode
                    ? 'pointer-events-auto cursor-crosshair'
                    : 'pointer-events-none'
                }`}
              />

              {/* Numbered Callout Pins (#1, #2, ...) */}
              {!compareMode &&
                drawnCircles.map((circle, idx) => (
                  <div
                    key={circle.id}
                    style={{
                      left: `${Math.max(2, Math.min(94, circle.x * 100))}%`,
                      top: `${Math.max(2, Math.min(92, circle.y * 100))}%`,
                    }}
                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingCircleId(
                            editingCircleId === circle.id ? null : circle.id
                          )
                        }
                        className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#FF5A4F] px-1.5 font-mono text-[10px] font-bold text-white shadow-md"
                        title="Click to add optional note for this circle"
                      >
                        #{idx + 1}
                      </button>

                      {editingCircleId === circle.id && (
                        <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0B0D10] px-3 py-1 shadow-lg">
                          <input
                            type="text"
                            autoFocus
                            value={circle.note || ''}
                            onChange={(e) =>
                              updateCircleNote(circle.id, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Escape') {
                                setEditingCircleId(null);
                              }
                            }}
                            placeholder="Optional note…"
                            className="w-36 bg-transparent text-[11px] text-[#F1F3F4] placeholder:text-[#70757A] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeCircle(circle.id)}
                            aria-label={`Delete circle #${idx + 1}`}
                            className="text-[#9AA0A6] hover:text-[#FF5A4F]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

              {/* Minimal Floating Bottom-Center Pill while Building */}
              {isRunning && (
                <div
                  role="status"
                  aria-live="polite"
                  className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--sapphire-border)] bg-[#0B0D10]/95 px-3.5 py-1.5 text-[#F1F3F4] shadow-[var(--shadow-float)]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#4285F4] animate-studio-pulse" />
                  <span className="truncate font-mono text-[10.5px]">
                    {liveModelTag
                      ? `${liveModelTag.replace('gemini-4-', '').replace('gemini-', '')} · `
                      : ''}
                    {liveStatusText
                      ? `${liveStatusText.slice(0, 68)}${liveStatusText.length > 68 ? '…' : ''}`
                      : 'Gemini 4 working · keeping live preview active…'}
                  </span>
                  {queueCount > 0 && (
                    <span className="shrink-0 rounded-full bg-[#1A73E8] px-2 py-0.5 font-mono text-[9px] font-semibold text-white">
                      +{queueCount} queued
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }
);
