'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Check,
  Code2,
  Copy,
  FileCode2,
  GitCompareArrows,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { getWorkspaceFiles, type WorkspaceFilesResponse } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

export interface CodeDiffModalProps {
  open: boolean;
  onClose: () => void;
  workspaceSlug?: string;
  reloadNonce?: number;
}

type ModalTab = 'diff' | 'files';

interface ParsedDiffLine {
  kind: 'file-header' | 'hunk' | 'add' | 'del' | 'context';
  raw: string;
  sign: string;
  content: string;
  oldLine?: number;
  newLine?: number;
}

const PREFERRED_ENTRY_FILES = [
  'src/App.tsx',
  'src/app/page.tsx',
  'index.html',
  'app.js',
  'styles.css',
  'src/index.css',
  'src/App.css',
];

function parseUnifiedDiff(diffText: string): {
  lines: ParsedDiffLine[];
  additions: number;
  deletions: number;
  changedFiles: string[];
} {
  if (!diffText.trim()) {
    return { lines: [], additions: 0, deletions: 0, changedFiles: [] };
  }

  const rawLines = diffText.replace(/\r\n/g, '\n').split('\n');
  const lines: ParsedDiffLine[] = [];
  const changedSet = new Set<string>();
  let additions = 0;
  let deletions = 0;
  let oldNum: number | null = null;
  let newNum: number | null = null;

  for (const raw of rawLines) {
    if (
      raw.startsWith('diff --git ') ||
      raw.startsWith('index ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ')
    ) {
      if (raw.startsWith('+++ ')) {
        const cleaned = raw.slice(4).trim().replace(/^b\//, '');
        if (cleaned && cleaned !== '/dev/null') changedSet.add(cleaned);
      } else if (raw.startsWith('--- ')) {
        const cleaned = raw.slice(4).trim().replace(/^a\//, '');
        if (cleaned && cleaned !== '/dev/null') changedSet.add(cleaned);
      }
      oldNum = null;
      newNum = null;
      lines.push({
        kind: 'file-header',
        raw,
        sign: '',
        content: raw,
      });
      continue;
    }

    if (raw.startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (match) {
        oldNum = Number(match[1]);
        newNum = Number(match[2]);
      } else {
        oldNum = null;
        newNum = null;
      }
      lines.push({
        kind: 'hunk',
        raw,
        sign: '',
        content: raw,
      });
      continue;
    }

    if (raw.startsWith('+')) {
      additions++;
      const currentNew = newNum ?? undefined;
      if (newNum !== null) newNum++;
      lines.push({
        kind: 'add',
        raw,
        sign: '+',
        content: raw.slice(1),
        newLine: currentNew,
      });
      continue;
    }

    if (raw.startsWith('-')) {
      deletions++;
      const currentOld = oldNum ?? undefined;
      if (oldNum !== null) oldNum++;
      lines.push({
        kind: 'del',
        raw,
        sign: '-',
        content: raw.slice(1),
        oldLine: currentOld,
      });
      continue;
    }

    const currentOld = oldNum ?? undefined;
    const currentNew = newNum ?? undefined;
    if (oldNum !== null) oldNum++;
    if (newNum !== null) newNum++;
    lines.push({
      kind: 'context',
      raw,
      sign: ' ',
      content: raw.startsWith(' ') ? raw.slice(1) : raw,
      oldLine: currentOld,
      newLine: currentNew,
    });
  }

  return {
    lines,
    additions,
    deletions,
    changedFiles: [...changedSet],
  };
}

function pickDefaultFile(editableFiles: string[], changedFiles: string[]): string {
  for (const changed of changedFiles) {
    if (editableFiles.includes(changed)) return changed;
  }
  for (const preferred of PREFERRED_ENTRY_FILES) {
    if (editableFiles.includes(preferred)) return preferred;
  }
  return editableFiles[0] ?? '';
}

function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function CodeDiffModal({
  open,
  onClose,
  workspaceSlug,
  reloadNonce,
}: CodeDiffModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('diff');
  const [data, setData] = useState<WorkspaceFilesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [copiedTarget, setCopiedTarget] = useState<'diff' | 'file' | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');

  const diffTabId = useId();
  const filesTabId = useId();
  const diffTabRef = useRef<HTMLButtonElement | null>(null);
  const filesTabRef = useRef<HTMLButtonElement | null>(null);
  const diffPanelRef = useRef<HTMLDivElement | null>(null);
  const filesPanelRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsedDiff = useMemo(
    () => parseUnifiedDiff(data?.diff ?? ''),
    [data?.diff]
  );

  const modifiedFileSet = useMemo(
    () => new Set(parsedDiff.changedFiles),
    [parsedDiff.changedFiles]
  );

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getWorkspaceFiles();
      setData(res);
      const parsed = parseUnifiedDiff(res.diff);
      setSelectedFile((prev) => {
        if (prev && res.editableFiles.includes(prev)) return prev;
        return pickDefaultFile(res.editableFiles, parsed.changedFiles);
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load workspace files from backend.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetchFiles();
  }, [open, reloadNonce, fetchFiles]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Upgrade hidden panels to hidden="until-found" and listen for find-in-page beforematch
  useEffect(() => {
    const syncPanel = (el: HTMLDivElement | null, isActive: boolean) => {
      if (!el) return;
      if (isActive) {
        el.removeAttribute('hidden');
      } else {
        el.setAttribute('hidden', 'until-found');
      }
    };
    syncPanel(diffPanelRef.current, activeTab === 'diff');
    syncPanel(filesPanelRef.current, activeTab === 'files');
  }, [activeTab]);

  useEffect(() => {
    const diffEl = diffPanelRef.current;
    const filesEl = filesPanelRef.current;
    const onDiffMatch = () => setActiveTab('diff');
    const onFilesMatch = () => setActiveTab('files');
    diffEl?.addEventListener('beforematch', onDiffMatch);
    filesEl?.addEventListener('beforematch', onFilesMatch);
    return () => {
      diffEl?.removeEventListener('beforematch', onDiffMatch);
      filesEl?.removeEventListener('beforematch', onFilesMatch);
    };
  }, []);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const hasNativeFocusGroup =
      typeof HTMLElement !== 'undefined' &&
      Object.hasOwn(HTMLElement.prototype, 'focusGroup');
    if (hasNativeFocusGroup) return;

    if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowLeft' ||
      e.key === 'Home' ||
      e.key === 'End'
    ) {
      e.preventDefault();
      const next: ModalTab =
        e.key === 'Home'
          ? 'diff'
          : e.key === 'End'
          ? 'files'
          : activeTab === 'diff'
          ? 'files'
          : 'diff';
      setActiveTab(next);
      (next === 'diff' ? diffTabRef : filesTabRef).current?.focus();
    }
  };

  const copyText = async (target: 'diff' | 'file', text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setStatusAnnouncement(
        target === 'diff'
          ? 'Unified diff copied to clipboard.'
          : `${selectedFile} copied to clipboard.`
      );
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedTarget(null);
        setStatusAnnouncement('');
      }, 2000);
    } catch {
      setStatusAnnouncement('Clipboard copy failed.');
    }
  };

  const editableFiles = data?.editableFiles ?? [];
  const activeFileContent = selectedFile ? (data?.files[selectedFile] ?? '') : '';
  const activeFileLines = useMemo(
    () => (activeFileContent ? activeFileContent.replace(/\r\n/g, '\n').split('\n') : []),
    [activeFileContent]
  );

  const hasDiff = parsedDiff.lines.length > 0;
  const dialogSubtitle = workspaceSlug
    ? `${workspaceSlug} · live repository edits on disk`
    : 'Inspect live unified code diffs and active repository source files';

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      title="Live Code & Diff"
      subtitle={dialogSubtitle}
      widthClass="w-[min(94vw,720px)]"
    >
      <div className="flex flex-col">
        {/* Crisp Single-Row Tab Bar + Actions */}
        <div className="mb-3.5 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)]">
          <div
            role="tablist"
            aria-label="Code inspection views"
            className="flex items-center gap-1"
            {...({ focusgroup: 'tablist nomemory' } as Record<string, string>)}
          >
            <button
              ref={diffTabRef}
              id={diffTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === 'diff'}
              tabIndex={activeTab === 'diff' ? 0 : -1}
              onClick={() => setActiveTab('diff')}
              onFocus={() => setActiveTab('diff')}
              onKeyDown={handleTabKeyDown}
              className="relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)] aria-selected:text-[var(--cobalt-ice)] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-transparent aria-selected:after:border-[var(--cobalt-bright)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cobalt-ice)]"
              {...(activeTab === 'diff' ? { focusgroupstart: '' } : {})}
            >
              <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Live Diff</span>
              {hasDiff && (
                <span className="rounded-full bg-[var(--cobalt-tint)] px-1.5 py-px font-mono text-[10px] text-[var(--cobalt-ice)]">
                  {parsedDiff.changedFiles.length || 1}
                </span>
              )}
            </button>

            <button
              ref={filesTabRef}
              id={filesTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === 'files'}
              tabIndex={activeTab === 'files' ? 0 : -1}
              onClick={() => setActiveTab('files')}
              onFocus={() => setActiveTab('files')}
              onKeyDown={handleTabKeyDown}
              className="relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)] aria-selected:text-[var(--cobalt-ice)] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-transparent aria-selected:after:border-[var(--cobalt-bright)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cobalt-ice)]"
              {...(activeTab === 'files' ? { focusgroupstart: '' } : {})}
            >
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Source Files</span>
              {editableFiles.length > 0 && (
                <span className="rounded-full bg-[var(--bg-subtle-hover)] px-1.5 py-px font-mono text-[10px] text-[var(--ink-secondary)]">
                  {editableFiles.length}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void fetchFiles()}
            disabled={loading}
            aria-label="Refresh workspace files and diff"
            title="Refresh from disk"
            className="mb-1 flex h-7 min-h-[28px] w-7 min-w-[28px] items-center justify-center rounded-full text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--ink-primary)] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {/* Polite status announcement for clipboard actions */}
        <span className="sr-only" role="status" aria-live="polite">
          {statusAnnouncement}
        </span>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-3.5 py-2.5 text-[12px] text-[var(--vermilion)]"
          >
            {error}
          </div>
        )}

        {/* Shared zero-gap grid cell so hidden="until-found" leaves zero empty strips */}
        <div className="grid grid-cols-1">
          {/* TAB PANEL 1 — LIVE DIFF */}
          <div
            ref={diffPanelRef}
            role="tabpanel"
            aria-labelledby={diffTabId}
            hidden={activeTab !== 'diff'}
            className="col-start-1 row-start-1 min-w-0"
          >
            <div className="space-y-3">
              {/* Diff Summary + Copy Action Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--ink-secondary)]">
                  {loading && !data ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin text-[var(--cobalt-ice)]"
                        aria-hidden="true"
                      />
                      Reading workspace diff…
                    </span>
                  ) : hasDiff ? (
                    <>
                      <span className="text-[var(--ink-primary)]">
                        {parsedDiff.changedFiles.length}{' '}
                        {parsedDiff.changedFiles.length === 1 ? 'file' : 'files'} edited
                      </span>
                      {parsedDiff.additions > 0 && (
                        <span className="rounded-full bg-[var(--emerald-bg)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--emerald)]">
                          +{parsedDiff.additions}
                        </span>
                      )}
                      {parsedDiff.deletions > 0 && (
                        <span className="rounded-full bg-[var(--vermilion-bg)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--vermilion)]">
                          -{parsedDiff.deletions}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Matches baseline · 0 pending edits</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!hasDiff}
                  onClick={() => void copyText('diff', data?.diff ?? '')}
                  className="inline-flex min-h-[28px] items-center gap-1.5 rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-3 py-1 text-[11.5px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--cobalt-border)] hover:bg-[var(--bg-pill-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {copiedTarget === 'diff' ? (
                    <>
                      <Check
                        className="h-3.5 w-3.5 text-[var(--emerald)]"
                        aria-hidden="true"
                      />
                      <span className="text-[var(--emerald)]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy diff</span>
                    </>
                  )}
                </button>
              </div>

              {/* Unified Diff Surface or Clean Empty State */}
              {loading && !data ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] py-14 font-mono text-[11.5px] text-[var(--ink-secondary)]">
                  <Loader2
                    className="h-4 w-4 animate-spin text-[var(--cobalt-ice)]"
                    aria-hidden="true"
                  />
                  <span>Loading live diff via GET /api/files…</span>
                </div>
              ) : !hasDiff ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-6 py-12 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]">
                    <Code2 className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <p className="max-w-[420px] text-[13px] leading-relaxed text-[var(--ink-secondary)]">
                    No edits yet — circle any element or click Transform to watch live code diffs appear here.
                  </p>
                  {editableFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('files')}
                      className="mt-4 inline-flex min-h-[28px] items-center gap-1.5 rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] px-3.5 py-1 text-[11.5px] font-medium text-[var(--cobalt-ice)] transition-colors hover:bg-[var(--cobalt-tint-strong)]"
                    >
                      <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Inspect {editableFiles.length} Source Files</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="studio-scroll max-h-[54vh] overflow-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] font-mono text-[11.5px] leading-[1.6]">
                  <div className="min-w-max py-1">
                    {parsedDiff.lines.map((line, idx) => {
                      if (line.kind === 'file-header') {
                        return (
                          <div
                            key={idx}
                            className="border-y border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3.5 py-1 font-semibold text-[var(--ink-primary)] first:border-t-0"
                          >
                            {line.content}
                          </div>
                        );
                      }

                      if (line.kind === 'hunk') {
                        return (
                          <div
                            key={idx}
                            className="bg-[var(--cobalt-tint)] px-3.5 py-0.5 text-[11px] text-[var(--ink-muted)]"
                          >
                            {line.content}
                          </div>
                        );
                      }

                      const rowClasses =
                        line.kind === 'add'
                          ? 'bg-[var(--emerald-bg)] text-[var(--emerald)]'
                          : line.kind === 'del'
                          ? 'bg-[var(--vermilion-bg)] text-[var(--vermilion)]'
                          : 'text-[var(--ink-secondary)]';

                      return (
                        <div key={idx} className={`flex items-start ${rowClasses}`}>
                          <span
                            aria-hidden="true"
                            className="w-10 shrink-0 select-none pr-2 text-right text-[10px] opacity-55"
                          >
                            {line.oldLine ?? ''}
                          </span>
                          <span
                            aria-hidden="true"
                            className="w-10 shrink-0 select-none pr-2 text-right text-[10px] opacity-55"
                          >
                            {line.newLine ?? ''}
                          </span>
                          <span
                            aria-hidden="true"
                            className="w-5 shrink-0 select-none text-center font-semibold"
                          >
                            {line.sign}
                          </span>
                          <span className="whitespace-pre pr-4">
                            {line.content || ' '}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TAB PANEL 2 — SOURCE FILES */}
          <div
            ref={filesPanelRef}
            role="tabpanel"
            aria-labelledby={filesTabId}
            hidden={activeTab !== 'files'}
            className="col-start-1 row-start-1 min-w-0"
          >
            <div className="space-y-3">
              {/* File Pill Selector */}
              {editableFiles.length > 0 ? (
                <div
                  role="group"
                  aria-label="Editable workspace files"
                  className="studio-scroll flex items-center gap-1.5 overflow-x-auto pb-1"
                >
                  {editableFiles.map((filePath) => {
                    const isSelected = filePath === selectedFile;
                    const isModified = modifiedFileSet.has(filePath);
                    return (
                      <button
                        key={filePath}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedFile(filePath)}
                        className={`inline-flex min-h-[28px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-medium transition-colors ${
                          isSelected
                            ? 'border-[var(--cobalt-border-strong)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]'
                            : 'border-[var(--border-pill)] bg-[var(--bg-pill)] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {isModified && (
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)]"
                          />
                        )}
                        <span>{filePath}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* Active File Header + Copy */}
              {selectedFile && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 font-mono text-[11px]">
                    <span className="truncate font-medium text-[var(--ink-primary)]">
                      {selectedFile}
                    </span>
                    <span className="shrink-0 text-[var(--ink-muted)]">
                      {activeFileLines.length} lines · {formatBytes(activeFileContent)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!activeFileContent}
                    onClick={() => void copyText('file', activeFileContent)}
                    className="inline-flex min-h-[28px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-3 py-1 text-[11.5px] font-medium text-[var(--ink-primary)] transition-colors hover:border-[var(--cobalt-border)] hover:bg-[var(--bg-pill-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {copiedTarget === 'file' ? (
                      <>
                        <Check
                          className="h-3.5 w-3.5 text-[var(--emerald)]"
                          aria-hidden="true"
                        />
                        <span className="text-[var(--emerald)]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copy file</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Live Current Code on Disk (JetBrains Mono) */}
              {loading && !data ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] py-14 font-mono text-[11.5px] text-[var(--ink-secondary)]">
                  <Loader2
                    className="h-4 w-4 animate-spin text-[var(--cobalt-ice)]"
                    aria-hidden="true"
                  />
                  <span>Loading source files…</span>
                </div>
              ) : editableFiles.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-5 py-10 text-center text-[12.5px] text-[var(--ink-secondary)]">
                  No editable source files found for the active workspace.
                </div>
              ) : (
                <div className="studio-scroll max-h-[50vh] overflow-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] font-mono text-[11.5px] leading-[1.6]">
                  <div className="min-w-max py-2">
                    {activeFileLines.map((line, idx) => (
                      <div
                        key={idx}
                        className="flex items-start hover:bg-[var(--bg-subtle)]"
                      >
                        <span
                          aria-hidden="true"
                          className="w-11 shrink-0 select-none pr-3 text-right text-[10px] text-[var(--ink-muted)]"
                        >
                          {idx + 1}
                        </span>
                        <span className="whitespace-pre pr-4 text-[var(--ink-primary)]">
                          {line || ' '}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </NativeDialog>
  );
}
