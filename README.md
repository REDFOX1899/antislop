# AntiSlop 🎨⚡
> **Taste-Driven Real-Time Frontend Editor & Self-Refining Design Critic Loop**  
> Built for the **Gemini 4 NYC Hackathon** (November 21, 2026)  
> *Target Tracks: Element 119 (Multimodal Core) & 5 Sigma (Reliability & Baseline Evaluation)*

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

## 📊 Evaluation & Baseline (5 Sigma Proof)
AntiSlop includes a built-in **Side-by-Side Baseline Evaluation**:
- **Baseline:** Standard text-only generation (*"Make it modern and aesthetic"*).
- **AntiSlop:** Multimodal extraction + Decisions API autonomous critique loop.
- Quantitative scoring tracks how many automated critic iterations were required to pass the visual threshold.

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
