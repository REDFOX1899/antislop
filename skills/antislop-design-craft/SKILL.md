---
name: antislop-design-craft
version: 2.0.0
description: Open-source UI design-engineering craft standard (v2) for eliminating generic AI slop. Enforces Swiss International Typographic Style, Dieter Rams' 10 Principles, Modern CSS 3D Spatial Depth, Domain-Grounded Visual Art, Radix/WCAG AA contrast math, Refactoring UI 4/8/16/24/48/96 spacing rhythm, fluid clamp() type scales, Google Modern Web Guidance, Canvas/WebGL/Shader preservation, and the Anti-Slop Ban List.
---

# AntiSlop Design Craft Standard

An open-source design-engineering specification for transforming generic, template-driven interfaces into museum-grade editorial, industrial, and interactive web software.

---

## 1. Foundational Craft: Swiss Style & Dieter Rams

Apply Josef Müller-Brockmann's International Typographic Style and Dieter Rams' 10 Principles of Good Design to every layout decision:

- **Less, but better**: Remove ornamental clutter, superfluous badges, decorative gradients, and redundant wrapper cards. Every pixel must serve hierarchy, legibility, or interaction.
- **Mathematical grid discipline**: Anchor layouts to a crisp 12-column grid with explicit column spans, aligned baselines, and intentional asymmetry rather than monotonous centered stacks.
- **Honest materiality**: Express structure through 1px hairline rules (`1px solid var(--border-subtle)`), disciplined surface stepping (`--canvas` -> `--surface` -> `--surface-muted`), and negative space instead of muddy drop-shadow stacks.
- **Thorough to the last detail**: Calibrate micro-labels, tabular numbers, focus rings, hairline hover states, responsive breakpoints (`1440px` desktop and `390px` mobile), and footer colophons with equal rigor.

---

## 2. Typographic Architecture & Fluid `clamp()` Scales

Typography carries 80% of visual authority. Never default to unstyled Inter everywhere.

- **Intentional 2–3 Voice Pairing**:
  - **Display Voice** (`--font-display`): Expressive editorial serif, grotesque, or architectural sans with character (e.g., *Instrument Serif*, *Cormorant Garamond*, *Syne*, *Space Grotesk*, *Fraunces*, *Bodoni Moda*, *Archivo*).
  - **Body Voice** (`--font-body`): Legible humanist or neo-grotesque optimized for sustained reading (e.g., *Plus Jakarta Sans*, *DM Sans*, *IBM Plex Sans*, *Manrope*, *Newsreader*).
  - **Technical / Index Voice** (`--font-mono`): Crisp monospace for section indices (`01 / 02 / 03`), timestamps, telemetry, keyboard hints, and tabular figures (e.g., *IBM Plex Mono*, *JetBrains Mono*, *Space Mono*).
- **Fluid Modular `clamp()` Scale** (ratio `1.25`–`1.333`, zero jarring breakpoint jumps):
  ```css
  :root {
    --text-display: clamp(2.5rem, 5.5vw, 5.25rem); /* h1: tracking -0.03em, leading 0.98–1.08 */
    --text-heading: clamp(1.75rem, 3.0vw, 3.0rem);  /* h2: tracking -0.02em, leading 1.12 */
    --text-subhead: clamp(1.25rem, 1.8vw, 1.625rem);/* h3: leading 1.25 */
    --text-body:    clamp(1.0rem, 1.05vw, 1.125rem);/* body: leading 1.58–1.65 */
    --text-caption: clamp(0.75rem, 0.85vw, 0.875rem);/* mono labels: tracking 0.08em–0.12em */
  }
  ```
- **Measure & Numerals**: Constrain long-form body copy to `52ch–68ch` (`max-w-prose`). Enable `font-variant-numeric: tabular-nums` on all metrics, prices, counters, and tables so columns align cleanly.
- **Real Webfont Loading**: Always emit valid Google Fonts CSS2 `<link rel="preconnect">` + `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...&display=swap">` in `index.html`.

---

## 3. Color System & Radix / WCAG AA Contrast Math

Treat color as functional architecture, never decoration.

- **Semantic Token Contract**:
  - `--canvas`: Dominant ground (60–70% of viewport area).
  - `--surface` / `--surface-muted`: Secondary structural planes (20–30% of viewport area), differentiated by subtle luminance stepping + 1px hairline borders.
  - `--ink-primary`: Primary text, headlines, active controls.
  - `--ink-secondary`: Captions, metadata, secondary copy.
  - `--accent` & `--accent-contrast`: Surgical interactive focal color (<= 10% of viewport) paired with its verified contrasting foreground.
  - `--border-subtle`: Hairline dividers (`rgba(...)` at 10%–18% opacity against the ground polarity).
