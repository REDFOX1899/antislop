import fs from 'node:fs/promises';
import path from 'node:path';
import type { MediaAssetInput } from '../../../shared/types.js';
import { BACKEND_ROOT, REPO_ROOT } from '../config/env.js';

export interface ResolvedBinaryPayload {
  base64: string;
  mimeType: string;
}

/**
 * Strips optional `data:<mime>;base64,` prefix and whitespace/newlines.
 */
export function stripDataUriPrefix(raw: string): { base64: string; detectedMime?: string } {
  const trimmed = raw.trim();
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/is.exec(trimmed);
  if (match) {
    return {
      detectedMime: match[1].trim(),
      base64: match[2].replace(/\s+/g, ''),
    };
  }
  return {
    base64: trimmed.replace(/\s+/g, ''),
  };
}

/**
 * Normalizes MIME types for Gemini 4 Interactions / Decisions / Embeddings APIs.
 * Crucially strips `;codecs=...` parameters from browser MediaRecorder outputs
 * (e.g. `audio/webm;codecs=opus` -> `audio/webm`).
 */
export function normalizeMimeType(mime: string | undefined, fallback: string): string {
  if (!mime || !mime.trim()) return fallback;
  const base = mime.split(';')[0].trim().toLowerCase();
  if (!base) return fallback;
  if (base === 'image/jpg') return 'image/jpeg';
  if (base === 'audio/mp4' || base === 'audio/x-m4a') return 'audio/m4a';
  if (base === 'audio/x-wav') return 'audio/wav';
  if (base === 'video/quicktime') return 'video/mov';
  return base;
}

/**
 * Estimates raw decoded byte count of a base64 string.
 */
export function estimateBase64Bytes(base64: string): number {
  const clean = base64.replace(/\s+/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/**
 * Infers MIME type from a file extension when missing.
 */
function inferMimeFromPath(filePath: string, fallback: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/mov';
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mp3';
    case '.m4a':
      return 'audio/m4a';
    case '.ogg':
      return 'audio/ogg';
    default:
      return fallback;
  }
}

/**
 * Resolves a MediaAssetInput into raw base64 + normalized MIME type.
 * Supports inline base64 payloads or local file paths inside the workspace.
 */
export async function resolveAssetBinary(asset: MediaAssetInput): Promise<ResolvedBinaryPayload | null> {
  const fallbackMime =
    asset.modality === 'motion_video'
      ? 'video/mp4'
      : asset.modality === 'voice_audio'
        ? 'audio/webm'
        : 'image/png';

  if (asset.dataBase64 && asset.dataBase64.trim().length > 16) {
    const { base64, detectedMime } = stripDataUriPrefix(asset.dataBase64);
    if (!base64) return null;
    return {
      base64,
      mimeType: normalizeMimeType(asset.mimeType || detectedMime, fallbackMime),
    };
  }

  if (asset.fileUrl && asset.fileUrl.trim().length > 0) {
    const rawUrl = asset.fileUrl.trim();
    const candidates: string[] = [];

    if (rawUrl.startsWith('file://')) {
      candidates.push(rawUrl.slice('file://'.length));
    } else if (path.isAbsolute(rawUrl)) {
      candidates.push(rawUrl);
      // Also support server-relative URLs like `/uploads/abc.png` or `/artifacts/foo.png`
      const stripped = rawUrl.replace(/^\/+/, '');
      candidates.push(path.join(BACKEND_ROOT, stripped));
      candidates.push(path.join(REPO_ROOT, stripped));
      candidates.push(path.join(REPO_ROOT, 'backend', stripped));
    } else if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      candidates.push(path.join(REPO_ROOT, rawUrl));
      candidates.push(path.join(BACKEND_ROOT, rawUrl));
    }

    for (const candidate of candidates) {
      try {
        const resolved = path.resolve(candidate);
        // Guard against arbitrary reads outside the repo root
        if (!resolved.startsWith(path.resolve(REPO_ROOT))) {
          continue;
        }
        const buf = await fs.readFile(resolved);
        if (buf.byteLength > 0) {
          return {
            base64: buf.toString('base64'),
            mimeType: normalizeMimeType(asset.mimeType, inferMimeFromPath(resolved, fallbackMime)),
          };
        }
      } catch {
        // Try next candidate
      }
    }
  }

  return null;
}

/**
 * Extracts concatenated text from an Interactions API response (`output_text` or `steps`).
 */
export function extractInteractionText(interaction: {
  output_text?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof interaction.output_text === 'string' && interaction.output_text.trim().length > 0) {
    return interaction.output_text.trim();
  }
  if (!Array.isArray(interaction.steps)) return '';
  const chunks: string[] = [];
  for (const step of interaction.steps) {
    if (step?.type === 'model_output' && Array.isArray(step.content)) {
      for (const item of step.content) {
        if (item?.type === 'text' && typeof item.text === 'string') {
          chunks.push(item.text);
        }
      }
    }
  }
  return chunks.join('\n').trim();
}

/**
 * Extracts thought summaries from an Interactions API response's `steps`.
 */
export function extractThoughtSummary(interaction: {
  steps?: Array<{ type?: string; summary?: Array<{ type?: string; text?: string }> }>;
}): string | undefined {
  if (!Array.isArray(interaction.steps)) return undefined;
  const parts: string[] = [];
  for (const step of interaction.steps) {
    if (step?.type === 'thought' && Array.isArray(step.summary)) {
      for (const item of step.summary) {
        if (item?.type === 'text' && typeof item.text === 'string' && item.text.trim()) {
          parts.push(item.text.trim());
        }
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Strips fenced markdown blocks (` ```json ... ``` `) and extracts the first
 * balanced JSON object cleanly, repairing minor trailing commas if present.
 */
export function extractJsonObject<T = Record<string, unknown>>(rawText: string): T | null {
  if (!rawText || typeof rawText !== 'string') return null;

  const trimmed = rawText.trim();

  // Attempt 1: direct parse
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // Continue to fence stripping
  }

  // Attempt 2: strip markdown code fences
  const fenceMatch = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/m.exec(trimmed);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // Continue to balanced-brace extraction
  }

  // Attempt 3: find first balanced `{ ... }` respecting JSON string literals
  const start = candidate.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;
  const slice = candidate.slice(start, end + 1);

  try {
    const parsed: unknown = JSON.parse(slice);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // Attempt 4: remove trailing commas before `}` or `]`
    try {
      const repaired = slice.replace(/,\s*([}\]])/g, '$1');
      const parsed: unknown = JSON.parse(repaired);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as T;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Detects transient Gemini API errors eligible for cross-key retry.
 */
export function isTransientGeminiError(err: unknown): boolean {
  if (!err) return false;
  const record = err as Record<string, unknown>;
  const status = Number(record.status ?? record.statusCode ?? record.code ?? 0);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const message = String(record.message ?? err).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504') ||
    message.includes('unavailable') ||
    message.includes('overloaded') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up')
  );
}

/**
 * Strips markdown code fences around generated source code if the model wrapped a file's contents.
 */
export function stripCodeFence(code: string): string {
  const trimmed = code.trim();
  const match = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/m.exec(trimmed);
  return match ? match[1] : code;
}
