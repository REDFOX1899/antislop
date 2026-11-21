#!/usr/bin/env node
/**
 * AntiSlop 5-Sigma & Element 119 Visual Test Fixture Generator
 *
 * Programmatically renders 6 unseen, visually complex real-world design scenarios
 * (9 crisp 1200x900 PNGs) using headless Chromium via Puppeteer from backend/node_modules
 * (with procedural HTML5 Canvas paper/linen/concrete/CMOS grain, SVG architectural geometry,
 * CSS perspective transforms, tungsten casts, and specular glare streaks).
 *
 * Falls back to a pure-Node deterministic PNG generator if Chromium is unavailable.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FIXTURES_DIR = __dirname;
const CHAOS_DIR = path.join(FIXTURES_DIR, 'conflicting-chaos-set');

const WIDTH = 1200;
const HEIGHT = 900;

/**
 * Shared deterministic PRNG + procedural texture injection script executed inside Puppeteer
 * so every fixture is 100% reproducible across machines and CI runs.
 */
const SHARED_NOISE_SCRIPT = `
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function renderGrain(canvasId, { seed = 42, intensity = 18, colorNoise = false, weave = false, concrete = false, glare = false }) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.width = ${WIDTH};
    canvas.height = ${HEIGHT};
    const ctx = canvas.getContext('2d');
    const rand = mulberry32(seed);
    const img = ctx.createImageData(${WIDTH}, ${HEIGHT});
    const d = img.data;

    for (let y = 0; y < ${HEIGHT}; y++) {
      for (let x = 0; x < ${WIDTH}; x++) {
        const i = (y * ${WIDTH} + x) * 4;
        if (colorNoise) {
          // Low-light CMOS RGB chroma + luminance noise
          const lum = (rand() - 0.5) * intensity * 2.2;
          d[i] = Math.max(0, Math.min(255, 128 + lum + (rand() - 0.5) * intensity * 1.4));
          d[i + 1] = Math.max(0, Math.min(255, 124 + lum + (rand() - 0.5) * intensity * 1.1));
          d[i + 2] = Math.max(0, Math.min(255, 118 + lum + (rand() - 0.5) * intensity * 1.8));
          d[i + 3] = Math.min(255, Math.floor(Math.abs(lum) * 2.2 + 24));
        } else if (weave) {
          // Woven unbleached linen warp + weft threads
          const warp = Math.sin(x * 1.35) * 8 + (rand() - 0.5) * intensity;
          const weft = Math.sin(y * 1.28) * 8 + (rand() - 0.5) * intensity;
          const v = 128 + (warp + weft) * 0.55;
          d[i] = Math.max(0, Math.min(255, v + 6));
          d[i + 1] = Math.max(0, Math.min(255, v + 2));
          d[i + 2] = Math.max(0, Math.min(255, v - 8));
          d[i + 3] = 30;
        } else if (concrete) {
          const speck = rand() > 0.965 ? (rand() > 0.5 ? 235 : 22) : 128 + (rand() - 0.5) * intensity * 2.4;
          d[i] = speck;
          d[i + 1] = speck;
          d[i + 2] = speck - 2;
          d[i + 3] = 42;
        } else {
          // Cotton archival print paper fibers
          const v = 128 + (rand() - 0.5) * intensity * 2.0;
          d[i] = Math.max(0, Math.min(255, v + 5));
          d[i + 1] = Math.max(0, Math.min(255, v + 1));
          d[i + 2] = Math.max(0, Math.min(255, v - 7));
          d[i + 3] = 28;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    if (weave) {
      ctx.strokeStyle = 'rgba(130, 116, 94, 0.065)';
      ctx.lineWidth = 1;
      for (let x = 0; x < ${WIDTH}; x += 6) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ${HEIGHT});
        ctx.stroke();
      }
      for (let y = 0; y < ${HEIGHT}; y += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(${WIDTH}, y);
        ctx.stroke();
      }
    }

    if (concrete) {
      // Hairline formwork seams & subtle aggregate pits
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.09)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 24; k++) {
        const sx = rand() * ${WIDTH};
        const sy = rand() * ${HEIGHT};
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (rand() - 0.5) * 140, sy + (rand() - 0.5) * 90);
        ctx.stroke();
      }
    }

    if (glare) {
      // Specular overhead lamp glare streak + tungsten cast
      const g = ctx.createLinearGradient(140, 80, 960, 740);
      g.addColorStop(0.0, 'rgba(255,248,225,0.0)');
      g.addColorStop(0.36, 'rgba(255,246,214,0.03)');
      g.addColorStop(0.47, 'rgba(255,252,238,0.44)');
      g.addColorStop(0.53, 'rgba(255,250,232,0.22)');
      g.addColorStop(0.64, 'rgba(255,244,210,0.02)');
      g.addColorStop(1.0, 'rgba(255,240,200,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ${WIDTH}, ${HEIGHT});
    }
  }
`;

function buildSwissEditorialHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: #F4EEE3;
    color: #161412;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    position: relative;
  }
  .page {
    position: relative; z-index: 2; width: 100%; height: 100%;
    padding: 46px 54px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 28px;
  }
  .crop {
    position: absolute; width: 18px; height: 18px;
    border-color: rgba(22,20,18,0.35); border-style: solid; border-width: 0; z-index: 5;
  }
  .crop.tl { top: 18px; left: 18px; border-top-width: 1px; border-left-width: 1px; }
  .crop.tr { top: 18px; right: 18px; border-top-width: 1px; border-right-width: 1px; }
  .crop.bl { bottom: 18px; left: 18px; border-bottom-width: 1px; border-left-width: 1px; }
  .crop.br { bottom: 18px; right: 18px; border-bottom-width: 1px; border-right-width: 1px; }

  .masthead {
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
    padding-bottom: 14px; border-bottom: 2px solid #D6331F;
    font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600;
  }
  .masthead .center { display: flex; align-items: center; gap: 10px; }
  .vermilion-dot { width: 11px; height: 11px; background: #D6331F; display: inline-block; }
  .masthead .right { text-align: right; color: #5B534A; font-variant-numeric: tabular-nums; }

  .grid-body {
    display: grid;
    grid-template-columns: 7fr 5fr;
    gap: 44px;
    align-items: stretch;
  }
  .left-col {
    display: flex; flex-direction: column; justify-content: space-between;
    border-right: 1px solid rgba(214, 51, 31, 0.45);
    padding-right: 40px;
  }
  .kicker {
    font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase; color: #D6331F;
    font-weight: 700; margin-bottom: 18px;
  }
  .headline {
    font-family: Didot, "Bodoni MT", "Playfair Display", Georgia, serif;
    font-size: 98px; line-height: 0.92; letter-spacing: -0.035em;
    font-weight: 400; color: #141210;
  }
  .headline em { font-style: italic; color: #D6331F; }
  .subhead {
    margin-top: 26px; font-size: 19px; line-height: 1.5; color: #39342F; max-width: 520px;
    font-weight: 400;
  }
  .meta-cols {
    margin-top: 32px; padding-top: 18px; border-top: 1px solid #161412;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
    font-size: 12px; line-height: 1.55; color: #4A433B;
  }
  .meta-cols strong {
    display: block; color: #141210; letter-spacing: 0.12em; text-transform: uppercase;
    font-size: 11px; margin-bottom: 5px;
  }

  .right-col {
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .issue-num {
    font-size: 146px; font-weight: 800; line-height: 0.82; letter-spacing: -0.06em;
    color: #D6331F; text-align: right; font-variant-numeric: tabular-nums;
  }
  .print-plate {
    margin-top: 18px; background: #EBE2D2; border: 1px solid #161412;
    padding: 24px; position: relative; flex: 1; display: flex; flex-direction: column; justify-content: space-between;
  }
  .plate-art { width: 100%; height: 300px; }
  .plate-caption {
    display: flex; justify-content: space-between; border-top: 1px solid rgba(22,20,18,0.28);
    padding-top: 12px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #4D453D;
  }

  .footer-rule {
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid #161412; padding-top: 14px;
    font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #595149;
  }
  .swatch-bar { display: flex; gap: 8px; align-items: center; }
  .swatch { width: 28px; height: 10px; border: 1px solid rgba(22,20,18,0.3); }

  #grain { position: absolute; inset: 0; z-index: 10; pointer-events: none; mix-blend-mode: multiply; }
  .fold {
    position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; z-index: 8;
    background: linear-gradient(90deg, rgba(0,0,0,0.06), rgba(255,255,255,0.22), rgba(0,0,0,0.02));
  }
</style>
</head>
<body>
  <div class="crop tl"></div><div class="crop tr"></div><div class="crop bl"></div><div class="crop br"></div>
  <div class="fold"></div>
  <div class="page">
    <header class="masthead">
      <div>ZÜRICH · BASEL · NEW YORK</div>
      <div class="center"><span class="vermilion-dot"></span><span>ARCHIVAL MONOGRAPH</span></div>
      <div class="right">ISSUE 042 / AUTUMN 2026</div>
    </header>

    <main class="grid-body">
      <section class="left-col">
        <div>
          <div class="kicker">01 — INTERNATIONAL TYPOGRAPHIC DISCIPLINE</div>
          <h1 class="headline">Form &amp;<br/><em>Silence</em><br/>in Print.</h1>
          <p class="subhead">
            Archival rag stock, razor vermilion rules, and asymmetrical column cadence designed to let editorial photography and deliberate typography breathe without decorative clutter.
          </p>
        </div>
        <div class="meta-cols">
          <div>
            <strong>GRID RATIO</strong>
            12-column Swiss baseline<br/>8pt strict rhythm<br/>Zero drop shadows
          </div>
          <div>
            <strong>PAPER &amp; INK</strong>
            Warm Cream #F4EEE3<br/>Carbon Ink #161412<br/>Vermilion #D6331F
          </div>
          <div>
            <strong>SPECIMEN</strong>
            Didot Display 98/90<br/>Helvetica Neue Grotesk<br/>Tabular Coordinate Set
          </div>
        </div>
      </section>

      <aside class="right-col">
        <div class="issue-num">09</div>
        <div class="print-plate">
          <svg class="plate-art" viewBox="0 0 380 280" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="380" height="280" fill="#EFE7D8"/>
            <g stroke="#161412" stroke-width="0.6" opacity="0.22">
              <line x1="0" y1="70" x2="380" y2="70"/>
              <line x1="0" y1="140" x2="380" y2="140"/>
              <line x1="0" y1="210" x2="380" y2="210"/>
              <line x1="95" y1="0" x2="95" y2="280"/>
              <line x1="190" y1="0" x2="190" y2="280"/>
              <line x1="285" y1="0" x2="285" y2="280"/>
            </g>
            <rect x="34" y="34" width="156" height="212" fill="#171513"/>
            <circle cx="222" cy="144" r="96" fill="#D6331F" opacity="0.92"/>
            <rect x="190" y="42" width="144" height="82" fill="#F4EEE3" stroke="#161412" stroke-width="1.5"/>
            <line x1="34" y1="246" x2="346" y2="34" stroke="#D6331F" stroke-width="2.5"/>
            <rect x="206" y="58" width="46" height="46" fill="#B64A26"/>
            <text x="266" y="76" font-family="Helvetica Neue, Arial" font-size="11" font-weight="700" fill="#161412">FIG. 09A</text>
            <text x="266" y="94" font-family="Georgia, serif" font-size="12" font-style="italic" fill="#4A433B">Overprint</text>
          </svg>
          <div class="plate-caption">
            <span>PLATE IX — OVERPRINT STUDY</span>
            <span>SCALE 1:2.4</span>
          </div>
        </div>
      </aside>
    </main>

    <footer class="footer-rule">
      <span>ANTISLOP BENCHMARK FIXTURE · SCENARIO 01</span>
      <div class="swatch-bar">
        <span class="swatch" style="background:#F4EEE3"></span>
        <span class="swatch" style="background:#EBE2D2"></span>
        <span class="swatch" style="background:#161412"></span>
        <span class="swatch" style="background:#D6331F"></span>
      </div>
      <span>ISBN 978-3-906915-42-1</span>
    </footer>
  </div>
  <canvas id="grain"></canvas>
  <script>
    ${SHARED_NOISE_SCRIPT}
    renderGrain('grain', { seed: 101, intensity: 16 });
  </script>
</body>
</html>`;
}

function buildBrutalistTokyoHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: #E7E5DF;
    color: #090909;
    font-family: "Helvetica Neue", "Arial Black", Arial, sans-serif;
    position: relative;
  }
  .frame {
    position: relative; z-index: 2; width: 100%; height: 100%;
    padding: 28px;
    display: grid;
    grid-template-rows: 74px 1fr 118px;
    border: 14px solid #090909;
  }
  .top-bar {
    display: grid; grid-template-columns: 2fr 1fr 1fr;
    border-bottom: 4px solid #090909;
    font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 14px; font-weight: 700;
  }
  .top-bar > div {
    display: flex; align-items: center; padding: 0 18px;
    border-right: 4px solid #090909;
  }
  .top-bar > div:last-child { border-right: none; justify-content: flex-end; background: #090909; color: #FFE600; }

  .middle {
    display: grid; grid-template-columns: 1.55fr 1fr;
    border-bottom: 4px solid #090909;
    position: relative;
  }
  .hero-left {
    border-right: 4px solid #090909;
    padding: 26px 28px;
    display: flex; flex-direction: column; justify-content: space-between;
    background: #0F0F10; color: #F2F0EA;
    position: relative;
  }
  .mega {
    font-size: 112px; font-weight: 900; line-height: 0.86; letter-spacing: -0.055em;
    text-transform: uppercase;
  }
  .mega .inv {
    display: inline-block; background: #FFE600; color: #090909;
    padding: 4px 14px; margin-top: 8px;
  }
  .jp-sub {
    font-size: 24px; letter-spacing: 0.28em; font-weight: 700; color: #BDBAB2;
    margin-top: 18px;
  }
  .spec-table {
    display: grid; grid-template-columns: repeat(3, 1fr);
    border-top: 2px solid #F2F0EA; padding-top: 14px; gap: 12px;
    font-family: "SF Mono", Menlo, monospace; font-size: 12px; color: #D8D6CE;
  }

  .hero-right {
    display: grid; grid-template-rows: 1fr auto;
    background: #E7E5DF;
    position: relative;
  }
  .monolith-grid {
    padding: 24px;
    display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(5, 1fr);
    gap: 8px;
  }
  .blk { background: #090909; }
  .blk.stripe {
    background: repeating-linear-gradient(
      -45deg,
      #090909 0px, #090909 6px,
      #E7E5DF 6px, #E7E5DF 12px
    );
    border: 2px solid #090909;
  }
  .blk.yellow { background: #FFE600; border: 3px solid #090909; }
  .blk.wire { background: transparent; border: 2px solid #090909; }

  .coords-box {
    border-top: 4px solid #090909;
    padding: 16px 22px;
    font-family: "SF Mono", Menlo, monospace;
    font-size: 13px; line-height: 1.5; font-weight: 700;
  }

  .hazard-stamp {
    position: absolute;
    right: 36px; top: 34px;
    transform: rotate(-7deg);
    background: #FFE600;
    color: #090909;
    border: 5px solid #090909;
    padding: 12px 20px;
    font-family: "SF Mono", Menlo, monospace;
    font-weight: 900; font-size: 18px; letter-spacing: 0.08em;
    text-transform: uppercase;
    box-shadow: 8px 8px 0px #090909;
    z-index: 6;
  }

  .bottom-bar {
    display: grid; grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
  }
  .bottom-bar > div {
    height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 0 20px;
    border-right: 4px solid #090909;
  }
  .bottom-bar > div:last-child { border-right: none; }
  .barcode {
    height: 54px; width: 100%;
    background: repeating-linear-gradient(90deg,
      #090909 0 4px, transparent 4px 7px,
      #090909 7px 9px, transparent 9px 14px,
      #090909 14px 20px, transparent 20px 23px,
      #090909 23px 25px, transparent 25px 29px
    );
  }
  .mono-lg { font-family: "SF Mono", Menlo, monospace; font-size: 26px; font-weight: 900; letter-spacing: -0.02em; }
  .mono-sm { font-family: "SF Mono", Menlo, monospace; font-size: 11px; letter-spacing: 0.14em; margin-top: 4px; }

  #grain { position: absolute; inset: 0; z-index: 10; pointer-events: none; mix-blend-mode: multiply; }
</style>
</head>
<body>
  <div class="frame">
    <div class="top-bar">
      <div>SHIBUYA // CONCRETE FORM ARCHIVE № 07</div>
      <div>35.6595°N 139.7004°E</div>
      <div>SPEC // 00-RAW-2026</div>
    </div>

    <div class="middle">
      <div class="hero-left">
        <div>
          <div class="mega">
            RAW<br/>
            GRID<br/>
            <span class="inv">TOKYO</span>
          </div>
          <div class="jp-sub">東京構造・建築記録 // 07</div>
        </div>
        <div class="spec-table">
          <div>RADIUS: 0PX<br/>SHADOW: HARD OFFSET</div>
          <div>CONTRAST: 19.2:1<br/>INK: #090909</div>
          <div>ACCENT: #FFE600<br/>SLOP: ZERO TOLERANCE</div>
        </div>
      </div>

      <div class="hero-right">
        <div class="hazard-stamp">APPROVED // RAW 07</div>
        <div class="monolith-grid">
          <div class="blk" style="grid-column: span 2; grid-row: span 2;"></div>
          <div class="blk wire"></div>
          <div class="blk stripe"></div>
          <div class="blk stripe" style="grid-column: span 2;"></div>
          <div class="blk yellow" style="grid-column: span 3;"></div>
          <div class="blk"></div>
          <div class="blk wire" style="grid-row: span 2;"></div>
          <div class="blk" style="grid-column: span 2; grid-row: span 2;"></div>
          <div class="blk stripe" style="grid-row: span 2;"></div>
        </div>
        <div class="coords-box">
          ELEVATION: +42.0M · STRUCTURAL MODULAR SYSTEM<br/>
          EXPOSED FORMWORK // HARD BORDER GEOMETRY
        </div>
      </div>
    </div>

    <div class="bottom-bar">
      <div>
        <div class="mono-lg">MODULE 07</div>
        <div class="mono-sm">BRUTALIST INDUSTRIAL</div>
      </div>
      <div>
        <div class="barcode"></div>
        <div class="mono-sm">007-8812-TOKYO-CONCRETE-ANTISLOP</div>
      </div>
      <div style="background:#FFE600;">
        <div class="mono-lg">2026.11</div>
        <div class="mono-sm">EXHIBITION SPECIMEN</div>
      </div>
    </div>
  </div>
  <canvas id="grain"></canvas>
  <script>
    ${SHARED_NOISE_SCRIPT}
    renderGrain('grain', { seed: 202, intensity: 22, concrete: true });
  </script>
</body>
</html>`;
}

function buildDimTiltedWebcamHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: radial-gradient(circle at 48% 42%, #2F261E 0%, #191410 62%, #0B0907 100%);
    font-family: Georgia, serif;
    position: relative;
  }
  /* Cluttered low-light wooden desk background cues */
  .desk-grain {
    position: absolute; inset: 0;
    background: repeating-linear-gradient(
      6deg,
      rgba(65,48,34,0.18) 0px, rgba(65,48,34,0.18) 12px,
      rgba(22,16,11,0.22) 12px, rgba(22,16,11,0.22) 26px
    );
  }
  .keyboard-blur {
    position: absolute; top: -22px; left: 110px; width: 680px; height: 96px;
    background: #141210; border-radius: 10px; transform: rotate(-4deg);
    box-shadow: 0 18px 34px rgba(0,0,0,0.75);
    filter: blur(3px); opacity: 0.85;
    display: grid; grid-template-columns: repeat(14, 1fr); gap: 6px; padding: 14px;
  }
  .keycap { background: #26221E; border-radius: 3px; }
  .mug-shadow {
    position: absolute; right: 56px; top: 90px; width: 175px; height: 175px;
    border-radius: 50%;
    background: radial-gradient(circle at 38% 38%, #342B24 0%, #1B1511 65%, #0D0A08 100%);
    box-shadow: -22px 26px 42px rgba(0,0,0,0.78);
    filter: blur(2.5px);
  }
  .mug-inner {
    position: absolute; inset: 22px; border-radius: 50%;
    background: #140F0B; border: 4px solid #3C322A;
  }

  /* Tilted physical glossy editorial magazine held up to webcam */
  .scene {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    perspective: 1100px;
  }
  .magazine {
    width: 610px; height: 760px;
    background: #EDE4D3;
    color: #1F1B17;
    transform: rotate(-11.5deg) rotateY(14deg) rotateX(8deg) translate(-18px, 16px);
    box-shadow: -28px 38px 65px rgba(0,0,0,0.82), 0 0 0 1px rgba(255,235,205,0.16);
    padding: 36px 38px;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative;
    overflow: hidden;
    filter: brightness(0.76) contrast(0.92) sepia(0.18);
  }
  .spine-shadow {
    position: absolute; top: 0; bottom: 0; left: 0; width: 22px;
    background: linear-gradient(90deg, rgba(0,0,0,0.34), rgba(255,255,255,0.14) 45%, transparent);
  }
  .mag-top {
    display: flex; justify-content: space-between; font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
    border-bottom: 1.5px solid #2A251F; padding-bottom: 10px;
  }
  .mag-title {
    font-family: Didot, Georgia, serif;
    font-size: 76px; letter-spacing: 0.06em; line-height: 0.92; text-align: center;
    margin: 18px 0 12px; font-weight: 400; color: #191613;
  }
  .mag-photo {
    flex: 1; background: #465741; position: relative; overflow: hidden;
    border: 1px solid #2A251F;
    display: flex; flex-direction: column; justify-content: flex-end; padding: 24px;
  }
  .arch-circle {
    position: absolute; width: 290px; height: 290px; border-radius: 50%;
    background: #BD522D; top: 34px; right: -40px;
  }
  .arch-block {
    position: absolute; width: 220px; height: 340px;
    background: #D8C9B1; left: 28px; top: 52px;
    border: 1px solid rgba(25,22,19,0.3);
  }
  .mag-caption {
    position: relative; z-index: 2;
    background: rgba(237, 228, 211, 0.94); padding: 14px 16px;
    font-family: "Helvetica Neue", Arial, sans-serif;
  }
  .mag-caption h2 { font-family: Georgia, serif; font-size: 24px; font-weight: 400; margin-bottom: 4px; }
  .mag-caption p { font-size: 12px; color: #4A433A; letter-spacing: 0.04em; }

  .mag-footer {
    margin-top: 16px; display: flex; justify-content: space-between;
    font-family: "Helvetica Neue", Arial, sans-serif; font-size: 11px; letter-spacing: 0.14em;
    color: #4D453B; text-transform: uppercase;
  }

  /* Glossy magazine specular glare cutting across cover */
  .cover-glare {
    position: absolute; inset: -60px;
    background: linear-gradient(128deg,
      transparent 28%,
      rgba(255, 249, 232, 0.08) 41%,
      rgba(255, 252, 242, 0.62) 48%,
      rgba(255, 248, 226, 0.14) 55%,
      transparent 66%
    );
    pointer-events: none;
  }

  /* Thumb gripping bottom-right corner of magazine (classic messy webcam shot) */
  .thumb {
    position: absolute; right: 205px; bottom: 72px; width: 138px; height: 84px;
    border-radius: 56px 34px 44px 52px;
    transform: rotate(-24deg);
    background: radial-gradient(circle at 30% 40%, #6D5140 0%, #3E2B20 68%, #1F140E 100%);
    box-shadow: -12px 12px 24px rgba(0,0,0,0.65);
    filter: blur(1.2px); z-index: 6;
  }

  /* Tungsten indoor white-balance cast + lens vignette */
  .tungsten-vignette {
    position: absolute; inset: 0; z-index: 8; pointer-events: none;
    background:
      radial-gradient(ellipse at 50% 48%, rgba(255, 194, 118, 0.11) 0%, rgba(16, 11, 7, 0.56) 78%, rgba(4, 3, 2, 0.88) 100%);
  }
  .webcam-hud {
    position: absolute; top: 20px; left: 24px; z-index: 12;
    font-family: "SF Mono", Menlo, monospace; font-size: 11px; color: rgba(255,235,205,0.45);
    letter-spacing: 0.12em;
  }
  #grain { position: absolute; inset: 0; z-index: 11; pointer-events: none; }
</style>
</head>
<body>
  <div class="desk-grain"></div>
  <div class="keyboard-blur">
    ${Array.from({ length: 28 }).map(() => '<div class="keycap"></div>').join('')}
  </div>
  <div class="mug-shadow"><div class="mug-inner"></div></div>

  <div class="scene">
    <div class="magazine">
      <div class="spine-shadow"></div>
      <div class="mag-top">
        <span>ISSUE NO. 18</span>
        <span>KYOTO · MILAN</span>
        <span>$24 USD</span>
      </div>
      <div class="mag-title">MONOLITH</div>
      <div class="mag-photo">
        <div class="arch-circle"></div>
        <div class="arch-block"></div>
        <div class="mag-caption">
          <h2>Materiality &amp; Quiet Architecture</h2>
          <p>OLIVE PLASTER · BURNT SIENNA · ALABASTER PAPER</p>
        </div>
      </div>
      <div class="mag-footer">
        <span>AUTUMN / WINTER</span>
        <span>ELEMENT 119 WEBCAM CAPTURE</span>
      </div>
      <div class="cover-glare"></div>
    </div>
  </div>

  <div class="thumb"></div>
  <div class="tungsten-vignette"></div>
  <div class="webcam-hud">CAM_01 · ISO 3200 · 2900K TUNGSTEN · TILT -11.5°</div>
  <canvas id="grain"></canvas>
  <script>
    ${SHARED_NOISE_SCRIPT}
    renderGrain('grain', { seed: 303, intensity: 34, colorNoise: true, glare: true });
  </script>
</body>
</html>`;
}

function buildChaosSwissMinimalHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: #FAFAFA; color: #0B0B0B;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    padding: 72px;
    display: grid; grid-template-rows: auto 1fr auto;
  }
  .top { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; border-bottom: 1px solid #0B0B0B; padding-bottom: 16px; }
  .mid { display: grid; grid-template-columns: 1fr 1fr; align-items: center; }
  .dot { width: 180px; height: 180px; border-radius: 50%; background: #E1251B; justify-self: center; }
  h1 { font-size: 82px; font-weight: 300; letter-spacing: -0.04em; line-height: 0.96; }
  p { margin-top: 24px; font-size: 14px; color: #555; max-width: 340px; line-height: 1.7; }
  .bot { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 0.2em; color: #666; border-top: 1px solid #E2E2E2; padding-top: 14px; }
</style>
</head>
<body>
  <div class="top"><span>CHAOS REF 01 / SWISS MINIMAL</span><span>WHITE + HAIRLINE + RED</span></div>
  <div class="mid">
    <div>
      <h1>Quiet<br/>Reduction.</h1>
      <p>70% pure negative space, whisper-thin rules, zero color noise, ultra-light grotesk proportion.</p>
    </div>
    <div class="dot"></div>
  </div>
  <div class="bot"><span>#FAFAFA · #0B0B0B · #E1251B</span><span>CONFLICT SET 1 OF 4</span></div>
</body>
</html>`;
}

function buildChaosNeonCyberpunkHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: radial-gradient(circle at 50% 25%, #240046 0%, #090118 55%, #030008 100%);
    color: #00F5FF;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    position: relative;
  }
  .grid-floor {
    position: absolute; left: -200px; right: -200px; bottom: -80px; height: 460px;
    background-image:
      linear-gradient(to right, rgba(255,0,204,0.45) 2px, transparent 2px),
      linear-gradient(to bottom, rgba(0,245,255,0.45) 2px, transparent 2px);
    background-size: 64px 44px;
    transform: perspective(420px) rotateX(62deg);
  }
  .sun {
    position: absolute; top: 100px; left: 50%; transform: translateX(-50%);
    width: 310px; height: 310px; border-radius: 50%;
    background: linear-gradient(180deg, #FFE600 0%, #FF00CC 58%, #5B00FF 100%);
    box-shadow: 0 0 90px rgba(255,0,204,0.65);
  }
  .content {
    position: relative; z-index: 4; height: 100%; padding: 54px 64px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .tag { display: inline-block; border: 2px solid #B6FF00; color: #B6FF00; padding: 6px 14px; font-size: 13px; letter-spacing: 0.2em; width: fit-content; }
  .neon-title {
    font-family: "Arial Black", Impact, sans-serif;
    font-size: 102px; line-height: 0.9; text-transform: uppercase;
    color: #FFFFFF;
    text-shadow: -5px 0 #FF00CC, 5px 0 #00F5FF, 0 0 38px rgba(255,0,204,0.9);
  }
  .scanlines {
    position: absolute; inset: 0; z-index: 8; pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 2px, transparent 2px 5px);
  }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .card {
    background: rgba(12, 2, 34, 0.85);
    border: 2px solid #00F5FF;
    box-shadow: 0 0 24px rgba(0,245,255,0.45);
    padding: 18px; color: #F5E6FF; font-size: 13px;
  }
  .card strong { color: #FF00CC; display: block; margin-bottom: 6px; font-size: 16px; }
</style>
</head>
<body>
  <div class="sun"></div>
  <div class="grid-floor"></div>
  <div class="content">
    <div class="tag">CHAOS REF 02 // NEON CYBERPUNK 2099</div>
    <div class="neon-title">SYNTH<br/>OVERDRIVE</div>
    <div class="cards">
      <div class="card"><strong>#FF00CC MAGENTA</strong>High-voltage chromatic bloom</div>
      <div class="card"><strong>#00F5FF CYAN</strong>Wireframe neon telemetry</div>
      <div class="card"><strong>#B6FF00 ACID</strong>Maximum saturation clash</div>
    </div>
  </div>
  <div class="scanlines"></div>
</body>
</html>`;
}

function buildChaosEarthyCeramicHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: #DDD0BE; color: #362A22;
    font-family: Georgia, "Times New Roman", serif;
    position: relative;
  }
  .wrap {
    position: relative; z-index: 2; height: 100%; padding: 64px 72px;
    display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center;
  }
  .pill {
    display: inline-block; padding: 8px 18px; border-radius: 999px;
    border: 1px solid #7C5C47; color: #6E4F3A;
    font-family: "Helvetica Neue", Arial, sans-serif; font-size: 12px; letter-spacing: 0.16em;
    margin-bottom: 24px;
  }
  h1 { font-size: 74px; font-weight: 400; line-height: 1.04; color: #2D221B; }
  p { margin-top: 22px; font-size: 18px; line-height: 1.65; color: #56453A; }
  .vessel-card {
    background: #EAE0D2; border-radius: 260px 260px 28px 28px;
    padding: 46px; border: 1px solid rgba(110,79,58,0.28);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 660px;
  }
  #grain { position: absolute; inset: 0; z-index: 6; pointer-events: none; mix-blend-mode: multiply; }
</style>
</head>
<body>
  <div class="wrap">
    <div>
      <div class="pill">CHAOS REF 03 · EARTHY CERAMIC CRAFT</div>
      <h1>Atelier Kama<br/>Stoneware.</h1>
      <p>Hand-thrown raw stoneware clay, speckled iron glaze, unbleached linen ground, warm terracotta earth tones, and soft organic curves.</p>
    </div>
    <div class="vessel-card">
      <svg width="320" height="440" viewBox="0 0 320 440" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="160" cy="402" rx="96" ry="18" fill="rgba(54,42,34,0.16)"/>
        <path d="M116 62 C116 95, 62 152, 62 248 C62 342, 102 396, 160 396 C218 396, 258 342, 258 248 C258 152, 204 95, 204 62 Z" fill="#B66445"/>
        <ellipse cx="160" cy="62" rx="44" ry="12" fill="#8C472D"/>
        <path d="M98 202 Q160 226 222 202" fill="none" stroke="#E5D8C5" stroke-width="5" opacity="0.5"/>
        <circle cx="132" cy="264" r="3" fill="#4E2A1C" opacity="0.6"/>
        <circle cx="188" cy="296" r="2.5" fill="#4E2A1C" opacity="0.5"/>
        <circle cx="152" cy="318" r="3.5" fill="#4E2A1C" opacity="0.45"/>
        <path d="M160 62 C175 24, 212 10, 240 16" fill="none" stroke="#5B6B54" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="206" cy="24" rx="18" ry="8" transform="rotate(-24 206 24)" fill="#6C7E64"/>
        <ellipse cx="232" cy="18" rx="16" ry="7" transform="rotate(14 232 18)" fill="#5B6B54"/>
      </svg>
    </div>
  </div>
  <canvas id="grain"></canvas>
  <script>
    ${SHARED_NOISE_SCRIPT}
    renderGrain('grain', { seed: 403, intensity: 20, weave: true });
  </script>
</body>
</html>`;
}

function buildChaosCorporateBlueprintHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background-color: #0B3B8C;
    background-image:
      linear-gradient(rgba(195,230,255,0.22) 1px, transparent 1px),
      linear-gradient(90deg, rgba(195,230,255,0.22) 1px, transparent 1px),
      linear-gradient(rgba(195,230,255,0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(195,230,255,0.08) 1px, transparent 1px);
    background-size: 80px 80px, 80px 80px, 16px 16px, 16px 16px;
    color: #E3F3FF;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    padding: 36px;
  }
  .sheet {
    width: 100%; height: 100%;
    border: 3px solid #D6EEFF;
    display: grid; grid-template-rows: 1fr 136px;
  }
  .canvas-area {
    padding: 36px; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 36px; align-items: center;
  }
  h1 { font-size: 56px; letter-spacing: -0.02em; line-height: 1.08; margin-bottom: 18px; }
  p { font-size: 15px; line-height: 1.6; color: #B8DCFF; }
  .title-block {
    border-top: 3px solid #D6EEFF;
    display: grid; grid-template-columns: 2fr 1fr 1fr 1fr;
  }
  .title-block > div {
    border-right: 2px solid #D6EEFF; padding: 18px 20px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .title-block > div:last-child { border-right: none; }
  .lbl { font-size: 11px; color: #90C3F8; letter-spacing: 0.14em; }
  .val { font-size: 20px; font-weight: 700; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="canvas-area">
      <div>
        <div class="lbl" style="margin-bottom:12px;">CHAOS REF 04 // CORPORATE ENGINEERING BLUEPRINT</div>
        <h1>SPEC-9940<br/>SYSTEM CAD</h1>
        <p>Prussian blueprint drafting grid (#0B3B8C), technical isometric schematics, rigid ISO title block, zero organic curves or warmth.</p>
      </div>
      <svg width="430" height="430" viewBox="0 0 430 430" xmlns="http://www.w3.org/2000/svg">
        <g stroke="#E3F3FF" fill="none" stroke-width="2">
          <polygon points="215,40 375,130 215,220 55,130"/>
          <polygon points="55,130 215,220 215,375 55,285"/>
          <polygon points="375,130 215,220 215,375 375,285"/>
          <line x1="215" y1="40" x2="215" y2="375" stroke-dasharray="6 6" opacity="0.6"/>
          <circle cx="215" cy="130" r="46" stroke-dasharray="4 4"/>
          <line x1="25" y1="130" x2="405" y2="130" opacity="0.35"/>
          <line x1="215" y1="15" x2="215" y2="410" opacity="0.35"/>
        </g>
        <text x="275" y="96" fill="#E3F3FF" font-family="monospace" font-size="13">R = 46.00mm</text>
        <text x="64" y="398" fill="#B8DCFF" font-family="monospace" font-size="12">TOLERANCE ±0.02 ISO-2768</text>
      </svg>
    </div>
    <div class="title-block">
      <div><span class="lbl">DRAWING TITLE</span><span class="val">ENTERPRISE ARCHITECTURE REV-C</span></div>
      <div><span class="lbl">DWG NO.</span><span class="val">BP-9940-04</span></div>
      <div><span class="lbl">SCALE</span><span class="val">1 : 100</span></div>
      <div><span class="lbl">SHEET</span><span class="val">04 / 04</span></div>
    </div>
  </div>
</body>
</html>`;
}

function buildHighContrastPhotoTrapHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: #07080A; color: #FFFFFF;
    font-family: Didot, "Bodoni MT", Georgia, serif;
    position: relative;
  }
  #scene { position: absolute; inset: 0; z-index: 1; }
  .editorial-overlay {
    position: relative; z-index: 3; width: 100%; height: 100%;
    padding: 56px 64px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .top-nav {
    display: flex; justify-content: space-between; align-items: center;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
    color: #E8D29D;
    border-bottom: 1px solid rgba(232,210,157,0.35); padding-bottom: 18px;
  }
  .center-hero {
    max-width: 780px;
    background: linear-gradient(90deg, rgba(7,8,10,0.84) 0%, rgba(7,8,10,0.62) 68%, rgba(7,8,10,0.0) 100%);
    padding: 36px 40px;
    border-left: 2px solid #DFC48B;
  }
  .eyebrow {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 12px; letter-spacing: 0.26em; text-transform: uppercase;
    color: #DFC48B; margin-bottom: 18px;
  }
  h1 {
    font-size: 90px; line-height: 0.94; font-weight: 400; letter-spacing: -0.02em;
    color: #FFFFFF;
    text-shadow: 0 2px 24px rgba(0,0,0,0.65);
  }
  h1 span { color: #DFC48B; font-style: italic; }
  .lead {
    margin-top: 22px; font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 17px; line-height: 1.65; color: #ECE7DC; max-width: 520px;
  }
  .bottom-strip {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
    border-top: 1px solid rgba(232,210,157,0.35); padding-top: 18px;
    font-family: "Helvetica Neue", Arial, sans-serif; font-size: 12px; letter-spacing: 0.14em;
    color: #DFC48B;
    background: linear-gradient(180deg, rgba(7,8,10,0.0), rgba(7,8,10,0.82));
  }
  .bottom-strip span { display: block; color: #F5F2EB; font-size: 14px; margin-top: 4px; letter-spacing: 0.04em; }
</style>
</head>
<body>
  <canvas id="scene" width="${WIDTH}" height="${HEIGHT}"></canvas>
  <div class="editorial-overlay">
    <div class="top-nav">
      <span>MAISON NOCTURNE · PARIS</span>
      <span>CHIAROSCURO CONTRAST TRAP SPECIMEN</span>
      <span>ARCHIVE 05</span>
    </div>
    <div class="center-hero">
      <div class="eyebrow">DRAMATIC LIGHT &amp; LEGIBILITY DISCIPLINE</div>
      <h1>Nocturne &amp;<br/><span>Gilded Stone</span></h1>
      <p class="lead">
        Razor sunlight shafts slashing across obsidian limestone columns. Any overlaid typography MUST enforce a disciplined dark scrim or split canvas to prevent WCAG contrast collapse.
      </p>
    </div>
    <div class="bottom-strip">
      <div>OBSIDIAN SHADOW<span>#07080A — Protected Scrim</span></div>
      <div>CHAMPAGNE GOLD<span>#DFC48B — Editorial Hairlines</span></div>
      <div>SUNLIGHT TRAP<span>#FFF3D1 — Extreme Luminance Beam</span></div>
    </div>
  </div>
  <script>
    const c = document.getElementById('scene');
    const ctx = c.getContext('2d');
    // Deep architectural obsidian base
    const bg = ctx.createLinearGradient(0, 0, ${WIDTH}, ${HEIGHT});
    bg.addColorStop(0, '#07080B');
    bg.addColorStop(0.55, '#121318');
    bg.addColorStop(1, '#050608');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, ${WIDTH}, ${HEIGHT});

    // Fluted monumental stone columns on right half
    for (let i = 0; i < 6; i++) {
      const x = 520 + i * 118;
      const g = ctx.createLinearGradient(x, 0, x + 88, 0);
      g.addColorStop(0, '#090A0D');
      g.addColorStop(0.32, '#2C2A26');
      g.addColorStop(0.58, '#6B5E49');
      g.addColorStop(0.75, '#1C1B1E');
      g.addColorStop(1, '#060709');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 88, ${HEIGHT});
    }

    // Extreme high-contrast golden daylight beams slashing across dark stone
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const beams = [
      { x1: 660, x2: 880, alpha: 0.92 },
      { x1: 930, x2: 1090, alpha: 0.78 },
      { x1: 420, x2: 520, alpha: 0.42 },
    ];
    for (const b of beams) {
      const grad = ctx.createLinearGradient(b.x1, 0, b.x2 - 220, ${HEIGHT});
      grad.addColorStop(0, 'rgba(255, 245, 214, ' + b.alpha + ')');
      grad.addColorStop(0.45, 'rgba(241, 212, 146, ' + (b.alpha * 0.65) + ')');
      grad.addColorStop(1, 'rgba(255, 240, 195, 0.08)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(b.x1, 0);
      ctx.lineTo(b.x2, 0);
      ctx.lineTo(b.x2 - 310, ${HEIGHT});
      ctx.lineTo(b.x1 - 310, ${HEIGHT});
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Fine architectural film grain
    ${SHARED_NOISE_SCRIPT}
    const rand = mulberry32(505);
    ctx.fillStyle = 'rgba(255,244,216,0.06)';
    for (let k = 0; k < 6000; k++) {
      ctx.fillRect(rand() * ${WIDTH}, rand() * ${HEIGHT}, 1.5, 1.5);
    }
  </script>
</body>
</html>`;
}

function buildWarmBotanicalAtelierHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: #F2ECE1; color: #222821;
    font-family: Georgia, "Times New Roman", serif;
    position: relative;
  }
  .layout {
    position: relative; z-index: 2; width: 100%; height: 100%;
    padding: 50px 58px;
    display: grid; grid-template-rows: auto 1fr auto; gap: 28px;
  }
  .header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid rgba(93,110,89,0.4); padding-bottom: 16px;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #546450;
  }
  .pills { display: flex; gap: 10px; }
  .pill {
    border: 1px solid #5D6E59; border-radius: 999px; padding: 5px 14px;
    font-size: 10px; letter-spacing: 0.16em; color: #435240;
  }
  .pill.terra { border-color: #C46B48; color: #9E4F30; background: rgba(196,107,72,0.08); }

  .main {
    display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 48px; align-items: center;
  }
  .eyebrow {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
    color: #C46B48; margin-bottom: 16px;
  }
  h1 {
    font-size: 84px; font-weight: 400; line-height: 0.96; letter-spacing: -0.02em;
    color: #212820;
  }
  h1 em { font-style: italic; color: #5D6E59; }
  .copy {
    margin-top: 24px; font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 17px; line-height: 1.7; color: #4A5147; max-width: 500px;
  }
  .notes {
    margin-top: 34px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px;
  }
  .note-card {
    background: #E8E0D2; border: 1px solid rgba(93,110,89,0.28);
    border-radius: 14px; padding: 18px 20px;
  }
  .note-card strong {
    display: block; font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
    color: #5D6E59; margin-bottom: 6px;
  }
  .note-card span { font-size: 16px; color: #283027; }

  .specimen-frame {
    height: 100%; background: #EBE3D5;
    border: 1px solid rgba(93,110,89,0.45);
    border-radius: 220px 220px 18px 18px;
    padding: 34px;
    display: flex; flex-direction: column; justify-content: space-between; align-items: center;
  }
  .specimen-label {
    width: 100%; border-top: 1px solid rgba(93,110,89,0.35); padding-top: 12px;
    display: flex; justify-content: space-between;
    font-family: "Helvetica Neue", Arial, sans-serif; font-size: 11px; letter-spacing: 0.14em;
    color: #52614F; text-transform: uppercase;
  }

  .footer {
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid rgba(93,110,89,0.35); padding-top: 14px;
    font-family: "Helvetica Neue", Arial, sans-serif; font-size: 11px; letter-spacing: 0.16em;
    color: #5A6256; text-transform: uppercase;
  }
  .swatches { display: flex; gap: 10px; }
  .sw { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(34,40,33,0.25); }
  #grain { position: absolute; inset: 0; z-index: 9; pointer-events: none; mix-blend-mode: multiply; }
</style>
</head>
<body>
  <div class="layout">
    <header class="header">
      <span>HERBARIUM № 14 · PROVENCE ATELIER</span>
      <div class="pills">
        <span class="pill">UNBLEACHED LINEN</span>
        <span class="pill terra">TERRACOTTA CLAY</span>
      </div>
    </header>

    <main class="main">
      <section>
        <div class="eyebrow">ORGANIC CRAFT &amp; DELICATE SERIF DISPLAY</div>
        <h1>Quiet <em>Botanical</em><br/>Atelier.</h1>
        <p class="copy">
          Woven raw linen surface, heritage sage leaf ink, sun-baked terracotta accents, and tranquil editorial pacing built for tactile warmth.
        </p>
        <div class="notes">
          <div class="note-card">
            <strong>SURFACE &amp; TACTILITY</strong>
            <span>#F2ECE1 Woven Linen · #E8E0D2 Oat</span>
          </div>
          <div class="note-card">
            <strong>BOTANICAL PALETTE</strong>
            <span>#5D6E59 Sage · #C46B48 Terracotta</span>
          </div>
        </div>
      </section>

      <aside class="specimen-frame">
        <svg width="360" height="470" viewBox="0 0 360 470" xmlns="http://www.w3.org/2000/svg">
          <circle cx="180" cy="195" r="126" fill="#DFD4C2"/>
          <circle cx="222" cy="154" r="64" fill="#C46B48" opacity="0.24"/>
          <!-- Delicate botanical eucalyptus stem -->
          <path d="M168 430 C166 340, 174 238, 194 74" fill="none" stroke="#3F4F3C" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M174 335 C134 316, 108 292, 92 260" fill="none" stroke="#5D6E59" stroke-width="1.8"/>
          <path d="M180 264 C216 244, 248 214, 268 182" fill="none" stroke="#5D6E59" stroke-width="1.8"/>
          <path d="M184 188 C144 170, 118 144, 106 112" fill="none" stroke="#5D6E59" stroke-width="1.8"/>
          <!-- Leaves -->
          <ellipse cx="116" cy="284" rx="34" ry="18" transform="rotate(-32 116 284)" fill="#5D6E59" opacity="0.88"/>
          <ellipse cx="144" cy="316" rx="30" ry="16" transform="rotate(-18 144 316)" fill="#73866E" opacity="0.85"/>
          <ellipse cx="238" cy="212" rx="38" ry="19" transform="rotate(28 238 212)" fill="#5D6E59" opacity="0.9"/>
          <ellipse cx="212" cy="244" rx="28" ry="15" transform="rotate(16 212 244)" fill="#889A82" opacity="0.85"/>
          <ellipse cx="132" cy="144" rx="34" ry="17" transform="rotate(-38 132 144)" fill="#6C7F67" opacity="0.9"/>
          <ellipse cx="224" cy="126" rx="30" ry="16" transform="rotate(26 224 126)" fill="#5D6E59" opacity="0.85"/>
          <ellipse cx="194" cy="72" rx="18" ry="30" transform="rotate(8 194 72)" fill="#C46B48" opacity="0.82"/>
          <!-- Pressed specimen crosshairs -->
          <line x1="40" y1="430" x2="320" y2="430" stroke="#5D6E59" stroke-width="1" opacity="0.4"/>
        </svg>
        <div class="specimen-label">
          <span>EUCALYPTUS CINEREA</span>
          <span>PRESSED SPECIMEN 06</span>
        </div>
      </aside>
    </main>

    <footer class="footer">
      <span>ANTISLOP BENCHMARK FIXTURE · SCENARIO 06</span>
      <div class="swatches">
        <span class="sw" style="background:#F2ECE1"></span>
        <span class="sw" style="background:#E8E0D2"></span>
        <span class="sw" style="background:#5D6E59"></span>
        <span class="sw" style="background:#C46B48"></span>
        <span class="sw" style="background:#222821"></span>
      </div>
      <span>BOTANICAL ATELIER</span>
    </footer>
  </div>
  <canvas id="grain"></canvas>
  <script>
    ${SHARED_NOISE_SCRIPT}
    renderGrain('grain', { seed: 606, intensity: 18, weave: true });
  </script>
</body>
</html>`;
}

/**
 * Pure-Node fallback raw PNG encoder (used ONLY if Puppeteer/Chromium is unavailable).
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeFallbackPng(width, height, paletteHex) {
  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const colors = paletteHex.map(hexToRgb);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      let col = colors[0];
      if (y < 60) col = colors[1] || colors[0];
      else if (x > width * 0.62 && y > 120 && y < height - 100) col = colors[2] || colors[1] || colors[0];
      else if (x > 80 && x < width * 0.55 && y > 180 && y < 340) col = colors[3] || colors[1] || colors[0];
      const off = rowStart + 1 + x * 3;
      raw[off] = col[0];
      raw[off + 1] = col[1];
      raw[off + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const FIXTURE_SPECS = [
  {
    id: 'swiss-editorial-print',
    outputPath: path.join(FIXTURES_DIR, 'swiss-editorial-print.png'),
    modality: 'moodboard_image',
    scenario: '5-Sigma Core Editorial',
    description: 'Warm archival cream paper, bold Didot serif + Helvetica grotesk grid, razor vermilion rules.',
    html: buildSwissEditorialHtml(),
    fallbackPalette: ['#F4EEE3', '#D6331F', '#161412', '#EBE2D2'],
  },
  {
    id: 'brutalist-tokyo-poster',
    outputPath: path.join(FIXTURES_DIR, 'brutalist-tokyo-poster.png'),
    modality: 'moodboard_image',
    scenario: '5-Sigma Core Brutalist',
    description: 'High-contrast monochrome raw concrete grid, stark industrial typography, electric yellow stamp.',
    html: buildBrutalistTokyoHtml(),
    fallbackPalette: ['#E7E5DF', '#090909', '#FFE600', '#161616'],
  },
  {
    id: 'dim-tilted-webcam-magazine',
    outputPath: path.join(FIXTURES_DIR, 'dim-tilted-webcam-magazine.png'),
    modality: 'webcam_frame',
    scenario: 'Element 119 Messy Webcam Stress',
    description: 'Low-light, -11.5° tilted, tungsten-cast, glare-streaked physical magazine cover with CMOS sensor noise & thumb.',
    html: buildDimTiltedWebcamHtml(),
    fallbackPalette: ['#1D1712', '#EDE4D3', '#465741', '#BD522D'],
  },
  {
    id: 'chaos-01-swiss-minimal',
    outputPath: path.join(CHAOS_DIR, '01-swiss-minimal.png'),
    modality: 'moodboard_image',
    scenario: 'Element 119 Conflicting Chaos Set (1/4)',
    description: 'Ultra-sparse white Swiss minimal poster with 70% negative space and red dot.',
    html: buildChaosSwissMinimalHtml(),
    fallbackPalette: ['#FAFAFA', '#0B0B0B', '#E1251B', '#E2E2E2'],
  },
  {
    id: 'chaos-02-neon-cyberpunk',
    outputPath: path.join(CHAOS_DIR, '02-neon-cyberpunk.png'),
    modality: 'moodboard_image',
    scenario: 'Element 119 Conflicting Chaos Set (2/4)',
    description: 'Pitch-black neon synthwave cyberpunk void with magenta/cyan/acid-lime saturation clash.',
    html: buildChaosNeonCyberpunkHtml(),
    fallbackPalette: ['#090118', '#FF00CC', '#00F5FF', '#B6FF00'],
  },
  {
    id: 'chaos-03-earthy-ceramic-craft',
    outputPath: path.join(CHAOS_DIR, '03-earthy-ceramic-craft.png'),
    modality: 'moodboard_image',
    scenario: 'Element 119 Conflicting Chaos Set (3/4)',
    description: 'Warm raw stoneware clay, terracotta vessel, unbleached linen craft.',
    html: buildChaosEarthyCeramicHtml(),
    fallbackPalette: ['#DDD0BE', '#B66445', '#5B6B54', '#2D221B'],
  },
  {
    id: 'chaos-04-corporate-blueprint',
    outputPath: path.join(CHAOS_DIR, '04-corporate-blueprint.png'),
    modality: 'moodboard_image',
    scenario: 'Element 119 Conflicting Chaos Set (4/4)',
    description: 'Prussian CAD engineering blueprint with millimeter grid and technical schematics.',
    html: buildChaosCorporateBlueprintHtml(),
    fallbackPalette: ['#0B3B8C', '#D6EEFF', '#144BA8', '#E3F3FF'],
  },
  {
    id: 'high-contrast-photo-trap',
    outputPath: path.join(FIXTURES_DIR, 'high-contrast-photo-trap.png'),
    modality: 'moodboard_image',
    scenario: 'Element 119 Contrast Legibility Trap',
    description: 'Obsidian dramatic photography slashed by bright daylight shafts + white-gold editorial layout testing contrast traps.',
    html: buildHighContrastPhotoTrapHtml(),
    fallbackPalette: ['#07080A', '#DFC48B', '#FFF3D1', '#1C1B1E'],
  },
  {
    id: 'warm-botanical-atelier',
    outputPath: path.join(FIXTURES_DIR, 'warm-botanical-atelier.png'),
    modality: 'moodboard_image',
    scenario: '5-Sigma Core Botanical Craft',
    description: 'Organic heritage sage, sun-baked terracotta, woven unbleached linen grain, delicate serif display.',
    html: buildWarmBotanicalAtelierHtml(),
    fallbackPalette: ['#F2ECE1', '#5D6E59', '#C46B48', '#222821'],
  },
];

async function loadPuppeteer() {
  try {
    const backendRequire = createRequire(path.join(REPO_ROOT, 'backend/package.json'));
    return backendRequire('puppeteer');
  } catch {
    return null;
  }
}

export async function generateAllFixtures() {
  await fs.mkdir(CHAOS_DIR, { recursive: true });
  const puppeteer = await loadPuppeteer();
  let browser = null;
  let renderer = 'puppeteer-chromium';

  if (puppeteer) {
    try {
      const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
      browser = await puppeteer.launch({
        headless: true,
        executablePath: execPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (err) {
      console.warn(`⚠️  Puppeteer launch failed (${err.message}); falling back to pure-Node PNG encoder.`);
      renderer = 'pure-node-fallback';
    }
  } else {
    console.warn('⚠️  backend/node_modules/puppeteer not found; using pure-Node PNG encoder.');
    renderer = 'pure-node-fallback';
  }

  const manifestEntries = [];

  try {
    const page = browser ? await browser.newPage() : null;
    if (page) {
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    }

    for (const spec of FIXTURE_SPECS) {
      const t0 = Date.now();
      if (page) {
        await page.setContent(spec.html, { waitUntil: 'load' });
        await page.screenshot({ path: spec.outputPath, type: 'png' });
      } else {
        const pngBuf = encodeFallbackPng(WIDTH, HEIGHT, spec.fallbackPalette);
        await fs.writeFile(spec.outputPath, pngBuf);
      }
      const stat = await fs.stat(spec.outputPath);
      const relPath = path.relative(FIXTURES_DIR, spec.outputPath);
      manifestEntries.push({
        id: spec.id,
        file: relPath,
        modality: spec.modality,
        scenario: spec.scenario,
        description: spec.description,
        bytes: stat.size,
        dimensions: { width: WIDTH, height: HEIGHT },
      });
      console.log(`✅ Generated ${relPath} (${(stat.size / 1024).toFixed(1)} KB, ${Date.now() - t0}ms via ${renderer})`);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  const manifestPath = path.join(FIXTURES_DIR, 'manifest.json');
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        renderer,
        count: manifestEntries.length,
        fixtures: manifestEntries,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  console.log(`\n📦 Fixture manifest written to ${path.relative(REPO_ROOT, manifestPath)} (${manifestEntries.length} PNGs ready).`);
  return manifestEntries;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateAllFixtures().catch((err) => {
    console.error('❌ Fixture generation failed:', err);
    process.exit(1);
  });
}
