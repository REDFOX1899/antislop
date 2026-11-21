# AntiSlop Stage & Video Demo Playbook

> **Presenter:** Shantanu Patil (`@REDFOX1899`) · **Event:** Gemini 4 NYC Hackathon (Nov 21, 2026)  
> **Target Tracks:** **Element 119** (Multimodal Core & Decisions API) · **5 Sigma** (Empirical Reliability vs. Baseline) · **$5K Managed Agents** (`antigravity-preview-09-2026`)  
> **Core Pitch in One Breath:** *"English prose is a lossy compression codec for visual taste — that's why every AI coding assistant outputs purple-gradient slop. AntiSlop replaces text guesswork with raw multimodal references, freehand circle-and-speak editing, sub-300ms calibrated `gemini-decision-1` grading, and an Antigravity Managed Agent that ships verified builds back to your real GitHub repo."*

---

## 1. Pre-Demo 60-Second Checklist

Run this exact checklist **2 minutes before recording or stepping on stage**:

### A. URLs & Failover Stack (Keep Both Ready)
| Role | Live Production (Primary) | Local Backup (Instant Zero-WiFi Failover) |
| :--- | :--- | :--- |
| **AntiSlop Studio UI** | [`https://portfolio-starter-livid-pi.vercel.app`](https://portfolio-starter-livid-pi.vercel.app) *(domain: `antislop.live`)* | `http://localhost:3000` |
| **AntiSlop Engine + Vite HMR** | [`https://antislop-engine-a53petnlfa-uc.a.run.app`](https://antislop-engine-a53petnlfa-uc.a.run.app) *(Cloud Run `4 vCPU / 8 GiB`, `min-instances=1`)* | `http://localhost:4000` |
| **Health Endpoint** | `https://antislop-engine-a53petnlfa-uc.a.run.app/api/health` | `http://localhost:4000/api/health` |
| **Live GitHub Demo Repo** | `https://github.com/REDFOX1899/personal-website` | Pre-cloned in `backend/.workspaces/` |
| **AntiSlop Source Repo** | `https://github.com/REDFOX1899/antislop` | `/Users/shantanu/Desktop/Gemini 4 NYC Hackathon` |

### B. Automated 8-Second Pre-Flight Verification
Run the functional E2E test right before going up — it checks `/api/health` (dual Tier-3 keys), switches all 3 built-in workspaces, tests live URL capture + SSRF `400` guard, connects `REDFOX1899/personal-website`, verifies `/styles.css`, `/app.js`, `/assets/butterfly.mp4` (`200 OK`) with `0` console errors / `0` broken images, tests `GET /api/files` & `GET /api/github/repos`, resets baseline, and leaves **`novaflow-slop`** active in pristine demo state:

```bash
# Local failover verification (~8s)
node scripts/functional-e2e-test.mjs --url=http://localhost:4000

# Cloud Run production verification
node scripts/functional-e2e-test.mjs --url=https://antislop-engine-a53petnlfa-uc.a.run.app
```

### C. Browser & Hardware Sanity Checks (30 Seconds)
- [ ] **Green status dot** next to `AntiSlop` in TopBar (`backendHealthy === true`, `viteReady === true`).
- [ ] **Active workspace reset to `NovaFlow AI` (`novaflow-slop`)** so judges first see the unmistakable purple-gradient AI-slop baseline (`Slop = 9.09/10`).
- [ ] **Speed Mode** set to **`⚡ Fast Demo`** (`~35s` single-pass fused `gemini-4-hydrogen`) for live stage; switch to **`🧠 Deep Atelier`** only when explaining parallel `N=3` `gemini-4-neon` + `gemini-4-carbon` architecture.
- [ ] **Microphone + Webcam permissions** pre-granted in Chrome (`chrome://settings/content/microphone` & `camera` → Allow for both Vercel URL and `localhost:3000`).
- [ ] **Physical prop within arm's reach** (magazine cover, hardcover book, coffee bag, or postcard) for the live webcam taste capture moment.
- [ ] **4 Browser Tabs pre-opened cleanly** (Do Not Disturb ON, bookmarks bar hidden, 100% browser zoom):
  1. **Tab 1:** AntiSlop Studio (`LandingHub` → click into `Studio` with `NovaFlow AI` loaded)
  2. **Tab 2:** Backup local AntiSlop Studio (`http://localhost:3000`)
  3. **Tab 3:** `https://github.com/REDFOX1899/personal-website` (proves it's a real public repo, not a toy mock)
  4. **Tab 4:** `https://github.com/REDFOX1899/antislop/blob/main/benchmarks/results/REPORT.md` (raw empirical 5-Sigma tables ready if a judge zooms in)

---

## 2. 1-Minute Submission Video Shot-by-Shot Script (`0:00 – 1:00`)

> **Pacing Rule:** Zero slide decks. 100% live screen recording + voiceover (~155 words total). Cut dead wait times smoothly with speed-ramp indicators (`⚡ 35s live run`) so every second shows real pixels, real telemetry, and real code.

| Time | Visual / Screen Action | Voiceover Script (Read Crisp & Calm) | On-Screen Callout |
| :--- | :--- | :--- | :--- |
| **`0:00 – 0:08`** | Open on **AntiSlop Studio** (`NovaFlow AI` workspace). Slowly hover across the glowing indigo/purple cards while the right rail flashes the baseline score: **`Slop 9.09 / 10` · `Taste 13.8 / 100`**. | *"Ask any AI coding assistant to make your app look modern and you get this: purple-gradient AI UI slop — scoring **9.09 out of 10** on our slop detector. Because you cannot describe visual taste in text."* | `NovaFlow AI · Slop 9.09/10` |
| **`0:08 – 0:18`** | Click TopBar repo pill → switch to real GitHub repo **`REDFOX1899/personal-website`** (live editorial portfolio with the animated **colored diamond-halftone butterfly** rendering cleanly via `/assets/butterfly.mp4` + `app.js`). | *"Meet **AntiSlop** — a multimodal frontend engine built on **Gemini 4**. Connect any real GitHub repo — here's my actual live personal website with its diamond-halftone butterfly canvas shader."* | `Live GitHub Repo · 0 Console Errors` |
| **`0:18 – 0:30`** | Click **Draw Circle**, sketch a crisp freehand circle right around the **butterfly artwork**, hit **Mic** (`gemini-3.5-transcribe`), and say: *"Transform this butterfly into a prowling cobalt tiger inside the exact diamond-halftone shader."* Hit **Apply** (`gemini-nano-banana-2.1` + `gemini-4-hydrogen`). | *"No text guessing. I circle the butterfly directly on the live app and speak. **`gemini-3.5-transcribe`** captures my intent, **`gemini-nano-banana-2.1`** generates bespoke high-contrast tiger artwork, and **`gemini-4-hydrogen`** rewrites the canvas shader."* | `Circle-to-Tweak · Nano Banana 2.1 + Hydrogen` |
| **`0:30 – 0:40`** | Watch the **Cobalt arrival sweep** transform the live canvas: the butterfly seamlessly becomes a **Diamond-Halftone Tiger** with organic prowling motion! Click **`</> Diff`** to reveal the exact surgical `app.js` + `/assets/antislop-art-*.jpg` code diff and clean **Before / After** wipe. | *"Seconds later — live in the iframe — our butterfly is now an animated **diamond-halftone tiger** preserving every pixel of the site's shader. Open **`</> Diff`** and you see the exact surgical code edit."* | `Butterfly → Diamond-Halftone Tiger · </> Diff` |
| **`0:40 – 0:51`** | Click **`5-Sigma Proof`** (`SigmaArena`). Highlight the empirical table from `benchmarks/results/REPORT.md`: Control **`0%` pass (`13.8` Taste, `9.09` Slop)** vs. AntiSlop V2 **`100%` pass (`99.5` Taste, `+85.7` pts, Cohen's *d* = `38.30`, `2.38` Slop, `35.1s`)** + **Element 119 Chaos (`2/2` PASS, `100.0` Taste)**. | *"We didn't guess reliability — we proved it with **`gemini-decision-1`** scoring 12 calibrated probes in under 300 milliseconds. Against text prompting's **0% pass rate**, AntiSlop hits **100% pass** — jumping from **13.8 to 99.5 Taste** across unseen styles and hostile chaos stress tests."* | `5-Sigma: 0% → 100% Pass · +85.7 Taste (d=38.30)` |
| **`0:51 – 1:00`** | Switch to **`Managed Agent`** tab (`antislop-repo-surgeon` on `antigravity-preview-09-2026`). Show the live remote Linux sandbox stream cloning the repo, applying the verified manifest, and passing the **`npm run build` exit code 0** verification gate, then flash `antislop.live`. | *"Finally, our custom **Antigravity Managed Agent** clones the repo in a remote Linux sandbox, verifies `npm run build`, and ships clean production code. Stop prompting vibes — ship real taste with **AntiSlop**."* | `Antigravity Managed Agent · npm run build = 0` |

---

## 3. 3-Minute Live Round-1 & Final-Stage Demo Script

> **Golden Rule for Live Judges:** Judges explicitly reward **unrehearsed live inputs** and penalize canned scripts. Structure your 3 minutes as: **Hook (25s) → Live Unrehearsed Judge Challenge (75s) → Live Real-Repo Butterfly→Tiger Surgical Swap (40s) → 5-Sigma Proof + Managed Agent Ship (40s).**

### Act I — The Hook & Origin Story (`0:00 – 0:25`)
1. **Show `NovaFlow AI` live on the Studio canvas** (`novaflow-slop`).
2. **Say:**
   > *"I built AntiSlop out of real frustration while building my own site `shantanu-patil.com` inspired by `connorhyatt.com`. Every time I tried to describe spacing, typography, or a floating hero butterfly in a coding chat, it took 15 minutes per tweak — and naive text prompting gives you this: **NovaFlow AI**, classic purple-gradient slop scoring **9.09 out of 10** on AI slop."*
3. Point quickly to the 3-column `2 : 9 : 2` spatial layout: **Left** = Raw Multimodal Taste Inputs (URL Snap, Moodboards, Motion Video, Webcam), **Center** = Live Editable HMR Canvas, **Right** = Gemini 4 Director + 12-Probe **`gemini-decision-1`** Critic.

### Act II — Live Unrehearsed Judge Challenge (`0:25 – 1:40`)
4. **Look straight at the judges and ask:**
   > *"To prove nothing is canned: **name any public website you love the design of — or hand me any physical book, badge, or coffee cup to hold up to the webcam.**"*
5. **Execute the judge's live pick immediately:**
   - **Path A (Judge names a website — e.g., `stripe.com`, `linear.app`, `connorhyatt.com`, `are.na`, `nytimes.com`):**
     - Paste their URL into **Reference URL Snap** (`POST /api/reference/capture-url`).
     - In **~5 seconds**, Puppeteer captures a live 1440×900 JPEG **and** extracts real computed CSS DNA (display font, body font, background hex, ink hex, corner radii, animation detection).
     - *(Bonus security note if relevant: "It's SSRF-hardened — loopback/metadata IPs return HTTP 400.")*
   - **Path B (Judge holds up a physical object / magazine / badge):**
     - Click **Webcam Shutter**, snap the object live — even tilted or under harsh tungsten room lighting (our Element 119 stress test proved `100.0` Taste even at `-11.5°` tilt & ISO-3200 glare!).
6. **Hit `Transform` (`⚡ Fast Demo` — ~35 seconds live):**
   - **While it runs (talk over the live SSE stream — zero awkward silence!):**
     - Point to the live pipeline chips firing in real time:
       1. **`gemini-4-hydrogen`** (Single-Pass Fast Fusion in `fast_demo`, or **`gemini-4-carbon` high-thinking + 3× parallel `gemini-4-neon`** in `deep_atelier`) fuses the raw reference pixels + computed CSS hex tokens directly into React/Tailwind code.
       2. **Vite HMR** hot-swaps the real running app inside the iframe (`zero flicker` double-buffered reload).
       3. **Headless Puppeteer** captures the rendered DOM + runs deterministic audits (`horizontalOverflowPx`, `overlappingTextNodes`, `brokenImageCount`, `consoleErrorCount`).
       4. **`gemini-decision-1`** (`v1beta`, `0` output tokens, `~250ms`) evaluates **12 calibrated visual probes** in parallel with **`gemini-embedding-2`** multimodal cosine similarity!
   - **Arrival Moment (~35s):** The Cobalt reveal sweep uncovers the newly styled `NovaFlow AI` app live. Drag the **Before / After wipe** and call out the live `Slop` drop + `Taste` jump + `0` DOM errors!

### Act III — Real GitHub Repo Surgical Swap: Butterfly → Diamond-Halftone Tiger (`1:40 – 2:20`)
7. **Switch workspace in the TopBar pill to `REDFOX1899/personal-website`** (real vanilla HTML/CSS/JS GitHub repo, proving AntiSlop works beyond React/Vite templates).
8. **Say:**
   > *"Whole-page restyling is step one. Real engineering needs pixel-targeted surgical edits on existing production repos. Watch what happens on my actual personal site."*
9. **Draw a freehand circle directly over the animated diamond-halftone butterfly** (`assets/butterfly.mp4` rendered through `app.js`'s diamond-halftone shader).
10. **Hold the Mic (`gemini-3.5-transcribe`) and say:**
    > *"Transform this butterfly into a prowling cobalt tiger inside the exact diamond-halftone shader."*
    - *(If the room is loud, type the 1-line note directly on the circle pin or show the already-captured diff cleanly if running tight on time — never let room noise stall the clock!)*
11. **Show the result + click `</> Diff`:**
    - **`gemini-nano-banana-2.1`** synthesizes bespoke high-contrast cobalt/charcoal tiger artwork saved into `/assets/`.
    - **`gemini-4-hydrogen`** surgically updates `app.js` so the existing diamond-halftone canvas shader samples the new tiger with organic prowling scale/drift motion — leaving typography, nav, and layout untouched!
    - Open **`</> Diff`** to show the exact line-level code delta.

### Act IV — 5-Sigma Proof, Honest Breaking Points & Managed Agent Close (`2:20 – 3:00`)
12. **Click `5-Sigma Proof` (`SigmaArena`):**
    > *"We benchmarked 8 automated trials from the exact same reset baseline. Naive text prompting scored **0 out of 3 passes — 13.8 Taste, 9.09 Slop**. Our V1 multimodal pipeline jumped to **60.4 Taste**, but exposed three honest breaking points: 136-second latency, an overly strict `0.25` contrast cutoff rejecting an 80-point Swiss winner, and earthy palette drift. In V2 we fused single-pass Hydrogen, parallelized Decisions + Embedding-2, calibrated the contrast gate to `0.45`, and added live computed CSS hex enforcement. Result: **100% pass rate (5/5)**, **99.5 Taste (+85.7 pts, Cohen's d = 38.30)**, **3.9× speedup to 35.1s**, and **2/2 passes** on hostile 4-way conflicting chaos & dim tilted glare webcam inputs."*
13. **Click `Managed Agent` (`antislop-repo-surgeon`):**
    > *"And to ship safely, our named **Antigravity Managed Agent** (`antigravity-preview-09-2026`) clones the target GitHub repo inside a Google-hosted remote Linux sandbox, applies the verified design manifest, and gates delivery on `npm run build` exiting zero — or opens a real GitHub PR directly. Thank you — happy to take any stress-test questions!"*

### Emergency Live-Demo Recovery Moves (If Wi-Fi or Live API Hiccups)
- **Wi-Fi drops on Vercel/Cloud Run:** Immediately Cmd+Tab to **Tab 2 (`http://localhost:3000`)** backed by local `localhost:4000` (already verified `8/8 PASS`).
- **Noisy room blocks mic:** Click the circle's inline note field and type *"Replace butterfly with prowling tiger inside diamond halftone shader"* — identical pipeline!
- **A live transform runs >45s:** Keep narrating the live SSE token/critic stream, then pivot cleanly to `5-Sigma Proof` tab while the iframe updates in the background, and snap back to show the finished Cobalt sweep!

---

## 4. Top 10 Judge Q&A Rapid-Fire Cheat Sheet

> Every number below is verified verbatim from [`benchmarks/results/REPORT.md`](../benchmarks/results/REPORT.md), [`docs/BREAKING_POINTS.md`](BREAKING_POINTS.md), and [`docs/BUILD_LOG.md`](BUILD_LOG.md). Never exaggerate or invent metrics!

### Q1. *"How is this NOT just a Gemini wrapper prompting React code?"*
- **Answer:** A wrapper takes text and hopes the code looks decent. AntiSlop is a **closed-loop multimodal visual compiler**:
  1. **Raw visual + motion + audio ingestion** (moodboard PNGs, live URL screenshot + computed CSS DNA, webcam frames, voice via `gemini-3.5-transcribe`, and freehand canvas circle overlays composited onto screenshots).
  2. **Multi-model Gemini 4 choreography** across 9 specialized roles (`carbon`, `neon`, `hydrogen`, `argon`, `decision-1`, `nano-banana-2.1`, `embedding-2`, `transcribe`, `antigravity-preview-09-2026`).
  3. **Closed-loop visual + deterministic verification**: headless Puppeteer renders the live HMR app, checks exact DOM overflow/overlaps/broken images/console errors, and grades pixels in `~250ms` via `gemini-decision-1` + `gemini-embedding-2` — automatically rolling back regressions if a refinement degrades the score.

### Q2. *"Why use the Decisions API (`gemini-decision-1`) instead of asking Gemini 4 Carbon to critique the screenshot in JSON?"*
- **Answer:** Three concrete engineering wins:
  1. **Latency & Cost (`0` output tokens):** Evaluating 12 independent probes (`6 score` + `4 noul` + `2 choice`) takes **`~200–310ms`** in a single prefill pass (verified live at `310ms` in our smoke test) vs. 4–8 seconds of generative JSON decoding.
  2. **Calibrated Probabilities, Not Sycophantic Vibes:** `noul` probes return calibrated probabilities (e.g., `contrastFailing = 0.172`, `layoutBroken = 0.082`) with confidence scores, letting us set crisp engineering thresholds and compare N=3 parallel candidates apples-to-apples.
  3. **Parallelizable Gate:** Because `gemini-decision-1` runs on `v1beta` with zero generation overhead, we run it in parallel with `gemini-embedding-2` (`515ms`, 3072 dims) on every single render without blowing our latency budget.

### Q3. *"Walk us through your 5-Sigma benchmark — how do you know it actually beats baseline?"*
- **Answer:** In [`benchmarks/results/REPORT.md`](../benchmarks/results/REPORT.md), every trial resets `novaflow-slop` via `POST /api/snapshot/reset` so Control and Treatment start from the exact identical slop baseline across 3 unseen styles (`Swiss Editorial Print`, `Brutalist Tokyo Poster`, `Warm Botanical Atelier`):
  - **Control (`text_baseline`):** **`0/3` pass (`0.0%`)** · Taste **`13.8/100`** · Slop **`9.09/10`** · Match **`1.52/10`** · Embed-2 **`0.554`** (and 1 of 3 trials crashed JSON code extraction outright).
  - **AntiSlop V2 (`fast_demo`):** **`3/3` PASS (`100.0%`)** on Iteration 1 · Taste **`99.5/100`** (**`+85.7` pts**, **Cohen's *d* = `38.30`**) · Slop **`2.38/10`** (**`-6.71`**) · Match **`8.88/10`** (**`+7.35`**) · Embed-2 **`0.739`** (**`+0.185`**) · **`35.1s`** mean latency · **`0`** DOM/console/image defects.

### Q4. *"Element 119 asks: how far did you push it before it broke, and what did you change?"*
- **Answer:** Our V1 benchmark (`1:23–1:33 PM ET`) exposed **3 real breaking points** documented in [`docs/BREAKING_POINTS.md`](BREAKING_POINTS.md):
  1. **Latency SLA Breach:** V1 `fast_demo` averaged **`136.7s`** (`124.7–144.2s`) because it ran sequential `carbon` → 2× coder loops → serialized scoring. **V2 Fix:** Single-Pass Fast Fusion on `gemini-4-hydrogen` (`thinking_level: "low"`) + parallel `decision-1` & `embedding-2` → dropped to **`35.1s` (3.9× speedup)**.
  2. **False-Positive Contrast Gate:** On Swiss Editorial Print, an **`80.0/100`** winner (`Match 8.57`, `Slop 2.65`) was rejected at `contrastFailing = 0.273` against an over-strict `0.25` cutoff, burning 60 extra seconds. **V2 Fix:** Recalibrated `noul` boundary `0.25 → 0.45` + explicit WCAG AA (`>=4.5:1` body, `>=3:1` display) directive in the coder prompt → V2 Swiss hit **`100.0/100` (`contrastFailing = 0.153`)**.
  3. **Earthy Palette Drift:** Warm Botanical Atelier stalled at **`37.7/100`** (`Slop 5.07`) because muted linen/sage/terracotta drifted back toward neutral SaaS slate. **V2 Fix:** Live computed-CSS DNA extractor + explicit palette hex enforcement → jumped **`37.7 → 98.5/100` (`+60.8` pts)**!

### Q5. *"Where does your system STILL fail today? Be completely honest."*
- **Answer:** Four real limits we observed in V2 and logged verbatim in `docs/BREAKING_POINTS.md`:
  1. **`<25s` Stretch SLA vs. `35.1s` Actual:** Rewriting 3–4 full source files in `fast_demo` averages `35.1s` (~10s above our stretch `25s` goal). Getting under 15–20s requires AST/unified-diff patching instead of full-file emission.
  2. **`deep_atelier` Stress Latency (`190.8s – 276.5s`):** Running high-thinking `carbon` + `nano-banana-2.1` art + 3× parallel `neon` + sequential Puppeteer captures takes 3–4.5 minutes — which is why we explicitly split **`⚡ Fast Demo (~35s)`** vs **`🧠 Deep Atelier`**.
  3. **Tactile Organic Grain Without Generated Art:** When `nano-banana-2.1` is toggled off in `fast_demo` for speed, `Warm Botanical Atelier` still had `slopPenalty = 3.04` and flagged `primaryDefectClass = broken_or_missing_imagery` because pure CSS cannot replace photographic linen/botanical textures.
  4. **Complex Monorepos / Custom Auth Builds:** Our sandbox handles standard Vite/React/Next/static repos (`index.html` + CSS/JS) cleanly, including root-relative asset bridging, but private monorepos needing custom env secrets or multi-service Docker Compose aren't auto-booted yet.

### Q6. *"How did it handle truly hostile Element 119 multimodal inputs?"*
- **Answer:** We built two intentionally brutal Element 119 stress fixtures and ran them live in `deep_atelier`:
  - **4-Way Conflicting Chaos Set** *(Swiss Minimal + Neon Cyberpunk + Earthy Ceramic + CAD Blueprint simultaneously)*: Passed on Iteration 1 with **Taste `100.0`**, **Slop `1.37`**, **Match `9.30`**, **Typography `9.28`** (`190.8s`). Instead of muddy averaging, `gemini-4-carbon` arbitrated a strict structural hierarchy (`Kiln, Rag & Caliper` — Swiss macro spacing + ceramic warmth + blueprint gridlines).
  - **Dim `-11.5°` Tilted ISO-3200 Tungsten Glare Webcam Magazine**: Passed on Iteration 1 with **Taste `100.0`**, **Slop `1.80`**, **Match `8.93`**, **Typography `9.05`** (`276.5s`), normalizing the warm glare cast into `Monolith Plaster & Alabaster` with `0` DOM defects.

### Q7. *"Why route across so many Gemini 4 models instead of using `gemini-4-carbon` for everything?"*
- **Answer:** Each model solves a distinct latency/reasoning/modality bottleneck — and our dual Tier-3 key pool round-robins concurrent calls:
  - **`gemini-4-carbon` (`thinking_level: "high"`):** Deep multimodal synthesis & conflict arbitration for `DesignManifest` (`deep_atelier`).
  - **`gemini-4-neon` (`thinking_level: "high"`):** Fast frontier coding spawned **3× in parallel** for Best-of-N architectural racing.
  - **`gemini-4-hydrogen` (`thinking_level: "low" | "medium"`):** Single-pass fast fusion (`~35s`) and surgical Circle-to-Tweak code edits.
  - **`gemini-nano-banana-2.1` (`v1beta`):** Multi-reference image synthesis & targeted artwork swaps (e.g., butterfly → cobalt tiger).
  - **`gemini-decision-1` (`v1beta`) + `gemini-embedding-2`:** Sub-300ms calibrated scoring + 3072-dim multimodal cosine convergence.
  - **`gemini-3.5-transcribe`:** Zero-keyboard voice art direction.

### Q8. *"Tell us about your Antigravity Managed Agent ($5,000 Track) — what does it actually do?"*
- **Answer:** Using the official `v1beta` Managed Agents API (`client.agents.create` with base model `antigravity-preview-09-2026`), we register a custom named agent **`antislop-repo-surgeon`** running in a Google-hosted remote Linux sandbox (`environment: "remote"`).
  - When a user clicks **Ship via Managed Agent**, our backend streams live `ManagedAgentEvent` updates over SSE (`POST /api/managed-agent/ship?stream=true`): `agent_created` → `sandbox_ready` → `tool_call` → `hook_verify` → `completed`.
  - Inside the remote Linux sandbox, the agent clones the target GitHub repo, applies the verified `DesignManifest` and scorecard-passing changes, and enforces a **deterministic `npm run build` verification gate (exit code 0)** before reporting ready to ship. We also support one-click real GitHub Pull Request creation (`POST /api/github/pr`).

### Q9. *"How does Circle-to-Tweak actually map a hand-drawn circle on an iframe to the exact code file?"*
- **Answer:** Three clean engineering steps with zero brittle DOM-selector hacks:
  1. **Retina Canvas Overlay + Compositor:** The user sketches freehand circles over the live iframe; `LiveCanvas` exports a transparent PNG overlay + normalized `[0..1]` bounding boxes (`DrawnCircleAnnotation[]`), and our backend composites the circles directly onto the live Puppeteer screenshot.
  2. **Visual + Source Grounding:** `gemini-4-hydrogen` receives BOTH the annotated screenshot (literally seeing the drawn circle around the butterfly or hero section), the transcribed voice instruction (`gemini-3.5-transcribe`), and the workspace's editable source files (`index.html`, `styles.css`, `app.js`, etc.).
  3. **Targeted Artwork Pipeline:** When a subject/artwork swap is detected (like *"butterfly into tiger"*), `gemini-nano-banana-2.1` first generates high-contrast cobalt/charcoal art saved into the repo's `/assets/` or `/public/generated/`, and `gemini-4-hydrogen` wires it cleanly into the existing canvas shader or JSX component — preserving everything outside the circle.

### Q10. *"How did you architect deployment so Vite HMR, Puppeteer, and static GitHub repos all work live in production?"*
- **Answer:** Hybrid production topology built specifically to avoid serverless cold-start/WebSocket traps:
  - **Frontend (`studio/`):** Next.js 15.5 deployed on **Vercel** (`https://portfolio-starter-livid-pi.vercel.app`), ultra-minimal Google Cobalt Obsidian Spatial UI.
  - **Engine (`backend/`):** Express 5 + embedded Vite HMR reverse proxy (HTTP + WebSocket upgrades on `/preview/`) + persistent headless Chromium Puppeteer + static root-asset bridge (serving `/styles.css`, `/app.js`, `/assets/*` cleanly for vanilla cloned repos with strict dotfile/`.git` security guards) deployed on **Google Cloud Run** (`https://antislop-engine-a53petnlfa-uc.a.run.app`, `4 vCPU / 8 GiB`, `--min-instances=1`, `--no-cpu-throttling`, `--session-affinity`).
  - **Security & Observability:** SSRF IP/DNS guard blocks all RFC1918/loopback/metadata URLs (`400`), all secrets stay strictly in gitignored `env/.env` / Cloud Run env vars, and optional non-blocking LangSmith tracing records every Gemini 4 call.
