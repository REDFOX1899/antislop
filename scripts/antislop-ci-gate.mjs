#!/usr/bin/env node
/**
 * AntiSlop v3 — CI/CD Visual Design Gate CLI (Node 22+ ESM, zero dependencies)
 *
 * Audits a live preview URL (or active AntiSlop Engine workspace) against:
 *   1. POST /api/audit/geometry             — Deterministic APCA contrast, typography, rhythm & A11y gate
 *   2. POST /api/decisions/conversion-audit — 10-probe calibrated Conversion Readiness & Brand Drift audit
 *
 * Usage:
 *   node scripts/antislop-ci-gate.mjs [options]
 *
 * Options:
 *   --url <previewUrl>          Target preview URL (or env ANTISLOP_PREVIEW_URL)
 *   --engine <engineUrl>        AntiSlop Engine base URL
 *                               (default: https://antislop-engine-a53petnlfa-uc.a.run.app)
 *   --min-geometry <score>      Minimum geometry score 0-100 (default: 70)
 *   --min-conversion <score>    Minimum conversion readiness score 0-100 (default: 60)
 *   --out [filePath]            Write GFM report to file (default: antislop-gate-report.md if flag has no value)
 *   --timeout <ms>              Per-request timeout in ms (default: 45000)
 *   --soft                      Advisory mode: always exit 0 even when gates fail
 *   -h, --help                  Show this help message
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const DEFAULT_ENGINE_URL = 'https://antislop-engine-a53petnlfa-uc.a.run.app';
const DEFAULT_MIN_GEOMETRY = 70;
const DEFAULT_MIN_CONVERSION = 60;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_OUT_FILE = 'antislop-gate-report.md';

/**
 * @typedef {Object} CliConfig
 * @property {string} previewUrl
 * @property {string} engineUrl
 * @property {number} minGeometry
 * @property {number} minConversion
 * @property {string | null} outPath
 * @property {boolean} soft
 * @property {number} timeoutMs
 * @property {boolean} help
 */

function printUsage() {
  const usage = [
    'AntiSlop v3 — CI/CD Visual Design Gate',
    '',
    'Usage:',
    '  node scripts/antislop-ci-gate.mjs [options]',
    '',
    'Options:',
    '  --url <previewUrl>          Preview URL to audit (or ANTISLOP_PREVIEW_URL)',
    `  --engine <engineUrl>        AntiSlop Engine URL (default: ${DEFAULT_ENGINE_URL})`,
    `  --min-geometry <0-100>      Minimum Geometry & APCA score (default: ${DEFAULT_MIN_GEOMETRY})`,
    `  --min-conversion <0-100>    Minimum Conversion Readiness score (default: ${DEFAULT_MIN_CONVERSION})`,
    `  --out [path]                Write Markdown report to file (default: ${DEFAULT_OUT_FILE})`,
    `  --timeout <ms>              HTTP timeout per request in ms (default: ${DEFAULT_TIMEOUT_MS})`,
    '  --soft                      Advisory mode: exit 0 even on gate failure',
    '  -h, --help                  Display help',
  ].join('\n');
  process.stdout.write(`${usage}\n`);
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @param {string} flagName
 * @returns {number}
 */
function parseThreshold(raw, fallback, flagName) {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Invalid value for ${flagName}: "${raw}" (expected a number between 0 and 100)`);
  }
  return parsed;
}

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveInt(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid timeout value: "${raw}" (expected positive integer ms)`);
  }
  return parsed;
}

/**
 * @param {string[]} argv
 * @returns {CliConfig}
 */
