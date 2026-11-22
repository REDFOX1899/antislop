/**
 * Instant 0ms Token & Font Injector for AntiSlop v2.
 *
 * Writes compiled OKLCH / Display P3 design tokens and verified typography links
 * directly into the workspace's `index.html` (for instant Vite HMR / static preview)
 * and `src/antislop-tokens.css` (when `src/index.css` is present) with zero LLM calls.
 */

import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { CompiledDesignSystem } from './tokenCompiler.js';

export interface InstantLookInput {
  workspacePath: string;
  compiled: CompiledDesignSystem;
  stylesheetUrls: string[];
  typographyCss: string;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
}

export interface InstantLookResult {
  modifiedFiles: string[];
  injectedCssBytes: number;
  fontLinksCount: number;
  latencyMs: number;
}

const FONTS_START_MARKER = '<!-- ANTISLOP_INSTANT_FONTS_START -->';
const FONTS_END_MARKER = '<!-- ANTISLOP_INSTANT_FONTS_END -->';
const STYLE_ELEMENT_ID = 'antislop-instant-look';

const FONTS_BLOCK_REGEX =
  /<!-- ANTISLOP_INSTANT_FONTS_START -->[\s\S]*?<!-- ANTISLOP_INSTANT_FONTS_END -->/;
const STYLE_BLOCK_REGEX =
  /<style\b[^>]*\bid=["']antislop-instant-look["'][^>]*>[\s\S]*?<\/style>/i;
const HEAD_CLOSE_REGEX = /<\/head>/i;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeCssForStyleTag(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

function formatFontFamilyValue(font: string, fallback: string): string {
  const trimmed = font.trim().replace(/;+$/, '');
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.includes(',') || trimmed.includes('"') || trimmed.includes("'")) {
    return trimmed;
  }
  return `'${trimmed}'`;
}

function normalizeStylesheetUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of urls) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        continue;
      }
      const href = parsed.toString();
      if (!seen.has(href)) {
        seen.add(href);
        normalized.push(href);
      }
    } catch {
      // Ignore malformed stylesheet URLs
    }
  }

  return normalized;
}

function buildFontLinksBlock(stylesheetUrls: readonly string[]): string {
  const preconnectEntries: Array<{ origin: string; crossorigin: boolean }> = [];
  const seenOrigins = new Set<string>();

  const addPreconnect = (origin: string, crossorigin: boolean): void => {
    if (seenOrigins.has(origin)) return;
    seenOrigins.add(origin);
    preconnectEntries.push({ origin, crossorigin });
  };

  for (const href of stylesheetUrls) {
    try {
      const parsed = new URL(href);
      const isGoogleFonts = parsed.hostname === 'fonts.googleapis.com';
      addPreconnect(parsed.origin, !isGoogleFonts);
      if (isGoogleFonts) {
        addPreconnect('https://fonts.gstatic.com', true);
      }
    } catch {
      // Already validated above
    }
  }

  const lines: string[] = [FONTS_START_MARKER];
  for (const entry of preconnectEntries) {
    const crossOriginAttr = entry.crossorigin ? ' crossorigin' : '';
    lines.push(
      `  <link rel="preconnect" href="${escapeHtmlAttr(entry.origin)}"${crossOriginAttr} />`,
    );
  }
  for (const href of stylesheetUrls) {
    lines.push(`  <link rel="stylesheet" href="${escapeHtmlAttr(href)}" />`);
  }
  lines.push(`  ${FONTS_END_MARKER}`);

  return lines.join('\n');
}

