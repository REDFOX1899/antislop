# AntiSlop × Gemini Decisions API v2 — 10-Pillar Architecture Blueprint

> **Engine:** `gemini-decision-1` (`ai.decisions.create` via `@google/genai` `v1beta`)  
> **Core Property:** **0 output tokens** — calibrated `noul` probabilities ($p \in [0.01, 0.99]$) directly from decision heads in a single prefill pass, enabling sub-second visual verification, blind pairwise tournaments, and entropy-gated routing.

---

## 1. System Overview & Control Loop

AntiSlop separates **generative synthesis** (`gemini-4-argon` / `gemini-4-neon` / `gemini-4-carbon`) from **calibrated visual verification** (`gemini-decision-1`) and **deterministic geometry verification** (`geometryAuditor.ts`). By treating UI craft as a calibrated probability vector rather than noisy LLM prose, every repair iteration becomes mathematically measurable, monotonic, and regression-proof.

```mermaid
flowchart LR
    A[Rendered UI Snapshot] --> B[Deterministic DOM Gates\ngeometryAuditor.ts]
    A --> C[gemini-decision-1\n0-Token Calibrated Probes]
    B --> D{Pillar 2: Entropy Router\nH(p_prod)}
    C --> D
    D -->|p_prod >= 0.88 & DOM OK| E[Early Stop\n0 ms]
    D -->|H < 0.61 & P_broken >= 0.85| F[gemini-4-argon\nFast Patch]
    D -->|0.61 <= H < 0.85| G[gemini-4-neon\nSurgical Craft]
    D -->|H >= 0.85| H[gemini-4-carbon\nDeep Synthesis]
    F --> I[Pillar 1: Blind Pairwise\nBradley-Terry Judge]
    G --> I
    H --> I
    I -->|p >= 0.50 & reg <= 0.35| J[Promote Candidate\n+Delta Elo]
    I -->|Regression Veto| K[Rollback to Baseline]
```

---

## 2. Implementation Status Matrix

| # | Pillar | Primary Mechanism | Output Tokens | Latency Target | Status |
|---|---|---|---|---|---|
| **1** | Pairwise Bradley-Terry Blind A/B Tournaments | Position-swapped `[A,B]` & `[B,A]` parallel `noul` calls | `0` | `~900 ms` | **Implemented** (`decisionsEngineV2.ts`) |
| **2** | Entropy-Gated Adaptive Compute Router | Binary Shannon entropy $H(p)$ tri-region tiering | `0` | `< 1 ms` | **Implemented** (`decisionsEngineV2.ts`) |
| **3** | Multi-Viewport & Polarity Delta Tensor | `1440px/390px × Dark/Light` $\Delta p_i$ regression veto | `0` | `~1.4 s` | **Blueprint Spec** |
| **4** | 5-State Interactive Contact Sheet Probing | Single stitched `5×1` grid (`default/hover/focus/modal/invalid`) | `0` | `~850 ms` | **Blueprint Spec** |
| **5** | Brand DNA Fidelity & Slop Drift Vector | Reference-anchored L2 drift norm $\lVert \mathbf{1} - \mathbf{p} \rVert_2$ | `0` | `~750 ms` | **Core Implemented** (`decisionsEngineV2.ts`) |
| **6** | Two-Stage Coarse-to-Fine 2× DPR Spatial X-Ray | 10×10 coarse heatmap $\rightarrow$ 2× DPR crop zoom on worst cells | `0` | `~1.6 s` | **Blueprint Spec** |
| **7** | Conversion, Trust & UX Copy Psychology Matrix | 10 orthogonal probes $\rightarrow$ 2D Craft-vs-Conversion quadrant | `0` | `~750 ms` | **Implemented** (`decisionsEngineV2.ts`) |
| **8** | Perceptual Accessibility & CVD Calibration | Hybrid `geometryAuditor.ts` APCA/WCAG + CVD `noul` probes | `0` | `~900 ms` | **Blueprint Spec** |
| **9** | Sub-2s CI/CD GitHub Actions PR Visual Gate | Headless Playwright diff + pairwise & delta-tensor PR check | `0` | `< 2.0 s` | **Blueprint Spec** |
| **10** | Real-Time `<400ms` HMR Copilot Pulse | Lightweight 6-probe delta stream for `gemini-3.8-live` voice | `0` | `< 400 ms` | **Blueprint Spec** |