- **Non-Negotiable Contrast Ratios (WCAG 2.1 AA / Radix Polarity Math)**:
  - **Normal body copy, nav links, captions, labels, inputs, and CTA text**: **>= 4.5:1** luminance contrast ratio against their actual rendered background.
  - **Large display headings (>= 24px regular or >= 18.66px bold) & interactive UI borders/focus rings**: **>= 3.0:1** luminance contrast ratio.
  - **Never** render pale muted grey ink on warm cream/white surfaces, dark charcoal ink on dark charcoal surfaces, or white text over bright pastel/yellow accents.
  - **Never** rely on color alone to convey state; pair color cues with icons, underlines, borders, or explicit text labels.
- **Multi-Style Conflict Resolution**: When combining conflicting moodboard cues (e.g., raw brutalist concrete + Japanese washi paper + technical telemetry), NEVER average them into muddy grey. Lock ONE dominant ground (`--canvas`), ONE authoritative display voice, and isolate contrasting tension strictly inside surgical `--accent` controls and mono micro-annotations.

---

## 4. Spatial Rhythm (Refactoring UI 4/8/16/24/48/96 Scale)

Establish calm, unmistakable cadence using a strict geometric spacing ladder:

| Token | Value | Purpose |
| :--- | :--- | :--- |
| Micro | `4px` (`0.25rem`) | Tight icon-to-label alignment, hairline offsets |
| Tight | `8px` (`0.5rem`) | Related inline controls, tag chips, input-to-label gap |
| Element | `16px` (`1rem`) | Paragraph gaps, grid gutters, list item separation |
| Group | `24px` (`1.5rem`) | Card/panel internal padding, toolbar padding |
| Component | `48px` (`3rem`) | Subsection separation, hero-to-body breathing room |
| Band | `96px–128px` (`6rem–8rem`) | Major editorial section padding & visual pauses |

- **Law of Proximity**: Outer spacing MUST strictly exceed inner spacing (`section padding >= 2x panel padding >= 1.5x internal element gap`).
- **Zero Overflow Invariant**: Guarantee `0px` horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`) at both `1440px` desktop and `390px` mobile. Always apply `min-w-0` on flex/grid children containing long text, code, or media, and `overflow-x: hidden` on root containers.

---

## 5. Google Modern Web Guidance (Baseline HTML & Compositor Motion)

Build on modern Baseline web platform primitives instead of bloated div-soup or layout-thrashing animations:

- **Semantic Landmarks & Headings**: Use `<!DOCTYPE html>`, `<html lang="en">`, `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, and `<footer>`. Maintain exactly one `<h1>` per view and sequential heading levels (`h1 -> h2 -> h3`, never skipping levels). Use `<button type="button">` for in-page actions and `<a href>` strictly for navigation.
- **Native Interactive Primitives**:
  - Use `<dialog>` with `.showModal()`, `::backdrop`, `<form method="dialog">`, and an explicit visible close control for modal interruptions (native Esc dismissal and focus trapping).
  - Use the Popover API (`popover="auto"`) for non-modal menus, tooltips, and disclosures that need light-dismiss without focus traps.
  - Use native `<details>` and `<summary>` (with a shared `name` attribute for exclusive accordions) for inline expandable content without custom JS state boilerplate.
- **Media & Core Web Vitals (LCP / CLS)**:
  - Set `fetchpriority="high"` on the primary above-the-fold hero image and NEVER put `loading="lazy"` on above-the-fold LCP media.
  - Apply `loading="lazy"` to off-screen images and always declare explicit aspect ratios (`aspect-[16/9]` or `width`/`height`) so CLS stays `0`.
  - Hide decorative SVGs with `aria-hidden="true"`; provide descriptive `alt` text on informative images and `alt=""` on decorative ones.
- **Compositor-Only Motion**:
  - Animate ONLY `transform` (`translate`, `scale`) and `opacity` so animations stay on the GPU compositor thread — never animate `top`, `left`, `width`, `height`, or `margin`.
  - Favor crisp editorial deceleration (`cubic-bezier(0.22, 1, 0.36, 1)`) at `180ms–260ms`. Zero cartoon bounce or distracting perpetual loops.
- **Reduced Motion Compliance**:
  - Gate non-essential movement inside `@media (prefers-reduced-motion: no-preference) { ... }` or dampen timing inside `@media (prefers-reduced-motion: reduce) { ... }`.
  - **NEVER** blanket-override with `animation-duration: 0.01ms !important;` (causes jarring flashes). Keep color/background hover transitions intact, ensure disabled animations settle in their visible final state (`opacity: 1`), and never exceed 3 flashes per second.

