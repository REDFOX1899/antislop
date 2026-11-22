import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export type RepoFileRole =
  | 'entry'
  | 'layout'
  | 'page'
  | 'component'
  | 'style'
  | 'tokens'
  | 'data'
  | 'config';

export interface IndexedRepoFile {
  relPath: string;
  role: RepoFileRole;
  sizeBytes: number;
  lineCount: number;
  imports: string[];
  importedBy: string[];
  exportedSymbols: string[];
  priorityScore: number;
}

export interface RepoDependencyGraph {
  workspacePath: string;
  totalFilesScanned: number;
  indexedFiles: IndexedRepoFile[];
  entrypoints: string[];
  styleFiles: string[];
  componentCount: number;
  scanMs: number;
}

export interface SurgicalPatchHunk {
  filePath: string;
  search: string;
  replace: string;
}

export interface SurgicalPatchResult {
  applied: number;
  failed: Array<{ filePath: string; reason: string }>;
  modifiedFiles: string[];
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.vercel',
  '.antislop-backups',
  'coverage',
  '.turbo',
  '.cache',
  '.vite',
]);

const FRONTEND_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.scss',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.svelte',
  '.astro',
]);

const RESOLVABLE_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.vue',
  '.svelte',
  '.astro',
  '.css',
  '.scss',
  '.json',
];

const BLOCKED_PATH_PREFIXES = ['.git/', 'node_modules/', '.env', '.antislop-backups/'];

const BLOCKED_FILENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
]);

const MAX_SCAN_FILE_BYTES = 150 * 1024; // 150KB

const HIGH_PRIORITY_PATHS = new Set([
  'index.html',
  'src/index.css',
  'src/styles/tokens.css',
  'src/globals.css',
  'src/app.css',
  'app/globals.css',
  'src/app/globals.css',
  'src/app.tsx',
  'src/app.jsx',
  'src/app.vue',
  'src/app.svelte',
  'app/layout.tsx',
  'src/app/layout.tsx',
  'app/page.tsx',
  'src/app/page.tsx',
  'pages/index.tsx',
  'pages/index.jsx',
  'styles.css',
  'style.css',
  'tokens.json',
  'src/tokens.json',
  'src/styles/tokens.json',
]);

const GLOBAL_STYLE_BASENAMES = new Set([
  'globals.css',
  'global.css',
  'index.css',
  'app.css',
  'styles.css',
  'style.css',
  'main.css',
  'theme.css',
  'variables.css',
  'tokens.css',
]);

const QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'this',
  'that',
  'these',
  'those',
  'make',
  'edit',
  'fix',
  'change',
  'update',
  'modify',
  'please',
  'more',
  'less',
  'very',
  'better',
  'look',
  'like',
  'should',
  'would',
  'could',
  'have',
  'has',
  'are',
  'was',
  'were',
  'not',
  'all',
  'our',
  'your',
]);

const STYLE_QUERY_HINTS = new Set([
  'color',
  'colors',
  'palette',
  'font',
  'fonts',
  'typography',
  'spacing',
  'padding',
  'margin',
  'theme',
  'token',
  'tokens',
  'css',
  'style',
  'styles',
  'styling',
  'dark',
  'light',
  'contrast',
  'gradient',
  'shadow',
  'border',
  'radius',
  'background',
]);

const DATA_QUERY_HINTS = new Set([
  'copy',
  'text',
  'content',
  'data',
  'pricing',
  'price',
  'plan',
  'plans',
  'product',
  'products',
  'testimonial',
  'testimonials',
  'faq',
  'feature',
  'features',
  'items',
  'catalog',
]);

