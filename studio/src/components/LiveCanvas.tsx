'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { DrawnCircleAnnotation } from '@shared/types';
import {
  Columns2,
  ExternalLink,
  Loader2,
  Mic,
  Monitor,
  Pencil,
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

interface LiveCanvasProps {
  previewUrl: string;
  reloadNonce: number;
  hmrPulseAt: number | null;
  baselineScreenshotUrl?: string;
  finalScreenshotUrl?: string;
  drawnCircles: DrawnCircleAnnotation[];
  onDrawnCirclesChange: (circles: DrawnCircleAnnotation[]) => void;
  voiceTranscript: string;
  onCanvasVoiceRecorded: (payload: {
    audioBase64: string;
    mimeType: string;
    transcript: string;
  }) => void;
  onApplyCircleSpeak: () => void;
  isRunning: boolean;
  liveStatusText?: string;
  liveModelTag?: string;
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
      voiceTranscript,
      onCanvasVoiceRecorded,
      onApplyCircleSpeak,
      isRunning,
      liveStatusText,
      liveModelTag,
    },
    ref
  ) {
    const [drawMode, setDrawMode] = useState(false);
    const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
    const [compareMode, setCompareMode] = useState(false);
    const [wipePercent, setWipePercent] = useState(50);
    const [manualReload, setManualReload] = useState(0);
    const [editingCircleId, setEditingCircleId] = useState<string | null>(null);
    const [showHmrBadge, setShowHmrBadge] = useState(false);

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

    // Show crisp brief "HMR Synced" indicator whenever Vite reloads
    useEffect(() => {
      if (!hmrPulseAt) return;
      setShowHmrBadge(true);
      const t = setTimeout(() => setShowHmrBadge(false), 3200);
      return () => clearTimeout(t);
    }, [hmrPulseAt]);

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

          // Draw vermilion freehand strokes + crisp #1, #2 numbered pins onto transparent PNG
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

            // Numbered vermilion callout pin
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

      // Downsample points cleanly (<= 48 points) for compact API payload
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

    const iframeSrc = (() => {
      const separator = previewUrl.includes('?') ? '&' : '?';
      return `${previewUrl}${separator}_antislop=${reloadNonce}_${manualReload}`;
    })();

    const canCompare = Boolean(resolvedBaseline);

    return (
      <section className="relative flex min-w-0 flex-1 flex-col bg-[#EFECE5]">
        {/* Floating Studio Canvas Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E1D8] bg-[#FAF8F4] px-3 py-2">
          {/* Left: Draw Circles + Voice-Only Mic + One-Click Apply */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDrawMode((v) => !v)}
              className={`flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[11.5px] font-medium transition-all ${
                drawMode
                  ? 'border-[#E03E2D] bg-[#E03E2D] text-white shadow-[0_1px_2px_rgba(224,62,45,0.28)]'
                  : 'border-[#E5E1D8] bg-white text-[#141413] hover:border-[#141413]'
              }`}
              title="Draw freehand vermilion circles directly onto elements of the live app"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{drawMode ? 'Drawing Circles' : 'Draw Circles'}</span>
              {drawnCircles.length > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
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
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#E5E1D8] bg-white text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={clearCircles}
                  title="Clear all drawn circles"
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#E5E1D8] bg-white text-[#64625D] hover:border-[#E03E2D] hover:text-[#E03E2D]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            <div className="mx-0.5 h-4 w-px bg-[#E5E1D8]" />

            {/* Inline Voice-Only Mic with Live Web Audio Waveform */}
            <div className="flex items-center gap-1.5 rounded-[6px] border border-[#E5E1D8] bg-white px-2 py-1">
              <button
                type="button"
                onClick={canvasVoice.toggleRecording}
                className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11.5px] font-medium transition-colors ${
                  canvasVoice.isRecording
                    ? 'bg-[#E03E2D] text-white'
                    : 'text-[#141413] hover:bg-[#F5F3EE]'
                }`}
                title="Speak an edit aloud while circling (uses gemini-3.5-transcribe)"
              >
                {canvasVoice.isRecording ? (
                  <>
                    <Square className="h-3 w-3 fill-current" />
                    <span className="font-mono text-[10.5px]">
                      REC 0:{String(canvasVoice.durationSec).padStart(2, '0')}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5 text-[#E03E2D]" />
                    <span>Voice</span>
                  </>
                )}
              </button>

              {(canvasVoice.isRecording || canvasVoice.isTranscribing) && (
                <div className="flex h-4 items-center gap-[2px] px-1">
                  {canvasVoice.isTranscribing ? (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-[#B45309]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      transcribing
                    </span>
                  ) : (
                    canvasVoice.levels.slice(0, 10).map((lvl, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${Math.round(lvl * 100)}%` }}
                        className="w-[2.5px] rounded-full bg-[#E03E2D] transition-[height] duration-75"
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* One-Click Circle & Speak -> Apply Now */}
            {drawnCircles.length > 0 && (
              <button
                type="button"
                disabled={isRunning}
                onClick={onApplyCircleSpeak}
                className="flex items-center gap-1.5 rounded-[6px] bg-[#E03E2D] px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#C53222] disabled:opacity-50"
                title="Run <10s surgical edit via gemini-4-hydrogen + Decisions API re-score"
              >
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>Circle &amp; Speak → Apply Now</span>
              </button>
            )}
          </div>

          {/* Right: Before/After Wipe Curtain + Viewport Switch + Reload */}
          <div className="flex items-center gap-1.5">
            {showHmrBadge && (
              <span className="inline-flex items-center gap-1 rounded border border-[#15803D]/30 bg-[#EEF8F1] px-2 py-0.5 font-mono text-[10px] font-medium text-[#15803D]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#15803D]" />
                HMR SYNCED
              </span>
            )}

            <button
              type="button"
              disabled={!canCompare}
              onClick={() => {
                setDrawMode(false);
                setCompareMode((v) => !v);
              }}
              className={`flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[11.5px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                compareMode
                  ? 'border-[#141413] bg-[#141413] text-white'
                  : 'border-[#E5E1D8] bg-white text-[#141413] hover:border-[#141413]'
              }`}
              title={
                canCompare
                  ? 'Drag split curtain between AI Slop baseline and live transformed app'
                  : 'Run a transform first to capture the AI Slop baseline screenshot'
              }
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>Before / After</span>
            </button>

            <div className="flex items-center rounded-[6px] border border-[#E5E1D8] bg-[#F5F3EE] p-0.5">
              <button
                type="button"
                onClick={() => setViewportMode('desktop')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
                  viewportMode === 'desktop'
                    ? 'bg-white text-[#141413] shadow-xs'
                    : 'text-[#64625D] hover:text-[#141413]'
                }`}
                title="Desktop preview (1440px)"
              >
                <Monitor className="h-3 w-3" />
                <span>1440</span>
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('mobile')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
                  viewportMode === 'mobile'
                    ? 'bg-white text-[#141413] shadow-xs'
                    : 'text-[#64625D] hover:text-[#141413]'
                }`}
                title="Mobile preview (390px)"
              >
                <Smartphone className="h-3 w-3" />
                <span>390</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setManualReload((n) => n + 1)}
              title="Force reload live preview iframe"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#E5E1D8] bg-white text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              title={`Open live target app (${previewUrl}) in new tab`}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[#E5E1D8] bg-white text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Non-blocking inline voice transcript ribbon when speaking / circles drawn */}
        {(drawMode || drawnCircles.length > 0) && (
          <div className="flex items-center justify-between gap-3 border-b border-[#E5E1D8] bg-[#FDF1EF] px-3.5 py-1.5 text-[11.5px]">
            <div className="flex min-w-0 items-center gap-2 text-[#141413]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#E03E2D]" />
              <span className="truncate">
                {drawMode
                  ? 'Freehand Ink Active — draw vermilion circles directly over any headline, card, or hero block, then speak what to change.'
                  : `${drawnCircles.length} target circle${
                      drawnCircles.length > 1 ? 's' : ''
                    } pinned on canvas.`}
                {voiceTranscript.trim() ? (
                  <span className="ml-2 font-mono text-[10.5px] text-[#64625D]">
                    &ldquo;{voiceTranscript.trim().slice(0, 96)}
                    {voiceTranscript.trim().length > 96 ? '…' : ''}&rdquo;
                  </span>
                ) : null}
              </span>
            </div>
            {drawMode && (
              <button
                type="button"
                onClick={() => setDrawMode(false)}
                className="shrink-0 font-mono text-[10.5px] font-medium text-[#E03E2D] underline"
              >
                Interact with page
              </button>
            )}
          </div>
        )}

        {/* Main Drafting Stage */}
        <div className="atelier-stage-grid relative flex flex-1 items-center justify-center overflow-hidden p-3">
          <div
            ref={stageRef}
            className={`relative flex h-full flex-col overflow-hidden rounded-[8px] border border-[#D8D2C5] bg-white shadow-[0_6px_28px_-14px_rgba(20,20,19,0.18)] transition-[width] duration-200 ${
              viewportMode === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
            }`}
          >
            {/* Slim tactile specimen chrome bar */}
            <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#E5E1D8] bg-[#FAF8F4] px-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#D8D2C5]" />
                <span className="h-2 w-2 rounded-full bg-[#D8D2C5]" />
                <span className="h-2 w-2 rounded-full bg-[#D8D2C5]" />
                <span className="ml-2 font-mono text-[10px] text-[#64625D]">
                  {previewUrl}
                </span>
              </div>
              <span className="font-mono text-[9.5px] uppercase tracking-wider text-[#64625D]">
                {viewportMode === 'desktop' ? '1440px · LIVE VITE HMR' : '390px · MOBILE'}
              </span>
            </div>

            {/* Live Viewport Container */}
            <div className="relative flex-1 overflow-hidden bg-white">
              {/* Live Target App Iframe */}
              <iframe
                key={`${previewUrl}-${reloadNonce}-${manualReload}`}
                src={iframeSrc}
                title="Live AntiSlop Target Website Preview"
                className="h-full w-full border-0 bg-white"
              />

              {/* Before / After Wipe Curtain Overlay */}
              {compareMode && resolvedBaseline && (
                <div className="absolute inset-0 z-20 overflow-hidden bg-white">
                  {/* Right (AFTER): either live screenshot or real iframe underneath */}
                  {resolvedFinal ? (
                    <img
                      src={resolvedFinal}
                      alt="After AntiSlop transformation"
                      className="h-full w-full object-cover object-top select-none"
                    />
                  ) : null}

                  {/* Left (BEFORE · AI SLOP): clipped by wipePercent */}
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

                  {/* Crisp vertical curtain rule + tactile handle */}
                  <div
                    style={{ left: `${wipePercent}%` }}
                    className="pointer-events-none absolute inset-y-0 z-10 w-[2px] -translate-x-1/2 bg-[#E03E2D]"
                  >
                    <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#E03E2D] bg-white text-[#141413] shadow-md">
                      <Columns2 className="h-4 w-4 text-[#E03E2D]" />
                    </div>
                  </div>

                  {/* Paper Specimen Badges */}
                  <div className="pointer-events-none absolute left-3 top-3 rounded border border-[#E5E1D8] bg-white/95 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#141413]">
                    Before · AI Slop Baseline
                  </div>
                  <div className="pointer-events-none absolute right-3 top-3 rounded border border-[#15803D]/30 bg-white/95 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#15803D]">
                    After · AntiSlop Live
                  </div>

                  {/* Native accessible range slider powering drag + Left/Right keyboard */}
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
                        title="Click to add optional text note for this circle"
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

              {/* Subtle non-blocking live progress pill while Gemini 4 runs */}
              {isRunning && (
                <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex items-center gap-2.5 rounded-lg border border-[#141413] bg-[#141413]/95 px-3 py-2 text-white shadow-lg">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E03E2D]" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#E03E2D]">
                        {liveModelTag || 'GEMINI 4 ENGINE'}
                      </span>
                    </div>
                    <p className="max-w-[340px] truncate text-[11.5px] text-[#F5F3EE]">
                      {liveStatusText || 'Executing multimodal design loop…'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }
);
