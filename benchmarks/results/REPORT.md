# AntiSlop 5-Sigma & Element 119 Empirical Benchmark Report

> **Generated:** `2026-11-21T19:02:03.414Z`  
> **Backend Under Test:** `http://localhost:4000`  
> **Total Trials Executed:** 8  
> **Methodology:** Every trial calls `POST /api/snapshot/reset` before execution so all groups start from the exact identical NovaFlow AI-Slop baseline. Visual quality is scored in a single calibrated prefill pass by `gemini-decision-1` (`v1beta`) alongside multimodal cosine similarity from `gemini-embedding-2` and deterministic Puppeteer DOM audits.

---

## 1. Executive 5-Sigma Group Summary

| Evaluation Group | Trials (Pass / N) | Pass Rate | Overall Taste (0–100) ↑ | Slop Penalty (0–10) ↓ | Aesthetic Match (0–10) ↑ | Typography Craft (0–10) ↑ | Layout Broken Prob ↓ | Contrast Fail Prob ↓ | Embed-2 Cosine ↑ | Avg Iters | DOM Defects ↓ | Mean Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Control (Text-Only Baseline)** | 0/3 | 0.0% | **13.8** | 9.09 | 1.52 | 5.62 | 0.144 | 0.341 | 0.554 | 1.0 | 0 | 40.6s |
| **Treatment 1 (AntiSlop fast_demo)** | 3/3 | 100.0% | **99.5** | 2.38 | 8.88 | 8.92 | 0.082 | 0.172 | 0.739 | 1.0 | 0 | 35.1s |
| **Element 119 Chaos Stress Tests** | 2/2 | 100.0% | **100.0** | 1.58 | 9.12 | 9.16 | 0.152 | 0.184 | 0.596 | 1.0 | 0 | 233.6s |

### Lift vs. Naive Text-Only Control Baseline (`"Make this landing page look modern, sleek, and premium"`)

