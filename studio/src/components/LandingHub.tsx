'use client';

import { useEffect, useRef, useState } from 'react';
import type { WorkspaceRepoInfo } from '@shared/types';
import {
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  FolderGit2,
  Loader2,
  Moon,
  Sun,
} from 'lucide-react';
import type { StudioTheme } from '@/lib/useTheme';
import { AntiSlopPrismMark, GeminiSparkleMark } from './BrandMarks';

export interface LandingHubProps {
  theme: StudioTheme;
  onToggleTheme: () => void;
  workspaces: WorkspaceRepoInfo[];
  backendHealthy: boolean;
  isSubmittingCommand: boolean;
  commandStatusText?: string | null;
  onOpenStudio: () => void;
  onOpenArena: () => void;
  onOpenRepoModal: () => void;
  onSelectStarterWorkspace: (workspaceId: string) => void;
  onSubmitCommand: (rawInput: string) => Promise<void>;
}

type HalftoneMotif = 'butterfly' | 'fish';

interface FeaturedStarter {
  id: string;
  label: string;
  tag: string;
  matchTokens: string[];
}

const FEATURED_STARTERS: FeaturedStarter[] = [
  {
    id: 'novaflow-slop',
    label: 'NovaFlow AI',
    tag: 'SaaS',
    matchTokens: ['novaflow', 'target-repo'],
  },
  {
    id: 'shopcraft-store',
    label: 'Kova Goods',
    tag: 'Store',
    matchTokens: ['shopcraft', 'kova'],
  },
  {
    id: 'dev-portfolio',
    label: 'Dev Portfolio',
    tag: 'Portfolio',
    matchTokens: ['portfolio'],
  },
];

function resolveStarterWorkspaceId(
  spec: FeaturedStarter,
  workspaces: WorkspaceRepoInfo[]
): string {
  const found = workspaces.find((w) => {
    const hay = `${w.id} ${w.name}`.toLowerCase();
    return spec.matchTokens.some((tok) => hay.includes(tok));
  });
  return found?.id || spec.id;
}

/**
 * Luminance-sampled Path2D diamond-halftone canvas shader mirrored from
 * `REDFOX1899/personal-website` — renders butterfly / koi video in Google Cobalt & Ink.
 */
