'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  DecisionsScorecard,
  DesignManifest,
  GitHubPrResponse,
  ManagedAgentEvent,
} from '@shared/types';
import {
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  Loader2,
  Play,
  Server,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { shipViaManagedAgent } from '@/lib/api';

interface ManagedAgentPanelProps {
  defaultRepoUrl?: string;
  defaultBranch?: string;
  manifest?: DesignManifest;
  scorecard?: DecisionsScorecard;
  lastPr: GitHubPrResponse | null;
  openingPr: boolean;
  onOpenPr: () => void;
}

export function ManagedAgentPanel({
  defaultRepoUrl,
  defaultBranch,
  manifest,
  scorecard,
  lastPr,
  openingPr,
  onOpenPr,
}: ManagedAgentPanelProps) {
  const [repoUrl, setRepoUrl] = useState(
    defaultRepoUrl || 'https://github.com/Shantanu0119/antislop'
  );
  const [branch, setBranch] = useState(defaultBranch || 'main');
  const [runBuildHook, setRunBuildHook] = useState(true);
  const [shipping, setShipping] = useState(false);
  const [events, setEvents] = useState<ManagedAgentEvent[]>([]);
  const [environmentId, setEnvironmentId] = useState<string | undefined>();
  const [interactionId, setInteractionId] = useState<string | undefined>();
  const [buildPassed, setBuildPassed] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (defaultRepoUrl) setRepoUrl(defaultRepoUrl);
  }, [defaultRepoUrl]);

  useEffect(() => {
    if (defaultBranch) setBranch(defaultBranch);
  }, [defaultBranch]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const handleLaunchShip = async () => {
    setError(null);
    setSummary(null);
    setBuildPassed(null);
    setEvents([]);
    setEnvironmentId(undefined);
    setInteractionId(undefined);

    if (!manifest || !scorecard) {
      setError(
        'Run at least one AntiSlop transform on the Studio Canvas first so a verified DesignManifest & Decisions API Scorecard exist to ship.'
      );
      return;
    }

    setShipping(true);
    try {
      const res = await shipViaManagedAgent(
        {
          repoUrl: repoUrl.trim(),
          branch: branch.trim() || undefined,
          manifest,
          scorecard,
          runBuildHook,
        },
        (ev) => {
          setEvents((prev) => [...prev, ev]);
          if (ev.environmentId) setEnvironmentId(ev.environmentId);
          if (ev.interactionId) setInteractionId(ev.interactionId);
          if (ev.type === 'hook_verify' && typeof ev.detail?.passed === 'boolean') {
            setBuildPassed(Boolean(ev.detail.passed));
          }
          if (ev.type === 'completed') {
            if (typeof ev.detail?.buildPassed === 'boolean') {
              setBuildPassed(Boolean(ev.detail.buildPassed));
            }
          }
        }
      );

      if (res.environmentId) setEnvironmentId(res.environmentId);
      if (res.interactionId) setInteractionId(res.interactionId);
      if (typeof res.buildPassed === 'boolean') setBuildPassed(res.buildPassed);
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Managed agent run failed.'
      );
    } finally {
      setShipping(false);
    }
  };

  return (
    <div className="studio-scroll flex-1 overflow-y-auto bg-[var(--bg-void)] px-5 pb-8 pt-4">
      <div className="mx-auto max-w-[1160px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--sapphire-ice)]">
              <span>Bonus Track · Managed Agents</span>
              <span>·</span>
              <span>antigravity-preview-09-2026 (v1beta)</span>
            </div>
            <h1 className="mt-1.5 text-[30px] font-medium leading-tight tracking-[-0.025em] text-[var(--ink-primary)]">
              Ship Verified Taste via Remote Linux Sandbox
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] text-[var(--ink-secondary)]">
              Dispatches our custom named agent (
              <span className="font-mono text-[12px] text-[var(--sapphire-ice)]">
                antislop-repo-surgeon
              </span>
              ) in a Google-hosted remote Linux environment to apply your
              verified Design Manifest, enforce{' '}
              <span className="font-mono text-[12px] text-[var(--sapphire-ice)]">
                npm run build
              </span>{' '}
              exit-0 verification, and open a real GitHub Pull Request.
            </p>
          </div>

          <button
            type="button"
            disabled={openingPr}
            onClick={onOpenPr}
            className="flex items-center gap-2 rounded-full border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] px-4 py-2 text-[12.5px] font-semibold text-[var(--sapphire-ice)] transition-colors hover:bg-[var(--sapphire-soft)] disabled:opacity-50"
          >
            {openingPr ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitPullRequest className="h-4 w-4" />
            )}
            <span>1-Click Open GitHub PR</span>
          </button>
        </div>

        {/* Configuration + Remote Linux Sandbox Stream */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left 5 cols: Launch Configuration */}
          <div className="space-y-4 rounded-[16px] border border-[var(--border-card)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)] lg:col-span-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                Remote Agent Target
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sapphire-border)] bg-[var(--sapphire-tint)] px-2.5 py-0.5 font-mono text-[9.5px] text-[var(--sapphire-ice)]">
                <Server className="h-3 w-3" />
                environment: remote
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="managed-repo-url"
                  className="mb-1.5 block text-[12px] font-medium text-[var(--ink-primary)]"
                >
                  GitHub Repository URL
                </label>
                <input
                  id="managed-repo-url"
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-3.5 py-2 font-mono text-[12px] text-[var(--ink-primary)] focus:border-[var(--border-pill-focus)] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="managed-repo-branch"
                  className="mb-1.5 block text-[12px] font-medium text-[var(--ink-primary)]"
                >
                  Base Branch
                </label>
                <input
                  id="managed-repo-branch"
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-3.5 py-2 font-mono text-[12px] text-[var(--ink-primary)] focus:border-[var(--border-pill-focus)] focus:outline-none"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-3.5 py-2.5">
                <div>
                  <div className="text-[12px] font-medium text-[var(--ink-primary)]">
                    Deterministic Build Verification Hook
                  </div>
                  <div className="font-mono text-[10px] text-[var(--ink-muted)]">
                    Require `npm run build` exit code 0 before completion
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={runBuildHook}
                  onChange={(e) => setRunBuildHook(e.target.checked)}
                  className="h-4 w-4 accent-[var(--emerald)]"
                />
              </label>
            </div>

            {/* Verified Payload Status */}
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] p-3.5">
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Verified Payload to Ship
              </div>
              {manifest && scorecard ? (
                <div className="mt-1.5 space-y-1">
                  <div className="font-serif text-[20px] leading-tight text-[var(--ink-primary)]">
                    {manifest.vibeTitle}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
                    <span className="text-[var(--emerald)]">
                      Taste {Math.round(scorecard.overallTasteScore)}/100
                    </span>
                    <span className="text-[var(--ink-muted)]">·</span>
                    <span className="text-[var(--ink-secondary)]">
                      Slop {scorecard.metrics.slopPenalty.value.toFixed(1)}/10
                    </span>
                    <span className="text-[var(--ink-muted)]">·</span>
                    <span className="text-[var(--ink-secondary)]">
                      Match {scorecard.metrics.aestheticMatch.value.toFixed(1)}/10
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-[11.5px] text-[var(--amber)]">
                  No active Design Manifest yet — run a transformation in Studio
                  Canvas first.
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-3.5 py-2 text-[11.5px] text-[var(--vermilion)]">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={shipping || !repoUrl.trim()}
              onClick={() => void handleLaunchShip()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--btn-primary-ink)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:opacity-50"
            >
              {shipping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Streaming Remote Linux Sandbox…</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Launch Antigravity Managed Agent</span>
                </>
              )}
            </button>

            {lastPr && (
              <div className="rounded-xl border border-[var(--emerald-border)] bg-[var(--emerald-bg)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[var(--emerald)]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    PR #{lastPr.prNumber} OPENED
                  </span>
                  <a
                    href={lastPr.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[var(--ink-primary)] underline"
                  >
                    View on GitHub
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="mt-1 font-mono text-[10px] text-[var(--ink-secondary)]">
                  branch: {lastPr.branchName} · sha:{' '}
                  {lastPr.commitSha.slice(0, 7)} · {lastPr.filesChanged.length}{' '}
                  files
                </div>
              </div>
            )}
          </div>

          {/* Right 7 cols: Live Remote Linux Sandbox Stream */}
          <div className="flex flex-col overflow-hidden rounded-[16px] border border-[var(--border-card)] bg-[#080A0F] text-[#F1F3F4] shadow-[var(--shadow-card)] lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-[#8AB4F8]" />
                <span className="font-mono text-[11px] font-semibold tracking-wider text-[#F1F3F4]">
                  antislop-repo-surgeon · REMOTE LINUX SANDBOX
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono text-[10px]">
                {environmentId && (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[#9AA0A6]">
                    env: {environmentId.slice(0, 14)}
                  </span>
                )}
                {buildPassed === true && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#34D399]/20 px-2.5 py-0.5 font-semibold text-[#34D399] ring-1 ring-[#34D399]/40">
                    <ShieldCheck className="h-3 w-3" />
                    npm run build · EXIT 0
                  </span>
                )}
                {buildPassed === false && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FF5A4F]/20 px-2.5 py-0.5 font-semibold text-[#FF5A4F] ring-1 ring-[#FF5A4F]/40">
                    <XCircle className="h-3 w-3" />
                    BUILD FAILED
                  </span>
                )}
              </div>
            </div>

            <div className="studio-scroll min-h-[380px] max-h-[520px] flex-1 space-y-2 overflow-y-auto p-4 font-mono text-[11.5px] leading-relaxed">
              {events.length === 0 && !shipping ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-[#9AA0A6]">
                  <Terminal className="mb-2 h-6 w-6 text-[#4285F4]" />
                  <p>
                    Ready to provision remote Linux sandbox via{' '}
                    <span className="text-[#F1F3F4]">POST /api/managed-agent/ship</span>
                  </p>
                  <p className="mt-1 text-[10.5px] text-[#70757A]">
                    Streams live agent steps, file patches, and deterministic build
                    verification gates.
                  </p>
                </div>
              ) : (
                events.map((ev, idx) => (
                  <div
                    key={`${ev.timestamp}-${idx}`}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span
                        className={`font-semibold uppercase tracking-wider ${
                          ev.type === 'completed' || ev.type === 'hook_verify'
                            ? 'text-[#34D399]'
                            : ev.type === 'error'
                            ? 'text-[#FF5A4F]'
                            : 'text-[#8AB4F8]'
                        }`}
                      >
                        [{ev.type}]
                      </span>
                      <span className="text-[#70757A]">
                        {new Date(ev.timestamp).toLocaleTimeString([], {
                          hour12: false,
                        })}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[#F1F3F4]">
                      {ev.message}
                    </p>
                    {ev.detail && Object.keys(ev.detail).length > 0 && (
                      <pre className="mt-1.5 overflow-x-auto rounded-lg bg-black/50 p-2 text-[10px] text-[#9AA0A6]">
                        {JSON.stringify(ev.detail, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
              {summary && (
                <div className="rounded-xl border border-[#34D399]/35 bg-[#34D399]/10 px-3 py-2 text-[#D1FAE5]">
                  <strong className="uppercase">Final Summary: </strong>
                  {summary}
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>

            {interactionId && (
              <div className="border-t border-white/10 bg-black/40 px-4 py-2 font-mono text-[10px] text-[#70757A]">
                interaction_id: {interactionId}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