---

## 6. Modern 3D Spatial Depth & Domain-Grounded Visual Art (v2)

Elevate flat 2D wireframes into tactile, spatially legible interfaces without sacrificing Swiss restraint:

- **CSS 3D Spatial Depth**:
  - Frame showcase modules and architectural cards inside `perspective(1200px)` containers (`transform-style: preserve-3d`) with subtle resting/hover tilt or layered `translateZ` focal planes.
  - Replace muddy dark drop-shadows with crisp specular top-edge hairlines (`inset 0 1px 0 rgba(255, 255, 255, 0.14)` on dark surfaces; `inset 0 1px 0 rgba(255, 255, 255, 0.7)` on warm/light surfaces) plus `1px solid var(--border-subtle)`.
  - Compose an **asymmetric Swiss/Bento focal hierarchy**: one commanding 60–65% primary focal frame balanced against structured secondary spec/index modules rather than repetitive equal-width clones.
  - Animate spatial shifts strictly on `transform` and `opacity` with `cubic-bezier(0.22, 1, 0.36, 1)` (`180–260ms`) gated inside `@media (prefers-reduced-motion: no-preference)`.
- **Domain-Grounded Visual Art**:
  - Every generated hero or editorial image MUST depict the website's **actual product, craft, or subject matter** calibrated to the manifest palette — ZERO unrelated abstract spheres, generic stock landscapes, or off-topic filler.

---

## 7. Interactive Canvas, WebGL & Shader Preservation

When redesigning creative coding apps, 3D showcases, data visualizations, audio visualizers, or vanilla static repos containing `<canvas>`, WebGL/Three.js scenes, GLSL shaders, or `requestAnimationFrame` simulations:

1. **Preserve the Runtime Graph**: NEVER delete, rename, or replace mounting `<canvas>` IDs, WebGL context initializers, shader uniform bindings, resize observers, or animation loops with static mockups or placeholder `<div>` boxes.
2. **Non-Blocking HUD Layering**: Keep HUD chrome overlays non-obstructive (`pointer-events: none` on full-bleed layout wrappers, `pointer-events: auto` strictly on interactive controls/panels) so users can orbit, drag, paint, or interact directly with the canvas.
3. **Palette Sync & Stack Fidelity**: Harmonize surrounding typography, control rails, and canvas backdrop colors via CSS custom properties while strictly preserving the repository's native stack (edit vanilla `index.html`/`styles.css`/`app.js` in place on static repos; edit `src/App.tsx`/`src/index.css` on React/Vite repos — NEVER cross-contaminate stacks).

---

## 8. The Explicit Anti-Slop Ban List (Zero Tolerance)

Reject and purge ALL of the following generic AI-generated clichés:

- **NO** purple/violet/indigo-to-cyan linear gradients on dark `#0F172A` / `#09090B` slate backgrounds.
- **NO** neon glowing box-shadows, rainbow animated borders, or floating blurred aurora blobs behind frosted glassmorphic cards.
- **NO** generic Inter-everywhere SaaS hero templates or repetitive 3-column icon-inside-colored-circle feature card grids.
- **NO** sparkle/rocket/fire emoji bullets (`✨`, `🚀`, `🔥`) or hollow AI buzzword copy ("Revolutionize", "Supercharge", "Next-Gen AI-Powered", "Unleash", "Transform your workflow").
- **NO** invented or hallucinated external image URLs (`unsplash.com/...`, `example.com/...`) that may 404 — use only supplied bespoke assets (`/generated/...`), verified repo assets, or bespoke SVG/typographic geometry.
- **NO** invented uninstalled npm packages — restrict imports strictly to dependencies already installed in `package.json`.

---

## 9. Deterministic Verification Gate

Before marking any UI engineering pass complete, verify deterministically:

1. **TypeScript / Bundler Repositories** (`package.json` with `build` script):
   - Run `npx tsc --noEmit` (if `tsconfig.json` exists) and `npm run build` until exit code is `0`.
2. **Vanilla HTML / CSS / JS Repositories** (no bundler build script):
   - Run `node --check <file.js>` on every modified JavaScript file to verify zero syntax errors.
   - Verify all referenced `<script src>`, `<link href>`, and local asset paths resolve cleanly and HTML tags/CSS braces are balanced.
3. **Visual & Accessibility Audit**:
   - Confirm `0` broken images, `0` runtime console errors, `0px` horizontal overflow at `1440px` and `390px`, and WCAG AA contrast (`>= 4.5:1` body, `>= 3:1` display/UI) across every surface.