interface ScannedFileDraft {
  relPath: string;
  role: RepoFileRole;
  sizeBytes: number;
  lineCount: number;
  rawImportSpecifiers: string[];
  imports: string[];
  importedBy: string[];
  exportedSymbols: string[];
  priorityScore: number;
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

function isSupportedFrontendFile(relPath: string): boolean {
  const lower = relPath.toLowerCase();
  const base = path.posix.basename(lower);
  const ext = path.posix.extname(lower);
  if (FRONTEND_EXTENSIONS.has(ext)) {
    return true;
  }
  if (ext === '.json') {
    return base === 'tokens.json' || base === 'design-tokens.json' || base.endsWith('.tokens.json');
  }
  return false;
}

function classifyFileRole(relPath: string): RepoFileRole {
  const lower = relPath.toLowerCase();
  const base = path.posix.basename(lower);
  const ext = path.posix.extname(lower);
  const stem = ext ? base.slice(0, -ext.length) : base;

  if (
    base === 'tokens.json' ||
    base === 'design-tokens.json' ||
    base.endsWith('.tokens.json') ||
    stem === 'tokens' ||
    stem === 'design-tokens' ||
    stem === 'designtokens' ||
    lower.includes('/tokens/')
  ) {
    return 'tokens';
  }

  if (ext === '.css' || ext === '.scss') {
    return 'style';
  }

  if (
    base.includes('.config.') ||
    base === 'vite-env.d.ts' ||
    base === 'next-env.d.ts' ||
    base === 'tsconfig.json' ||
    lower.startsWith('config/')
  ) {
    return 'config';
  }

  if (
    lower === 'index.html' ||
    base === 'main.tsx' ||
    base === 'main.ts' ||
    base === 'main.jsx' ||
    base === 'main.js' ||
    lower === 'src/index.tsx' ||
    lower === 'src/index.ts' ||
    lower === 'src/index.jsx' ||
    lower === 'src/index.js' ||
    lower === 'src/app.tsx' ||
    lower === 'src/app.jsx' ||
    lower === 'src/app.ts' ||
    lower === 'src/app.js' ||
    lower === 'src/app.vue' ||
    lower === 'src/app.svelte' ||
    lower === 'app.tsx' ||
    lower === 'app.jsx'
  ) {
    return 'entry';
  }

  if (
    stem === 'layout' ||
    stem === '_app' ||
    stem === '_document' ||
    stem === 'root' ||
    stem.endsWith('layout') ||
    lower.includes('/layouts/')
  ) {
    return 'layout';
  }

  if (
    stem === 'page' ||
    stem.endsWith('page') ||
    lower.startsWith('pages/') ||
    lower.startsWith('src/pages/') ||
    lower.includes('/routes/') ||
    lower.includes('/views/')
  ) {
    return 'page';
  }

  if (
    lower.includes('/data/') ||
    lower.includes('/content/') ||
    lower.includes('/constants/') ||
    lower.includes('/mock/') ||
    lower.includes('/mocks/') ||
    lower.includes('/fixtures/') ||
    stem === 'content' ||
    stem === 'data' ||
    stem === 'products' ||
    stem === 'copy'
  ) {
    return 'data';
  }

  return 'component';
}

function extractRawImportSpecifiers(relPath: string, content: string): string[] {
  const ext = path.posix.extname(relPath).toLowerCase();
  const found = new Set<string>();

  if (ext === '.css' || ext === '.scss') {
    const cssImportRegex = /@(?:import|use|forward)\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?/g;
    let match: RegExpExecArray | null;
    while ((match = cssImportRegex.exec(content)) !== null) {
      const spec = match[1]?.trim();
      if (spec && !spec.startsWith('http://') && !spec.startsWith('https://') && !spec.startsWith('data:')) {
        found.add(spec);
      }
    }
    return Array.from(found);
  }

  if (ext === '.html') {
    const htmlAssetRegex = /<(?:link|script)\b[^>]*(?:href|src)=['"]([^'"]+)['"]/gi;
    let match: RegExpExecArray | null;
    while ((match = htmlAssetRegex.exec(content)) !== null) {
      const spec = match[1]?.trim();
      if (spec && !spec.startsWith('http://') && !spec.startsWith('https://') && !spec.startsWith('//')) {
        found.add(spec);
      }
    }
    return Array.from(found);
  }

  // JS/TS/JSX/TSX/Vue/Svelte/Astro ES imports, re-exports, dynamic imports, and CSS @import inside <style>
  const esFromRegex = /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = esFromRegex.exec(content)) !== null) {
    const spec = match[1]?.trim();
    if (spec) found.add(spec);
  }

  const sideEffectImportRegex = /\bimport\s+['"]([^'"]+)['"]/g;
  while ((match = sideEffectImportRegex.exec(content)) !== null) {
    const spec = match[1]?.trim();
    if (spec) found.add(spec);
  }

  const dynamicImportRegex = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const spec = match[1]?.trim();
    if (spec) found.add(spec);
  }

  if (ext === '.vue' || ext === '.svelte' || ext === '.astro') {
    const styleImportRegex = /@(?:import|use)\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?/g;
    while ((match = styleImportRegex.exec(content)) !== null) {
      const spec = match[1]?.trim();
      if (spec) found.add(spec);
    }
  }

  return Array.from(found);
}

