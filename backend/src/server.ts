import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ENV } from './config/env.js';
import { liveVoiceUpgradeHandler } from './gemini/liveVoiceDirector.js';
import { createMcpRouter } from './mcp/antislopMcpServer.js';
import { createApiRouter } from './routes/api.js';
import { puppeteerAuditor, SCREENSHOTS_DIR } from './sandbox/puppeteerAuditor.js';
import { viteManager } from './sandbox/viteManager.js';

async function bootstrap(): Promise<void> {
  await fsPromises.mkdir(SCREENSHOTS_DIR, { recursive: true });

  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Static screenshot artifacts (desktop, mobile, and annotated circle-overlay PNGs)
  app.use(
    '/artifacts/screenshots',
    express.static(SCREENSHOTS_DIR, {
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    })
  );

  // Dynamic /generated/* static asset bridge for bespoke Nano Banana 2.1 imagery in active workspace
  app.use('/generated', (req: Request, res: Response, next: NextFunction) => {
    const active = viteManager.getActiveWorkspace();
    if (!active) {
      next();
      return;
    }
    const generatedDir = path.join(active.localPath, 'public', 'generated');
    if (!fs.existsSync(generatedDir)) {
      next();
      return;
    }

    // If requested extension (e.g. .png) differs from Nano Banana's output (.jpg/.webp), resolve stem cleanly
    const cleanRel = decodeURIComponent(req.path).replace(/^\/+/, '');
    if (cleanRel && !cleanRel.includes('..')) {
      const exactPath = path.join(generatedDir, cleanRel);
      if (!fs.existsSync(exactPath)) {
        const stem = cleanRel.replace(/\.[^.]+$/, '');
        for (const altExt of ['.jpg', '.jpeg', '.png', '.webp']) {
          const altFile = `${stem}${altExt}`;
          if (fs.existsSync(path.join(generatedDir, altFile))) {
            req.url = `/${altFile}`;
            break;
          }
        }
      }
    }

    express.static(generatedDir, {
      setHeaders: (staticRes) => {
        staticRes.setHeader('Cache-Control', 'no-cache');
        staticRes.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    })(req, res, next);
  });

  // REST + SSE API endpoints
  app.use('/api', createApiRouter());

  // Public Remote MCP Server (Streamable HTTP JSON-RPC 2.0 + well-known discovery)
  const mcpRouter = createMcpRouter();
  app.use('/mcp', mcpRouter);
  app.use('/.well-known/mcp.json', mcpRouter);

  // Reverse proxy for embedded Vite HMR / Next / Static preview sandbox (single-port Cloud Run ready!)
  const { httpMiddleware, wsUpgradeHandler } = viteManager.createPreviewProxy();

  app.use('/preview', (req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl === '/preview') {
      res.redirect(302, '/preview/');
      return;
    }
    httpMiddleware(req, res, next);
  });

  // Root metadata endpoint for Cloud Run & quick diagnostics
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'AntiSlop Engine',
      status: 'running',
      activeWorkspace: viteManager.getActiveWorkspace()?.id ?? null,
      viteReady: viteManager.isReady(),
      endpoints: {
        health: '/api/health',
        preview: '/preview/',
        workspaces: '/api/workspaces',
        transform: '/api/transform',
        runs: '/api/runs',
        screenshots: '/artifacts/screenshots/',
      },
    });
  });

  // Prevent benign browser /favicon.ico 404s from polluting Puppeteer console error audits
  app.get('/favicon.ico', (_req: Request, res: Response) => {
    const active = viteManager.getActiveWorkspace();
    if (active) {
      const favPath = path.join(active.localPath, 'public', 'favicon.ico');
      if (fs.existsSync(favPath)) {
        res.sendFile(favPath);
        return;
      }
    }
    res.status(204).end();
  });

  // Fallback static serving from active workspace's public/ AND root dir (for root-relative /styles.css, /app.js, /assets/* in static/vanilla/cloned GitHub repos)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.method !== 'GET' ||
      req.path === '/' ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/artifacts') ||
      req.path.startsWith('/preview')
    ) {
      next();
      return;
    }

    const active = viteManager.getActiveWorkspace();
    if (!active) {
      next();
      return;
    }

    // Security guard: never expose dotfiles, .git, node_modules, or server/package scripts
    const cleanRel = decodeURIComponent(req.path).replace(/^\/+/, '');
    if (
      !cleanRel ||
      cleanRel.includes('..') ||
      /(^|\/)\./.test(cleanRel) ||
      cleanRel.startsWith('node_modules/') ||
      /^(package(-lock)?\.json|server\.m?js|build\.m?js|vercel\.json)$/i.test(cleanRel)
    ) {
      next();
      return;
    }

    const publicDir = path.join(active.localPath, 'public');
    const tryRootStatic = () => {
      const candidate = path.resolve(active.localPath, cleanRel);
      if (candidate.startsWith(path.resolve(active.localPath)) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(cleanRel, { root: active.localPath, dotfiles: 'ignore' });
        return;
      }
      next();
    };

    if (fs.existsSync(publicDir)) {
      express.static(publicDir, { fallthrough: true })(req, res, tryRootStatic);
      return;
    }
    tryRootStatic();
  });

  // Express structured JSON error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    console.error('[AntiSlop Server Error]', message);
    if (!res.headersSent) {
      res.status(status).json({ error: message });
    }
  });

  const httpServer = http.createServer(app);

  // Route Gemini Live Voice Director WS upgrades (/api/live/ws) before Vite HMR proxy upgrades
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/api/live/ws')) {
      liveVoiceUpgradeHandler(req, socket, head);
      return;
    }
    wsUpgradeHandler(req, socket, head);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(ENV.BACKEND_PORT, '0.0.0.0', () => {
      console.log(
        `[AntiSlop Backend] Listening on http://0.0.0.0:${ENV.BACKEND_PORT} (preview proxy -> 127.0.0.1:${ENV.TARGET_VITE_PORT})`
      );
      resolve();
    });
  });

  // Auto-boot default built-in workspace ("novaflow-slop" at /target-repo)
  const bootDefaultWorkspace = async (): Promise<void> => {
    try {
      const workspaces = await viteManager.listWorkspaces();
      const defaultWs = workspaces.find((w) => w.id === 'novaflow-slop') ?? workspaces[0];
      if (!defaultWs) {
        console.warn(
          '[AntiSlop Backend] No built-in workspace found on disk yet (waiting for /target-repo). Use /api/workspaces/switch or /api/github/connect once available.'
        );
        return;
      }
      await viteManager.switchWorkspace(defaultWs.id);
      console.log(`[AntiSlop Backend] Default workspace "${defaultWs.id}" booted and baseline captured.`);
    } catch (err) {
      console.error(
        '[AntiSlop Backend] Failed to auto-boot default workspace:',
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  void bootDefaultWorkspace();

  // Graceful shutdown of Chromium + Vite child process + HTTP server
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[AntiSlop Backend] Received ${signal} — shutting down Chromium, Vite, and HTTP server...`);

    const forceExitTimer = setTimeout(() => {
      console.error('[AntiSlop Backend] Forced exit after shutdown timeout');
      process.exit(1);
    }, 8_000);
    forceExitTimer.unref();

    await Promise.allSettled([
      puppeteerAuditor.closeBrowser(),
      viteManager.shutdown(),
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
    ]);

    clearTimeout(forceExitTimer);
    console.log('[AntiSlop Backend] Clean shutdown complete.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[AntiSlop Backend] Fatal startup error:', err);
  process.exit(1);
});