---

## 3. Detailed 10-Pillar Specifications

### Pillar 1 — Pairwise Bradley-Terry Blind A/B Tournaments
- **Implementation:** `runPairwiseBlindJudge()` in [`backend/src/gemini/decisionsEngineV2.ts`](../backend/src/gemini/decisionsEngineV2.ts)
- **Problem Solved:** Absolute aesthetic scores drift across iterations and suffer from slot-order bias when comparing two screenshots.
- **Mechanism:**
  1. Dispatch two parallel `gemini-decision-1` calls with swapped image positions:
     - **Forward:** `[Baseline (A), Candidate (B)]` $\rightarrow p_{\text{fwd}} = P(B \succ A)$
     - **Reverse:** `[Candidate (A), Baseline (B)]` $\rightarrow p_{\text{rev}} = P(A \succ B)$
  2. Compute debiased win probability and regression probability:
     $$p_{\text{win}} = \frac{p_{\text{fwd}} + p_{\text{rev}}}{2}, \qquad p_{\text{reg}} = \frac{r_{\text{fwd}} + r_{\text{rev}}}{2}$$
  3. Convert to Bradley-Terry Elo delta (clamped to $p \in [0.01, 0.99]$):
     $$\Delta\text{Elo} = 400 \log_{10}\!\left(\frac{p_{\text{win}}}{1 - p_{\text{win}}}\right)$$
  4. **Hard Regression Veto Gate:** Reject candidate whenever $p_{\text{win}} < 0.50 \lor p_{\text{reg}} > 0.35$.

---

### Pillar 2 — Entropy-Gated Adaptive Compute Router
- **Implementation:** `computeShannonEntropy()` & `routeByDecisionEntropy()` in [`backend/src/gemini/decisionsEngineV2.ts`](../backend/src/gemini/decisionsEngineV2.ts)
- **Problem Solved:** Running flagship synthesis (`gemini-4-carbon`) on obvious CSS fixes wastes latency/budget, while running fast models on ambiguous layout failures causes oscillation.
- **Mechanism:** Compute binary Shannon entropy over $p_{\text{prod}}$:
  $$H(p) = -p\log_2 p - (1-p)\log_2(1-p)$$
  Partition routing into four deterministic regions:
  1. **`early_stop` (`0 ms`):** $p_{\text{prod}} \ge 0.88 \land \text{domGatesPassed} = \text{true}$.
  2. **`gemini-4-argon` (`~1.8 s`):** $H(p_{\text{prod}}) < 0.61 \land p_{\text{broken}} \ge 0.85$ (unambiguous mechanical defect).
  3. **`gemini-4-neon` (`~3.6 s`):** $0.61 \le H(p_{\text{prod}}) < 0.85$ (or low-entropy edge case without clear stop/defect).
  4. **`gemini-4-carbon` (`~7.2 s`):** $H(p_{\text{prod}}) \ge 0.85$ (maximum uncertainty; requires deep structural/aesthetic re-architecture).

---

### Pillar 3 — Multi-Viewport & Polarity Delta Tensor
- **Target Module:** `backend/src/gemini/viewportDeltaTensor.ts` (planned)
- **Mechanism:** Capture a $2 \times 2$ rendering tensor:
  $$\mathcal{V} = \{\text{1440px}, \text{390px}\} \times \{\text{Dark}, \text{Light}\}$$
- Evaluate a shared $K$-probe craft vector $\mathbf{p}^{(v)} \in [0,1]^K$ for each slice $v \in \mathcal{V}$ in parallel via `withV1BetaClient`.
- Compute per-slice regression deltas against baseline:
  $$\Delta p_{v,k} = p^{(v,\text{cand})}_k - p^{(v,\text{base})}_k$$
