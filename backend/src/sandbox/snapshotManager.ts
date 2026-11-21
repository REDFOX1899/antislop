import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.vite',
  '.turbo',
  'coverage',
  '.cache',
  'public',
]);

const ALLOWED_EXTENSIONS = new Set(['.html', '.css', '.scss', '.tsx', '.jsx', '.ts', '.js']);

const BLOCKED_PATH_PREFIXES = ['.git/', 'node_modules/', '.env'];
const BLOCKED_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env',
  '.env.local',
  '.env.production',
]);

const MAX_EDITABLE_FILE_BYTES = 80_000;

/** Ordered priority list so entrypoints and design token files are always included first */
const PRIORITY_FILES = [
  'index.html',
  'src/index.css',
  'src/styles/tokens.css',
  'src/globals.css',
  'src/App.css',
  'app/globals.css',
  'src/app/globals.css',
  'src/App.tsx',
  'src/App.jsx',
  'app/layout.tsx',
  'src/app/layout.tsx',
  'app/page.tsx',
  'src/app/page.tsx',
  'pages/index.tsx',
  'pages/index.jsx',
  'src/data/content.ts',
  'src/data/content.tsx',
  'src/data/products.ts',
  'styles.css',
  'style.css',
];

const SKIP_DISCOVERY_BASENAMES = new Set([
  'vite-env.d.ts',
  'next-env.d.ts',
  'main.tsx',
  'main.jsx',
  'main.ts',
  'main.js',
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'postcss.config.cjs',
  'postcss.config.mjs',
  'tsconfig.json',
  'eslint.config.js',
]);

export interface FileDiffEntry {
  file: string;
  added: number;
  removed: number;
  status: 'modified' | 'added' | 'deleted';
}

export interface SimpleDiffResult {
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  summary: string;
  perFile: FileDiffEntry[];
}

interface TempSnapshotRecord {
  id: string;
  label?: string;
  workspacePath: string;
  files: Record<string, string>;
  createdFilesSnapshot: Set<string>;
  createdAt: number;
}

function normalizeRelPath(inputPath: string): string {
  const cleaned = inputPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .trim();
  return path.posix.normalize(cleaned);
}

function isSafeRelativeFilePath(workspacePath: string, relPath: string): boolean {
  if (!relPath || relPath === '.' || relPath.startsWith('..') || path.isAbsolute(relPath)) {
    return false;
  }
  const lower = relPath.toLowerCase();
  for (const prefix of BLOCKED_PATH_PREFIXES) {
    if (lower === prefix.replace(/\/$/, '') || lower.startsWith(prefix)) {
      return false;
    }
  }
  const base = path.posix.basename(lower);
  if (BLOCKED_FILENAMES.has(base)) {
    return false;
  }
  const resolvedRoot = path.resolve(workspacePath);
  const resolvedTarget = path.resolve(resolvedRoot, relPath);
  return resolvedTarget.startsWith(resolvedRoot + path.sep);
}

function computeLineDelta(beforeText: string, afterText: string): { added: number; removed: number } {
  if (beforeText === afterText) return { added: 0, removed: 0 };
  const beforeLines = beforeText === '' ? [] : beforeText.split('\n');
  const afterLines = afterText === '' ? [] : afterText.split('\n');

  const beforeCounts = new Map<string, number>();
  for (const line of beforeLines) {
    beforeCounts.set(line, (beforeCounts.get(line) ?? 0) + 1);
  }

  let matched = 0;
  for (const line of afterLines) {
    const count = beforeCounts.get(line) ?? 0;
    if (count > 0) {
      matched += 1;
      beforeCounts.set(line, count - 1);
    }
  }

  return {
    added: Math.max(0, afterLines.length - matched),
    removed: Math.max(0, beforeLines.length - matched),
  };
}

