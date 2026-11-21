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
    <div className="studio-scroll flex-1 overflow-y-auto bg-[#F5F3EE] p-6">
      <div className="mx-auto max-w-[1160px] space-y-5">
        {/* Editorial Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E5E1D8] pb-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#64625D]">
              <span>Bonus Track · Managed Agents</span>
              <span>·</span>
              <span>antigravity-preview-09-2026 (v1beta)</span>
            </div>
            <h1 className="mt-1 font-serif text-[34px] leading-none tracking-[-0.02em] text-[#141413]">
              Ship Verified Taste via Remote Linux Sandbox
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] text-[#64625D]">
              Dispatches our custom named agent (
              <span className="font-mono text-[12px] text-[#141413]">
                antislop-repo-surgeon
              </span>
              ) in a Google-hosted remote Linux environment to apply your
              verified Design Manifest, enforce{' '}
              <span className="font-mono text-[12px] text-[#141413]">
                npm run build
              </span>{' '}
              exit-0 verification, and open a real GitHub Pull Request.
            </p>
          </div>

          <button
            type="button"
            disabled={openingPr}
            onClick={onOpenPr}
            className="flex items-center gap-2 rounded-[7px] bg-[#141413] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#2A2A28] disabled:opacity-50"
          >
            {openingPr ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitPullRequest className="h-4 w-4" />
            )}
            <span>1-Click Open GitHub PR</span>
          </button>
        </div>

        {/* Configuration + Manifest Verification Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left 5 cols: Launch Configuration */}
          <div className="space-y-4 rounded-xl border border-[#E5E1D8] bg-white p-5 lg:col-span-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#64625D]">
                Remote Agent Target
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-[#E5E1D8] bg-[#FAF8F4] px-2 py-0.5 font-mono text-[9.5px] text-[#141413]">
                <Server className="h-3 w-3 text-[#E03E2D]" />
                environment: remote
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="managed-repo-url"
                  className="mb-1 block text-[11.5px] font-medium text-[#141413]"
                >
                  GitHub Repository URL
                </label>
                <input
                  id="managed-repo-url"
                  type="url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-3 py-2 font-mono text-[12px] text-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="managed-repo-branch"
                  className="mb-1 block text-[11.5px] font-medium text-[#141413]"
                >
                  Base Branch
                </label>
                <input
                  id="managed-repo-branch"
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full rounded-md border border-[#E5E1D8] bg-[#FAF8F4] px-3 py-2 font-mono text-[12px] text-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] px-3 py-2.5">
                <div>
                  <div className="text-[12px] font-medium text-[#141413]">
                    Deterministic Build Verification Hook
                  </div>
                  <div className="font-mono text-[10px] text-[#64625D]">
                    Require `npm run build` exit code 0 before completion
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={runBuildHook}
                  onChange={(e) => setRunBuildHook(e.target.checked)}
                  className="h-4 w-4 accent-[#15803D]"
                />
              </label>
            </div>

            {/* Verified Payload Status */}
            <div className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] p-3">
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-[#64625D]">
                Verified Payload to Ship
              </div>
              {manifest && scorecard ? (
                <div className="mt-1.5 space-y-1">
                  <div className="font-serif text-[19px] leading-tight text-[#141413]">
                    {manifest.vibeTitle}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
                    <span className="text-[#15803D]">
                      Taste {Math.round(scorecard.overallTasteScore)}/100
                    </span>
                    <span className="text-[#64625D]">·</span>
                    <span>
                      Slop {scorecard.metrics.slopPenalty.value.toFixed(1)}/10
                    </span>
                    <span className="text-[#64625D]">·</span>
                    <span>
                      Match {scorecard.metrics.aestheticMatch.value.toFixed(1)}/10
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-[11.5px] text-[#B45309]">
                  No active Design Manifest yet — run a transformation in Studio
                  Canvas first.
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-[#E03E2D]/35 bg-[#FDF1EF] px-3 py-2 text-[11.5px] text-[#E03E2D]">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={shipping || !repoUrl.trim()}
              onClick={() => void handleLaunchShip()}
              className="flex w-full items-center justify-center gap-2 rounded-[7px] bg-[#E03E2D] px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#C53222] disabled:opacity-50"
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

            {/* Resulting GitHub PR Confirmation Card */}
            {lastPr && (
              <div className="rounded-lg border border-[#15803D]/35 bg-[#EEF8F1] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[#15803D]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    PR #{lastPr.prNumber} OPENED
                  </span>
                  <a
                    href={lastPr.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-[#141413] underline"
                  >
                    View on GitHub
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="mt-1 font-mono text-[10px] text-[#64625D]">
                  branch: {lastPr.branchName} · sha:{' '}
                  {lastPr.commitSha.slice(0, 7)} · {lastPr.filesChanged.length}{' '}
                  files
                </div>
              </div>
            )}
          </div>

          {/* Right 7 cols: Live Remote Linux Sandbox Stream */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-[#141413] bg-[#141413] text-[#F5F3EE] lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-[#E03E2D]" />
                <span className="font-mono text-[11px] font-semibold tracking-wider text-white">
                  antislop-repo-surgeon · REMOTE LINUX SANDBOX
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono text-[10px]">
                {environmentId && (
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[#D8D2C5]">
                    env: {environmentId.slice(0, 14)}
                  </span>
                )}
                {buildPassed === true && (
                  <span className="inline-flex items-center gap-1 rounded bg-[#15803D] px-2 py-0.5 font-semibold text-white">
                    <ShieldCheck className="h-3 w-3" />
                    npm run build · EXIT 0
                  </span>
                )}
                {buildPassed === false && (
                  <span className="inline-flex items-center gap-1 rounded bg-[#E03E2D] px-2 py-0.5 font-semibold text-white">
                    <XCircle className="h-3 w-3" />
                    BUILD FAILED
                  </span>
                )}
              </div>
            </div>

            <div className="studio-scroll min-h-[380px] max-h-[520px] flex-1 space-y-2 overflow-y-auto p-4 font-mono text-[11.5px] leading-relaxed">
              {events.length === 0 && !shipping ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-[#96928A]">
                  <Terminal className="mb-2 h-6 w-6 text-[#64625D]" />
                  <p>
                    Ready to provision remote Linux sandbox via{' '}
                    <span className="text-white">POST /api/managed-agent/ship</span>
                  </p>
                  <p className="mt-1 text-[10.5px]">
                    Streams live agent steps, file patches, and deterministic build
                    verification gates.
                  </p>
                </div>
              ) : (
                events.map((ev, idx) => (
                  <div
                    key={`${ev.timestamp}-${idx}`}
                    className="rounded border border-white/10 bg-white/[0.04] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span
                        className={`font-semibold uppercase tracking-wider ${
                          ev.type === 'completed' || ev.type === 'hook_verify'
                            ? 'text-[#4ADE80]'
                            : ev.type === 'error'
                            ? 'text-[#F87171]'
                            : 'text-[#FBBF24]'
                        }`}
                      >
                        [{ev.type}]
                      </span>
                      <span className="text-[#96928A]">
                        {new Date(ev.timestamp).toLocaleTimeString([], {
                          hour12: false,
                        })}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[#F5F3EE]">
                      {ev.message}
                    </p>
                    {ev.detail && Object.keys(ev.detail).length > 0 && (
                      <pre className="mt-1.5 overflow-x-auto rounded bg-black/40 p-2 text-[10px] text-[#C8C3B8]">
                        {JSON.stringify(ev.detail, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
              {summary && (
                <div className="rounded border border-[#4ADE80]/30 bg-[#15803D]/20 px-3 py-2 text-[#DCFCE7]">
                  <strong className="uppercase">Final Summary: </strong>
                  {summary}
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>

            {interactionId && (
              <div className="border-t border-white/10 bg-black/30 px-4 py-2 font-mono text-[10px] text-[#96928A]">
                interaction_id: {interactionId}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
