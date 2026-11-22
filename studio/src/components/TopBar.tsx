'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ExecutionSpeedMode, WorkspaceRepoInfo } from '@shared/types';
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronDown,
  FolderGit2,
  GitPullRequest,
  Layers,
  Moon,
  Palette,
  Plug,
  Plus,
  Ruler,
  Scale,
  Search,
  ShieldCheck,
  SwatchBook,
  Sun,
  Zap,
} from 'lucide-react';
import type { StudioTheme } from '@/lib/useTheme';
import { AntiSlopPrismMark, GeminiSparkleMark } from './BrandMarks';

export type StudioTab = 'canvas' | 'arena' | 'managed_agent';

interface TopBarProps {
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  speedMode: ExecutionSpeedMode;
  onSpeedModeChange: (mode: ExecutionSpeedMode) => void;
  workspaces: WorkspaceRepoInfo[];
  activeWorkspaceId: string;
  onSwitchWorkspace: (workspaceId: string) => void;
  switchingWorkspace: boolean;
  onOpenRepoModal: () => void;
  onOpenPr: () => void;
  openingPr: boolean;
  backendHealthy: boolean;
  theme: StudioTheme;
  onToggleTheme: () => void;
  directorOpen: boolean;
  onToggleDirector: () => void;
  onOpenDeepAudit?: () => void;
  onOpenDesignSystem?: () => void;
  onOpenGeometryAudit?: () => void;
  onOpenConversionJudge?: () => void;
  onOpenBrandMemory?: () => void;
  onOpenSanzoMcp?: (tab: 'sanzo' | 'mcp') => void;
  onGoLanding: () => void;
}

const BUILTIN_FALLBACKS: Array<{ id: string; label: string; tag: string }> = [
  { id: 'novaflow-slop', label: 'NovaFlow AI', tag: 'SaaS' },
  { id: 'shopcraft-store', label: 'Kova Goods', tag: 'Store' },
  { id: 'dev-portfolio', label: 'Dev Portfolio', tag: 'Portfolio' },
];

export function formatWorkspaceDisplay(w: WorkspaceRepoInfo): {
  id: string;
  label: string;
  slug: string;
  tag: string;
  isGithub: boolean;
} {
  const lowerId = w.id.toLowerCase();
  const lowerName = w.name.toLowerCase();

  if (w.source === 'github') {
    return {
      id: w.id,
      label: w.name,
      slug: w.repoUrl
        ? w.repoUrl.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '')
        : w.id,
      tag: 'GitHub',
      isGithub: true,
    };
  }
  if (lowerId.includes('portfolio') || lowerName.includes('portfolio')) {
    return {
      id: w.id,
      label: 'Dev Portfolio',
      slug: w.id,
      tag: 'Portfolio',
      isGithub: false,
    };
  }
  if (
    lowerId.includes('shopcraft') ||
    lowerId.includes('kova') ||
    lowerName.includes('kova')
  ) {
    return {
      id: w.id,
      label: 'Kova Goods',
      slug: w.id,
      tag: 'Store',
      isGithub: false,
    };
  }
  if (lowerId.includes('novaflow') || lowerName.includes('novaflow')) {
    return {
      id: w.id,
      label: 'NovaFlow AI',
      slug: w.id,
      tag: 'SaaS',
      isGithub: false,
    };
  }

  return {
    id: w.id,
    label: w.name.replace(/\s*\([^)]*\)\s*/g, '').trim() || w.name,
    slug: w.id,
    tag: 'App',
    isGithub: false,
  };
}

