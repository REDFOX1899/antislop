import type { Page } from 'puppeteer';

export type InteractionStateName =
  | 'default'
  | 'hover'
  | 'focus_visible'
  | 'scroll'
  | 'reduced_motion';

export interface InteractionStateCheck {
  state: InteractionStateName;
  passed: boolean;
  details: string;
  measuredDelta?: string;
}

export interface CwvSnapshot {
  fcpMs: number | null;
  domContentLoadedMs: number | null;
  clsEstimate: number;
  interactiveElementCount: number;
  focusableCount: number;
}

export interface InteractionAuditReport {
  interactionScore: number;
  states: InteractionStateCheck[];
  cwv: CwvSnapshot;
  fixDirectives: string[];
  latencyMs: number;
}

interface ComputedVisualSnapshot {
  backgroundColor: string;
  borderColor: string;
  color: string;
  transform: string;
  boxShadow: string;
}

interface DefaultStateEvaluation {
  cwv: CwvSnapshot;
  primaryCtaLabel: string | null;
  primaryCtaStyle: ComputedVisualSnapshot | null;
  navLinkCount: number;
}

interface HoverTargetDiscovery {
  found: boolean;
  label: string;
  before: ComputedVisualSnapshot | null;
}

interface FocusCheckResult {
  landedOnInteractive: boolean;
  tabsPressed: number;
  elementLabel: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
  hasVisibleRing: boolean;
}

interface ScrollCheckResult {
  targetScrollY: number;
  actualScrollY: number;
  overflowXPx: number;
  bodyHeight: number;
  maxFixedOverlayRatio: number;
  layoutCrashed: boolean;
}

interface ReducedMotionCheckResult {
  offendingCount: number;
  maxDurationMs: number;
  sampleSelectors: string[];
  hasReducedMotionMediaRule: boolean;
}