| Treatment vs. Control | Δ Overall Taste ↑ | Effect Size (Cohen's d) | Δ Slop Penalty ↓ | Δ Aesthetic Match ↑ | Δ Typography Craft ↑ | Δ Embedding-2 Cosine ↑ |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Treatment 1 (`fast_demo`)** | **+85.7** | 38.30 | -6.71 | +7.35 | +3.31 | +0.185 |
| **Treatment 2 (`deep_atelier`)** | **—** | — | — | — | — | — |

---

## 2. Per-Trial Telemetry Breakdown

| Trial ID | Group | Status | Taste ↑ | Slop ↓ | Match ↑ | Typo ↑ | LayoutFail ↓ | ContrastFail ↓ | Embed-2 ↑ | Iters | DOM (Ovf/Ovlp/Img/Err) | Wall Time | Dominant Class | Primary Defect |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| `control-swiss-editorial-print` | control_text_baseline | **PARTIAL (max_iterations_reached)** | 16.4 | 8.82 | 2.25 | 5.64 | 0.171 | 0.363 | 0.571 | 1 | 0px/0/0/0 | 43.6s | generic_ai_saas_slop | generic_ai_cliche |
| `control-brutalist-tokyo-poster` | control_text_baseline | **PARTIAL (failed)** | — | — | — | — | — | — | — | 0 | — | 33.2s | — | — |
| `control-warm-botanical-atelier` | control_text_baseline | **PARTIAL (max_iterations_reached)** | 11.2 | 9.35 | 0.80 | 5.59 | 0.116 | 0.319 | 0.538 | 1 | 0px/0/0/0 | 37.6s | generic_ai_saas_slop | generic_ai_cliche |
| `fast-swiss-editorial-print` | treatment_fast_demo | **PASS** | 100.0 | 1.75 | 9.16 | 9.20 | 0.095 | 0.153 | 0.801 | 1 | 0px/0/0/0 | 36.1s | editorial_print | none |
| `fast-brutalist-tokyo-poster` | treatment_fast_demo | **PASS** | 100.0 | 2.35 | 9.08 | 8.88 | 0.052 | 0.117 | 0.761 | 1 | 0px/0/0/0 | 34.5s | swiss_architectural | none |
| `fast-warm-botanical-atelier` | treatment_fast_demo | **PASS** | 98.5 | 3.04 | 8.39 | 8.69 | 0.098 | 0.247 | 0.654 | 1 | 0px/0/0/0 | 34.6s | warm_tactile_craft | broken_or_missing_imagery |
| `stress-conflicting-chaos-4way` | element119_stress_test | **PASS** | 100.0 | 1.37 | 9.30 | 9.28 | 0.097 | 0.152 | 0.604 | 1 | 0px/0/0/0 | 190.8s | warm_tactile_craft | none |
| `stress-dim-tilted-webcam` | element119_stress_test | **PASS** | 100.0 | 1.80 | 8.93 | 9.05 | 0.208 | 0.216 | 0.589 | 1 | 0px/0/0/0 | 276.5s | warm_tactile_craft | none |

---

## 3. Autonomous Critic Loop Convergence Trajectories

| Trial ID | Iteration Progression (Taste Score → Slop Penalty → Aesthetic Match) | Embedding-2 Drift (Init → Final) |
| :--- | :--- | :---: |
| `control-swiss-editorial-print` | Iter 1 (fast_pass): **16.4** [slop 8.8, match 2.3] | 0.571 → 0.571 (0.000) |
| `control-brutalist-tokyo-poster` | _No iterations completed_ | — |
| `control-warm-botanical-atelier` | Iter 1 (fast_pass): **11.2** [slop 9.3, match 0.8] | 0.538 → 0.538 (0.000) |
| `fast-swiss-editorial-print` | Iter 1 (fast_pass): **100.0** [slop 1.8, match 9.2] | 0.801 → 0.801 (0.000) |
| `fast-brutalist-tokyo-poster` | Iter 1 (fast_pass): **100.0** [slop 2.4, match 9.1] | 0.761 → 0.761 (0.000) |
| `fast-warm-botanical-atelier` | Iter 1 (fast_pass): **98.5** [slop 3.0, match 8.4] | 0.654 → 0.654 (0.000) |
| `stress-conflicting-chaos-4way` | Iter 1 (parallel_race): **100.0** [slop 1.4, match 9.3] | 0.604 → 0.604 (0.000) |
| `stress-dim-tilted-webcam` | Iter 1 (parallel_race): **100.0** [slop 1.8, match 8.9] | 0.589 → 0.589 (0.000) |

---

## 4. Element 119 Chaos Stress Tests (Conflict Arbitration & Hostile Inputs)

| Stress Scenario | Gate Passed | Overall Taste | Slop ↓ | ContrastFail ↓ | Vibe Synthesized | Conflict Arbitration Notes |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| **Conflicting 4-Way Chaos Set (Swiss + Cyberpunk + Ceramic + Blueprint)** | YES | 100.0 | 1.37 | 0.152 | Kiln, Rag & Caliper | Four diametrically opposed references are resolved through strict structural hierarchy rather than muddy averaging: (1) Swiss Minimal (Ref 01) governs macro spa |
| **Dim Tilted Glare-Streaked Webcam Magazine (ISO 3200 Tungsten)** | YES | 100.0 | 1.80 | 0.216 | Monolith Plaster & Alabaster | The source frame presents three acute visual tensions: (1) a gritty, tilted (-11.5°), ISO-3200 low-light webcam surveillance capture with oblique tungsten glare |

---

## 5. Honest Failure Cases & Remaining Breaking Points

> Every failed gate, SLA breach, DOM regression, missing conflict arbitration, or runtime error observed during execution is logged verbatim below — zero cherry-picking.

### `control-swiss-editorial-print` (control_text_baseline) — Swiss Editorial Print (Archival Cream + Vermilion)
- **Status:** `max_iterations_reached` · **Primary Defect Class:** `generic_ai_cliche`
- Reached max_iterations (1/1) without passing all Decisions API gates
- passedAllGates=false (overallTasteScore=16.4/100)
- AI slop threshold breached: slopPenalty=8.82/10
- Aesthetic fidelity below bar: aestheticMatch=2.25/10
- Contrast legibility failure: contrastFailing prob=0.363

### `control-brutalist-tokyo-poster` (control_text_baseline) — Brutalist Tokyo Poster (Concrete Grid + Electric Yellow)
- **Status:** `failed`
- Backend reported terminal status=failed
- No DecisionsScorecard recorded in iterations

### `control-warm-botanical-atelier` (control_text_baseline) — Warm Botanical Atelier (Linen + Heritage Sage + Terracotta)
- **Status:** `max_iterations_reached` · **Primary Defect Class:** `generic_ai_cliche`
- Reached max_iterations (1/1) without passing all Decisions API gates
- passedAllGates=false (overallTasteScore=11.2/100)
- AI slop threshold breached: slopPenalty=9.35/10
- Aesthetic fidelity below bar: aestheticMatch=0.80/10

### `fast-swiss-editorial-print` (treatment_fast_demo) — Swiss Editorial Print (Archival Cream + Vermilion)
- **Status:** `passed` · **Primary Defect Class:** `none`
- fast_demo latency SLA exceeded: 36.1s > 25.0s target

### `fast-brutalist-tokyo-poster` (treatment_fast_demo) — Brutalist Tokyo Poster (Concrete Grid + Electric Yellow)
- **Status:** `passed` · **Primary Defect Class:** `none`
- fast_demo latency SLA exceeded: 34.5s > 25.0s target

### `fast-warm-botanical-atelier` (treatment_fast_demo) — Warm Botanical Atelier (Linen + Heritage Sage + Terracotta)
- **Status:** `passed` · **Primary Defect Class:** `broken_or_missing_imagery`
- AI slop threshold breached: slopPenalty=3.04/10
- fast_demo latency SLA exceeded: 34.6s > 25.0s target

---

_Generated automatically by `benchmarks/run-5sigma.ts`. Raw structured telemetry is archived in `benchmarks/results/latest-report.json`._
