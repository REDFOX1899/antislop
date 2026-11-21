import type {
  DesignManifest,
  DecisionsScorecard,
  GitHubPrResponse,
  GitHubRepoSummary,
  ManagedAgentEvent,
  ManagedAgentShipRequest,
  MediaAssetInput,
  StreamEvent,
  StreamEventType,
  TransformRunRequest,
  TransformRunResult,
  WorkspaceRepoInfo,
} from '@shared/types';

export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'
).replace(/\/+$/, '');

export const DEFAULT_PREVIEW_URL =
  process.env.NEXT_PUBLIC_PREVIEW_URL || `${BACKEND_URL}/preview/`;

export function resolveBackendUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  if (
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://') ||
    pathOrUrl.startsWith('data:') ||
    pathOrUrl.startsWith('blob:')
  ) {
    return pathOrUrl;
  }
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${BACKEND_URL}${normalized}`;
}

export interface HealthResponse {
  status: string;
  previewUrl?: string;
  activeWorkspace?: WorkspaceRepoInfo;
  workspaces?: WorkspaceRepoInfo[];
  pool?: {
    primaryConfigured: boolean;
    secondaryConfigured: boolean;
    totalCalls: number;
  };
  githubConfigured?: boolean;
  models?: Record<string, string>;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BACKEND_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (typeof errBody?.error === 'string') message = errBody.error;
      else if (typeof errBody?.message === 'string') message = errBody.message;
    } catch {
      const text = await res.text().catch(() => '');
      if (text) message = text.slice(0, 240);
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export interface WorkspaceRecommendation {
  id: string;
  badge: string;
  title: string;
  rationale: string;
  prompt: string;
  enableBespokeArt: boolean;
  mode: 'antislop' | 'circle_tweak';
}

export interface RecommendationsResponse {
  workspaceId: string;
  brandSummary: string;
  recommendations: WorkspaceRecommendation[];
  generatedAt: string;
}

const DEFAULT_RECOMMENDATIONS: WorkspaceRecommendation[] = [
  {
    id: 'rec-3d-spatial',
    badge: '3D SPATIAL',
    title: '3D Spatial Cards + Alabaster Hero',
    rationale: 'Elevates flat grid blocks with crisp tactile depth and warm editorial hierarchy.',
    prompt:
      'Transform the hero and feature cards into a Warm Alabaster editorial system with 3D spatial perspective cards, crisp 1px borders, Instrument Serif display headings, and generous whitespace.',
    enableBespokeArt: false,
    mode: 'antislop',
  },
  {
    id: 'rec-bespoke-art',
    badge: 'BESPOKE ART',
    title: 'Nano Banana 2.1 Editorial Hero',
    rationale: 'Replaces generic placeholders with custom art-directed studio imagery.',
    prompt:
      'Generate bespoke editorial hero photography via Nano Banana 2.1 and pair it with high-contrast typographic framing and balanced caption rhythm.',
    enableBespokeArt: true,
    mode: 'antislop',
  },
  {
    id: 'rec-editorial-craft',
    badge: 'EDITORIAL',
    title: 'Swiss Grid & Tabular Telemetry',
    rationale: 'Tightens typographic rhythm, tabular numerals, and hairline structural dividers.',
    prompt:
      'Apply Swiss editorial grid discipline with JetBrains Mono tabular telemetry, crisp hairline dividers, and intentional visual contrast.',
    enableBespokeArt: false,
    mode: 'antislop',
  },
  {
    id: 'rec-conversion-flow',
    badge: 'CONVERSION',
    title: 'Interactive Proof & Primary CTA Focus',
    rationale: 'Removes competing visual noise so primary actions and live trust metrics convert.',
    prompt:
      'Clarify the primary value proposition, elevate the single primary Cobalt CTA, and organize supporting proof into scannable interactive cards.',
    enableBespokeArt: false,
    mode: 'antislop',
  },
];

export async function fetchWorkspaceRecommendations(
  referenceSummary?: string
): Promise<RecommendationsResponse> {
  try {
    const data = await fetchJson<Partial<RecommendationsResponse>>(
      '/api/recommendations',
      {
        method: 'POST',
        body: JSON.stringify({
          referenceSummary: referenceSummary?.trim() || undefined,
        }),
      }
    );

    if (Array.isArray(data?.recommendations) && data.recommendations.length > 0) {
      return {
        workspaceId: data.workspaceId || 'active',
        brandSummary:
          data.brandSummary ||
          'Curated transformations tailored to your active workspace and attached references.',
        recommendations: data.recommendations,
        generatedAt: data.generatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Graceful client fallback when backend is unreachable or endpoint unavailable
  }

  return {
    workspaceId: 'fallback',
    brandSummary: referenceSummary?.trim()
      ? `Tailored to ${referenceSummary.trim().slice(0, 80)}`
      : 'Curated AntiSlop craft upgrades for the active workspace.',
    recommendations: DEFAULT_RECOMMENDATIONS,
    generatedAt: new Date().toISOString(),
  };
}

export async function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/api/health', { cache: 'no-store' });
}

export async function getWorkspaces(): Promise<{
  workspaces: WorkspaceRepoInfo[];
  active?: WorkspaceRepoInfo;
}> {
  const data = await fetchJson<
    | WorkspaceRepoInfo[]
    | {
        workspaces?: WorkspaceRepoInfo[];
        active?: WorkspaceRepoInfo;
        activeWorkspace?: WorkspaceRepoInfo;
      }
  >('/api/workspaces', { cache: 'no-store' });

  if (Array.isArray(data)) {
    return {
      workspaces: data,
      active: data.find((w) => w.active) ?? data[0],
    };
  }
  const list = data.workspaces ?? [];
  return {
    workspaces: list,
    active:
      data.activeWorkspace ??
      data.active ??
      list.find((w) => w.active) ??
      list[0],
  };
}

export async function switchWorkspace(
  workspaceId: string
): Promise<{ workspace?: WorkspaceRepoInfo; previewUrl?: string }> {
  return fetchJson('/api/workspaces/switch', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, id: workspaceId }),
  });
}

export async function resetBaselineSnapshot(): Promise<{
  ok?: boolean;
  reset?: boolean;
  baselineScreenshotUrl?: string;
  screenshotUrl?: string;
  previewUrl?: string;
  message?: string;
}> {
  return fetchJson('/api/snapshot/reset', {
    method: 'POST',
    body: JSON.stringify({ capture: false }),
  });
}

export interface WorkspaceFilesResponse {
  editableFiles: string[];
  files: Record<string, string>;
  diff: string;
  workspaceId?: string;
}

interface SimpleDiffEntry {
  file: string;
  added: number;
  removed: number;
  status: 'added' | 'modified' | 'deleted';
}

interface SimpleDiffPayload {
  filesChanged?: string[];
  linesAdded?: number;
  linesRemoved?: number;
  summary?: string;
  perFile?: SimpleDiffEntry[];
}

interface RawWorkspaceFilesPayload {
  workspaceId?: string;
  editableFiles?: string[];
  fileList?: string[];
  files?: Record<string, string>;
  baselineFiles?: Record<string, string>;
  diff?: string | SimpleDiffPayload;
  unifiedDiff?: string;
}

const workspaceBaselineFilesCache = new Map<string, Record<string, string>>();

function getSessionBaselineKey(workspaceId: string): string {
  return `antislop:baseline-files:${workspaceId}`;
}

function readCachedBaseline(workspaceId?: string): Record<string, string> | undefined {
  if (!workspaceId) return undefined;
  const mem = workspaceBaselineFilesCache.get(workspaceId);
  if (mem) return mem;
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(getSessionBaselineKey(workspaceId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === 'object') {
      workspaceBaselineFilesCache.set(workspaceId, parsed);
      return parsed;
    }
  } catch {
    // Ignore storage read errors
  }
  return undefined;
}

function writeCachedBaseline(workspaceId: string | undefined, files: Record<string, string>): void {
  if (!workspaceId) return;
  const clone = { ...files };
  workspaceBaselineFilesCache.set(workspaceId, clone);
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(clone);
    if (serialized.length < 400_000) {
      window.sessionStorage.setItem(getSessionBaselineKey(workspaceId), serialized);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function splitDiffLines(text: string): string[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function buildUnifiedDiff(filePath: string, beforeText: string, afterText: string): string {
  if (beforeText === afterText) return '';
  const a = splitDiffLines(beforeText);
  const b = splitDiffLines(afterText);

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);
  if (midA.length === 0 && midB.length === 0) return '';

  type DiffOp = { type: 'equal' | 'delete' | 'insert'; line: string };
  const midOps: DiffOp[] = [];

  const m = midA.length;
  const n = midB.length;
  if (m * n <= 250_000) {
    const cols = n + 1;
    const dp = new Int32Array((m + 1) * cols);
    for (let i = m - 1; i >= 0; i--) {
      const row = i * cols;
      const nextRow = (i + 1) * cols;
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[row + j] = dp[nextRow + j + 1] + 1;
        } else {
          const down = dp[nextRow + j];
          const right = dp[row + j + 1];
          dp[row + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        midOps.push({ type: 'equal', line: midA[i] });
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
        midOps.push({ type: 'delete', line: midA[i] });
        i++;
      } else {
        midOps.push({ type: 'insert', line: midB[j] });
        j++;
      }
    }
    while (i < m) midOps.push({ type: 'delete', line: midA[i++] });
    while (j < n) midOps.push({ type: 'insert', line: midB[j++] });
  } else {
    for (const line of midA) midOps.push({ type: 'delete', line });
    for (const line of midB) midOps.push({ type: 'insert', line });
  }

  const ops: DiffOp[] = [];
  for (let i = 0; i < prefix; i++) ops.push({ type: 'equal', line: a[i] });
  for (const op of midOps) ops.push(op);
  for (let i = a.length - suffix; i < a.length; i++) {
    ops.push({ type: 'equal', line: a[i] });
  }

  const oldLineAt: number[] = new Array(ops.length);
  const newLineAt: number[] = new Array(ops.length);
  let oldCursor = 0;
  let newCursor = 0;
  const changeIndices: number[] = [];

  for (let idx = 0; idx < ops.length; idx++) {
    oldLineAt[idx] = oldCursor;
    newLineAt[idx] = newCursor;
    const op = ops[idx];
    if (op.type === 'equal') {
      oldCursor++;
      newCursor++;
    } else if (op.type === 'delete') {
      oldCursor++;
      changeIndices.push(idx);
    } else {
      newCursor++;
      changeIndices.push(idx);
    }
  }

  if (changeIndices.length === 0) return '';

  const CONTEXT = 3;
  const ranges: Array<[number, number]> = [];
  for (const changeIdx of changeIndices) {
    const start = Math.max(0, changeIdx - CONTEXT);
    const end = Math.min(ops.length - 1, changeIdx + CONTEXT);
    const prev = ranges[ranges.length - 1];
    if (prev && start <= prev[1] + 1) {
      prev[1] = Math.max(prev[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  const out: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  for (const [start, end] of ranges) {
    let oldCount = 0;
    let newCount = 0;
    for (let idx = start; idx <= end; idx++) {
      if (ops[idx].type !== 'insert') oldCount++;
      if (ops[idx].type !== 'delete') newCount++;
    }
    const oldStart = oldCount === 0 ? oldLineAt[start] : oldLineAt[start] + 1;
    const newStart = newCount === 0 ? newLineAt[start] : newLineAt[start] + 1;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (let idx = start; idx <= end; idx++) {
      const op = ops[idx];
      const prefixChar = op.type === 'insert' ? '+' : op.type === 'delete' ? '-' : ' ';
      out.push(`${prefixChar}${op.line}`);
    }
  }

  return out.join('\n');
}

function synthesizeUnifiedDiffFromSimple(
  simple: SimpleDiffPayload,
  files: Record<string, string>,
  baseline?: Record<string, string>
): string {
  const entries: SimpleDiffEntry[] =
    Array.isArray(simple.perFile) && simple.perFile.length > 0
      ? simple.perFile
      : (simple.filesChanged ?? []).map((file) => ({
          file,
          added: 0,
          removed: 0,
          status: 'modified' as const,
        }));

  if (entries.length === 0) return '';

  const blocks: string[] = [];
  for (const entry of entries) {
    const after = files[entry.file];
    const before = baseline?.[entry.file];

    if (entry.status === 'added' && typeof after === 'string') {
      const lines = splitDiffLines(after);
      blocks.push(
        [
          '--- /dev/null',
          `+++ b/${entry.file}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map((line) => `+${line}`),
        ].join('\n')
      );
      continue;
    }

    if (entry.status === 'deleted') {
      if (typeof before === 'string') {
        const lines = splitDiffLines(before);
        blocks.push(
          [
            `--- a/${entry.file}`,
            '+++ /dev/null',
            `@@ -1,${lines.length} +0,0 @@`,
            ...lines.map((line) => `-${line}`),
          ].join('\n')
        );
      } else {
        blocks.push(
          [
            `--- a/${entry.file}`,
            '+++ /dev/null',
            `@@ -1,${entry.removed} +0,0 @@`,
            `- (${entry.removed} lines removed)`,
          ].join('\n')
        );
      }
      continue;
    }

    if (typeof before === 'string' && typeof after === 'string') {
      const patch = buildUnifiedDiff(entry.file, before, after);
      if (patch) {
        blocks.push(patch);
        continue;
      }
    }

    const previewLines = typeof after === 'string' ? splitDiffLines(after).slice(0, 80) : [];
    const suffixNote =
      typeof after === 'string' && splitDiffLines(after).length > 80
        ? [` ... (${splitDiffLines(after).length - 80} more lines in Source Files tab)`]
        : [];
    blocks.push(
      [
        `--- a/${entry.file}`,
        `+++ b/${entry.file}`,
        `@@ modified (+${entry.added} / -${entry.removed} lines vs baseline) @@`,
        ...previewLines.map((line) => ` ${line}`),
        ...suffixNote,
      ].join('\n')
    );
  }

  return blocks.join('\n');
}