const HOVER_TARGET_ATTR = 'data-antislop-hover-target';
const HOVER_SETTLE_MS = 120;
const SCROLL_SETTLE_MS = 80;
const SCROLL_DISTANCE_PX = 400;
const MAX_TAB_PRESSES = 3;
const MAX_REDUCED_MOTION_ANIMATION_MS = 250;
const MAX_REDUCED_MOTION_TRANSITION_MS = 350;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function auditDefaultState(page: Page): Promise<{
  check: InteractionStateCheck;
  cwv: CwvSnapshot;
  directives: string[];
}> {
  const result = await page.evaluate((): DefaultStateEvaluation => {
    const isVisible = (el: Element): boolean => {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity || '1') === 0
      ) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
    const fcpMs = fcpEntry ? Math.round(fcpEntry.startTime) : null;

    const navEntries = performance.getEntriesByType('navigation');
    const navTiming = navEntries[0] as PerformanceNavigationTiming | undefined;
    const domContentLoadedMs =
      navTiming && Number.isFinite(navTiming.domContentLoadedEventEnd) && navTiming.domContentLoadedEventEnd > 0
        ? Math.round(navTiming.domContentLoadedEventEnd)
        : null;

    let clsRaw = 0;
    try {
      const shiftEntries = performance.getEntriesByType('layout-shift') as Array<
        PerformanceEntry & { value?: number; hadRecentInput?: boolean }
      >;
      for (const entry of shiftEntries) {
        if (!entry.hadRecentInput && typeof entry.value === 'number') {
          clsRaw += entry.value;
        }
      }
    } catch {
      clsRaw = 0;
    }
    const clsEstimate = Math.round(clsRaw * 10000) / 10000;

    const interactiveNodes = Array.from(
      document.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]'
      )
    ).filter(isVisible);

    const focusableNodes = Array.from(
      document.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(isVisible);

    const navLinks = Array.from(document.querySelectorAll('nav a[href], header a[href]')).filter(isVisible);

    const primaryCta =
      interactiveNodes.find((el) => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') ??
      interactiveNodes[0] ??
      null;

    let primaryCtaStyle: ComputedVisualSnapshot | null = null;
    let primaryCtaLabel: string | null = null;

    if (primaryCta) {
      const cs = window.getComputedStyle(primaryCta);
      primaryCtaStyle = {
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderColor,
        color: cs.color,
        transform: cs.transform,
        boxShadow: cs.boxShadow,
      };
      const text = (primaryCta.textContent ?? '').trim().slice(0, 32);
      primaryCtaLabel = text ? `${primaryCta.tagName.toLowerCase()}("${text}")` : primaryCta.tagName.toLowerCase();
    }

    return {
      cwv: {
        fcpMs,
        domContentLoadedMs,
        clsEstimate,
        interactiveElementCount: interactiveNodes.length,
        focusableCount: focusableNodes.length,
      },
      primaryCtaLabel,
      primaryCtaStyle,
      navLinkCount: navLinks.length,
    };
  });

  const directives: string[] = [];
  const issues: string[] = [];

  if (result.cwv.interactiveElementCount === 0) {
    issues.push('no visible interactive controls detected');
    directives.push(
      'Ensure at least one visible primary CTA button or navigation link is rendered above the fold.'
    );
  }
  if (result.cwv.focusableCount === 0) {
    issues.push('no keyboard-focusable controls detected');
    directives.push(
      'Use native <button> and <a href="..."> elements (or tabindex="0") so controls are keyboard-focusable.'
    );
  }
  if (result.cwv.clsEstimate > 0.1) {
    issues.push(`CLS estimate ${result.cwv.clsEstimate} exceeds 0.10 threshold`);
    directives.push(
      `Eliminate layout shifts (CLS=${result.cwv.clsEstimate}) by setting explicit width/height or aspect-ratio on media and reserving space for dynamic UI.`
    );
  }
  if (result.cwv.fcpMs !== null && result.cwv.fcpMs > 2500) {
    issues.push(`FCP ${result.cwv.fcpMs}ms exceeds 2500ms budget`);
    directives.push(
      `Reduce First Contentful Paint (${result.cwv.fcpMs}ms) by avoiding render-blocking resources and minimizing initial DOM/font payload.`
    );
  }

  const passed = issues.length === 0;
  const details = passed
    ? `Default state healthy (${result.cwv.interactiveElementCount} interactive, ${result.navLinkCount} nav links${result.primaryCtaLabel ? `, primary CTA: ${result.primaryCtaLabel}` : ''}).`
    : `Default state issues: ${issues.join('; ')}.`;

  const measuredDelta = `FCP=${result.cwv.fcpMs !== null ? `${result.cwv.fcpMs}ms` : 'n/a'}, DCL=${result.cwv.domContentLoadedMs !== null ? `${result.cwv.domContentLoadedMs}ms` : 'n/a'}, CLS=${result.cwv.clsEstimate}`;

  return {
    check: {
      state: 'default',
      passed,
      details,
      measuredDelta,
    },
    cwv: result.cwv,
    directives,
  };
}

