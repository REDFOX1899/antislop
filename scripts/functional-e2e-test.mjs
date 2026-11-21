#!/usr/bin/env node
/**
 * AntiSlop Functional End-to-End Test Suite
 *
 * Verifies all critical hackathon user journeys against a live AntiSlop backend
 * (local http://localhost:4000 or Cloud Run https://antislop-engine-a53petnlfa-uc.a.run.app):
 *   1. GET  /api/health (viteReady, dual Gemini Tier-3 keys, 3+ workspaces)
 *   2. GET  /api/workspaces + switch across novaflow-slop, shopcraft-store, portfolio-starter + /preview/ 200
 *   3. POST /api/reference/capture-url (valid JPEG + CSS DNA on example.com AND SSRF 400 block on 127.0.0.1)
 *   4. POST /api/github/connect (REDFOX1899/personal-website) + /styles.css, /app.js, /assets/butterfly.mp4 200 + clean Puppeteer audit
 *   5. GET  /api/files (editable file list, files map, diff summary)
 *   6. GET  /api/github/repos (>= 1 real repository via GITHUB_TOKEN)
 *   7. POST /api/snapshot/reset (clean baseline restore)
 *   8. [--include-ai optional] POST /api/transform?wait=true (live circle_tweak or fast_demo Gemini 4 run)
 *   9. Restore pristine demo state (switch back to novaflow-slop + verify /preview/ 200)
 *
 * Usage:
 *   node scripts/functional-e2e-test.mjs
 *   node scripts/functional-e2e-test.mjs --url=https://antislop-engine-a53petnlfa-uc.a.run.app
 *   node scripts/functional-e2e-test.mjs --url=http://localhost:4000 --include-ai
 *   node scripts/functional-e2e-test.mjs --include-ai --ai-mode=fast_demo
 */

import process from 'node:process';

function parseArgs(argv) {
  let baseUrl = 'http://localhost:4000';
  let includeAi = false;
  let aiMode = 'circle_tweak';
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg.startsWith('--url=')) {
      baseUrl = arg.slice('--url='.length).trim();
    } else if (arg === '--url' && argv[i + 1]) {
      baseUrl = argv[i + 1].trim();
      i += 1;
    } else if (arg === '--include-ai') {
      includeAi = true;
    } else if (arg.startsWith('--ai-mode=')) {
      aiMode = arg.slice('--ai-mode='.length).trim();
    } else if (arg === '--ai-mode' && argv[i + 1]) {
      aiMode = argv[i + 1].trim();
      i += 1;
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    includeAi,
    aiMode: aiMode === 'fast_demo' ? 'fast_demo' : 'circle_tweak',
    help,
  };
}

const config = parseArgs(process.argv.slice(2));

if (config.help) {
  console.log(`AntiSlop Functional E2E Test Suite

Usage:
  node scripts/functional-e2e-test.mjs [options]

Options:
  --url=<baseUrl>            Target AntiSlop backend URL (default: http://localhost:4000)
                             Example: --url=https://antislop-engine-a53petnlfa-uc.a.run.app
  --include-ai               Also execute a live Gemini 4 transform (POST /api/transform?wait=true)
  --ai-mode=<mode>           Transform mode when --include-ai is set: circle_tweak (default) | fast_demo
  -h, --help                 Show this help message
`);
  process.exit(0);
}

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchWithTimeout(pathOrUrl, options = {}, timeoutMs = 45_000) {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${config.baseUrl}${pathOrUrl}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(pathOrUrl, options = {}, timeoutMs = 45_000) {
  const res = await fetchWithTimeout(pathOrUrl, options, timeoutMs);
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { res, raw, json };
}

async function postJson(pathOrUrl, body, timeoutMs = 45_000) {
  return fetchJson(
    pathOrUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    },
    timeoutMs
  );
}

async function runStep(id, name, fn) {
  const t0 = Date.now();
  process.stdout.write(`⏳ [${id}] ${name} ... `);
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ id, name, ok: true, ms, detail });
    console.log(`✅ PASS (${ms}ms)`);
    console.log(`     ↳ ${detail}`);
    return true;
  } catch (err) {
    const ms = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    results.push({ id, name, ok: false, ms, detail: message });
    console.log(`❌ FAIL (${ms}ms)`);
    console.log(`     ↳ ${message}`);
    return false;
  }
}