export async function getWorkspaceFiles(): Promise<WorkspaceFilesResponse> {
  const raw = await fetchJson<RawWorkspaceFilesPayload>('/api/files', {
    cache: 'no-store',
  });

  const files = raw.files && typeof raw.files === 'object' ? raw.files : {};
  const editableFiles = Array.isArray(raw.editableFiles)
    ? raw.editableFiles
    : Array.isArray(raw.fileList)
    ? raw.fileList
    : Object.keys(files);
  const workspaceId = raw.workspaceId;

  let diff = '';
  if (typeof raw.diff === 'string') {
    diff = raw.diff.trim();
    if (!diff) {
      writeCachedBaseline(workspaceId, files);
    }
  } else if (typeof raw.unifiedDiff === 'string') {
    diff = raw.unifiedDiff.trim();
    if (!diff) {
      writeCachedBaseline(workspaceId, files);
    }
  } else if (raw.diff && typeof raw.diff === 'object') {
    const changed = raw.diff.filesChanged ?? raw.diff.perFile?.map((p) => p.file) ?? [];
    if (changed.length === 0) {
      writeCachedBaseline(workspaceId, files);
      diff = '';
    } else {
      const baseline = raw.baselineFiles ?? readCachedBaseline(workspaceId);
      diff = synthesizeUnifiedDiffFromSimple(raw.diff, files, baseline);
    }
  }

  return {
    editableFiles,
    files,
    diff,
    workspaceId,
  };
}