async function auditHoverState(page: Page): Promise<{
  check: InteractionStateCheck;
  directives: string[];
}> {
  const target = await page.evaluate((attrName: string): HoverTargetDiscovery => {
    const existing = document.querySelector(`[${attrName}]`);
    if (existing) existing.removeAttribute(attrName);

    const candidates = Array.from(
      document.querySelectorAll('button, [role="button"], a[href]')
    );

    const isEligible = (el: Element): boolean => {
      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.pointerEvents === 'none' ||
        parseFloat(style.opacity || '1') === 0
      ) {
        return false;
      }
      if ((el as HTMLButtonElement).disabled) return false;
      const rect = el.getBoundingClientRect();
      return (
        rect.width >= 20 &&
        rect.height >= 18 &&
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight * 1.5 &&
        rect.right <= window.innerWidth
      );
    };

    const chosen =
      candidates.find((el) => (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') && isEligible(el)) ??
      candidates.find(isEligible) ??
      null;

    if (!chosen) {
      return { found: false, label: 'none', before: null };
    }

    chosen.setAttribute(attrName, 'true');
    const cs = window.getComputedStyle(chosen);
    const text = (chosen.textContent ?? '').trim().slice(0, 32);
    const label = text ? `${chosen.tagName.toLowerCase()}("${text}")` : chosen.tagName.toLowerCase();

    return {
      found: true,
      label,
      before: {
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderColor,
        color: cs.color,
        transform: cs.transform,
        boxShadow: cs.boxShadow,
      },
    };
  }, HOVER_TARGET_ATTR);

  if (!target.found || !target.before) {
    return {
      check: {
        state: 'hover',
        passed: false,
        details: 'No visible primary button or link available to test hover state.',
        measuredDelta: 'no hover target found',
      },
      directives: [
        'Render a visible, enabled primary button or CTA link with distinct :hover visual feedback.',
      ],
    };
  }

  let after: ComputedVisualSnapshot | null = null;
  try {
    await page.hover(`[${HOVER_TARGET_ATTR}="true"]`);
    await delay(HOVER_SETTLE_MS);

    after = await page.evaluate((attrName: string): ComputedVisualSnapshot | null => {
      const el = document.querySelector(`[${attrName}="true"]`);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderColor,
        color: cs.color,
        transform: cs.transform,
        boxShadow: cs.boxShadow,
      };
    }, HOVER_TARGET_ATTR);
  } finally {
    await page.mouse.move(0, 0).catch(() => undefined);
    await page
      .evaluate((attrName: string) => {
        const el = document.querySelector(`[${attrName}]`);
        if (el) el.removeAttribute(attrName);
      }, HOVER_TARGET_ATTR)
      .catch(() => undefined);
  }

  if (!after) {
    return {
      check: {
        state: 'hover',
        passed: false,
        details: `Hover target ${target.label} detached during hover inspection.`,
        measuredDelta: 'target detached',
      },
      directives: [
        'Ensure primary interactive controls remain stable in the DOM on hover and provide clear :hover style feedback.',
      ],
    };
  }

  const changedProps: string[] = [];
  const keys: ReadonlyArray<keyof ComputedVisualSnapshot> = [
    'backgroundColor',
    'borderColor',
    'color',
    'transform',
    'boxShadow',
  ];

  for (const key of keys) {
    if (target.before[key] !== after[key]) {
      changedProps.push(`${key}: ${target.before[key]} -> ${after[key]}`);
    }
  }

  const passed = changedProps.length > 0;
  return {
    check: {
      state: 'hover',
      passed,
      details: passed
        ? `Hovering ${target.label} produced visible style change across ${changedProps.length} property(ies).`
        : `Hovering ${target.label} produced no change in backgroundColor, borderColor, color, transform, or boxShadow.`,
      measuredDelta: passed ? changedProps.join('; ') : '0 style properties changed',
    },
    directives: passed
      ? []
      : [
          `Add perceptible :hover styling to primary buttons/links (tested ${target.label}) that updates background-color, border-color, color, transform, or box-shadow.`,
        ],
  };
}