function resolveImportSpecifier(
  fromRelPath: string,
  specifier: string,
  knownFiles: Set<string>
): string | null {
  const cleanSpec = specifier.split('?')[0]?.split('#')[0]?.trim() ?? '';
  if (!cleanSpec) return null;

  const candidateBases: string[] = [];
  const fromDir = path.posix.dirname(fromRelPath);

  if (cleanSpec.startsWith('./') || cleanSpec.startsWith('../')) {
    candidateBases.push(normalizeRelPath(path.posix.join(fromDir, cleanSpec)));
  } else if (cleanSpec.startsWith('@/')) {
    const sub = cleanSpec.slice(2);
    candidateBases.push(normalizeRelPath(path.posix.join('src', sub)));
    candidateBases.push(normalizeRelPath(sub));
  } else if (cleanSpec.startsWith('~/')) {
    const sub = cleanSpec.slice(2);
    candidateBases.push(normalizeRelPath(path.posix.join('src', sub)));
    candidateBases.push(normalizeRelPath(sub));
  } else if (cleanSpec.startsWith('/')) {
    const sub = cleanSpec.slice(1);
    candidateBases.push(normalizeRelPath(sub));
    candidateBases.push(normalizeRelPath(path.posix.join('src', sub)));
  } else if (fromRelPath.endsWith('.css') || fromRelPath.endsWith('.scss') || fromRelPath.endsWith('.html')) {
    // Relative CSS/HTML reference without leading ./
    candidateBases.push(normalizeRelPath(path.posix.join(fromDir, cleanSpec)));
  } else {
    // Bare package specifier (e.g. 'react', 'lucide-react')
    return null;
  }

  for (const base of candidateBases) {
    if (!base || base.startsWith('..')) continue;
    if (knownFiles.has(base)) return base;

    // Handle TypeScript ESM .js import pointing to .ts/.tsx source
    if (base.endsWith('.js') || base.endsWith('.jsx')) {
      const withoutExt = base.slice(0, base.lastIndexOf('.'));
      for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
        const candidate = `${withoutExt}${ext}`;
        if (knownFiles.has(candidate)) return candidate;
      }
    }

    // Try appending known extensions
    for (const ext of RESOLVABLE_EXTENSIONS) {
      const candidate = `${base}${ext}`;
      if (knownFiles.has(candidate)) return candidate;
    }

    // Try SCSS partial convention (_filename.scss)
    const dir = path.posix.dirname(base);
    const leaf = path.posix.basename(base);
    const partialPrefix = dir === '.' ? `_${leaf}` : `${dir}/_${leaf}`;
    for (const ext of ['.scss', '.css', '']) {
      const candidate = `${partialPrefix}${ext}`;
      if (knownFiles.has(candidate)) return candidate;
    }

    // Try directory index files
    for (const indexExt of ['.tsx', '.ts', '.jsx', '.js']) {
      const candidate = normalizeRelPath(`${base}/index${indexExt}`);
      if (knownFiles.has(candidate)) return candidate;
    }
  }

  return null;
}

