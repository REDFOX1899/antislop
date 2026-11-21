'use client';

import { useEffect, useState } from 'react';
import type { GitHubRepoSummary } from '@shared/types';
import {
  FolderGit2,
  GitBranch,
  Globe,
  Loader2,
  Lock,
  Search,
  Sparkles,
} from 'lucide-react';
import { connectGitHubRepo, listGitHubRepos } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

interface RepoModalProps {
  open: boolean;
  onClose: () => void;
  onRepoConnected: (payload: {
    workspaceId?: string;
    workspaceName?: string;
    previewUrl?: string;
    repoUrl: string;
  }) => void;
}

export function RepoModal({ open, onClose, onRepoConnected }: RepoModalProps) {
  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualBranch, setManualBranch] = useState('');
  const [connectingUrl, setConnectingUrl] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingRepos(true);
    setReposError(null);
    setConnectError(null);

    listGitHubRepos()
      .then((list) => {
        if (!cancelled) setRepos(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setReposError(
            err instanceof Error
              ? err.message
              : 'Could not list authenticated GitHub repos — you can still paste any public GitHub URL below.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRepos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleConnect = async (repoUrl: string, branch?: string) => {
    const trimmed = repoUrl.trim();
    if (!trimmed) return;
    setConnectingUrl(trimmed);
    setConnectError(null);
    try {
      const res = await connectGitHubRepo(trimmed, branch?.trim() || undefined);
      onRepoConnected({
        workspaceId: res.workspace?.id,
        workspaceName: res.workspace?.name,
        previewUrl: res.previewUrl || res.workspace?.previewUrl,
        repoUrl: trimmed,
      });
      onClose();
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : 'Failed to clone and boot repository.'
      );
    } finally {
      setConnectingUrl(null);
    }
  };

  const filtered = repos.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.fullName.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.language || '').toLowerCase().includes(q)
    );
  });

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      title="Connect Any GitHub Repository"
      subtitle="Clone any real React/Vite/Next frontend repo into AntiSlop’s live preview sandbox, transform it multimodally, and open a clean PR."
      widthClass="w-[min(94vw,680px)]"
    >
      <div className="space-y-5">
        {/* Direct Public GitHub URL Paste */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConnect(manualUrl, manualBranch);
          }}
          className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] p-3.5"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#141413]">
              Paste Any Public GitHub URL
            </span>
            <span className="font-mono text-[9.5px] text-[#64625D]">
              POST /api/github/connect
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              required
              autoFocus
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://github.com/owner/frontend-repo"
              className="flex-1 rounded-md border border-[#E5E1D8] bg-white px-3 py-2 text-[12.5px] text-[#141413] placeholder:text-[#96928A] focus:border-[#141413] focus:outline-none"
            />
            <input
              type="text"
              value={manualBranch}
              onChange={(e) => setManualBranch(e.target.value)}
              placeholder="branch (optional)"
              className="w-full rounded-md border border-[#E5E1D8] bg-white px-3 py-2 font-mono text-[12px] text-[#141413] placeholder:text-[#96928A] focus:border-[#141413] focus:outline-none sm:w-36"
            />
            <button
              type="submit"
              disabled={Boolean(connectingUrl) || !manualUrl.trim()}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-[#E03E2D] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#C53222] disabled:opacity-50"
            >
              {connectingUrl === manualUrl.trim() ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>Clone &amp; Boot</span>
            </button>
          </div>
        </form>

        {connectError && (
          <div className="rounded-md border border-[#E03E2D]/35 bg-[#FDF1EF] px-3 py-2 text-[12px] text-[#E03E2D]">
            {connectError}
          </div>
        )}

        {/* Authenticated User GitHub Repositories */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#64625D]">
              Your GitHub Repositories ({repos.length})
            </span>
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64625D]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter repos…"
                className="w-full rounded-md border border-[#E5E1D8] bg-[#FAF8F4] py-1 pl-8 pr-2.5 text-[11.5px] text-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {loadingRepos ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-[#E5E1D8] py-10 font-mono text-[11.5px] text-[#64625D]">
              <Loader2 className="h-4 w-4 animate-spin text-[#E03E2D]" />
              Fetching repositories via GET /api/github/repos…
            </div>
          ) : reposError ? (
            <div className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] px-4 py-5 text-[12px] text-[#64625D]">
              {reposError}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-[#E5E1D8] bg-[#FAF8F4] px-4 py-6 text-center text-[12px] text-[#64625D]">
              No matching repositories found. Paste any public GitHub URL above.
            </div>
          ) : (
            <div className="studio-scroll max-h-[290px] divide-y divide-[#E5E1D8] overflow-y-auto rounded-lg border border-[#E5E1D8]">
              {filtered.map((repo) => {
                const isBusy = connectingUrl === repo.htmlUrl;
                return (
                  <div
                    key={repo.fullName}
                    className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5 transition-colors hover:bg-[#FAF8F4]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[#141413]" />
                        <span className="truncate text-[12.5px] font-semibold text-[#141413]">
                          {repo.fullName}
                        </span>
                        {repo.private ? (
                          <Lock className="h-3 w-3 shrink-0 text-[#64625D]" />
                        ) : (
                          <Globe className="h-3 w-3 shrink-0 text-[#64625D]" />
                        )}
                      </div>
                      {repo.description && (
                        <p className="mt-0.5 truncate text-[11px] text-[#64625D]">
                          {repo.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-[#64625D]">
                        {repo.language && <span>{repo.language}</span>}
                        <span className="inline-flex items-center gap-0.5">
                          <GitBranch className="h-2.5 w-2.5" />
                          {repo.defaultBranch}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={Boolean(connectingUrl)}
                      onClick={() =>
                        void handleConnect(repo.htmlUrl, repo.defaultBranch)
                      }
                      className="flex shrink-0 items-center gap-1 rounded-md border border-[#141413] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#141413] transition-colors hover:bg-[#141413] hover:text-white disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      <span>{isBusy ? 'Booting…' : 'Connect'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </NativeDialog>
  );
}
