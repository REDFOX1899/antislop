# AntiSlop Engineering Build Log

> A transparent, timestamped log of every major engineering milestone, architectural pivot, live test, and benchmark recorded during the **Gemini 4 NYC Hackathon (Nov 21, 2026)** so judges can trace how AntiSlop was conceived and built from scratch.

---

## Timeline

### 10:30 AM – 12:15 PM ET · Problem Discovery & Concept Lock
- Analyzed both Gemini 4 NYC Hackathon tracks (**Element 119** & **5 Sigma**) plus the **$5,000 Managed Agents** bonus track and strict anti-project rules (*no dashboards as main feature, no text-only wrappers, no scripted-only demos*).
- Identified the core insight for Element 119: **visual taste cannot be described in text prompts** — which is why LLM frontends collapse into generic "AI UI Slop".
- Scoped aggressively to cut non-core side ideas (code wiki explainer) and go 100% all-in on **AntiSlop**: Multimodal Taste Capture → Multi-Model Gemini 4 Synthesis & Parallel Code Mutation → Live Vite HMR → `gemini-decision-1` Calibrated Taste Critic Loop → Antigravity Managed Agent remote repo shipping.

### 12:20 PM ET · Phase 0 Complete — Public Repo Initialized
- Created public GitHub repository `https://github.com/REDFOX1899/antislop`.
- Pushed initial architecture README (`2c60168`).

### 12:30 PM ET · Phase 0.5 — System Architecture, ADRs & Locked Interface Contract
- Verified Tier 3 Gemini API access on hackathon project `gemini4nyc26nyc-2215` (dual Tier 3 keys available for concurrent Best-of-N candidate racing & 5-Sigma benchmarks).
- Audited official Gemini 4 API specifications (`@google/genai` >= 3.6.1):
  - `Interactions API` (`v1`) for `gemini-4-carbon`, `gemini-4-neon`, `gemini-4-hydrogen`, `gemini-nano-banana-2.1`.
  - `Decisions API` (`v1beta`, `ai.decisions.create`) for `gemini-decision-1` 12-probe single-pass rubric scoring (0 output tokens).
  - `Managed Agents` (`v1beta`, `antigravity-preview-09-2026` + `client.agents.create`) for remote GitHub repository execution.
- Renamed UI app from `/dashboard` to `/studio` (**AntiSlop Studio**) to ensure the live editable canvas — not a metrics dashboard — is the centerpiece (see [ADR-002](ADR/002-studio-canvas-not-dashboard.md)).
- Created locked shared TypeScript contract in [shared/types.ts](../shared/types.ts) and isolated multi-agent ownership boundaries in [PARALLEL_BUILD_PLAN.md](PARALLEL_BUILD_PLAN.md) to enable conflict-free parallel execution.
- Configured master secret template (`env/.env.example`) with strict `.gitignore` guards.

### 12:50 PM ET · Phase 0.75 — Live 10-Point Gemini 4 & Environment Smoke Test (`10/10 PASS`)
- Bootstrapped `/backend` with official `@google/genai@^3.6.1`, `express`, `puppeteer`, `http-proxy`, `langsmith`, and `tsx`.
- Executed live verification script (`scripts/smoke-test.mjs`) against all Gemini 4 models & external integrations:
  - **Dual Tier-3 Keys (`...1LuQ` & `...b2_8`)**: Both PASS on `gemini-4-hydrogen` (`1.98s` / `2.78s`).
  - **`gemini-4-carbon` (Design Director)**: PASS (`2.72s`).
  - **`gemini-4-neon` (Parallel Code Architect)**: PASS (`2.83s`).
  - **`gemini-decision-1` (`v1beta` Decisions API)**: PASS in **`310ms`** with calibrated probabilities (`is_ai_slop: 0.960`, `slop_level: 1.93/2.0`, `style_class: ai_slop @ 0.998`).
  - **`gemini-embedding-2`**: PASS (`515ms`, `3072` dimensions).
  - **`gemini-nano-banana-2.1` (`v1beta`)**: PASS (`21.4s`, generated `1.04MB` base64 JPEG). *Discovery logged: `response_modalities` requires `apiVersion: "v1beta"`.*
  - **Managed Agents (`v1beta` `agents.list`)**: PASS (`73ms`, accessible).
  - **GitHub Token**: PASS (`421ms`, authenticated as `REDFOX1899`).
  - **LangSmith Service Key (`LANGSMITH_TRACING=true`)**: PASS (`HTTP 202 Run created` after configuring `LANGSMITH_WORKSPACE_ID` via `X-Tenant-Id`).

### 12:56 PM ET · Production Domain Registered — `antislop.live`
- Registered live production domain **`antislop.live`** mid-hackathon to host the public AntiSlop Studio & live Cloud Run engine (`https://antislop.live` → Studio UI, `https://api.antislop.live` → Cloud Run Engine + embedded Vite HMR preview).