function extractExportedSymbols(relPath: string, content: string): string[] {
  const ext = path.posix.extname(relPath).toLowerCase();
  const symbols = new Set<string>();

  if (ext === '.json') {
    try {
      const parsed: unknown = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed as Record<string, unknown>).slice(0, 24)) {
          symbols.add(key);
        }
      }
    } catch {
      // Ignore malformed JSON
    }
    return Array.from(symbols);
  }

  if (ext === '.css' || ext === '.scss') {
    // Extract top CSS custom properties (design tokens) up to 24
    const cssVarRegex = /--([a-zA-Z0-9_-]{2,48})\s*:/g;
    let match: RegExpExecArray | null;
    while ((match = cssVarRegex.exec(content)) !== null && symbols.size < 24) {
      if (match[1]) symbols.add(`--${match[1]}`);
    }
    return Array.from(symbols);
  }

  if (ext === '.html') {
    const idRegex = /\bid=['"]([a-zA-Z][a-zA-Z0-9_-]{1,40})['"]/g;
    let match: RegExpExecArray | null;
    while ((match = idRegex.exec(content)) !== null && symbols.size < 20) {
      if (match[1]) symbols.add(match[1]);
    }
    return Array.from(symbols);
  }

  const declarationRegex =
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = declarationRegex.exec(content)) !== null) {
    if (match[1]) symbols.add(match[1]);
  }

  const defaultIdentifierRegex = /\bexport\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[;\n]/g;
  while ((match = defaultIdentifierRegex.exec(content)) !== null) {
    if (match[1] && match[1] !== 'function' && match[1] !== 'class' && match[1] !== 'async') {
      symbols.add(match[1]);
    }
  }

  const namedBlockRegex = /\bexport\s+(?:type\s+)?\{([^}]+)\}/g;
  while ((match = namedBlockRegex.exec(content)) !== null) {
    const body = match[1] ?? '';
    for (const part of body.split(',')) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const aliasParts = cleaned.split(/\s+as\s+/);
      const exportedName = (aliasParts[1] ?? aliasParts[0] ?? '').replace(/^type\s+/, '').trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportedName) && exportedName !== 'default') {
        symbols.add(exportedName);
      }
    }
  }

  // SFC files (.vue, .svelte, .astro) often export implicitly via filename
  if ((ext === '.vue' || ext === '.svelte' || ext === '.astro') && symbols.size === 0) {
    const stem = path.posix.basename(relPath, ext);
    if (stem) symbols.add(stem);
  }

  return Array.from(symbols).slice(0, 32);
}

function computePriorityScore(draft: ScannedFileDraft): number {
  const lower = draft.relPath.toLowerCase();
  const base = path.posix.basename(lower);
  const depth = draft.relPath.split('/').length - 1;

  let score: number;
  switch (draft.role) {
    case 'entry':
      score = 95;
      break;
    case 'tokens':
      score = 92;
      break;
    case 'layout':
      score = 88;
      break;
    case 'page':
      score = 82;
      break;
    case 'style':
      score = GLOBAL_STYLE_BASENAMES.has(base) ? 90 : 72;
      break;
    case 'data':
      score = 62;
      break;
    case 'component':
      score = 56;
      break;
    case 'config':
      score = 25;
      break;
  }

  if (HIGH_PRIORITY_PATHS.has(lower)) {
    score += 15;
  }

  // Components/modules imported by many other files are structural hubs
  score += Math.min(35, draft.importedBy.length * 7);

  // Entrypoints/pages that compose many components get a modest hub bonus
  score += Math.min(12, Math.round(draft.imports.length * 1.5));

  // Penalize test/story files
  if (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('.stories.') ||
    lower.includes('/__tests__/')
  ) {
    score -= 40;
  }

  // Slight depth penalty for deeply nested utility files
  if (depth > 4) {
    score -= Math.min(10, (depth - 4) * 2);
  }

  return Math.max(0, Math.round(score));
}