function HalftoneArtworkCanvas({
  motif,
  isDark,
}: {
  motif: HalftoneMotif;
  isDark: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!container || !canvas || !video) return;

    const context = canvas.getContext('2d');
    const sample = document.createElement('canvas');
    const pixels = sample.getContext('2d', { willReadFrequently: true });
    if (!context || !pixels) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let frameId = 0;
    let lastDraw = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      if (!container || !canvas) return;
      width = container.clientWidth;
      height = container.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const targetSrc =
      motif === 'butterfly' ? '/artwork/butterfly.mp4' : '/artwork/fish3.mp4';
    if (video.getAttribute('src') !== targetSrc) {
      video.src = targetSrc;
      video.load();
    }
    video.loop = true;
    video.muted = true;

    const draw = () => {
      if (disposed || !width || !height || video.readyState < 2) return;
      const vw = video.videoWidth || 1;
      const vh = video.videoHeight || 1;
      const columns = width < 480 ? 96 : 138;
      const spacing = width / columns;
      const rows = Math.max(1, Math.ceil(height / spacing));

      sample.width = columns;
      sample.height = rows;

      pixels.fillStyle = isDark ? '#000000' : '#ffffff';
      pixels.fillRect(0, 0, columns, rows);

      const scale = Math.min(columns / vw, rows / vh) * 0.92;
      const dw = vw * scale;
      const dh = vh * scale;
      pixels.fillStyle = motif === 'fish' ? '#000000' : '#ffffff';
      pixels.fillRect(0, 0, columns, rows);
      pixels.drawImage(video, (columns - dw) / 2, (rows - dh) / 2, dw, dh);

      const data = pixels.getImageData(0, 0, columns, rows).data;

      context.globalAlpha = 1;
      context.fillStyle = isDark ? '#000000' : '#F8F9FA';
      context.fillRect(0, 0, width, height);

      const threshold = motif === 'fish' ? 0.14 : 0.22;
      const groups = new Map<string, Path2D>();

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          const idx = (y * columns + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const ink = motif === 'fish' ? luma : 1 - luma;
          if (ink < threshold) continue;

          const norm = Math.min(1, (ink - threshold) / 0.55);
          const alpha = Math.min(1, Math.max(0.18, norm * 1.15));

          let fillR: number;
          let fillG: number;
          let fillB: number;

          if (isDark) {
            // Luminous Google Cobalt Blue (#0B57D0 -> #4285F4 -> #A8C7FA)
            fillR = Math.round(11 + norm * 145);
            fillG = Math.round(87 + norm * 112);
            fillB = Math.round(208 + norm * 42);
          } else {
            // Crisp Archival Cobalt Blue (#0B57D0 -> #1A73E8)
            fillR = Math.round(11 + (1 - norm) * 48);
            fillG = Math.round(87 + (1 - norm) * 62);
            fillB = Math.round(208 + (1 - norm) * 32);
          }

          const bucketKey = `rgba(${Math.round(fillR / 16) * 16},${Math.round(fillG / 16) * 16},${Math.round(fillB / 16) * 16},${Math.round(alpha * 12) / 12})`;
          let path = groups.get(bucketKey);
          if (!path) {
            path = new Path2D();
            groups.set(bucketKey, path);
          }

          const cx = (x + 0.5) * spacing;
          const cy = (y + 0.5) * spacing;
          const size = spacing * 0.86 * (0.35 + 0.65 * Math.sqrt(norm));
          path.moveTo(cx, cy - size);
          path.lineTo(cx + size, cy);
          path.lineTo(cx, cy + size);
          path.lineTo(cx - size, cy);
          path.closePath();
        }
      }

      for (const [color, path] of groups) {
        context.fillStyle = color;
        context.fill(path);
      }
    };

    const tick = (now: number) => {
      if (disposed) return;
      if (!document.hidden && now - lastDraw > 50) {
        draw();
        lastDraw = now;
      }
      frameId = requestAnimationFrame(tick);
    };

    const startPlay = () => {
      video.play().catch(() => {
        draw();
      });
    };

    const onLoadedData = () => {
      draw();
      if (reducedMotion.matches) {
        video.currentTime = Math.min(1.8, (video.duration || 3) / 3);
        video.pause();
      } else {
        startPlay();
      }
    };

    const onSeeked = () => {
      if (reducedMotion.matches) draw();
    };

    const onVisibility = () => {
      if (document.hidden) video.pause();
      else if (!reducedMotion.matches) startPlay();
    };

    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('seeked', onSeeked);
    document.addEventListener('visibilitychange', onVisibility);
    if (!reducedMotion.matches) {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('seeked', onSeeked);
      document.removeEventListener('visibilitychange', onVisibility);
      video.pause();
    };
  }, [motif, isDark]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-[20px]"
    >
      {/* Subtle Cobalt radial atmospheric halo behind halftone canvas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: isDark
            ? 'radial-gradient(circle at 50% 50%, rgba(26, 115, 232, 0.14) 0%, transparent 68%)'
            : 'radial-gradient(circle at 50% 50%, rgba(26, 115, 232, 0.08) 0%, transparent 68%)',
        }}
      />
      <canvas
        ref={canvasRef}
        aria-label={
          motif === 'butterfly'
            ? 'Animated cobalt diamond halftone butterfly artwork'
            : 'Animated cobalt diamond halftone koi fish artwork'
        }
        className="h-full w-full block"
      />
      <video
        ref={videoRef}
        muted
        playsInline
        loop
        autoPlay
        preload="auto"
        className="hidden"
      />
    </div>
  );
}

export function LandingHub({
  theme,
  onToggleTheme,
  workspaces,
  backendHealthy,
  isSubmittingCommand,
  commandStatusText,
  onOpenStudio,
  onOpenArena,
  onOpenRepoModal,
  onSelectStarterWorkspace,
  onSubmitCommand,
}: LandingHubProps) {
  const [commandInput, setCommandInput] = useState('');
  const [motif, setMotif] = useState<HalftoneMotif>('butterfly');

  const isDark = theme === 'dark';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCommand) return;
    const trimmed = commandInput.trim();
    if (!trimmed) {
      onOpenStudio();
      return;
    }
    void onSubmitCommand(trimmed);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-clip bg-[var(--bg-void)] text-[var(--ink-primary)] lg:h-screen lg:overflow-hidden">
      {/* Subtle ambient Cobalt radial glow */}
      <div
        aria-hidden="true"
        className="codewiki-hero-aura pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-85"
      />

      {/* Minimal 64px Top Header */}
      <header className="relative z-20 mx-auto flex h-[64px] w-full max-w-[1360px] shrink-0 items-center justify-between gap-4 px-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <AntiSlopPrismMark className="h-[24px] w-[24px] shrink-0" />
          <span className="text-[18px] font-medium tracking-[-0.025em] text-[var(--ink-primary)]">
            AntiSlop
          </span>
          <span
            title={backendHealthy ? 'Gemini 4 engine live' : 'Connecting to backend'}
            className={`h-1.5 w-1.5 rounded-full ${
              backendHealthy
                ? 'bg-[var(--emerald)]'
                : 'bg-[var(--amber)] animate-studio-pulse'
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Interactive Halftone Motif Toggle: Butterfly | Koi Fish */}
          <div
            role="group"
            aria-label="Halftone shader motif"
            className="flex h-[34px] items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setMotif('butterfly')}
              className={`h-[28px] rounded-full px-3 text-[11.5px] font-medium transition-colors ${
                motif === 'butterfly'
                  ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              Butterfly
            </button>
            <button
              type="button"
              onClick={() => setMotif('fish')}
              className={`h-[28px] rounded-full px-3 text-[11.5px] font-medium transition-colors ${
                motif === 'fish'
                  ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              Koi Fish
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              isDark ? 'Switch to Light Paper theme' : 'Switch to Obsidian Dark theme'
            }
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>

          {/* Primary Open Studio CTA */}
          <button
            type="button"
            onClick={onOpenStudio}
            className="cobalt-cta inline-flex h-[36px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-medium whitespace-nowrap"
          >
            <GeminiSparkleMark className="h-3.5 w-3.5 brightness-200" />
            <span>Open Studio</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Single-Page Split Atelier Composition */}
      <main className="relative z-10 mx-auto grid w-full max-w-[1360px] flex-1 grid-cols-1 items-center gap-8 px-5 pb-8 pt-2 sm:px-10 lg:min-h-0 lg:grid-cols-12 lg:gap-10 lg:pb-10">
        {/* Left Editorial Column (52%) */}
        <div className="flex flex-col justify-center lg:col-span-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--cobalt-ice)]">
            <span>Gemini 4</span>
            <span>·</span>
            <span>3.8 Live Voice</span>
            <span>·</span>
            <span>900-Probe Decisions API</span>
          </div>

          <h1 className="mt-5 text-[clamp(2.35rem,4.3vw,3.9rem)] font-medium leading-[1.04] tracking-[-0.035em] text-[var(--ink-primary)]">
            Taste-driven UI craft,{' '}
            <span className="font-serif italic font-normal text-[var(--cobalt-ice)]">
              beyond text prompts.
            </span>
          </h1>

          <p className="mt-4 max-w-[540px] text-[15px] leading-[1.65] text-[var(--ink-secondary)]">
            Paste any GitHub repo or live reference URL, circle a component, or
            talk directly with Gemini 3.8 Live. AntiSlop rewrites real frontend
            code, generates domain-grounded Nano Banana 2.1 art, and verifies
            every pixel across 900 Decisions API probes.
          </p>

          {/* Sculptural Launch Command Bar */}
          <form
            onSubmit={handleSubmit}
            className={`codewiki-pill mt-7 flex h-[52px] w-full max-w-[560px] items-center gap-2 rounded-full pl-5 pr-1.5 ${
              isSubmittingCommand ? 'border-[var(--cobalt-border-strong)]' : ''
            }`}
          >
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              disabled={isSubmittingCommand}
              placeholder="Paste GitHub repo or live site (e.g. anthropic.com)..."
              aria-label="Paste GitHub repository or live website URL"
              className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSubmittingCommand}
              className="cobalt-cta inline-flex h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-medium disabled:opacity-65"
            >
              {isSubmittingCommand ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{commandStatusText || 'Booting…'}</span>
                </>
              ) : (
                <>
                  <span>Launch</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Instant Starter Workspaces & Tools */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {FEATURED_STARTERS.map((starter) => (
              <button
                key={starter.id}
                type="button"
                onClick={() =>
                  onSelectStarterWorkspace(
                    resolveStarterWorkspaceId(starter, workspaces)
                  )
                }
                className="inline-flex h-[32px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-[12px] text-[var(--ink-secondary)] transition-colors hover:border-[var(--cobalt-border)] hover:bg-[var(--cobalt-tint)] hover:text-[var(--ink-primary)]"
              >
                <span className="font-medium text-[var(--ink-primary)]">
                  {starter.label}
                </span>
                <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                  {starter.tag}
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={onOpenRepoModal}
              className="inline-flex h-[32px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-transparent px-3 text-[12px] text-[var(--ink-secondary)] transition-colors hover:border-[var(--cobalt-border)] hover:text-[var(--cobalt-ice)]"
            >
              <FolderGit2 className="h-3.5 w-3.5" />
              <span>GitHub Repo</span>
            </button>

            <button
              type="button"
              onClick={onOpenArena}
              className="inline-flex h-[32px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-transparent px-3 text-[12px] text-[var(--ink-secondary)] transition-colors hover:border-[var(--emerald-border)] hover:text-[var(--emerald)]"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              <span>5-Sigma Proof</span>
            </button>
          </div>

          {/* Crisp Single-Line Empirical Proof Strip */}
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border-subtle)] pt-4 font-mono text-[11px] text-[var(--ink-muted)]">
            <span>
              <strong className="text-[var(--ink-primary)]">13.8 → 99.5</strong>{' '}
              5-Sigma Taste Index
            </span>
            <span>
              <strong className="text-[var(--ink-primary)]">900 / 1,800</strong>{' '}
              Decision-1 Probes (~2.3s)
            </span>
            <a
              href="/AntiSlop_Gemini4_OnePager.pdf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--cobalt-ice)] hover:underline"
            >
              <span>Architecture 1-Pager PDF</span>
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Right Living Halftone <canvas> Artwork Column (48%) */}
        <div className="relative h-[380px] w-full overflow-hidden rounded-[22px] border border-[var(--cobalt-border)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] sm:h-[440px] lg:col-span-6 lg:h-[min(74vh,640px)]">
          <HalftoneArtworkCanvas motif={motif} isDark={isDark} />

          {/* Minimal Corner Telemetry Pill */}
          <div className="pointer-events-none absolute bottom-3.5 left-3.5 right-3.5 z-20 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-3 py-1 font-mono text-[10px] text-[#F1F3F4] backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4285F4]" />
              Live Path2D Halftone Shader ·{' '}
              {motif === 'butterfly' ? 'butterfly.mp4' : 'fish3.mp4'}
            </span>
            <span className="hidden rounded-full border border-white/15 bg-black/75 px-2.5 py-1 font-mono text-[10px] text-[#8AB4F8] backdrop-blur-md sm:inline">
              Butterfly → Tiger in 1 Circle
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