function buildInstantLookStylesheet(input: InstantLookInput): string {
  const { compiled, typographyCss, displayFont, bodyFont, monoFont } = input;
  const { palette, mode } = compiled;

  const displayStack = formatFontFamilyValue(displayFont, 'Georgia, serif');
  const bodyStack = formatFontFamilyValue(bodyFont, 'system-ui, sans-serif');
  const monoStack = formatFontFamilyValue(monoFont, 'ui-monospace, monospace');

  const sections: string[] = [];

  const compiledVars = compiled.cssVariables.trim();
  if (compiledVars.length > 0) {
    sections.push(compiledVars);
  }

  const extraTypography = typographyCss.trim();
  if (extraTypography.length > 0) {
    sections.push(extraTypography);
  }

  sections.push(
    [
      '/* AntiSlop Instant Look — Semantic Aliases & Safe Surface Overrides */',
      ':root {',
      `  color-scheme: ${mode};`,
      `  --canvas: var(--oklch-canvas, ${palette.canvas});`,
      `  --surface: var(--oklch-surface, ${palette.surface});`,
      `  --surface-muted: var(--oklch-surface-muted, ${palette.surfaceMuted});`,
      `  --ink-primary: var(--oklch-ink-primary, ${palette.inkPrimary});`,
      `  --ink-secondary: var(--oklch-ink-secondary, ${palette.inkSecondary});`,
      `  --accent: var(--oklch-accent, ${palette.accent});`,
      `  --accent-contrast: var(--oklch-accent-contrast, ${palette.accentContrast});`,
      `  --border-subtle: var(--oklch-border-subtle, ${palette.borderSubtle});`,
      `  --font-display: ${displayStack};`,
      `  --font-body: ${bodyStack};`,
      `  --font-mono: ${monoStack};`,
      '}',
      '',
      'html {',
      '  background-color: var(--canvas);',
      '  color: var(--ink-primary);',
      '  font-family: var(--font-body), sans-serif;',
      '}',
      '',
      'body {',
      '  background-color: var(--canvas);',
      '  color: var(--ink-primary);',
      '  font-family: var(--font-body), sans-serif;',
      '}',
      '',
      'h1, h2, h3 {',
      '  font-family: var(--font-display), serif;',
      '  color: var(--ink-primary);',
      '}',
      '',
      'h4, h5, h6 {',
      '  font-family: var(--font-display), var(--font-body), sans-serif;',
      '  color: var(--ink-primary);',
      '}',
      '',
      'p, li, dd, blockquote {',
      '  color: var(--ink-secondary);',
      '}',
      '',
      'code, pre, kbd, samp {',
      '  font-family: var(--font-mono), ui-monospace, monospace;',
      '}',
      '',
      'a {',
      '  color: var(--accent);',
      '}',
      '',
      'hr {',
      '  border-color: var(--border-subtle);',
      '}',
      '',
      'button[type="submit"], button.primary, .btn-primary, [data-antislop-cta="primary"] {',
      '  background-color: var(--accent);',
      '  color: var(--accent-contrast);',
      '  border-color: var(--accent);',
      '}',
      '',
      '::selection {',
      '  background-color: var(--accent);',
      '  color: var(--accent-contrast);',
      '}',
    ].join('\n'),
  );

  return `${sections.join('\n\n')}\n`;
}

function upsertBeforeHeadClose(
  html: string,
  existingPattern: RegExp,
  replacementBlock: string,
): string {
  if (existingPattern.test(html)) {
    return html.replace(existingPattern, () => replacementBlock);
  }
  if (HEAD_CLOSE_REGEX.test(html)) {
    return html.replace(HEAD_CLOSE_REGEX, (match) => `  ${replacementBlock}\n${match}`);
  }
  return `${replacementBlock}\n${html}`;
}

export async function injectInstantLookIntoWorkspace(
  input: InstantLookInput,
): Promise<InstantLookResult> {
  const startedAt = performance.now();
  const modifiedFiles: string[] = [];

  const normalizedUrls = normalizeStylesheetUrls(input.stylesheetUrls);
  const stylesheetCss = buildInstantLookStylesheet(input);
  const injectedCssBytes = Buffer.byteLength(stylesheetCss, 'utf8');

  const indexHtmlPath = path.join(input.workspacePath, 'index.html');
  if (await fileExists(indexHtmlPath)) {
    let html = await readFile(indexHtmlPath, 'utf8');

    const fontsBlock = buildFontLinksBlock(normalizedUrls);
    html = upsertBeforeHeadClose(html, FONTS_BLOCK_REGEX, fontsBlock);

    const safeCss = sanitizeCssForStyleTag(stylesheetCss.trimEnd());
    const styleBlock = `<style id="${STYLE_ELEMENT_ID}">\n${safeCss}\n  </style>`;
    html = upsertBeforeHeadClose(html, STYLE_BLOCK_REGEX, styleBlock);

    await writeFile(indexHtmlPath, html, 'utf8');
    modifiedFiles.push('index.html');
  }

  const srcIndexCssPath = path.join(input.workspacePath, 'src', 'index.css');
  if (await fileExists(srcIndexCssPath)) {
    const tokensCssPath = path.join(input.workspacePath, 'src', 'antislop-tokens.css');
    await writeFile(tokensCssPath, stylesheetCss, 'utf8');
    modifiedFiles.push('src/antislop-tokens.css');
  }

  const latencyMs = Number((performance.now() - startedAt).toFixed(2));

  return {
    modifiedFiles,
    injectedCssBytes,
    fontLinksCount: normalizedUrls.length,
    latencyMs,
  };
}