function parseArgs(argv) {
  let previewUrl = (process.env.ANTISLOP_PREVIEW_URL ?? '').trim();
  let engineUrl = (process.env.ANTISLOP_ENGINE_URL ?? DEFAULT_ENGINE_URL).trim();
  let minGeometry = parseThreshold(
    process.env.ANTISLOP_MIN_GEOMETRY,
    DEFAULT_MIN_GEOMETRY,
    'ANTISLOP_MIN_GEOMETRY'
  );
  let minConversion = parseThreshold(
    process.env.ANTISLOP_MIN_CONVERSION,
    DEFAULT_MIN_CONVERSION,
    'ANTISLOP_MIN_CONVERSION'
  );
  /** @type {string | null} */
  let outPath = null;
  let soft = false;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (arg === '--soft') {
      soft = true;
      continue;
    }

    const eqIndex = arg.indexOf('=');
    const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
    const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : undefined;

    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
      }
      i += 1;
      return next;
    };

    switch (flag) {
      case '--url':
        previewUrl = readValue().trim();
        break;
      case '--engine':
        engineUrl = readValue().trim();
        break;
      case '--min-geometry':
        minGeometry = parseThreshold(readValue(), DEFAULT_MIN_GEOMETRY, '--min-geometry');
        break;
      case '--min-conversion':
        minConversion = parseThreshold(readValue(), DEFAULT_MIN_CONVERSION, '--min-conversion');
        break;
      case '--timeout':
        timeoutMs = parsePositiveInt(readValue(), DEFAULT_TIMEOUT_MS);
        break;
      case '--out': {
        if (inlineValue !== undefined) {
          outPath = inlineValue.trim() || DEFAULT_OUT_FILE;
        } else {
          const next = argv[i + 1];
          if (next !== undefined && !next.startsWith('-')) {
            outPath = next.trim();
            i += 1;
          } else {
            outPath = DEFAULT_OUT_FILE;
          }
        }
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  engineUrl = engineUrl.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(engineUrl)) {
    throw new Error(`Invalid --engine URL: "${engineUrl}" (must start with http:// or https://)`);
  }

  return {
    previewUrl,
    engineUrl,
    minGeometry,
    minConversion,
    outPath,
    soft,
    timeoutMs,
    help,
  };
}

/**
 * @param {string} url
 * @param {Record<string, unknown>} payload
 * @param {number} timeoutMs
 * @returns {Promise<Record<string, unknown>>}
 */
async function postJson(url, payload, timeoutMs) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'AntiSlop-CI-Gate/3.0',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  /** @type {Record<string, unknown>} */
  let data = {};
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        data = parsed;
      }
    } catch {
      // Non-JSON response handled below
    }
  }

  if (!response.ok) {
    const errMsg =
      typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : text.slice(0, 240).trim() || response.statusText;
    throw new Error(`HTTP ${response.status} from ${url}: ${errMsg}`);
  }

  return data;
}

/**
 * Escapes text for safe inclusion inside GitHub-Flavored Markdown table cells.
 * @param {unknown} value
 * @param {number} [maxLen]
 * @returns {string}
 */
