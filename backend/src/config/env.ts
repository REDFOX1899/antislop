import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(startDir: string): string {
  let cur = startDir;
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(cur, 'target-repo')) ||
      fs.existsSync(path.join(cur, 'shared', 'types.ts')) ||
      fs.existsSync(path.join(cur, 'env', '.env.example'))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(startDir, '../../..');
}

export const REPO_ROOT = findRepoRoot(__dirname);
export const BACKEND_ROOT = path.join(REPO_ROOT, 'backend');
export const TARGET_REPO_DIR = path.join(REPO_ROOT, 'target-repo');

// Load master env/.env cleanly
dotenv.config({ path: path.join(REPO_ROOT, 'env/.env') });

export const ENV = {
  GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').trim(),
  GEMINI_API_KEY_SECONDARY: (process.env.GEMINI_API_KEY_SECONDARY || '').trim(),
  GEMINI_MODEL_DIRECTOR: process.env.GEMINI_MODEL_DIRECTOR || 'gemini-4-carbon',
  GEMINI_MODEL_ARCHITECT: process.env.GEMINI_MODEL_ARCHITECT || 'gemini-4-neon',
  GEMINI_MODEL_PATCHER: process.env.GEMINI_MODEL_PATCHER || 'gemini-4-hydrogen',
  GEMINI_MODEL_FAST_CRITIC: process.env.GEMINI_MODEL_FAST_CRITIC || 'gemini-4-argon',
  GEMINI_MODEL_DECISIONS: process.env.GEMINI_MODEL_DECISIONS || 'gemini-decision-1',
  GEMINI_MODEL_IMAGE_GEN: process.env.GEMINI_MODEL_IMAGE_GEN || 'gemini-nano-banana-2.1',
  GEMINI_MODEL_EMBEDDING: process.env.GEMINI_MODEL_EMBEDDING || 'gemini-embedding-2',
  GEMINI_MODEL_TRANSCRIBE: process.env.GEMINI_MODEL_TRANSCRIBE || 'gemini-3.5-transcribe',
  GEMINI_MODEL_LIVE: process.env.GEMINI_MODEL_LIVE || 'gemini-3.8-live',
  GEMINI_MANAGED_AGENT_BASE: process.env.GEMINI_MANAGED_AGENT_BASE || 'antigravity-preview-09-2026',

  ANTISLOP_PARALLEL_CANDIDATES: Math.min(4, Math.max(1, Number(process.env.ANTISLOP_PARALLEL_CANDIDATES || 3))),
  ANTISLOP_MAX_CRITIC_ITERATIONS: Math.min(6, Math.max(1, Number(process.env.ANTISLOP_MAX_CRITIC_ITERATIONS || 4))),

  BACKEND_PORT: Number(process.env.PORT || process.env.BACKEND_PORT || 4000),
  TARGET_VITE_PORT: Number(process.env.TARGET_VITE_PORT || 5173),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',

  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || '',
  GCP_REGION: process.env.GCP_REGION || 'us-central1',
  GCS_ARTIFACT_BUCKET: process.env.GCS_ARTIFACT_BUCKET || '',

  LANGSMITH_TRACING: process.env.LANGSMITH_TRACING === 'true',
  LANGSMITH_API_KEY: (process.env.LANGSMITH_API_KEY || '').trim(),
  LANGSMITH_WORKSPACE_ID: (process.env.LANGSMITH_WORKSPACE_ID || '').trim(),
  LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT || 'antislop-gemini4-nyc',
  GITHUB_TOKEN: (process.env.GITHUB_TOKEN || '').trim(),
};
