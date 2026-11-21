'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExecutionSpeedMode } from '@shared/types';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Film,
  Globe,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { captureReferenceUrl, resolveBackendUrl } from '@/lib/api';
import {
  QUICK_TASTE_STARTERS,
  buildQuickStarterVisualAsset,
  createAssetId,
  extractDomainFromUrl,
  fileToLocalAsset,
  formatBytes,
  type LocalMediaAsset,
  type QuickTasteStarter,
} from '@/lib/media';
import { NativeDialog } from './NativeDialog';

const QUICK_SITE_REFS: Array<{ label: string; url: string }> = [
  { label: 'connorhyatt.com', url: 'https://www.connorhyatt.com' },
  { label: 'are.na', url: 'https://www.are.na' },
];

interface TasteTrayProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  assets: LocalMediaAsset[];
  onAddAssets: (newAssets: LocalMediaAsset[]) => void;
  onRemoveAsset: (id: string) => void;
  onClearAssets: () => void;
  onSeedVoiceHint?: (hint: string) => void;
  onNotify?: (tone: 'info' | 'success' | 'error', message: string) => void;
  generateBespokeAssets: boolean;
  onToggleBespokeAssets: (val: boolean) => void;
  speedMode: ExecutionSpeedMode;
  drawnCirclesCount: number;
  isRunning: boolean;
  queueCount: number;
  onRunTransform: () => void;
  onRunCircleTweak: () => void;
}