async function walkWorkspaceFiles(
  rootPath: string,
  currentDir: string,
  outPaths: string[]
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walkWorkspaceFiles(rootPath, path.join(currentDir, entry.name), outPaths);
    } else if (entry.isFile()) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = normalizeRelPath(path.relative(rootPath, fullPath));
      if (!relPath || !isSupportedFrontendFile(relPath)) continue;
      if (!isSafeRelativeFilePath(rootPath, relPath)) continue;
      outPaths.push(relPath);
    }
  }
}

export async function buildRepoDependencyGraph(
  workspacePath: string,
  maxFiles = 60
): Promise<RepoDependencyGraph> {
  const startMs = performance.now();
  const resolvedRoot = path.resolve(workspacePath);
  const clampedMax = Math.max(1, Math.floor(maxFiles));

  const candidatePaths: string[] = [];
  await walkWorkspaceFiles(resolvedRoot, resolvedRoot, candidatePaths);

  const drafts: ScannedFileDraft[] = [];
  const knownFiles = new Set<string>();

  for (const relPath of candidatePaths) {
    const absPath = path.join(resolvedRoot, relPath);
    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_SCAN_FILE_BYTES) {
      continue;
    }

    let content: string;
    try {
      content = await fs.readFile(absPath, 'utf8');
    } catch {
      continue;
    }

    const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;
    const role = classifyFileRole(relPath);
    const rawImportSpecifiers = extractRawImportSpecifiers(relPath, content);
    const exportedSymbols = extractExportedSymbols(relPath, content);

    knownFiles.add(relPath);
    drafts.push({
      relPath,
      role,
      sizeBytes: stat.size,
      lineCount,
      rawImportSpecifiers,
      imports: [],
      importedBy: [],
      exportedSymbols,
      priorityScore: 0,
    });
  }

  const byPath = new Map<string, ScannedFileDraft>();
  for (const draft of drafts) {
    byPath.set(draft.relPath, draft);
  }

  // Resolve forward imports and build reverse importedBy edges
  for (const draft of drafts) {
    const resolvedImports = new Set<string>();
    for (const spec of draft.rawImportSpecifiers) {
      const target = resolveImportSpecifier(draft.relPath, spec, knownFiles);
      if (target && target !== draft.relPath) {
        resolvedImports.add(target);
      }
    }
    draft.imports = Array.from(resolvedImports).sort();
    for (const target of draft.imports) {
      const targetDraft = byPath.get(target);
      if (targetDraft && !targetDraft.importedBy.includes(draft.relPath)) {
        targetDraft.importedBy.push(draft.relPath);
      }
    }
  }

  for (const draft of drafts) {
    draft.importedBy.sort();
    draft.priorityScore = computePriorityScore(draft);
  }

  drafts.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    return a.relPath.localeCompare(b.relPath);
  });

  const indexedFiles: IndexedRepoFile[] = drafts.slice(0, clampedMax).map((d) => ({
    relPath: d.relPath,
    role: d.role,
    sizeBytes: d.sizeBytes,
    lineCount: d.lineCount,
    imports: d.imports,
    importedBy: d.importedBy,
    exportedSymbols: d.exportedSymbols,
    priorityScore: d.priorityScore,
  }));

  const entrypoints = indexedFiles
    .filter((f) => f.role === 'entry' || f.role === 'layout' || f.role === 'page')
    .map((f) => f.relPath);

  const styleFiles = indexedFiles
    .filter((f) => f.role === 'style' || f.role === 'tokens')
    .map((f) => f.relPath);

  const componentCount = indexedFiles.filter((f) => f.role === 'component').length;
  const scanMs = Math.round((performance.now() - startMs) * 100) / 100;

  return {
    workspacePath: resolvedRoot,
    totalFilesScanned: drafts.length,
    indexedFiles,
    entrypoints,
    styleFiles,
    componentCount,
    scanMs,
  };
}