export class SnapshotManager {
  private readonly baselines = new Map<string, Record<string, string>>();
  private readonly createdFiles = new Map<string, Set<string>>();
  private readonly tempSnapshots = new Map<string, TempSnapshotRecord>();
  private readonly latestTempSnapshotByWorkspace = new Map<string, string>();

  private keyFor(workspacePath: string): string {
    return path.resolve(workspacePath);
  }

  async discoverEditableFiles(workspacePath: string, maxFiles = 10): Promise<string[]> {
    const root = this.keyFor(workspacePath);
    const chosen: string[] = [];
    const seen = new Set<string>();

    const tryAdd = async (rel: string): Promise<void> => {
      if (chosen.length >= maxFiles) return;
      const norm = normalizeRelPath(rel);
      if (seen.has(norm) || !isSafeRelativeFilePath(root, norm)) return;
      const full = path.join(root, norm);
      try {
        const stat = await fs.stat(full);
        if (!stat.isFile() || stat.size > MAX_EDITABLE_FILE_BYTES) return;
        seen.add(norm);
        chosen.push(norm);
      } catch {
        // File does not exist
      }
    };

    // 1. Add priority files in canonical order
    for (const candidate of PRIORITY_FILES) {
      await tryAdd(candidate);
      if (chosen.length >= maxFiles) return chosen;
    }

    // 2. Recursively scan common frontend source directories
    const scanDirs = ['src', 'app', 'components', 'pages', '.'];
    const discovered: Array<{ rel: string; score: number }> = [];

    const walk = async (dirAbs: string, depth: number, maxDepth: number): Promise<void> => {
      if (depth > maxDepth) return;
      let entries;
      try {
        entries = await fs.readdir(dirAbs, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const abs = path.join(dirAbs, entry.name);
        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name)) continue;
          if (dirAbs === root && !['src', 'app', 'components', 'pages', 'styles'].includes(entry.name)) {
            continue;
          }
          await walk(abs, depth + 1, maxDepth);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!ALLOWED_EXTENSIONS.has(ext)) continue;
          if (SKIP_DISCOVERY_BASENAMES.has(entry.name)) continue;
          if (/\.(test|spec|stories|d)\.[tj]sx?$/i.test(entry.name)) continue;

          const rel = normalizeRelPath(path.relative(root, abs));
          if (seen.has(rel) || !isSafeRelativeFilePath(root, rel)) continue;

          try {
            const stat = await fs.stat(abs);
            if (stat.size === 0 || stat.size > MAX_EDITABLE_FILE_BYTES) continue;
            let score = 10;
            if (ext === '.css') score += 25;
            if (ext === '.tsx' || ext === '.jsx') score += 20;
            if (ext === '.html') score += 30;
            if (rel.startsWith('src/components/') || rel.startsWith('components/')) score += 15;
            if (rel.startsWith('src/styles/') || rel.startsWith('src/data/')) score += 18;
            if (rel.toLowerCase().includes('hero') || rel.toLowerCase().includes('landing')) score += 12;
            discovered.push({ rel, score });
          } catch {
            // Skip unreadable
          }
        }
      }
    };

    for (const sub of scanDirs) {
      const target = sub === '.' ? root : path.join(root, sub);
      await walk(target, 0, sub === '.' ? 0 : 3);
    }

    // Deduplicate & rank discovered files
    const uniqueDiscovered = new Map<string, number>();
    for (const item of discovered) {
      const prev = uniqueDiscovered.get(item.rel);
      if (prev === undefined || item.score > prev) {
        uniqueDiscovered.set(item.rel, item.score);
      }
    }

    const sorted = [...uniqueDiscovered.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([rel]) => rel);

    for (const rel of sorted) {
      await tryAdd(rel);
      if (chosen.length >= maxFiles) break;
    }

    return chosen;
  }

  hasBaseline(workspacePath: string): boolean {
    return this.baselines.has(this.keyFor(workspacePath));
  }

  getBaseline(workspacePath: string): Record<string, string> | undefined {
    const base = this.baselines.get(this.keyFor(workspacePath));
    return base ? { ...base } : undefined;
  }

  async captureBaseline(workspacePath: string, force = false, maxFiles = 10): Promise<Record<string, string>> {
    const root = this.keyFor(workspacePath);
    if (!force && this.baselines.has(root)) {
      return { ...this.baselines.get(root)! };
    }

    const filePaths = await this.discoverEditableFiles(root, maxFiles);
    const snapshot: Record<string, string> = {};

    for (const rel of filePaths) {
      const full = path.join(root, rel);
      try {
        snapshot[rel] = await fs.readFile(full, 'utf8');
      } catch {
        // Ignore transient unreadable file
      }
    }

    this.baselines.set(root, snapshot);
    this.createdFiles.set(root, new Set());
    return { ...snapshot };
  }

  async readEditableFiles(workspacePath: string, explicitFiles?: string[]): Promise<Record<string, string>> {
    const root = this.keyFor(workspacePath);
    const baseline = this.baselines.get(root);
    const created = this.createdFiles.get(root);

    const fileSet = new Set<string>();
    if (explicitFiles && explicitFiles.length > 0) {
      for (const f of explicitFiles) fileSet.add(normalizeRelPath(f));
    } else if (baseline) {
      for (const f of Object.keys(baseline)) fileSet.add(f);
      if (created) {
        for (const f of created) fileSet.add(f);
      }
    } else {
      const discovered = await this.discoverEditableFiles(root);
      for (const f of discovered) fileSet.add(f);
    }

    const result: Record<string, string> = {};
    for (const rel of fileSet) {
      if (!isSafeRelativeFilePath(root, rel)) continue;
      const full = path.join(root, rel);
      try {
        result[rel] = await fs.readFile(full, 'utf8');
      } catch {
        // File might have been deleted or not yet created
      }
    }
    return result;
  }

  async writeFiles(workspacePath: string, files: Record<string, string>): Promise<string[]> {
    const root = this.keyFor(workspacePath);
    if (!this.baselines.has(root)) {
      await this.captureBaseline(root);
    }
    const baseline = this.baselines.get(root)!;
    let created = this.createdFiles.get(root);
    if (!created) {
      created = new Set<string>();
      this.createdFiles.set(root, created);
    }

    const written: string[] = [];

    for (const [rawRel, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue;
      const rel = normalizeRelPath(rawRel);
      if (!isSafeRelativeFilePath(root, rel)) {
        console.warn(`[SnapshotManager] Blocked unsafe file write path: ${rawRel}`);
        continue;
      }

      const full = path.join(root, rel);
      if (!(rel in baseline)) {
        try {
          const existingContent = await fs.readFile(full, 'utf8');
          baseline[rel] = existingContent;
        } catch {
          created.add(rel);
        }
      }

      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf8');
      written.push(rel);
    }

    return written;
  }

  async resetToBaseline(workspacePath: string): Promise<{ restoredFiles: string[]; removedFiles: string[] }> {
    const root = this.keyFor(workspacePath);
    const baseline = this.baselines.get(root);
    if (!baseline) {
      await this.captureBaseline(root);
      return { restoredFiles: [], removedFiles: [] };
    }

    const restoredFiles: string[] = [];
    for (const [rel, content] of Object.entries(baseline)) {
      if (!isSafeRelativeFilePath(root, rel)) continue;
      const full = path.join(root, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf8');
      restoredFiles.push(rel);
    }

    const removedFiles: string[] = [];
    const created = this.createdFiles.get(root);
    if (created) {
      for (const rel of [...created]) {
        if (!isSafeRelativeFilePath(root, rel)) continue;
        // Keep generated public images untouched; remove extra generated source files
        if (rel.startsWith('public/generated/')) continue;
        const full = path.join(root, rel);
        try {
          await fs.unlink(full);
          removedFiles.push(rel);
        } catch {
          // Already removed
        }
      }
      created.clear();
    }

    return { restoredFiles, removedFiles };
  }

  async saveTempSnapshot(workspacePath: string, label?: string): Promise<string> {
    const root = this.keyFor(workspacePath);
    const files = await this.readEditableFiles(root);
    const created = new Set<string>(this.createdFiles.get(root) ?? []);
    const id = `snap-${Date.now()}-${randomUUID().slice(0, 8)}`;

    this.tempSnapshots.set(id, {
      id,
      label,
      workspacePath: root,
      files,
      createdFilesSnapshot: created,
      createdAt: Date.now(),
    });
    this.latestTempSnapshotByWorkspace.set(root, id);

    // Prune oldest temp snapshots if map grows large
    if (this.tempSnapshots.size > 40) {
      const oldestKey = this.tempSnapshots.keys().next().value;
      if (oldestKey && oldestKey !== id) {
        this.tempSnapshots.delete(oldestKey);
      }
    }

    return id;
  }

  async restoreTempSnapshot(workspacePath: string, snapshotId?: string): Promise<string[]> {
    const root = this.keyFor(workspacePath);
    const targetId = snapshotId ?? this.latestTempSnapshotByWorkspace.get(root);
    if (!targetId) {
      return [];
    }

    const record = this.tempSnapshots.get(targetId);
    if (!record || record.workspacePath !== root) {
      return [];
    }

    const restored: string[] = [];
    for (const [rel, content] of Object.entries(record.files)) {
      if (!isSafeRelativeFilePath(root, rel)) continue;
      const full = path.join(root, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf8');
      restored.push(rel);
    }

    // Remove any files created AFTER this temp snapshot was taken
    const currentCreated = this.createdFiles.get(root);
    if (currentCreated) {
      for (const rel of [...currentCreated]) {
        if (!record.createdFilesSnapshot.has(rel) && !rel.startsWith('public/generated/')) {
          const full = path.join(root, rel);
          try {
            await fs.unlink(full);
          } catch {
            // Already removed
          }
          currentCreated.delete(rel);
        }
      }
    }

    return restored;
  }

  async computeSimpleDiff(
    workspacePath: string,
    againstFiles?: Record<string, string>
  ): Promise<SimpleDiffResult> {
    const root = this.keyFor(workspacePath);
    const reference = againstFiles ?? this.baselines.get(root) ?? {};
    const current = await this.readEditableFiles(root);

    const allFiles = new Set<string>([...Object.keys(reference), ...Object.keys(current)]);
    const perFile: FileDiffEntry[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const file of [...allFiles].sort()) {
      const before = reference[file];
      const after = current[file];
      if (before === after) continue;

      if (before === undefined && after !== undefined) {
        const added = after === '' ? 0 : after.split('\n').length;
        linesAdded += added;
        perFile.push({ file, added, removed: 0, status: 'added' });
      } else if (before !== undefined && after === undefined) {
        const removed = before === '' ? 0 : before.split('\n').length;
        linesRemoved += removed;
        perFile.push({ file, added: 0, removed, status: 'deleted' });
      } else if (before !== undefined && after !== undefined) {
        const delta = computeLineDelta(before, after);
        linesAdded += delta.added;
        linesRemoved += delta.removed;
        perFile.push({ file, added: delta.added, removed: delta.removed, status: 'modified' });
      }
    }

    const filesChanged = perFile.map((entry) => entry.file);
    const summary =
      filesChanged.length === 0
        ? 'No file changes'
        : `${filesChanged.length} file${filesChanged.length === 1 ? '' : 's'} changed (+${linesAdded}/-${linesRemoved} lines): ${filesChanged.join(', ')}`;

    return {
      filesChanged,
      linesAdded,
      linesRemoved,
      summary,
      perFile,
    };
  }
}

export const snapshotManager = new SnapshotManager();
