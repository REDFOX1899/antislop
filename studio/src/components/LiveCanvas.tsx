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

    // Auto-clear reveal overlays cleanly after animation completes
    useEffect(() => {
      if (!showRevealEffect) return;
      const t = setTimeout(() => setShowRevealEffect(false), 3600);
      return () => clearTimeout(t);
    }, [showRevealEffect, revealKey]);

    // Queue next URL into the hidden buffer iframe so the active live site never blanks
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
      // Safety net if remote/slow frame delays load event
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

    const handleIframeLoad = useCallback(
      (slotIndex: 0 | 1) => {
        if (pendingSlotRef.current !== slotIndex) return;
        pendingSlotRef.current = null;
        if (swapFallbackTimerRef.current) {
          clearTimeout(swapFallbackTimerRef.current);
          swapFallbackTimerRef.current = null;
        }
        // Small paint settle beat so Tailwind + fonts paint before atomic reveal swap
        setTimeout(() => {
          setActiveSlot(slotIndex);
        }, 120);
      },
      []
    );

    // Show crisp brief "HMR Synced" indicator + architectural reveal sweep on live updates
    useEffect(() => {
      if (!hmrPulseAt) return;
      setShowHmrBadge(true);
      triggerArrivalReveal();
      const t = setTimeout(() => setShowHmrBadge(false), 3200);
      return () => clearTimeout(t);
    }, [hmrPulseAt, triggerArrivalReveal]);

    // Show floating "What Changed" Pill at top-center for 6 seconds when a run completes
    useEffect(() => {
      if (!lastRunSummary) return;
      setShowWhatChangedPill(true);
      triggerArrivalReveal();
      const t = setTimeout(() => setShowWhatChangedPill(false), 6000);
      return () => clearTimeout(t);
    }, [lastRunSummary, triggerArrivalReveal]);

    // Turn off wipe compare mode automatically if draw mode is turned on
    useEffect(() => {
      if (drawMode && compareMode) {
        setCompareMode(false);
      }
    }, [drawMode, compareMode]);

    // Render all saved circles + in-progress freehand stroke on the HTML5 canvas
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
          ctx.strokeStyle = '#E03E2D';
          ctx.lineWidth = 3.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowColor = 'rgba(224, 62, 45, 0.22)';
          ctx.shadowBlur = 4;
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
            ctx.strokeStyle = '#E03E2D';
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

    // ResizeObserver keeps transparent ink canvas sharp at devicePixelRatio
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

    // Expose exportOverlayPngBase64() to parent workbench
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
              ctx.strokeStyle = '#E03E2D';
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
              ctx.strokeStyle = '#E03E2D';
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
            ctx.fillStyle = '#E03E2D';
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

    // Format crisp "What Changed" Pill readout
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
      <section className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#EFECE5]">
        {/* Crisp Architectural Canvas Toolbar */}
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[#E5E1D8] bg-[#FAF8F4] px-2.5">
          {/* Left: Circle Ink + Voice Mic + One-Click Apply/Queue */}
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDrawModeChange(!drawMode)}
              className={`flex h-7 items-center gap-1.5 rounded-[5px] border px-2 text-[11px] font-medium transition-colors ${
                drawMode
                  ? 'border-[#E03E2D] bg-[#E03E2D] text-white'
                  : 'border-[#E5E1D8] bg-white text-[#141413] hover:border-[#141413]'
              }`}
              title="Draw freehand vermilion circles directly over elements of the live app"
            >
              <Pencil className="h-3 w-3" />
              <span>{drawMode ? 'Circling' : 'Circle'}</span>
              {drawnCircles.length > 0 && (
                <span
                  className={`rounded-full px-1.5 font-mono text-[9.5px] ${
                    drawMode
                      ? 'bg-white/20 text-white'
                      : 'bg-[#FDF1EF] text-[#E03E2D]'
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
                  className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[#E5E1D8] bg-white text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
                >
                  <Undo2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={clearCircles}
                  title="Clear all drawn circles"
                  className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[#E5E1D8] bg-white text-[#64625D] hover:border-[#E03E2D] hover:text-[#E03E2D]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}

            <div className="mx-0.5 h-3.5 w-px bg-[#E5E1D8]" />

            {/* Inline Voice Mic */}
            <div className="flex h-7 items-center gap-1 rounded-[5px] border border-[#E5E1D8] bg-white px-1.5">
              <button
                type="button"
                onClick={canvasVoice.toggleRecording}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                  canvasVoice.isRecording
                    ? 'bg-[#E03E2D] text-white'
                    : 'text-[#141413] hover:bg-[#F5F3EE]'
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
                    <Mic className="h-3 w-3 text-[#E03E2D]" />
                    <span>Speak</span>
                  </>
                )}
              </button>

              {(canvasVoice.isRecording || canvasVoice.isTranscribing) && (
                <div className="flex h-3.5 items-center gap-[2px] px-0.5">
                  {canvasVoice.isTranscribing ? (
                    <span className="flex items-center gap-1 font-mono text-[9.5px] text-[#B45309]">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      transcribing
                    </span>
                  ) : (
                    canvasVoice.levels.slice(0, 8).map((lvl, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${Math.round(lvl * 100)}%` }}
                        className="w-[2px] rounded-full bg-[#E03E2D] transition-[height] duration-75"
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* One-Click Circle & Speak -> Apply or Queue (NEVER disabled during build!) */}
            {drawnCircles.length > 0 && (
              <button
                type="button"
                onClick={onApplyCircleSpeak}
                className="flex h-7 items-center gap-1 rounded-[5px] bg-[#E03E2D] px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#C53222]"
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
                <span>{isRunning ? 'Queue Circle Edit' : 'Apply Circle'}</span>
              </button>
            )}
          </div>

          {/* Right: HMR Synced + Before/After Wipe + Viewport + Reload */}
          <div className="flex shrink-0 items-center gap-1.5">
            {showHmrBadge && !isRunning && (
              <span className="hidden items-center gap-1 rounded border border-[#15803D]/30 bg-[#EEF8F1] px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-[#15803D] xl:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[#15803D]" />
                LIVE
              </span>
            )}

            <button
              type="button"
              disabled={!canCompare}
              onClick={() => {
                onDrawModeChange(false);
                setCompareMode((v) => !v);
              }}
              className={`flex h-7 items-center gap-1 rounded-[5px] border px-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                compareMode
                  ? 'border-[#141413] bg-[#141413] text-white'
                  : 'border-[#E5E1D8] bg-white text-[#141413] hover:border-[#141413]'
              }`}
              title={
                canCompare
                  ? 'Drag split curtain between AI Slop baseline and live transformed app'
                  : 'Run a transform first to capture the baseline screenshot'
              }
            >
              <Columns2 className="h-3 w-3" />
              <span className="hidden sm:inline">Before / After</span>
            </button>

            <div className="flex h-7 items-center rounded-[5px] border border-[#E5E1D8] bg-[#F5F3EE] p-0.5">
              <button
                type="button"
                onClick={() => setViewportMode('desktop')}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  viewportMode === 'desktop'
                    ? 'bg-white text-[#141413]'
                    : 'text-[#64625D] hover:text-[#141413]'
                }`}
                title="Desktop preview (1440px)"
              >
                <Monitor className="h-3 w-3" />
                <span className="hidden lg:inline">1440</span>
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('mobile')}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  viewportMode === 'mobile'
                    ? 'bg-white text-[#141413]'
                    : 'text-[#64625D] hover:text-[#141413]'
                }`}
                title="Mobile preview (390px)"
              >
                <Smartphone className="h-3 w-3" />
                <span className="hidden lg:inline">390</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setManualReload((n) => n + 1)}
              title="Refresh live preview seamlessly"
              className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[#E5E1D8] bg-white text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
            >
              <RefreshCw className="h-3 w-3" />
            </button>

            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              title={`Open live target app (${previewUrl}) in new tab`}
              className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[#E5E1D8] bg-white text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Slim contextual ink ribbon when circling */}
        {(drawMode || drawnCircles.length > 0) && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#E5E1D8] bg-[#FDF1EF] px-3 py-1 text-[11px]">
            <div className="flex min-w-0 items-center gap-2 text-[#141413]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#E03E2D]" />
              <span className="truncate">
                {drawMode
                  ? isRunning
                    ? 'Circle next region while current edit builds — speak or click Queue Circle Edit.'
                    : 'Circle any headline, card, or section, then speak what to change.'
                  : `${drawnCircles.length} target region${drawnCircles.length > 1 ? 's' : ''} marked.`}
                {voiceTranscript.trim() ? (
                  <span className="ml-2 font-mono text-[10px] text-[#64625D]">
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
                className="shrink-0 font-mono text-[10px] font-medium text-[#E03E2D] underline"
              >
                Done circling
              </button>
            )}
          </div>
        )}

        {/* Main Drafting Stage — maximized canvas area */}
        <div className="atelier-stage-grid relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
          <div
            ref={stageRef}
            className={`relative flex h-full flex-col overflow-hidden rounded-[7px] border border-[#D8D2C5] bg-white shadow-[0_6px_28px_-14px_rgba(20,20,19,0.18)] transition-[width] duration-200 ${
              viewportMode === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
            }`}
          >
            {/* Slim 24px Specimen Header */}
            <div className="flex h-6 shrink-0 items-center justify-between border-b border-[#E5E1D8] bg-[#FAF8F4] px-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D8D2C5]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#D8D2C5]" />
                <span className="h-1.5 w-1.5 rounded-full bg-[#D8D2C5]" />
                <span className="ml-1.5 truncate font-mono text-[9.5px] text-[#64625D]">
                  {previewUrl}
                </span>
              </div>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[#64625D]">
                {viewportMode === 'desktop' ? 'LIVE PREVIEW' : '390PX MOBILE'}
              </span>
            </div>

            {/* Live Viewport Container */}
            <div className="relative flex-1 overflow-hidden bg-white">
              {/* Ultra-thin 2px animated vermilion top-edge progress bar while building */}
              {isRunning && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[2.5px] overflow-hidden bg-[#E5E1D8]/50"
                >
                  <div className="atelier-progress-bar h-full w-1/2 bg-[#E03E2D]" />
                </div>
              )}

              {/* Zero-Flicker Double-Buffered Live Iframes (previous site NEVER blanks while building!) */}
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

              {/* 1.4s Architectural Luminous Hairline Reveal Curtain Sweep on New Render Arrival */}
              {showRevealEffect && !compareMode && (
                <div
                  key={`sweep-${revealKey}`}
                  aria-hidden="true"
                  className="atelier-reveal-sweep pointer-events-none absolute inset-0 z-[25]"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(245,243,238,0.22) 62%, rgba(21,128,61,0.14) 94%, rgba(224,62,45,0.45) 100%)',
                    borderBottom: '2px solid #15803D',
                  }}
                />
              )}

              {/* Animated Fix-Glow Halos over Circled Regions OR Refined Outer-Frame Emerald Arrival Glow */}
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
                          '0 0 0 2px rgba(21,128,61,0.85), 0 0 22px 2px rgba(21,128,61,0.28), inset 0 0 18px rgba(224,62,45,0.14)',
                      }}
                      className="atelier-fix-halo absolute rounded-[6px] border border-[#15803D] bg-[#15803D]/[0.04]"
                    >
                      <span className="absolute -left-px -top-px h-2.5 w-2.5 border-l-2 border-t-2 border-[#E03E2D]" />
                      <span className="absolute -right-px -top-px h-2.5 w-2.5 border-r-2 border-t-2 border-[#E03E2D]" />
                      <span className="absolute -bottom-px -left-px h-2.5 w-2.5 border-b-2 border-l-2 border-[#15803D]" />
                      <span className="absolute -bottom-px -right-px h-2.5 w-2.5 border-b-2 border-r-2 border-[#15803D]" />
                      <span className="absolute -top-2.5 right-1.5 rounded bg-[#15803D] px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-wider text-white">
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
                      'inset 0 0 0 2.5px rgba(21,128,61,0.85), inset 0 0 36px rgba(21,128,61,0.16)',
                  }}
                  className="atelier-frame-arrival pointer-events-none absolute inset-0 z-[25]"
                />
              )}

              {/* Floating "What Changed" Pill at Top-Center (auto-hides after 6s) */}
              {showWhatChangedPill && lastRunSummary && !compareMode && (
                <div
                  role="status"
                  aria-live="polite"
                  className="atelier-what-changed-pill absolute left-1/2 top-3 z-30 flex max-w-[94%] items-center gap-2 rounded-full border border-[#141413] bg-[#FFFFFF] py-1 pl-3 pr-1.5 text-[#141413] shadow-[0_10px_28px_-12px_rgba(20,20,19,0.32)]"
                >
                  <span className="font-mono text-[11px] font-semibold text-[#15803D]">
                    ✦
                  </span>
                  <span className="truncate font-mono text-[10.5px] font-medium text-[#141413]">
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
                      className="shrink-0 rounded-full bg-[#141413] px-2.5 py-0.5 font-mono text-[9.5px] font-medium text-[#F5F3EE] transition-colors hover:bg-[#E03E2D]"
                    >
                      Compare Before/After
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowWhatChangedPill(false)}
                    aria-label="Dismiss update summary"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#141413]"
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
                      className="h-full w-full object-cover object-top select-none"
                    />
                  ) : null}

                  <div
                    style={{
                      clipPath: `inset(0 ${100 - wipePercent}% 0 0)`,
                    }}
                    className="absolute inset-0 overflow-hidden bg-[#0F172A]"
                  >
                    <img
                      src={resolvedBaseline}
                      alt="Before AI Slop baseline"
                      className="h-full w-full object-cover object-top select-none"
                    />
                  </div>

                  <div
                    style={{ left: `${wipePercent}%` }}
                    className="pointer-events-none absolute inset-y-0 z-10 w-[2px] -translate-x-1/2 bg-[#E03E2D]"
                  >
                    <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#E03E2D] bg-white text-[#141413] shadow-md">
                      <Columns2 className="h-4 w-4 text-[#E03E2D]" />
                    </div>
                  </div>

                  <div className="pointer-events-none absolute left-3 top-3 rounded border border-[#E5E1D8] bg-white px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#141413]">
                    Before · Baseline
                  </div>
                  <div className="pointer-events-none absolute right-3 top-3 rounded border border-[#15803D]/30 bg-white px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#15803D]">
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
                        className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-[#E03E2D] px-1.5 font-mono text-[10px] font-bold text-white shadow-sm"
                        title="Click to add optional note for this circle"
                      >
                        #{idx + 1}
                      </button>

                      {editingCircleId === circle.id && (
                        <div className="flex items-center gap-1 rounded-md border border-[#141413] bg-white px-2 py-1 shadow-md">
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
                            className="w-36 bg-transparent text-[11px] text-[#141413] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeCircle(circle.id)}
                            aria-label={`Delete circle #${idx + 1}`}
                            className="text-[#64625D] hover:text-[#E03E2D]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

              {/* Minimal Floating Glassless Bottom-Center Pill while Building */}
              {isRunning && (
                <div
                  role="status"
                  aria-live="polite"
                  className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full border border-[#2C2B28] bg-[#141413] px-3.5 py-1.5 text-[#F5F3EE] shadow-[0_8px_24px_-8px_rgba(20,20,19,0.45)]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#E03E2D] animate-studio-pulse" />
                  <span className="truncate font-mono text-[10.5px]">
                    {liveModelTag
                      ? `${liveModelTag.replace('gemini-4-', '').replace('gemini-', '')} · `
                      : ''}
                    {liveStatusText
                      ? `${liveStatusText.slice(0, 68)}${liveStatusText.length > 68 ? '…' : ''} · keeping live preview active`
                      : 'Carbon + Neon working · keeping live preview active…'}
                  </span>
                  {queueCount > 0 && (
                    <span className="shrink-0 rounded-full bg-[#E03E2D] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white">
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