function tokenizeQuery(text: string): string[] {
  // Split camelCase / PascalCase boundaries first, then split on non-alphanumeric
  const splitCamel = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const rawTokens = splitCamel.toLowerCase().split(/[^a-z0-9]+/);
  const unique = new Set<string>();
  for (const token of rawTokens) {
    if (token.length >= 2 && !QUERY_STOPWORDS.has(token)) {
      unique.add(token);
    }
  }
  return Array.from(unique);
}

function splitIdentifierTokens(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

export function selectRelevantFiles(
  graph: RepoDependencyGraph,
  query: string,
  maxFiles = 16
): string[] {
  const clampedMax = Math.max(1, Math.floor(maxFiles));
  if (graph.indexedFiles.length === 0) {
    return [];
  }

  const queryTokens = tokenizeQuery(query);
  if (queryTokens.length === 0) {
    return [...graph.indexedFiles]
      .sort((a, b) => b.priorityScore - a.priorityScore || a.relPath.localeCompare(b.relPath))
      .slice(0, clampedMax)
      .map((f) => f.relPath);
  }

  const wantsStyle = queryTokens.some((t) => STYLE_QUERY_HINTS.has(t));
  const wantsData = queryTokens.some((t) => DATA_QUERY_HINTS.has(t));

  const fileByPath = new Map<string, IndexedRepoFile>();
  for (const file of graph.indexedFiles) {
    fileByPath.set(file.relPath, file);
  }

  const queryScores = new Map<string, number>();

  for (const file of graph.indexedFiles) {
    let qScore = 0;
    const lowerPath = file.relPath.toLowerCase();
    const ext = path.posix.extname(lowerPath);
    const base = path.posix.basename(lowerPath);
    const stem = ext ? base.slice(0, -ext.length) : base;
    const pathTokens = new Set(splitIdentifierTokens(file.relPath));

    for (const token of queryTokens) {
      if (stem === token || base === token) {
        qScore += 45;
      } else if (pathTokens.has(token)) {
        qScore += 24;
      } else if (lowerPath.includes(token)) {
        qScore += 14;
      }

      for (const sym of file.exportedSymbols) {
        const lowerSym = sym.toLowerCase();
        if (lowerSym === token || lowerSym === `--${token}`) {
          qScore += 32;
          break;
        }
        const symTokens = splitIdentifierTokens(sym);
        if (symTokens.includes(token)) {
          qScore += 18;
          break;
        }
      }
    }

    if (wantsStyle && (file.role === 'tokens' || file.role === 'style')) {
      qScore += 22;
    }
    if (wantsData && file.role === 'data') {
      qScore += 18;
    }

    queryScores.set(file.relPath, qScore);
  }

  // 1-hop dependency expansion from top query-matched files
  const expansionBonus = new Map<string, number>();
  const topQueryMatches = [...graph.indexedFiles]
    .filter((f) => (queryScores.get(f.relPath) ?? 0) > 0)
    .sort((a, b) => (queryScores.get(b.relPath) ?? 0) - (queryScores.get(a.relPath) ?? 0))
    .slice(0, 6);

  for (const matched of topQueryMatches) {
    const matchedScore = queryScores.get(matched.relPath) ?? 0;

    // Outgoing imports: styles, tokens, data, and child components used by the matched file
    for (const depPath of matched.imports) {
      const depFile = fileByPath.get(depPath);
      if (!depFile) continue;
      const roleMultiplier =
        depFile.role === 'style' || depFile.role === 'tokens' || depFile.role === 'data'
          ? 0.55
          : 0.4;
      const boost = Math.min(45, matchedScore * roleMultiplier);
      const prev = expansionBonus.get(depPath) ?? 0;
      if (boost > prev) {
        expansionBonus.set(depPath, boost);
      }
    }

    // Incoming importedBy: parent page/layout that renders the matched component
    for (const parentPath of matched.importedBy) {
      const parentFile = fileByPath.get(parentPath);
      if (!parentFile) continue;
      const boost = Math.min(30, matchedScore * 0.25);
      const prev = expansionBonus.get(parentPath) ?? 0;
      if (boost > prev) {
        expansionBonus.set(parentPath, boost);
      }
    }
  }

  const ranked = graph.indexedFiles.map((file) => {
    const structural = file.priorityScore * 0.45;
    const directQuery = queryScores.get(file.relPath) ?? 0;
    const hopBonus = expansionBonus.get(file.relPath) ?? 0;
    return {
      file,
      totalScore: structural + directQuery + hopBonus,
    };
  });

  ranked.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.file.priorityScore !== a.file.priorityScore) {
      return b.file.priorityScore - a.file.priorityScore;
    }
    return a.file.relPath.localeCompare(b.file.relPath);
  });

  return ranked.slice(0, clampedMax).map((entry) => entry.file.relPath);
}

