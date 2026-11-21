'use client';

import { useEffect, useState } from 'react';
import type { WorkspaceRepoInfo } from '@shared/types';
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  FlaskConical,
  FolderGit2,
  Layers,
  Loader2,
  Mic,
  Moon,
  PenTool,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import type { StudioTheme } from '@/lib/useTheme';
import { AntiSlopPrismMark, GeminiSparkleMark, GitHubMark } from './BrandMarks';
import { CobaltCube3D } from './CobaltCube3D';

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

interface FeaturedWorkspaceSpec {
  key: 'novaflow' | 'kova' | 'portfolio';
  slug: string;
  owner: string;
  subtitle: string;
  description: string;
  badge: string;
  badgeTone: 'emerald' | 'cobalt';
  fallbackWorkspaceId: string;
  matchTokens: string[];
}

const FEATURED_WORKSPACES: FeaturedWorkspaceSpec[] = [
  {
    key: 'novaflow',
    slug: 'novaflow-slop',
    owner: 'antislop',
    subtitle: 'SaaS AI-Slop Baseline',
    description:
      'Generic gradient SaaS rebuilt with disciplined hierarchy and verified 9.09 → 1.75 Slop drop.',
    badge: '9.09 → 1.75 Slop',
    badgeTone: 'emerald',
    fallbackWorkspaceId: 'novaflow-slop',
    matchTokens: ['novaflow', 'target-repo'],
  },
  {
    key: 'kova',
    slug: 'shopcraft-store',
    owner: 'antislop',
    subtitle: 'Kova Goods E-Commerce Storefront',
    description:
      'Tactile editorial retail storefront primed for live palette, pacing, and product card elevation.',
    badge: 'Storefront',
    badgeTone: 'cobalt',
    fallbackWorkspaceId: 'shopcraft-store',
    matchTokens: ['shopcraft', 'kova'],
  },
  {
    key: 'portfolio',
    slug: 'portfolio-starter',
    owner: 'antislop',
    subtitle: 'Dev Portfolio · Butterfly Case Study',
    description:
      'Minimal developer portfolio calibrated for live connorhyatt.com editorial taste transfer.',
    badge: 'connorhyatt.com',
    badgeTone: 'cobalt',
    fallbackWorkspaceId: 'dev-portfolio',
    matchTokens: ['portfolio'],
  },
];

const HERO_MODALITY_TILES = [
  {
    id: 'vision',
    label: 'Vision',
    tiltClass: '-rotate-[7deg] translate-y-2.5 sm:translate-y-3',
    icon: Eye,
  },
  {
    id: 'circle',
    label: 'Circle',
    tiltClass: '-rotate-[2.5deg] -translate-y-1',
    icon: PenTool,
  },
  {
    id: 'voice',
    label: 'Voice',
    tiltClass: 'rotate-[2.5deg] -translate-y-1',
    icon: Mic,
  },
  {
    id: 'decision',
    label: 'Decision-1',
    tiltClass: 'rotate-[7deg] translate-y-2.5 sm:translate-y-3',
    icon: Zap,
  },
] as const;

const DIRECT_WORKFLOW_ITEMS = [
  {
    id: 'circle',
    icon: PenTool,
    title: 'Circle any element on the canvas',
    detail:
      'Sketch directly over live DOM regions so Gemini 4 targets exact components with surgical precision.',
  },
  {
    id: 'voice',
    icon: Mic,
    title: 'Speak natural visual tweaks',
    detail:
      'Art-direct typography, spacing, and surface craft by voice while Neon & Hydrogen patch live code.',
  },
  {
    id: 'critic',
    icon: Zap,
    title: 'Calibrated Decisions API critic (~35s)',
    detail:
      'Every render is audited by gemini-decision-1 + Playwright DOM checks before shipping.',
  },
] as const;

