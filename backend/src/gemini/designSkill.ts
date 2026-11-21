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
 * Distilled <=360-word UI Design Craft v2 standard injected into Director & Coder
 * system instructions for museum-grade hierarchy, 3D spatial depth, domain-grounded art,
 * typography, spacing, and contrast without inflating prompt latency.
 */
export const ANTISLOP_DESIGN_CRAFT_DISTILLED = `ANTISLOP DESIGN CRAFT STANDARD v2 (MANDATORY):
- Swiss & Dieter Rams Discipline: Less, but better. Build an asymmetric Swiss/Bento focal hierarchy anchored by 1px structural hairlines, disciplined surface stepping (--canvas -> --surface -> --surface-muted), and generous negative space instead of muddy drop-shadow stacks.
- Modern CSS 3D Spatial Depth: Frame architectural showcase cards inside perspective(1200px) with crisp specular top-edge hairlines (inset 0 1px 0 rgba(255,255,255,0.14) on dark or rgba(255,255,255,0.7) on light) and subtle layered Z-plane depth. Animate ONLY compositor properties (transform, opacity) with cubic-bezier(0.22, 1, 0.36, 1) (180–260ms) gated by @media (prefers-reduced-motion: no-preference).
- Fluid Typography & Measure: Pair an expressive Display font + legible Body font + crisp Mono font for indices (01 / 02 / 03) via a real Google Fonts CSS2 URL. Use fluid clamp() scales (h1 clamp(2.5rem, 5.5vw, 5.25rem), -0.03em tracking; body clamp(1rem, 1.05vw, 1.125rem), 1.6 leading, 52ch–68ch max measure) and tabular-nums on metrics.
- WCAG AA / Radix Contrast Math: Enforce >= 4.5:1 contrast for ALL body text, captions, muted metadata, nav links, inputs, and CTA labels (--accent-contrast on --accent); >= 3.0:1 for display headings and UI boundaries. Hold 60/30/10 color restraint.
- Spacing & Modern Web Guidance: Obey the 4/8/16/24/48/96px scale and Law of Proximity; guarantee 0px horizontal overflow at 1440px and 390px (min-w-0, overflow-x: hidden). Use semantic landmarks (<header>, <nav>, <main>, <footer>), one <h1>, native primitives (<dialog>, <details>, [popover]), and fetchpriority="high" on LCP hero media.
- Domain-Grounded Visual Art: Hero and editorial imagery MUST depict the website's actual product or subject matter calibrated to the manifest palette — zero unrelated abstract filler or invented external URLs.
- Canvas/WebGL Preservation & Stack Fidelity: Never break or cover <canvas>, WebGL/shader scenes, or requestAnimationFrame loops; match the repository's native stack (React/Vite OR vanilla HTML/CSS/JS).
- Explicit Anti-Slop Ban List: ZERO purple/indigo-to-cyan dark-slate gradients, ZERO neon glows or aurora blobs, ZERO generic Inter 3-col SaaS icon-circle grids, ZERO sparkle/rocket emojis or hollow AI buzzwords ("Revolutionize", "Supercharge", "Next-Gen"), ZERO uninstalled npm packages.`;

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