async function auditFocusVisibleState(page: Page): Promise<{
  check: InteractionStateCheck;
  directives: string[];
}> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.focus();
  });

  let latest: FocusCheckResult = {
    landedOnInteractive: false,
    tabsPressed: 0,
    elementLabel: 'body',
    outlineStyle: 'none',
    outlineWidth: '0px',
    outlineColor: 'transparent',
    boxShadow: 'none',
    hasVisibleRing: false,
  };

  try {
    for (let i = 1; i <= MAX_TAB_PRESSES; i += 1) {
      await page.keyboard.press('Tab');
      await delay(50);

      latest = await page.evaluate((tabsPressed: number): FocusCheckResult => {
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) {
          return {
            landedOnInteractive: false,
            tabsPressed,
            elementLabel: active ? active.tagName.toLowerCase() : 'none',
            outlineStyle: 'none',
            outlineWidth: '0px',
            outlineColor: 'transparent',
            boxShadow: 'none',
            hasVisibleRing: false,
          };
        }

        const cs = window.getComputedStyle(active);
        const outlineWidthPx = parseFloat(cs.outlineWidth || '0');
        const hasOutline = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' && outlineWidthPx > 0;
        const hasBoxShadow = cs.boxShadow !== 'none' && cs.boxShadow.trim().length > 0;
        const text = (active.textContent ?? '').trim().slice(0, 28);
        const label = text ? `${active.tagName.toLowerCase()}("${text}")` : active.tagName.toLowerCase();

        return {
          landedOnInteractive: true,
          tabsPressed,
          elementLabel: label,
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          outlineColor: cs.outlineColor,
          boxShadow: cs.boxShadow,
          hasVisibleRing: hasOutline || hasBoxShadow,
        };
      }, i);

      if (latest.landedOnInteractive) {
        break;
      }
    }
  } finally {
    await page
      .evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      })
      .catch(() => undefined);
  }

  if (!latest.landedOnInteractive) {
    return {
      check: {
        state: 'focus_visible',
        passed: false,
        details: `Pressing Tab up to ${MAX_TAB_PRESSES} times did not focus any interactive control.`,
        measuredDelta: `tabs=${latest.tabsPressed}, active=${latest.elementLabel}`,
      },
      directives: [
        'Ensure interactive controls are reachable via keyboard Tab navigation without tabindex="-1" traps.',
      ],
    };
  }

  const passed = latest.hasVisibleRing;
  return {
    check: {
      state: 'focus_visible',
      passed,
      details: passed
        ? `Keyboard Tab (${latest.tabsPressed}x) focused ${latest.elementLabel} with a visible focus indicator.`
        : `Keyboard Tab (${latest.tabsPressed}x) focused ${latest.elementLabel}, but outlineWidth is ${latest.outlineWidth} and boxShadow is ${latest.boxShadow}.`,
      measuredDelta: `target=${latest.elementLabel}, outline=${latest.outlineWidth} ${latest.outlineStyle}, boxShadow=${latest.boxShadow === 'none' ? 'none' : 'present'}`,
    },
    directives: passed
      ? []
      : [
          `Add a visible :focus-visible ring (e.g., outline: 2px solid currentColor; outline-offset: 2px; or focus-visible:ring-2) on interactive controls such as ${latest.elementLabel}.`,
        ],
  };
}

async function auditScrollState(page: Page): Promise<{
  check: InteractionStateCheck;
  directives: string[];
}> {
  let result: ScrollCheckResult;

  try {
    await page.evaluate((distance: number) => {
      window.scrollTo({ top: distance, left: 0, behavior: 'instant' });
    }, SCROLL_DISTANCE_PX);
    await delay(SCROLL_SETTLE_MS);

    result = await page.evaluate((targetScrollY: number): ScrollCheckResult => {
      const overflowXPx = Math.max(
        0,
        Math.round(document.documentElement.scrollWidth - window.innerWidth)
      );
      const bodyRect = document.body.getBoundingClientRect();
      const viewportH = Math.max(1, window.innerHeight);

      let maxFixedOverlayRatio = 0;
      const elements = Array.from(document.querySelectorAll('header, nav, div, section, aside')).slice(0, 250);
      for (const el of elements) {
        const cs = window.getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width >= window.innerWidth * 0.5 && rect.height > 0) {
          const ratio = rect.height / viewportH;
          if (ratio > maxFixedOverlayRatio) {
            maxFixedOverlayRatio = ratio;
          }
        }
      }

      const layoutCrashed =
        bodyRect.height <= 0 ||
        !Number.isFinite(bodyRect.height) ||
        document.body.children.length === 0;

      return {
        targetScrollY,
        actualScrollY: Math.round(window.scrollY),
        overflowXPx,
        bodyHeight: Math.round(bodyRect.height),
        maxFixedOverlayRatio: Math.round(maxFixedOverlayRatio * 100) / 100,
        layoutCrashed,
      };
    }, SCROLL_DISTANCE_PX);
  } finally {
    await page
      .evaluate(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      })
      .catch(() => undefined);
  }

  const issues: string[] = [];
  const directives: string[] = [];

  if (result.layoutCrashed) {
    issues.push('document body collapsed or crashed on scroll');
    directives.push('Stabilize scroll handlers and layout containers so scrolling does not collapse the page body.');
  }
  if (result.overflowXPx > 2) {
    issues.push(`horizontal overflow of ${result.overflowXPx}px detected after scrolling`);
    directives.push(
      `Eliminate ${result.overflowXPx}px horizontal overflow on scroll by constraining wide children with max-w-full and overflow-x-clip.`
    );
  }
  if (result.maxFixedOverlayRatio > 0.6) {
    issues.push(
      `sticky/fixed element covers ${Math.round(result.maxFixedOverlayRatio * 100)}% of viewport height`
    );
    directives.push(
      'Constrain sticky/fixed headers and overlays to under 20% of viewport height so scrolled content stays legible.'
    );
  }

  const passed = issues.length === 0;
  return {
    check: {
      state: 'scroll',
      passed,
      details: passed
        ? `Scrolled to y=${result.actualScrollY}px with 0px horizontal overflow and stable layout.`
        : `Scroll audit failed: ${issues.join('; ')}.`,
      measuredDelta: `scrollY=${result.actualScrollY}px, overflowX=${result.overflowXPx}px, fixedOverlay=${Math.round(result.maxFixedOverlayRatio * 100)}%`,
    },
    directives,
  };
}

