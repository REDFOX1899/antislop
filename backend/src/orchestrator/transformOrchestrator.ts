import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CandidateResult,
  CriticIteration,
  DecisionsScorecard,
  DesignManifest,
  ExecutionSpeedMode,
  MediaAssetInput,
  TransformRunRequest,
  TransformRunResult,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import type { GeneratedCandidateCode } from '../gemini/contracts.js';
import { geminiEngine } from '../gemini/index.js';
import { eventBus } from '../sandbox/eventBus.js';
import { puppeteerAuditor, type PuppeteerAuditCapture } from '../sandbox/puppeteerAuditor.js';
import { snapshotManager } from '../sandbox/snapshotManager.js';
import { viteManager } from '../sandbox/viteManager.js';

const MAX_STORED_RUNS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripBase64Prefix(input?: string): string | undefined {
  if (!input) return undefined;
  return input.replace(/^data:[^;]+;base64,/i, '').trim();
}

function sanitizeAssets(assets?: MediaAssetInput[]): MediaAssetInput[] {
  if (!Array.isArray(assets)) return [];
  return assets.map((asset) => ({
    ...asset,
    ...(asset.dataBase64 ? { dataBase64: stripBase64Prefix(asset.dataBase64) } : {}),
  }));
}

function summarizeSourceFiles(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([file, content]) => `- ${file} (${content.split('\n').length} lines, ${content.length} chars)`)
    .join('\n');
}

