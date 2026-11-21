import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('../backend/node_modules/puppeteer');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  @page { size: letter; margin: 0.3in 0.36in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Segoe UI", sans-serif;
    color: #0F172A;
    background: #FFFFFF;
    font-size: 9.2px;
    line-height: 1.38;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #0B57D0;
    padding-bottom: 8px;
    margin-bottom: 9px;
  }
  .brand-row { display: flex; align-items: center; gap: 8px; }
  .badge {
    display: inline-block;
    background: #EFF6FF;
    color: #0B57D0;
    border: 1px solid #BFDBFE;
    border-radius: 999px;
    padding: 2px 8px;
    font-family: ui-monospace, monospace;
    font-size: 7.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.025em; color: #0B1220; }
  .sub { font-size: 9.5px; color: #475569; margin-top: 2px; }
  .links { text-align: right; font-family: ui-monospace, monospace; font-size: 8px; color: #1A73E8; line-height: 1.45; }
  .pipeline {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
    margin-bottom: 9px;
  }
  .stage {
    border: 1px solid #E2E8F0;
    border-top: 2.5px solid #1A73E8;
    border-radius: 6px;
    padding: 6px 7px;
    background: #F8FAFC;
  }
  .stage-num { font-family: ui-monospace, monospace; font-size: 7px; color: #0B57D0; font-weight: 700; text-transform: uppercase; }
  .stage-title { font-weight: 700; font-size: 8.6px; color: #0F172A; margin: 1px 0 2px; }
  .stage-desc { font-size: 7.8px; color: #475569; }
  h2 {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #0B57D0;
    font-family: ui-monospace, monospace;
    margin-bottom: 5px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 9px;
    font-size: 8.3px;
  }
  th {
    background: #0B57D0;
    color: #FFFFFF;
    text-align: left;
    padding: 4px 6px;
    font-weight: 600;
    font-size: 7.8px;
  }
  td {
    padding: 3.5px 6px;
    border-bottom: 1px solid #E2E8F0;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #F8FAFC; }
  code {
    font-family: ui-monospace, monospace;
    font-size: 7.8px;
    background: #EFF6FF;
    color: #0B57D0;
    padding: 0.5px 3px;
    border-radius: 3px;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1.08fr 0.92fr;
    gap: 10px;
  }
  .box {
    border: 1px solid #E2E8F0;
    border-radius: 7px;
    padding: 7px 9px;
    background: #FFFFFF;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;
    margin-top: 4px;
  }
  .metric {
    border: 1px solid #E2E8F0;
    border-radius: 5px;
    padding: 4px 6px;
    background: #F8FAFC;
  }
  .metric strong { display: block; font-size: 11px; color: #0B57D0; font-family: ui-monospace, monospace; }
  .metric span { font-size: 7.5px; color: #475569; }
  ul.qa { padding-left: 12px; }
  ul.qa li { margin-bottom: 3.5px; font-size: 8px; color: #334155; }
  ul.qa li strong { color: #0F172A; }
  .footer {
    margin-top: 7px;
    padding-top: 5px;
    border-top: 1px solid #E2E8F0;
    display: flex;
    justify-content: space-between;
    font-family: ui-monospace, monospace;
    font-size: 7.5px;
    color: #64748B;
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-row">
        <h1>AntiSlop — Multimodal UI Taste Engine &amp; Self-Refining Critic</h1>
        <span class="badge">Gemini 4 NYC · Element 119 · Managed Agents</span>
      </div>
      <div class="sub">Zero-slop frontend transformation driven by raw screenshots, live URLs, motion video, webcam frames, drawn circles &amp; two-way Gemini 3.8 Live voice.</div>
    </div>
    <div class="links">
      Live Studio: https://ui-ux.fun<br/>
      Engine API: antislop-engine-a53petnlfa-uc.a.run.app<br/>
      GitHub: github.com/REDFOX1899/antislop
    </div>
  </div>

  <h2>1. End-to-End Closed-Loop Pipeline (No Prompts Guessing · Every Render Audited)</h2>
  <div class="pipeline">
    <div class="stage">
      <div class="stage-num">01 · Raw Inputs</div>
      <div class="stage-title">Multimodal + Live</div>
      <div class="stage-desc">URL capture (CSS DNA), images, webcam, motion video, drawn circles, 2-way <code>3.8-live</code> audio.</div>
    </div>
    <div class="stage">
      <div class="stage-num">02 · Director</div>
      <div class="stage-title">Manifest + Domain</div>
      <div class="stage-desc"><code>gemini-4-carbon</code> synthesizes tokens, typography &amp; domain-grounded hero briefs.</div>
    </div>
    <div class="stage">
      <div class="stage-num">03 · Synthesis</div>
      <div class="stage-title">Stack-Aware Code</div>
      <div class="stage-desc"><code>hydrogen</code> / <code>neon</code> + Design Craft Skill v2 + parallel <code>nano-banana-2.1</code> imagery.</div>
    </div>
    <div class="stage">
      <div class="stage-num">04 · Critic</div>
      <div class="stage-title">Decision-1 X-Ray</div>
      <div class="stage-desc">Puppeteer DOM audit + <code>gemini-decision-1</code> (12-probe gate + 900/1800-probe spatial matrix).</div>
    </div>
    <div class="stage">
      <div class="stage-num">05 · Remote Ship</div>
      <div class="stage-title">Managed Agent</div>
      <div class="stage-desc"><code>antigravity-preview-09-2026</code> mounts repo + inline <code>SKILL.md</code>, builds exit 0, opens PR.</div>
    </div>
  </div>

  <h2>2. Google Gemini 4 &amp; Ecosystem Model Matrix (All Models Used in Production)</h2>
  <table>
    <thead>
      <tr>
        <th style="width:22%">Model / API ID</th>
        <th style="width:14%">API Surface</th>
        <th style="width:19%">Assigned Role</th>
        <th style="width:45%">Exact Technical Behavior &amp; Why It Matters</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>gemini-4-carbon</code></td>
        <td>v1 Interactions</td>
        <td>Design Director</td>
        <td>Fuses moodboards, webcam glare frames, videos &amp; voice (<code>thinking_level: high</code>) into strict typed <code>DesignManifest</code> tokens &amp; conflict notes.</td>
      </tr>
      <tr>
        <td><code>gemini-4-neon</code></td>
        <td>v1 Interactions</td>
        <td>Parallel Architect</td>
        <td>Races 3-4 distinct React/Tailwind architectural candidates concurrently across Dual Tier-3 API keys in Deep Atelier mode; fallback for Fast Fusion.</td>
      </tr>
      <tr>
        <td><code>gemini-4-hydrogen</code></td>
        <td>v1 Interactions</td>
        <td>Fast Surgeon &amp; Patcher</td>
        <td>Powers single-pass Fast Fusion (~35s full stack-aware React/Vanilla JS rewrite) + surgical Circle-to-Tweak code patching (<code>app.js</code>-only shaders).</td>
      </tr>
      <tr>
        <td><code>gemini-4-argon</code></td>
        <td>v1 Interactions</td>
        <td>Fast Critic &amp; Recommender</td>
        <td>Drives low-latency <code>POST /api/recommendations</code> (4 domain-specific 3D/editorial upgrades) and rapid fast-mode critique routing.</td>
      </tr>
      <tr>
        <td><code>gemini-decision-1</code></td>
        <td>v1beta Decisions</td>
        <td>Calibrated Taste Gate &amp; 900-Probe X-Ray</td>
        <td><strong>0 output tokens</strong> single prefill pass: ~250ms 12-probe gate (6 score, 4 noul P(true), 2 choice) + <strong>900 probes in 2.29s</strong> (10x10 heatmap) &amp; <strong>1,800 Dual-Key Sharded</strong> past the 1,000-probe hard cap!</td>
      </tr>
      <tr>
        <td><code>gemini-3.8-live</code></td>
        <td>v1beta Live WS</td>
        <td>2-Way Real-Time Director</td>
        <td>Full-duplex 16kHz PCM mic -&gt; 24kHz PCM gapless voice with barge-in interrupt, sees live canvas JPEG, invokes <code>NON_BLOCKING</code> <code>apply_ui_transformation</code> tool.</td>
      </tr>
      <tr>
        <td><code>gemini-nano-banana-2.1</code></td>
        <td>v1beta Interactions</td>
        <td>Domain-Grounded Art</td>
        <td>Synthesizes bespoke editorial hero imagery grounded in extracted page copy/brand (e.g., stoneware ceramics for Kova Goods, cobalt tiger for halftone shader).</td>
      </tr>
      <tr>
        <td><code>gemini-embedding-2</code></td>
        <td>v1beta Embeddings</td>
        <td>Taste Convergence Vector</td>
        <td>3072-d multimodal cosine similarity tracking visual &amp; semantic alignment between moodboard references and rendered screenshots across iterations.</td>
      </tr>
      <tr>
        <td><code>gemini-3.5-transcribe</code></td>
        <td>v1 Interactions</td>
        <td>Voice Direction STT</td>
        <td>High-accuracy transcription preserving CSS, palette, and font terminology verbatim on quick Canvas Speak recordings.</td>
      </tr>
      <tr>
        <td><code>antigravity-preview-09-2026</code></td>
        <td>v1beta Agents</td>
        <td>Remote Linux Shipper</td>
        <td>Repo+skill-hash isolated agent mounting GitHub repo + inline <code>.agents/skills/antislop-design-craft/SKILL.md</code>; enforces <code>npm run build</code> exit 0 &amp; streams 91 SSE events.</td>
      </tr>
    </tbody>
  </table>

  <div class="two-col">
    <div class="box">
      <h2>3. Empirical Evaluation &amp; Element 119 Breaking Points</h2>
      <div class="metric-grid">
        <div class="metric"><strong>13.8 → 99.5 / 100</strong><span>5-Sigma Taste Index (0/3 Control vs 3/3 AntiSlop V2, Cohen's <em>d</em> = 38.30)</span></div>
        <div class="metric"><strong>9.09 → 1.41 / 10</strong><span>AI Slop Penalty (<em>NovaFlow</em> + live <code>anthropic.com</code> CSS DNA in 33.5s)</span></div>
        <div class="metric"><strong>900 Qs in 2.29s</strong><span>Single-pass <code>gemini-decision-1</code> (0 out tok); <strong>1,001 Qs = HTTP 400 cap</strong></span></div>
        <div class="metric"><strong>1,800 Sharded</strong><span>Dual Tier-3 keys break the 1K cap (~2.4s) + auto-generates surgical fix</span></div>
      </div>
    </div>

    <div class="box">
      <h2>4. Judge Q&amp;A Cheat Sheet</h2>
      <ul class="qa">
        <li><strong>Why raw media vs text?</strong> Text ("luxury minimalist") collapses visual craft; Chromium CSS DNA + raw screenshots/video lock exact ink ratios, fonts &amp; easing (<code>+7.35</code> Match gain, <code>+0.786</code> Embed-2 cosine).</li>
        <li><strong>How do you prevent hallucinations?</strong> Deterministic Puppeteer DOM gates (overflow, console=0, overlaps, broken imgs) override passes; <code>sanitizeAndValidateFiles</code> rejects mismatched stacks.</li>
        <li><strong>Why custom Skills?</strong> <code>SKILL.md</code> (Swiss grids, WCAG math, compositor motion, 3D depth) is injected into Gemini 4 AND mounted natively inside Antigravity Managed Agents.</li>
        <li><strong>Managed Agents isolation?</strong> Agents use repo+skill-hash IDs + verified remote <code>npm run build</code> exit 0 (zero leaked cross-repo workspaces).</li>
      </ul>
    </div>
  </div>

  <div class="footer">
    <span>Built with Native @google/genai v3.6.1 · Dual Tier-3 Keys + LangSmith Tracing</span>
    <span>Team AntiSlop · Shantanu Patil · Gemini 4 NYC Hackathon (Nov 21, 2026)</span>
  </div>
</body>
</html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const targets = [
    path.resolve('../docs/AntiSlop_Gemini4_OnePager.pdf'),
    path.resolve('../studio/public/AntiSlop_Gemini4_OnePager.pdf'),
    '/Users/shantanu/.gemini/antigravity/brain/ab8d5161-3e43-4756-aa32-9ffe156fbdf1/AntiSlop_Gemini4_OnePager.pdf',
  ];
  for (const outPath of targets) {
    await page.pdf({
      path: outPath,
      format: 'Letter',
      printBackground: true,
      pageRanges: '1',
      margin: { top: '0.28in', bottom: '0.28in', left: '0.35in', right: '0.35in' },
    });
    console.log('WROTE_PDF=' + outPath + ' bytes=' + fs.statSync(outPath).size);
  }
  await browser.close();
})();