function resolveStarterWorkspaceId(
  spec: FeaturedWorkspaceSpec,
  workspaces: WorkspaceRepoInfo[]
): string {
  const found = workspaces.find((w) => {
    const hay = `${w.id} ${w.name}`.toLowerCase();
    return spec.matchTokens.some((tok) => hay.includes(tok));
  });
  return found?.id || spec.fallbackWorkspaceId;
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
  const [scrolledPastHeroInput, setScrolledPastHeroInput] = useState(false);

  const isDark = theme === 'dark';

  useEffect(() => {
    const onScroll = () => {
      setScrolledPastHeroInput(window.scrollY > 260);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    <div className="relative min-h-screen w-full overflow-x-clip bg-[var(--bg-void)] text-[var(--ink-primary)]">
      {/* ================================================================
          MINIMAL STICKY TOP BAR (68px) — Exact codewiki.google restraint
         ================================================================ */}
      <header
        className={`sticky top-0 z-40 h-[68px] w-full transition-[background-color,border-color,backdrop-filter] duration-300 ${
          scrolledPastHeroInput
            ? isDark
              ? 'border-b border-white/[0.08] bg-black/78 backdrop-blur-xl'
              : 'border-b border-[var(--border-subtle)] bg-[#F5F3EE]/85 backdrop-blur-xl'
            : 'border-b border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-full w-full max-w-[1380px] items-center justify-between gap-4 px-5 sm:px-8">
          {/* Left: AntiSlop Prism + Wordmark */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex shrink-0 items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8AB4F8]/60 rounded-full py-1 pr-2"
          >
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
          </button>

          {/* Center: Calm Sticky Pill Input (appears smoothly on scroll) */}
          <div
            aria-hidden={!scrolledPastHeroInput}
            className={`hidden max-w-[440px] flex-1 transition-all duration-300 md:block ${
              scrolledPastHeroInput
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-1.5 opacity-0'
            }`}
          >
            <form
              onSubmit={handleSubmit}
              className={`flex h-[40px] w-full items-center gap-2 rounded-full pl-4 pr-1.5 transition-colors ${
                isDark
                  ? 'border border-[#8AB4F8]/20 bg-[#0A0F17]/90 focus-within:border-[#8AB4F8]/60'
                  : 'border border-[var(--border-pill)] bg-white/95 shadow-xs focus-within:border-[#1A73E8]'
              }`}
            >
              <input
                type="text"
                tabIndex={scrolledPastHeroInput ? 0 : -1}
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                disabled={isSubmittingCommand}
                placeholder="Paste GitHub repo or live reference URL..."
                aria-label="Paste GitHub repo or live reference URL"
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                tabIndex={scrolledPastHeroInput ? 0 : -1}
                disabled={isSubmittingCommand}
                aria-label="Submit URL or open Studio"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--sapphire-ice)]"
              >
                {isSubmittingCommand ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--sapphire-ice)]" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
              </button>
            </form>
          </div>

          {/* Right: ONLY 2 clean minimal controls — Theme Toggle + 5-Sigma */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={
                isDark
                  ? 'Switch to Light Atelier theme'
                  : 'Switch to Obsidian Dark theme'
              }
              title={isDark ? 'Light Atelier' : 'Obsidian Dark'}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                isDark
                  ? 'border-white/[0.11] bg-white/[0.03] text-[#9AA0A6] hover:border-white/[0.24] hover:text-white'
                  : 'border-[var(--border-card)] bg-white/80 text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {isDark ? (
                <Sun className="h-[15px] w-[15px]" />
              ) : (
                <Moon className="h-[15px] w-[15px]" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenArena}
              title="Open 5-Sigma Empirical Arena"
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium tracking-[-0.01em] transition-colors ${
                isDark
                  ? 'border-white/[0.11] bg-white/[0.03] text-[#D2E3FC] hover:border-[#8AB4F8]/45 hover:bg-[#1A73E8]/15 hover:text-white'
                  : 'border-[var(--border-card)] bg-white/85 text-[var(--ink-secondary)] hover:border-[#1A73E8]/40 hover:text-[#1A73E8]'
              }`}
            >
              <FlaskConical className="h-3.5 w-3.5 text-[var(--sapphire-ice)]" />
              <span>5-Sigma</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative w-full">
        {/* ================================================================
            SECTION 1 — HERO (Above the Fold, Exact codewiki.google Proportions)
           ================================================================ */}
        <section
          aria-label="AntiSlop Hero"
          className="relative flex min-h-[calc(100svh-68px)] w-full flex-col items-center justify-between px-5 pt-12 pb-6 sm:px-8 sm:pt-16 sm:pb-8"
        >
          {/* Ambient radial cobalt glow behind hero input */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[22%] mx-auto h-[360px] max-w-[820px]"
            style={{
              background: isDark
                ? 'radial-gradient(ellipse 68% 58% at 50% 54%, rgba(11, 87, 208, 0.28) 0%, rgba(26, 115, 232, 0.13) 40%, transparent 74%)'
                : 'radial-gradient(ellipse 68% 58% at 50% 54%, rgba(26, 115, 232, 0.12) 0%, rgba(66, 133, 244, 0.05) 45%, transparent 74%)',
            }}
          />

          {/* Centered Typographic Hero + Sculptural Pill Input */}
          <div className="relative z-10 flex w-full max-w-[740px] flex-1 flex-col items-center justify-center text-center">
            <h1
              className={`font-medium tracking-[-0.035em] ${
                isDark ? 'text-white' : 'text-[var(--ink-primary)]'
              }`}
              style={{
                fontSize: 'clamp(3.75rem, 8vw, 6.75rem)',
                lineHeight: 1.02,
              }}
            >
              AntiSlop
            </h1>

            <p
              className={`mt-5 max-w-[540px] text-[16px] leading-[1.58] sm:text-[18.5px] ${
                isDark ? 'text-[#7CACF8]' : 'text-[#1A73E8]'
              }`}
            >
              A live visual editor for the agentic era.
              <br />
              Multimodal taste powered by Gemini 4 &amp; Decisions API.
            </p>

            {/* Sculptural Cobalt-Lit Pill Command Input with radial halo directly underneath */}
            <div className="relative mt-9 w-full max-w-[580px]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-7 left-1/2 h-[64px] w-[88%] -translate-x-1/2 rounded-full blur-2xl"
                style={{
                  background: isDark
                    ? 'radial-gradient(ellipse at center, rgba(26, 115, 232, 0.42) 0%, rgba(11, 87, 208, 0.18) 55%, transparent 80%)'
                    : 'radial-gradient(ellipse at center, rgba(26, 115, 232, 0.18) 0%, rgba(66, 133, 244, 0.08) 55%, transparent 80%)',
                }}
              />

              <form
                onSubmit={handleSubmit}
                className={`codewiki-pill relative flex h-[62px] w-full items-center gap-2 rounded-full pl-6 pr-2.5 ${
                  isDark ? 'bg-[#080C14]/95' : 'bg-white'
                }`}
              >
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  disabled={isSubmittingCommand}
                  placeholder="Paste a GitHub repo or live reference site (e.g. connorhyatt.com)"
                  aria-label="Paste a GitHub repo or live reference site"
                  className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={isSubmittingCommand}
                  aria-label="Launch in AntiSlop Studio"
                  className={`flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:opacity-60 ${
                    isDark
                      ? 'text-[#9AA0A6] hover:bg-white/[0.08] hover:text-[#8AB4F8]'
                      : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[#1A73E8]'
                  }`}
                >
                  {isSubmittingCommand ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--sapphire-ice)]" />
                      <span className="hidden font-mono text-[11px] text-[var(--sapphire-ice)] sm:inline">
                        {commandStatusText || 'Launching…'}
                      </span>
                    </>
                  ) : (
                    <Search className="h-[18px] w-[18px]" />
                  )}
                </button>
              </form>
            </div>

            {/* Understated Quick-Try Reference Chips */}
            <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[var(--ink-muted)]">
              <button
                type="button"
                disabled={isSubmittingCommand}
                onClick={() => {
                  setCommandInput('connorhyatt.com');
                  void onSubmitCommand('connorhyatt.com');
                }}
                className={`rounded-full px-2.5 py-0.5 font-mono text-[11.5px] transition-colors disabled:opacity-50 ${
                  isDark
                    ? 'text-[#8AB4F8]/85 hover:bg-[#1A73E8]/15 hover:text-[#D2E3FC]'
                    : 'text-[#1A73E8]/85 hover:bg-[#1A73E8]/10 hover:text-[#0B57D0]'
                }`}
              >
                connorhyatt.com
              </button>
              <span aria-hidden="true" className="opacity-45">
                ·
              </span>
              <button
                type="button"
                disabled={isSubmittingCommand}
                onClick={() => {
                  setCommandInput('are.na');
                  void onSubmitCommand('are.na');
                }}
                className={`rounded-full px-2.5 py-0.5 font-mono text-[11.5px] transition-colors disabled:opacity-50 ${
                  isDark
                    ? 'text-[#8AB4F8]/85 hover:bg-[#1A73E8]/15 hover:text-[#D2E3FC]'
                    : 'text-[#1A73E8]/85 hover:bg-[#1A73E8]/10 hover:text-[#0B57D0]'
                }`}
              >
                are.na
              </button>
            </div>
          </div>

          {/* Bottom Edge of Hero: 4 Slightly Tilted Overlapping Frosted Cobalt Glass Icon Tiles */}
          <div className="relative z-10 mt-10 flex w-full max-w-[680px] flex-col items-center pt-4">
            {/* Soft #1A73E8 radial floor glow beneath the 4 tiles */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-10 left-1/2 h-[180px] w-[520px] max-w-[92vw] -translate-x-1/2"
              style={{
                background: isDark
                  ? 'radial-gradient(ellipse 68% 54% at 50% 62%, rgba(26, 115, 232, 0.34) 0%, rgba(11, 87, 208, 0.16) 44%, transparent 76%)'
                  : 'radial-gradient(ellipse 68% 54% at 50% 62%, rgba(26, 115, 232, 0.14) 0%, rgba(66, 133, 244, 0.06) 44%, transparent 76%)',
              }}
            />

            <div className="relative flex items-end justify-center -space-x-2.5 sm:-space-x-3">
              {HERO_MODALITY_TILES.map((tile, idx) => {
                const Icon = tile.icon;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={onOpenStudio}
                    style={{ zIndex: 10 + (idx === 1 || idx === 2 ? 2 : 0) }}
                    className={`group relative flex h-[78px] w-[78px] flex-col items-center justify-center gap-1.5 rounded-[22px] backdrop-blur-md transition-transform duration-300 hover:z-30 hover:-translate-y-2.5 sm:h-[94px] sm:w-[94px] sm:rounded-[26px] ${tile.tiltClass}`}
                    aria-label={`${tile.label} — Launch AntiSlop Studio`}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-[22px] sm:rounded-[26px]"
                      style={{
                        background: isDark
                          ? 'linear-gradient(155deg, rgba(102, 157, 246, 0.24) 0%, rgba(26, 115, 232, 0.15) 48%, rgba(8, 13, 24, 0.82) 100%)'
                          : 'linear-gradient(155deg, rgba(255, 255, 255, 0.92) 0%, rgba(232, 240, 254, 0.86) 58%, rgba(210, 227, 252, 0.72) 100%)',
                        border: isDark
                          ? '1px solid rgba(138, 180, 248, 0.34)'
                          : '1px solid rgba(26, 115, 232, 0.24)',
                        boxShadow: isDark
                          ? 'inset 0 1px 0 rgba(210, 227, 252, 0.32), 0 18px 34px -14px rgba(11, 87, 208, 0.65)'
                          : 'inset 0 1px 0 rgba(255, 255, 255, 0.95), 0 14px 28px -14px rgba(26, 115, 232, 0.28)',
                      }}
                    />
                    <Icon
                      className={`relative z-10 h-5 w-5 transition-transform duration-300 group-hover:scale-110 sm:h-6 sm:w-6 ${
                        isDark ? 'text-[#A8C7FA]' : 'text-[#1A73E8]'
                      }`}
                      strokeWidth={1.75}
                    />
                    <span
                      className={`relative z-10 font-mono text-[10px] font-medium tracking-[0.01em] ${
                        isDark ? 'text-[#D2E3FC]/85' : 'text-[#0B57D0]/85'
                      }`}
                    >
                      {tile.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================================================================
            SECTION 2 — FLOATING 3D COBALT PRISM + FEATURED WORKSPACES
           ================================================================ */}
        <section
          aria-labelledby="featured-workspaces-heading"
          className="relative mx-auto flex w-full max-w-[1060px] flex-col items-center px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28"
        >
          {/* Centered Floating 3D Translucent Cobalt Glass Cube */}
          <div className="relative flex w-full justify-center">
            <CobaltCube3D
              variant="hero"
              theme={theme}
              className="h-[310px] w-full max-w-[460px] sm:h-[370px] sm:max-w-[520px]"
              ariaLabel="Floating 3D translucent Google Cobalt glass cube"
            />
          </div>

          <div className="-mt-4 text-center">
            <h2
              id="featured-workspaces-heading"
              className={`text-[28px] font-medium tracking-[-0.03em] sm:text-[36px] ${
                isDark ? 'text-white' : 'text-[var(--ink-primary)]'
              }`}
            >
              Featured Workspaces
            </h2>
            <p className="mt-2.5 text-[14.5px] text-[var(--ink-secondary)] sm:text-[15.5px]">
              Open a live target frontend and run Gemini 4 multimodal craft elevation in seconds.
            </p>
          </div>

          {/* Clean 3-Column Grid of Sleek Rounded 20px Cards */}
          <div className="mt-10 grid w-full grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
            {FEATURED_WORKSPACES.map((card) => {
              const targetId = resolveStarterWorkspaceId(card, workspaces);
              return (
                <button
                  key={card.key}
                  type="button"
                  disabled={isSubmittingCommand}
                  onClick={() => onSelectStarterWorkspace(targetId)}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-[20px] p-6 text-left transition-all duration-300 disabled:opacity-60 ${
                    isDark
                      ? 'border border-white/[0.09] bg-[#090B0E] hover:-translate-y-0.5 hover:border-[#669DF6]/45'
                      : 'border border-[var(--border-card)] bg-white shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:border-[#1A73E8]/45'
                  }`}
                >
                  {/* Subtle Cobalt Bottom Hover Glow */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 -bottom-6 h-28 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: isDark
                        ? 'radial-gradient(ellipse 80% 70% at 50% 100%, rgba(26, 115, 232, 0.34) 0%, rgba(11, 87, 208, 0.12) 48%, transparent 78%)'
                        : 'radial-gradient(ellipse 80% 70% at 50% 100%, rgba(26, 115, 232, 0.14) 0%, transparent 72%)',
                    }}
                  />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                          isDark
                            ? 'border-[#8AB4F8]/20 bg-[#1A73E8]/12 text-[#8AB4F8]'
                            : 'border-[#1A73E8]/20 bg-[#1A73E8]/[0.07] text-[#1A73E8]'
                        }`}
                      >
                        {card.key === 'novaflow' ? (
                          <Layers className="h-4 w-4" />
                        ) : card.key === 'kova' ? (
                          <ShoppingBag className="h-4 w-4" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                      </span>

                      <span
                        className={`rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-medium ${
                          card.badgeTone === 'emerald'
                            ? 'border-[var(--emerald-border)] bg-[var(--emerald-bg)] text-[var(--emerald)]'
                            : isDark
                            ? 'border-[#8AB4F8]/24 bg-[#1A73E8]/12 text-[#8AB4F8]'
                            : 'border-[#1A73E8]/24 bg-[#1A73E8]/[0.07] text-[#1A73E8]'
                        }`}
                      >
                        {card.badge}
                      </span>
                    </div>

                    <div className="mt-5 flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--ink-muted)]">
                      <GitHubMark className="h-3.5 w-3.5 opacity-70" />
                      <span>{card.owner} /</span>
                    </div>

                    <h3
                      className={`mt-1 text-[18px] font-medium tracking-[-0.02em] transition-colors ${
                        isDark
                          ? 'text-white group-hover:text-[#A8C7FA]'
                          : 'text-[var(--ink-primary)] group-hover:text-[#1A73E8]'
                      }`}
                    >
                      {card.slug}
                    </h3>

                    <p className="mt-1 text-[12.5px] font-medium text-[var(--sapphire-ice)]">
                      {card.subtitle}
                    </p>

                    <p className="mt-2.5 text-[13px] leading-[1.58] text-[var(--ink-secondary)]">
                      {card.description}
                    </p>
                  </div>

                  <div
                    className={`relative z-10 mt-6 flex items-center justify-between border-t pt-3.5 text-[12.5px] font-medium ${
                      isDark
                        ? 'border-white/[0.07] text-[#8AB4F8]'
                        : 'border-[var(--border-subtle)] text-[#1A73E8]'
                    }`}
                  >
                    <span>Open workspace</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Full-Width Subtle Bar: + Connect Any GitHub Repository */}
          <button
            type="button"
            disabled={isSubmittingCommand}
            onClick={onOpenRepoModal}
            className={`group relative mt-4 flex w-full items-center justify-between gap-4 overflow-hidden rounded-[18px] px-5 py-4 text-left transition-all duration-250 disabled:opacity-60 sm:px-6 ${
              isDark
                ? 'border border-white/[0.09] bg-[#090B0E]/90 hover:border-[#669DF6]/45 hover:bg-[#0C1018]'
                : 'border border-[var(--border-card)] bg-white/90 hover:border-[#1A73E8]/45 hover:bg-white'
            }`}
          >
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                  isDark
                    ? 'border-[#8AB4F8]/25 bg-[#1A73E8]/14 text-[#8AB4F8]'
                    : 'border-[#1A73E8]/25 bg-[#1A73E8]/[0.08] text-[#1A73E8]'
                }`}
              >
                <Plus className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div
                  className={`flex items-center gap-2 text-[14.5px] font-medium tracking-[-0.015em] ${
                    isDark ? 'text-white' : 'text-[var(--ink-primary)]'
                  }`}
                >
                  <span>Connect Any GitHub Repository</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[11.5px] text-[var(--ink-muted)]">
                  <FolderGit2 className="h-3 w-3 shrink-0 text-[var(--sapphire-ice)]" />
                  <span className="truncate">
                    Browse 30+ live repositories · Boot React, Vite, or Next.js &amp; ship a PR
                  </span>
                </div>
              </div>
            </div>

            <span
              className={`inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium ${
                isDark ? 'text-[#8AB4F8]' : 'text-[#1A73E8]'
              }`}
            >
              <span className="hidden sm:inline">Browse repos</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </button>
        </section>

        {/* ================================================================
            SECTION 3 — "DIRECT YOUR LIVE UI" (2 Columns, Generous Whitespace)
           ================================================================ */}
        <section
          aria-labelledby="direct-live-ui-heading"
          className="relative mx-auto w-full max-w-[1120px] px-5 py-24 sm:px-8 sm:py-32"
        >
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
            {/* Left Column: Crisp Editorial Copy + 3 Ultra-Clean Icon Rows */}
            <div className="lg:col-span-5">
              <p
                className={`text-[13px] font-medium tracking-[0.02em] ${
                  isDark ? 'text-[#7CACF8]' : 'text-[#1A73E8]'
                }`}
              >
                Circle &amp; speak to your live UI
              </p>

              <h2
                id="direct-live-ui-heading"
                className={`mt-3 font-medium tracking-[-0.032em] ${
                  isDark ? 'text-white' : 'text-[var(--ink-primary)]'
                }`}
                style={{
                  fontSize: 'clamp(2.1rem, 4.2vw, 3.25rem)',
                  lineHeight: 1.08,
                }}
              >
                Direct your live UI
              </h2>

              <p className="mt-4 max-w-[420px] text-[15.5px] leading-[1.65] text-[var(--ink-secondary)]">
                Skip brittle prompt loops. Point, circle, and speak directly over your running
                frontend while Gemini 4 transforms code in real time.
              </p>

              <ul className="mt-9 space-y-5">
                {DIRECT_WORKFLOW_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id} className="flex items-start gap-3.5">
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                          isDark
                            ? 'border-[#8AB4F8]/22 bg-[#1A73E8]/12 text-[#8AB4F8]'
                            : 'border-[#1A73E8]/22 bg-[#1A73E8]/[0.07] text-[#1A73E8]'
                        }`}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <div>
                        <div
                          className={`text-[14.5px] font-medium tracking-[-0.01em] ${
                            isDark ? 'text-[#F1F3F4]' : 'text-[var(--ink-primary)]'
                          }`}
                        >
                          {item.title}
                        </div>
                        <p className="mt-0.5 text-[13px] leading-[1.55] text-[var(--ink-secondary)]">
                          {item.detail}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Right Column: Floating 3D Cobalt Cube over Glowing UI Layout Silhouettes */}
            <div className="relative flex items-center justify-center lg:col-span-7">
              <CobaltCube3D
                variant="wireframe"
                theme={theme}
                className="h-[340px] w-full max-w-[580px] sm:h-[430px]"
                ariaLabel="3D Cobalt glass cube floating over live UI layout wireframes and annotation ring"
              />
            </div>
          </div>
        </section>

        {/* ================================================================
            SECTION 4 — "SEE ANTISLOP IN ACTION" macOS MONITOR SHOWCASE
           ================================================================ */}
        <section
          aria-labelledby="action-showcase-heading"
          className="relative mx-auto flex w-full max-w-[1040px] flex-col items-center px-5 pt-16 pb-24 sm:px-8 sm:pt-24 sm:pb-32"
        >
          <p
            className={`text-center text-[13px] font-medium tracking-[0.02em] ${
              isDark ? 'text-[#7CACF8]' : 'text-[#1A73E8]'
            }`}
          >
            See AntiSlop in action
          </p>

          <h2
            id="action-showcase-heading"
            className={`mt-3 max-w-[680px] text-center font-medium tracking-[-0.032em] ${
              isDark ? 'text-white' : 'text-[var(--ink-primary)]'
            }`}
            style={{
              fontSize: 'clamp(2.1rem, 4.4vw, 3.35rem)',
              lineHeight: 1.08,
            }}
          >
            Eliminate AI slop in one continuous loop
          </h2>

          {/* Minimalist macOS Browser Frame */}
          <div className="relative mt-12 w-full max-w-[900px]">
            {/* Subtle bottom cobalt projection aura underneath monitor */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-10 left-1/2 h-[140px] w-[78%] -translate-x-1/2 rounded-full blur-3xl"
              style={{
                background: isDark
                  ? 'radial-gradient(ellipse at center, rgba(11, 87, 208, 0.36) 0%, rgba(26, 115, 232, 0.14) 55%, transparent 80%)'
                  : 'radial-gradient(ellipse at center, rgba(26, 115, 232, 0.16) 0%, transparent 78%)',
              }}
            />

            <div
              className={`relative overflow-hidden rounded-[24px] border ${
                isDark
                  ? 'border-white/[0.11] bg-[#07090D] shadow-[0_32px_90px_-32px_rgba(0,0,0,0.95)]'
                  : 'border-[var(--border-card)] bg-white shadow-[0_28px_70px_-30px_rgba(20,20,19,0.18)]'
              }`}
            >
              {/* Minimalist macOS Window Bar */}
              <div
                className={`flex h-[46px] items-center justify-between border-b px-4 sm:px-5 ${
                  isDark
                    ? 'border-white/[0.07] bg-[#0A0D13]'
                    : 'border-[var(--border-subtle)] bg-[#FAF8F4]'
                }`}
              >
                <div className="flex items-center gap-2" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]/80" />
                </div>

                <div
                  className={`flex h-7 items-center gap-2 rounded-full border px-4 font-mono text-[11px] ${
                    isDark
                      ? 'border-white/[0.08] bg-black/60 text-[#9AA0A6]'
                      : 'border-[var(--border-subtle)] bg-white text-[var(--ink-secondary)]'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      backendHealthy ? 'bg-[var(--emerald)]' : 'bg-[var(--amber)]'
                    }`}
                  />
                  <span>antislop.studio / live-canvas</span>
                </div>

                <div className="w-[46px]" aria-hidden="true" />
              </div>

              {/* Monitor Viewport Stage with 3D Cobalt Cube + Iconic Centered Luminous CTA */}
              <div className="relative flex h-[360px] w-full items-center justify-center sm:h-[440px]">
                <CobaltCube3D
                  variant="monitor"
                  theme={theme}
                  className="h-full w-full"
                  ariaLabel="AntiSlop Studio live monitor preview with 3D Cobalt glass prism"
                />

                {/* ONE Iconic Centered Luminous Pill CTA Button */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={onOpenStudio}
                    className="pointer-events-auto group relative inline-flex h-[54px] items-center gap-2.5 rounded-full px-7 text-[15px] font-medium tracking-[-0.015em] transition-all duration-300 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8AB4F8]"
                    style={{
                      background: isDark
                        ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(232, 240, 254, 0.95) 100%)'
                        : 'linear-gradient(180deg, #1A73E8 0%, #0B57D0 100%)',
                      color: isDark ? '#07090D' : '#FFFFFF',
                      boxShadow: isDark
                        ? '0 0 0 1px rgba(138, 180, 248, 0.5), 0 0 38px rgba(66, 133, 244, 0.55), 0 14px 32px -10px rgba(0, 0, 0, 0.85)'
                        : '0 0 0 1px rgba(11, 87, 208, 0.2), 0 14px 34px -10px rgba(26, 115, 232, 0.5)',
                    }}
                  >
                    <GeminiSparkleMark className="h-[18px] w-[18px] shrink-0" />
                    <span>Launch AntiSlop Studio</span>
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Subtle Verified Badge Below Monitor -> Clicks Straight into 5-Sigma Arena */}
          <button
            type="button"
            onClick={onOpenArena}
            className={`group mt-8 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-full border px-5 py-2.5 text-[12px] transition-colors ${
              isDark
                ? 'border-white/[0.09] bg-[#090B0E] text-[#9AA0A6] hover:border-[#8AB4F8]/40 hover:text-white'
                : 'border-[var(--border-card)] bg-white text-[var(--ink-secondary)] hover:border-[#1A73E8]/40 hover:text-[var(--ink-primary)]'
            }`}
          >
            <GeminiSparkleMark className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono text-[11.5px] text-[var(--emerald)]">
              100% Pass Rate
            </span>
            <span aria-hidden="true" className="opacity-45">
              ·
            </span>
            <span className="font-mono text-[11.5px] text-[var(--ink-primary)]">
              +85.7 Taste Lift
            </span>
            <span aria-hidden="true" className="opacity-45">
              ·
            </span>
            <span className="font-mono text-[11.5px] text-[var(--ink-secondary)]">
              0 DOM Defects
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-muted)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--sapphire-ice)]" />
          </button>
        </section>
      </main>

      {/* Ultra-Calm Minimal Footer */}
      <footer
        className={`w-full border-t py-8 text-center text-[12px] text-[var(--ink-muted)] ${
          isDark ? 'border-white/[0.06]' : 'border-[var(--border-subtle)]'
        }`}
      >
        <div className="mx-auto flex max-w-[1060px] flex-col items-center justify-between gap-2 px-5 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2">
            <AntiSlopPrismMark className="h-4 w-4 opacity-80" />
            <span>AntiSlop</span>
          </div>
          <span className="font-mono text-[11px] opacity-80">
            Gemini 4 Carbon · Neon · Hydrogen · Calibrated Decisions API
          </span>
        </div>
      </footer>
    </div>
  );
}
