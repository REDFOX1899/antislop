import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type {
  ManagedAgentEvent,
  ManagedAgentShipRequest,
  TransformRunRequest,
} from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { geminiEngine } from '../gemini/index.js';
import { transformOrchestrator } from '../orchestrator/transformOrchestrator.js';
import { eventBus } from '../sandbox/eventBus.js';
import { githubManager } from '../sandbox/githubManager.js';
import { puppeteerAuditor } from '../sandbox/puppeteerAuditor.js';
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