function buildErrorContext(capture: PuppeteerAuditCapture, viteError: string | null): string | undefined {
  const parts: string[] = [];
  if (viteError) {
    parts.push(`Vite compiler error:\n${viteError}`);
  }
  if (capture.viteOverlayError) {
    parts.push(`Vite browser error overlay:\n${capture.viteOverlayError}`);
  }
  if (capture.isBlankPage) {
    parts.push('Rendered page is completely blank (0 rendered text/elements in #root). Check for uncaught runtime exceptions or broken imports.');
  }
  if (capture.consoleErrors.length > 0) {
    parts.push(`Browser console/runtime errors (${capture.consoleErrors.length}):\n${capture.consoleErrors.slice(0, 5).join('\n')}`);
  }
  if (capture.domAudit.horizontalOverflowPx > 12) {
    parts.push(`Horizontal layout overflow detected: ${capture.domAudit.horizontalOverflowPx}px wider than viewport (${capture.domAudit.viewportWidth}px).`);
  }
  if (capture.domAudit.overlappingTextNodes > 0) {
    parts.push(`Detected ${capture.domAudit.overlappingTextNodes} overlapping text element pair(s). Fix positioning/spacing so text never collides.`);
  }
  if (capture.domAudit.brokenImageCount > 0) {
    parts.push(`Detected ${capture.domAudit.brokenImageCount} broken <img> element(s) with naturalWidth === 0. Ensure every image src points to a valid local path or graceful SVG/CSS visual.`);
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

interface EvaluatedState {
  candidate: CandidateResult;
  files: Record<string, string>;
  capture: PuppeteerAuditCapture;
  viteError: string | null;
  effectiveScore: number;
}

function computeEffectiveScore(
  scorecard: DecisionsScorecard,
  capture: PuppeteerAuditCapture,
  viteError: string | null
): number {
  let score = scorecard.overallTasteScore;
  const hasHardCrash = Boolean(viteError || capture.viteOverlayError || capture.isBlankPage);

  if (hasHardCrash) {
    score -= 65;
  }
  if (scorecard.domAudit.consoleErrorCount > 0) {
    score -= Math.min(30, scorecard.domAudit.consoleErrorCount * 15);
  }
  if (scorecard.domAudit.horizontalOverflowPx > 24) {
    score -= 12;
  }
  if (scorecard.domAudit.overlappingTextNodes > 0) {
    score -= Math.min(18, scorecard.domAudit.overlappingTextNodes * 6);
  }
  if (scorecard.domAudit.brokenImageCount > 0) {
    score -= Math.min(24, scorecard.domAudit.brokenImageCount * 12);
  }
  if (!scorecard.metrics.layoutBroken.passed) {
    score -= 15;
  }
  if (!scorecard.metrics.contrastFailing.passed) {
    score -= 12;
  }

  return score;
}

function applyDeterministicGates(
  scorecard: DecisionsScorecard,
  capture: PuppeteerAuditCapture,
  viteError: string | null
): DecisionsScorecard {
  const mergedConsoleErrors =
    capture.domAudit.consoleErrorCount + (viteError && capture.domAudit.consoleErrorCount === 0 ? 1 : 0);

  const domAudit: DecisionsScorecard['domAudit'] = {
    ...capture.domAudit,
    consoleErrorCount: mergedConsoleErrors,
  };

  const hardFailure =
    Boolean(viteError) ||
    Boolean(capture.viteOverlayError) ||
    capture.isBlankPage ||
    domAudit.consoleErrorCount > 0 ||
    domAudit.horizontalOverflowPx > 24 ||
    domAudit.overlappingTextNodes > 2 ||
    domAudit.brokenImageCount > 0;

  let criticDirective = scorecard.criticActionDirective;
  if (hardFailure) {
    const errSummary = buildErrorContext(capture, viteError);
    if (errSummary) {
      criticDirective = `${errSummary}\n\nVisual critic directive: ${scorecard.criticActionDirective}`;
    }
  }

  return {
    ...scorecard,
    domAudit,
    passedAllGates: hardFailure ? false : scorecard.passedAllGates,
    criticActionDirective: criticDirective,
  };
}

export class TransformOrchestrator {
  private readonly runs = new Map<string, TransformRunResult>();
  private readonly runOrder: string[] = [];
  private executionQueue: Promise<unknown> = Promise.resolve();

  getRun(runId: string): TransformRunResult | undefined {
    return this.runs.get(runId);
  }

  listRuns(): TransformRunResult[] {
    return [...this.runOrder]
      .reverse()
      .map((id) => this.runs.get(id))
      .filter((r): r is TransformRunResult => Boolean(r));
  }

  private storeRun(run: TransformRunResult): void {
    this.runs.set(run.runId, run);
    this.runOrder.push(run.runId);
    while (this.runOrder.length > MAX_STORED_RUNS) {
      const oldest = this.runOrder.shift();
      if (oldest) this.runs.delete(oldest);
    }
  }

  startTransformRun(rawReq: TransformRunRequest): {
    runId: string;
    run: TransformRunResult;
    completion: Promise<TransformRunResult>;
  } {
    const runId = `run-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const mode: TransformRunRequest['mode'] = rawReq.mode || 'antislop';
    const speedMode: ExecutionSpeedMode =
      rawReq.speedMode || (mode === 'stress_test' ? 'deep_atelier' : 'fast_demo');

    const run: TransformRunResult = {
      runId,
      mode,
      speedMode,
      status: 'running',
      startedAt: new Date().toISOString(),
      ...(rawReq.voiceTranscript ? { voiceTranscript: rawReq.voiceTranscript } : {}),
      baselineScreenshotUrl: '',
      iterations: [],
      modelsInvoked: [],
      totalLatencyMs: 0,
    };

    this.storeRun(run);

    const sanitizedReq: TransformRunRequest = {
      ...rawReq,
      mode,
      speedMode,
      assets: sanitizeAssets(rawReq.assets),
      ...(rawReq.voiceAudioBase64
        ? { voiceAudioBase64: stripBase64Prefix(rawReq.voiceAudioBase64) }
        : {}),
      ...(rawReq.circleOverlayPngBase64
        ? { circleOverlayPngBase64: stripBase64Prefix(rawReq.circleOverlayPngBase64) }
        : {}),
    };

    // Queue execution sequentially so concurrent transform requests never race on the active Vite workspace
    const completion = this.executionQueue.then(() => this.executeRun(run, sanitizedReq));
    this.executionQueue = completion.catch(() => undefined);

    return { runId, run, completion };
  }

  private async evaluateWrittenWorkspace(params: {
    runId: string;
    iteration: number;
    candidateId: string;
    strategyLabel: string;
    modelUsed: string;
    filesModified: string[];
    filesSnapshot: Record<string, string>;
    referenceAssets: MediaAssetInput[];
    referenceImages: MediaAssetInput[];
    manifest?: DesignManifest;
    includeMobile: boolean;
    hmrWaitMs: number;
    generationLatencyMs: number;
    modelsInvoked: Set<string>;
  }): Promise<EvaluatedState> {
    const evalStart = Date.now();
    await sleep(params.hmrWaitMs);

    const previewUrl = viteManager.getProxiedPreviewUrl();
    const capturePrefix = `${params.runId}-i${params.iteration}-${params.candidateId}`;
    const capture = await puppeteerAuditor.captureAndAudit(previewUrl, capturePrefix, {
      includeMobile: params.includeMobile,
    });

    const viteError = viteManager.getLastViteError();

    // Run Decisions API critic and Multimodal Embedding similarity in parallel to save latency
    const [rawScorecard, embeddingSimilarity] = await Promise.all([
      geminiEngine.evaluateVisualCandidate({
        renderedDesktopBase64: capture.desktopBase64,
        renderedMobileBase64: capture.mobileBase64,
        referenceAssets: params.referenceAssets,
        manifest: params.manifest,
        domAudit: capture.domAudit,
      }),
      params.referenceImages.length > 0
        ? geminiEngine
            .computeTasteEmbeddingSimilarity({
              referenceImages: params.referenceImages,
              renderedScreenshotBase64: capture.desktopBase64,
            })
            .catch(() => undefined)
        : Promise.resolve(undefined),
    ]);

    params.modelsInvoked.add(rawScorecard.model);
    if (embeddingSimilarity !== undefined) {
      params.modelsInvoked.add(ENV.GEMINI_MODEL_EMBEDDING);
    }

    const gatedScorecard = applyDeterministicGates(
      {
        ...rawScorecard,
        ...(embeddingSimilarity !== undefined ? { embeddingSimilarity } : {}),
      },
      capture,
      viteError
    );

    const effectiveScore = computeEffectiveScore(gatedScorecard, capture, viteError);

    const candidate: CandidateResult = {
      candidateId: params.candidateId,
      strategyLabel: params.strategyLabel,
      modelUsed: params.modelUsed,
      filesModified: params.filesModified,
      screenshotUrl: capture.desktopUrl,
      ...(capture.mobileUrl ? { mobileScreenshotUrl: capture.mobileUrl } : {}),
      scorecard: gatedScorecard,
      selectedAsWinner: false,
      latencyMs: params.generationLatencyMs + (Date.now() - evalStart),
    };

    eventBus.emit(
      params.runId,
      'candidate_scored',
      `${params.strategyLabel}: Taste Index ${gatedScorecard.overallTasteScore.toFixed(1)}/100 (Slop ${gatedScorecard.metrics.slopPenalty.value.toFixed(1)}/10, Match ${gatedScorecard.metrics.aestheticMatch.value.toFixed(1)}/10)${gatedScorecard.passedAllGates ? ' — PASSED' : ''}`,
      {
        iteration: params.iteration,
        model: gatedScorecard.model,
        payload: {
          candidate,
          effectiveScore,
          viteError,
        },
      }
    );

    return {
      candidate,
      files: params.filesSnapshot,
      capture,
      viteError,
      effectiveScore,
    };
  }

  private async executeRun(run: TransformRunResult, req: TransformRunRequest): Promise<TransformRunResult> {
    const startMs = Date.now();
    const modelsInvoked = new Set<string>();

    const recordModels = (): void => {
      run.modelsInvoked = [...modelsInvoked];
      run.totalLatencyMs = Date.now() - startMs;
    };

    try {
      const activeWs = viteManager.getActiveWorkspace();
      if (!activeWs) {
        throw new Error('No active target workspace is running. Switch or boot a workspace first.');
      }
      const wsPath = activeWs.localPath;

      eventBus.emit(run.runId, 'run_started', `Starting ${req.mode} run (${run.speedMode}) on ${activeWs.name}`, {
        payload: {
          mode: req.mode,
          speedMode: run.speedMode,
          workspaceId: activeWs.id,
          assetCount: req.assets.length,
        },
      });

      // Ensure baseline snapshot exists before any mutations
      if (!snapshotManager.hasBaseline(wsPath)) {
        await snapshotManager.captureBaseline(wsPath);
      }

      // STEP 0: Voice-Only Transcription Support (gemini-3.5-transcribe)
      let voiceTranscript = req.voiceTranscript?.trim() || undefined;
      if (req.voiceAudioBase64 && !voiceTranscript) {
        const mimeType = req.voiceAudioMimeType || 'audio/webm';
        const transcription = await geminiEngine.transcribeVoice(req.voiceAudioBase64, mimeType);
        voiceTranscript = transcription.transcript.trim();
        run.voiceTranscript = voiceTranscript;
        modelsInvoked.add(transcription.model);

        eventBus.emit(run.runId, 'voice_transcribed', `Transcribed voice direction: "${voiceTranscript}"`, {
          model: transcription.model,
          payload: transcription,
        });
      }

      // STEP 1: Baseline Live Snapshot + Optional Circle Overlay Composite
      const previewUrl = viteManager.getProxiedPreviewUrl();
      const baselineCapture = await puppeteerAuditor.captureAndAudit(previewUrl, `${run.runId}-baseline`, {
        includeMobile: false,
      });
      run.baselineScreenshotUrl = baselineCapture.desktopUrl;

      eventBus.emit(run.runId, 'snapshot_captured', 'Captured current live canvas snapshot + DOM baseline', {
        iteration: 0,
        payload: {
          screenshotUrl: baselineCapture.desktopUrl,
          domAudit: baselineCapture.domAudit,
        },
      });

      let annotatedScreenshotBase64: string | undefined;
      if (req.circleOverlayPngBase64) {
        const composited = await puppeteerAuditor.compositeCircleOverlay(
          baselineCapture.desktopBase64,
          req.circleOverlayPngBase64,
          `${run.runId}-annotated.png`
        );
        annotatedScreenshotBase64 = composited.annotatedBase64;
        run.annotatedScreenshotUrl = composited.annotatedUrl;
      }

      const referenceImages = req.assets.filter(
        (asset) => asset.mimeType.startsWith('image/') && Boolean(asset.dataBase64)
      );

      // Dispatch by mode
      if (req.mode === 'circle_tweak') {
        await this.executeCircleTweakMode({
          run,
          req,
          wsPath,
          voiceTranscript,
          baselineCapture,
          annotatedScreenshotBase64,
          referenceImages,
          modelsInvoked,
        });
      } else if (req.mode === 'text_baseline') {
        await this.executeTextBaselineMode({
          run,
          req,
          wsPath,
          voiceTranscript,
          referenceImages,
          modelsInvoked,
        });
      } else {
        await this.executeAntiSlopMode({
          run,
          req,
          wsPath,
          voiceTranscript,
          annotatedScreenshotBase64,
          referenceImages,
          modelsInvoked,
        });
      }

      run.completedAt = new Date().toISOString();
      recordModels();

      eventBus.emit(
        run.runId,
        'run_completed',
        `Run completed (${run.status}) in ${(run.totalLatencyMs / 1000).toFixed(1)}s`,
        {
          payload: run,
        }
      );

      return run;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.status = 'failed';
      run.completedAt = new Date().toISOString();
      recordModels();

      eventBus.emit(run.runId, 'run_error', `Run failed: ${message}`, {
        payload: { error: message, run },
      });

      return run;
    }
  }

  /**
   * MODE A: Circle-to-Tweak (Fast ~6-10s Surgical Draw & Speak)
   */
  private async executeCircleTweakMode(ctx: {
    run: TransformRunResult;
    req: TransformRunRequest;
    wsPath: string;
    voiceTranscript?: string;
    baselineCapture: PuppeteerAuditCapture;
    annotatedScreenshotBase64?: string;
    referenceImages: MediaAssetInput[];
    modelsInvoked: Set<string>;
  }): Promise<void> {
    const { run, req, wsPath, voiceTranscript, baselineCapture, annotatedScreenshotBase64, referenceImages, modelsInvoked } =
      ctx;

    const circleNotes = (req.drawnCircles ?? [])
      .map((c, idx) => (c.note ? `Circle #${idx + 1}: ${c.note}` : null))
      .filter(Boolean)
      .join(' | ');

    const instructionParts = [
      voiceTranscript,
      req.targetRegion?.instruction,
      req.textPrompt,
      circleNotes,
    ].filter((s): s is string => Boolean(s && s.trim()));

    const instruction =
      instructionParts.join('\n') ||
      'Apply a crisp, surgical visual refinement to the circled UI region(s) while keeping the rest of the page intact.';

    const currentFiles = await snapshotManager.readEditableFiles(wsPath);
    const prePatchSnap = await snapshotManager.saveTempSnapshot(wsPath, 'pre-circle-tweak');

    eventBus.emit(run.runId, 'candidate_started', 'Applying surgical Circle-to-Tweak patch...', {
      iteration: 1,
      model: ENV.GEMINI_MODEL_PATCHER,
      payload: {
        drawnCirclesCount: req.drawnCircles?.length ?? 0,
        annotatedScreenshotUrl: run.annotatedScreenshotUrl,
      },
    });

    const patch = await geminiEngine.applySurgicalPatch({
      sourceFiles: currentFiles,
      currentScreenshotBase64: baselineCapture.desktopBase64,
      annotatedScreenshotBase64,
      drawnCircles: req.drawnCircles,
      referenceAssets: req.assets,
      targetRegion: req.targetRegion,
      instruction,
    });
    modelsInvoked.add(patch.modelUsed);

    viteManager.clearLastViteError();
    const writtenFiles = await snapshotManager.writeFiles(wsPath, patch.files);
    const updatedFiles = await snapshotManager.readEditableFiles(wsPath);

    eventBus.emit(run.runId, 'candidate_written', `Patched ${writtenFiles.length} file(s): ${writtenFiles.join(', ')}`, {
      iteration: 1,
      model: patch.modelUsed,
      payload: { filesModified: writtenFiles, diffSummary: patch.diffSummary },
    });

    let bestState = await this.evaluateWrittenWorkspace({
      runId: run.runId,
      iteration: 1,
      candidateId: 'circle-patch-1',
      strategyLabel: 'Surgical Circle-to-Tweak',
      modelUsed: patch.modelUsed,
      filesModified: writtenFiles,
      filesSnapshot: updatedFiles,
      referenceAssets: req.assets,
      referenceImages,
      includeMobile: false,
      hmrWaitMs: 500,
      generationLatencyMs: patch.latencyMs,
      modelsInvoked,
    });
    bestState.candidate.selectedAsWinner = true;

    const candidates: CandidateResult[] = [bestState.candidate];
    let diffSummary = patch.diffSummary;

    eventBus.emit(run.runId, 'hmr_reloaded', 'Vite HMR updated live canvas with surgical tweak', {
      iteration: 1,
      payload: { screenshotUrl: bestState.candidate.screenshotUrl },
    });

    // Automatic single recovery patch if build broke, blank page, layout broke, or contrast failed
    const needsRecovery =
      Boolean(bestState.viteError) ||
      Boolean(bestState.capture.viteOverlayError) ||
      bestState.capture.isBlankPage ||
      bestState.candidate.scorecard.domAudit.consoleErrorCount > 0 ||
      !bestState.candidate.scorecard.metrics.layoutBroken.passed ||
      !bestState.candidate.scorecard.metrics.contrastFailing.passed;

    if (needsRecovery) {
      eventBus.emit(
        run.runId,
        'refinement_triggered',
        'Detected layout/contrast/runtime defect after surgical edit — running 1 automatic recovery patch',
        {
          iteration: 2,
          model: ENV.GEMINI_MODEL_PATCHER,
          payload: {
            reason: bestState.candidate.scorecard.criticActionDirective,
            viteError: bestState.viteError,
          },
        }
      );

      const errorContext = buildErrorContext(bestState.capture, bestState.viteError);
      const recoveryPatch = await geminiEngine.applySurgicalPatch({
        sourceFiles: updatedFiles,
        scorecard: bestState.candidate.scorecard,
        currentScreenshotBase64: bestState.capture.desktopBase64,
        annotatedScreenshotBase64,
        drawnCircles: req.drawnCircles,
        referenceAssets: req.assets,
        targetRegion: req.targetRegion,
        instruction: `Fix the visual/runtime issue from the previous edit while still honoring the user's request: ${instruction}`,
        errorContext,
      });
      modelsInvoked.add(recoveryPatch.modelUsed);

      viteManager.clearLastViteError();
      const recoveryWritten = await snapshotManager.writeFiles(wsPath, recoveryPatch.files);
      const recoveryFiles = await snapshotManager.readEditableFiles(wsPath);

      const recoveryState = await this.evaluateWrittenWorkspace({
        runId: run.runId,
        iteration: 2,
        candidateId: 'circle-recovery-2',
        strategyLabel: 'Automatic Recovery Patch',
        modelUsed: recoveryPatch.modelUsed,
        filesModified: recoveryWritten,
        filesSnapshot: recoveryFiles,
        referenceAssets: req.assets,
        referenceImages,
        includeMobile: false,
        hmrWaitMs: 500,
        generationLatencyMs: recoveryPatch.latencyMs,
        modelsInvoked,
      });

      candidates.push(recoveryState.candidate);

      if (recoveryState.effectiveScore >= bestState.effectiveScore) {
        bestState.candidate.selectedAsWinner = false;
        recoveryState.candidate.selectedAsWinner = true;
        bestState = recoveryState;
        diffSummary = recoveryPatch.diffSummary;
      } else {
        // Restore prior better state
        if (bestState.viteError || bestState.capture.isBlankPage) {
          await snapshotManager.restoreTempSnapshot(wsPath, prePatchSnap);
        } else {
          await snapshotManager.writeFiles(wsPath, bestState.files);
        }
      }

      eventBus.emit(run.runId, 'hmr_reloaded', 'Vite HMR settled after automatic recovery pass', {
        iteration: 2,
        payload: { screenshotUrl: bestState.candidate.screenshotUrl },
      });
    }

    const finalDiff = await snapshotManager.computeSimpleDiff(wsPath);
    const iterationRecord: CriticIteration = {
      iteration: 1,
      phase: 'circle_tweak',
      candidates,
      winnerCandidateId: bestState.candidate.candidateId,
      scorecard: bestState.candidate.scorecard,
      screenshotUrl: bestState.candidate.screenshotUrl,
      generatedAssetUrls: [],
      diffSummary: diffSummary || finalDiff.summary,
      timestamp: new Date().toISOString(),
    };

    run.iterations.push(iterationRecord);
    run.finalScreenshotUrl = bestState.candidate.screenshotUrl;
    const hardBroken =
      Boolean(bestState.viteError) ||
      bestState.capture.isBlankPage ||
      bestState.candidate.scorecard.domAudit.consoleErrorCount > 0;
    run.status = !hardBroken && (bestState.candidate.scorecard.passedAllGates || bestState.candidate.scorecard.metrics.layoutBroken.passed)
      ? 'passed'
      : 'max_iterations_reached';

    eventBus.emit(run.runId, 'iteration_complete', 'Circle-to-Tweak completed', {
      iteration: 1,
      payload: iterationRecord,
    });
  }

  /**
   * MODE B: Text-Only Baseline (5-Sigma Control Group — NO moodboard media sent to coder)
   */
  private async executeTextBaselineMode(ctx: {
    run: TransformRunResult;
    req: TransformRunRequest;
    wsPath: string;
    voiceTranscript?: string;
    referenceImages: MediaAssetInput[];
    modelsInvoked: Set<string>;
  }): Promise<void> {
    const { run, req, wsPath, voiceTranscript, referenceImages, modelsInvoked } = ctx;

    const textPrompt =
      req.textPrompt?.trim() ||
      voiceTranscript ||
      'Redesign this frontend app to look modern, clean, editorial, and high-converting.';

    const currentFiles = await snapshotManager.readEditableFiles(wsPath);
    const preBaselineSnap = await snapshotManager.saveTempSnapshot(wsPath, 'pre-text-baseline');

    eventBus.emit(run.runId, 'candidate_started', 'Generating Text-Only Baseline (control group, zero visual refs)...', {
      iteration: 1,
      model: ENV.GEMINI_MODEL_ARCHITECT,
      payload: { textPrompt },
    });

    const candidatesCode = await geminiEngine.generateCodeCandidates({
      sourceFiles: currentFiles,
      parallelCount: 1,
      generatedPublicPaths: [],
      mode: 'text_baseline',
      speedMode: 'fast_demo',
      textPrompt,
    });

    const firstCandidate = candidatesCode[0];
    if (!firstCandidate) {
      throw new Error('Text baseline code generation returned no candidates');
    }
    modelsInvoked.add(firstCandidate.modelUsed);

    viteManager.clearLastViteError();
    const writtenFiles = await snapshotManager.writeFiles(wsPath, firstCandidate.files);
    const updatedFiles = await snapshotManager.readEditableFiles(wsPath);

    eventBus.emit(run.runId, 'candidate_written', `Text baseline wrote ${writtenFiles.length} file(s)`, {
      iteration: 1,
      model: firstCandidate.modelUsed,
      payload: { candidateId: firstCandidate.candidateId, filesModified: writtenFiles },
    });

    // Score against any attached reference assets so 5-Sigma benchmarks compare apples-to-apples!
    const evaluated = await this.evaluateWrittenWorkspace({
      runId: run.runId,
      iteration: 1,
      candidateId: firstCandidate.candidateId,
      strategyLabel: firstCandidate.strategyLabel || 'Text-Only Baseline',
      modelUsed: firstCandidate.modelUsed,
      filesModified: writtenFiles,
      filesSnapshot: updatedFiles,
      referenceAssets: req.assets,
      referenceImages,
      includeMobile: false,
      hmrWaitMs: 500,
      generationLatencyMs: firstCandidate.latencyMs,
      modelsInvoked,
    });

    if (evaluated.viteError || evaluated.capture.isBlankPage) {
      // Restore cleanly if baseline completely broke Vite so the next benchmark run starts healthy
      await snapshotManager.restoreTempSnapshot(wsPath, preBaselineSnap);
    }

    evaluated.candidate.selectedAsWinner = true;

    eventBus.emit(run.runId, 'hmr_reloaded', 'Vite HMR updated with text-only baseline', {
      iteration: 1,
      payload: { screenshotUrl: evaluated.candidate.screenshotUrl },
    });

    const diff = await snapshotManager.computeSimpleDiff(wsPath);
    const iterationRecord: CriticIteration = {
      iteration: 1,
      phase: 'fast_pass',
      candidates: [evaluated.candidate],
      winnerCandidateId: evaluated.candidate.candidateId,
      scorecard: evaluated.candidate.scorecard,
      screenshotUrl: evaluated.candidate.screenshotUrl,
      generatedAssetUrls: [],
      diffSummary: firstCandidate.diffSummary || diff.summary,
      timestamp: new Date().toISOString(),
    };

    run.iterations.push(iterationRecord);
    run.finalScreenshotUrl = evaluated.candidate.screenshotUrl;
    run.status = evaluated.candidate.scorecard.passedAllGates ? 'passed' : 'max_iterations_reached';

    eventBus.emit(run.runId, 'iteration_complete', 'Text-only baseline evaluation complete', {
      iteration: 1,
      payload: iterationRecord,
    });
  }

  /**
   * MODE C: Full AntiSlop Multimodal Taste Engine & Stress Test
   * Supports `fast_demo` (<25s) and `deep_atelier` (Best-of-4 Parallel + Carbon High Thinking + Autonomous Refinement)
   */
  private async executeAntiSlopMode(ctx: {
    run: TransformRunResult;
    req: TransformRunRequest;
    wsPath: string;
    voiceTranscript?: string;
    annotatedScreenshotBase64?: string;
    referenceImages: MediaAssetInput[];
    modelsInvoked: Set<string>;
  }): Promise<void> {
    const { run, req, wsPath, voiceTranscript, annotatedScreenshotBase64, referenceImages, modelsInvoked } = ctx;
    const speedMode = run.speedMode;
    const isDeep = speedMode === 'deep_atelier' || req.mode === 'stress_test';

    const parallelCount =
      req.parallelCandidates !== undefined
        ? Math.min(4, Math.max(1, req.parallelCandidates))
        : isDeep
          ? ENV.ANTISLOP_PARALLEL_CANDIDATES
          : 1;

    const maxIterations =
      req.maxIterations !== undefined
        ? Math.min(6, Math.max(1, req.maxIterations))
        : isDeep
          ? ENV.ANTISLOP_MAX_CRITIC_ITERATIONS
          : 2;

    const shouldGenerateAssets =
      req.generateBespokeAssets !== undefined ? req.generateBespokeAssets : isDeep;

    const sourceFiles = await snapshotManager.readEditableFiles(wsPath);
    const currentCodeSummary = summarizeSourceFiles(sourceFiles);

    // 1. Design Director: Synthesize Multimodal DesignManifest
    const directorModelLabel =
      speedMode === 'fast_demo' && req.mode !== 'stress_test'
        ? ENV.GEMINI_MODEL_FAST_CRITIC
        : ENV.GEMINI_MODEL_DIRECTOR;

    eventBus.emit(
      run.runId,
      'director_thinking',
      `Design Director analyzing ${req.assets.length} multimodal asset(s) in ${speedMode} mode...`,
      {
        iteration: 1,
        model: directorModelLabel,
      }
    );

    let lastThoughtEmit = 0;
    let thoughtBuffer = '';
    const manifest: DesignManifest = await geminiEngine.synthesizeDesignManifest({
      assets: req.assets,
      voiceTranscript,
      textPrompt: req.textPrompt,
      mode: req.mode,
      speedMode,
      currentCodeSummary,
      annotatedScreenshotBase64,
      drawnCircles: req.drawnCircles,
      onThinking: (delta) => {
        thoughtBuffer += delta;
        const now = Date.now();
        if (now - lastThoughtEmit > 450 && thoughtBuffer.trim().length > 0) {
          lastThoughtEmit = now;
          eventBus.emit(run.runId, 'director_thinking', thoughtBuffer.slice(-300), {
            iteration: 1,
            model: directorModelLabel,
            payload: { delta: thoughtBuffer },
          });
          thoughtBuffer = '';
        }
      },
    });

    run.manifest = manifest;
    modelsInvoked.add(manifest.modelUsed);

    eventBus.emit(run.runId, 'manifest_ready', `Synthesized Design Manifest: "${manifest.vibeTitle}"`, {
      iteration: 1,
      model: manifest.modelUsed,
      payload: manifest,
    });

    // 2. Parallel Execution: Bespoke Imagery (Nano Banana 2.1) + Candidate Code Generation (N=1..4)
    const plannedPublicPaths = shouldGenerateAssets
      ? manifest.bespokeAssets.map((a) =>
          a.targetPublicPath.startsWith('/') ? a.targetPublicPath : `/${a.targetPublicPath}`
        )
      : [];

    const generatedOutputDir = path.join(wsPath, 'public', 'generated');

    const assetGenPromise = shouldGenerateAssets
      ? geminiEngine
          .generateBespokeAssets({
            manifest,
            referenceImages,
            outputDir: generatedOutputDir,
          })
          .then((res) => {
            if (res.publicUrls.length > 0) {
              modelsInvoked.add(ENV.GEMINI_MODEL_IMAGE_GEN);
              for (const url of res.publicUrls) {
                eventBus.emit(run.runId, 'asset_generated', `Generated bespoke artwork: ${url}`, {
                  iteration: 1,
                  model: ENV.GEMINI_MODEL_IMAGE_GEN,
                  payload: { publicUrl: url, latencyMs: res.latencyMs },
                });
              }
            }
            return res;
          })
          .catch((err) => {
            console.warn('[TransformOrchestrator] Bespoke asset generation failed gracefully:', err);
            return { generatedPaths: [], publicUrls: [], latencyMs: 0 };
          })
      : Promise.resolve({ generatedPaths: [], publicUrls: [], latencyMs: 0 });

    eventBus.emit(
      run.runId,
      'candidate_started',
      `Racing ${parallelCount} parallel frontend code candidate${parallelCount === 1 ? '' : 's'}...`,
      {
        iteration: 1,
        model: speedMode === 'fast_demo' ? ENV.GEMINI_MODEL_PATCHER : ENV.GEMINI_MODEL_ARCHITECT,
        payload: { parallelCount, shouldGenerateAssets },
      }
    );

    const codeGenPromise = geminiEngine.generateCodeCandidates({
      manifest,
      sourceFiles,
      parallelCount,
      generatedPublicPaths: plannedPublicPaths,
      mode: req.mode,
      speedMode,
      textPrompt: req.textPrompt || voiceTranscript,
    });

    const [assetResult, rawCandidates] = await Promise.all([assetGenPromise, codeGenPromise]);
    const generatedAssetUrls = assetResult.publicUrls;

    if (!rawCandidates || rawCandidates.length === 0) {
      throw new Error('Code generator returned zero candidates');
    }

    // Reconcile extension mismatches (e.g. manifest planned .png while Nano Banana output .jpg/.webp)
    if (generatedAssetUrls.length > 0 && plannedPublicPaths.length > 0) {
      const actualByStem = new Map<string, string>();
      for (const actualUrl of generatedAssetUrls) {
        const stem = path.posix.basename(actualUrl).replace(/\.[^.]+$/, '');
        if (stem) actualByStem.set(stem, actualUrl);
      }
      const replacements: Array<[string, string]> = [];
      for (const plannedUrl of plannedPublicPaths) {
        const stem = path.posix.basename(plannedUrl).replace(/\.[^.]+$/, '');
        const actualUrl = actualByStem.get(stem);
        if (actualUrl && actualUrl !== plannedUrl) {
          replacements.push([plannedUrl, actualUrl]);
        }
      }
      if (replacements.length > 0) {
        for (const cand of rawCandidates) {
          for (const [fileKey, content] of Object.entries(cand.files)) {
            let patched = content;
            for (const [fromUrl, toUrl] of replacements) {
              if (patched.includes(fromUrl)) {
                patched = patched.split(fromUrl).join(toUrl);
              }
            }
            cand.files[fileKey] = patched;
          }
        }
      }
    }

    // 3. Evaluate Every Candidate Cleanly via Vite HMR + Puppeteer + Decisions API + Embeddings
    const preRaceSnap = await snapshotManager.saveTempSnapshot(wsPath, 'pre-candidate-race');
    const evaluatedCandidates: EvaluatedState[] = [];

    for (let idx = 0; idx < rawCandidates.length; idx += 1) {
      const codeCand: GeneratedCandidateCode = rawCandidates[idx];
      modelsInvoked.add(codeCand.modelUsed);

      // Always restore clean pre-race state before testing each parallel candidate
      if (idx > 0) {
        await snapshotManager.restoreTempSnapshot(wsPath, preRaceSnap);
      }

      viteManager.clearLastViteError();
      const writtenFiles = await snapshotManager.writeFiles(wsPath, codeCand.files);
      const currentSnapFiles = await snapshotManager.readEditableFiles(wsPath);

      eventBus.emit(
        run.runId,
        'candidate_written',
        `Wrote candidate ${idx + 1}/${rawCandidates.length} (${codeCand.strategyLabel}) — ${writtenFiles.length} file(s)`,
        {
          iteration: 1,
          model: codeCand.modelUsed,
          payload: {
            candidateId: codeCand.candidateId,
            strategyLabel: codeCand.strategyLabel,
            filesModified: writtenFiles,
          },
        }
      );

      const evaluated = await this.evaluateWrittenWorkspace({
        runId: run.runId,
        iteration: 1,
        candidateId: codeCand.candidateId,
        strategyLabel: codeCand.strategyLabel,
        modelUsed: codeCand.modelUsed,
        filesModified: writtenFiles,
        filesSnapshot: currentSnapFiles,
        referenceAssets: req.assets,
        referenceImages,
        manifest,
        includeMobile: isDeep,
        hmrWaitMs: 450,
        generationLatencyMs: codeCand.latencyMs,
        modelsInvoked,
      });

      evaluatedCandidates.push(evaluated);
    }

    // Select highest-ranking candidate (heavily penalizing broken DOM / Vite crashes)
    evaluatedCandidates.sort((a, b) => b.effectiveScore - a.effectiveScore);
    let bestState = evaluatedCandidates[0];
    bestState.candidate.selectedAsWinner = true;

    // Ensure winning candidate's files are active on disk in Vite
    const lastTestedId = rawCandidates[rawCandidates.length - 1]?.candidateId;
    if (bestState.candidate.candidateId !== lastTestedId) {
      await snapshotManager.restoreTempSnapshot(wsPath, preRaceSnap);
      viteManager.clearLastViteError();
      await snapshotManager.writeFiles(wsPath, bestState.files);
      await sleep(400);
    }

    eventBus.emit(
      run.runId,
      'hmr_reloaded',
      `Selected winning candidate "${bestState.candidate.strategyLabel}" (Taste Index ${bestState.candidate.scorecard.overallTasteScore.toFixed(1)}/100)`,
      {
        iteration: 1,
        payload: {
          winnerCandidateId: bestState.candidate.candidateId,
          screenshotUrl: bestState.candidate.screenshotUrl,
        },
      }
    );

    const iter1Diff = await snapshotManager.computeSimpleDiff(wsPath);
    const iter1Record: CriticIteration = {
      iteration: 1,
      phase: parallelCount > 1 ? 'parallel_race' : 'fast_pass',
      candidates: evaluatedCandidates.map((e) => e.candidate),
      winnerCandidateId: bestState.candidate.candidateId,
      scorecard: bestState.candidate.scorecard,
      screenshotUrl: bestState.candidate.screenshotUrl,
      generatedAssetUrls,
      diffSummary: iter1Diff.summary,
      timestamp: new Date().toISOString(),
    };
    run.iterations.push(iter1Record);

    eventBus.emit(run.runId, 'iteration_complete', `Iteration 1 complete — Taste Index ${bestState.candidate.scorecard.overallTasteScore.toFixed(1)}/100`, {
      iteration: 1,
      payload: iter1Record,
    });

    // 4. Autonomous Critic Refinement Loop driven by gemini-decision-1 + Puppeteer DOM Audit
    let iteration = 1;
    while (!bestState.candidate.scorecard.passedAllGates && iteration < maxIterations) {
      iteration += 1;

      const primaryDefect =
        bestState.candidate.scorecard.metrics.primaryDefectClass.choiceLabel || 'visual_polish';

      eventBus.emit(
        run.runId,
        'refinement_triggered',
        `Iteration ${iteration}/${maxIterations}: Critic flagged "${primaryDefect}" — applying autonomous surgical fix`,
        {
          iteration,
          model: ENV.GEMINI_MODEL_PATCHER,
          payload: {
            primaryDefect,
            currentTasteScore: bestState.candidate.scorecard.overallTasteScore,
            criticActionDirective: bestState.candidate.scorecard.criticActionDirective,
          },
        }
      );

      const preRefineSnap = await snapshotManager.saveTempSnapshot(wsPath, `pre-refine-${iteration}`);
      const currentWorkspaceFiles = await snapshotManager.readEditableFiles(wsPath);
      const errorContext = buildErrorContext(bestState.capture, bestState.viteError);

      const patch = await geminiEngine.applySurgicalPatch({
        manifest,
        sourceFiles: currentWorkspaceFiles,
        scorecard: bestState.candidate.scorecard,
        currentScreenshotBase64: bestState.capture.desktopBase64,
        annotatedScreenshotBase64,
        drawnCircles: req.drawnCircles,
        referenceAssets: req.assets,
        instruction: bestState.candidate.scorecard.criticActionDirective,
        errorContext,
      });
      modelsInvoked.add(patch.modelUsed);

      viteManager.clearLastViteError();
      const writtenFiles = await snapshotManager.writeFiles(wsPath, patch.files);
      const patchedFiles = await snapshotManager.readEditableFiles(wsPath);

      eventBus.emit(
        run.runId,
        'candidate_written',
        `Refinement #${iteration} patched ${writtenFiles.length} file(s): ${writtenFiles.join(', ')}`,
        {
          iteration,
          model: patch.modelUsed,
          payload: { filesModified: writtenFiles, diffSummary: patch.diffSummary },
        }
      );

      const refinedState = await this.evaluateWrittenWorkspace({
        runId: run.runId,
        iteration,
        candidateId: `refine-${iteration}`,
        strategyLabel: `Autonomous Critic Fix #${iteration}`,
        modelUsed: patch.modelUsed,
        filesModified: writtenFiles,
        filesSnapshot: patchedFiles,
        referenceAssets: req.assets,
        referenceImages,
        manifest,
        includeMobile: isDeep,
        hmrWaitMs: 500,
        generationLatencyMs: patch.latencyMs,
        modelsInvoked,
      });

      const refinedImproved =
        refinedState.candidate.scorecard.passedAllGates ||
        refinedState.effectiveScore >= bestState.effectiveScore - 1.0;

      if (refinedImproved) {
        refinedState.candidate.selectedAsWinner = true;
        bestState = refinedState;

        eventBus.emit(
          run.runId,
          'hmr_reloaded',
          `Refinement #${iteration} accepted (Taste Index ${refinedState.candidate.scorecard.overallTasteScore.toFixed(1)}/100)`,
          {
            iteration,
            payload: { screenshotUrl: refinedState.candidate.screenshotUrl, accepted: true },
          }
        );
      } else {
        // Auto-rollback regression so we never ship a worse visual result!
        await snapshotManager.restoreTempSnapshot(wsPath, preRefineSnap);
        await sleep(350);

        eventBus.emit(
          run.runId,
          'hmr_reloaded',
          `Refinement #${iteration} regressed (${refinedState.effectiveScore.toFixed(1)} < ${bestState.effectiveScore.toFixed(1)}) — auto-rolled back to prior best`,
          {
            iteration,
            payload: { screenshotUrl: bestState.candidate.screenshotUrl, rolledBack: true },
          }
        );
      }

      const iterDiff = await snapshotManager.computeSimpleDiff(wsPath);
      const iterRecord: CriticIteration = {
        iteration,
        phase: 'refinement',
        candidates: [refinedState.candidate],
        winnerCandidateId: refinedImproved ? refinedState.candidate.candidateId : bestState.candidate.candidateId,
        scorecard: bestState.candidate.scorecard,
        screenshotUrl: bestState.candidate.screenshotUrl,
        generatedAssetUrls,
        diffSummary: refinedImproved ? patch.diffSummary || iterDiff.summary : 'Rolled back regression to prior best',
        timestamp: new Date().toISOString(),
      };
      run.iterations.push(iterRecord);

      eventBus.emit(
        run.runId,
        'iteration_complete',
        `Iteration ${iteration} complete — Best Taste Index ${bestState.candidate.scorecard.overallTasteScore.toFixed(1)}/100`,
        {
          iteration,
          payload: iterRecord,
        }
      );
    }

    run.finalScreenshotUrl = bestState.candidate.screenshotUrl;
    run.status = bestState.candidate.scorecard.passedAllGates ? 'passed' : 'max_iterations_reached';
  }
}

export const transformOrchestrator = new TransformOrchestrator();
