#!/usr/bin/env node
/**
 * AntiSlop Live Environment & Gemini 4 Smoke Test
 * Verifies every model, API surface (v1 Interactions, v1beta Decisions, v1beta Managed Agents,
 * Nano Banana 2.1, Embedding 2), dual Tier-3 keys, GitHub token, and LangSmith key.
 * NEVER prints raw secrets.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Resolve packages from backend/node_modules
const backendRequire = createRequire(path.join(rootDir, 'backend/package.json'));
const dotenv = backendRequire('dotenv');
dotenv.config({ path: path.join(rootDir, 'env/.env') });

const { GoogleGenAI } = backendRequire('@google/genai');

const results = [];

async function runCheck(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ name, ok: true, ms, detail });
    console.log(`✅ [PASS] ${name} (${ms}ms) — ${detail}`);
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err?.message || String(err);
    results.push({ name, ok: false, ms, detail: msg });
    console.log(`❌ [FAIL] ${name} (${ms}ms) — ${msg}`);
  }
}

const primaryKey = process.env.GEMINI_API_KEY?.trim();
const secondaryKey = process.env.GEMINI_API_KEY_SECONDARY?.trim();

console.log('\n🔬 AntiSlop Gemini 4 & Environment Smoke Test\n' + '='.repeat(60));
console.log(`Primary Key:   ${primaryKey ? `SET (...${primaryKey.slice(-4)})` : 'MISSING'}`);
console.log(`Secondary Key: ${secondaryKey ? `SET (...${secondaryKey.slice(-4)})` : 'NOT SET'}`);
console.log(`GCP Project:   ${process.env.GCP_PROJECT_ID || '(unset)'}`);
console.log(`Parallel N:    ${process.env.ANTISLOP_PARALLEL_CANDIDATES || '3'}`);
console.log('='.repeat(60) + '\n');

const aiPrimaryV1 = primaryKey ? new GoogleGenAI({ apiKey: primaryKey }) : null;
const aiPrimaryBeta = primaryKey ? new GoogleGenAI({ apiKey: primaryKey, apiVersion: 'v1beta' }) : null;
const aiSecondaryV1 = secondaryKey ? new GoogleGenAI({ apiKey: secondaryKey }) : null;
const aiSecondaryBeta = secondaryKey ? new GoogleGenAI({ apiKey: secondaryKey, apiVersion: 'v1beta' }) : null;

// 1. Test Primary Key on gemini-4-hydrogen
await runCheck('Primary Key → gemini-4-hydrogen (Interactions v1)', async () => {
  if (!aiPrimaryV1) throw new Error('GEMINI_API_KEY missing');
  const res = await aiPrimaryV1.interactions.create({
    model: 'gemini-4-hydrogen',
    input: 'Reply with exactly: HYDROGEN_OK',
    generation_config: { thinking_level: 'low' },
  });
  return `id=${res.id?.slice(0, 12)}... text="${(res.output_text || '').trim().slice(0, 40)}"`;
});

// 2. Test Secondary Key on gemini-4-hydrogen
await runCheck('Secondary Key → gemini-4-hydrogen (Interactions v1)', async () => {
  if (!aiSecondaryV1) throw new Error('GEMINI_API_KEY_SECONDARY missing');
  const res = await aiSecondaryV1.interactions.create({
    model: 'gemini-4-hydrogen',
    input: 'Reply with exactly: SECONDARY_OK',
    generation_config: { thinking_level: 'low' },
  });
  return `id=${res.id?.slice(0, 12)}... text="${(res.output_text || '').trim().slice(0, 40)}"`;
});

// Helper: pick whichever key works for remaining model checks (prefer primary, fallback secondary)
const primaryWorked = results[0]?.ok;
const aiV1 = primaryWorked ? aiPrimaryV1 : aiSecondaryV1;
const aiBeta = primaryWorked ? aiPrimaryBeta : aiSecondaryBeta;
const activeKeyLabel = primaryWorked ? 'Primary' : 'Secondary';

// 3. Test gemini-4-carbon (Design Director)
await runCheck(`gemini-4-carbon (${activeKeyLabel}, Interactions v1)`, async () => {
  if (!aiV1) throw new Error('No working Gemini client');
  const res = await aiV1.interactions.create({
    model: 'gemini-4-carbon',
    input: 'Reply with exactly: CARBON_OK',
    generation_config: { thinking_level: 'low' },
  });
  return `text="${(res.output_text || '').trim().slice(0, 40)}"`;
});

// 4. Test gemini-4-neon (Parallel Architect)
await runCheck(`gemini-4-neon (${activeKeyLabel}, Interactions v1)`, async () => {
  if (!aiV1) throw new Error('No working Gemini client');
  const res = await aiV1.interactions.create({
    model: 'gemini-4-neon',
    input: 'Reply with exactly: NEON_OK',
    generation_config: { thinking_level: 'low' },
  });
  return `text="${(res.output_text || '').trim().slice(0, 40)}"`;
});

// 5. Test gemini-decision-1 (Decisions API v1beta — noul + score + choice)
await runCheck(`gemini-decision-1 (${activeKeyLabel}, Decisions API v1beta)`, async () => {
  if (!aiBeta) throw new Error('No working Gemini v1beta client');
  const res = await aiBeta.decisions.create({
    model: 'gemini-decision-1',
    input: 'A generic SaaS landing page with an indigo-to-purple gradient hero, three identical glowing rounded cards, and default Inter font.',
    questions: {
      is_ai_slop: {
        type: 'noul',
        instructions: 'Does this description represent generic AI UI slop?',
      },
      slop_level: {
        type: 'score',
        instructions: 'Rate how generic/AI-slop this UI is.',
        criteria: ['Handcrafted editorial craft', 'Slightly generic', 'Classic AI UI slop'],
      },
      style_class: {
        type: 'choice',
        instructions: 'Classify the dominant aesthetic.',
        criteria: {
          editorial: 'High-craft print/editorial design',
          ai_slop: 'Generic purple gradient SaaS template',
        },
      },
    },
  });
  const noul = res.answers?.is_ai_slop;
  const score = res.answers?.slop_level;
  const choice = res.answers?.style_class;
  return `is_ai_slop=${JSON.stringify(noul)} | slop_level=${JSON.stringify(score)} | style_class=${JSON.stringify(choice)}`;
});

// 6. Test gemini-embedding-2 (Multimodal Embeddings)
await runCheck(`gemini-embedding-2 (${activeKeyLabel}, embedContent)`, async () => {
  if (!aiV1) throw new Error('No working Gemini client');
  const res = await aiV1.models.embedContent({
    model: 'gemini-embedding-2',
    contents: 'Warm editorial Swiss typography on archival cream paper',
  });
  const dims = res.embeddings?.[0]?.values?.length || res.embedding?.values?.length || 0;
  return `embedding_dims=${dims}`;
});

// 7. Test gemini-nano-banana-2.1 (Bespoke Image Generation — response_modalities requires v1beta)
await runCheck(`gemini-nano-banana-2.1 (${activeKeyLabel}, Image Gen v1beta)`, async () => {
  if (!aiBeta) throw new Error('No working Gemini v1beta client');
  const res = await aiBeta.interactions.create({
    model: 'gemini-nano-banana-2.1',
    input: 'Minimalist warm cream linen paper texture with subtle terracotta geometric shadow, editorial photography',
    response_modalities: ['image'],
  });
  const img = res.output_image;
  return img ? `mime=${img.mime_type}, b64_len=${img.data?.length || 0}` : `steps=${res.steps?.length || 0}`;
});

// 8. Test Managed Agents API access (v1beta agents.list)
await runCheck(`Managed Agents v1beta (${activeKeyLabel}, agents.list)`, async () => {
  if (!aiBeta) throw new Error('No working Gemini v1beta client');
  const list = await aiBeta.agents.list();
  const count = Array.isArray(list?.agents) ? list.agents.length : (Array.isArray(list) ? list.length : 0);
  return `accessible=true, existing_custom_agents=${count}`;
});

// 9. Test GitHub Token (if present)
await runCheck('GitHub Token (REST /user)', async () => {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error('GITHUB_TOKEN missing');
  const resp = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'antislop-smoke' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return `authenticated_as=${data.login}`;
});

// 10. Test LangSmith Service Key (POST /api/v1/runs ingest check with X-Tenant-Id workspace header)
await runCheck('LangSmith Service Key (auth & ingest check)', async () => {
  const key = process.env.LANGSMITH_API_KEY?.trim();
  const workspaceId = process.env.LANGSMITH_WORKSPACE_ID?.trim();
  if (!key) throw new Error('LANGSMITH_API_KEY missing');
  const headers = {
    'x-api-key': key,
    'Content-Type': 'application/json',
    ...(workspaceId ? { 'X-Tenant-Id': workspaceId } : {}),
  };
  const resp = await fetch('https://api.smith.langchain.com/api/v1/info', { headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const runId = crypto.randomUUID();
  const ingest = await fetch('https://api.smith.langchain.com/api/v1/runs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: runId,
      name: 'antislop-smoke-test',
      run_type: 'chain',
      session_name: process.env.LANGSMITH_PROJECT || 'default',
      inputs: { check: 'smoke_test' },
      outputs: { status: 'ok' },
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
    }),
  });
  if (!ingest.ok) {
    const txt = await ingest.text();
    throw new Error(`Ingest HTTP ${ingest.status}: ${txt.slice(0, 120)}`);
  }
  return `ingest_ok=true, workspace=${workspaceId?.slice(0, 8)}..., project=${process.env.LANGSMITH_PROJECT || 'default'} (tracing=${process.env.LANGSMITH_TRACING})`;
});

console.log('\n' + '='.repeat(60));
const passed = results.filter((r) => r.ok).length;
console.log(`SUMMARY: ${passed}/${results.length} checks passed.`);
if (passed < results.length) {
  process.exitCode = 1;
}