- **Veto Rule:** Any single slice regression $\min_{v,k} \Delta p_{v,k} < -0.18$ (e.g., mobile 390px nav overflow or light-mode contrast collapse) triggers an automatic rollback even if 1440px dark mode improved.

---

### Pillar 4 — 5-State Interactive Contact Sheet Probing
- **Target Module:** `backend/src/sandbox/stateContactSheet.ts` + `decisionsEngineV2.ts`
- **Problem Solved:** Static first-paint screenshots miss broken hover contrast, invisible focus rings, clipped modals, and unreadable validation states.
- **Mechanism:** Playwright programmatically drives 5 states—`default`, `hover`, `focus-visible`, `modal-open`, and `form-invalid`—and composites them into a single labeled `5×1` horizontal contact sheet image.
- A single `gemini-decision-1` call probes all 5 states simultaneously (zero extra round-trips, zero output tokens), verifying affordance transitions, focus-ring visibility ($\ge 3:1$), modal backdrop isolation, and inline error legibility.

---

### Pillar 5 — Brand DNA Fidelity & Slop Drift Vector
- **Core Implementation:** `runConversionAndBrandAudit()` in [`backend/src/gemini/decisionsEngineV2.ts`](../backend/src/gemini/decisionsEngineV2.ts)
- **Mechanism:** Evaluates rendered UI alongside an optional target Brand DNA / Moodboard reference across orthogonal fidelity axes:
  - `palette_dna_adherence` (60/30/10 restraint)
  - `typography_voice_fidelity` (display/body pairing & tracking)
  - `zero_ai_slop_surface` (anti-glow, anti-purple-gradient, anti-glass cliché)
  - `layout_craft_originality` (bespoke editorial rhythm)
- Computes normalized **Brand Drift L2 Norm**:
  $$D_{\text{brand}} = \sqrt{\frac{1}{M}\sum_{k=1}^{M} (1 - p_k)^2} \in [0, 1]$$
  where $D_{\text{brand}} \le 0.30$ enforces tight brand lock and $D_{\text{brand}} > 0.30$ flags slop drift.

---

### Pillar 6 — Two-Stage Coarse-to-Fine 2× DPR Spatial Zoom X-Ray
- **Foundation:** Extends `runDeepDecisionAudit()` (`10×10` spatial grid in [`backend/src/gemini/deepDecisionMatrix.ts`](../backend/src/gemini/deepDecisionMatrix.ts)).
- **Mechanism:**
  - **Stage 1 (Coarse):** Run the `10×10` spatial grid at `1×` DPR (`100` cell probes). Identify the top $k \le 3$ failing cells where $p_{\text{cell}} < 0.60$.
  - **Stage 2 (Fine):** Crop those exact bounding boxes from a `2×` DPR full-resolution capture (with 15% contextual padding) and run micro-typography, sub-pixel alignment, icon-stroke, and kerning `noul` probes at native retina fidelity.
  - Emits exact CSS selector + bounding-box coordinates into the surgical repair prompt.

---

### Pillar 7 — Conversion, Trust & UX Copy Psychology Matrix
- **Implementation:** `runConversionAndBrandAudit()` in [`backend/src/gemini/decisionsEngineV2.ts`](../backend/src/gemini/decisionsEngineV2.ts)
- **Mechanism:** Evaluates 6 weighted conversion psychology probes (`above_fold_value_clarity`, `primary_cta_salience`, `trust_proof_credibility`, `cognitive_load_restraint`, `copy_specificity_authenticity`, `visual_funnel_flow`) to compute `conversionReadinessScore` $\in [0, 100]$.
- Combines Conversion Readiness ($y$-axis, threshold `70`) with Brand Drift Norm ($x$-axis, threshold `0.30`) into a 2D diagnostic quadrant:
  - **`high_yield_craft`:** High conversion ($\ge 70$) + Low drift ($\le 0.30$) — ship-ready.
  - **`pretty_slop`:** Low conversion ($< 70$) + Low drift ($\le 0.30$) — visually styled but unclear value prop/CTA.
  - **`functional_draft`:** High conversion ($\ge 70$) + High drift ($> 0.30$) — clear funnel, needs art-direction & anti-slop pass.
  - **`needs_overhaul`:** Low conversion ($< 70$) + High drift ($> 0.30$) — escalate to `gemini-4-carbon`.

