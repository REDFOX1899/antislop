# AntiSlop 🎨⚡
> **Taste-Driven Real-Time Frontend Editor & Self-Refining Design Critic Loop**  
> 🌐 **Live Custom Domain (Vercel Production):** [`https://ui-ux.fun`](https://ui-ux.fun) (fallback: [`https://portfolio-starter-livid-pi.vercel.app`](https://portfolio-starter-livid-pi.vercel.app))  
> ☁️ **Live Engine & Vite HMR Preview (Google Cloud Run):** [`https://antislop-engine-a53petnlfa-uc.a.run.app`](https://antislop-engine-a53petnlfa-uc.a.run.app)  
> Built for the **Gemini 4 NYC Hackathon** (November 21, 2026)  
> *Target Tracks: Element 119 (Multimodal Core) · 5 Sigma (Reliability & Baseline Evaluation) · Best Use of Managed Agents*

---

## 💡 The Problem: The "AI UI Slop" Epidemic
Every modern AI coding assistant (Claude, GPT, Gemini) produces **AI UI Slop**:
- Generic purple/indigo gradients
- Boxy, claustrophobic card grids with identical drop shadows
- Lifeless, stock-looking layouts devoid of visual rhythm or editorial craft

**Why does this happen?** Because **you cannot describe visual taste, typography rhythm, color warmth, or micro-interaction feel in text prompts.** Plain text like *"make it look luxury and modern"* collapses infinite visual nuances into a generic statistical average.

---

## ⚡ The Solution: AntiSlop
AntiSlop is a real-time multimodal frontend development engine that replaces text prompt guessing with **raw visual taste** and an **autonomous self-critique loop**.

### 1. Raw Multimodal Taste Input (Zero Text Guesswork)
Feed in what you actually love:
- 🖼️ **Moodboard Screengrabs:** Drop 3–8 Pinterest, Dribbble, or editorial print screenshots.
- 🎥 **Interaction & Motion Video:** Upload or record screen footage of buttery UI animations and hover states.
- 📷 **Physical World Webcam:** Hold up a physical magazine, typography book cover, or poster to your webcam.
- 🎙️ **Live Voice Guidance:** Speak naturally (*"Keep our current component structure, steal the editorial typography and warmth from reference #1, and match the snappy button hover from the video"*).

### 2. Multi-Model Gemini 4 Engine
AntiSlop coordinates multiple specialized Gemini 4 models, each with a defined role:
- **`gemini-4-carbon` (Frontier Reasoning & Design Director):** Analyzes the raw visual inputs, interaction videos, and audio. Extracts high-fidelity design tokens (chromatic palettes, typographic scales, fluid spacing rhythm, animation easing, and texture recipes).
- **`gemini-4-hydrogen` (Fast Execution Code Engine):** Rewrites real React/Tailwind components in the target repo in milliseconds and triggers Vite Hot Module Replacement (HMR).
- **`gemini-decision-1` (Decisions API Taste Critic):** Puppeteer captures a high-resolution screenshot of the rendered live app. The Decisions API executes sub-250ms closed-set rubric evaluations comparing the live app against the original moodboards:
  - `slop_penalty` (score 0–10): Detects generic AI clichés (purple gradients, unrefined drop shadows, cramped cards).
  - `aesthetic_match` (score 0–10): Evaluates alignment with the reference moodboard's warmth, typography, and hierarchy.
  - `layout_broken` (noul/boolean): Verifies structural integrity, contrast legibility, and clipping.
  - `needs_refinement` (noul/boolean): Automatically commands Carbon/Hydrogen to fix defects until the design meets the bar.

---

## 📊 Evaluation & Baseline (5 Sigma Empirical Proof)
We ran an automated 8-trial controlled benchmark ([`benchmarks/results/REPORT.md`](benchmarks/results/REPORT.md)) testing unseen aesthetics + hostile Element 119 stress inputs against the identical `NovaFlow AI` slop baseline, scored in ~250ms by **`gemini-decision-1`** + **`gemini-embedding-2`** + deterministic Puppeteer DOM audits:

| Evaluation Group | Pass Rate | Taste Index (0–100 ↑) | AI Slop Penalty (0–10 ↓) | Aesthetic Match (0–10 ↑) | Typography (0–10 ↑) | Embed-2 Cosine ↑ | Mean Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Control (`text_baseline` — naive prompt)** | `0.0%` (0/3) | **13.8** | `9.09` | `1.52` | `5.62` | `0.554` | `40.6s` |
| **AntiSlop V2 (`fast_demo` — single-pass fused)** | **`100.0%`** (3/3) | **99.5** *(+85.7)* | **`2.38`** *(-6.71)* | **`8.88`** *(+7.35)* | **`8.92`** | **`0.739`** | **`35.1s`** *(3.9× faster than V1)* |
| **Element 119 Chaos Stress Tests** *(4-way conflicting styles + dim tilted glare webcam)* | **`100.0%`** (2/2) | **100.0** | **`1.58`** | **`9.12`** | **`9.16`** | `0.596` | `233.6s` (`deep_atelier` 3× Parallel) |

> Full V1 → V2 engineering iteration and honest remaining breaking points (including `<25s` stretch SLA gap and organic texture tradeoffs) are documented verbatim in [docs/BREAKING_POINTS.md](docs/BREAKING_POINTS.md) and [docs/CASE_STUDY_ORIGIN.md](docs/CASE_STUDY_ORIGIN.md).

---

## 🏛️ System Architecture
```
[ User Multimodal Inputs (AntiSlop Studio) ]
  ├── 🖼️ Moodboard Images (3–14 refs)
  ├── 🎥 Interaction / Motion Videos
  ├── 📷 Physical Webcam (Books, Print, Objects)
  └── 🎙️ Voice Guidance + Circle-to-Tweak Canvas
          │
          ▼
[ Gemini 4 Carbon (Design Director) ] ──> Synthesizes Typed DesignManifest + Conflict Notes
          │
          ├──> [ Nano Banana 2.1 ] ─────> Generates Bespoke Editorial Hero & Surface Art
          │
          ▼
[ Gemini 4 Neon (Parallel Racer x3) ] ──> Produces N=3 Distinct React/Tailwind Candidates
          │
          ▼
[ Embedded Vite HMR + Puppeteer ] ──────> Captures Desktop/Mobile Screenshots + DOM Audit
          │
          ▼
[ Gemini Decision 1 (12-Probe Critic) ] ──> ~200ms Calibrated Taste, Slop & Layout Gate
  + [ Gemini Embedding 2 ] ─────────────> Multimodal Cosine Convergence Tracking
          │
          ├── (Fails Gate) ──> [ Gemini 4 Hydrogen ] Surgical Fix Loop
          └── (Passes Bar) ──> Live HMR Canvas + [ Antigravity Managed Agent ] Remote Repo Ship!
```

---

## 📚 Engineering Documentation (For Judges)
We document every architectural decision, benchmark, failure mode, and parallel build step openly in this repository:

- **[System Architecture](docs/ARCHITECTURE.md)** — Multi-model Gemini 4 choreography, 12-probe `gemini-decision-1` rubric, and Cloud Run + Vercel production topology
- **[Parallel Build Plan](docs/PARALLEL_BUILD_PLAN.md)** — Multi-agent swarm ownership boundaries & hackathon execution schedule
- **[Engineering Build Log](docs/BUILD_LOG.md)** — Timestamped build journal from ideation to live deployment
- **[Design Craft Skill Standard](skills/antislop-design-craft/SKILL.md)** — Swiss typographic, contrast math, modern web & anti-slop engineering rubric injected into Gemini 4 & Managed Agents
- **[Live Demo & Judge Playbook](docs/DEMO_PLAYBOOK.md)** — Pre-demo checklist, 1-min video script, 3-min live flow & Judge Q&A
- **[Breaking Points & Failure Analysis](docs/BREAKING_POINTS.md)** — Honest Element 119 stress-test failures and architectural fixes
- **[Shared Type Contract](shared/types.ts)** — Locked TypeScript API & Decisions Scorecard schema across `/backend`, `/studio`, and `/benchmarks`
- **[Environment Setup](env/README.md)** — How to configure `env/.env` safely (all secrets strictly gitignored)
- **Architecture Decision Records (ADRs):**
  - [ADR-001: Official `@google/genai` SDK vs. LangChain (+ Optional LangSmith)](docs/ADR/001-official-genai-sdk-over-langchain.md)
  - [ADR-002: AntiSlop Studio Canvas IDE vs. Metrics Dashboard](docs/ADR/002-studio-canvas-not-dashboard.md)
  - [ADR-003: Parallel Tier-3 Racing & Calibrated Decisions API Critic](docs/ADR/003-parallel-tier3-racing-and-decisions-critic.md)
  - [ADR-004: Hybrid Cloud Run + Vercel & Antigravity Managed Agents](docs/ADR/004-hybrid-cloud-run-vercel-and-managed-agents.md)

---

## 🛠️ Repository & Team
- **Author:** Shantanu Patil ([@REDFOX1899](https://github.com/REDFOX1899))
- **Event:** Gemini 4 NYC Hackathon (Cerebral Valley & Google DeepMind — Nov 21, 2026)
- **Tracks:** Element 119 · 5 Sigma · Best Use of Managed Agents (`antigravity-preview-09-2026`)
- **License:** MIT