async function auditReducedMotionState(page: Page): Promise<{
  check: InteractionStateCheck;
  directives: string[];
}> {
  let result: ReducedMotionCheckResult;

  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);

  try {
    await delay(50);

    result = await page.evaluate(
      (maxAnimMs: number, maxTransMs: number): ReducedMotionCheckResult => {
        const parseDurationListMs = (raw: string): number => {
          if (!raw) return 0;
          let maxMs = 0;
          for (const part of raw.split(',')) {
            const token = part.trim();
            if (!token) continue;
            if (token.endsWith('ms')) {
              const val = parseFloat(token);
              if (Number.isFinite(val) && val > maxMs) maxMs = val;
            } else if (token.endsWith('s')) {
              const val = parseFloat(token) * 1000;
              if (Number.isFinite(val) && val > maxMs) maxMs = val;
            }
          }
          return Math.round(maxMs);
        };

        let hasReducedMotionMediaRule = false;
        try {
          for (const sheet of Array.from(document.styleSheets)) {
            let rules: CSSRuleList;
            try {
              rules = sheet.cssRules;
            } catch {
              continue;
            }
            for (const rule of Array.from(rules)) {
              if (
                rule instanceof CSSMediaRule &&
                rule.conditionText.includes('prefers-reduced-motion')
              ) {
                hasReducedMotionMediaRule = true;
                break;
              }
            }
            if (hasReducedMotionMediaRule) break;
          }
        } catch {
          hasReducedMotionMediaRule = false;
        }

        const elements = Array.from(document.querySelectorAll('*')).slice(0, 400);
        let offendingCount = 0;
        let maxDurationMs = 0;
        const sampleSelectors: string[] = [];

        for (const el of elements) {
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;

          const hasActiveAnimation = cs.animationName !== 'none' && cs.animationPlayState !== 'paused';
          const animMs = hasActiveAnimation ? parseDurationListMs(cs.animationDuration) : 0;
          const isInfiniteAnim =
            hasActiveAnimation && cs.animationIterationCount.split(',').some((v) => v.trim() === 'infinite');

          const hasTransition = cs.transitionProperty !== 'none';
          const transMs = hasTransition ? parseDurationListMs(cs.transitionDuration) : 0;

          const longest = Math.max(animMs, transMs);
          if (longest > maxDurationMs) {
            maxDurationMs = longest;
          }

          if ((hasActiveAnimation && (animMs > maxAnimMs || isInfiniteAnim)) || transMs > maxTransMs) {
            offendingCount += 1;
            if (sampleSelectors.length < 3) {
              const cls =
                typeof el.className === 'string' && el.className.trim()
                  ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
                  : '';
              sampleSelectors.push(`${el.tagName.toLowerCase()}${cls}`);
            }
          }
        }

        if (typeof document.getAnimations === 'function') {
          for (const anim of document.getAnimations()) {
            if (anim.playState !== 'running') continue;
            const timing = anim.effect?.getComputedTiming();
            const duration = typeof timing?.duration === 'number' ? timing.duration : 0;
            const iterations = typeof timing?.iterations === 'number' ? timing.iterations : 1;
            if (duration > maxAnimMs || !Number.isFinite(iterations)) {
              offendingCount += 1;
              if (duration > maxDurationMs) {
                maxDurationMs = Math.round(duration);
              }
            }
          }
        }

        return {
          offendingCount,
          maxDurationMs,
          sampleSelectors,
          hasReducedMotionMediaRule,
        };
      },
      MAX_REDUCED_MOTION_ANIMATION_MS,
      MAX_REDUCED_MOTION_TRANSITION_MS
    );
  } finally {
    await page
      .emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])
      .catch(() => undefined);
  }

  const passed = result.offendingCount === 0;
  return {
    check: {
      state: 'reduced_motion',
      passed,
      details: passed
        ? `Reduced-motion respected (0 active long animations/transitions${result.hasReducedMotionMediaRule ? ', @media rule detected' : ''}).`
        : `${result.offendingCount} element(s) retained long/infinite animations or transitions (max ${result.maxDurationMs}ms) under prefers-reduced-motion: reduce.`,
      measuredDelta: `offending=${result.offendingCount}, maxDuration=${result.maxDurationMs}ms${result.sampleSelectors.length > 0 ? `, samples=[${result.sampleSelectors.join(', ')}]` : ''}`,
    },
    directives: passed
      ? []
      : [
          'Add `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }` so long motion halts for reduced-motion users.',
        ],
  };
}

