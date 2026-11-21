import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { ENV } from '../config/env.js';
import { isTransientGeminiError } from './mediaUtils.js';

export type KeySlot = 'primary' | 'secondary';

export type TraceRunType = 'llm' | 'chain' | 'tool' | 'retriever' | 'embedding';

interface PoolEntry {
  slot: KeySlot;
  apiKey: string;
  v1: GoogleGenAI;
  v1beta: GoogleGenAI;
}

class GeminiClientPool {
  private readonly entries: PoolEntry[] = [];
  private cursor = 0;
  private totalCallsCount = 0;

  constructor() {
    if (ENV.GEMINI_API_KEY) {
      this.entries.push(this.createEntry('primary', ENV.GEMINI_API_KEY));
    }
    if (ENV.GEMINI_API_KEY_SECONDARY && ENV.GEMINI_API_KEY_SECONDARY !== ENV.GEMINI_API_KEY) {
      this.entries.push(this.createEntry('secondary', ENV.GEMINI_API_KEY_SECONDARY));
    }
  }

  private createEntry(slot: KeySlot, apiKey: string): PoolEntry {
    return {
      slot,
      apiKey,
      v1: new GoogleGenAI({ apiKey }),
      v1beta: new GoogleGenAI({ apiKey, apiVersion: 'v1beta' }),
    };
  }

  private nextEntry(): PoolEntry {
    if (this.entries.length === 0) {
      throw new Error('No GEMINI_API_KEY configured in env/.env');
    }
    const index = this.cursor % this.entries.length;
    this.cursor = (this.cursor + 1) % 1_000_000;
    this.totalCallsCount += 1;
    return this.entries[index];
  }

  private alternateEntry(currentSlot: KeySlot): PoolEntry | undefined {
    return this.entries.find((e) => e.slot !== currentSlot);
  }

  public getV1Client(): GoogleGenAI {
    return this.nextEntry().v1;
  }

  public getV1BetaClient(): GoogleGenAI {
    return this.nextEntry().v1beta;
  }

  public getPoolStatus(): {
    primaryConfigured: boolean;
    secondaryConfigured: boolean;
    totalCalls: number;
  } {
    return {
      primaryConfigured: Boolean(ENV.GEMINI_API_KEY),
      secondaryConfigured: Boolean(ENV.GEMINI_API_KEY_SECONDARY),
      totalCalls: this.totalCallsCount,
    };
  }

  /**
   * Executes a `v1` Gemini API operation with round-robin dual-key pooling and
   * automatic failover onto the secondary key on transient 429/503 errors.
   */
  public async withV1Client<T>(fn: (client: GoogleGenAI, slot: KeySlot) => Promise<T>): Promise<T> {
    const primaryChoice = this.nextEntry();
    try {
      return await fn(primaryChoice.v1, primaryChoice.slot);
    } catch (err) {
      if (!isTransientGeminiError(err)) {
        throw err;
      }
      const fallback = this.alternateEntry(primaryChoice.slot) ?? primaryChoice;
      const backoffMs = fallback.slot !== primaryChoice.slot ? 300 : 750;
      await sleep(backoffMs);
      this.totalCallsCount += 1;
      return fn(fallback.v1, fallback.slot);
    }
  }

  /**
   * Executes a `v1beta` Gemini API operation (Decisions API, Nano Banana 2.1, Managed Agents)
   * with round-robin dual-key pooling and automatic failover on transient 429/503 errors.
   */
  public async withV1BetaClient<T>(fn: (client: GoogleGenAI, slot: KeySlot) => Promise<T>): Promise<T> {
    const primaryChoice = this.nextEntry();
    try {
      return await fn(primaryChoice.v1beta, primaryChoice.slot);
    } catch (err) {
      if (!isTransientGeminiError(err)) {
        throw err;
      }
      const fallback = this.alternateEntry(primaryChoice.slot) ?? primaryChoice;
      const backoffMs = fallback.slot !== primaryChoice.slot ? 300 : 750;
      await sleep(backoffMs);
      this.totalCallsCount += 1;
      return fn(fallback.v1beta, fallback.slot);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const pool = new GeminiClientPool();

export function getV1Client(): GoogleGenAI {
  return pool.getV1Client();
}

export function getV1BetaClient(): GoogleGenAI {
  return pool.getV1BetaClient();
}

export function getPoolStatus(): {
  primaryConfigured: boolean;
  secondaryConfigured: boolean;
  totalCalls: number;
} {
  return pool.getPoolStatus();
}

export function withV1Client<T>(fn: (client: GoogleGenAI, slot: KeySlot) => Promise<T>): Promise<T> {
  return pool.withV1Client(fn);
}

export function withV1BetaClient<T>(fn: (client: GoogleGenAI, slot: KeySlot) => Promise<T>): Promise<T> {
  return pool.withV1BetaClient(fn);
}

/**
 * Redacts large base64 strings or massive code payloads before sending observability spans.
 */
function sanitizeTraceValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[max-depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > 1200) {
      return `${value.slice(0, 240)}... <truncated ${value.length} chars>`;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => sanitizeTraceValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 25);
    for (const [k, v] of entries) {
      if (k.toLowerCase().includes('apikey') || k.toLowerCase().includes('token') || k.toLowerCase().includes('secret')) {
        out[k] = '[redacted]';
      } else if (k.toLowerCase().includes('base64') && typeof v === 'string') {
        out[k] = `<base64:${v.length} chars>`;
      } else {
        out[k] = sanitizeTraceValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function postLangSmithRun(payload: Record<string, unknown>): void {
  if (!ENV.LANGSMITH_TRACING || !ENV.LANGSMITH_API_KEY) {
    return;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': ENV.LANGSMITH_API_KEY,
  };
  if (ENV.LANGSMITH_WORKSPACE_ID) {
    headers['X-Tenant-Id'] = ENV.LANGSMITH_WORKSPACE_ID;
  }

  // Fire-and-forget async span dispatch — strictly non-blocking and never throws
  void fetch('https://api.smith.langchain.com/api/v1/runs', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4000),
  })
    .then((res) => {
      // Drain body silently so keepalive sockets stay clean
      return res.text().catch(() => '');
    })
    .catch(() => {
      // Never surface LangSmith network hiccups to the interactive user loop
    });
}

/**
 * Lightweight fire-and-forget LangSmith span wrapper.
 * Records latency, sanitized inputs/outputs, and errors without blocking or throwing.
 */
export async function traceSpan<T>(
  name: string,
  runType: TraceRunType,
  inputs: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const startIso = new Date().toISOString();
  const runId = uuidv4();

  try {
    const result = await fn();
    const endIso = new Date().toISOString();

    if (ENV.LANGSMITH_TRACING && ENV.LANGSMITH_API_KEY) {
      postLangSmithRun({
        id: runId,
        name,
        run_type: runType,
        session_name: ENV.LANGSMITH_PROJECT,
        start_time: startIso,
        end_time: endIso,
        inputs: sanitizeTraceValue(inputs) as Record<string, unknown>,
        outputs: { result: sanitizeTraceValue(result) },
      });
    }

    return result;
  } catch (err) {
    const endIso = new Date().toISOString();

    if (ENV.LANGSMITH_TRACING && ENV.LANGSMITH_API_KEY) {
      postLangSmithRun({
        id: runId,
        name,
        run_type: runType,
        session_name: ENV.LANGSMITH_PROJECT,
        start_time: startIso,
        end_time: endIso,
        inputs: sanitizeTraceValue(inputs) as Record<string, unknown>,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    throw err;
  }
}
