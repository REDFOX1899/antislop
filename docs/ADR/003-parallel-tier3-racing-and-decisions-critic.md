# ADR-003: Parallel Best-of-N Tier 3 Candidate Racing + Calibrated `gemini-decision-1` Visual Critic

- **Status:** Accepted
- **Date:** 2026-11-21
- **Context:** We have **Tier 3 Gemini API billing** on `gemini4nyc26nyc-2215` (with two active Tier 3 keys). Single-shot frontend generation often lands in a local aesthetic minimum; meanwhile, asking a generative LLM to "grade its own UI from 1 to 10 in JSON" produces uncalibrated, sycophantic 8/10 scores and burns seconds generating verbose output tokens.

## Decision
1. **Parallel Best-of-N Racing (`N=3`):** After `gemini-4-carbon` extracts the `DesignManifest`, we dispatch **3 parallel code-generation candidates** on `gemini-4-neon` with distinct layout/typographic interpretations (e.g., *Editorial Print*, *Architectural Precision*, *Tactile Studio*) plus parallel bespoke hero/texture generation via `gemini-nano-banana-2.1`.
2. **Single-Pass Calibrated Taste Critic (`gemini-decision-1`):** Each candidate is rendered in headless Chromium via Puppeteer (desktop + mobile) with a deterministic DOM audit (overflow, text overlap, broken images, console errors), then scored in **~200ms (`0` output tokens)** across **12 independent `score`, `noul`, and `choice` probes** against the original raw moodboard.
3. **Mathematical Convergence Tracking (`gemini-embedding-2`):** Compute multimodal cosine similarity between the moodboard embedding and each iteration's live rendered screenshot.
4. **Autonomous Self-Refinement Loop (`gemini-4-hydrogen`):** The highest-scoring candidate wins the race and hot-reloads into `/target-repo`. If any gate fails (`slop_penalty > 3`, `aesthetic_match < 7.5`, `layout_broken > 0.35`, `contrast_failing > 0.35`, or DOM audit defects), `gemini-4-hydrogen` applies targeted surgical fixes using the `primary_defect_class` and DOM telemetry until all gates pass or `maxIterations` is reached.

## Consequences
- Maximizes Tier 3 concurrency for visibly higher design quality in under 30 seconds.
- Eliminates sycophantic LLM self-grading with true calibrated probabilities (`gemini-decision-1`) + deterministic DOM checks.