function computeInteractionScore(states: InteractionStateCheck[], cwv: CwvSnapshot): number {
  const weights: Record<InteractionStateName, number> = {
    default: 20,
    hover: 20,
    focus_visible: 25,
    scroll: 20,
    reduced_motion: 15,
  };

  let score = 0;
  for (const check of states) {
    if (check.passed) {
      score += weights[check.state];
    } else if (check.state === 'default' && cwv.interactiveElementCount > 0) {
      // Partial credit if interactive elements exist but CWV is degraded
      score += 8;
    }
  }

  if (cwv.clsEstimate > 0.25) {
    score -= 10;
  } else if (cwv.clsEstimate > 0.1) {
    score -= 5;
  }

  if (cwv.fcpMs !== null && cwv.fcpMs > 4000) {
    score -= 5;
  }

  return clampScore(score);
}

export async function runInteractionAudit(page: Page): Promise<InteractionAuditReport> {
  const startMs = Date.now();

  const defaultResult = await auditDefaultState(page);
  const hoverResult = await auditHoverState(page);
  const focusResult = await auditFocusVisibleState(page);
  const scrollResult = await auditScrollState(page);
  const reducedMotionResult = await auditReducedMotionState(page);

  const states: InteractionStateCheck[] = [
    defaultResult.check,
    hoverResult.check,
    focusResult.check,
    scrollResult.check,
    reducedMotionResult.check,
  ];

  const fixDirectives = [
    ...defaultResult.directives,
    ...hoverResult.directives,
    ...focusResult.directives,
    ...scrollResult.directives,
    ...reducedMotionResult.directives,
  ];

  const interactionScore = computeInteractionScore(states, defaultResult.cwv);
  const latencyMs = Math.max(0, Date.now() - startMs);

  return {
    interactionScore,
    states,
    cwv: defaultResult.cwv,
    fixDirectives,
    latencyMs,
  };
}
