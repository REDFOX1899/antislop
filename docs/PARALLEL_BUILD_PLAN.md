# Parallel Multi-Agent Build Plan

> **Hackathon Window:** 12:30 PM – 5:00 PM ET (4.5 hours to submission).  
> **Strategy:** Lock the shared interface contract ([shared/types.ts](../shared/types.ts)) first, then fan out **6 parallel specialized engineering agents** across cleanly isolated directory boundaries with **zero file overlap**, followed by live integration, 5-Sigma benchmarking, and production deployment.

---

## Agent Swarm Topology & Ownership Boundaries

| Agent ID | Owned Directory / Files | Core Deliverables | Dependencies |
| :--- | :--- | :--- | :--- |
| **`agent-target-app`** | `target-repo/**` | Rich multi-section Vite + React + Tailwind v4 baseline app ("NovaFlow AI" — intentionally packed with classic AI UI Slop: purple gradients, generic glowing bento cards, Inter defaults, stock placeholder cards) with clean modular files (`src/App.tsx`, `src/index.css`, `src/styles/tokens.css`, `src/components/*`) so surgical edits & HMR hot-reload instantaneously. | None (starts immediately) |
| **`agent-gemini-core`** | `backend/src/gemini/**` | Official `@google/genai` (>=3.6.1) dual-key Tier 3 pool + `director.ts` (`gemini-4-carbon`), `coder.ts` (`gemini-4-neon` parallel Best-of-N + `gemini-4-hydrogen` surgical patcher), `critic.ts` (`gemini-decision-1` 12-probe `v1beta`), `assets.ts` (`gemini-nano-banana-2.1`), `embeddings.ts` (`gemini-embedding-2`), `voice.ts` (`gemini-3.5-transcribe`), `managedAgent.ts` (`antigravity-preview-09-2026` Custom Agent + repo sandbox), optional `langsmith` tracing wrapper. | `shared/types.ts` |
| **`agent-sandbox-api`** | `backend/src/sandbox/**`, `backend/src/routes/**`, `backend/src/server.ts`, `backend/package.json` | Express + TypeScript backend, embedded Vite HMR process manager & reverse proxy (`/preview`), snapshot/rollback manager (instant reset to baseline), Puppeteer desktop+mobile screenshotter + deterministic DOM overlap/overflow/console auditor, SSE live event bus, orchestrator loop (`runTransformLoop`, `runBaselineTextOnly`, `runCircleTweak`, `runManagedAgentShip`). | `shared/types.ts` |
| **`agent-studio-ui`** | `studio/**` | **AntiSlop Studio** (Next.js App Router + Tailwind — crafted with crisp, zero-slop editorial industrial studio design!). Live interactive target canvas (65%+ viewport) with **Circle-to-Tweak** overlay, Before/After comparison curtain, floating Multimodal Taste Tray (Moodboard drag-drop, Motion Video uploader, Live Webcam shutter, Live Voice recorder), compact Decisions API 12-probe telemetry rail, Iteration Convergence sparkline, Baseline vs AntiSlop Arena, and Managed Agent GitHub Ship modal. | `shared/types.ts` |
| **`agent-benchmarks`** | `benchmarks/**` | Automated **5-Sigma Evaluation Harness** (`run-eval.ts`) + **Element 119 Stress-Test Suite** (`stress-test.ts`) testing unseen real-world messy inputs (tilted dark photos, 12 conflicting styles, low-contrast traps, chaotic mixed media) comparing Text-Only Baseline vs AntiSlop Critic Loop, generating quantitative Markdown/JSON reports & real breaking-point data into `docs/BREAKING_POINTS.md`. | `backend` API endpoints |
| **`agent-deploy-docs`** | `deploy/**`, `scripts/**`, `README.md` updates | Production Docker container (Node 22 + Chromium + Vite + Backend) for Google Cloud Run (`patilshantanu1899@gmail.com`), `cloudbuild.yaml`, Vercel config for `/studio`, `scripts/dev.sh` one-command local launcher, and final judge-facing documentation polish. | `backend/`, `studio/`, `target-repo/` |

---

## Execution Timeline (12:35 PM – 5:00 PM)

1. **12:35 – 12:45 PM:** Configure `env/.env` with Tier 3 Gemini keys, verify live `gemini-4-carbon`, `gemini-4-neon`, `gemini-4-hydrogen`, `gemini-decision-1`, and `gemini-nano-banana-2.1` smoke test.
2. **12:45 – 1:45 PM:** **Parallel Wave 1** — Launch `agent-target-app`, `agent-gemini-core`, `agent-sandbox-api`, and `agent-studio-ui` simultaneously in isolated workspaces/boundaries.
3. **1:45 – 2:30 PM:** **Integration & Live E2E Smoke Test** — Wire Backend ↔ Vite HMR ↔ Puppeteer ↔ Studio UI; test real moodboard, webcam, video, voice, and Circle-to-Tweak end-to-end; commit & push milestone.
4. **2:30 – 3:30 PM:** **Parallel Wave 2** — Launch `agent-benchmarks` (real 5-Sigma baseline comparisons + Element 119 stress tests to capture genuine failure modes & fixes) AND `agent-deploy-docs` (Cloud Run + Vercel live production deployment + Managed Agents remote repo verification).
5. **3:30 – 4:15 PM:** **Failure-Driven Iteration** — Inspect real failures discovered by `agent-benchmarks`, apply architectural fixes, re-run benchmarks, document exact before/after metrics in `docs/BREAKING_POINTS.md` & `docs/BUILD_LOG.md`.
6. **4:15 – 4:50 PM:** **Polish, 1-Minute Demo Video & Final GitHub Push** — Verify live public URL, public repo completeness, record crisp 1-minute demo video, submit before 5:00 PM hard cutoff.
