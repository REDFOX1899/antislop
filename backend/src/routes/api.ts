import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type {
  ManagedAgentEvent,
  ManagedAgentShipRequest,
  TransformRunRequest,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { brandMemoryStore, type BrandMemoryProfile } from '../design/brandMemory.js';
import { getVerifiedArchetypes } from '../design/paletteArchetypes.js';
import {
  compileDesignTokens,
  type CompileDesignTokensInput,
} from '../design/tokenCompiler.js';
import { injectInstantLookIntoWorkspace } from '../design/tokenInjector.js';
import {
  buildTypographyCssBlock,
  resolveVerifiedTypography,
  VERIFIED_TYPOGRAPHY_PAIRINGS,
} from '../design/typographyKernel.js';
import { geminiEngine } from '../gemini/index.js';
import { runCoarseFineZoomXray, type ZoomTileRegion } from '../gemini/coarseFineXray.js';
import { runCopilotMicroPulse } from '../gemini/copilotPulse.js';
import {
  runDeepDecisionAudit,
  type DeepDecisionAuditMode,
} from '../gemini/deepDecisionMatrix.js';
import {
  routeByDecisionEntropy,
  runConversionAndBrandAudit,
  runPairwiseBlindJudge,
} from '../gemini/decisionsEngineV2.js';
import { runMultiViewportDeltaTensor } from '../gemini/deltaTensor.js';
import { generateWorkspaceRecommendations } from '../gemini/recommender.js';
import { listInstalledSkills } from '../gemini/skillRegistry.js';
import { transformOrchestrator } from '../orchestrator/transformOrchestrator.js';
import { eventBus } from '../sandbox/eventBus.js';
import { githubManager } from '../sandbox/githubManager.js';
import { puppeteerAuditor } from '../sandbox/puppeteerAuditor.js';
import {
  buildRepoDependencyGraph,
  selectRelevantFiles,
} from '../sandbox/repoIndexer.js';
import { snapshotManager } from '../sandbox/snapshotManager.js';
import { viteManager } from '../sandbox/viteManager.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : String(val ?? '');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stripBase64Prefix(input: string): string {
  return input.replace(/^data:[^;]+;base64,/i, '').trim();
}

