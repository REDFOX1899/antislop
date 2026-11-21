'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExecutionSpeedMode } from '@shared/types';
import {
  ArrowRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Globe,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
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
import { GeminiSparkleMark } from './BrandMarks';
import { NativeDialog } from './NativeDialog';
import type { StudioTab } from './TopBar';

const QUICK_SITE_REFS: Array<{ label: string; url: string }> = [
  { label: 'linear.app', url: 'https://linear.app' },
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
  activeTab?: StudioTab;
  onTabChange?: (tab: StudioTab) => void;
  onResetBaseline?: () => void;
  resettingBaseline?: boolean;
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
  activeTab = 'canvas',
  onTabChange,
  onResetBaseline,
  resettingBaseline = false,
}: TasteTrayProps) {
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

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
          `Snapped ${finalDomain}${secLabel} — screenshot + CSS DNA added.`
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
      <aside className="flex h-full w-full flex-col items-center justify-between bg-transparent py-2">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand References rail"
            aria-label="Expand References rail"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="h-px w-5 bg-[var(--border-subtle)]" />
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Snap live site URL"
            aria-label="Snap live site URL"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--cobalt-ice)]"
          >
            <Globe className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onToggleCollapse();
              setTimeout(() => mediaInputRef.current?.click(), 80);
            }}
            title={`Visual references (${assets.length})`}
            aria-label="Add visual references"
            className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--cobalt-ice)]"
          >
            <ImagePlus className="h-4 w-4" />
            {assets.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--cobalt-core)] px-1 font-mono text-[8.5px] font-semibold text-white">
                {assets.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setWebcamOpen(true)}
            title="Capture physical object via Webcam"
            aria-label="Capture via Webcam"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--cobalt-ice)]"
          >
            <Camera className="h-4 w-4" />
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
          aria-label="Transform Live App"
          className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition-all ${
            drawnCirclesCount > 0
              ? 'bg-[var(--vermilion)] hover:bg-[var(--vermilion-hover)]'
              : 'cobalt-cta'
          }`}
        >
          {isRunning ? (
            <Plus className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </button>
      </aside>
    );
  }

  return (
    <>
      {/* Pure Borderless Left Rail breathing directly on #000000 void (Code Wiki "On this page" serenity) */}
      <aside className="flex h-full w-full min-w-0 flex-col bg-transparent px-1">
        {/* Quiet 12px Muted Heading + Collapse Chevron */}
        <div className="flex h-8 shrink-0 items-center justify-between px-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[12px] font-medium tracking-[0.01em] text-[var(--ink-muted)]">
              References
            </span>
            {assets.length > 0 && (
              <span className="font-mono text-[10px] font-medium text-[var(--cobalt-ice)]">
                {assets.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {assets.length > 0 && (
              <button
                type="button"
                onClick={onClearAssets}
                title="Clear all references"
                aria-label="Clear all references"
                className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--vermilion)]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse References rail"
              aria-label="Collapse References rail"
              className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Calm Vertical Flow with Generous Spacing & Subtle Hairlines (ZERO Nested Boxes!) */}
        <div className="studio-scroll flex-1 space-y-5 overflow-y-auto px-1 py-3">
          {/* 1. LIVE SITE URL */}
          <section aria-label="Live Site URL" className="space-y-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCaptureSiteUrl(siteUrlInput);
              }}
              className="codewiki-pill flex h-[36px] items-center gap-1 rounded-full pl-3.5 pr-1"
            >
              <input
                type="text"
                value={siteUrlInput}
                onChange={(e) => {
                  setSiteUrlInput(e.target.value);
                  if (captureError) setCaptureError(null);
                }}
                placeholder="Paste site URL (linear.app)"
                disabled={Boolean(capturingUrl)}
                aria-label="Live reference website URL"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!siteUrlInput.trim() || Boolean(capturingUrl)}
                title="Snap live screenshot + CSS DNA"
                aria-label="Snap live reference URL"
                className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)] transition-colors hover:bg-[var(--cobalt-tint-strong)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {capturingUrl ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
              </button>
            </form>

            {/* Bare Minimal Inline Links (Zero Pill Boxes) */}
            <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--ink-muted)]">
              {QUICK_SITE_REFS.map((site, idx) => {
                const isBusy = capturingUrl === site.label;
                return (
                  <span key={site.label} className="inline-flex items-center gap-1.5">
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    <button
                      type="button"
                      disabled={Boolean(capturingUrl)}
                      onClick={() => {
                        setSiteUrlInput(site.label);
                        void handleCaptureSiteUrl(site.url);
                      }}
                      title={`Snap screenshot + CSS DNA from ${site.url}`}
                      className="inline-flex items-center gap-1 font-mono text-[10.5px] text-[var(--ink-secondary)] transition-colors hover:text-[var(--cobalt-ice)] disabled:opacity-45"
                    >
                      {isBusy && <Loader2 className="h-2.5 w-2.5 animate-spin text-[var(--cobalt-ice)]" />}
                      <span>{site.label}</span>
                    </button>
                  </span>
                );
              })}
            </div>

            {captureError && (
              <p className="px-1 text-[10.5px] leading-snug text-[var(--vermilion)]">
                {captureError}
              </p>
            )}
          </section>

          <div className="h-px bg-[var(--border-subtle)]" />

          {/* 2. VISUAL MEDIA */}
          <section aria-label="Visual media references" className="space-y-2.5">
            <input
              ref={mediaInputRef}
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

            {/* Single Calm Dashed Drop-Row + Inline Webcam Icon Button */}
            <div className="flex items-center gap-1.5">
              <div
                role="button"
                tabIndex={0}
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
                onClick={() => mediaInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    mediaInputRef.current?.click();
                  }
                }}
                className={`flex h-[38px] min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed px-2.5 text-left transition-colors ${
                  isDraggingMedia
                    ? 'border-[var(--cobalt-ice)] bg-[var(--cobalt-tint)] text-[var(--ink-primary)]'
                    : 'border-[var(--border-subtle)] bg-transparent text-[var(--ink-secondary)] hover:border-[var(--cobalt-border)] hover:text-[var(--ink-primary)]'
                }`}
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                <span className="truncate text-[11.5px]">
                  Drop screenshots / video
                </span>
              </div>

              <button
                type="button"
                onClick={() => setWebcamOpen(true)}
                title="Capture physical object via Webcam"
                aria-label="Open webcam capture"
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-transparent text-[var(--ink-secondary)] transition-colors hover:border-[var(--cobalt-border)] hover:bg-[var(--cobalt-tint)] hover:text-[var(--cobalt-ice)]"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Subtle Inline Quick-Taste Text Links (Swiss · Kyoto · Braun) */}
            <div className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--ink-muted)]">
              {QUICK_TASTE_STARTERS.map((starter, idx) => (
                <span key={starter.id} className="inline-flex items-center gap-1.5">
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <button
                    type="button"
                    onClick={() => handleStarterClick(starter)}
                    title={`${starter.title} — ${starter.subtitle}`}
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-secondary)] transition-colors hover:text-[var(--cobalt-ice)]"
                  >
                    <span
                      style={{ backgroundColor: starter.swatches[2] }}
                      className="h-1.5 w-1.5 shrink-0 rounded-full opacity-85"
                    />
                    <span>
                      {starter.id === 'swiss_atelier'
                        ? 'Swiss'
                        : starter.id === 'kyoto_ceramic'
                        ? 'Kyoto'
                        : 'Braun'}
                    </span>
                  </button>
                </span>
              ))}
            </div>

            {/* Thumbnail Filmstrip — Appears Cleanly ONLY When Assets Exist */}
            {imageAssets.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {imageAssets.map((img) => {
                  const tooltipText = img.extractedCssSummary
                    ? `${img.sourceDomain || img.label || 'Site'} — ${img.extractedCssSummary}`
                    : img.label || img.filename || 'Reference';

                  return (
                    <div
                      key={img.id}
                      title={tooltipText}
                      className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]"
                    >
                      <img
                        src={img.previewUrl}
                        alt={img.label || img.filename || 'Reference'}
                        className="h-full w-full object-cover object-top"
                      />

                      {img.sourceDomain ? (
                        <span className="absolute bottom-1 left-1 right-1 inline-flex max-w-[calc(100%-8px)] items-center gap-0.5 truncate rounded bg-black/80 px-1 py-0.5 font-mono text-[8px] text-[#F1F3F4]">
                          <Globe className="h-2 w-2 shrink-0 text-[#8AB4F8]" />
                          <span className="truncate">{img.sourceDomain}</span>
                        </span>
                      ) : (
                        <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[#F1F3F4]">
                          {img.modality === 'webcam_frame' ? 'CAM' : 'REF'}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveAsset(img.id);
                        }}
                        aria-label={`Remove ${img.sourceDomain || img.label || 'reference'}`}
                        className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white opacity-0 transition-opacity hover:bg-[var(--vermilion)] group-hover:opacity-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Attached Video Strip — Appears Cleanly ONLY When Videos Exist */}
            {videoAssets.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {videoAssets.map((vid) => (
                  <div
                    key={vid.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1"
                  >
                    <video
                      src={vid.previewUrl}
                      muted
                      playsInline
                      autoPlay
                      loop
                      className="h-7 w-10 shrink-0 rounded bg-black object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10.5px] font-medium text-[var(--ink-primary)]">
                        {vid.filename || vid.label}
                      </div>
                      <div className="font-mono text-[8.5px] text-[var(--ink-muted)]">
                        motion · {formatBytes(vid.sizeBytes)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAsset(vid.id)}
                      aria-label="Remove video"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--vermilion)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="h-px bg-[var(--border-subtle)]" />

          {/* 3. ACTION: Nano Banana Switch + Sculptural Google Cobalt ✦ Transform Pill */}
          <section aria-label="Transform action" className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[12px] text-[var(--ink-secondary)]">
                Nano Banana art
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={generateBespokeAssets}
                aria-label="Toggle Nano Banana 2.1 bespoke hero art"
                onClick={() => onToggleBespokeAssets(!generateBespokeAssets)}
                className={`relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors ${
                  generateBespokeAssets
                    ? 'bg-[var(--cobalt-core)]'
                    : 'bg-[var(--bg-subtle-hover)]'
                }`}
              >
                <span
                  className={`inline-block h-[14px] w-[14px] rounded-full bg-white transition-transform ${
                    generateBespokeAssets ? 'translate-x-[16px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>

            <button
              type="button"
              onClick={drawnCirclesCount > 0 ? onRunCircleTweak : onRunTransform}
              className={`flex h-[40px] w-full items-center justify-center gap-2 rounded-full px-4 text-[13px] font-medium text-white transition-all ${
                drawnCirclesCount > 0
                  ? 'bg-[var(--vermilion)] hover:bg-[var(--vermilion-hover)]'
                  : 'cobalt-cta'
              }`}
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
                    <span className="rounded-full bg-black/25 px-1.5 py-0.5 font-mono text-[10px]">
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
                  <GeminiSparkleMark className="h-3.5 w-3.5 brightness-200" />
                  <span>Transform</span>
                  <span className="font-mono text-[10.5px] opacity-80">
                    {speedMode === 'fast_demo' ? '~35s' : '4×'}
                  </span>
                </>
              )}
            </button>
          </section>
        </div>

        {/* 4. Calm Code-Wiki Footer pinned cleanly at bottom */}
        <footer className="shrink-0 space-y-2.5 border-t border-[var(--border-subtle)] px-2 pb-1.5 pt-3">
          <nav
            aria-label="Studio views and actions"
            className="flex flex-col items-start gap-1.5 text-[12px]"
          >
            {onTabChange && (
              <>
                <button
                  type="button"
                  onClick={() => onTabChange('arena')}
                  className={`transition-colors ${
                    activeTab === 'arena'
                      ? 'font-medium text-[var(--cobalt-ice)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  5-Sigma Proof
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange('managed_agent')}
                  className={`transition-colors ${
                    activeTab === 'managed_agent'
                      ? 'font-medium text-[var(--cobalt-ice)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  Managed Agent
                </button>
              </>
            )}
            {onResetBaseline && (
              <button
                type="button"
                disabled={resettingBaseline}
                onClick={onResetBaseline}
                className="text-[var(--ink-secondary)] transition-colors hover:text-[var(--cobalt-ice)] disabled:opacity-45"
              >
                {resettingBaseline ? 'Resetting…' : 'Reset Baseline'}
              </button>
            )}
          </nav>

          <p className="font-mono text-[10px] text-[var(--ink-muted)]">
            Gemini 4 · Decision-1
          </p>
        </footer>
      </aside>

      {/* Native <dialog> Live Webcam Viewfinder */}
      <NativeDialog
        open={webcamOpen}
        onClose={() => setWebcamOpen(false)}
        title="Capture Physical Reference"
        subtitle="Hold up a book jacket, magazine spread, ceramic mug, or swatch — Gemini 4 extracts its visual grammar."
        widthClass="w-[min(94vw,640px)]"
      >
        <div className="space-y-3">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-card)] bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${
                mirrorCamera ? '-scale-x-100' : ''
              }`}
            />
            <div className="pointer-events-none absolute inset-4 border border-white/20">
              <span className="absolute -left-px -top-px h-3 w-3 border-l-2 border-t-2 border-[var(--cobalt-ice)]" />
              <span className="absolute -right-px -top-px h-3 w-3 border-r-2 border-t-2 border-[var(--cobalt-ice)]" />
              <span className="absolute -bottom-px -left-px h-3 w-3 border-b-2 border-l-2 border-[var(--cobalt-ice)]" />
              <span className="absolute -bottom-px -right-px h-3 w-3 border-b-2 border-r-2 border-[var(--cobalt-ice)]" />
            </div>

            {!webcamReady && !webcamError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-white">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--cobalt-ice)]" />
                <span className="font-mono text-[11px]">
                  Initializing live camera viewfinder…
                </span>
              </div>
            )}

            {webcamError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/90 px-6 text-center text-white">
                <Camera className="h-6 w-6 text-[var(--vermilion)]" />
                <p className="text-[13px] font-medium">{webcamError}</p>
                <p className="text-[11px] text-white/70">
                  Check browser camera permissions or drop an image in References.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--ink-secondary)]">
              <input
                type="checkbox"
                checked={mirrorCamera}
                onChange={(e) => setMirrorCamera(e.target.checked)}
                className="accent-[var(--cobalt-core)]"
              />
              Mirror preview
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWebcamOpen(false)}
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--ink-primary)] hover:border-[var(--border-strong)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!webcamReady}
                onClick={snapPhysicalReference}
                className="cobalt-cta flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" />
                Snap Reference
              </button>
            </div>
          </div>
        </div>
      </NativeDialog>
    </>
  );
}
