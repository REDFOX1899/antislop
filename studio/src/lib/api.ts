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
