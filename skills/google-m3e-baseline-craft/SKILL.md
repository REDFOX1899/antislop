---
name: google-m3e-baseline-craft
version: 1.0.0
description: Google Material 3 Expressive (SPEC_2025) + material-color-utilities HCT/OKLCH perceptual color + Google Chrome web.dev Baseline 2025/2026 native web platform engineering skill. Use when building or upgrading modern web frontends to Google's latest expressive design language and zero-JS-hack browser standards.
---

# Google Material 3 Expressive & Chrome Baseline 2026 Craft Standard

A production engineering skill combining **Google Material 3 Expressive (`SPEC_2025`)**, **`material-foundation/material-color-utilities` (HCT + OKLCH perceptual color)**, and **Google Chrome `web.dev` Baseline 2025/2026** native browser primitives.

---

## 1. Google Material 3 Expressive (`SPEC_2025`) Architecture

Material 3 Expressive shifts away from flat, overly sterile UI toward **tactile, spring-driven, tonally elevated interfaces** with clear hierarchy:

### Surface Container Tonal Stepping (No Drop-Shadow Soup)
Express depth through subtle tonal surface stepping rather than heavy box shadows:
```css
:root {
  color-scheme: light dark;
  --surface-container-lowest:  light-dark(oklch(100% 0 0), oklch(10% 0.006 260));
  --surface-container-low:     light-dark(oklch(97.5% 0.004 260), oklch(14% 0.008 260));
  --surface-container:         light-dark(oklch(95.5% 0.006 260), oklch(17% 0.010 260));
  --surface-container-high:    light-dark(oklch(93% 0.008 260), oklch(21% 0.012 260));
  --surface-container-highest: light-dark(oklch(90% 0.010 260), oklch(25% 0.014 260));
}
```

### Expressive Shape Scale & Interactive Morphing
Pair calm architectural containers with tactile shape morphing on active/pressed controls (pill ↔ squircle):
```css
:root {
  --shape-sm: 8px;
  --shape-md: 12px;
  --shape-lg: 16px;
  --shape-xl: 28px;
  --shape-full: 9999px;
}

.m3e-button {
  border-radius: var(--shape-full);
  transition: border-radius 240ms var(--spring-fast), background-color 180ms ease;
}
.m3e-button:active {
  border-radius: var(--shape-md);
}
```

### Native CSS Spring Physics (`linear()` Curves)
Use Material 3 Expressive spring physics (spatial springs for movement/shape, effects springs for color/opacity) with instant `prefers-reduced-motion` safety:
```css
:root {
  /* Fast spatial spring (buttons, chips, toggles) */
  --spring-fast: linear(
    0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%,
    1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%,
    1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%,
    0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1.004 83.8%, 1
  );
  /* Standard spatial spring (sheets, cards, drawers) */
  --spring-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --spring-fast: linear;
    --spring-standard: linear;
  }
}
```

---

## 2. Perceptual Color Math (`material-color-utilities` HCT + OKLCH + APCA)

- **Seed-Driven Dynamic Palettes:** Derive all neutral, accent, and semantic roles from 1–2 seed hues in perceptual **OKLCH / HCT** space (`color-mix(in oklch, ...)`), never ad-hoc hex guessing.
- **Display-P3 Wide Gamut:** Emit sRGB hex fallbacks plus `@supports (color: color(display-p3 0 0 0))` wide-gamut accents for crisp cobalt/vermilion/emerald focal controls.
- **Hard APCA-W3 (`Lc`) Contrast Floors:**
  - Body text & labels (`< 18px`): **`|Lc| >= 75`** (critical fail `< 60`)
  - Display headings & CTA text (`>= 18px` bold): **`|Lc| >= 60`**
  - Interactive borders, icons & focus rings: **`|Lc| >= 45`**
- **CVD Resilience:** Never encode status solely by equiluminant red/green hues; pair color tokens with stroke icons, underlines, or tabular labels.

---

## 3. Google Chrome `web.dev` Baseline 2025/2026 Native Primitives

Eliminate heavy JS positioning/modal/scroll libraries by defaulting to native Baseline platform APIs:

| Legacy Hack | Baseline 2025/2026 Standard | Key CSS / HTML |
|---|---|---|
| Custom `<div class="modal">` + focus trap JS | **Native `<dialog>` + Top Layer** | `dialog.showModal()`, `closedby="any"`, `dialog::backdrop` |
| Popper.js / Floating UI JS loops | **Popover API + CSS Anchor Positioning** | `popover`, `anchor-name: --trigger`, `position-anchor: --trigger`, `top: anchor(bottom)`, `position-try-fallbacks: flip-block` |
| Breakpoint-only media queries | **Container Queries + CSS Subgrid** | `container-type: inline-size`, `@container (min-width: 420px)`, `grid-template-rows: subgrid` |
| Scroll event listeners / IntersectionObserver bloat | **CSS Scroll-Driven Animations** | `animation-timeline: view()`, `animation-range: entry 0% cover 30%` |
| Custom JS route fade hacks | **View Transitions API** | `document.startViewTransition(...)`, `view-transition-name` |
| Auto-resize textarea JS + custom select divs | **Native Form Primitives** | `field-sizing: content`, `appearance: base-select`, `:user-invalid` |
| BEM / CSS-in-JS specificity wars | **Native `@layer` + `@scope` + Nesting** | `@layer reset, tokens, base, components, utilities;` |

---

## 4. Open-Source Ecosystem Selection Matrix

- **Framework-Agnostic Material 3 Expressive Web Components:**
  - [`matraic/m3e`](https://github.com/matraic/m3e) — Lit-based ESM tree-shakable M3 Expressive Web Components (split buttons, expressive motion, dynamic tokens).
  - [`Banegasn/components`](https://github.com/Banegasn/components) — Independent M3 Expressive web component suite.
  - Note: Google's official [`material-components/material-web`](https://github.com/material-components/material-web) is in maintenance mode; prefer `matraic/m3e` for M3E or headless React primitives below.
- **Perceptual Color Algorithms:**
  - [`material-foundation/material-color-utilities`](https://github.com/material-foundation/material-color-utilities) (HCT dynamic color engine) paired with AntiSlop's zero-dep OKLCH + APCA kernel (`backend/src/design/colorKernel.ts`).
- **React / Next.js Production Systems:**
  - **Radix Primitives / Base UI + Tailwind v4 (`@theme`) + W3C Design Tokens (`tokens.json`)** for full visual ownership with built-in WAI-ARIA keyboard semantics.

---

## 5. Pre-Ship Verification Checklist

1. Zero `<div>` clickable buttons or custom modal backdrops where `<button>` / `<dialog>` / `popover` applies.
2. Every text/background pair verified with APCA-W3 `Lc` (`>= 75` body, `>= 60` headings/CTAs).
3. All body prose constrained to `52ch–68ch` (`max-w-prose`), `font-variant-numeric: tabular-nums` on metrics/prices, and `font-optical-sizing: auto` on variable serifs/sans.
4. Zero horizontal overflow at `1440px` and `390px`, tap targets `>= 36px`, visible `:focus-visible` rings, and `prefers-reduced-motion: reduce` respected.