function normalizeLineForFallback(line: string): string {
  return line.trim().replace(/[ \t]+/g, ' ');
}

function applyHunkToContent(
  content: string,
  search: string,
  replace: string
): { matched: boolean; nextContent: string; strategy?: 'exact' | 'normalized' } {
  // 1. Exact match (verbatim)
  const exactIndex = content.indexOf(search);
  if (exactIndex !== -1) {
    const nextContent =
      content.slice(0, exactIndex) + replace + content.slice(exactIndex + search.length);
    return { matched: true, nextContent, strategy: 'exact' };
  }

  // 1b. Exact match after normalizing CRLF -> LF (preserving file's original EOL)
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lfContent = content.replace(/\r\n/g, '\n');
  const lfSearch = search.replace(/\r\n/g, '\n');
  const lfReplace = replace.replace(/\r\n/g, '\n');

  const lfIndex = lfContent.indexOf(lfSearch);
  if (lfIndex !== -1) {
    const nextLf =
      lfContent.slice(0, lfIndex) + lfReplace + lfContent.slice(lfIndex + lfSearch.length);
    const nextContent = eol === '\r\n' ? nextLf.replace(/\n/g, '\r\n') : nextLf;
    return { matched: true, nextContent, strategy: 'exact' };
  }

  // 2. Whitespace-normalized line-block fallback
  const contentLines = lfContent.split('\n');
  const searchLines = lfSearch.split('\n');
  const normalizedSearch = searchLines.map(normalizeLineForFallback);

  if (normalizedSearch.length === 0 || normalizedSearch.every((line) => line === '')) {
    return { matched: false, nextContent: content };
  }

  const normalizedContent = contentLines.map(normalizeLineForFallback);
  const windowSize = normalizedSearch.length;

  let matchStart = -1;
  for (let i = 0; i <= normalizedContent.length - windowSize; i += 1) {
    let allEqual = true;
    for (let j = 0; j < windowSize; j += 1) {
      if (normalizedContent[i + j] !== normalizedSearch[j]) {
        allEqual = false;
        break;
      }
    }
    if (allEqual) {
      matchStart = i;
      break;
    }
  }

  if (matchStart === -1) {
    return { matched: false, nextContent: content };
  }

  const replaceLines = lfReplace.split('\n');
  const updatedLines = [
    ...contentLines.slice(0, matchStart),
    ...replaceLines,
    ...contentLines.slice(matchStart + windowSize),
  ];

  const nextLf = updatedLines.join('\n');
  const nextContent = eol === '\r\n' ? nextLf.replace(/\n/g, '\r\n') : nextLf;
  return { matched: true, nextContent, strategy: 'normalized' };
}

