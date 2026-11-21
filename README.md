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
[ User Multimodal Inputs ]
  ├── 🖼️ Moodboard Images
  ├── 🎥 Interaction Videos
  ├── 📷 Physical Webcam
  └── 🎙️ Voice Guidance
          │
          ▼
[ Gemini 4 Carbon (Reasoning) ] ──> Synthesizes Design System Tokens
          │
          ▼
[ Gemini 4 Hydrogen (Executor) ] ──> Rewrites Target Repo React/Tailwind Code
          │
          ▼
[ Vite Dev Server + HMR ] ───────> Hot Reloads Target UI in Iframe
          │
          ▼
[ Puppeteer Headless Capture ] ──> Renders Live App Screenshot
          │
          ▼
[ Gemini Decision 1 (Critic) ] ──> Evaluates Aesthetic, Slop, Layout
          │
          ├── (Fails Bar) ───────> Feeds critic diff back to Carbon/Hydrogen
          └── (Passes Bar) ──────> Deploys live refined interface!
```

---

## 🛠️ Repository & Team
- **Author:** Shantanu Patil ([@REDFOX1899](https://github.com/REDFOX1899))
- **Event:** Gemini 4 NYC Hackathon (Cerebral Valley & Google DeepMind)
- **License:** MIT
