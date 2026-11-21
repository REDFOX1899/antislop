import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import httpProxy from 'http-proxy';
import type { WorkspaceRepoInfo } from '../../../shared/types.js';
import { ENV, REPO_ROOT, TARGET_REPO_DIR } from '../config/env.js';
import { snapshotManager } from './snapshotManager.js';

const execFileAsync = promisify(execFile);

const ANSI_REGEX = /\u001B\[[0-9;]*[A-Za-z]/g;
const VITE_ERROR_PATTERNS = [
  /\[vite\]\s*Internal server error/i,
  /Pre-transform error/i,
  /Failed to resolve import/i,
  /Transform failed/i,
  /SyntaxError:/i,
  /Parse failure/i,
  /Build failed/i,
  /Cannot find module/i,
  /ReferenceError:/i,
  /Error:.*(\.tsx|\.jsx|\.ts|\.css)/i,
];

const STATIC_MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export interface PreviewProxyBundle {
  proxy: httpProxy;
  httpMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  wsUpgradeHandler: (req: http.IncomingMessage, socket: Duplex, head: Buffer) => void;
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ViteManager {
  private readonly workspaces = new Map<string, Omit<WorkspaceRepoInfo, 'active'>>();
  private activeWorkspaceId: string | null = null;
  private childProcess: ChildProcess | null = null;
  private staticServer: http.Server | null = null;
  private proxyInstance: httpProxy | null = null;
  private ready = false;
  private lastViteError: string | null = null;
  private recentLogs: string[] = [];
  private switchQueue: Promise<unknown> = Promise.resolve();

  constructor() {
    this.registerBuiltinWorkspaces();
  }

  private registerBuiltinWorkspaces(): void {
    this.workspaces.set('novaflow-slop', {
      id: 'novaflow-slop',
      name: 'NovaFlow AI (Slop Baseline)',
      source: 'builtin',
      localPath: TARGET_REPO_DIR,
      framework: 'vite',
      previewUrl: '/preview/',
      editableFiles: [],
    });

    this.workspaces.set('shopcraft-store', {
      id: 'shopcraft-store',
      name: 'ShopCraft Storefront (E-Commerce)',
      source: 'builtin',
      localPath: path.join(REPO_ROOT, 'target-templates', 'shopcraft'),
      framework: 'vite',
      previewUrl: '/preview/',
      editableFiles: [],
    });
  }

  registerWorkspace(info: Omit<WorkspaceRepoInfo, 'active'>): WorkspaceRepoInfo {
    this.workspaces.set(info.id, {
      ...info,
      previewUrl: info.previewUrl || '/preview/',
    });
    return {
      ...this.workspaces.get(info.id)!,
      active: this.activeWorkspaceId === info.id,
    };
  }

  async listWorkspaces(): Promise<WorkspaceRepoInfo[]> {
    const result: WorkspaceRepoInfo[] = [];
    for (const ws of this.workspaces.values()) {
      if (!fs.existsSync(ws.localPath)) {
        continue;
      }
      let editableFiles = ws.editableFiles;
      if (!editableFiles || editableFiles.length === 0) {
        editableFiles = await snapshotManager.discoverEditableFiles(ws.localPath, ws.source === 'github' ? 6 : 10);
        ws.editableFiles = editableFiles;
      }
      result.push({
        ...ws,
        editableFiles,
        active: ws.id === this.activeWorkspaceId,
      });
    }
    return result;
  }

  getActiveWorkspace(): WorkspaceRepoInfo | null {
    if (!this.activeWorkspaceId) return null;
    const ws = this.workspaces.get(this.activeWorkspaceId);
    if (!ws) return null;
    return {
      ...ws,
      active: true,
    };
  }

  getActiveWorkspacePath(): string {
    const ws = this.getActiveWorkspace();
    if (!ws) {
      throw new Error('No active workspace is currently booted');
    }
    return ws.localPath;
  }

  isReady(): boolean {
    return this.ready;
  }

  getLastViteError(): string | null {
    return this.lastViteError;
  }

  clearLastViteError(): void {
    this.lastViteError = null;
  }

  getRecentLogs(): string[] {
    return [...this.recentLogs];
  }

  /**
   * Direct local target server URL (Vite on TARGET_VITE_PORT)
   */
  getDirectViteUrl(): string {
    const ws = this.getActiveWorkspace();
    const suffix = !ws || ws.framework === 'vite' ? '/preview/' : '/';
    return `http://127.0.0.1:${ENV.TARGET_VITE_PORT}${suffix}`;
  }

  /**
   * Preview URL through the Express backend proxy so /preview/* and /generated/* resolve identically for Puppeteer and Studio iframe
   */
  getProxiedPreviewUrl(): string {
    return `http://127.0.0.1:${ENV.BACKEND_PORT}/preview/`;
  }

  private appendLog(stream: 'stdout' | 'stderr', rawChunk: string): void {
    const clean = stripAnsi(rawChunk).trim();
    if (!clean) return;
    const lines = clean.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const entry = `[${stream}] ${line}`;
      this.recentLogs.push(entry);
      if (this.recentLogs.length > 60) {
        this.recentLogs.shift();
      }
      for (const pattern of VITE_ERROR_PATTERNS) {
        if (pattern.test(line)) {
          this.lastViteError = lines.slice(0, 6).join('\n');
          break;
        }
      }
    }
  }

  private async freeTargetPortIfOccupied(): Promise<void> {
    try {
      const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${ENV.TARGET_VITE_PORT}`], {
        timeout: 3000,
      });
      const pids = stdout
        .split(/\r?\n/)
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);

      if (pids.length === 0) return;

      console.warn(
        `[ViteManager] Found orphan process(es) occupying port ${ENV.TARGET_VITE_PORT} (${pids.join(', ')}) — terminating cleanly.`
      );
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Process already exited
        }
      }
      await sleep(350);
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process already exited
        }
      }
      await sleep(150);
    } catch {
      // lsof unavailable (e.g. minimal container) or no process listening on port
    }
  }

  private async killActiveProcess(): Promise<void> {
    this.ready = false;

    if (this.staticServer) {
      const serverToClose = this.staticServer;
      this.staticServer = null;
      await new Promise<void>((resolve) => {
        serverToClose.close(() => resolve());
        setTimeout(resolve, 1000);
      });
    }

    if (this.childProcess) {
      const proc = this.childProcess;
      this.childProcess = null;

      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        proc.once('exit', done);
        proc.once('close', done);

        try {
          if (proc.pid) {
            // Try killing entire process group first on POSIX, then direct pid
            try {
              process.kill(-proc.pid, 'SIGTERM');
            } catch {
              proc.kill('SIGTERM');
            }
          }
        } catch {
          done();
          return;
        }

        setTimeout(() => {
          if (!settled) {
            try {
              if (proc.pid) {
                try {
                  process.kill(-proc.pid, 'SIGKILL');
                } catch {
                  proc.kill('SIGKILL');
                }
              }
            } catch {
              // Ignore
            }
            setTimeout(done, 250);
          }
        }, 1500);
      });
    }

    await this.freeTargetPortIfOccupied();
  }

  private async ensureDependenciesInstalled(workspacePath: string): Promise<void> {
    const pkgPath = path.join(workspacePath, 'package.json');
    const nodeModulesPath = path.join(workspacePath, 'node_modules');
    if (!fs.existsSync(pkgPath) || fs.existsSync(nodeModulesPath)) {
      return;
    }

    console.log(`[ViteManager] Installing dependencies in ${workspacePath}...`);
    try {
      await execFileAsync('npm', ['install', '--no-audit', '--no-fund', '--legacy-peer-deps'], {
        cwd: workspacePath,
        timeout: 180_000,
        env: { ...process.env, CI: 'true' },
      });
    } catch (err) {
      console.warn('[ViteManager] npm install with --legacy-peer-deps failed, retrying standard npm install:', err);
      await execFileAsync('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: workspacePath,
        timeout: 180_000,
        env: { ...process.env, CI: 'true' },
      });
    }
  }

  private async startStaticServer(workspacePath: string): Promise<void> {
    const resolvedRoot = path.resolve(workspacePath);
    const server = http.createServer(async (req, res) => {
      try {
        const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
        let target = path.resolve(resolvedRoot, rel);

        if (!target.startsWith(resolvedRoot)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        let stat;
        try {
          stat = await fsPromises.stat(target);
          if (stat.isDirectory()) {
            target = path.join(target, 'index.html');
            stat = await fsPromises.stat(target);
          }
        } catch {
          // SPA fallback to index.html
          target = path.join(resolvedRoot, 'index.html');
          stat = await fsPromises.stat(target);
        }

        const ext = path.extname(target).toLowerCase();
        const contentType = STATIC_MIME_TYPES[ext] || 'application/octet-stream';
        const data = await fsPromises.readFile(target);
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
        res.end(data);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(ENV.TARGET_VITE_PORT, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    this.staticServer = server;
  }

  private async waitForServerReady(checkUrl: string, timeoutMs = 25_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.childProcess && this.childProcess.exitCode !== null) {
        const logs = this.recentLogs.slice(-10).join('\n');
        throw new Error(`Dev server exited early with code ${this.childProcess.exitCode}:\n${logs}`);
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(checkUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (res.status >= 200 && res.status < 500) {
          return;
        }
      } catch {
        // Still starting
      }

      await sleep(150);
    }

    throw new Error(`Timed out waiting for preview server at ${checkUrl} after ${timeoutMs}ms`);
  }

  switchWorkspace(workspaceId: string): Promise<WorkspaceRepoInfo> {
    const task = this.switchQueue.then(() => this.performSwitchWorkspace(workspaceId));
    // Keep queue alive even if a switch fails
    this.switchQueue = task.catch(() => undefined);
    return task;
  }

  private async performSwitchWorkspace(workspaceId: string): Promise<WorkspaceRepoInfo> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) {
      throw new Error(`Unknown workspace id: ${workspaceId}`);
    }
    if (!fs.existsSync(ws.localPath)) {
      throw new Error(`Workspace directory does not exist on disk: ${ws.localPath}`);
    }

    const startMs = Date.now();
    console.log(`[ViteManager] Switching active workspace to "${ws.id}" (${ws.framework}) at ${ws.localPath}`);

    await this.killActiveProcess();
    this.clearLastViteError();
    this.recentLogs = [];

    if (ws.framework === 'vite' || ws.framework === 'next') {
      await this.ensureDependenciesInstalled(ws.localPath);
    }

    if (ws.framework === 'static') {
      await this.startStaticServer(ws.localPath);
    } else if (ws.framework === 'next') {
      const localNextBin = path.join(ws.localPath, 'node_modules', '.bin', 'next');
      const cmd = fs.existsSync(localNextBin) ? localNextBin : 'npx';
      const args = fs.existsSync(localNextBin)
        ? ['dev', '-H', '127.0.0.1', '-p', String(ENV.TARGET_VITE_PORT)]
        : ['next', 'dev', '-H', '127.0.0.1', '-p', String(ENV.TARGET_VITE_PORT)];

      const proc = spawn(cmd, args, {
        cwd: ws.localPath,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1' },
      });
      this.childProcess = proc;
      proc.stdout?.on('data', (chunk) => this.appendLog('stdout', String(chunk)));
      proc.stderr?.on('data', (chunk) => this.appendLog('stderr', String(chunk)));
      proc.on('exit', (code) => {
        if (this.childProcess === proc) {
          this.ready = false;
          console.warn(`[ViteManager] Next dev server exited with code ${code}`);
        }
      });
    } else {
      const localViteBin = path.join(ws.localPath, 'node_modules', '.bin', 'vite');
      const cmd = fs.existsSync(localViteBin) ? localViteBin : 'npx';
      const args = fs.existsSync(localViteBin)
        ? [
            '--host',
            '127.0.0.1',
            '--port',
            String(ENV.TARGET_VITE_PORT),
            '--strictPort',
            '--base',
            '/preview/',
          ]
        : [
            'vite',
            '--host',
            '127.0.0.1',
            '--port',
            String(ENV.TARGET_VITE_PORT),
            '--strictPort',
            '--base',
            '/preview/',
          ];

      const proc = spawn(cmd, args, {
        cwd: ws.localPath,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      this.childProcess = proc;
      proc.stdout?.on('data', (chunk) => this.appendLog('stdout', String(chunk)));
      proc.stderr?.on('data', (chunk) => this.appendLog('stderr', String(chunk)));
      proc.on('exit', (code) => {
        if (this.childProcess === proc) {
          this.ready = false;
          console.warn(`[ViteManager] Vite dev server exited with code ${code}`);
        }
      });
    }

    const checkUrl =
      ws.framework === 'vite'
        ? `http://127.0.0.1:${ENV.TARGET_VITE_PORT}/preview/`
        : `http://127.0.0.1:${ENV.TARGET_VITE_PORT}/`;

    await this.waitForServerReady(checkUrl);

    this.activeWorkspaceId = ws.id;
    this.ready = true;

    // Discover editable files & capture clean baseline snapshot on first activation
    const maxFiles = ws.source === 'github' ? 6 : 10;
    const baseline = await snapshotManager.captureBaseline(ws.localPath, false, maxFiles);
    ws.editableFiles = Object.keys(baseline);

    console.log(
      `[ViteManager] Workspace "${ws.id}" ready in ${Date.now() - startMs}ms (${ws.editableFiles.length} editable files)`
    );

    return {
      ...ws,
      active: true,
    };
  }

  createPreviewProxy(): PreviewProxyBundle {
    if (!this.proxyInstance) {
      const proxy = httpProxy.createProxyServer({
        target: `http://127.0.0.1:${ENV.TARGET_VITE_PORT}`,
        ws: true,
        changeOrigin: true,
        xfwd: true,
      });

      proxy.on('proxyRes', (proxyRes) => {
        // Ensure any target app or cloned GitHub repo can render inside Studio's iframe
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
      });

      proxy.on('error', (err, _req, res) => {
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          const httpRes = res as http.ServerResponse;
          if (!httpRes.headersSent) {
            httpRes.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
            httpRes.end(
              `<!doctype html><html><body style="font-family:system-ui;padding:32px;background:#111;color:#eee;">
                <h2>AntiSlop Preview Sandbox Starting...</h2>
                <p>Target dev server is restarting (${err.message}). Refresh in a moment.</p>
                <script>setTimeout(() => location.reload(), 1200);</script>
              </body></html>`
            );
          }
        } else {
          // Net socket error on WebSocket upgrade
          try {
            (res as Duplex).destroy();
          } catch {
            // Ignore
          }
        }
      });

      this.proxyInstance = proxy;
    }

    const proxy = this.proxyInstance;

    const httpMiddleware = (req: Request, res: Response, _next: NextFunction): void => {
      const ws = this.getActiveWorkspace();
      if (!ws || ws.framework === 'vite') {
        // Express strips '/preview' from req.url when mounted at app.use('/preview', ...).
        // Restore full '/preview/...' path because Vite is started with --base /preview/
        req.url = req.originalUrl === '/preview' ? '/preview/' : req.originalUrl;
      } else {
        // For Next.js or static servers mounted at '/', keep stripped req.url
        req.url = req.url && req.url.length > 0 ? req.url : '/';
      }

      proxy.web(req, res, {
        target: `http://127.0.0.1:${ENV.TARGET_VITE_PORT}`,
        changeOrigin: true,
      });
    };

    const wsUpgradeHandler = (req: http.IncomingMessage, socket: Duplex, head: Buffer): void => {
      const reqUrl = req.url || '/';
      const protocol = String(req.headers['sec-websocket-protocol'] || '');
      const isPreviewWs = reqUrl.startsWith('/preview') || protocol.includes('vite-hmr');

      if (!isPreviewWs) {
        socket.destroy();
        return;
      }

      socket.on('error', () => {
        // Prevent uncaught EPIPE/ECONNRESET on abrupt HMR client disconnects
      });

      const ws = this.getActiveWorkspace();
      if (ws && ws.framework !== 'vite' && reqUrl.startsWith('/preview')) {
        req.url = reqUrl.replace(/^\/preview/, '') || '/';
      }

      proxy.ws(req, socket, head, {
        target: `http://127.0.0.1:${ENV.TARGET_VITE_PORT}`,
        changeOrigin: true,
      });
    };

    return { proxy, httpMiddleware, wsUpgradeHandler };
  }

  async shutdown(): Promise<void> {
    await this.killActiveProcess();
    if (this.proxyInstance) {
      try {
        this.proxyInstance.close();
      } catch {
        // Ignore
      }
      this.proxyInstance = null;
    }
  }
}

export const viteManager = new ViteManager();