function mdCell(value, maxLen = 120) {
  const str = String(value ?? '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
  if (str.length <= maxLen) return str;
  return `${str.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * @param {string} quadrant
 * @returns {string}
 */
function formatQuadrant(quadrant) {
  switch (quadrant) {
    case 'high_yield_craft':
      return 'High-Yield Craft';
    case 'pretty_slop':
      return 'Pretty Slop (Low Conversion)';
    case 'functional_draft':
      return 'Functional Draft (Brand Drift)';
    case 'needs_overhaul':
      return 'Needs Overhaul';
    default:
      return quadrant || 'Unknown';
  }
}

/**
 * @param {string} category
 * @returns {string}
 */
function formatCategory(category) {
  switch (category) {
    case 'apca_contrast':
      return 'APCA Contrast';
    case 'typography_measure':
      return 'Typography';
    case 'layout_rhythm':
      return 'Layout Rhythm';
    case 'semantic_a11y':
      return 'Semantic A11y';
    default:
      return category || 'General';
  }
}

/**
 * @param {string} severity
 * @returns {string}
 */
function formatSeverity(severity) {
  if (severity === 'critical') return 'CRITICAL';
  if (severity === 'warning') return 'WARNING';
  return 'INFO';
}

/**
 * @param {number | null} value
 * @param {string} [suffix]
 * @returns {string}
 */
function formatScore(value, suffix = '/100') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rounded}${suffix}`;
}

/**
 * @param {Object} params
 * @param {CliConfig} params.config
 * @param {Record<string, unknown> | null} params.geometry
 * @param {string | null} params.geometryError
 * @param {Record<string, unknown> | null} params.conversion
 * @param {string | null} params.conversionError
 * @param {boolean} params.geometryPassed
 * @param {boolean} params.conversionPassed
 * @param {boolean} params.overallPassed
 * @param {string} params.timestampIso
 * @returns {string}
 */
function renderMarkdownReport({
  config,
  geometry,
  geometryError,
  conversion,
  conversionError,
  geometryPassed,
  conversionPassed,
  overallPassed,
  timestampIso,
}) {
  const verdictLabel = overallPassed
    ? 'PASS'
    : config.soft
      ? 'FAIL (Advisory / Soft Mode)'
      : 'FAIL (Blocking)';
  const verdictIcon = overallPassed ? '✅' : config.soft ? '⚠️' : '❌';

  const geometryScore =
    geometry && typeof geometry.overallScore === 'number' ? geometry.overallScore : null;
  const conversionScore =
    conversion && typeof conversion.conversionReadinessScore === 'number'
      ? conversion.conversionReadinessScore
      : null;
  const brandDriftNorm =
    conversion && typeof conversion.brandDriftNorm === 'number'
      ? conversion.brandDriftNorm
      : null;
  const quadrant =
    conversion && typeof conversion.quadrant === 'string' ? conversion.quadrant : '';

  const geometryLatency =
    geometry && typeof geometry.latencyMs === 'number' ? `${geometry.latencyMs} ms` : '—';
  const conversionLatency =
    conversion && typeof conversion.latencyMs === 'number' ? `${conversion.latencyMs} ms` : '—';

  const lines = [
    `## ${verdictIcon} AntiSlop v3 Visual Design Gate — ${verdictLabel}`,
    '',
    `- **Target Preview**: ${config.previewUrl ? `\`${config.previewUrl}\`` : '_Active Engine Workspace_'}`,
    `- **AntiSlop Engine**: \`${config.engineUrl}\``,
    `- **Mode**: ${config.soft ? 'Soft / Advisory (`--soft`)' : 'Strict PR Blocking'}`,
    `- **Audited At**: \`${timestampIso}\``,
    '',
    '### Gate Scorecard',
    '',
    '| Gate | Score | Threshold | Status | Latency |',
    '| :--- | :---: | :---: | :---: | :---: |',
    `| Deterministic Geometry & APCA | **${formatScore(geometryScore)}** | >= ${config.minGeometry} | ${geometryError ? '❌ ERROR' : geometryPassed ? '✅ PASS' : '❌ FAIL'} | ${geometryLatency} |`,
    `| Conversion Readiness (Decisions API) | **${formatScore(conversionScore)}** | >= ${config.minConversion} | ${conversionError ? '❌ ERROR' : conversionPassed ? '✅ PASS' : '❌ FAIL'} | ${conversionLatency} |`,
  ];

  if (brandDriftNorm !== null || quadrant) {
    const driftStr = brandDriftNorm !== null ? brandDriftNorm.toFixed(3) : 'N/A';
    lines.push(
      `| Brand Drift L2 Norm / Quadrant | \`${driftStr}\` (${mdCell(formatQuadrant(quadrant), 40)}) | <= 0.300 | ${brandDriftNorm !== null && brandDriftNorm <= 0.3 ? '✅ ALIGNED' : 'ℹ️ MONITOR'} | 0 out tokens |`
    );
  }

  if (geometryError || conversionError) {
    lines.push('', '### Audit Endpoint Errors', '');
    if (geometryError) {
      lines.push(`- **Geometry Audit (\`/api/audit/geometry\`)**: ${mdCell(geometryError, 240)}`);
    }
    if (conversionError) {
      lines.push(
        `- **Conversion Audit (\`/api/decisions/conversion-audit\`)**: ${mdCell(conversionError, 240)}`
      );
    }
  }

  // Geometry sub-scores
  const categoryScores =
    geometry && geometry.categoryScores && typeof geometry.categoryScores === 'object'
      ? /** @type {Record<string, unknown>} */ (geometry.categoryScores)
      : null;

  if (categoryScores) {
    const scanned =
      typeof geometry?.totalElementsScanned === 'number' ? geometry.totalElementsScanned : null;
    const textNodes =
      typeof geometry?.textNodesAudited === 'number' ? geometry.textNodesAudited : null;

    lines.push(
      '',
      '### Geometry Sub-Scores',
      '',
      '| APCA Contrast | Typography Measure | Layout Rhythm | Semantic A11y | DOM Scanned |',
      '| :---: | :---: | :---: | :---: | :---: |',
      `| ${formatScore(/** @type {number | null} */ (categoryScores.apcaContrast ?? null))} | ${formatScore(/** @type {number | null} */ (categoryScores.typographyMeasure ?? null))} | ${formatScore(/** @type {number | null} */ (categoryScores.layoutRhythm ?? null))} | ${formatScore(/** @type {number | null} */ (categoryScores.semanticA11y ?? null))} | ${scanned !== null ? `${scanned} els / ${textNodes ?? 0} text` : '—'} |`
    );
  }

  // Top Geometry Violations
  const violations = Array.isArray(geometry?.violations) ? geometry.violations : [];
  if (violations.length > 0) {
    const topViolations = violations.slice(0, 8);
    lines.push(
      '',
      `### Top Geometry Violations (${topViolations.length} of ${violations.length})`,
      '',
      '| Severity | Category | Selector | Measured vs Threshold | Issue |',
      '| :---: | :--- | :--- | :--- | :--- |'
    );
    for (const v of topViolations) {
      if (!v || typeof v !== 'object') continue;
      const item = /** @type {Record<string, unknown>} */ (v);
      lines.push(
        `| \`${formatSeverity(String(item.severity ?? 'info'))}\` | ${formatCategory(String(item.category ?? ''))} | \`${mdCell(item.selector, 42)}\` | ${mdCell(item.measured, 32)} (req: ${mdCell(item.threshold, 32)}) | ${mdCell(item.message, 110)} |`
      );
    }
  } else if (geometry && !geometryError) {
    lines.push('', '### Top Geometry Violations', '', '_No deterministic geometry or APCA contrast violations detected._');
  }

  // Failing Conversion / Brand Probes
  const probes = Array.isArray(conversion?.probes) ? conversion.probes : [];
  const failingProbes = probes
    .filter((p) => p && typeof p === 'object' && /** @type {Record<string, unknown>} */ (p).passed === false)
    .sort((a, b) => Number(a.passProb ?? 0) - Number(b.passProb ?? 0));

  if (failingProbes.length > 0) {
    lines.push(
      '',
      `### Failing Conversion & Brand Probes (${failingProbes.length} of ${probes.length})`,
      '',
      '| Probe | Pass Probability | Status |',
      '| :--- | :---: | :---: |'
    );
    for (const p of failingProbes.slice(0, 6)) {
      const prob = typeof p.passProb === 'number' ? `${(p.passProb * 100).toFixed(1)}%` : 'N/A';
      lines.push(`| ${mdCell(p.label ?? p.key, 72)} | \`${prob}\` | ❌ Below 55% |`);
    }
  } else if (conversion && !conversionError && probes.length > 0) {
    lines.push(
      '',
      '### Conversion & Brand Probes',
      '',
      `_All ${probes.length} calibrated conversion and brand-fidelity probes passed._`
    );
  }

  // Engineering Fix Directives
  const directives = Array.isArray(geometry?.engineeringFixDirectives)
    ? geometry.engineeringFixDirectives.filter((d) => typeof d === 'string' && d.trim().length > 0)
    : [];
  if (directives.length > 0) {
    lines.push('', '### Engineering Fix Directives', '');
    for (const directive of directives.slice(0, 5)) {
      lines.push(`- ${directive.trim()}`);
    }
  }

  lines.push(
    '',
    '---',
    overallPassed
      ? '**Verdict**: All AntiSlop visual craft and conversion gates cleared.'
      : config.soft
        ? '**Verdict**: Gate threshold not met — running in `--soft` advisory mode (exit 0). Remove `--soft` in `.github/workflows/antislop-design-gate.yml` to enforce strict PR blocking.'
        : '**Verdict**: Gate threshold not met — failing CI check (exit 1). Fix the violations above or run AntiSlop Studio to auto-remediate.',
    ''
  );

  return lines.join('\n');
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    printUsage();
    process.exit(0);
  }

  const timestampIso = new Date().toISOString();

  // Best-effort live screenshot capture when an explicit preview URL is provided,
  // so /api/decisions/conversion-audit evaluates that exact preview surface.
  /** @type {string | undefined} */
  let capturedScreenshotBase64;
  /** @type {string | undefined} */
  let capturedTitle;

  if (config.previewUrl) {
    try {
      const captureRes = await postJson(
        `${config.engineUrl}/api/reference/capture-url`,
        { url: config.previewUrl },
        config.timeoutMs
      );
      const asset =
        captureRes.asset && typeof captureRes.asset === 'object'
          ? /** @type {Record<string, unknown>} */ (captureRes.asset)
          : null;
      if (asset && typeof asset.dataBase64 === 'string' && asset.dataBase64.length >= 64) {
        capturedScreenshotBase64 = asset.dataBase64;
      }
      if (typeof captureRes.title === 'string' && captureRes.title.trim()) {
        capturedTitle = captureRes.title.trim();
      }
    } catch {
      // Non-fatal: engine will fall back to auditing its active preview workspace
    }
  }

  const geometryPayload = config.previewUrl ? { url: config.previewUrl } : {};
  const conversionPayload = {
    ...(config.previewUrl ? { url: config.previewUrl } : {}),
    ...(capturedScreenshotBase64 ? { screenshotBase64: capturedScreenshotBase64 } : {}),
    ...(capturedTitle ? { brandSummary: capturedTitle } : {}),
  };

  const [geometrySettled, conversionSettled] = await Promise.allSettled([
    postJson(`${config.engineUrl}/api/audit/geometry`, geometryPayload, config.timeoutMs),
    postJson(
      `${config.engineUrl}/api/decisions/conversion-audit`,
      conversionPayload,
      config.timeoutMs
    ),
  ]);

  const geometry = geometrySettled.status === 'fulfilled' ? geometrySettled.value : null;
  const geometryError =
    geometrySettled.status === 'rejected'
      ? geometrySettled.reason instanceof Error
        ? geometrySettled.reason.message
        : String(geometrySettled.reason)
      : null;

  const conversion = conversionSettled.status === 'fulfilled' ? conversionSettled.value : null;
  const conversionError =
    conversionSettled.status === 'rejected'
      ? conversionSettled.reason instanceof Error
        ? conversionSettled.reason.message
        : String(conversionSettled.reason)
      : null;

  const geometryScore =
    geometry && typeof geometry.overallScore === 'number' ? geometry.overallScore : null;
  const conversionScore =
    conversion && typeof conversion.conversionReadinessScore === 'number'
      ? conversion.conversionReadinessScore
      : null;

  const geometryPassed =
    geometryError === null && geometryScore !== null && geometryScore >= config.minGeometry;
  const conversionPassed =
    conversionError === null &&
    conversionScore !== null &&
    conversionScore >= config.minConversion;
  const overallPassed = geometryPassed && conversionPassed;

  const report = renderMarkdownReport({
    config,
    geometry,
    geometryError,
    conversion,
    conversionError,
    geometryPassed,
    conversionPassed,
    overallPassed,
    timestampIso,
  });

  process.stdout.write(report);

  if (config.outPath) {
    const absOut = resolve(process.cwd(), config.outPath);
    await mkdir(dirname(absOut), { recursive: true });
    await writeFile(absOut, report, 'utf8');
  }

  if (overallPassed || config.soft) {
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[antislop-ci-gate] Error: ${msg}\n`);
  process.exit(1);
});
