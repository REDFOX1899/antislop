import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../config/env.js';

export const DESIGN_CRAFT_SKILL_PATH = path.join(
  REPO_ROOT,
  'skills',
  'antislop-design-craft',
  'SKILL.md'
);

/**
 * Distilled ~430-token UI Design Craft standard injected into Director & Coder
 * system instructions for museum-grade hierarchy, typography, spacing, and contrast
 * without inflating prompt latency.
 */
export const ANTISLOP_DESIGN_CRAFT_DISTILLED = `ANTISLOP DESIGN CRAFT STANDARD (MANDATORY):
- Swiss & Dieter Rams Discipline: Less, but better. Build an authoritative asymmetric 12-column grid anchored by 1px hairline dividers, subtle surface stepping (--canvas -> --surface -> --surface-muted), and generous negative space instead of drop-shadow card piles.
- Fluid Typography & Measure: Pair an expressive Display font + legible Body font + crisp Mono font for indices/metadata (01 / 02 / 03) via a real Google Fonts CSS2 URL. Use fluid clamp() type scales (h1 clamp(2.5rem, 5.5vw, 5.25rem) with -0.03em tracking and ~1.02 leading; body clamp(1rem, 1.05vw, 1.125rem) at 1.6 leading and 52ch–68ch max measure) plus font-variant-numeric: tabular-nums on metrics.
- WCAG AA / Radix Contrast Math: Enforce >= 4.5:1 contrast for ALL body text, captions, muted metadata, nav links, inputs, and CTA labels (--accent-contrast on --accent); enforce >= 3.0:1 for display headings and UI boundaries. Hold 60/30/10 color restraint (dominant ground, quiet surface, surgical <= 10% accent). Never blend conflicting styles into muddy grey—resolve them via strict hierarchy.
- Refactoring UI Spacing Rhythm: Obey the 4/8/16/24/48/96px progression and Law of Proximity (section padding >= 2x panel padding >= 1.5x internal gap). Guarantee 0px horizontal overflow at 1440px and 390px (min-w-0 on grid/flex children, overflow-x: hidden).
- Modern Web Guidance: Use semantic landmarks (<header>, <nav>, <main>, <footer>), one <h1>, and native interactive primitives (<dialog>, <details>/<summary>, [popover]) over div-soup. Set fetchpriority="high" on LCP hero media (never lazy-load above the fold) with explicit aspect ratios. Animate ONLY compositor properties (transform, opacity) with editorial easing (cubic-bezier(0.22, 1, 0.36, 1), 180–260ms), gated cleanly via @media (prefers-reduced-motion: no-preference | reduce)—never blanket 0.01ms overrides.
- Canvas/WebGL/Shader Preservation: Never break, delete, or cover <canvas>, WebGL/Three.js scenes, GLSL shaders, or requestAnimationFrame loops; keep HUD overlays pointer-events-none with pointer-events-auto on controls, and strictly match the repo's native stack.
- Explicit Anti-Slop Ban List: ZERO purple/indigo-to-cyan gradients on dark slate, ZERO neon glows or blurred aurora blobs, ZERO generic Inter-everywhere 3-col icon-circle SaaS cards, ZERO sparkle/rocket emoji bullets or hollow AI buzzwords ("Revolutionize", "Supercharge", "Next-Gen"), ZERO invented external image URLs or uninstalled npm packages.`;

let cachedFullSkill: string | null = null;
let cachedSkillHash: string | null = null;

/**
 * Loads the complete open-source AntiSlop Design Craft SKILL.md from
 * `skills/antislop-design-craft/SKILL.md` for mounting into Google Managed Agents
 * (`.agents/skills/antislop-design-craft/SKILL.md`).
 */
export function loadFullDesignCraftSkill(): string {
  if (cachedFullSkill !== null) {
    return cachedFullSkill;
  }

  try {
    const raw = fs.readFileSync(DESIGN_CRAFT_SKILL_PATH, 'utf8').trim();
    if (raw.length > 0) {
      cachedFullSkill = raw;
      return cachedFullSkill;
    }
  } catch {
    // Graceful fallback if packaged without the workspace skills directory
  }

  cachedFullSkill = [
    '---',
    'name: antislop-design-craft',
    'description: Open-source AntiSlop UI design-engineering craft standard.',
    '---',
    '',
    ANTISLOP_DESIGN_CRAFT_DISTILLED,
  ].join('\n');
  return cachedFullSkill;
}

/**
 * Deterministic short SHA-256 digest of the active Design Craft SKILL.md so
 * Managed Agent registrations automatically refresh when the craft rubric evolves.
 */
export function getDesignCraftSkillHash(): string {
  if (cachedSkillHash !== null) {
    return cachedSkillHash;
  }
  const content = loadFullDesignCraftSkill();
  cachedSkillHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  return cachedSkillHash;
}