### 1:05 PM – 1:21 PM ET · Wave 1 Parallel 5-Agent Swarm Build Complete (`0 Errors`)
- Locked extended shared contract ([shared/types.ts](../shared/types.ts) & [backend/src/gemini/contracts.ts](../backend/src/gemini/contracts.ts)) adding **Voice-Only + Freehand Draw Circles**, **`⚡ Fast Demo (<25s)` vs `🧠 Deep Atelier (4× Parallel)`** execution modes, and **Connect Any GitHub Repo + Open PR**.
- Ran **5 specialized parallel builder agents** concurrently across zero-overlap directory boundaries — all 5 completed and compiled cleanly in 15 minutes:
  1. **`TargetAppsBuilder`**: Built & verified `target-repo` (**NovaFlow AI** classic purple AI-slop SaaS) and `target-templates/shopcraft` (**Kova Goods** generic storefront), both Vite 6 + React 19 + Tailwind v4 iframe-ready (`995ms` / `1.04s` builds).
  2. **`GeminiCoreBuilder`**: Built native `@google/genai@^3.6.1` dual-key Tier 3 engine (`backend/src/gemini/*`) — `gemini-4-carbon`, `gemini-4-argon`, `gemini-4-neon` (Best-of-N parallel racer), `gemini-4-hydrogen` (surgical patcher), `gemini-decision-1` (12-probe single-pass `v1beta`), `gemini-nano-banana-2.1` (`v1beta` multi-ref art), `gemini-embedding-2`, `gemini-3.5-transcribe`, `antigravity-preview-09-2026` Managed Agent (`antislop-repo-surgeon`), and non-blocking LangSmith tracing. Caught & fixed 2 live Gemini 4 API edge cases (`v1` `user_input` step wrapper & Decisions API ASCII question keys).
  3. **`SandboxApiBuilder`**: Built Express 5 server (`backend/src/sandbox/*`, `orchestrator/`, `routes/`), embedded Vite HMR HTTP+WS `/preview/` reverse proxy, GitHub repo cloner & real PR creator (`GITHUB_TOKEN`), persistent headless Chromium Puppeteer auditor + zero-native-dep HTML canvas circle compositor, and SSE event bus.
  4. **`StudioUiBuilder`**: Built **AntiSlop Studio** (`studio/`, Next.js 15.5) with a zero-slop archival editorial aesthetic (`Instrument Serif` + `DM Sans` + `JetBrains Mono`), 65%+ live interactive canvas, retina freehand Draw Circles + Voice-Only mic with Web Audio waveform, accessible Before/After wipe curtain, Webcam shutter, Motion Video dropper, 12-probe Decisions API rail, 4-Way Parallel Race strip, 5-Sigma Arena, Repo Connector modal, and Managed Agent shipper (`next build` compiled in `1.33s`, 0 warnings).
  5. **`BenchmarksDeployBuilder`**: Built 5-Sigma & Element 119 benchmark harness (`benchmarks/run-5sigma.ts`) with 9 rendered real-world stress PNG fixtures (including low-light tilted glare webcam magazine & 4-way conflicting chaos set), production Cloud Run stack (`deploy/Dockerfile`, `cloudbuild.yaml`, `deploy-cloudrun.sh`), and `scripts/dev.sh`.

### 1:23 PM – 1:34 PM ET · V1 Live 5-Sigma Empirical Run & Honest Breaking-Point Discovery
- Ran V1 live trials against `novaflow-slop`:
  - **Text-Only Control Baseline (3 unseen styles):** Averaged **`0.0/100` Taste Index**, **`9.16/10` Slop Penalty**, **`1.28/10` Aesthetic Match**, proving naive text prompting collapses to AI slop.
  - **AntiSlop V1 (`fast_demo`):** Improved to **`80.0/100` Taste (+80.0)**, **`2.65/10` Slop (-6.47)**, **`8.57/10` Aesthetic Match (+7.09)** on Swiss Editorial Print (`0.711` embedding cosine).
- Caught **3 genuine V1 engineering failures** logged in [BREAKING_POINTS.md](BREAKING_POINTS.md): `fast_demo` latency (`124–144s` vs `<25s` target), hyper-strict `0.25` `contrastFailing` gate rejecting an `80/100` render at `0.273`, and subtle palette drift on `Warm Botanical Atelier`.

### 1:35 PM – 1:50 PM ET · Wave 2 Parallel 3-Agent Upgrade Swarm (`0 Errors`)
- **`FastEngineAndUrlCaptureBuilder`**:
  - Implemented Single-Pass Fast Fusion (`runFastSinglePass` on `gemini-4-hydrogen`, `thinking_level: low`) + parallel `gemini-decision-1` & `gemini-embedding-2` scoring + calibrated `0.45` hard-fail gates.
  - Built SSRF-hardened **`POST /api/reference/capture-url`** capturing live website screenshots + computed CSS font/color/radius/motion DNA (`https://www.connorhyatt.com/` captured live in **`5.2s`**: `Libre Baskerville 36px`, `Inter 16px`, `#FFFFFF`, `#171717`, `0px` radius, `Motion: detected`).
- **`Studio292AtelierUpgrader`**:
  - Upgraded **AntiSlop Studio** to minimal editable **`2 : 9 : 2`** proportions (draggable hairline resize + collapsible rails for >88% live canvas).
  - Added Live Reference URL Snap bar (`connorhyatt.com` / `are.na` / any live URL), zero-flicker double-buffered iframe continuity, 1.4s luminous arrival reveal sweep + animated emerald/vermilion fix-glow halos, Continuous Voice + Live Edit Queue (`#1 Active · #2 Queued`), and inline SVG Decisions API Pipeline Graph (`next build` `1.66s`, `0` warnings).
- **`PortfolioDemoAndDocsBuilder`**:
  - Added 3rd instant-switch demo target app (`target-templates/portfolio-starter` — generic AI-slop developer portfolio with animated hero butterfly artwork `data-section="artwork"` + 5 nav sections, built in `1.01s`).
  - Documented real origin story in [CASE_STUDY_ORIGIN.md](CASE_STUDY_ORIGIN.md) and V1 empirical results in [BREAKING_POINTS.md](BREAKING_POINTS.md).

---

*(Subsequent phases will append real commit hashes, live latency metrics, Decisions API calibration logs, and deployment URLs as each parallel wave lands.)*