---

### Pillar 8 — Perceptual Accessibility & CVD Calibration
- **Hybrid Stack:** `backend/src/sandbox/geometryAuditor.ts` (deterministic WCAG 2.1 / APCA contrast + tap-target geometry) + `gemini-decision-1` perceptual `noul` probes.
- **Mechanism:**
  - Deterministic pass computes exact DOM luminance ratios, font sizes, and `44×44px` hit targets.
  - Perceptual pass applies client-side Brettel/Machado color-vision-deficiency (Protanopia, Deuteranopia, Tritanopia) filter matrices to the screenshot and probes whether status indicators, charts, and primary CTAs remain unambiguously distinguishable without relying solely on hue.

---

### Pillar 9 — Sub-2s CI/CD GitHub Actions PR Visual Gate
- **Target Integration:** `.github/workflows/antislop-visual-gate.yml` + CLI runner invoking `decisionsEngineV2.ts`.
- **Pipeline Budget (`< 2.0 s` inference):**
  1. Capture PR preview vs. `main` baseline screenshots in headless Playwright.
  2. Run `runPairwiseBlindJudge` (`~900 ms`) + `runConversionAndBrandAudit` (`~750 ms`) in parallel (`Promise.all`, total wall-clock `< 1.1 s`, `0` output tokens).
  3. Post structured PR check annotation with $\Delta\text{Elo}$, Conversion Score, Brand Drift Norm, and hard-fail merge gate if `rejectedAsRegression === true`.

---

### Pillar 10 — Real-Time `<400ms` HMR Copilot Pulse for `gemini-3.8-live`
- **Target Integration:** Live Vite HMR webhook $\rightarrow$ lightweight 6-probe `gemini-decision-1` pulse $\rightarrow$ `gemini-3.8-live` multimodal session context injection.
- **Mechanism:**
  - On each Vite HMR update (debounced `250 ms`), capture a downscaled `960px` JPEG of the active viewport.
  - Run a 6-probe minimal `noul` pulse (`prod_ready`, `broken_layout`, `contrast_ok`, `slop_detected`, `cta_clear`, `grid_aligned`) in `< 400 ms` with `0` output tokens.
  - Stream only threshold-crossing deltas (`|Δp| >= 0.15`) as structured JSON events into the active `gemini-3.8-live` voice copilot, letting the Creative Director voice agent proactively warn the developer (*"That header tweak dropped mobile contrast below threshold"*) without polling or burning generative tokens.

---

## 4. Exported TypeScript API Surface (`decisionsEngineV2.ts`)

| Symbol | Kind | Purpose |
|---|---|---|
| `computeShannonEntropy(p)` | Pure Function | Safe binary Shannon entropy $H(p) \in [0, 1]$ |
| `AdaptiveRouteTier` | Type | `'early_stop' \| 'gemini-4-argon' \| 'gemini-4-neon' \| 'gemini-4-carbon'` |
| `routeByDecisionEntropy(input)` | Pure Function | Tri-region entropy router with rationale & latency estimate |
| `PairwiseJudgeResult` | Interface | Debiased win prob, forward/reverse probs, $\Delta\text{Elo}$, regression veto |
| `runPairwiseBlindJudge(input)` | Async Function | Parallel position-swapped Bradley-Terry blind judge (`0` output tokens) |
| `ConversionAndBrandAuditResult` | Interface | Conversion score (0..100), Brand Drift L2 norm, 2D quadrant, 10 probes |
| `runConversionAndBrandAudit(input)` | Async Function | 10-probe conversion psychology & slop-drift audit (`0` output tokens) |
