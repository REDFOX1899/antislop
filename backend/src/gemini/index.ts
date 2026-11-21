import type { GeminiCoreEngine } from './contracts.js';
import { generateBespokeAssets } from './assets.js';
import { getPoolStatus, getV1BetaClient, getV1Client, traceSpan } from './clientPool.js';
import { applySurgicalPatch, generateCodeCandidates } from './coder.js';
import { evaluateVisualCandidate } from './critic.js';
import { synthesizeDesignManifest } from './director.js';
import { computeTasteEmbeddingSimilarity } from './embeddings.js';
import { shipToRemoteRepoViaManagedAgent } from './managedAgent.js';
import { transcribeVoice } from './voice.js';

/**
 * Unified Gemini 4 Engine powering AntiSlop across:
 * - Dual Tier-3 API Key Pool + optional LangSmith tracing (`clientPool.ts`)
 * - Voice Transcription (`gemini-3.5-transcribe` -> `voice.ts`)
 * - Multimodal Creative Director (`gemini-4-carbon` / `gemini-4-argon` -> `director.ts`)
 * - Bespoke Editorial Asset Generation (`gemini-nano-banana-2.1` on `v1beta` -> `assets.ts`)
 * - Parallel Architecture Race & Surgical Patching (`gemini-4-neon` / `gemini-4-hydrogen` -> `coder.ts`)
 * - Single-Pass Calibrated Visual Critic (`gemini-decision-1` on `v1beta` -> `critic.ts`)
 * - Multimodal Taste Embeddings (`gemini-embedding-2` -> `embeddings.ts`)
 * - Sandboxed Remote Repo Surgeon (`antigravity-preview-09-2026` on `v1beta` -> `managedAgent.ts`)
 */
export const geminiEngine: GeminiCoreEngine = {
  getPoolStatus,
  transcribeVoice,
  synthesizeDesignManifest,
  generateBespokeAssets,
  generateCodeCandidates,
  applySurgicalPatch,
  evaluateVisualCandidate,
  computeTasteEmbeddingSimilarity,
  shipToRemoteRepoViaManagedAgent,
};

export {
  applySurgicalPatch,
  computeTasteEmbeddingSimilarity,
  evaluateVisualCandidate,
  generateBespokeAssets,
  generateCodeCandidates,
  getPoolStatus,
  getV1BetaClient,
  getV1Client,
  shipToRemoteRepoViaManagedAgent,
  synthesizeDesignManifest,
  traceSpan,
  transcribeVoice,
};

export type {
  BespokeAssetsResult,
  GeminiCoreEngine,
  GeneratedCandidateCode,
  SurgicalPatchResult,
} from './contracts.js';