export function TopBar({
  activeTab,
  onTabChange,
  speedMode,
  onSpeedModeChange,
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  switchingWorkspace,
  onOpenRepoModal,
  onOpenPr,
  openingPr,
  backendHealthy,
  theme,
  onToggleTheme,
  directorOpen,
  onToggleDirector,
  onOpenDeepAudit,
  onOpenDesignSystem,
  onOpenGeometryAudit,
  onOpenConversionJudge,
  onOpenBrandMemory,
  onOpenSanzoMcp,
  onGoLanding,
}: TopBarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const displayWorkspaces =
    workspaces.length > 0
      ? workspaces.map(formatWorkspaceDisplay)
      : BUILTIN_FALLBACKS.map((b) => ({ ...b, slug: b.id, isGithub: false }));

  const currentWorkspace =
    displayWorkspaces.find((w) => w.id === activeWorkspaceId) ||
    displayWorkspaces[0];

  useEffect(() => {
    if (!switcherOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [switcherOpen]);

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 bg-[var(--bg-void)] px-4">
      {/* Left: Pure AntiSlop Prism Emblem + Wordmark (returns to Landing Hub) */}
      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        <button
          type="button"
          onClick={onGoLanding}
          title="Back to AntiSlop Launch Hub"
          className="group flex items-center gap-2 rounded-full py-1 pl-0.5 pr-2 transition-colors hover:bg-[var(--bg-subtle)]"
        >
          <AntiSlopPrismMark className="h-[22px] w-[22px] shrink-0" />
          <span className="text-[16px] font-medium tracking-[-0.02em] text-[var(--ink-primary)]">
            AntiSlop
          </span>
          <span
            title={backendHealthy ? 'Backend live' : 'Connecting to backend'}
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              backendHealthy
                ? 'bg-[var(--emerald)]'
                : 'bg-[var(--amber)] animate-studio-pulse'
            }`}
          />
        </button>

        {/* Contextual calm back-link only when viewing secondary Arena / Agent tabs */}
        {activeTab !== 'canvas' && (
          <div className="flex items-center gap-2 text-[12px]">
            <button
              type="button"
              onClick={() => onTabChange('canvas')}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Studio</span>
            </button>
            <span className="text-[var(--ink-muted)]">/</span>
            <span className="font-medium text-[var(--cobalt-ice)]">
              {activeTab === 'arena' ? '5-Sigma Proof' : 'Managed Agent'}
            </span>
          </div>
        )}
      </div>

      {/* Center: ONE Sculptural 340px Code Wiki Repo Pill Switcher */}
      <div
        ref={switcherRef}
        className="relative flex min-w-0 flex-1 justify-center px-2"
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={switcherOpen}
          aria-controls={menuId}
          disabled={switchingWorkspace}
          onClick={() => setSwitcherOpen((v) => !v)}
          className="codewiki-pill flex h-[40px] w-full max-w-[340px] items-center justify-between gap-2 rounded-full px-4 text-left disabled:opacity-60"
        >
          <div className="flex min-w-0 items-center gap-2">
            {currentWorkspace?.isGithub ? (
              <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--cobalt-ice)]" />
            ) : (
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
            )}
            <span className="truncate text-[13px] font-medium text-[var(--ink-primary)]">
              {currentWorkspace?.label || 'NovaFlow AI'}
            </span>
            <span className="hidden truncate font-mono text-[11px] text-[var(--ink-muted)] sm:inline">
              · {currentWorkspace?.slug || 'novaflow-slop'}
            </span>
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)] transition-transform ${
              switcherOpen ? 'rotate-180 text-[var(--cobalt-ice)]' : ''
            }`}
          />
        </button>

        {switcherOpen && (
          <div
            id={menuId}
            role="menu"
            aria-label="Switch active repository workspace"
            className="absolute top-[48px] z-50 w-full max-w-[340px] overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-1.5 shadow-[var(--shadow-float)]"
          >
            <div className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              Workspaces
            </div>
            <div className="space-y-0.5">
              {displayWorkspaces.map((ws) => {
                const isActive = ws.id === currentWorkspace?.id;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSwitcherOpen(false);
                      onSwitchWorkspace(ws.id);
                      if (activeTab !== 'canvas') onTabChange('canvas');
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      isActive
                        ? 'bg-[var(--cobalt-tint)] text-[var(--ink-primary)]'
                        : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {ws.isGithub ? (
                        <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--cobalt-ice)]" />
                      ) : (
                        <Layers className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-[var(--ink-primary)]">
                          {ws.label}
                        </div>
                        <div className="truncate font-mono text-[10.5px] text-[var(--ink-muted)]">
                          {ws.slug}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                        {ws.tag}
                      </span>
                      {isActive && (
                        <Check className="h-3.5 w-3.5 text-[var(--cobalt-ice)]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <hr className="my-1.5 border-[var(--border-subtle)]" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSwitcherOpen(false);
                onOpenRepoModal();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-[var(--cobalt-ice)] transition-colors hover:bg-[var(--cobalt-tint)]"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>Connect GitHub Repo</span>
            </button>
          </div>
        )}
      </div>

      {/* Right: ONLY 4 Ultra-Calm Controls (Zero Header Clutter!) */}
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        {/* 1. Compact Segmented Speed Pill: ⚡ Fast | Deep 4× */}
        <div
          role="group"
          aria-label="Execution speed mode"
          className="flex h-[34px] shrink-0 items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5"
        >
          <button
            type="button"
            onClick={() => onSpeedModeChange('fast_demo')}
            title="Fast Demo (~35s single pass)"
            className={`inline-flex h-[28px] items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium transition-colors whitespace-nowrap ${
              speedMode === 'fast_demo'
                ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Zap className="h-3 w-3 shrink-0" />
            <span>Fast</span>
          </button>
          <button
            type="button"
            onClick={() => onSpeedModeChange('deep_atelier')}
            title="Deep Atelier 4× parallel racing + Gemini 4 Carbon High Thinking"
            className={`inline-flex h-[28px] items-center rounded-full px-2.5 text-[11.5px] font-medium transition-colors whitespace-nowrap ${
              speedMode === 'deep_atelier'
                ? 'bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <span>Deep 4×</span>
          </button>
        </div>

        {/* 2. Clean 900-Probe Decisions API X-Ray Trigger */}
        {onOpenDeepAudit && (
          <button
            type="button"
            onClick={onOpenDeepAudit}
            title="Run 900-Probe / 1,800-Sharded Decisions API Spatial X-Ray Audit"
            className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-3 text-[11.5px] font-medium text-[var(--emerald)] transition-colors hover:brightness-110 whitespace-nowrap"
          >
            <Activity className="h-3.5 w-3.5 shrink-0" />
            <span>900 Probes</span>
          </button>
        )}

        {/* 2b. OKLCH + APCA Color Kernel & Token Compiler */}
        {onOpenDesignSystem && (
          <button
            type="button"
            onClick={onOpenDesignSystem}
            title="Open OKLCH + APCA Color Kernel, 12-Step Scales & W3C Token Compiler"
            className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] px-3 text-[11.5px] font-medium text-[var(--cobalt-ice)] transition-colors hover:brightness-110 whitespace-nowrap"
          >
            <Palette className="h-3.5 w-3.5 shrink-0" />
            <span>Color Kernel</span>
          </button>
        )}

        {/* 2c. Computed-DOM Geometry & A11y Audit */}
        {onOpenGeometryAudit && (
          <button
            type="button"
            onClick={onOpenGeometryAudit}
            title="Run Deterministic Computed-DOM Geometry, APCA Contrast & A11y Audit"
            className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-3 text-[11.5px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--border-strong)] whitespace-nowrap"
          >
            <Ruler className="h-3.5 w-3.5 shrink-0 text-[var(--amber)]" />
            <span>DOM Audit</span>
          </button>
        )}

        {/* 2d. Conversion x Taste & Blind Pairwise A/B Judge */}
        {onOpenConversionJudge && (
          <button
            type="button"
            onClick={onOpenConversionJudge}
            title="Conversion Readiness x Taste Quadrant & Blind Bradley-Terry A/B Judge"
            className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-2.5 text-[11.5px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--border-strong)] whitespace-nowrap"
          >
            <Scale className="h-3.5 w-3.5 shrink-0 text-[var(--cobalt-bright)]" />
            <span>A/B Judge</span>
          </button>
        )}

        {/* 2e. Brand Memory & Active Design Skills */}
        {onOpenBrandMemory && (
          <button
            type="button"
            onClick={onOpenBrandMemory}
            title="Lock Persistent Brand DNA Tokens & Toggle Mounted Design Skills"
            className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-2.5 text-[11.5px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--border-strong)] whitespace-nowrap"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--emerald)]" />
            <span>Brand DNA</span>
          </button>
        )}

        {/* 2f. Sanzo Wada 348 Color Dictionary & Remote MCP */}
        {onOpenSanzoMcp && (
          <>
            <button
              type="button"
              onClick={() => onOpenSanzoMcp('sanzo')}
              title="Browse all 348 Sanzo Wada (1933) Japanese Color Combinations"
              className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] px-2.5 text-[11.5px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--border-strong)] whitespace-nowrap"
            >
              <SwatchBook className="h-3.5 w-3.5 shrink-0 text-[var(--vermilion)]" />
              <span>Sanzo 348</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSanzoMcp('mcp')}
              title="Connect external AI coding agents via Remote Streamable HTTP MCP"
              className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] px-2.5 text-[11.5px] font-medium text-[var(--cobalt-ice)] transition-colors hover:brightness-110 whitespace-nowrap"
            >
              <Plug className="h-3.5 w-3.5 shrink-0" />
              <span>MCP</span>
            </button>
          </>
        )}

        {/* 3. Clean Circle Theme Toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={
            theme === 'dark' ? 'Switch to Light Paper theme' : 'Switch to Obsidian Dark theme'
          }
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
        >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>

        {/* 3. Clean Subtle Share / PR Pill */}
        <button
          type="button"
          disabled={openingPr}
          onClick={onOpenPr}
          title="Commit active transformation and open a real GitHub Pull Request"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 text-[12px] font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)] disabled:opacity-50 whitespace-nowrap"
        >
          <GitPullRequest className="h-3.5 w-3.5 shrink-0" />
          <span>{openingPr ? 'Opening…' : 'Share / PR'}</span>
        </button>

        {/* 4. Exact Code Wiki Cobalt-Outlined ✦ Direct Pill */}
        <button
          type="button"
          onClick={() => {
            if (activeTab !== 'canvas') {
              onTabChange('canvas');
              if (!directorOpen) onToggleDirector();
              return;
            }
            onToggleDirector();
          }}
          title={directorOpen ? 'Hide Gemini Director panel' : 'Open Gemini Director panel'}
          className={`inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium whitespace-nowrap ${
            directorOpen && activeTab === 'canvas'
              ? 'cobalt-direct-pill'
              : 'border border-[var(--cobalt-border)] bg-transparent text-[var(--cobalt-ice)] transition-colors hover:bg-[var(--cobalt-tint)]'
          }`}
        >
          <GeminiSparkleMark className="h-3.5 w-3.5 shrink-0" />
          <span>Direct</span>
        </button>
      </div>
    </header>
  );
}