export async function applySurgicalPatches(
  workspacePath: string,
  patches: SurgicalPatchHunk[]
): Promise<SurgicalPatchResult> {
  const resolvedRoot = path.resolve(workspacePath);
  let realRoot: string;
  try {
    realRoot = await fs.realpath(resolvedRoot);
  } catch {
    realRoot = resolvedRoot;
  }

  const failed: Array<{ filePath: string; reason: string }> = [];
  const originalContents = new Map<string, string>();
  const workingContents = new Map<string, string>();
  const absPathByRel = new Map<string, string>();
  const touchedRelPaths = new Set<string>();
  let applied = 0;

  for (const patch of patches) {
    const relPath = normalizeRelPath(patch.filePath);
    if (!isSafeRelativeFilePath(resolvedRoot, relPath)) {
      failed.push({
        filePath: patch.filePath,
        reason: 'Unsafe file path (path traversal or blocked file)',
      });
      continue;
    }

    if (!patch.search || patch.search.trim().length === 0) {
      failed.push({
        filePath: relPath,
        reason: 'Search block must not be empty',
      });
      continue;
    }

    const absPath = path.resolve(resolvedRoot, relPath);

    if (!workingContents.has(relPath)) {
      let realTarget: string;
      try {
        realTarget = await fs.realpath(absPath);
      } catch {
        failed.push({
          filePath: relPath,
          reason: 'Target file does not exist',
        });
        continue;
      }

      if (!realTarget.startsWith(realRoot + path.sep)) {
        failed.push({
          filePath: relPath,
          reason: 'Symlink target escapes workspace boundary',
        });
        continue;
      }

      try {
        const content = await fs.readFile(absPath, 'utf8');
        originalContents.set(relPath, content);
        workingContents.set(relPath, content);
        absPathByRel.set(relPath, absPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({
          filePath: relPath,
          reason: `Failed to read target file: ${message}`,
        });
        continue;
      }
    }

    const currentContent = workingContents.get(relPath);
    if (currentContent === undefined) {
      failed.push({
        filePath: relPath,
        reason: 'Internal state error: missing loaded content',
      });
      continue;
    }

    const result = applyHunkToContent(currentContent, patch.search, patch.replace);
    if (!result.matched) {
      failed.push({
        filePath: relPath,
        reason: 'Search block not found (exact and whitespace-normalized match failed)',
      });
      continue;
    }

    workingContents.set(relPath, result.nextContent);
    touchedRelPaths.add(relPath);
    applied += 1;
  }

  // Commit all modified files atomically with full rollback on any unexpected I/O error
  const filesToWrite: Array<{ relPath: string; absPath: string; content: string }> = [];
  for (const relPath of touchedRelPaths) {
    const nextContent = workingContents.get(relPath);
    const origContent = originalContents.get(relPath);
    const absPath = absPathByRel.get(relPath);
    if (nextContent !== undefined && absPath && nextContent !== origContent) {
      filesToWrite.push({ relPath, absPath, content: nextContent });
    }
  }

  const writtenSoFar: Array<{ relPath: string; absPath: string }> = [];
  try {
    for (const file of filesToWrite) {
      await fs.writeFile(file.absPath, file.content, 'utf8');
      writtenSoFar.push({ relPath: file.relPath, absPath: file.absPath });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Roll back every file already written during this commit
    for (const written of writtenSoFar) {
      const orig = originalContents.get(written.relPath);
      if (orig !== undefined) {
        try {
          await fs.writeFile(written.absPath, orig, 'utf8');
        } catch {
          // Best-effort rollback
        }
      }
    }
    return {
      applied: 0,
      failed: [
        ...failed,
        {
          filePath: filesToWrite[writtenSoFar.length]?.relPath ?? workspacePath,
          reason: `Unexpected I/O error during commit (all writes rolled back): ${message}`,
        },
      ],
      modifiedFiles: [],
    };
  }

  return {
    applied,
    failed,
    modifiedFiles: filesToWrite.map((f) => f.relPath).sort(),
  };
}