function isValidJpegBase64(b64) {
  if (typeof b64 !== 'string' || b64.length < 100) return false;
  const cleaned = b64.replace(/^data:[^;]+;base64,/i, '').trim();
  const buf = Buffer.from(cleaned, 'base64');
  // JPEG SOI magic bytes: FF D8 FF
  return buf.length > 1000 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function formatDuration(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function visualLength(str) {
  // Account for double-width status emojis (✅ / ❌) in terminal alignment
  let len = 0;
  for (const ch of String(str)) {
    len += ch === '✅' || ch === '❌' ? 2 : 1;
  }
  return len;
}

function padRight(str, width) {
  const s = String(str);
  const vLen = visualLength(s);
  if (vLen >= width) {
    return s.slice(0, Math.max(0, width - 1)) + '…';
  }
  return s + ' '.repeat(width - vLen);
}

function printSummaryTable(totalMs) {
  const passedCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - passedCount;
  const lineWidth = 118;

  console.log('\n' + '═'.repeat(lineWidth));
  console.log(`  ANTISLOP FUNCTIONAL E2E TEST SUMMARY  ·  Target: ${config.baseUrl}`);
  console.log('═'.repeat(lineWidth));
  console.log(
    `  ${padRight('#', 3)} ${padRight('Status', 9)} ${padRight('Time', 9)} ${padRight('Journey Check', 46)} ${padRight('Result Detail', 45)}`
  );
  console.log('─'.repeat(lineWidth));

  for (const r of results) {
    const status = r.ok ? '✅ PASS' : '❌ FAIL';
    console.log(
      `  ${padRight(r.id, 3)} ${padRight(status, 9)} ${padRight(formatDuration(r.ms), 9)} ${padRight(r.name, 46)} ${padRight(r.detail, 45)}`
    );
  }

  console.log('─'.repeat(lineWidth));
  console.log(
    `  TOTAL: ${passedCount}/${results.length} PASSED · ${failedCount} FAILED · Total wall time: ${formatDuration(totalMs)}`
  );
  console.log('═'.repeat(lineWidth) + '\n');
}

async function main() {
  const suiteStart = Date.now();
  console.log('\n🧪 AntiSlop Functional E2E Test Suite');
  console.log(`   Target Backend : ${config.baseUrl}`);
  console.log(`   Include Live AI: ${config.includeAi ? `YES (${config.aiMode})` : 'NO (deterministic fast suite)'}`);
  console.log('─'.repeat(72) + '\n');

  try {
    // 1. GET /api/health
    await runStep('1', 'GET /api/health (Vite, Dual Keys, Workspaces)', async () => {
      const { res, json } = await fetchJson('/api/health', {}, 20_000);
      assert(res.status === 200, `Expected HTTP 200, got ${res.status}`);
      assert(json && json.status === 'ok', `Expected status="ok", got ${JSON.stringify(json?.status)}`);
      assert(json.viteReady === true, `Expected viteReady=true, got ${json.viteReady}`);

      const pool = json.pool || json.geminiPool;
      assert(pool && pool.primaryConfigured === true, 'Primary Gemini API key not configured');
      assert(pool && pool.secondaryConfigured === true, 'Secondary Gemini API key not configured');
      assert(
        typeof json.availableWorkspaces === 'number' && json.availableWorkspaces >= 3,
        `Expected >= 3 availableWorkspaces, got ${json.availableWorkspaces}`
      );
      assert(json.models && json.models.director && json.models.decisions, 'Missing models registry in /api/health');

      return `viteReady=true, dualKeys=2/2, workspaces=${json.availableWorkspaces}, github=${Boolean(json.githubConfigured)}, models=${json.models.director}/${json.models.decisions}`;
    });

    // 2. GET /api/workspaces + switch cleanly across all 3 built-in workspaces & verify /preview/ 200
    await runStep('2', 'Switch 3 Built-In Workspaces + /preview/ 200', async () => {
      const { res, json } = await fetchJson('/api/workspaces', {}, 20_000);
      assert(res.status === 200, `GET /api/workspaces returned HTTP ${res.status}`);
      assert(Array.isArray(json?.workspaces), 'workspaces array missing');

      const requiredIds = ['novaflow-slop', 'shopcraft-store', 'portfolio-starter'];
      const availableIds = new Set(json.workspaces.map((w) => w.id));
      for (const id of requiredIds) {
        assert(availableIds.has(id), `Required built-in workspace missing: ${id}`);
      }

      const verified = [];
      for (const workspaceId of requiredIds) {
        const sw = await postJson('/api/workspaces/switch', { workspaceId }, 45_000);
        assert(sw.res.status === 200, `Switch to ${workspaceId} failed with HTTP ${sw.res.status}: ${sw.raw}`);
        assert(sw.json?.workspace?.id === workspaceId, `Active workspace mismatch after switch: ${sw.json?.workspace?.id}`);
        assert(
          Array.isArray(sw.json?.editableFiles) && sw.json.editableFiles.length > 0,
          `No editableFiles returned for ${workspaceId}`
        );

        const prevRes = await fetchWithTimeout('/preview/', {}, 20_000);
        assert(prevRes.status === 200, `/preview/ on ${workspaceId} returned HTTP ${prevRes.status}`);
        const html = await prevRes.text();
        assert(html.length > 100 && /<html|<!doctype/i.test(html), `/preview/ HTML on ${workspaceId} looks empty/invalid`);
        verified.push(`${workspaceId}(200,${sw.json.editableFiles.length}f)`);
      }

      return verified.join(' · ');
    });

    // 3. POST /api/reference/capture-url (valid public URL + SSRF guard)
    await runStep('3', 'Reference URL Capture (example.com + SSRF 400)', async () => {
      // 3a. Valid external URL
      const valid = await postJson('/api/reference/capture-url', { url: 'https://example.com' }, 60_000);
      assert(valid.res.status === 200, `capture-url(example.com) returned HTTP ${valid.res.status}: ${valid.raw}`);
      assert(valid.json?.asset?.mimeType === 'image/jpeg', `Expected mimeType image/jpeg, got ${valid.json?.asset?.mimeType}`);
      assert(isValidJpegBase64(valid.json?.asset?.dataBase64), 'Returned screenshot base64 is not a valid JPEG (FF D8 FF)');
      assert(
        typeof valid.json?.extractedCssSummary === 'string' && valid.json.extractedCssSummary.trim().length > 10,
        'extractedCssSummary missing or empty'
      );

      const jpegKb = Math.round((Buffer.from(valid.json.asset.dataBase64, 'base64').length / 1024) * 10) / 10;

      // Verify screenshotUrl itself is reachable
      if (valid.json.screenshotUrl) {
        const imgRes = await fetchWithTimeout(valid.json.screenshotUrl, {}, 15_000);
        assert(imgRes.status === 200, `screenshotUrl ${valid.json.screenshotUrl} returned HTTP ${imgRes.status}`);
      }

      // 3b. SSRF guard on loopback address MUST return 400
      const ssrf = await postJson('/api/reference/capture-url', { url: 'http://127.0.0.1:4000' }, 15_000);
      assert(
        ssrf.res.status === 400,
        `SSRF guard FAILED: expected HTTP 400 for http://127.0.0.1:4000, got HTTP ${ssrf.res.status}`
      );
      assert(
        typeof ssrf.json?.error === 'string' && ssrf.json.error.length > 0,
        'SSRF 400 response missing error description'
      );

      return `example.com JPEG=${jpegKb}KB + CSS DNA ok | SSRF(127.0.0.1) blocked HTTP 400`;
    });

    // 4. POST /api/github/connect (REDFOX1899/personal-website) + static assets + clean Puppeteer capture
    await runStep('4', 'GitHub Connect + Static Assets + Clean Audit', async () => {
      const repoUrl = 'https://github.com/REDFOX1899/personal-website';
      const conn = await postJson('/api/github/connect', { repoUrl }, 90_000);
      assert(conn.res.status === 200, `github/connect failed HTTP ${conn.res.status}: ${conn.raw}`);
      assert(conn.json?.workspace?.source === 'github', `Expected github workspace, got ${conn.json?.workspace?.source}`);

      // Verify preview root + root-relative static assets (/styles.css, /app.js, /assets/butterfly.mp4)
      const prevRes = await fetchWithTimeout('/preview/', {}, 20_000);
      assert(prevRes.status === 200, `/preview/ on personal-website returned HTTP ${prevRes.status}`);

      const cssRes = await fetchWithTimeout('/styles.css', {}, 15_000);
      assert(cssRes.status === 200, `GET /styles.css returned HTTP ${cssRes.status}`);
      const cssText = await cssRes.text();
      assert(cssText.length > 50, '/styles.css body unexpectedly empty');

      const jsRes = await fetchWithTimeout('/app.js', {}, 15_000);
      assert(jsRes.status === 200, `GET /app.js returned HTTP ${jsRes.status}`);
      const jsText = await jsRes.text();
      assert(jsText.length > 50, '/app.js body unexpectedly empty');

      const mp4Res = await fetchWithTimeout('/assets/butterfly.mp4', {}, 25_000);
      assert(mp4Res.status === 200, `GET /assets/butterfly.mp4 returned HTTP ${mp4Res.status}`);
      const mp4Buf = await mp4Res.arrayBuffer();
      assert(mp4Buf.byteLength > 10_000, `/assets/butterfly.mp4 too small (${mp4Buf.byteLength} bytes)`);

      // Puppeteer snapshot & DOM audit
      const snap = await postJson('/api/snapshot/capture', { prefix: 'e2e-personal-site' }, 60_000);
      assert(snap.res.status === 200, `snapshot/capture returned HTTP ${snap.res.status}: ${snap.raw}`);
      assert(snap.json?.isBlankPage === false, 'Puppeteer reported blank page on REDFOX1899/personal-website');
      const dom = snap.json?.domAudit;
      assert(dom && typeof dom === 'object', 'Missing domAudit in snapshot/capture');
      assert(
        dom.consoleErrorCount === 0,
        `Expected consoleErrorCount===0, got ${dom.consoleErrorCount} (${JSON.stringify(snap.json?.consoleErrors)})`
      );
      assert(
        dom.brokenImageCount === 0,
        `Expected brokenImageCount===0, got ${dom.brokenImageCount}`
      );

      const mp4Kb = Math.round(mp4Buf.byteLength / 1024);
      return `ws=${conn.json.workspace.id} · /styles.css+/app.js+/assets/butterfly.mp4(${mp4Kb}KB)=200 · consoleErr=0 · brokenImg=0`;
    });

    // 5. GET /api/files (editableFiles / fileList, files map, diff string/summary)
    await runStep('5', 'GET /api/files (editableFiles, files, diff)', async () => {
      const { res, json } = await fetchJson('/api/files', {}, 20_000);
      assert(res.status === 200, `GET /api/files returned HTTP ${res.status}`);

      const editableList = Array.isArray(json?.editableFiles)
        ? json.editableFiles
        : Array.isArray(json?.fileList)
          ? json.fileList
          : null;
      assert(editableList && editableList.length > 0, 'Missing non-empty editableFiles/fileList array');
      assert(json?.files && typeof json.files === 'object', 'Missing files content map');

      const fileKeys = Object.keys(json.files);
      assert(fileKeys.length >= editableList.length, `files map has ${fileKeys.length} keys vs ${editableList.length} listed`);
      for (const key of editableList) {
        assert(typeof json.files[key] === 'string', `Expected string content for file ${key}`);
      }

      const diffText =
        typeof json?.diff === 'string'
          ? json.diff
          : typeof json?.diff?.summary === 'string'
            ? json.diff.summary
            : null;
      assert(typeof diffText === 'string', `Expected diff string or diff.summary string, got ${typeof json?.diff}`);

      return `workspace=${json.workspaceId}, ${editableList.length} files (${editableList.join(', ')}), diff="${diffText.slice(0, 48)}"`;
    });

    // 6. GET /api/github/repos (>= 1 real GitHub repo via GITHUB_TOKEN)
    await runStep('6', 'GET /api/github/repos (>= 1 live repo)', async () => {
      const { res, json } = await fetchJson('/api/github/repos', {}, 25_000);
      assert(res.status === 200, `GET /api/github/repos returned HTTP ${res.status}: ${json?.error || ''}`);
      assert(Array.isArray(json?.repos) && json.repos.length >= 1, `Expected >= 1 repo, got ${json?.repos?.length}`);
      const first = json.repos[0];
      assert(first && typeof first.fullName === 'string' && typeof first.htmlUrl === 'string', 'Invalid repo item shape');

      return `${json.repos.length} repos fetched (top: ${first.fullName})`;
    });

    // 7. POST /api/snapshot/reset (cleanly restores baseline files)
    await runStep('7', 'POST /api/snapshot/reset (baseline restore)', async () => {
      const { res, json, raw } = await postJson('/api/snapshot/reset', {}, 30_000);
      assert(res.status === 200, `snapshot/reset returned HTTP ${res.status}: ${raw}`);
      assert(json?.reset === true, `Expected reset===true, got ${JSON.stringify(json?.reset)}`);
      assert(Array.isArray(json?.restoredFiles), 'Expected restoredFiles array');
      assert(Array.isArray(json?.removedFiles), 'Expected removedFiles array');

      return `workspace=${json.workspaceId}, restored=${json.restoredFiles.length} files, removed=${json.removedFiles.length}`;
    });

    // 8. Optional live Gemini 4 transform (--include-ai)
    if (config.includeAi) {
      await runStep('8', `Live AI Transform (--include-ai: ${config.aiMode})`, async () => {
        // Ensure we run on clean novaflow-slop baseline
        const sw = await postJson('/api/workspaces/switch', { workspaceId: 'novaflow-slop' }, 45_000);
        assert(sw.res.status === 200, `Failed to switch to novaflow-slop before AI test: HTTP ${sw.res.status}`);
        await postJson('/api/snapshot/reset', {}, 30_000);

        const payload =
          config.aiMode === 'fast_demo'
            ? {
                mode: 'antislop',
                speedMode: 'fast_demo',
                assets: [],
                maxIterations: 1,
                parallelCandidates: 1,
                generateBespokeAssets: false,
                textPrompt:
                  'Restyle this SaaS page in crisp Swiss Editorial Print: warm archival cream paper #FAF7F2, charcoal ink #141413, vermilion accent #D9381E, zero purple gradients or dark neon cards.',
              }
            : {
                mode: 'circle_tweak',
                speedMode: 'fast_demo',
                assets: [],
                maxIterations: 1,
                generateBespokeAssets: false,
                textPrompt:
                  'Transform the circled hero section to warm archival cream paper #FAF7F2 with crisp charcoal editorial ink #141413 and a single vermilion accent #D9381E, removing purple AI gradients.',
                drawnCircles: [
                  {
                    id: 'e2e-circle-1',
                    x: 0.08,
                    y: 0.08,
                    width: 0.84,
                    height: 0.36,
                    note: 'Remove purple slop gradient; apply warm archival cream #FAF7F2 + charcoal #141413 editorial typography',
                  },
                ],
              };

        const run = await postJson('/api/transform?wait=true', payload, 180_000);
        assert(run.res.status === 200, `POST /api/transform?wait=true returned HTTP ${run.res.status}: ${run.raw.slice(0, 240)}`);
        assert(run.json?.runId, 'Missing runId in transform response');
        assert(run.json?.status !== 'failed', `Transform run failed: ${JSON.stringify(run.json?.status)}`);
        assert(Array.isArray(run.json?.iterations) && run.json.iterations.length >= 1, 'Expected >= 1 critic iteration');

        const lastIter = run.json.iterations[run.json.iterations.length - 1];
        const sc = lastIter?.scorecard;
        assert(sc && typeof sc.overallTasteScore === 'number', 'Missing DecisionsScorecard in final iteration');
        assert(sc.domAudit?.consoleErrorCount === 0, `AI transform introduced console errors: ${sc.domAudit?.consoleErrorCount}`);

        return `runId=${run.json.runId.slice(0, 8)} status=${run.json.status} taste=${sc.overallTasteScore.toFixed(1)} slop=${sc.metrics?.slopPenalty?.value?.toFixed(2)} models=${(run.json.modelsInvoked || []).join(',')} (${formatDuration(run.json.totalLatencyMs || 0)})`;
      });
    }
  } finally {
    // Final Step: Always switch back cleanly to novaflow-slop and reset baseline so server stays demo-ready!
    const cleanupId = config.includeAi ? '9' : '8';
    await runStep(cleanupId, 'Restore Pristine Demo State (novaflow-slop)', async () => {
      const sw = await postJson('/api/workspaces/switch', { workspaceId: 'novaflow-slop' }, 45_000);
      assert(sw.res.status === 200, `Switch back to novaflow-slop returned HTTP ${sw.res.status}: ${sw.raw}`);
      assert(sw.json?.workspace?.id === 'novaflow-slop', `Active workspace is ${sw.json?.workspace?.id}, expected novaflow-slop`);

      const rst = await postJson('/api/snapshot/reset', {}, 30_000);
      assert(rst.res.status === 200 && rst.json?.reset === true, `Baseline reset on novaflow-slop failed: ${rst.raw}`);

      const prevRes = await fetchWithTimeout('/preview/', {}, 20_000);
      assert(prevRes.status === 200, `/preview/ after novaflow-slop restore returned HTTP ${prevRes.status}`);

      const health = await fetchJson('/api/health', {}, 15_000);
      assert(
        health.json?.activeWorkspace?.id === 'novaflow-slop' && health.json?.viteReady === true,
        `Health check post-restore unexpected: ws=${health.json?.activeWorkspace?.id}, viteReady=${health.json?.viteReady}`
      );

      return `activeWorkspace=novaflow-slop, baseline reset ok, /preview/ HTTP 200`;
    });
  }

  const totalMs = Date.now() - suiteStart;
  printSummaryTable(totalMs);

  const anyFailed = results.some((r) => !r.ok);
  if (anyFailed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\n❌ Unhandled E2E runner error:', err);
  process.exitCode = 1;
});
