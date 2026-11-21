'use client';

import type { ExecutionSpeedMode, WorkspaceRepoInfo } from '@shared/types';
import {
  Brain,
  FolderGit2,
  GitPullRequest,
  Layers,
  Plus,
  RotateCcw,
  Terminal,
  Zap,
  FlaskConical,
} from 'lucide-react';

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
  onResetBaseline: () => void;
  resettingBaseline: boolean;
  onOpenPr: () => void;
  openingPr: boolean;
  backendHealthy: boolean;
}

const BUILTIN_FALLBACKS: Array<{ id: string; label: string; tag: string }> = [
  { id: 'novaflow-slop', label: 'NovaFlow AI', tag: 'SaaS' },
  { id: 'shopcraft-store', label: 'Kova Goods', tag: 'Store' },
  { id: 'dev-portfolio', label: 'Dev Portfolio', tag: 'Portfolio' },
];

function formatWorkspaceDisplay(w: WorkspaceRepoInfo): {
  id: string;
  label: string;
  tag: string;
  isGithub: boolean;
} {
  const lowerId = w.id.toLowerCase();
  const lowerName = w.name.toLowerCase();

  if (w.source === 'github') {
    return {
      id: w.id,
      label: w.name,
      tag: 'GitHub',
      isGithub: true,
    };
  }
  if (lowerId.includes('portfolio') || lowerName.includes('portfolio')) {
    return {
      id: w.id,
      label: 'Dev Portfolio',
      tag: 'Portfolio',
      isGithub: false,
    };
  }
  if (lowerId.includes('shopcraft') || lowerId.includes('kova') || lowerName.includes('kova')) {
    return {
      id: w.id,
      label: 'Kova Goods',
      tag: 'Store',
      isGithub: false,
    };
  }
  if (lowerId.includes('novaflow') || lowerName.includes('novaflow')) {
    return {
      id: w.id,
      label: 'NovaFlow AI',
      tag: 'SaaS',
      isGithub: false,
    };
  }

  return {
    id: w.id,
    label: w.name.replace(/\s*\([^)]*\)\s*/g, '').trim() || w.name,
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
  onResetBaseline,
  resettingBaseline,
  onOpenPr,
  openingPr,
  backendHealthy,
}: TopBarProps) {
  const displayWorkspaces =
    workspaces.length > 0
      ? workspaces.map(formatWorkspaceDisplay)
      : BUILTIN_FALLBACKS.map((b) => ({ ...b, isGithub: false }));

  // Keep all 3 built-ins + any active/latest connected GitHub repos cleanly visible
  const visibleWorkspaces =
    displayWorkspaces.length <= 4
      ? displayWorkspaces
      : [
          ...displayWorkspaces.filter((w) => !w.isGithub).slice(0, 3),
          ...displayWorkspaces.filter((w) => w.isGithub).slice(-2),
        ];

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-[#E5E1D8] bg-[#FFFFFF] px-3">
      {/* Left: Editorial Wordmark + Target Repo Switcher */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2 pr-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-[#141413] text-[#F5F3EE]">
            <span className="font-serif text-[17px] leading-none italic">A</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[21px] leading-none tracking-[-0.02em] text-[#141413]">
              AntiSlop
            </span>
            <span className="hidden items-center gap-1 rounded border border-[#E5E1D8] bg-[#F5F3EE] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#64625D] xl:inline-flex">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  backendHealthy ? 'bg-[#15803D]' : 'bg-[#B45309] animate-studio-pulse'
                }`}
              />
              antislop.live
            </span>
          </div>
        </div>

        <div className="h-5 w-px bg-[#E5E1D8]" />

        {/* Target Repo Switcher */}
        <div className="flex items-center gap-0.5 rounded-[7px] border border-[#E5E1D8] bg-[#F5F3EE] p-0.5">
          {visibleWorkspaces.map((ws) => {
            const isActive =
              activeWorkspaceId === ws.id ||
              (!activeWorkspaceId && ws.id === visibleWorkspaces[0]?.id);
            return (
              <button
                key={ws.id}
                type="button"
                disabled={switchingWorkspace}
                onClick={() => onSwitchWorkspace(ws.id)}
                className={`flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-all ${
                  isActive
                    ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.06)] ring-1 ring-[#E5E1D8]'
                    : 'text-[#64625D] hover:text-[#141413]'
                }`}
                title={`Switch target workspace to ${ws.label}`}
              >
                {ws.isGithub && <FolderGit2 className="h-3 w-3 shrink-0 text-[#E03E2D]" />}
                <span className="max-w-[96px] truncate">{ws.label}</span>
                <span className="hidden font-mono text-[9px] uppercase tracking-wider text-[#64625D] 2xl:inline">
                  {ws.tag}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onOpenRepoModal}
            className="flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-medium text-[#141413] transition-colors hover:bg-white"
            title="Connect your GitHub repository or paste any public GitHub URL"
          >
            <Plus className="h-3 w-3 text-[#E03E2D]" />
            <span className="hidden xl:inline">GitHub</span>
          </button>
        </div>
      </div>

      {/* Center: Studio View Tabs */}
      <nav
        aria-label="Studio workspace views"
        className="flex items-center gap-0.5 rounded-[7px] border border-[#E5E1D8] bg-[#F5F3EE] p-0.5"
      >
        <button
          type="button"
          onClick={() => onTabChange('canvas')}
          className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-all ${
            activeTab === 'canvas'
              ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.06)] ring-1 ring-[#E5E1D8]'
              : 'text-[#64625D] hover:text-[#141413]'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Studio Canvas</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('arena')}
          className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-all ${
            activeTab === 'arena'
              ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.06)] ring-1 ring-[#E5E1D8]'
              : 'text-[#64625D] hover:text-[#141413]'
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5" />
          <span>5-Sigma Arena</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('managed_agent')}
          className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-all ${
            activeTab === 'managed_agent'
              ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.06)] ring-1 ring-[#E5E1D8]'
              : 'text-[#64625D] hover:text-[#141413]'
          }`}
        >
          <Terminal className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Ship via Managed Agent</span>
          <span className="lg:hidden">Agent Ship</span>
        </button>
      </nav>

      {/* Right: Speed Mode Pill Switcher + Reset Baseline + Open PR */}
      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label="Execution speed mode"
          className="flex items-center rounded-[7px] border border-[#E5E1D8] bg-[#F5F3EE] p-0.5"
        >
          <button
            type="button"
            onClick={() => onSpeedModeChange('fast_demo')}
            className={`flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-all ${
              speedMode === 'fast_demo'
                ? 'bg-[#141413] text-white'
                : 'text-[#64625D] hover:text-[#141413]'
            }`}
            title="Single fast pass (<25s) optimized for live judging"
          >
            <Zap
              className={`h-3 w-3 ${
                speedMode === 'fast_demo' ? 'text-[#E03E2D]' : 'text-[#64625D]'
              }`}
            />
            <span>Fast Demo</span>
            <span className="hidden font-mono text-[9.5px] opacity-75 xl:inline">
              &lt;25s
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSpeedModeChange('deep_atelier')}
            className={`flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-all ${
              speedMode === 'deep_atelier'
                ? 'bg-[#141413] text-white'
                : 'text-[#64625D] hover:text-[#141413]'
            }`}
            title="Tier 3 4x Parallel Racing + Gemini 4 Carbon High Thinking + Nano Banana 2.1"
          >
            <Brain className="h-3 w-3" />
            <span>Deep Atelier</span>
            <span className="hidden font-mono text-[9.5px] opacity-75 xl:inline">
              4×
            </span>
          </button>
        </div>

        <button
          type="button"
          disabled={resettingBaseline}
          onClick={onResetBaseline}
          className="flex items-center gap-1.5 rounded-[6px] border border-[#E5E1D8] bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-[#141413] transition-colors hover:border-[#141413] hover:bg-[#FAF8F4] disabled:opacity-50"
          title="Reset target app back to original AI Slop baseline"
        >
          <RotateCcw
            className={`h-3.5 w-3.5 text-[#64625D] ${
              resettingBaseline ? 'animate-spin' : ''
            }`}
          />
          <span className="hidden xl:inline">Reset Baseline</span>
        </button>

        <button
          type="button"
          disabled={openingPr}
          onClick={onOpenPr}
          className="flex items-center gap-1.5 rounded-[6px] border border-[#141413] bg-[#141413] px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-[#2A2A28] disabled:opacity-50"
          title="Commit active transformation and open a real GitHub Pull Request"
        >
          <GitPullRequest className="h-3.5 w-3.5 text-[#F5F3EE]" />
          <span>{openingPr ? 'Opening…' : 'Open PR'}</span>
        </button>
      </div>
    </header>
  );
}
