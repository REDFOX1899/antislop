#!/usr/bin/env tsx
/**
 * AntiSlop 5-Sigma & Element 119 Automated Evaluation Harness
 *
 * Executes controlled empirical trials against the live AntiSlop backend:
 *   1. Control Group (`text_baseline`)        — naive text-only prompt baseline
 *   2. Treatment 1 (`antislop` + `fast_demo`) — raw multimodal input (<25s live SLA)
 *   3. Treatment 2 (`antislop` + `deep_atelier`) — parallel racing + Decisions API critic loop
 *   4. Element 119 Chaos Stress Tests (`stress_test`) — conflicting styles, dim tilted webcam, contrast trap
 *
 * Outputs:
 *   - benchmarks/results/latest-report.json
 *   - benchmarks/results/REPORT.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type {
  CriticIteration,
  DecisionsScorecard,
  ExecutionSpeedMode,
  InputModality,
  MediaAssetInput,
  TransformRunRequest,
  TransformRunResult,
} from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const RESULTS_DIR = path.join(__dirname, 'results');

const NAIVE_BASELINE_PROMPT = 'Make this landing page look modern, sleek, and premium';
const FAST_DEMO_SLA_MS = 25_000;

type TrialGroup =
  | 'control_text_baseline'
  | 'treatment_fast_demo'
  | 'treatment_deep_atelier'
  | 'element119_stress_test';

interface FixtureRef {
  relPath: string;
  modality: InputModality;
  label: string;
}

interface TrialSpec {
  trialId: string;
  scenarioId: string;
  scenarioTitle: string;
  group: TrialGroup;
  mode: TransformRunRequest['mode'];
  speedMode: ExecutionSpeedMode;
  fixtures: FixtureRef[];
  textPrompt?: string;
  parallelCandidates: number;
  maxIterations: number;
  generateBespokeAssets: boolean;
  expectConflictNotes?: boolean;
  notes: string;
}

interface IterationSnapshot {
  iteration: number;
  phase: CriticIteration['phase'];
  overallTasteScore: number;
  slopPenalty: number;
  aestheticMatch: number;
  typographyCraft: number;
  layoutBroken: number;
  contrastFailing: number;
  embeddingSimilarity?: number;
  passedAllGates: boolean;
  primaryDefectClass?: string;
  candidateCount: number;
}

interface TrialRecord {
  trialId: string;
  scenarioId: string;
  scenarioTitle: string;
  group: TrialGroup;
  mode: TransformRunRequest['mode'];
  speedMode: ExecutionSpeedMode;
  startedAt: string;
  completedAt: string;
  resetOk: boolean;
  resetLatencyMs: number;
  wallClockMs: number;
  backendLatencyMs?: number;
  runId?: string;
  status: TransformRunResult['status'] | 'http_error' | 'timeout';
  errorMessage?: string;
  iterationCount: number;
  modelsInvoked: string[];
  vibeTitle?: string;
  conflictResolutionNotes?: string;
  baselineScreenshotUrl?: string;
  finalScreenshotUrl?: string;
  metrics?: {
    overallTasteScore: number;
    passedAllGates: boolean;
    slopPenalty: number;
    slopPenaltyConfidence: number;
    aestheticMatch: number;
    aestheticMatchConfidence: number;
    typographyCraft: number;
    visualRhythm: number;
    colorHarmony: number;
    motionCohesion: number;
    layoutBroken: number;
    contrastFailing: number;
    genericAiCliche: number;
    productionReady: number;
    dominantAestheticClass?: string;
    primaryDefectClass?: string;
    embeddingSimilarityInitial?: number;
    embeddingSimilarityFinal?: number;
    embeddingSimilarityDelta?: number;
    decisionsLatencyMs: number;
  };
  domAudit?: DecisionsScorecard['domAudit'];
  iterationTrajectory: IterationSnapshot[];
  honestFailureReasons: string[];
}

interface GroupSummary {
  group: TrialGroup;
  label: string;
  totalTrials: number;
  completedTrials: number;
  passedAllGatesCount: number;
  passRatePct: number;
  meanWallClockMs: number | null;
  medianWallClockMs: number | null;
  meanOverallTasteScore: number | null;
  stdOverallTasteScore: number | null;
  meanSlopPenalty: number | null;
  meanAestheticMatch: number | null;
  meanTypographyCraft: number | null;
  meanLayoutBrokenProb: number | null;
  meanContrastFailingProb: number | null;
  meanEmbeddingSimilarity: number | null;
  meanIterations: number | null;
  totalDomDefects: number;
}

interface BenchmarkReport {
  schemaVersion: '1.0.0';
  generatedAt: string;
  backendUrl: string;
  cliOptions: {
    fastOnly: boolean;
    stressOnly: boolean;
    scenarioFilter: string[];
    timeoutMs: number;
  };
  backendHealth?: Record<string, unknown>;
  groupSummaries: Record<TrialGroup, GroupSummary>;
  pairedDeltasVsControl: {
    fastDemoVsControl: Record<string, number | null>;
    deepAtelierVsControl: Record<string, number | null>;
  };
  trials: TrialRecord[];
  honestFailures: Array<{
    trialId: string;
    group: TrialGroup;
    scenarioTitle: string;
    status: TrialRecord['status'];
    reasons: string[];
    primaryDefectClass?: string;
    errorMessage?: string;
  }>;
}

interface CliConfig {
  backendUrl: string;
  fastOnly: boolean;
  stressOnly: boolean;
  scenarioFilter: string[];
  timeoutMs: number;
  pollMs: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliConfig {
  const defaultUrl =
    process.env.ANTISLOP_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    'http://localhost:4000';

  const cfg: CliConfig = {
    backendUrl: defaultUrl.replace(/\/+$/, ''),
    fastOnly: false,
    stressOnly: false,
    scenarioFilter: [],
    timeoutMs: 300_000,
    pollMs: 1_500,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) {
      cfg.backendUrl = argv[++i].replace(/\/+$/, '');
    } else if (arg.startsWith('--url=')) {
      cfg.backendUrl = arg.slice(6).replace(/\/+$/, '');
    } else if (arg === '--fast-only') {
      cfg.fastOnly = true;
    } else if (arg === '--stress-only') {
      cfg.stressOnly = true;
    } else if (arg === '--dry-run') {
      cfg.dryRun = true;
    } else if (arg === '--scenarios' && argv[i + 1]) {
      cfg.scenarioFilter = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--scenarios=')) {
      cfg.scenarioFilter = arg
        .slice(12)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === '--timeout-ms' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n >= 5_000) cfg.timeoutMs = n;
    } else if (arg === '--poll-ms' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n >= 250) cfg.pollMs = n;
    }
  }
  return cfg;
}

function buildTrialSuite(cfg: CliConfig): TrialSpec[] {
  const coreScenarios: Array<{ id: string; title: string; fixture: FixtureRef }> = [
    {
      id: 'swiss-editorial-print',
      title: 'Swiss Editorial Print (Archival Cream + Vermilion)',
      fixture: {
        relPath: 'swiss-editorial-print.png',
        modality: 'moodboard_image',
        label: 'Swiss Editorial Print Monograph',
      },
    },
    {
      id: 'brutalist-tokyo-poster',
      title: 'Brutalist Tokyo Poster (Concrete Grid + Electric Yellow)',
      fixture: {
        relPath: 'brutalist-tokyo-poster.png',
        modality: 'moodboard_image',
        label: 'Brutalist Tokyo Concrete Poster',
      },
    },
    {
      id: 'warm-botanical-atelier',
      title: 'Warm Botanical Atelier (Linen + Heritage Sage + Terracotta)',
      fixture: {
        relPath: 'warm-botanical-atelier.png',
        modality: 'moodboard_image',
        label: 'Warm Botanical Linen Atelier',
      },
    },
  ];

  const controlTrials: TrialSpec[] = coreScenarios.map((s) => ({
    trialId: `control-${s.id}`,
    scenarioId: s.id,
    scenarioTitle: s.title,
    group: 'control_text_baseline',
    mode: 'text_baseline',
    speedMode: 'fast_demo',
    // Ground-truth visual target passed so Decisions API & Embedding-2 score apples-to-apples,
    // while mode='text_baseline' restricts generation to the naive text prompt alone.
    fixtures: [s.fixture],
    textPrompt: NAIVE_BASELINE_PROMPT,
    parallelCandidates: 1,
    maxIterations: 1,
    generateBespokeAssets: false,
    notes: 'Control group: naive text prompt evaluated against unseen ground-truth visual target.',
  }));

  const fastDemoTrials: TrialSpec[] = coreScenarios.map((s) => ({
    trialId: `fast-${s.id}`,
    scenarioId: s.id,
    scenarioTitle: s.title,
    group: 'treatment_fast_demo',
    mode: 'antislop',
    speedMode: 'fast_demo',
    fixtures: [s.fixture],
    parallelCandidates: 1,
    maxIterations: 2,
    generateBespokeAssets: false,
    notes: 'Treatment 1: raw multimodal taste extraction in <25s live demo mode.',
  }));

  const deepAtelierTrials: TrialSpec[] = coreScenarios.map((s) => ({
    trialId: `deep-${s.id}`,
    scenarioId: s.id,
    scenarioTitle: s.title,
    group: 'treatment_deep_atelier',
    mode: 'antislop',
    speedMode: 'deep_atelier',
    fixtures: [s.fixture],
    parallelCandidates: 3,
    maxIterations: 4,
    generateBespokeAssets: true,
    notes: 'Treatment 2: Best-of-3 parallel neon racing + Nano Banana bespoke art + Decisions API critic loop.',
  }));

  const stressTrials: TrialSpec[] = [
    {
      trialId: 'stress-conflicting-chaos-4way',
      scenarioId: 'conflicting-chaos-set',
      scenarioTitle: 'Conflicting 4-Way Chaos Set (Swiss + Cyberpunk + Ceramic + Blueprint)',
      group: 'element119_stress_test',
      mode: 'stress_test',
      speedMode: 'deep_atelier',
      fixtures: [
        {
          relPath: 'conflicting-chaos-set/01-swiss-minimal.png',
          modality: 'moodboard_image',
          label: 'Chaos Ref 1: Swiss Minimal',
        },
        {
          relPath: 'conflicting-chaos-set/02-neon-cyberpunk.png',
          modality: 'moodboard_image',
          label: 'Chaos Ref 2: Neon Cyberpunk',
        },
        {
          relPath: 'conflicting-chaos-set/03-earthy-ceramic-craft.png',
          modality: 'moodboard_image',
          label: 'Chaos Ref 3: Earthy Ceramic Craft',
        },
        {
          relPath: 'conflicting-chaos-set/04-corporate-blueprint.png',
          modality: 'moodboard_image',
          label: 'Chaos Ref 4: Corporate CAD Blueprint',
        },
      ],
      parallelCandidates: 3,
      maxIterations: 4,
      generateBespokeAssets: false,
      expectConflictNotes: true,
      notes: 'Element 119 conflict collapse test: 4 mutually hostile aesthetics fed simultaneously.',
    },
    {
      trialId: 'stress-dim-tilted-webcam',
      scenarioId: 'dim-tilted-webcam-magazine',
      scenarioTitle: 'Dim Tilted Glare-Streaked Webcam Magazine (ISO 3200 Tungsten)',
      group: 'element119_stress_test',
      mode: 'stress_test',
      speedMode: 'deep_atelier',
      fixtures: [
        {
          relPath: 'dim-tilted-webcam-magazine.png',
          modality: 'webcam_frame',
          label: 'Messy Low-Light Tilted Physical Magazine Webcam Capture',
        },
      ],
      parallelCandidates: 3,
      maxIterations: 4,
      generateBespokeAssets: false,
      notes: 'Element 119 physical webcam test: tungsten cast, glare streak, tilted cover, desk clutter & thumb.',
    },
    {
      trialId: 'stress-high-contrast-photo-trap',
      scenarioId: 'high-contrast-photo-trap',
      scenarioTitle: 'High-Contrast Chiaroscuro Photo Trap (Obsidian + Bright Daylight Beams)',
      group: 'element119_stress_test',
      mode: 'stress_test',
      speedMode: 'deep_atelier',
      fixtures: [
        {
          relPath: 'high-contrast-photo-trap.png',
          modality: 'moodboard_image',
          label: 'High-Contrast Chiaroscuro Editorial Photo Trap',
        },
      ],
      parallelCandidates: 3,
      maxIterations: 4,
      generateBespokeAssets: true,
      notes: 'Element 119 legibility trap: tests whether contrast_failing gate catches text over harsh luminance beams.',
    },
    {
      trialId: 'stress-mixed-hostile-overload',
      scenarioId: 'mixed-hostile-overload',
      scenarioTitle: 'Hostile Mixed-Modality Overload (4 Clashing Styles + Dim Glare Webcam)',
      group: 'element119_stress_test',
      mode: 'stress_test',
      speedMode: 'deep_atelier',
      fixtures: [
        {
          relPath: 'conflicting-chaos-set/01-swiss-minimal.png',
          modality: 'moodboard_image',
          label: 'Hostile Mix 1: Swiss Minimal',
        },
        {
          relPath: 'conflicting-chaos-set/02-neon-cyberpunk.png',
          modality: 'moodboard_image',
          label: 'Hostile Mix 2: Neon Cyberpunk',
        },
        {
          relPath: 'conflicting-chaos-set/03-earthy-ceramic-craft.png',
          modality: 'moodboard_image',
          label: 'Hostile Mix 3: Earthy Ceramic',
        },
        {
          relPath: 'conflicting-chaos-set/04-corporate-blueprint.png',
          modality: 'moodboard_image',
          label: 'Hostile Mix 4: Blueprint CAD',
        },
        {
          relPath: 'dim-tilted-webcam-magazine.png',
          modality: 'webcam_frame',
          label: 'Hostile Mix 5: Dim Tilted Glare Webcam',
        },
      ],
      parallelCandidates: 3,
      maxIterations: 4,
      generateBespokeAssets: false,
      expectConflictNotes: true,
      notes: 'Element 119 breaking-point stress test: combines 4 conflicting styles AND messy low-light webcam capture.',
    },
  ];

  let suite: TrialSpec[];
  if (cfg.stressOnly) {
    suite = stressTrials;
  } else if (cfg.fastOnly) {
    suite = [...controlTrials, ...fastDemoTrials, ...stressTrials.slice(0, 2)];
  } else {
    suite = [...controlTrials, ...fastDemoTrials, ...deepAtelierTrials, ...stressTrials];
  }

  if (cfg.scenarioFilter.length > 0) {
    const needles = cfg.scenarioFilter.map((s) => s.toLowerCase());
    suite = suite.filter((t) =>
      needles.some(
        (n) =>
          t.trialId.toLowerCase().includes(n) ||
          t.scenarioId.toLowerCase().includes(n) ||
          t.group.toLowerCase().includes(n)
      )
    );
  }

  return suite;
}

async function ensureFixturesPresent(suite: TrialSpec[]): Promise<void> {
  const uniquePaths = new Set<string>();
  for (const trial of suite) {
    for (const f of trial.fixtures) {
      uniquePaths.add(path.join(FIXTURES_DIR, f.relPath));
    }
  }
  const missing: string[] = [];
  for (const p of uniquePaths) {
    try {
      await fs.access(p);
    } catch {
      missing.push(p);
    }
  }
  if (missing.length > 0) {
    console.log(`⚠️  Missing ${missing.length} fixture PNG(s). Generating automatically via generate-fixtures.mjs...`);
    execFileSync(process.execPath, [path.join(FIXTURES_DIR, 'generate-fixtures.mjs')], {
      stdio: 'inherit',
    });
  }
}

async function loadAssetsForTrial(trial: TrialSpec): Promise<MediaAssetInput[]> {
  const assets: MediaAssetInput[] = [];
  for (let i = 0; i < trial.fixtures.length; i++) {
    const ref = trial.fixtures[i];
    const absPath = path.join(FIXTURES_DIR, ref.relPath);
    const buf = await fs.readFile(absPath);
    assets.push({
      id: `${trial.trialId}-asset-${i + 1}`,
      modality: ref.modality,
      mimeType: 'image/png',
      dataBase64: buf.toString('base64'),
      filename: path.basename(ref.relPath),
      label: ref.label,
    });
  }
  return assets;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ status: number; ok: boolean; data?: T; rawText?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let data: T | undefined;
    try {
      data = text ? (JSON.parse(text) as T) : undefined;
    } catch {
      // Non-JSON payload preserved in rawText
    }
    return { status: res.status, ok: res.ok, data, rawText: text };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCompletedResult(obj: unknown): obj is TransformRunResult {
  if (!obj || typeof obj !== 'object') return false;
  const r = obj as Partial<TransformRunResult>;
  return (
    typeof r.runId === 'string' &&
    typeof r.status === 'string' &&
    r.status !== 'running' &&
    Array.isArray(r.iterations)
  );
}

async function executeTransformAndAwait(
  backendUrl: string,
  request: TransformRunRequest,
  timeoutMs: number,
  pollMs: number
): Promise<TransformRunResult> {
  const deadline = Date.now() + timeoutMs;
  const startResp = await fetchJsonWithTimeout<
    TransformRunResult | { runId?: string; status?: string; result?: TransformRunResult; error?: string }
  >(
    `${backendUrl}/api/transform`,
    { method: 'POST', body: JSON.stringify(request) },
    Math.min(timeoutMs, 120_000)
  );

  if (!startResp.ok) {
    const errDetail =
      (startResp.data && 'error' in startResp.data && typeof startResp.data.error === 'string'
        ? startResp.data.error
        : startResp.rawText?.slice(0, 280)) || `HTTP ${startResp.status}`;
    throw new Error(`POST /api/transform failed (${startResp.status}): ${errDetail}`);
  }

  const body = startResp.data;
  if (isCompletedResult(body)) {
    return body;
  }
  if (body && 'result' in body && isCompletedResult(body.result)) {
    return body.result;
  }

  const runId = body && 'runId' in body && typeof body.runId === 'string' ? body.runId : undefined;
  if (!runId) {
    throw new Error(`POST /api/transform returned neither a completed TransformRunResult nor a runId.`);
  }

  // Poll GET /api/runs/:runId until terminal status or timeout
  let lastStatus = 'running';
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const remaining = Math.max(5_000, deadline - Date.now());
    const pollResp = await fetchJsonWithTimeout<TransformRunResult>(
      `${backendUrl}/api/runs/${encodeURIComponent(runId)}`,
      { method: 'GET' },
      Math.min(remaining, 30_000)
    );
    if (pollResp.ok && pollResp.data) {
      lastStatus = pollResp.data.status;
      if (isCompletedResult(pollResp.data)) {
        return pollResp.data;
      }
    }
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for run ${runId} (lastStatus=${lastStatus})`);
}

function collectHonestFailureReasons(trial: TrialSpec, result: TransformRunResult, wallClockMs: number): string[] {
  const reasons: string[] = [];
  if (result.status === 'failed') {
    reasons.push('Backend reported terminal status=failed');
  } else if (result.status === 'max_iterations_reached') {
    reasons.push(`Reached max_iterations (${result.iterations.length}/${trial.maxIterations}) without passing all Decisions API gates`);
  }

  const finalIter = result.iterations[result.iterations.length - 1];
  const sc = finalIter?.scorecard;
  if (!sc) {
    reasons.push('No DecisionsScorecard recorded in iterations');
    return reasons;
  }

  if (!sc.passedAllGates) {
    reasons.push(`passedAllGates=false (overallTasteScore=${sc.overallTasteScore.toFixed(1)}/100)`);
  }
  if (sc.metrics.slopPenalty.value > 3.0 || !sc.metrics.slopPenalty.passed) {
    reasons.push(`AI slop threshold breached: slopPenalty=${sc.metrics.slopPenalty.value.toFixed(2)}/10`);
  }
  if (sc.metrics.aestheticMatch.value < 7.5 || !sc.metrics.aestheticMatch.passed) {
    reasons.push(`Aesthetic fidelity below bar: aestheticMatch=${sc.metrics.aestheticMatch.value.toFixed(2)}/10`);
  }
  if (sc.metrics.layoutBroken.value > 0.35 || !sc.metrics.layoutBroken.passed) {
    reasons.push(`Layout integrity risk: layoutBroken prob=${sc.metrics.layoutBroken.value.toFixed(3)}`);
  }
  if (sc.metrics.contrastFailing.value > 0.35 || !sc.metrics.contrastFailing.passed) {
    reasons.push(`Contrast legibility failure: contrastFailing prob=${sc.metrics.contrastFailing.value.toFixed(3)}`);
  }

  if (sc.domAudit.horizontalOverflowPx > 0) {
    reasons.push(`DOM horizontal overflow detected (${sc.domAudit.horizontalOverflowPx}px)`);
  }
  if (sc.domAudit.overlappingTextNodes > 0) {
    reasons.push(`DOM overlapping text nodes detected (${sc.domAudit.overlappingTextNodes})`);
  }
  if (sc.domAudit.brokenImageCount > 0) {
    reasons.push(`Broken <img> elements detected (${sc.domAudit.brokenImageCount})`);
  }
  if (sc.domAudit.consoleErrorCount > 0) {
    reasons.push(`Browser console runtime errors detected (${sc.domAudit.consoleErrorCount})`);
  }

  if (trial.group === 'treatment_fast_demo' && wallClockMs > FAST_DEMO_SLA_MS) {
    reasons.push(`fast_demo latency SLA exceeded: ${(wallClockMs / 1000).toFixed(1)}s > 25.0s target`);
  }

  if (trial.expectConflictNotes && (!result.manifest?.conflictResolutionNotes || result.manifest.conflictResolutionNotes.trim().length < 10)) {
    reasons.push('Multi-style conflict test missing substantive manifest.conflictResolutionNotes');
  }

  return reasons;
}

async function runSingleTrial(trial: TrialSpec, cfg: CliConfig): Promise<TrialRecord> {
  const startedAt = new Date().toISOString();
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🧪 [${trial.group}] ${trial.trialId}`);
  console.log(`   Scenario: ${trial.scenarioTitle}`);
  console.log(`   Mode: ${trial.mode} | Speed: ${trial.speedMode} | Parallel: ${trial.parallelCandidates} | MaxIter: ${trial.maxIterations}`);

  // Step 1: Reset baseline snapshot so every trial starts from the exact identical AI-Slop baseline
  let resetOk = false;
  let resetLatencyMs = 0;
  const tReset = Date.now();
  try {
    const resetResp = await fetchJsonWithTimeout<{ ok?: boolean }>(
      `${cfg.backendUrl}/api/snapshot/reset`,
      { method: 'POST', body: JSON.stringify({}) },
      30_000
    );
    resetLatencyMs = Date.now() - tReset;
    resetOk = resetResp.ok;
    if (!resetOk) {
      console.warn(`   ⚠️  POST /api/snapshot/reset returned HTTP ${resetResp.status} (${resetLatencyMs}ms)`);
    } else {
      console.log(`   ↺ Baseline reset OK (${resetLatencyMs}ms)`);
    }
  } catch (err) {
    resetLatencyMs = Date.now() - tReset;
    console.warn(`   ⚠️  Baseline reset error: ${(err as Error).message}`);
  }

  // Step 2: Load raw PNG assets and invoke /api/transform
  const assets = await loadAssetsForTrial(trial);
  const reqBody: TransformRunRequest = {
    mode: trial.mode,
    speedMode: trial.speedMode,
    assets,
    textPrompt: trial.textPrompt,
    parallelCandidates: trial.parallelCandidates,
    maxIterations: trial.maxIterations,
    generateBespokeAssets: trial.generateBespokeAssets,
  };

  const t0 = Date.now();
  try {
    const result = await executeTransformAndAwait(cfg.backendUrl, reqBody, cfg.timeoutMs, cfg.pollMs);
    const wallClockMs = Date.now() - t0;
    const completedAt = new Date().toISOString();

    const trajectory: IterationSnapshot[] = result.iterations.map((it) => ({
      iteration: it.iteration,
      phase: it.phase,
      overallTasteScore: it.scorecard.overallTasteScore,
      slopPenalty: it.scorecard.metrics.slopPenalty.value,
      aestheticMatch: it.scorecard.metrics.aestheticMatch.value,
      typographyCraft: it.scorecard.metrics.typographyCraft.value,
      layoutBroken: it.scorecard.metrics.layoutBroken.value,
      contrastFailing: it.scorecard.metrics.contrastFailing.value,
      embeddingSimilarity: it.scorecard.embeddingSimilarity,
      passedAllGates: it.scorecard.passedAllGates,
      primaryDefectClass: it.scorecard.metrics.primaryDefectClass?.choiceLabel,
      candidateCount: it.candidates.length,
    }));

    const firstSc = result.iterations[0]?.scorecard;
    const finalSc = result.iterations[result.iterations.length - 1]?.scorecard;
    const embInit = firstSc?.embeddingSimilarity;
    const embFinal = finalSc?.embeddingSimilarity;
    const embDelta =
      typeof embInit === 'number' && typeof embFinal === 'number'
        ? Number((embFinal - embInit).toFixed(4))
        : undefined;

    const honestFailureReasons = collectHonestFailureReasons(trial, result, wallClockMs);

    const record: TrialRecord = {
      trialId: trial.trialId,
      scenarioId: trial.scenarioId,
      scenarioTitle: trial.scenarioTitle,
      group: trial.group,
      mode: trial.mode,
      speedMode: trial.speedMode,
      startedAt,
      completedAt,
      resetOk,
      resetLatencyMs,
      wallClockMs,
      backendLatencyMs: result.totalLatencyMs,
      runId: result.runId,
      status: result.status,
      iterationCount: result.iterations.length,
      modelsInvoked: result.modelsInvoked ?? [],
      vibeTitle: result.manifest?.vibeTitle,
      conflictResolutionNotes: result.manifest?.conflictResolutionNotes,
      baselineScreenshotUrl: result.baselineScreenshotUrl,
      finalScreenshotUrl: result.finalScreenshotUrl,
      metrics: finalSc
        ? {
            overallTasteScore: finalSc.overallTasteScore,
            passedAllGates: finalSc.passedAllGates,
            slopPenalty: finalSc.metrics.slopPenalty.value,
            slopPenaltyConfidence: finalSc.metrics.slopPenalty.confidence,
            aestheticMatch: finalSc.metrics.aestheticMatch.value,
            aestheticMatchConfidence: finalSc.metrics.aestheticMatch.confidence,
            typographyCraft: finalSc.metrics.typographyCraft.value,
            visualRhythm: finalSc.metrics.visualRhythm.value,
            colorHarmony: finalSc.metrics.colorHarmony.value,
            motionCohesion: finalSc.metrics.motionCohesion.value,
            layoutBroken: finalSc.metrics.layoutBroken.value,
            contrastFailing: finalSc.metrics.contrastFailing.value,
            genericAiCliche: finalSc.metrics.genericAiCliché.value,
            productionReady: finalSc.metrics.productionReady.value,
            dominantAestheticClass: finalSc.metrics.dominantAestheticClass?.choiceLabel,
            primaryDefectClass: finalSc.metrics.primaryDefectClass?.choiceLabel,
            embeddingSimilarityInitial: embInit,
            embeddingSimilarityFinal: embFinal,
            embeddingSimilarityDelta: embDelta,
            decisionsLatencyMs: finalSc.latencyMs,
          }
        : undefined,
      domAudit: finalSc?.domAudit,
      iterationTrajectory: trajectory,
      honestFailureReasons,
    };

    const badge = finalSc?.passedAllGates ? '✅ PASS' : '⚠️  FAIL/PARTIAL';
    console.log(
      `   ${badge} | Taste=${finalSc ? finalSc.overallTasteScore.toFixed(1) : 'N/A'} | ` +
        `Slop=${finalSc ? finalSc.metrics.slopPenalty.value.toFixed(2) : 'N/A'} | ` +
        `Match=${finalSc ? finalSc.metrics.aestheticMatch.value.toFixed(2) : 'N/A'} | ` +
        `Typo=${finalSc ? finalSc.metrics.typographyCraft.value.toFixed(2) : 'N/A'} | ` +
        `Emb=${typeof embFinal === 'number' ? embFinal.toFixed(3) : 'N/A'} | ` +
        `Iter=${result.iterations.length} | ${(wallClockMs / 1000).toFixed(1)}s`
    );
    if (honestFailureReasons.length > 0) {
      for (const r of honestFailureReasons) {
        console.log(`   ↳ Honest failure flag: ${r}`);
      }
    }
    return record;
  } catch (err) {
    const wallClockMs = Date.now() - t0;
    const message = (err as Error).message || String(err);
    const isTimeout = message.toLowerCase().includes('timed out') || message.toLowerCase().includes('abort');
    console.error(`   ❌ ERROR (${(wallClockMs / 1000).toFixed(1)}s): ${message}`);
    return {
      trialId: trial.trialId,
      scenarioId: trial.scenarioId,
      scenarioTitle: trial.scenarioTitle,
      group: trial.group,
      mode: trial.mode,
      speedMode: trial.speedMode,
      startedAt,
      completedAt: new Date().toISOString(),
      resetOk,
      resetLatencyMs,
      wallClockMs,
      status: isTimeout ? 'timeout' : 'http_error',
      errorMessage: message,
      iterationCount: 0,
      modelsInvoked: [],
      iterationTrajectory: [],
      honestFailureReasons: [`Execution failed: ${message}`],
    };
  }
}

function mean(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3));
}

function median(vals: number[]): number | null {
  if (vals.length === 0) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const v = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Number(v.toFixed(3));
}

function stdDev(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((acc, v) => acc + (v - m) ** 2, 0) / (vals.length - 1);
  return Number(Math.sqrt(variance).toFixed(3));
}

function cohensD(treat: number[], ctrl: number[]): number | null {
  if (treat.length < 2 || ctrl.length < 2) return null;
  const mT = treat.reduce((a, b) => a + b, 0) / treat.length;
  const mC = ctrl.reduce((a, b) => a + b, 0) / ctrl.length;
  const vT = treat.reduce((a, v) => a + (v - mT) ** 2, 0) / (treat.length - 1);
  const vC = ctrl.reduce((a, v) => a + (v - mC) ** 2, 0) / (ctrl.length - 1);
  const pooled = Math.sqrt(((treat.length - 1) * vT + (ctrl.length - 1) * vC) / (treat.length + ctrl.length - 2));
  if (pooled === 0) return null;
  return Number(((mT - mC) / pooled).toFixed(3));
}

function summarizeGroup(group: TrialGroup, label: string, trials: TrialRecord[]): GroupSummary {
  const subset = trials.filter((t) => t.group === group);
  const scored = subset.filter((t) => Boolean(t.metrics));
  const passed = scored.filter((t) => t.metrics?.passedAllGates).length;
  const domDefects = subset.reduce((acc, t) => {
    if (!t.domAudit) return acc;
    return (
      acc +
      (t.domAudit.horizontalOverflowPx > 0 ? 1 : 0) +
      t.domAudit.overlappingTextNodes +
      t.domAudit.brokenImageCount +
      t.domAudit.consoleErrorCount
    );
  }, 0);

  return {
    group,
    label,
    totalTrials: subset.length,
    completedTrials: scored.length,
    passedAllGatesCount: passed,
    passRatePct: subset.length > 0 ? Number(((passed / subset.length) * 100).toFixed(1)) : 0,
    meanWallClockMs: mean(scored.map((t) => t.wallClockMs)),
    medianWallClockMs: median(scored.map((t) => t.wallClockMs)),
    meanOverallTasteScore: mean(scored.map((t) => t.metrics!.overallTasteScore)),
    stdOverallTasteScore: stdDev(scored.map((t) => t.metrics!.overallTasteScore)),
    meanSlopPenalty: mean(scored.map((t) => t.metrics!.slopPenalty)),
    meanAestheticMatch: mean(scored.map((t) => t.metrics!.aestheticMatch)),
    meanTypographyCraft: mean(scored.map((t) => t.metrics!.typographyCraft)),
    meanLayoutBrokenProb: mean(scored.map((t) => t.metrics!.layoutBroken)),
    meanContrastFailingProb: mean(scored.map((t) => t.metrics!.contrastFailing)),
    meanEmbeddingSimilarity: mean(
      scored
        .map((t) => t.metrics!.embeddingSimilarityFinal)
        .filter((v): v is number => typeof v === 'number')
    ),
    meanIterations: mean(scored.map((t) => t.iterationCount)),
    totalDomDefects: domDefects,
  };
}

function computeDeltas(
  treatment: TrialRecord[],
  control: TrialRecord[]
): Record<string, number | null> {
  const tScored = treatment.filter((t) => t.metrics);
  const cScored = control.filter((t) => t.metrics);
  const diff = (a: number | null, b: number | null) =>
    a !== null && b !== null ? Number((a - b).toFixed(3)) : null;

  const tTaste = tScored.map((t) => t.metrics!.overallTasteScore);
  const cTaste = cScored.map((t) => t.metrics!.overallTasteScore);

  return {
    deltaOverallTasteScore: diff(mean(tTaste), mean(cTaste)),
    cohensDOverallTaste: cohensD(tTaste, cTaste),
    deltaSlopPenalty: diff(
      mean(tScored.map((t) => t.metrics!.slopPenalty)),
      mean(cScored.map((t) => t.metrics!.slopPenalty))
    ),
    deltaAestheticMatch: diff(
      mean(tScored.map((t) => t.metrics!.aestheticMatch)),
      mean(cScored.map((t) => t.metrics!.aestheticMatch))
    ),
    deltaTypographyCraft: diff(
      mean(tScored.map((t) => t.metrics!.typographyCraft)),
      mean(cScored.map((t) => t.metrics!.typographyCraft))
    ),
    deltaEmbeddingSimilarity: diff(
      mean(
        tScored
          .map((t) => t.metrics!.embeddingSimilarityFinal)
          .filter((v): v is number => typeof v === 'number')
      ),
      mean(
        cScored
          .map((t) => t.metrics!.embeddingSimilarityFinal)
          .filter((v): v is number => typeof v === 'number')
      )
    ),
  };
}

function fmt(n: number | null | undefined, digits = 2, suffix = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}${suffix}`;
}

function fmtSigned(n: number | null | undefined, digits = 2, suffix = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}${suffix}`;
}

function fmtSec(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderMarkdownReport(report: BenchmarkReport): string {
  const groups: TrialGroup[] = [
    'control_text_baseline',
    'treatment_fast_demo',
    'treatment_deep_atelier',
    'element119_stress_test',
  ];

  const lines: string[] = [
    '# AntiSlop 5-Sigma & Element 119 Empirical Benchmark Report',
    '',
    `> **Generated:** \`${report.generatedAt}\`  `,
    `> **Backend Under Test:** \`${report.backendUrl}\`  `,
    `> **Total Trials Executed:** ${report.trials.length}  `,
    `> **Methodology:** Every trial calls \`POST /api/snapshot/reset\` before execution so all groups start from the exact identical NovaFlow AI-Slop baseline. Visual quality is scored in a single calibrated prefill pass by \`gemini-decision-1\` (\`v1beta\`) alongside multimodal cosine similarity from \`gemini-embedding-2\` and deterministic Puppeteer DOM audits.`,
    '',
    '---',
    '',
    '## 1. Executive 5-Sigma Group Summary',
    '',
    '| Evaluation Group | Trials (Pass / N) | Pass Rate | Overall Taste (0–100) ↑ | Slop Penalty (0–10) ↓ | Aesthetic Match (0–10) ↑ | Typography Craft (0–10) ↑ | Layout Broken Prob ↓ | Contrast Fail Prob ↓ | Embed-2 Cosine ↑ | Avg Iters | DOM Defects ↓ | Mean Latency |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const g of groups) {
    const s = report.groupSummaries[g];
    if (s.totalTrials === 0) continue;
    lines.push(
      `| **${s.label}** | ${s.passedAllGatesCount}/${s.totalTrials} | ${fmt(s.passRatePct, 1, '%')} | **${fmt(s.meanOverallTasteScore, 1)}** | ${fmt(s.meanSlopPenalty, 2)} | ${fmt(s.meanAestheticMatch, 2)} | ${fmt(s.meanTypographyCraft, 2)} | ${fmt(s.meanLayoutBrokenProb, 3)} | ${fmt(s.meanContrastFailingProb, 3)} | ${fmt(s.meanEmbeddingSimilarity, 3)} | ${fmt(s.meanIterations, 1)} | ${s.totalDomDefects} | ${fmtSec(s.meanWallClockMs)} |`
    );
  }

  const dFast = report.pairedDeltasVsControl.fastDemoVsControl;
  const dDeep = report.pairedDeltasVsControl.deepAtelierVsControl;

  lines.push(
    '',
    '### Lift vs. Naive Text-Only Control Baseline (`"Make this landing page look modern, sleek, and premium"`)',
    '',
    '| Treatment vs. Control | Δ Overall Taste ↑ | Effect Size (Cohen\'s d) | Δ Slop Penalty ↓ | Δ Aesthetic Match ↑ | Δ Typography Craft ↑ | Δ Embedding-2 Cosine ↑ |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :---: |',
    `| **Treatment 1 (\`fast_demo\`)** | **${fmtSigned(dFast.deltaOverallTasteScore, 1)}** | ${fmt(dFast.cohensDOverallTaste, 2)} | ${fmtSigned(dFast.deltaSlopPenalty, 2)} | ${fmtSigned(dFast.deltaAestheticMatch, 2)} | ${fmtSigned(dFast.deltaTypographyCraft, 2)} | ${fmtSigned(dFast.deltaEmbeddingSimilarity, 3)} |`,
    `| **Treatment 2 (\`deep_atelier\`)** | **${fmtSigned(dDeep.deltaOverallTasteScore, 1)}** | ${fmt(dDeep.cohensDOverallTaste, 2)} | ${fmtSigned(dDeep.deltaSlopPenalty, 2)} | ${fmtSigned(dDeep.deltaAestheticMatch, 2)} | ${fmtSigned(dDeep.deltaTypographyCraft, 2)} | ${fmtSigned(dDeep.deltaEmbeddingSimilarity, 3)} |`,
    '',
    '---',
    '',
    '## 2. Per-Trial Telemetry Breakdown',
    '',
    '| Trial ID | Group | Status | Taste ↑ | Slop ↓ | Match ↑ | Typo ↑ | LayoutFail ↓ | ContrastFail ↓ | Embed-2 ↑ | Iters | DOM (Ovf/Ovlp/Img/Err) | Wall Time | Dominant Class | Primary Defect |',
    '| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |'
  );

  for (const t of report.trials) {
    const m = t.metrics;
    const d = t.domAudit;
    const domStr = d
      ? `${d.horizontalOverflowPx}px/${d.overlappingTextNodes}/${d.brokenImageCount}/${d.consoleErrorCount}`
      : '—';
    const statusBadge =
      m?.passedAllGates && t.status === 'passed'
        ? 'PASS'
        : t.status === 'http_error' || t.status === 'timeout'
          ? t.status.toUpperCase()
          : `PARTIAL (${t.status})`;

    lines.push(
      `| \`${t.trialId}\` | ${t.group} | **${statusBadge}** | ${fmt(m?.overallTasteScore, 1)} | ${fmt(m?.slopPenalty, 2)} | ${fmt(m?.aestheticMatch, 2)} | ${fmt(m?.typographyCraft, 2)} | ${fmt(m?.layoutBroken, 3)} | ${fmt(m?.contrastFailing, 3)} | ${fmt(m?.embeddingSimilarityFinal, 3)} | ${t.iterationCount} | ${domStr} | ${fmtSec(t.wallClockMs)} | ${m?.dominantAestheticClass || '—'} | ${m?.primaryDefectClass || '—'} |`
    );
  }

  lines.push(
    '',
    '---',
    '',
    '## 3. Autonomous Critic Loop Convergence Trajectories',
    '',
    '| Trial ID | Iteration Progression (Taste Score → Slop Penalty → Aesthetic Match) | Embedding-2 Drift (Init → Final) |',
    '| :--- | :--- | :---: |'
  );

  for (const t of report.trials) {
    const traj =
      t.iterationTrajectory.length > 0
        ? t.iterationTrajectory
            .map(
              (it) =>
                `Iter ${it.iteration} (${it.phase}): **${it.overallTasteScore.toFixed(1)}** [slop ${it.slopPenalty.toFixed(1)}, match ${it.aestheticMatch.toFixed(1)}]`
            )
            .join(' → ')
        : '_No iterations completed_';
    const embStr =
      typeof t.metrics?.embeddingSimilarityInitial === 'number' &&
      typeof t.metrics?.embeddingSimilarityFinal === 'number'
        ? `${t.metrics.embeddingSimilarityInitial.toFixed(3)} → ${t.metrics.embeddingSimilarityFinal.toFixed(3)} (${fmtSigned(t.metrics.embeddingSimilarityDelta, 3)})`
        : '—';
    lines.push(`| \`${t.trialId}\` | ${traj} | ${embStr} |`);
  }

  lines.push(
    '',
    '---',
    '',
    '## 4. Element 119 Chaos Stress Tests (Conflict Arbitration & Hostile Inputs)',
    ''
  );

  const stressTrials = report.trials.filter((t) => t.group === 'element119_stress_test');
  if (stressTrials.length === 0) {
    lines.push('_No Element 119 stress trials were selected in this run._');
  } else {
    lines.push(
      '| Stress Scenario | Gate Passed | Overall Taste | Slop ↓ | ContrastFail ↓ | Vibe Synthesized | Conflict Arbitration Notes |',
      '| :--- | :---: | :---: | :---: | :---: | :--- | :--- |'
    );
    for (const t of stressTrials) {
      const conflictNote = (t.conflictResolutionNotes || '*(none recorded)*')
        .replace(/\|/g, '\\|')
        .replace(/\n+/g, ' ')
        .slice(0, 160);
      lines.push(
        `| **${t.scenarioTitle}** | ${t.metrics?.passedAllGates ? 'YES' : 'NO'} | ${fmt(t.metrics?.overallTasteScore, 1)} | ${fmt(t.metrics?.slopPenalty, 2)} | ${fmt(t.metrics?.contrastFailing, 3)} | ${(t.vibeTitle || '—').replace(/\|/g, '\\|')} | ${conflictNote} |`
      );
    }
  }

  lines.push(
    '',
    '---',
    '',
    '## 5. Honest Failure Cases & Remaining Breaking Points',
    '',
    '> Every failed gate, SLA breach, DOM regression, missing conflict arbitration, or runtime error observed during execution is logged verbatim below — zero cherry-picking.',
    ''
  );

  if (report.honestFailures.length === 0) {
    lines.push('All executed trials satisfied every `gemini-decision-1` gate, DOM audit check, and latency SLA with zero recorded failures.');
  } else {
    for (const f of report.honestFailures) {
      lines.push(`### \`${f.trialId}\` (${f.group}) — ${f.scenarioTitle}`);
      lines.push(`- **Status:** \`${f.status}\`${f.primaryDefectClass ? ` · **Primary Defect Class:** \`${f.primaryDefectClass}\`` : ''}`);
      if (f.errorMessage) {
        lines.push(`- **Error:** ${f.errorMessage}`);
      }
      for (const reason of f.reasons) {
        lines.push(`- ${reason}`);
      }
      lines.push('');
    }
  }

  lines.push(
    '---',
    '',
    '_Generated automatically by `benchmarks/run-5sigma.ts`. Raw structured telemetry is archived in `benchmarks/results/latest-report.json`._',
    ''
  );

  return lines.join('\n');
}

async function main(): Promise<void> {
  const cfg = parseArgs(process.argv.slice(2));
  const suite = buildTrialSuite(cfg);

  console.log('\n🔬 AntiSlop 5-Sigma & Element 119 Benchmark Harness');
  console.log('='.repeat(72));
  console.log(`Backend URL:     ${cfg.backendUrl}`);
  console.log(`Selected Trials: ${suite.length} (fastOnly=${cfg.fastOnly}, stressOnly=${cfg.stressOnly}, dryRun=${cfg.dryRun})`);
  console.log(`Per-Trial Limit: ${(cfg.timeoutMs / 1000).toFixed(0)}s`);
  console.log('='.repeat(72));

  if (suite.length === 0) {
    console.error('❌ No trials matched the provided CLI filter.');
    process.exit(1);
  }

  await ensureFixturesPresent(suite);

  if (cfg.dryRun) {
    console.log('\n🧪 DRY RUN — verifying fixture readability & payload construction...');
    for (const trial of suite) {
      const assets = await loadAssetsForTrial(trial);
      const kb = assets.reduce((sum, a) => sum + ((a.dataBase64?.length ?? 0) * 3) / 4 / 1024, 0);
      console.log(`  ✓ ${trial.trialId.padEnd(36)} | ${trial.group.padEnd(23)} | ${assets.length} asset(s) (${kb.toFixed(0)} KB)`);
    }
    try {
      const health = await fetchJsonWithTimeout<Record<string, unknown>>(`${cfg.backendUrl}/api/health`, { method: 'GET' }, 5_000);
      console.log(`\n🌐 Backend /api/health: ${health.ok ? 'REACHABLE' : `HTTP ${health.status}`}`);
    } catch {
      console.log(`\n🌐 Backend /api/health: offline (expected if server not booted yet).`);
    }
    console.log('\n✅ Dry run complete.');
    return;
  }

  // Pre-flight backend health check
  let backendHealth: Record<string, unknown> | undefined;
  try {
    const healthResp = await fetchJsonWithTimeout<Record<string, unknown>>(
      `${cfg.backendUrl}/api/health`,
      { method: 'GET' },
      10_000
    );
    if (!healthResp.ok) {
      throw new Error(`HTTP ${healthResp.status}: ${healthResp.rawText?.slice(0, 160) ?? 'unhealthy'}`);
    }
    backendHealth = healthResp.data;
    console.log(`✅ Backend health check PASS (${cfg.backendUrl}/api/health)`);
  } catch (err) {
    console.error(`❌ Cannot reach AntiSlop backend at ${cfg.backendUrl}/api/health: ${(err as Error).message}`);
    console.error('   Start the backend first (e.g., `./scripts/dev.sh` or `cd backend && npm run dev`).');
    process.exit(1);
  }

  const trials: TrialRecord[] = [];
  for (const spec of suite) {
    const record = await runSingleTrial(spec, cfg);
    trials.push(record);
  }

  // Final cleanup reset so the live demo target app returns to a clean baseline state
  try {
    await fetchJsonWithTimeout(`${cfg.backendUrl}/api/snapshot/reset`, { method: 'POST', body: JSON.stringify({}) }, 20_000);
  } catch {
    // Non-fatal
  }

  const groupSummaries: Record<TrialGroup, GroupSummary> = {
    control_text_baseline: summarizeGroup('control_text_baseline', 'Control (Text-Only Baseline)', trials),
    treatment_fast_demo: summarizeGroup('treatment_fast_demo', 'Treatment 1 (AntiSlop fast_demo)', trials),
    treatment_deep_atelier: summarizeGroup('treatment_deep_atelier', 'Treatment 2 (AntiSlop deep_atelier)', trials),
    element119_stress_test: summarizeGroup('element119_stress_test', 'Element 119 Chaos Stress Tests', trials),
  };

  const ctrl = trials.filter((t) => t.group === 'control_text_baseline');
  const fast = trials.filter((t) => t.group === 'treatment_fast_demo');
  const deep = trials.filter((t) => t.group === 'treatment_deep_atelier');

  const honestFailures = trials
    .filter((t) => t.honestFailureReasons.length > 0)
    .map((t) => ({
      trialId: t.trialId,
      group: t.group,
      scenarioTitle: t.scenarioTitle,
      status: t.status,
      reasons: t.honestFailureReasons,
      primaryDefectClass: t.metrics?.primaryDefectClass,
      errorMessage: t.errorMessage,
    }));

  const report: BenchmarkReport = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    backendUrl: cfg.backendUrl,
    cliOptions: {
      fastOnly: cfg.fastOnly,
      stressOnly: cfg.stressOnly,
      scenarioFilter: cfg.scenarioFilter,
      timeoutMs: cfg.timeoutMs,
    },
    backendHealth,
    groupSummaries,
    pairedDeltasVsControl: {
      fastDemoVsControl: computeDeltas(fast, ctrl),
      deepAtelierVsControl: computeDeltas(deep, ctrl),
    },
    trials,
    honestFailures,
  };

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const jsonPath = path.join(RESULTS_DIR, 'latest-report.json');
  const mdPath = path.join(RESULTS_DIR, 'REPORT.md');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(mdPath, renderMarkdownReport(report), 'utf8');

  console.log('\n' + '='.repeat(72));
  console.log(`📊 Benchmark complete! Wrote:`);
  console.log(`   - ${jsonPath}`);
  console.log(`   - ${mdPath}`);
  console.log(`   - Honest failure records logged: ${honestFailures.length}/${trials.length}`);
  console.log('='.repeat(72) + '\n');
}

main().catch((err) => {
  console.error('❌ Fatal benchmark harness error:', err);
  process.exit(1);
});
