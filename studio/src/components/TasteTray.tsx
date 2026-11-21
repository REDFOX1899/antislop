'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExecutionSpeedMode } from '@shared/types';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Film,
  ImagePlus,
  Loader2,
  Mic,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  QUICK_TASTE_STARTERS,
  buildQuickStarterVisualAsset,
  createAssetId,
  fileToLocalAsset,
  formatBytes,
  type LocalMediaAsset,
  type QuickTasteStarter,
} from '@/lib/media';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { NativeDialog } from './NativeDialog';

interface TasteTrayProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  assets: LocalMediaAsset[];
  onAddAssets: (newAssets: LocalMediaAsset[]) => void;
  onRemoveAsset: (id: string) => void;
  onClearAssets: () => void;
  voiceTranscript: string;
  onVoiceTranscriptChange: (val: string) => void;
  voiceAudioBase64?: string;
  onVoiceRecorded: (payload: {
    audioBase64: string;
    mimeType: string;
    transcript: string;
  }) => void;
  onClearVoiceAudio: () => void;
  generateBespokeAssets: boolean;
  onToggleBespokeAssets: (val: boolean) => void;
  speedMode: ExecutionSpeedMode;
  drawnCirclesCount: number;
  isRunning: boolean;
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
  voiceTranscript,
  onVoiceTranscriptChange,
  voiceAudioBase64,
  onVoiceRecorded,
  onClearVoiceAudio,
  generateBespokeAssets,
  onToggleBespokeAssets,
  speedMode,
  drawnCirclesCount,
  isRunning,
  onRunTransform,
  onRunCircleTweak,
}: TasteTrayProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
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

  const voice = useVoiceRecorder((out) => {
    onVoiceRecorded({
      audioBase64: out.audioBase64,
      mimeType: out.mimeType,
      transcript: out.transcript,
    });
  });

  const handleImageFiles = useCallback(
    async (files: FileList | File[]) => {
      const remaining = Math.max(0, 14 - imageAssets.length);
      if (remaining === 0) return;
      const list = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, remaining);
      if (list.length === 0) return;
      const parsed = await Promise.all(
        list.map((f) => fileToLocalAsset(f, 'moodboard_image'))
      );
      onAddAssets(parsed);
    },
    [imageAssets.length, onAddAssets]
  );

  const handleVideoFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
        .filter((f) => f.type.startsWith('video/'))
        .slice(0, 2);
      if (list.length === 0) return;
      const parsed = await Promise.all(
        list.map((f) => fileToLocalAsset(f, 'motion_video'))
      );
      onAddAssets(parsed);
    },
    [onAddAssets]
  );

  const handleStarterClick = (starter: QuickTasteStarter) => {
    const asset = buildQuickStarterVisualAsset(starter);
    onAddAssets([asset]);
    if (!voiceTranscript.trim()) {
      onVoiceTranscriptChange(starter.voiceHint);
    }
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
      <aside className="flex w-[46px] shrink-0 flex-col items-center justify-between border-r border-[#E5E1D8] bg-[#FFFFFF] py-3">
        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand Multimodal Taste Tray"
            aria-label="Expand Multimodal Taste Tray"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E1D8] bg-[#F5F3EE] text-[#141413] hover:border-[#141413]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="h-px w-6 bg-[#E5E1D8]" />
          <button
            type="button"
            onClick={() => {
              onToggleCollapse();
              setTimeout(() => imageInputRef.current?.click(), 80);
            }}
            title={`Moodboard images (${imageAssets.length}/14)`}
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#141413]"
          >
            <ImagePlus className="h-4 w-4" />
            {imageAssets.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#141413] px-1 font-mono text-[9px] text-white">
                {imageAssets.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setWebcamOpen(true)}
            title="Capture physical object via Webcam"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#141413]"
          >
            <Camera className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={voice.toggleRecording}
            title="Record Voice Art Direction"
            className={`flex h-8 w-8 items-center justify-center rounded-md ${
              voice.isRecording
                ? 'bg-[#E03E2D] text-white'
                : 'text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#141413]'
            }`}
          >
            <Mic className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          disabled={isRunning}
          onClick={drawnCirclesCount > 0 ? onRunCircleTweak : onRunTransform}
          title={
            drawnCirclesCount > 0
              ? 'Apply Circle & Voice Tweak'
              : 'Transform Live App'
          }
          className="flex h-9 w-9 items-center justify-center rounded-md bg-[#E03E2D] text-white transition-colors hover:bg-[#C53222] disabled:opacity-50"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside className="flex w-[292px] shrink-0 flex-col border-r border-[#E5E1D8] bg-[#FFFFFF]">
        {/* Tray Header */}
        <div className="flex items-center justify-between border-b border-[#E5E1D8] px-3.5 py-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64625D]">
                Taste Tray
              </span>
              <span className="rounded bg-[#F5F3EE] px-1.5 py-0.5 font-mono text-[10px] text-[#141413]">
                {assets.length} refs
              </span>
            </div>
            <p className="text-[11px] text-[#64625D]">
              Raw multimodal inputs · zero text-slop
            </p>
          </div>
          <div className="flex items-center gap-1">
            {assets.length > 0 && (
              <button
                type="button"
                onClick={onClearAssets}
                title="Clear all references"
                className="flex h-7 w-7 items-center justify-center rounded text-[#64625D] hover:bg-[#F5F3EE] hover:text-[#E03E2D]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse Taste Tray for larger canvas"
              aria-label="Collapse Taste Tray"
              className="flex h-7 w-7 items-center justify-center rounded border border-[#E5E1D8] bg-[#FAF8F4] text-[#64625D] hover:border-[#141413] hover:text-[#141413]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Multimodal Inputs */}
        <div className="studio-scroll flex-1 space-y-4 overflow-y-auto px-3.5 py-3">
          {/* 1. Moodboard Dropzone (1-14 images) */}
          <section aria-label="Moodboard references">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#141413]">
                1. Moodboard & Print
              </span>
              <span className="font-mono text-[10px] text-[#64625D]">
                {imageAssets.length}/14 imgs
              </span>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingImages(true);
              }}
              onDragLeave={() => setIsDraggingImages(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingImages(false);
                if (e.dataTransfer.files?.length) {
                  void handleImageFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => imageInputRef.current?.click()}
              className={`group cursor-pointer rounded-lg border border-dashed px-3 py-3 text-center transition-all ${
                isDraggingImages
                  ? 'border-[#E03E2D] bg-[#FDF1EF]'
                  : 'border-[#CFC9BC] bg-[#FAF8F4] hover:border-[#141413] hover:bg-[#F5F3EE]'
              }`}
            >
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void handleImageFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
              <Upload className="mx-auto mb-1 h-4 w-4 text-[#64625D] group-hover:text-[#141413]" />
              <p className="text-[11.5px] font-medium text-[#141413]">
                Drop ANY live image or screenshot
              </p>
              <p className="mt-0.5 text-[10.5px] text-[#64625D]">
                Pinterest, Dribbble, book covers, print scans
              </p>
            </div>

            {/* Thumbnail Filmstrip */}
            {imageAssets.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {imageAssets.map((img) => (
                  <div
                    key={img.id}
                    className="group relative aspect-[4/3] overflow-hidden rounded-md border border-[#E5E1D8] bg-[#F5F3EE]"
                  >
                    <img
                      src={img.previewUrl}
                      alt={img.label || img.filename || 'Reference'}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-1 left-1 rounded bg-[#141413]/80 px-1 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-white">
                      {img.modality === 'webcam_frame' ? 'CAM' : 'REF'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveAsset(img.id);
                      }}
                      aria-label={`Remove ${img.label || 'reference'}`}
                      className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#141413]/85 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 3 Optional Quick Taste Starters */}
            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-[#64625D]">
                  Optional Quick-Starts
                </span>
                <span className="text-[9.5px] text-[#64625D]">
                  or drop live / webcam
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {QUICK_TASTE_STARTERS.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => handleStarterClick(starter)}
                    className="flex items-center justify-between rounded-md border border-[#E5E1D8] bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#141413] hover:bg-[#FAF8F4]"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-[11px] font-medium text-[#141413]">
                        {starter.title}
                      </div>
                      <div className="truncate text-[10px] text-[#64625D]">
                        {starter.subtitle}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {starter.swatches.map((hex) => (
                        <span
                          key={hex}
                          style={{ backgroundColor: hex }}
                          className="h-3.5 w-3.5 rounded-[3px] border border-[#141413]/15"
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="h-px bg-[#E5E1D8]" />

          {/* 2. Live Webcam Capture (Physical World Reference) */}
          <section aria-label="Live webcam reference capture">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#141413]">
                2. Physical Object (Webcam)
              </span>
              <span className="font-mono text-[9.5px] text-[#64625D]">
                LIVE CAM
              </span>
            </div>
            <button
              type="button"
              onClick={() => setWebcamOpen(true)}
              className="flex w-full items-center justify-between rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] px-3 py-2 text-left transition-colors hover:border-[#141413] hover:bg-[#F5F3EE]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E5E1D8] bg-white text-[#141413]">
                  <Camera className="h-3.5 w-3.5 text-[#E03E2D]" />
                </span>
                <div>
                  <div className="text-[11.5px] font-medium text-[#141413]">
                    Open Live Viewfinder
                  </div>
                  <div className="text-[10px] text-[#64625D]">
                    Hold up a book, magazine, cup, or print
                  </div>
                </div>
              </div>
              <span className="font-mono text-[10px] text-[#141413]">SNAP</span>
            </button>
          </section>

          <div className="h-px bg-[#E5E1D8]" />

          {/* 3. Motion / Interaction Video */}
          <section aria-label="Motion video reference">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#141413]">
                3. Motion / Hover Video
              </span>
              <span className="font-mono text-[9.5px] text-[#64625D]">
                MP4 · WEBM
              </span>
            </div>

            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-[#CFC9BC] bg-[#FAF8F4] px-3 py-2 text-left transition-colors hover:border-[#141413] hover:bg-[#F5F3EE]"
            >
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void handleVideoFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
              <Film className="h-4 w-4 shrink-0 text-[#64625D]" />
              <div className="min-w-0">
                <div className="text-[11.5px] font-medium text-[#141413]">
                  Attach interaction clip
                </div>
                <div className="truncate text-[10px] text-[#64625D]">
                  Easing curves, hover physics, cadence
                </div>
              </div>
            </button>

            {videoAssets.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {videoAssets.map((vid) => (
                  <div
                    key={vid.id}
                    className="flex items-center gap-2 rounded-md border border-[#E5E1D8] bg-[#FAF8F4] p-1.5"
                  >
                    <video
                      src={vid.previewUrl}
                      muted
                      playsInline
                      autoPlay
                      loop
                      className="h-11 w-16 shrink-0 rounded border border-[#E5E1D8] bg-[#141413] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-[#141413]">
                        {vid.filename || vid.label}
                      </div>
                      <div className="font-mono text-[9.5px] text-[#64625D]">
                        motion_video · {formatBytes(vid.sizeBytes)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveAsset(vid.id)}
                      aria-label="Remove video"
                      className="flex h-6 w-6 items-center justify-center rounded text-[#64625D] hover:bg-white hover:text-[#E03E2D]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="h-px bg-[#E5E1D8]" />

          {/* 4. Voice Art Direction Bar */}
          <section aria-label="Voice art direction">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#141413]">
                4. Voice Art Direction
              </span>
              <span className="font-mono text-[9.5px] text-[#64625D]">
                3.5-TRANSCRIBE
              </span>
            </div>

            <div className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] p-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={voice.toggleRecording}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11.5px] font-medium transition-colors ${
                    voice.isRecording
                      ? 'bg-[#E03E2D] text-white'
                      : 'border border-[#E5E1D8] bg-white text-[#141413] hover:border-[#141413]'
                  }`}
                >
                  {voice.isRecording ? (
                    <>
                      <Square className="h-3 w-3 fill-current" />
                      <span className="font-mono text-[11px]">
                        0:{String(voice.durationSec).padStart(2, '0')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5 text-[#E03E2D]" />
                      <span>Speak</span>
                    </>
                  )}
                </button>

                {/* Live Web Audio Waveform Bars */}
                <div
                  aria-hidden="true"
                  className="flex h-7 flex-1 items-center justify-between gap-[2px] rounded border border-[#E5E1D8] bg-white px-2"
                >
                  {voice.levels.map((lvl, idx) => (
                    <span
                      key={idx}
                      style={{
                        height: `${Math.round(lvl * 100)}%`,
                      }}
                      className={`w-[3px] rounded-full transition-[height] duration-75 ${
                        voice.isRecording
                          ? 'bg-[#E03E2D]'
                          : voiceAudioBase64
                          ? 'bg-[#15803D]'
                          : 'bg-[#D6D1C6]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {voice.isTranscribing && (
                <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-[#B45309]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Transcribing via gemini-3.5-transcribe…
                </div>
              )}

              {voice.error && (
                <p className="mt-1.5 text-[10.5px] text-[#E03E2D]">
                  {voice.error}
                </p>
              )}

              {voiceAudioBase64 && !voice.isRecording && (
                <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[#15803D]">
                  <span>Raw voice clip attached</span>
                  <button
                    type="button"
                    onClick={onClearVoiceAudio}
                    className="text-[#64625D] underline hover:text-[#E03E2D]"
                  >
                    clear clip
                  </button>
                </div>
              )}

              <textarea
                value={voiceTranscript}
                onChange={(e) => onVoiceTranscriptChange(e.target.value)}
                rows={2}
                placeholder="Zero keyboard needed — speak above, or fine-tune transcript here…"
                className="mt-2 w-full resize-none rounded border border-[#E5E1D8] bg-white px-2 py-1.5 text-[11.5px] leading-snug text-[#141413] placeholder:text-[#96928A] focus:border-[#141413] focus:outline-none"
              />
            </div>
          </section>
        </div>

        {/* Sticky Bottom Options & Primary Action */}
        <div className="border-t border-[#E5E1D8] bg-[#FAF8F4] px-3.5 py-3">
          <label className="mb-2.5 flex cursor-pointer items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#141413]">
                Generate Bespoke Hero Art
              </div>
              <div className="font-mono text-[9.5px] text-[#64625D]">
                gemini-nano-banana-2.1 ·{' '}
                {speedMode === 'fast_demo' ? 'fast default: OFF' : 'atelier default: ON'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={generateBespokeAssets}
              onChange={(e) => onToggleBespokeAssets(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[#E03E2D]"
            />
          </label>

          <button
            type="button"
            disabled={isRunning}
            onClick={drawnCirclesCount > 0 ? onRunCircleTweak : onRunTransform}
            className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-[#E03E2D] px-3.5 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#C53222] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Transforming Live App…</span>
              </>
            ) : drawnCirclesCount > 0 ? (
              <>
                <Sparkles className="h-4 w-4" />
                <span>
                  Apply Circle &amp; Voice Tweak ({drawnCirclesCount})
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Transform Live App</span>
                <span className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px]">
                  {speedMode === 'fast_demo' ? '<25s' : '4× Race'}
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
                  Check browser camera permissions or upload a photo in the Taste Tray.
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