export async function transcribeVoiceAudio(
  audioBase64: string,
  mimeType: string
): Promise<{ transcript: string; latencyMs?: number; model?: string }> {
  return fetchJson('/api/transcribe', {
    method: 'POST',
    body: JSON.stringify({ audioBase64, mimeType }),
  });
}

export interface CaptureReferenceUrlResponse {
  asset: MediaAssetInput;
  url: string;
  title?: string;
  extractedCssSummary?: string;
  screenshotUrl?: string;
  latencyMs?: number;
}

export async function captureReferenceUrl(
  url: string
): Promise<CaptureReferenceUrlResponse> {
  return fetchJson<CaptureReferenceUrlResponse>('/api/reference/capture-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export interface StartTransformResponse {
  runId: string;
  status?: TransformRunResult['status'];
  streamUrl?: string;
  run?: TransformRunResult;
  result?: TransformRunResult;
}

export async function startTransformRun(
  req: TransformRunRequest
): Promise<StartTransformResponse | TransformRunResult> {
  return fetchJson<StartTransformResponse | TransformRunResult>('/api/transform', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function getRunResult(runId: string): Promise<TransformRunResult> {
  return fetchJson<TransformRunResult>(`/api/runs/${encodeURIComponent(runId)}`, {
    cache: 'no-store',
  });
}

const ALL_STREAM_EVENT_TYPES: StreamEventType[] = [
  'run_started',
  'snapshot_captured',
  'voice_transcribed',
  'director_thinking',
  'manifest_ready',
  'asset_generated',
  'candidate_started',
  'candidate_written',
  'candidate_scored',
  'iteration_complete',
  'refinement_triggered',
  'hmr_reloaded',
  'run_completed',
  'run_error',
];

export function subscribeToRunStream(
  runId: string,
  onEvent: (event: StreamEvent) => void,
  onError?: () => void
): () => void {
  const url = `${BACKEND_URL}/api/runs/${encodeURIComponent(runId)}/stream`;
  const source = new EventSource(url);
  const seen = new Set<string>();

  const handleRaw = (raw: string, fallbackType?: StreamEventType) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<StreamEvent>;
      const ev: StreamEvent = {
        runId: parsed.runId ?? runId,
        type: parsed.type ?? fallbackType ?? 'run_started',
        timestamp: parsed.timestamp ?? new Date().toISOString(),
        iteration: parsed.iteration,
        model: parsed.model,
        message: parsed.message ?? '',
        payload: parsed.payload,
      };
      const dedupeKey = `${ev.type}:${ev.timestamp}:${ev.iteration ?? ''}:${ev.message}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      onEvent(ev);
    } catch {
      // Ignore heartbeat / keepalive comments
    }
  };

  source.onmessage = (e) => handleRaw(e.data);

  for (const eventType of ALL_STREAM_EVENT_TYPES) {
    source.addEventListener(eventType, (e: MessageEvent) => {
      handleRaw(e.data, eventType);
    });
  }

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      onError?.();
    }
  };

  return () => {
    source.close();
  };
}

export async function listGitHubRepos(): Promise<GitHubRepoSummary[]> {
  const data = await fetchJson<GitHubRepoSummary[] | { repos?: GitHubRepoSummary[] }>(
    '/api/github/repos',
    { cache: 'no-store' }
  );
  if (Array.isArray(data)) return data;
  return data.repos ?? [];
}

export async function connectGitHubRepo(
  repoUrl: string,
  branch?: string
): Promise<{ workspace?: WorkspaceRepoInfo; previewUrl?: string; message?: string }> {
  return fetchJson('/api/github/connect', {
    method: 'POST',
    body: JSON.stringify({ repoUrl, branch: branch || undefined }),
  });
}

export async function openGitHubPr(params: {
  title?: string;
  description?: string;
  body?: string;
  branchName?: string;
  runId?: string;
  manifest?: DesignManifest;
  scorecard?: DecisionsScorecard;
}): Promise<GitHubPrResponse> {
  return fetchJson<GitHubPrResponse>('/api/github/pr', {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      description: params.description ?? params.body,
    }),
  });
}

export interface ManagedAgentShipResult {
  environmentId?: string;
  interactionId?: string;
  summary?: string;
  buildPassed?: boolean;
  events?: ManagedAgentEvent[];
}

/**
 * Supports BOTH streaming SSE responses from POST /api/managed-agent/ship
 * and JSON responses (either immediate events array or jobId stream).
 */
export async function shipViaManagedAgent(
  req: ManagedAgentShipRequest,
  onEvent: (event: ManagedAgentEvent) => void,
  signal?: AbortSignal
): Promise<ManagedAgentShipResult> {
  const url = `${BACKEND_URL}/api/managed-agent/ship`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    let message = `Managed agent ship failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (typeof errBody?.error === 'string') message = errBody.error;
      else if (typeof errBody?.message === 'string') message = errBody.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const collected: ManagedAgentEvent[] = [];
    const finalResult: ManagedAgentShipResult = { events: collected };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const lines = block
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('data:'));
        for (const line of lines) {
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const ev = JSON.parse(raw) as ManagedAgentEvent;
            collected.push(ev);
            onEvent(ev);
            if (ev.environmentId) finalResult.environmentId = ev.environmentId;
            if (ev.interactionId) finalResult.interactionId = ev.interactionId;
            if (ev.type === 'completed') {
              finalResult.summary = ev.message;
              const bp = ev.detail?.buildPassed;
              if (typeof bp === 'boolean') finalResult.buildPassed = bp;
            }
          } catch {
            // ignore non-json SSE comments
          }
        }
      }
    }

    return finalResult;
  }

  const json = (await res.json()) as ManagedAgentShipResult & {
    shipId?: string;
    jobId?: string;
    streamUrl?: string;
  };

  if (Array.isArray(json.events)) {
    for (const ev of json.events) {
      onEvent(ev);
    }
  }

  // If backend returned a separate SSE stream path for managed agent job
  const followUrl =
    json.streamUrl ||
    (json.shipId ? `/api/managed-agent/${encodeURIComponent(json.shipId)}/stream` : undefined) ||
    (json.jobId ? `/api/managed-agent/${encodeURIComponent(json.jobId)}/stream` : undefined);

  if (followUrl) {
    await new Promise<void>((resolve) => {
      const full = resolveBackendUrl(followUrl) ?? followUrl;
      const es = new EventSource(full);
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as ManagedAgentEvent;
          onEvent(ev);
          if (ev.environmentId) json.environmentId = ev.environmentId;
          if (ev.interactionId) json.interactionId = ev.interactionId;
          if (ev.type === 'completed' || ev.type === 'error') {
            if (typeof ev.detail?.buildPassed === 'boolean') {
              json.buildPassed = ev.detail.buildPassed;
            }
            if (ev.type === 'completed') json.summary = ev.message;
            es.close();
            resolve();
          }
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        es.close();
        resolve();
      };
    });
  }

  return json;
}
