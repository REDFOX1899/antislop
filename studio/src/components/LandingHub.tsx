'use client';

import { useState } from 'react';
import type { WorkspaceRepoInfo } from '@shared/types';
import {
  ArrowRight,
  FlaskConical,
  FolderGit2,
  Layers,
  Loader2,
  Moon,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { StudioTheme } from '@/lib/useTheme';
import { AntiSlopPrismMark, GeminiSparkleMark } from './BrandMarks';

interface LandingHubProps {
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

interface StarterCardSpec {
  key: 'novaflow' | 'kova' | 'portfolio';
  title: string;
  slug: string;
  description: string;
  badge: string;
  badgeTone: 'emerald' | 'sapphire';
  fallbackWorkspaceId: string;
  matchTokens: string[];
}

const STARTER_CARDS: StarterCardSpec[] = [
  {
    key: 'novaflow',
    title: 'NovaFlow AI',
    slug: 'target-repo · novaflow-slop',
    description: 'SaaS AI-Slop Baseline — 9.09/10 Slop → 1.75/10 verified',
    badge: '9.09 → 1.75 Slop',
    badgeTone: 'emerald',
    fallbackWorkspaceId: 'novaflow-slop',
    matchTokens: ['novaflow', 'target-repo'],
  },
  {
    key: 'kova',
    title: 'Kova Goods',
    slug: 'shopcraft-store',
    description: 'Generic E-Commerce Storefront ready for editorial elevation',
    badge: 'Storefront',
    badgeTone: 'sapphire',
    fallbackWorkspaceId: 'shopcraft-store',
    matchTokens: ['shopcraft', 'kova'],
  },
  {
    key: 'portfolio',
    title: 'Dev Portfolio',
    slug: 'portfolio-starter',
    description: 'Butterfly Case Study → connorhyatt.com live taste transfer',
    badge: 'Portfolio',
    badgeTone: 'sapphire',
    fallbackWorkspaceId: 'dev-portfolio',
    matchTokens: ['portfolio'],
  },
];

function resolveStarterWorkspaceId(
  spec: StarterCardSpec,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCommand) return;
    if (!commandInput.trim()) {
      onOpenStudio();
      return;
    }
    void onSubmitCommand(commandInput.trim());
  };

  return (
    <div className="studio-scroll relative flex min-h-screen w-full flex-col overflow-y-auto bg-[var(--bg-void)] text-[var(--ink-primary)]">
      {/* Ultra-Minimal Top Bar mirroring codewiki.google */}
      <header className="mx-auto flex h-[76px] w-full max-w-[1440px] shrink-0 items-center justify-between px-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <AntiSlopPrismMark className="h-[26px] w-[26px] shrink-0" />
          <span className="text-[19px] font-medium tracking-[-0.02em] text-[var(--ink-primary)]">
            AntiSlop
          </span>
          <span
            title={backendHealthy ? 'Gemini 4 engine live' : 'Connecting to backend'}
            className={`ml-0.5 h-1.5 w-1.5 rounded-full ${
              backendHealthy
                ? 'bg-[var(--emerald)]'
                : 'bg-[var(--amber)] animate-studio-pulse'
            }`}
          />
        </div>

        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to Light Atelier theme' : 'Switch to Obsidian Dark theme'
            }
            title={theme === 'dark' ? 'Light Atelier' : 'Obsidian Dark'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenArena}
            className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-3.5 text-[13px] font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--sapphire-border)] hover:text-[var(--ink-primary)] sm:inline-flex"
          >
            <FlaskConical className="h-3.5 w-3.5 text-[var(--sapphire-ice)]" />
            <span>5-Sigma Proof</span>
          </button>

          <button
            type="button"
            onClick={onOpenStudio}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] px-4 text-[13px] font-medium text-[var(--sapphire-ice)] transition-colors hover:bg-[var(--sapphire-soft)]"
          >
            <span>Open Studio</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Centered Heroic Calm Space with Subtle Google Sapphire Ambient Aura */}
      <main className="mx-auto flex w-full max-w-[1140px] flex-1 flex-col items-center justify-center px-6 pb-10 pt-6 sm:pt-10">
        <div className="codewiki-hero-aura relative flex w-full max-w-[780px] flex-col items-center py-8 text-center sm:py-10">
          <h1
            className="font-medium tracking-[-0.035em] text-[var(--ink-primary)]"
            style={{
              fontSize: 'clamp(3.25rem, 6.5vw, 5.25rem)',
              lineHeight: 1.03,
            }}
          >
            AntiSlop
          </h1>

          <p className="mt-5 max-w-[540px] text-[16px] leading-[1.6] text-[var(--sapphire-ice)] sm:text-[18px]">
            A multimodal visual editor for live frontends.
            <br />
            Powered by Gemini 4 &amp; Decisions API — zero AI slop.
          </p>

          {/* Sculptural Glowing Pill Command Bar */}
          <form
            onSubmit={handleSubmit}
            className="codewiki-pill mt-9 flex h-[58px] w-full max-w-[620px] items-center gap-2 rounded-full pl-6 pr-2.5"
          >
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              disabled={isSubmittingCommand}
              placeholder="Paste any GitHub repo URL or live reference site (e.g. connorhyatt.com)..."
              aria-label="Paste any GitHub repo URL or live reference site"
              className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSubmittingCommand}
              aria-label="Launch in AntiSlop Studio"
              className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--sapphire-ice)] disabled:opacity-60"
            >
              {isSubmittingCommand ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--sapphire-ice)]" />
                  <span className="hidden font-mono text-[11px] text-[var(--sapphire-ice)] sm:inline">
                    {commandStatusText || 'Launching…'}
                  </span>
                </>
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
          </form>

          {/* Subtle quick-try hints right under pill */}
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-[12px] text-[var(--ink-muted)]">
            <span>Try live capture:</span>
            {['connorhyatt.com', 'are.na'].map((domain) => (
              <button
                key={domain}
                type="button"
                disabled={isSubmittingCommand}
                onClick={() => {
                  setCommandInput(domain);
                  void onSubmitCommand(domain);
                }}
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--sapphire-ice)] transition-colors hover:border-[var(--sapphire-border)] hover:bg-[var(--sapphire-tint)] disabled:opacity-50"
              >
                {domain}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Floating Sapphire Starter Cards for <1s Launch */}
        <section
          aria-label="Launch a workspace"
          className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {STARTER_CARDS.map((card) => {
            const targetId = resolveStarterWorkspaceId(card, workspaces);
            return (
              <button
                key={card.key}
                type="button"
                disabled={isSubmittingCommand}
                onClick={() => onSelectStarterWorkspace(targetId)}
                className="codewiki-starter-card group flex flex-col justify-between rounded-[20px] p-5 text-left disabled:opacity-60"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] text-[var(--sapphire-ice)]">
                      {card.key === 'novaflow' ? (
                        <Layers className="h-4 w-4" />
                      ) : card.key === 'kova' ? (
                        <ShoppingBag className="h-4 w-4" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${
                        card.badgeTone === 'emerald'
                          ? 'border-[var(--emerald-border)] bg-[var(--emerald-bg)] text-[var(--emerald)]'
                          : 'border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] text-[var(--sapphire-ice)]'
                      }`}
                    >
                      {card.badge}
                    </span>
                  </div>

                  <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.015em] text-[var(--ink-primary)] transition-colors group-hover:text-[var(--sapphire-ice)]">
                    {card.title}
                  </h2>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-muted)]">
                    {card.slug}
                  </div>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--ink-secondary)]">
                    {card.description}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-[12px] font-medium text-[var(--sapphire-ice)]">
                  <span>Launch Studio</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}

          {/* 4th Card: Connect Any GitHub Repo */}
          <button
            type="button"
            disabled={isSubmittingCommand}
            onClick={onOpenRepoModal}
            className="codewiki-starter-card group flex flex-col justify-between rounded-[20px] p-5 text-left disabled:opacity-60"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] text-[var(--sapphire-ice)]">
                  <FolderGit2 className="h-4 w-4" />
                </span>
                <span className="rounded-full border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--sapphire-ice)]">
                  GitHub Live
                </span>
              </div>

              <h2 className="mt-4 flex items-center gap-1.5 text-[16px] font-semibold tracking-[-0.015em] text-[var(--ink-primary)] transition-colors group-hover:text-[var(--sapphire-ice)]">
                <Plus className="h-4 w-4 text-[var(--sapphire-ice)]" />
                <span>Connect Any GitHub Repo</span>
              </h2>
              <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-muted)]">
                REDFOX1899 · 30+ live repos
              </div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--ink-secondary)]">
                Clone &amp; boot any React, Vite, or Next.js frontend live and ship a clean PR.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-[12px] font-medium text-[var(--sapphire-ice)]">
              <span>Browse repositories</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        </section>

        {/* Subtle Verified Empirical Strip at Bottom -> clicks straight into 5-Sigma Arena */}
        <footer className="mt-10 flex w-full justify-center">
          <button
            type="button"
            onClick={onOpenArena}
            className="group inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-5 py-2.5 text-[12px] transition-colors hover:border-[var(--sapphire-border)]"
          >
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--sapphire-ice)]">
              <GeminiSparkleMark className="h-3.5 w-3.5" />
              5-Sigma Verified
            </span>
            <span className="text-[var(--border-strong)]" aria-hidden="true">
              |
            </span>
            <span className="font-mono text-[11.5px] text-[var(--emerald)]">
              100% Pass Rate
            </span>
            <span className="text-[var(--ink-muted)]">·</span>
            <span className="font-mono text-[11.5px] text-[var(--ink-primary)]">
              +85.7 Taste Lift
            </span>
            <span className="text-[var(--ink-muted)]">·</span>
            <span className="font-mono text-[11.5px] text-[var(--ink-primary)]">
              3.9× Faster
            </span>
            <span className="text-[var(--ink-muted)]">·</span>
            <span className="font-mono text-[11.5px] text-[var(--ink-secondary)]">
              0 DOM Defects
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--sapphire-ice)]" />
          </button>
        </footer>
      </main>
    </div>
  );
}