export function TasteTray({
  collapsed,
  onToggleCollapse,
  assets,
  onAddAssets,
  onRemoveAsset,
  onClearAssets,
  onSeedVoiceHint,
  onNotify,
  generateBespokeAssets,
  onToggleBespokeAssets,
  speedMode,
  drawnCirclesCount,
  isRunning,
  queueCount,
  onRunTransform,
  onRunCircleTweak,
}: TasteTrayProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const [siteUrlInput, setSiteUrlInput] = useState('');
  const [capturingUrl, setCapturingUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [webcamReady, setWebcamReady] = useState(false);
  const [mirrorCamera, setMirrorCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const imageAssets = assets.filter(
    (a) => a.modality === 'moodboard_image' || a.modality === 'webcam_frame'
  );
  const videoAssets = assets.filter((a) => a.modality === 'motion_video');

  const handleCaptureSiteUrl = useCallback(
    async (rawInput: string) => {
      const trimmed = rawInput.trim();
      if (!trimmed || capturingUrl) return;

      const normalizedUrl = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      const domain = extractDomainFromUrl(normalizedUrl);

      setCaptureError(null);
      setCapturingUrl(domain);

      try {
        const res = await captureReferenceUrl(normalizedUrl);
        const finalUrl = res.url || normalizedUrl;
        const finalDomain = extractDomainFromUrl(finalUrl);
        const mimeType = res.asset?.mimeType || 'image/png';
        const previewUrl = res.asset?.dataBase64
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
          previewUrl,
          sourceUrl: finalUrl,
          sourceDomain: finalDomain,
          extractedCssSummary: cssSummary,
        };

        onAddAssets([capturedAsset]);
        setSiteUrlInput('');
        const secLabel =
          typeof res.latencyMs === 'number'
            ? ` (${(res.latencyMs / 1000).toFixed(1)}s)`
            : '';
        onNotify?.(
          'success',
          `Snapped ${finalDomain}${secLabel} — screenshot + CSS DNA added to moodboard.`
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : `Could not capture ${domain}`;
        setCaptureError(msg);
        onNotify?.('error', msg);
      } finally {
        setCapturingUrl(null);
      }
    },
    [capturingUrl, onAddAssets, onNotify]
  );

  const handleMediaFiles = useCallback(
    async (files: FileList | File[]) => {
      const all = Array.from(files);
      const images = all
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, Math.max(0, 14 - imageAssets.length));
      const videos = all
        .filter((f) => f.type.startsWith('video/'))
        .slice(0, Math.max(0, 2 - videoAssets.length));

      const nextAssets: LocalMediaAsset[] = [];
      if (images.length > 0) {
        const parsedImages = await Promise.all(
          images.map((f) => fileToLocalAsset(f, 'moodboard_image'))
        );
        nextAssets.push(...parsedImages);
      }
      if (videos.length > 0) {
        const parsedVideos = await Promise.all(
          videos.map((f) => fileToLocalAsset(f, 'motion_video'))
        );
        nextAssets.push(...parsedVideos);
      }
      if (nextAssets.length > 0) {
        onAddAssets(nextAssets);
      }
    },
    [imageAssets.length, onAddAssets, videoAssets.length]
  );

  const handleStarterClick = (starter: QuickTasteStarter) => {
    const asset = buildQuickStarterVisualAsset(starter);
    onAddAssets([asset]);
    onSeedVoiceHint?.(starter.voiceHint);
  };

  // Manage live webcam stream whenever viewfinder dialog opens/closes
  useEffect(() => {
    if (!webcamOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setWebcamReady(false);
      setWebcamError(null);
      return;
    }

    let cancelled = false;
    const startCamera = async () => {
      setWebcamError(null);
      setWebcamReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setWebcamError('Webcam capture is unavailable in this browser context.');
        return;
      }
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setWebcamReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setWebcamError(
            err instanceof Error
              ? err.message
              : 'Camera permission was denied or no camera was detected.'
          );
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [webcamOpen]);

  const snapPhysicalReference = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (mirrorCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const stamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    onAddAssets([
      {
        id: createAssetId('webcam'),
        modality: 'webcam_frame',
        mimeType: 'image/jpeg',
        dataBase64,
        filename: `webcam-ref-${Date.now()}.jpg`,
        label: `Physical Object · ${stamp}`,
        previewUrl: dataUrl,
      },
    ]);
    setWebcamOpen(false);
  };

  if (collapsed) {
    return (
      <aside className="flex h-full w-full flex-col items-center justify-between border-r border-[#E5E1D8] bg-[#FFFFFF] py-2.5">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand Reference Rail"
            aria-label="Expand Reference Rail"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E5E1D8] bg-[#F5F3EE] text-[#141413] hover:border-[#141413]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="h-px w-5 bg-[#E5E1D8]" />
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Capture Live Reference URL"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#141413]"
          >
            <Globe className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              onToggleCollapse();
              setTimeout(() => imageInputRef.current?.click(), 80);
            }}
            title={`Moodboard references (${imageAssets.length}/14)`}
            className="relative flex h-7 w-7 items-center justify-center rounded-md text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#141413]"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {assets.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#141413] px-1 font-mono text-[8.5px] text-white">
                {assets.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setWebcamOpen(true)}
            title="Capture physical object via Webcam"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#141413]"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={drawnCirclesCount > 0 ? onRunCircleTweak : onRunTransform}
          title={
            isRunning
              ? 'Queue Next Transform'
              : drawnCirclesCount > 0
              ? 'Apply Circle Tweak'
              : 'Transform Live App'
          }
          className="flex h-8 w-8 items-center justify-center rounded-md bg-[#E03E2D] text-white transition-colors hover:bg-[#C53222]"
        >
          {isRunning ? (
            <Plus className="h-4 w-4" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside className="flex h-full w-full min-w-0 flex-col border-r border-[#E5E1D8] bg-[#FFFFFF]">
        {/* Minimal Rail Header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#E5E1D8] px-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#141413]">
              References
            </span>
            <span className="rounded bg-[#F5F3EE] px-1.5 py-0.5 font-mono text-[9px] text-[#64625D]">
              {assets.length}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            {assets.length > 0 && (
              <button
                type="button"
                onClick={onClearAssets}
                title="Clear all references"
                aria-label="Clear all references"
                className="flex h-6 w-6 items-center justify-center rounded text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#E03E2D]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse Reference Rail (expand canvas)"
              aria-label="Collapse Reference Rail"
              className="flex h-6 w-6 items-center justify-center rounded border border-[#E5E1D8] bg-[#FAF8F4] text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Compact Atelier Inputs */}
        <div className="studio-scroll flex-1 space-y-3 overflow-y-auto px-2.5 py-2.5">
          {/* 1. LIVE SITE REFERENCE URL CAPTURE */}
          <section aria-label="Live Site Reference">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64625D]">
                <Globe className="h-2.5 w-2.5 text-[#E03E2D]" />
                Live Site Reference
              </span>
              {capturingUrl && (
                <span className="font-mono text-[8.5px] text-[#E03E2D]">
                  snapping…
                </span>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCaptureSiteUrl(siteUrlInput);
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                value={siteUrlInput}
                onChange={(e) => {
                  setSiteUrlInput(e.target.value);
                  if (captureError) setCaptureError(null);
                }}
                placeholder="Paste URL (stripe.com)"
                disabled={Boolean(capturingUrl)}
                aria-label="Live reference website URL"
                className="h-7 min-w-0 flex-1 rounded-[5px] border border-[#E5E1D8] bg-[#FAF8F4] px-2 text-[11px] text-[#141413] placeholder:text-[#96928A] focus:border-[#141413] focus:bg-white focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!siteUrlInput.trim() || Boolean(capturingUrl)}
                className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-[5px] bg-[#141413] px-2 font-mono text-[10px] font-medium text-white transition-colors hover:bg-[#E03E2D] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {capturingUrl ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span>Snap</span>
                )}
              </button>
            </form>

            {/* 1-Click Quick Reference Chips */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {QUICK_SITE_REFS.map((site) => {
                const isBusy = capturingUrl === site.label;
                return (
                  <button
                    key={site.label}
                    type="button"
                    disabled={Boolean(capturingUrl)}
                    onClick={() => {
                      setSiteUrlInput(site.label);
                      void handleCaptureSiteUrl(site.url);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-[#E5E1D8] bg-[#FAF8F4] px-1.5 py-0.5 font-mono text-[9.5px] text-[#141413] transition-colors hover:border-[#141413] hover:bg-white disabled:opacity-50"
                    title={`Capture live screenshot + CSS DNA from ${site.url}`}
                  >
                    {isBusy ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-[#E03E2D]" />
                    ) : (
                      <Globe className="h-2.5 w-2.5 text-[#64625D]" />
                    )}
                    <span>{site.label}</span>
                  </button>
                );
              })}
            </div>

            {captureError && (
              <p className="mt-1 text-[10px] leading-snug text-[#E03E2D]">
                {captureError}
              </p>
            )}
          </section>

          <div className="h-px bg-[#E5E1D8]" />

          {/* 2. MOODBOARD STRIP + COMPACT IMAGE/VIDEO DROPZONE */}
          <section aria-label="Moodboard references">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64625D]">
                Moodboard &amp; Motion
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="inline-flex items-center gap-0.5 font-mono text-[9px] text-[#64625D] hover:text-[#141413]"
                  title="Attach motion/hover video (MP4/WebM)"
                >
                  <Film className="h-2.5 w-2.5" />
                  <span>+Vid</span>
                </button>
                <span className="font-mono text-[9px] text-[#64625D]">
                  {imageAssets.length}/14
                </span>
              </div>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void handleMediaFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void handleMediaFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            {/* Thumbnail Strip (live URL captures + uploads + webcam) */}
            {imageAssets.length > 0 && (
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {imageAssets.map((img) => {
                  const tooltipText = img.extractedCssSummary
                    ? `${img.sourceDomain || img.label || 'Site'} — ${img.extractedCssSummary}`
                    : img.label || img.filename || 'Moodboard reference';

                  return (
                    <div
                      key={img.id}
                      title={tooltipText}
                      className="group relative aspect-[4/3] overflow-hidden rounded-[5px] border border-[#E5E1D8] bg-[#F5F3EE]"
                    >
                      <img
                        src={img.previewUrl}
                        alt={img.label || img.filename || 'Reference'}
                        className="h-full w-full object-cover object-top"
                      />

                      {/* Domain / Modality Micro-Badge */}
                      {img.sourceDomain ? (
                        <span className="absolute bottom-1 left-1 right-1 inline-flex max-w-[calc(100%-8px)] items-center gap-0.5 truncate rounded bg-[#141413]/88 px-1 py-0.5 font-mono text-[8px] font-medium text-white">
                          <span aria-hidden="true">🌐</span>
                          <span className="truncate">{img.sourceDomain}</span>
                        </span>
                      ) : (
                        <span className="absolute bottom-1 left-1 rounded bg-[#141413]/80 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-white">
                          {img.modality === 'webcam_frame' ? 'CAM' : 'REF'}
                        </span>
                      )}

                      {/* Extracted CSS DNA hover bar for captured sites */}
                      {img.extractedCssSummary && (
                        <div className="pointer-events-none absolute inset-x-0 top-0 bg-[#141413]/90 px-1.5 py-1 text-[8.5px] leading-tight text-[#F5F3EE] opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="line-clamp-2 font-mono">
                            {img.extractedCssSummary}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveAsset(img.id);
                        }}
                        aria-label={`Remove ${img.sourceDomain || img.label || 'reference'}`}
                        className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#141413]/85 text-white opacity-0 transition-opacity hover:bg-[#E03E2D] group-hover:opacity-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ultra-Compact Unified Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingMedia(true);
              }}
              onDragLeave={() => setIsDraggingMedia(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingMedia(false);
                if (e.dataTransfer.files?.length) {
                  void handleMediaFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => imageInputRef.current?.click()}
              className={`group cursor-pointer rounded-[6px] border border-dashed px-2.5 py-2.5 text-center transition-colors ${
                isDraggingMedia
                  ? 'border-[#E03E2D] bg-[#FDF1EF]'
                  : 'border-[#CFC9BC] bg-[#FAF8F4] hover:border-[#141413] hover:bg-[#F5F3EE]'
              }`}
            >
              <Upload className="mx-auto mb-1 h-3.5 w-3.5 text-[#64625D] group-hover:text-[#141413]" />
              <p className="text-[10.5px] font-medium text-[#141413]">
                Drop images or motion video
              </p>
              <p className="font-mono text-[9px] text-[#64625D]">
                PNG · JPG · MP4 · WEBM
              </p>
            </div>

            {/* Compact Attached Video Chips */}
            {videoAssets.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {videoAssets.map((vid) => (
                  <div
                    key={vid.id}
                    className="flex items-center gap-1.5 rounded-[5px] border border-[#E5E1D8] bg-[#FAF8F4] p-1"
                  >
                    <video
                      src={vid.previewUrl}
                      muted
                      playsInline
                      autoPlay
                      loop
                      className="h-7 w-10 shrink-0 rounded border border-[#E5E1D8] bg-[#141413] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-medium text-[#141413]">
                        {vid.filename || vid.label}
                      </div>
                      <div className="font-mono text-[8.5px] text-[#64625D]">
                        motion · {formatBytes(vid.sizeBytes)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAsset(vid.id)}
                      aria-label="Remove video"
                      className="flex h-5 w-5 items-center justify-center rounded text-[#64625D] hover:text-[#E03E2D]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Minimal 1-Row Quick Swatch Starters */}
            <div className="mt-2 flex items-center gap-1">
              {QUICK_TASTE_STARTERS.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  onClick={() => handleStarterClick(starter)}
                  title={`${starter.title} — ${starter.subtitle}`}
                  className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded border border-[#E5E1D8] bg-white px-1.5 py-1 text-[9.5px] font-medium text-[#141413] transition-colors hover:border-[#141413] hover:bg-[#FAF8F4]"
                >
                  <span
                    style={{ backgroundColor: starter.swatches[2] }}
                    className="h-2 w-2 shrink-0 rounded-full border border-[#141413]/20"
                  />
                  <span className="truncate">
                    {starter.id === 'swiss_atelier'
                      ? 'Swiss'
                      : starter.id === 'kyoto_ceramic'
                      ? 'Kyoto'
                      : 'Braun'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <div className="h-px bg-[#E5E1D8]" />

          {/* 3. COMPACT WEBCAM SHUTTER BUTTON */}
          <section aria-label="Live webcam reference capture">
            <button
              type="button"
              onClick={() => setWebcamOpen(true)}
              className="flex w-full items-center justify-between rounded-[6px] border border-[#E5E1D8] bg-[#FAF8F4] px-2.5 py-2 text-left transition-colors hover:border-[#141413] hover:bg-[#F5F3EE]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#E5E1D8] bg-white text-[#E03E2D]">
                  <Camera className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-[#141413]">
                    Webcam Object
                  </div>
                  <div className="truncate text-[9.5px] text-[#64625D]">
                    Book, print, mug
                  </div>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[9.5px] font-semibold text-[#141413]">
                SNAP
              </span>
            </button>
          </section>
        </div>

        {/* Sticky Minimal Bottom Bar: Nano Banana 2.1 Toggle + Transform CTA */}
        <div className="shrink-0 border-t border-[#E5E1D8] bg-[#FAF8F4] px-2.5 py-2.5">
          <label className="mb-2 flex cursor-pointer items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[10.5px] font-medium text-[#141413]">
                Nano Banana 2.1 Art
              </div>
              <div className="truncate font-mono text-[8.5px] text-[#64625D]">
                {generateBespokeAssets ? 'Bespoke hero ON' : 'Hero art OFF'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={generateBespokeAssets}
              onChange={(e) => onToggleBespokeAssets(e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[#E03E2D]"
            />
          </label>

          <button
            type="button"
            onClick={drawnCirclesCount > 0 ? onRunCircleTweak : onRunTransform}
            className="flex w-full items-center justify-center gap-1.5 rounded-[6px] bg-[#E03E2D] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#C53222]"
          >
            {isRunning ? (
              <>
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {drawnCirclesCount > 0
                    ? `Queue Circle (${drawnCirclesCount})`
                    : 'Queue Transform'}
                </span>
                {queueCount > 0 && (
                  <span className="rounded bg-black/20 px-1 py-0.5 font-mono text-[9.5px]">
                    +{queueCount}
                  </span>
                )}
              </>
            ) : drawnCirclesCount > 0 ? (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Apply Circle ({drawnCirclesCount})</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>Transform</span>
                <span className="rounded bg-black/20 px-1 py-0.5 font-mono text-[9.5px]">
                  {speedMode === 'fast_demo' ? '<25s' : '4×'}
                </span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Native <dialog> Live Webcam Viewfinder */}
      <NativeDialog
        open={webcamOpen}
        onClose={() => setWebcamOpen(false)}
        title="Capture Physical Reference"
        subtitle="Hold up a magazine, book jacket, ceramic mug, print poster, or fabric swatch — Gemini 4 extracts its real visual grammar."
        widthClass="w-[min(94vw,640px)]"
      >
        <div className="space-y-3">
          <div className="relative aspect-video overflow-hidden rounded-lg border border-[#E5E1D8] bg-[#141413]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${
                mirrorCamera ? '-scale-x-100' : ''
              }`}
            />

            {/* Subtle atelier registration frame */}
            <div className="pointer-events-none absolute inset-4 border border-white/25">
              <span className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-[#E03E2D]" />
              <span className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-[#E03E2D]" />
              <span className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-[#E03E2D]" />
              <span className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-[#E03E2D]" />
            </div>

            {!webcamReady && !webcamError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#141413]/80 text-white">
                <Loader2 className="h-5 w-5 animate-spin text-[#E03E2D]" />
                <span className="font-mono text-[11px]">
                  Initializing live camera viewfinder…
                </span>
              </div>
            )}

            {webcamError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#141413]/90 px-6 text-center text-white">
                <Camera className="h-6 w-6 text-[#E03E2D]" />
                <p className="text-[13px] font-medium">{webcamError}</p>
                <p className="text-[11px] text-white/70">
                  Check browser camera permissions or upload a photo in the References rail.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#64625D]">
              <input
                type="checkbox"
                checked={mirrorCamera}
                onChange={(e) => setMirrorCamera(e.target.checked)}
                className="accent-[#141413]"
              />
              Mirror preview
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWebcamOpen(false)}
                className="rounded-md border border-[#E5E1D8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#141413] hover:border-[#141413]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!webcamReady}
                onClick={snapPhysicalReference}
                className="flex items-center gap-1.5 rounded-md bg-[#E03E2D] px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#C53222] disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" />
                Snap Physical Reference
              </button>
            </div>
          </div>
        </div>
      </NativeDialog>
    </>
  );
}