export function createApiRouter(): Router {
  const router = Router();

  /**
   * GET /api/health
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const workspaces = await viteManager.listWorkspaces();
      res.json({
        status: 'ok',
        service: 'antislop-backend',
        timestamp: new Date().toISOString(),
        port: ENV.BACKEND_PORT,
        targetVitePort: ENV.TARGET_VITE_PORT,
        viteReady: viteManager.isReady(),
        previewUrl: viteManager.getActiveWorkspace()?.previewUrl || '/preview/',
        activeWorkspace: viteManager.getActiveWorkspace(),
        availableWorkspaces: workspaces.length,
        lastViteError: viteManager.getLastViteError(),
        pool: geminiEngine.getPoolStatus(),
        geminiPool: geminiEngine.getPoolStatus(),
        githubConfigured: Boolean(ENV.GITHUB_TOKEN),
        models: {
          director: ENV.GEMINI_MODEL_DIRECTOR,
          architect: ENV.GEMINI_MODEL_ARCHITECT,
          patcher: ENV.GEMINI_MODEL_PATCHER,
          fastCritic: ENV.GEMINI_MODEL_FAST_CRITIC,
          decisions: ENV.GEMINI_MODEL_DECISIONS,
          imageGen: ENV.GEMINI_MODEL_IMAGE_GEN,
          embedding: ENV.GEMINI_MODEL_EMBEDDING,
          transcribe: ENV.GEMINI_MODEL_TRANSCRIBE,
          managedAgentBase: ENV.GEMINI_MANAGED_AGENT_BASE,
        },
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: errorMessage(err) });
    }
  });

  /**
   * GET /api/workspaces
   */
  router.get('/workspaces', async (_req: Request, res: Response) => {
    try {
      const workspaces = await viteManager.listWorkspaces();
      res.json({
        workspaces,
        activeWorkspace: viteManager.getActiveWorkspace(),
      });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/workspaces/switch
   */
  router.post('/workspaces/switch', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { workspaceId?: string; id?: string };
      const workspaceId = (body.workspaceId || body.id || '').trim();
      if (!workspaceId) {
        res.status(400).json({ error: 'workspaceId is required' });
        return;
      }

      const workspace = await viteManager.switchWorkspace(workspaceId);
      const files = await snapshotManager.readEditableFiles(workspace.localPath);
      res.json({
        workspace,
        editableFiles: Object.keys(files),
      });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  /**
   * GET /api/github/repos
   */
  router.get('/github/repos', async (_req: Request, res: Response) => {
    try {
      const repos = await githubManager.listUserRepos();
      res.json({ repos });
    } catch (err) {
      const msg = errorMessage(err);
      const status = /not configured/i.test(msg) ? 503 : 500;
      res.status(status).json({ error: msg });
    }
  });

  /**
   * POST /api/github/connect
   */
  router.post('/github/connect', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { repoUrl?: string; branch?: string };
      const repoUrl = (body.repoUrl || '').trim();
      if (!repoUrl) {
        res.status(400).json({ error: 'repoUrl is required' });
        return;
      }

      const workspace = await githubManager.connectGitHubRepo(repoUrl, body.branch?.trim() || undefined);
      res.json({ workspace });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/github/pr
   */
  router.post('/github/pr', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { title?: string; description?: string };
      const pr = await githubManager.createPullRequestForActiveWorkspace(body.title, body.description);
      res.json(pr);
    } catch (err) {
      const msg = errorMessage(err);
      const status = /not configured/i.test(msg) ? 503 : 400;
      res.status(status).json({ error: msg });
    }
  });

  /**
   * POST /api/transcribe
   * Accepts either JSON { audioBase64, mimeType } or multipart/form-data with field "audio" / "file"
   */
  router.post('/transcribe', upload.any(), async (req: Request, res: Response) => {
    try {
      let audioBase64 = '';
      let mimeType = 'audio/webm';

      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length > 0) {
        const uploaded = files[0];
        audioBase64 = uploaded.buffer.toString('base64');
        mimeType = uploaded.mimetype || mimeType;
      } else {
        const body = (req.body ?? {}) as {
          audioBase64?: string;
          dataBase64?: string;
          mimeType?: string;
        };
        const raw = body.audioBase64 || body.dataBase64 || '';
        audioBase64 = stripBase64Prefix(raw);
        if (body.mimeType) mimeType = body.mimeType;
      }

      if (!audioBase64) {
        res.status(400).json({ error: 'Audio payload is required (audioBase64 or multipart audio file)' });
        return;
      }

      const result = await geminiEngine.transcribeVoice(audioBase64, mimeType);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/reference/capture-url
   * Captures a live public website screenshot (1440x900 JPEG) + computed CSS DNA
   * as an instant moodboard_image MediaAssetInput for AntiSlop.
   */
  router.post('/reference/capture-url', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { url?: string };
      const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
      if (!rawUrl) {
        res.status(400).json({ error: 'url is required' });
        return;
      }

      const captured = await puppeteerAuditor.captureReferenceWebsite(rawUrl);
      let hostname = 'reference-site';
      try {
        hostname = new URL(captured.url).hostname.replace(/^www\./i, '') || hostname;
      } catch {
        // Keep safe fallback hostname
      }

      res.json({
        asset: {
          id: `url-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`,
          modality: 'moodboard_image' as const,
          mimeType: captured.mimeType,
          dataBase64: captured.screenshotBase64,
          fileUrl: captured.screenshotUrl,
          filename: `${hostname}.jpg`,
          label: `${hostname} (Live URL)`,
        },
        url: captured.url,
        title: captured.title,
        screenshotUrl: captured.screenshotUrl,
        extractedCssSummary: captured.extractedCssSummary,
        cssDna: captured.cssDna,
        latencyMs: captured.latencyMs,
      });
    } catch (err) {
      const msg = errorMessage(err);
      const isClientError = /required|Invalid URL|Unsupported URL|Blocked|embedded credentials/i.test(msg);
      res.status(isClientError ? 400 : 502).json({ error: msg });
    }
  });

  /**
   * POST /api/recommendations
   * Generates 4 domain-grounded AntiSlop design & Nano Banana art recommendations for the active workspace.
   */
  router.post('/recommendations', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { focus?: string; referenceSummary?: string };
      const focus =
        typeof body.focus === 'string' && body.focus.trim()
          ? body.focus.trim()
          : typeof body.referenceSummary === 'string' && body.referenceSummary.trim()
          ? body.referenceSummary.trim()
          : undefined;
      const result = await generateWorkspaceRecommendations({
        focus,
      });
      res.json(result);
    } catch (err) {
      const msg = errorMessage(err);
      const status = /No active/i.test(msg) ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  });

  /**
   * POST /api/decisions/deep-audit
   * Runs 900 single-pass (or 1,800 dual-key sharded) calibrated Decisions API probes over the active UI.
   */
  router.post('/decisions/deep-audit', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        mode?: DeepDecisionAuditMode;
        screenshotBase64?: string;
        workspaceId?: string;
        brandSummary?: string;
      };
      let screenshotBase64 =
        typeof body.screenshotBase64 === 'string'
          ? stripBase64Prefix(body.screenshotBase64)
          : '';
      let screenshotUrl: string | undefined;

      if (!screenshotBase64 || screenshotBase64.length < 64) {
        const snap = await puppeteerAuditor.captureAndAudit(
          undefined,
          `deep-audit-${Date.now()}`
        );
        screenshotBase64 = snap.desktopBase64;
        screenshotUrl = snap.desktopUrl;
      }

      const activeWs = viteManager.getActiveWorkspace();
      const result = await runDeepDecisionAudit({
        mode:
          body.mode === '1800_dual_key_sharded'
            ? '1800_dual_key_sharded'
            : '900_single_pass',
        screenshotBase64,
        workspaceId: body.workspaceId || activeWs?.id,
        brandSummary: body.brandSummary || activeWs?.name,
      });

      res.json({
        ...result,
        ...(screenshotUrl ? { screenshotUrl } : {}),
      });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/decisions/route-entropy
   * Shannon-entropy adaptive compute router (early_stop / argon / neon / carbon).
   */
  router.post('/decisions/route-entropy', (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        prodReadyProb?: number;
        brokenProb?: number;
        domGatesPassed?: boolean;
      };
      const decision = routeByDecisionEntropy({
        prodReadyProb: typeof body.prodReadyProb === 'number' ? body.prodReadyProb : 0.5,
        brokenProb: typeof body.brokenProb === 'number' ? body.brokenProb : 0.2,
        domGatesPassed: body.domGatesPassed !== false,
      });
      res.json(decision);
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/decisions/pairwise-judge
   * Position-swapped blind Bradley-Terry A/B judge via gemini-decision-1 (0 output tokens).
   */
  router.post('/decisions/pairwise-judge', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        baselineBase64?: string;
        candidateBase64?: string;
        brandSummary?: string;
      };
      if (!body.baselineBase64 || !body.candidateBase64) {
        res.status(400).json({ error: 'baselineBase64 and candidateBase64 are required' });
        return;
      }
      const result = await runPairwiseBlindJudge({
        baselineBase64: stripBase64Prefix(body.baselineBase64),
        candidateBase64: stripBase64Prefix(body.candidateBase64),
        brandSummary: body.brandSummary,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/decisions/conversion-audit
   * 10-probe Conversion Readiness & Brand Drift audit via gemini-decision-1 (0 output tokens).
   */
  router.post('/decisions/conversion-audit', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        screenshotBase64?: string;
        referenceBase64?: string;
        brandSummary?: string;
      };
      let screenshotBase64 =
        typeof body.screenshotBase64 === 'string'
          ? stripBase64Prefix(body.screenshotBase64)
          : '';
      if (!screenshotBase64 || screenshotBase64.length < 64) {
        const snap = await puppeteerAuditor.captureAndAudit(
          undefined,
          `conv-audit-${Date.now()}`
        );
        screenshotBase64 = snap.desktopBase64;
      }
      const activeWs = viteManager.getActiveWorkspace();
      const result = await runConversionAndBrandAudit({
        screenshotBase64,
        referenceBase64: body.referenceBase64 ? stripBase64Prefix(body.referenceBase64) : undefined,
        brandSummary: body.brandSummary || activeWs?.name,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * GET /api/design/archetypes
   * Returns 10 APCA-verified world-class OKLCH palette archetypes (cached).
   */
  router.get('/design/archetypes', (_req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ archetypes: getVerifiedArchetypes() });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * GET /api/design/typography
   * Returns 24 verified Google Fonts + Fontshare pairings with optical metrics (cached).
   */
  router.get('/design/typography', (_req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ pairings: VERIFIED_TYPOGRAPHY_PAIRINGS });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/design/extract-image-palette
   * Extracts Oklab k-means++ swatches & APCA-verified OKLCH seeds from any uploaded moodboard image.
   */
  router.post('/design/extract-image-palette', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        imageBase64?: string;
        mimeType?: string;
        modeHint?: 'light' | 'dark';
      };
      if (!body.imageBase64 || body.imageBase64.trim().length < 32) {
        res.status(400).json({ error: 'imageBase64 is required' });
        return;
      }
      const extracted = await puppeteerAuditor.extractPaletteFromImage(
        body.imageBase64,
        body.mimeType || 'image/png',
        body.modeHint
      );
      res.json(extracted);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/design/apply-instant-look
   * Zero-LLM (<50ms) live palette + verified webfont injection directly into the active workspace.
   */
  router.post('/design/apply-instant-look', async (req: Request, res: Response) => {
    try {
      const activeWs = viteManager.getActiveWorkspace();
      if (!activeWs) {
        res.status(400).json({ error: 'No active workspace' });
        return;
      }
      const body = (req.body ?? {}) as Partial<CompileDesignTokensInput> & {
        pairingId?: string;
      };
      const pairing = resolveVerifiedTypography({
        pairingId: body.pairingId,
        displayFont: body.typography?.displayFont,
        bodyFont: body.typography?.bodyFont,
        monoFont: body.typography?.monoFont,
      });
      const compiled = compileDesignTokens({
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Instant Atelier Look',
        mode: body.mode === 'light' ? 'light' : 'dark',
        palette: body.palette,
        seedAccentHex: body.seedAccentHex,
        seedNeutralHex: body.seedNeutralHex,
        typography: {
          displayFont: pairing.displayFont,
          bodyFont: pairing.bodyFont,
          monoFont: pairing.monoFont,
          googleFontsUrl: pairing.primaryGoogleFontsUrl,
        },
      });
      const injected = await injectInstantLookIntoWorkspace({
        workspacePath: activeWs.localPath,
        compiled,
        stylesheetUrls: pairing.stylesheetUrls,
        typographyCss: buildTypographyCssBlock(pairing),
        displayFont: pairing.displayFont,
        bodyFont: pairing.bodyFont,
        monoFont: pairing.monoFont,
      });
      res.json({
        applied: true,
        pairing,
        compiled,
        injected,
      });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * GET /api/skills
   * Lists all installed SKILL.md design craft bundles (AntiSlop v2, Google M3E Baseline 2026, etc.).
   */
  router.get('/skills', async (_req: Request, res: Response) => {
    try {
      const skills = await listInstalledSkills();
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json({ skills });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * GET /api/brand-memory/:workspaceId & POST /api/brand-memory/:workspaceId
   * Persistent Brand DNA profiles (locked OKLCH palettes, fonts, mounted skills, banned tropes & score history).
   */
  router.get('/brand-memory/:workspaceId', async (req: Request, res: Response) => {
    try {
      const workspaceId = getParam(req, 'workspaceId') || 'novaflow-slop';
      const profile = await brandMemoryStore.getProfile(workspaceId);
      res.json({ profile });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  router.post('/brand-memory/:workspaceId', async (req: Request, res: Response) => {
    try {
      const workspaceId = getParam(req, 'workspaceId') || 'novaflow-slop';
      const patch = (req.body ?? {}) as Partial<BrandMemoryProfile>;
      const profile = await brandMemoryStore.saveProfile(workspaceId, patch);
      res.json({ profile });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/audit/interactions
   * Runs 5-state interactive browser audit (default, hover, focus-visible Tab, scroll, reduced-motion + CWV).
   */
  router.post('/audit/interactions', async (_req: Request, res: Response) => {
    try {
      const report = await puppeteerAuditor.auditLiveInteractions(viteManager.getProxiedPreviewUrl());
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/inspect/region
   * Resolves a normalized circled box [0..1] to exact DOM selectors, computed styles & React Fiber source lines.
   */
  router.post('/inspect/region', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { x?: number; y?: number; width?: number; height?: number };
      const nodes = await puppeteerAuditor.inspectCircledDom(viteManager.getProxiedPreviewUrl(), {
        x: typeof body.x === 'number' ? body.x : 0.25,
        y: typeof body.y === 'number' ? body.y : 0.25,
        width: typeof body.width === 'number' ? body.width : 0.5,
        height: typeof body.height === 'number' ? body.height : 0.3,
      });
      res.json({ nodes });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/decisions/delta-tensor
   * Multi-Viewport & Polarity Delta Tensor with Silent Regression Veto.
   */
  router.post('/decisions/delta-tensor', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        beforeDesktopBase64?: string;
        afterDesktopBase64?: string;
        beforeMobileBase64?: string;
        afterMobileBase64?: string;
        brandSummary?: string;
      };
      if (!body.beforeDesktopBase64 || !body.afterDesktopBase64) {
        res.status(400).json({ error: 'beforeDesktopBase64 and afterDesktopBase64 are required' });
        return;
      }
      const result = await runMultiViewportDeltaTensor({
        beforeDesktopBase64: stripBase64Prefix(body.beforeDesktopBase64),
        afterDesktopBase64: stripBase64Prefix(body.afterDesktopBase64),
        beforeMobileBase64: body.beforeMobileBase64 ? stripBase64Prefix(body.beforeMobileBase64) : undefined,
        afterMobileBase64: body.afterMobileBase64 ? stripBase64Prefix(body.afterMobileBase64) : undefined,
        brandSummary: body.brandSummary,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/decisions/coarse-fine-xray
   * Two-stage 2x DPR micro-craft zoom X-Ray over cropped hotspot tiles.
   */
  router.post('/decisions/coarse-fine-xray', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        tileCrops?: Array<{ region: ZoomTileRegion; cropBase64: string }>;
        brandSummary?: string;
      };
      if (!Array.isArray(body.tileCrops) || body.tileCrops.length === 0) {
        res.status(400).json({ error: 'tileCrops array is required' });
        return;
      }
      const result = await runCoarseFineZoomXray({
        tileCrops: body.tileCrops.map((c) => ({
          region: c.region,
          cropBase64: stripBase64Prefix(c.cropBase64),
        })),
        brandSummary: body.brandSummary,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/decisions/copilot-pulse
   * Real-time <400ms 12-probe micro-pulse for live coding / Gemini 3.8 Live proactive alerts.
   */
  router.post('/decisions/copilot-pulse', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        screenshotBase64?: string;
        brandSummary?: string;
        threshold?: number;
      };
      let screenshotBase64 =
        typeof body.screenshotBase64 === 'string' ? stripBase64Prefix(body.screenshotBase64) : '';
      if (!screenshotBase64 || screenshotBase64.length < 64) {
        const snap = await puppeteerAuditor.captureAndAudit(undefined, `pulse-${Date.now()}`);
        screenshotBase64 = snap.desktopBase64;
      }
      const result = await runCopilotMicroPulse({
        screenshotBase64,
        brandSummary: body.brandSummary,
        threshold: body.threshold,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/design/compile-palette
   * Compiles OKLCH 12-step ramps, enforces APCA Lc contrast, and outputs CSS + Tailwind v4 + W3C tokens.json.
   */
  router.post('/design/compile-palette', (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Partial<CompileDesignTokensInput>;
      const compiled = compileDesignTokens({
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Custom Atelier',
        mode: body.mode === 'light' ? 'light' : 'dark',
        palette: body.palette,
        seedAccentHex: body.seedAccentHex,
        seedNeutralHex: body.seedNeutralHex,
        typography: body.typography,
      });
      res.json(compiled);
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/audit/geometry
   * Runs deterministic computed-DOM APCA contrast, typography measure, layout rhythm & A11y audit.
   */
  router.post('/audit/geometry', async (_req: Request, res: Response) => {
    try {
      const report = await puppeteerAuditor.auditLiveGeometry(viteManager.getProxiedPreviewUrl());
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * GET /api/repo/graph
   * Returns the codebase-scale dependency graph and optional query-ranked relevant files.
   */
  router.get('/repo/graph', async (req: Request, res: Response) => {
    try {
      const activeWs = viteManager.getActiveWorkspace();
      if (!activeWs) {
        res.status(400).json({ error: 'No active workspace' });
        return;
      }
      const graph = await buildRepoDependencyGraph(activeWs.localPath, 60);
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const relevantFiles = q ? selectRelevantFiles(graph, q, 16) : graph.indexedFiles.slice(0, 16).map((f) => f.relPath);
      res.json({ graph, relevantFiles });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/transform
   */
  router.post('/transform', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as TransformRunRequest & { waitForCompletion?: boolean };
      const validModes = new Set(['antislop', 'text_baseline', 'stress_test', 'circle_tweak']);
      const mode = validModes.has(body.mode) ? body.mode : 'antislop';

      const normalizedReq: TransformRunRequest = {
        ...body,
        mode,
        assets: Array.isArray(body.assets) ? body.assets : [],
      };

      const { runId, run, completion } = transformOrchestrator.startTransformRun(normalizedReq);

      const shouldWait = req.query.wait === 'true' || body.waitForCompletion === true;
      if (shouldWait) {
        const finalRun = await completion;
        res.json(finalRun);
        return;
      }

      res.json({
        runId,
        status: run.status,
        streamUrl: `/api/runs/${runId}/stream`,
        run,
      });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  /**
   * GET /api/runs
   */
  router.get('/runs', (_req: Request, res: Response) => {
    res.json({
      runs: transformOrchestrator.listRuns(),
    });
  });

  /**
   * GET /api/runs/:runId
   */
  router.get('/runs/:runId', (req: Request, res: Response) => {
    const runId = getParam(req, 'runId');
    const run = transformOrchestrator.getRun(runId);
    if (!run) {
      res.status(404).json({ error: `Run not found: ${runId}` });
      return;
    }
    res.json(run);
  });

  /**
   * GET /api/runs/:runId/stream
   * Live SSE stream with buffered replay & keep-alive heartbeat
   */
  router.get('/runs/:runId/stream', (req: Request, res: Response) => {
    const runId = getParam(req, 'runId');
    eventBus.attachSseStream(runId, req, res);
  });

  /**
   * POST /api/snapshot/reset
   */
  router.post('/snapshot/reset', async (req: Request, res: Response) => {
    try {
      const activeWs = viteManager.getActiveWorkspace();
      if (!activeWs) {
        res.status(400).json({ error: 'No active workspace to reset' });
        return;
      }

      viteManager.clearLastViteError();
      const { restoredFiles, removedFiles } = await snapshotManager.resetToBaseline(activeWs.localPath);

      // Give Vite HMR a brief beat to reload the restored baseline
      await new Promise((resolve) => setTimeout(resolve, 400));

      const shouldCapture = req.query.capture === 'true' || (req.body as { capture?: boolean } | undefined)?.capture === true;
      let screenshotUrl: string | undefined;
      if (shouldCapture) {
        const cap = await puppeteerAuditor.captureAndAudit(
          viteManager.getProxiedPreviewUrl(),
          `reset-${Date.now()}`
        );
        screenshotUrl = cap.desktopUrl;
      }

      res.json({
        reset: true,
        workspaceId: activeWs.id,
        restoredFiles,
        removedFiles,
        ...(screenshotUrl ? { screenshotUrl } : {}),
      });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/snapshot/capture (plus GET alias)
   */
  const handleCapture = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = (req.body ?? {}) as {
        includeMobile?: boolean;
        includeBase64?: boolean;
        fullPage?: boolean;
        prefix?: string;
      };
      const includeMobile = body.includeMobile === true || req.query.mobile === 'true';
      const includeBase64 = body.includeBase64 === true || req.query.base64 === 'true';
      const fullPage = body.fullPage === true || req.query.fullPage === 'true';
      const prefix = body.prefix || `snapshot-${Date.now()}`;

      const capture = await puppeteerAuditor.captureAndAudit(viteManager.getProxiedPreviewUrl(), prefix, {
        includeMobile,
        fullPage,
      });

      res.json({
        screenshotUrl: capture.desktopUrl,
        ...(capture.mobileUrl ? { mobileScreenshotUrl: capture.mobileUrl } : {}),
        domAudit: capture.domAudit,
        consoleErrors: capture.consoleErrors,
        viteOverlayError: capture.viteOverlayError,
        lastViteError: viteManager.getLastViteError(),
        isBlankPage: capture.isBlankPage,
        ...(includeBase64
          ? {
              desktopBase64: capture.desktopBase64,
              ...(capture.mobileBase64 ? { mobileBase64: capture.mobileBase64 } : {}),
            }
          : {}),
      });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  };

  router.post('/snapshot/capture', handleCapture);
  router.get('/snapshot/capture', handleCapture);

  /**
   * GET /api/files
   */
  router.get('/files', async (_req: Request, res: Response) => {
    try {
      const activeWs = viteManager.getActiveWorkspace();
      if (!activeWs) {
        res.status(400).json({ error: 'No active workspace' });
        return;
      }

      const files = await snapshotManager.readEditableFiles(activeWs.localPath);
      const diff = await snapshotManager.computeSimpleDiff(activeWs.localPath);

      res.json({
        workspaceId: activeWs.id,
        fileList: Object.keys(files),
        files,
        diff,
      });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * PUT /api/files (optional live manual edit support)
   */
  router.put('/files', async (req: Request, res: Response) => {
    try {
      const activeWs = viteManager.getActiveWorkspace();
      if (!activeWs) {
        res.status(400).json({ error: 'No active workspace' });
        return;
      }

      const body = (req.body ?? {}) as { files?: Record<string, string> };
      if (!body.files || typeof body.files !== 'object') {
        res.status(400).json({ error: 'files map is required' });
        return;
      }

      viteManager.clearLastViteError();
      const written = await snapshotManager.writeFiles(activeWs.localPath, body.files);
      const diff = await snapshotManager.computeSimpleDiff(activeWs.localPath);
      res.json({ written, diff });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * POST /api/managed-agent/ship
   * Streams ManagedAgentEvents over SSE if requested (Accept: text/event-stream or ?stream=true),
   * or returns complete JSON { events, ...result } for standard POST requests.
   */
  router.post('/managed-agent/ship', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ManagedAgentShipRequest;
    if (!body.repoUrl || !body.manifest || !body.scorecard) {
      res.status(400).json({ error: 'repoUrl, manifest, and scorecard are required' });
      return;
    }

    const wantsSse =
      req.query.stream === 'true' ||
      String(req.headers.accept || '').toLowerCase().includes('text/event-stream');

    if (wantsSse) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.status(200);
      res.flushHeaders?.();

      const sendEvent = (ev: ManagedAgentEvent): void => {
        if (res.writableEnded || res.destroyed) return;
        try {
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
        } catch {
          // Client disconnected
        }
      };

      try {
        const result = await geminiEngine.shipToRemoteRepoViaManagedAgent(body, sendEvent);
        sendEvent({
          type: 'completed',
          timestamp: new Date().toISOString(),
          environmentId: result.environmentId,
          interactionId: result.interactionId,
          message: result.summary,
          detail: { buildPassed: result.buildPassed },
        });
      } catch (err) {
        sendEvent({
          type: 'error',
          timestamp: new Date().toISOString(),
          message: errorMessage(err),
        });
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    try {
      const events: ManagedAgentEvent[] = [];
      const result = await geminiEngine.shipToRemoteRepoViaManagedAgent(body, (ev) => {
        events.push(ev);
      });
      res.json({
        ok: true,
        ...result,
        events,
      });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  return router;
}
