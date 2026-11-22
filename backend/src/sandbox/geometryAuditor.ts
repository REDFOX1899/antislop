import type { Page } from 'puppeteer';

export type GeometryViolationCategory =
  | 'apca_contrast'
  | 'typography_measure'
  | 'layout_rhythm'
  | 'semantic_a11y';

export type GeometryViolationSeverity = 'critical' | 'warning' | 'info';

export interface GeometryViolationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryViolation {
  id: string;
  category: GeometryViolationCategory;
  severity: GeometryViolationSeverity;
  selector: string;
  message: string;
  measured: string;
  threshold: string;
  snippet?: string;
  rect?: GeometryViolationRect;
}

export interface GeometryAuditCategoryScores {
  apcaContrast: number;
  typographyMeasure: number;
  layoutRhythm: number;
  semanticA11y: number;
}

export interface GeometryAuditReport {
  overallScore: number;
  categoryScores: GeometryAuditCategoryScores;
  totalElementsScanned: number;
  textNodesAudited: number;
  violations: GeometryViolation[];
  engineeringFixDirectives: string[];
  latencyMs: number;
  viewport: { width: number; height: number };
}

interface RawBrowserAuditResult {
  totalElementsScanned: number;
  textNodesAudited: number;
  viewport: { width: number; height: number };
  violations: GeometryViolation[];
}

const MAX_VIOLATIONS = 30;

const SEVERITY_RANK: Record<GeometryViolationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const CATEGORY_RANK: Record<GeometryViolationCategory, number> = {
  apca_contrast: 0,
  typography_measure: 1,
  layout_rhythm: 2,
  semantic_a11y: 3,
};

const SEVERITY_PENALTY: Record<GeometryViolationSeverity, number> = {
  critical: 16,
  warning: 8,
  info: 2,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function deduplicateAndSortViolations(rawViolations: GeometryViolation[]): {
  deduped: GeometryViolation[];
  capped: GeometryViolation[];
} {
  const seen = new Set<string>();
  const deduped: GeometryViolation[] = [];

  for (const violation of rawViolations) {
    const key = `${violation.category}|${violation.selector}|${violation.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(violation);
  }

  deduped.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const catDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (catDiff !== 0) return catDiff;
    const ay = a.rect?.y ?? Number.MAX_SAFE_INTEGER;
    const by = b.rect?.y ?? Number.MAX_SAFE_INTEGER;
    if (ay !== by) return ay - by;
    return a.selector.localeCompare(b.selector);
  });

  const capped = deduped.slice(0, MAX_VIOLATIONS).map((v, idx) => ({
    ...v,
    id: `${v.category}-${idx + 1}`,
  }));

  return { deduped, capped };
}

function computeCategoryScores(violations: GeometryViolation[]): GeometryAuditCategoryScores {
  const penalties: Record<GeometryViolationCategory, number> = {
    apca_contrast: 0,
    typography_measure: 0,
    layout_rhythm: 0,
    semantic_a11y: 0,
  };

  for (const v of violations) {
    penalties[v.category] += SEVERITY_PENALTY[v.severity];
  }

  return {
    apcaContrast: clampScore(100 - penalties.apca_contrast),
    typographyMeasure: clampScore(100 - penalties.typography_measure),
    layoutRhythm: clampScore(100 - penalties.layout_rhythm),
    semanticA11y: clampScore(100 - penalties.semantic_a11y),
  };
}

function computeOverallScore(scores: GeometryAuditCategoryScores): number {
  return clampScore(
    scores.apcaContrast * 0.35 +
      scores.typographyMeasure * 0.25 +
      scores.layoutRhythm * 0.2 +
      scores.semanticA11y * 0.2
  );
}

function synthesizeEngineeringFixDirectives(
  violations: GeometryViolation[],
  scores: GeometryAuditCategoryScores
): string[] {
  const directives: string[] = [];

  const apcaViolations = violations.filter((v) => v.category === 'apca_contrast');
  if (apcaViolations.length > 0) {
    const worst = apcaViolations[0];
    const sampleSelectors = apcaViolations
      .slice(0, 3)
      .map((v) => v.selector)
      .join(', ');
    directives.push(
      `[APCA Contrast] Raise foreground/background luminance contrast on ${apcaViolations.length} text element(s) (worst: ${worst.selector} measured ${worst.measured}; e.g. ${sampleSelectors}) to meet APCA |Lc| >= 60 for body text (<18px) and |Lc| >= 45 for headings/large text.`
    );
  }

  const overflowViolations = violations.filter(
    (v) => v.category === 'layout_rhythm' && v.message.toLowerCase().includes('horizontal overflow')
  );
  if (overflowViolations.length > 0) {
    const ov = overflowViolations[0];
    directives.push(
      `[Layout Overflow] Eliminate horizontal viewport overflow (${ov.measured}) by constraining wide containers with max-w-full / min-w-0 and removing fixed pixel widths or unclipped negative offsets.`
    );
  }

  const overlapViolations = violations.filter(
    (v) => v.category === 'layout_rhythm' && v.message.toLowerCase().includes('overlap')
  );
  if (overlapViolations.length > 0) {
    const first = overlapViolations[0];
    directives.push(
      `[Hero Collision] Resolve ${overlapViolations.length} overlapping sibling text bounding box(es) in the above-the-fold hero (e.g. ${first.selector}, ${first.measured}) using proper flex/grid gap spacing and explicit line-height instead of tight negative margins or colliding absolute positioning.`
    );
  }

  const tapTargetViolations = violations.filter(
    (v) => v.category === 'layout_rhythm' && v.message.toLowerCase().includes('tap target')
  );
  if (tapTargetViolations.length > 0) {
    const sample = tapTargetViolations
      .slice(0, 3)
      .map((v) => `${v.selector} (${v.measured})`)
      .join(', ');
    directives.push(
      `[Tap Targets] Expand ${tapTargetViolations.length} cramped interactive control(s) (e.g. ${sample}) to at least 32x32px (ideally 40-44px height) via padding or min-h-[36px] min-w-[36px].`
    );
  }

  const typoViolations = violations.filter((v) => v.category === 'typography_measure');
  if (typoViolations.length > 0) {
    const issues: string[] = [];
    const missingH1 = typoViolations.some((v) => v.message.toLowerCase().includes('missing'));
    const skippedH = typoViolations.some((v) => v.message.toLowerCase().includes('skipped'));
    const wideP = typoViolations.filter((v) => v.message.toLowerCase().includes('measure'));
    const smallBody = typoViolations.filter((v) => v.message.toLowerCase().includes('font size'));

    if (missingH1) issues.push('add a single visible <h1> display heading');
    if (skippedH) issues.push('restore sequential heading levels (h1 -> h2 -> h3 without skips)');
    if (smallBody.length > 0) issues.push('increase body font size to >= 14px (16px recommended)');
    if (wideP.length > 0) {
      issues.push(
        `constrain ${wideP.length} overly wide paragraph(s) (e.g. ${wideP[0].selector} at ${wideP[0].measured}) with max-w-[65ch] to <= 85ch`
      );
    }

    directives.push(`[Typography & Hierarchy] ${issues.join('; ')}.`);
  }

  const a11yViolations = violations.filter((v) => v.category === 'semantic_a11y');
  if (a11yViolations.length > 0) {
    const missingMain = a11yViolations.some((v) => v.message.includes('<main>'));
    const missingAlt = a11yViolations.filter((v) => v.message.includes('<img>')).length;
    const emptyBtn = a11yViolations.filter((v) => v.message.includes('<button>')).length;
    const unlabeledInput = a11yViolations.filter((v) => v.message.includes('<input>')).length;

    const fixes: string[] = [];
    if (missingMain) fixes.push('wrap primary page content in a semantic <main> landmark');
    if (missingAlt > 0) fixes.push(`add descriptive alt attributes to ${missingAlt} <img> element(s)`);
    if (emptyBtn > 0) fixes.push(`add visible text or aria-label to ${emptyBtn} icon-only <button> element(s)`);
    if (unlabeledInput > 0) fixes.push(`associate <label for> or aria-label with ${unlabeledInput} <input> control(s)`);

    directives.push(`[Semantic A11y] ${fixes.join('; ')}.`);
  }

  // Ensure 3-6 crisp directives even when the page is already clean
  const baselineDirectives: string[] = [
    `[Contrast Guardrail] Maintain APCA |Lc| >= 60 on all body text and >= 45 on display headings (current APCA score: ${scores.apcaContrast}/100).`,
    `[Typography Guardrail] Preserve >= 14px base copy, <= 85ch prose line measure, and a strict single-h1 sequential heading hierarchy (current score: ${scores.typographyMeasure}/100).`,
    `[Layout & A11y Guardrail] Keep zero horizontal overflow, >= 32x32px interactive hit targets, <main> landmark structure, and complete alt/aria-label coverage (layout: ${scores.layoutRhythm}/100, a11y: ${scores.semanticA11y}/100).`,
  ];

  for (const fallback of baselineDirectives) {
    if (directives.length >= 3) break;
    directives.push(fallback);
  }

  return directives.slice(0, 6);
}

export async function runComputedGeometryAudit(page: Page): Promise<GeometryAuditReport> {
  const startedAt = Date.now();

  const rawResult: RawBrowserAuditResult = await page.evaluate(() => {
    type RGBA = [number, number, number, number];
    type RGB = [number, number, number];

    const violations: Array<{
      id: string;
      category: 'apca_contrast' | 'typography_measure' | 'layout_rhythm' | 'semantic_a11y';
      severity: 'critical' | 'warning' | 'info';
      selector: string;
      message: string;
      measured: string;
      threshold: string;
      snippet?: string;
      rect?: { x: number; y: number; width: number; height: number };
    }> = [];

    const vw = window.innerWidth || document.documentElement.clientWidth || 1440;
    const vh = window.innerHeight || document.documentElement.clientHeight || 900;

    let idCounter = 0;
    function nextId(prefix: string): string {
      idCounter += 1;
      return `${prefix}-${idCounter}`;
    }

    function roundRect(rect: DOMRect): { x: number; y: number; width: number; height: number } {
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    function trimSnippet(text: string | null | undefined, maxLen = 72): string | undefined {
      if (!text) return undefined;
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (!cleaned) return undefined;
      return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
    }

    function buildSelector(el: Element): string {
      const tag = el.tagName.toLowerCase();
      if (el.id) {
        return `${tag}#${el.id.slice(0, 32)}`;
      }
      const classAttr = typeof el.className === 'string' ? el.className.trim() : '';
      const classes = classAttr
        ? classAttr
            .split(/\s+/)
            .filter((c) => c.length > 0 && !c.includes(':') && !c.includes('[') && c.length <= 28)
            .slice(0, 2)
        : [];
      const selfPart = classes.length > 0 ? `${tag}.${classes.join('.')}` : tag;

      const parent = el.parentElement;
      if (!parent || parent === document.documentElement) {
        return selfPart;
      }
      const parentTag = parent.tagName.toLowerCase();
      const parentId = parent.id ? `#${parent.id.slice(0, 24)}` : '';
      if (parentId) {
        return `${parentTag}${parentId} > ${selfPart}`;
      }
      let nth = 1;
      let sib = el.previousElementSibling;
      while (sib) {
        if (sib.tagName === el.tagName) nth += 1;
        sib = sib.previousElementSibling;
      }
      return nth > 1 ? `${parentTag} > ${selfPart}:nth-of-type(${nth})` : `${parentTag} > ${selfPart}`;
    }

    function isVisibleElement(el: Element, style: CSSStyleDeclaration, rect: DOMRect): boolean {
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      const opacity = Number.parseFloat(style.opacity || '1');
      if (!Number.isFinite(opacity) || opacity <= 0.01) return false;
      if (rect.width <= 0.5 || rect.height <= 0.5) return false;
      // Exclude sr-only clipped elements
      if (rect.width <= 1.5 && rect.height <= 1.5 && style.overflow === 'hidden') return false;
      return true;
    }

    function hasDirectText(el: Element): boolean {
      for (let i = 0; i < el.childNodes.length; i += 1) {
        const node = el.childNodes[i];
        if (node && node.nodeType === Node.TEXT_NODE) {
          if ((node.textContent || '').trim().length > 0) {
            return true;
          }
        }
      }
      return false;
    }

    function parseCssColor(raw: string): RGBA | null {
      const value = (raw || '').trim().toLowerCase();
      if (!value || value === 'transparent') return [0, 0, 0, 0];

      // rgb(r, g, b) / rgba(r, g, b, a) / rgb(r g b / a)
      const rgbMatch = value.match(
        /^rgba?\(\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)\s*[,\s]\s*([0-9.]+%?)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/
      );
      if (rgbMatch) {
        const parseChannel = (token: string): number => {
          if (token.endsWith('%')) {
            return Math.max(0, Math.min(255, (Number.parseFloat(token) / 100) * 255));
          }
          return Math.max(0, Math.min(255, Number.parseFloat(token)));
        };
        const parseAlpha = (token: string | undefined): number => {
          if (token === undefined) return 1;
          if (token.endsWith('%')) {
            return Math.max(0, Math.min(1, Number.parseFloat(token) / 100));
          }
          return Math.max(0, Math.min(1, Number.parseFloat(token)));
        };
        return [
          parseChannel(rgbMatch[1]),
          parseChannel(rgbMatch[2]),
          parseChannel(rgbMatch[3]),
          parseAlpha(rgbMatch[4]),
        ];
      }

      // color(srgb r g b / a)
      const srgbMatch = value.match(
        /^color\(\s*srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/
      );
      if (srgbMatch) {
        const alphaToken = srgbMatch[4];
        const alpha =
          alphaToken === undefined
            ? 1
            : alphaToken.endsWith('%')
              ? Math.max(0, Math.min(1, Number.parseFloat(alphaToken) / 100))
              : Math.max(0, Math.min(1, Number.parseFloat(alphaToken)));
        return [
          Math.max(0, Math.min(255, Number.parseFloat(srgbMatch[1]) * 255)),
          Math.max(0, Math.min(255, Number.parseFloat(srgbMatch[2]) * 255)),
          Math.max(0, Math.min(255, Number.parseFloat(srgbMatch[3]) * 255)),
          alpha,
        ];
      }

      return null;
    }

    function compositeOver(fg: RGBA, bg: RGBA): RGBA {
      const fgA = fg[3];
      const bgA = bg[3];
      const outA = fgA + bgA * (1 - fgA);
      if (outA <= 0.0001) return [255, 255, 255, 1];
      const r = (fg[0] * fgA + bg[0] * bgA * (1 - fgA)) / outA;
      const g = (fg[1] * fgA + bg[1] * bgA * (1 - fgA)) / outA;
      const b = (fg[2] * fgA + bg[2] * bgA * (1 - fgA)) / outA;
      return [r, g, b, outA];
    }

    function rgbToHex(rgb: RGB): string {
      const toHex = (n: number): string =>
        Math.max(0, Math.min(255, Math.round(n)))
          .toString(16)
          .padStart(2, '0');
      return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
    }

    function resolveEffectiveBackground(el: Element): RGB {
      const layers: RGBA[] = [];
      let cur: Element | null = el;
      let depth = 0;

      while (cur && depth < 32) {
        const cs = window.getComputedStyle(cur);
        const parsed = parseCssColor(cs.backgroundColor);
        const elemOpacity = Number.parseFloat(cs.opacity || '1');
        const safeOpacity = Number.isFinite(elemOpacity) ? Math.max(0, Math.min(1, elemOpacity)) : 1;

        if (parsed && parsed[3] > 0.001) {
          const effAlpha = parsed[3] * safeOpacity;
          layers.push([parsed[0], parsed[1], parsed[2], effAlpha]);
          if (effAlpha >= 0.999) {
            break;
          }
        }
        cur = cur.parentElement;
        depth += 1;
      }

      // Base canvas defaults to opaque white rgb(255, 255, 255)
      let acc: RGBA = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        acc = compositeOver(layers[i], acc);
      }
      return [acc[0], acc[1], acc[2]];
    }

    function resolveEffectiveForeground(el: Element, style: CSSStyleDeclaration, bg: RGB): RGB | null {
      const parsed = parseCssColor(style.color);
      if (!parsed) return null;

      // Skip gradient-clipped text (transparent fill with background-clip: text)
      const bgClip =
        style.getPropertyValue('-webkit-background-clip') ||
        style.getPropertyValue('background-clip') ||
        '';
      if (parsed[3] < 0.05 && bgClip.toLowerCase().includes('text')) {
        return null;
      }

      let combinedOpacity = 1;
      let cur: Element | null = el;
      let depth = 0;
      while (cur && depth < 16) {
        const op = Number.parseFloat(window.getComputedStyle(cur).opacity || '1');
        if (Number.isFinite(op)) {
          combinedOpacity *= Math.max(0, Math.min(1, op));
        }
        cur = cur.parentElement;
        depth += 1;
      }

      const effFg: RGBA = [parsed[0], parsed[1], parsed[2], parsed[3] * combinedOpacity];
      const composited = compositeOver(effFg, [bg[0], bg[1], bg[2], 1]);
      return [composited[0], composited[1], composited[2]];
    }

    // Inline APCA-W3 0.0.98G-4g luminance contrast formula (returns signed Lc in ~[-108, 106])
    function computeApcaLc(fg: RGB, bg: RGB): number {
      const mainTRC = 2.4;
      const sRco = 0.2126729;
      const sGco = 0.7151522;
      const sBco = 0.072175;
      const blkThrs = 0.022;
      const blkClmp = 1.414;
      const deltaYmin = 0.0005;
      const normBG = 0.56;
      const normTXT = 0.57;
      const revBG = 0.65;
      const revTXT = 0.62;
      const scaleBoW = 1.14;
      const scaleWoB = 1.14;
      const loBoWoffset = 0.027;
      const loWoBoffset = 0.027;
      const loClip = 0.1;

      const yTxtRaw =
        Math.pow(fg[0] / 255, mainTRC) * sRco +
        Math.pow(fg[1] / 255, mainTRC) * sGco +
        Math.pow(fg[2] / 255, mainTRC) * sBco;
      const yBgRaw =
        Math.pow(bg[0] / 255, mainTRC) * sRco +
        Math.pow(bg[1] / 255, mainTRC) * sGco +
        Math.pow(bg[2] / 255, mainTRC) * sBco;

      const yTxt = yTxtRaw > blkThrs ? yTxtRaw : yTxtRaw + Math.pow(blkThrs - yTxtRaw, blkClmp);
      const yBg = yBgRaw > blkThrs ? yBgRaw : yBgRaw + Math.pow(blkThrs - yBgRaw, blkClmp);

      if (Math.abs(yBg - yTxt) < deltaYmin) return 0;

      if (yBg > yTxt) {
        const sapc = (Math.pow(yBg, normBG) - Math.pow(yTxt, normTXT)) * scaleBoW;
        return sapc < loClip ? 0 : (sapc - loBoWoffset) * 100;
      }

      const sapc = (Math.pow(yBg, revBG) - Math.pow(yTxt, revTXT)) * scaleWoB;
      return sapc > -loClip ? 0 : (sapc + loWoBoffset) * 100;
    }

    const totalElementsScanned = document.querySelectorAll('*').length;

    // -------------------------------------------------------------------------
    // 1. REAL COMPUTED APCA CONTRAST AUDIT
    // -------------------------------------------------------------------------
    const textCandidates = Array.from(
      document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,span,li,label,td,th')
    );
    let textNodesAudited = 0;
    const heroTextBoxes: Array<{
      el: Element;
      parent: Element;
      rect: DOMRect;
      selector: string;
      snippet?: string;
    }> = [];

    for (let i = 0; i < textCandidates.length && textNodesAudited < 250; i += 1) {
      const el = textCandidates[i];
      if (!hasDirectText(el)) continue;

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (!isVisibleElement(el, style, rect)) continue;

      textNodesAudited += 1;

      const selector = buildSelector(el);
      const snippet = trimSnippet(el.textContent);

      if (el.parentElement && rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0) {
        heroTextBoxes.push({
          el,
          parent: el.parentElement,
          rect,
          selector,
          snippet,
        });
      }

      const bgRgb = resolveEffectiveBackground(el);
      const fgRgb = resolveEffectiveForeground(el, style, bgRgb);
      if (!fgRgb) continue;

      const fontSizePx = Number.parseFloat(style.fontSize || '16') || 16;
      const isHeading = /^H[1-6]$/.test(el.tagName);
      const isLargeOrHeading = isHeading || fontSizePx >= 18;
      const lc = computeApcaLc(fgRgb, bgRgb);
      const absLc = Math.abs(lc);

      if (!isLargeOrHeading) {
        if (absLc < 60) {
          const severity: 'critical' | 'warning' = absLc < 45 ? 'critical' : 'warning';
          violations.push({
            id: nextId('apca'),
            category: 'apca_contrast',
            severity,
            selector,
            message:
              severity === 'critical'
                ? 'Body text fails minimum APCA contrast (severe readability failure)'
                : 'Body text falls below recommended APCA readability contrast',
            measured: `|Lc| ${absLc.toFixed(1)} (${Math.round(fontSizePx)}px, fg ${rgbToHex(fgRgb)} on bg ${rgbToHex(bgRgb)})`,
            threshold: '|Lc| >= 60 (critical < 45)',
            snippet,
            rect: roundRect(rect),
          });
        }
      } else if (absLc < 45) {
        const severity: 'critical' | 'warning' = absLc < 35 ? 'critical' : 'warning';
        violations.push({
          id: nextId('apca'),
          category: 'apca_contrast',
          severity,
          selector,
          message: 'Heading or large text fails minimum APCA contrast threshold',
          measured: `|Lc| ${absLc.toFixed(1)} (${Math.round(fontSizePx)}px, fg ${rgbToHex(fgRgb)} on bg ${rgbToHex(bgRgb)})`,
          threshold: '|Lc| >= 45',
          snippet,
          rect: roundRect(rect),
        });
      }
    }

    // -------------------------------------------------------------------------
    // 2. TYPOGRAPHY & MEASURE AUDIT
    // -------------------------------------------------------------------------
    if (document.body) {
      const bodyStyle = window.getComputedStyle(document.body);
      const bodyFontSize = Number.parseFloat(bodyStyle.fontSize || '16') || 16;
      if (bodyFontSize < 14) {
        violations.push({
          id: nextId('typo'),
          category: 'typography_measure',
          severity: bodyFontSize < 12 ? 'critical' : 'warning',
          selector: 'body',
          message: 'Document body base font size is below readable minimum',
          measured: `${bodyFontSize.toFixed(1)}px`,
          threshold: '>= 14px',
        });
      }
    }

    const paragraphs = Array.from(document.querySelectorAll('p'));
    let smallParaCount = 0;
    for (let i = 0; i < paragraphs.length; i += 1) {
      const p = paragraphs[i];
      const text = (p.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length === 0) continue;

      const style = window.getComputedStyle(p);
      const rect = p.getBoundingClientRect();
      if (!isVisibleElement(p, style, rect)) continue;

      const fontSizePx = Number.parseFloat(style.fontSize || '16') || 16;
      if (fontSizePx < 14 && text.length >= 24 && smallParaCount < 5) {
        smallParaCount += 1;
        violations.push({
          id: nextId('typo'),
          category: 'typography_measure',
          severity: fontSizePx < 12 ? 'critical' : 'warning',
          selector: buildSelector(p),
          message: 'Paragraph font size is below 14px body text minimum',
          measured: `${fontSizePx.toFixed(1)}px`,
          threshold: '>= 14px',
          snippet: trimSnippet(text),
          rect: roundRect(rect),
        });
      }

      if (text.length > 100 && fontSizePx > 0) {
        const estimatedCh = rect.width / (fontSizePx * 0.55);
        if (estimatedCh > 85) {
          violations.push({
            id: nextId('typo'),
            category: 'typography_measure',
            severity: estimatedCh > 110 ? 'critical' : 'warning',
            selector: buildSelector(p),
            message: 'Long paragraph exceeds optimal reading measure (> 85ch)',
            measured: `~${Math.round(estimatedCh)}ch (${Math.round(rect.width)}px @ ${Math.round(fontSizePx)}px)`,
            threshold: '<= 85ch',
            snippet: trimSnippet(text),
            rect: roundRect(rect),
          });
        }
      }
    }

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter((h) => {
      const style = window.getComputedStyle(h);
      const rect = h.getBoundingClientRect();
      return isVisibleElement(h, style, rect) && (h.textContent || '').trim().length > 0;
    });

    const visibleH1s = headings.filter((h) => h.tagName === 'H1');
    if (visibleH1s.length === 0) {
      violations.push({
        id: nextId('typo'),
        category: 'typography_measure',
        severity: 'critical',
        selector: 'body',
        message: 'Page is missing a visible <h1> primary heading',
        measured: '0 visible <h1> elements',
        threshold: '>= 1 visible <h1>',
      });
    }

    let prevHeadingLevel = 0;
    for (let i = 0; i < headings.length; i += 1) {
      const h = headings[i];
      const level = Number.parseInt(h.tagName.slice(1), 10);
      if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
        violations.push({
          id: nextId('typo'),
          category: 'typography_measure',
          severity: 'warning',
          selector: buildSelector(h),
          message: `Skipped heading level from h${prevHeadingLevel} to h${level}`,
          measured: `h${prevHeadingLevel} -> h${level}`,
          threshold: 'Sequential heading levels (no skips)',
          snippet: trimSnippet(h.textContent),
          rect: roundRect(h.getBoundingClientRect()),
        });
      }
      prevHeadingLevel = level;
    }

    // -------------------------------------------------------------------------
    // 3. LAYOUT & SPATIAL RHYTHM AUDIT
    // -------------------------------------------------------------------------
    const docScrollWidth = Math.max(
      document.documentElement.scrollWidth || 0,
      document.body ? document.body.scrollWidth || 0 : 0
    );
    if (docScrollWidth > vw + 2) {
      violations.push({
        id: nextId('layout'),
        category: 'layout_rhythm',
        severity: 'critical',
        selector: 'html',
        message: 'Document has horizontal overflow beyond viewport width',
        measured: `scrollWidth ${docScrollWidth}px vs innerWidth ${vw}px (+${docScrollWidth - vw}px)`,
        threshold: `scrollWidth <= ${vw + 2}px`,
      });
    }

    const interactiveEls = Array.from(document.querySelectorAll('button, a'));
    let crampedCount = 0;
    for (let i = 0; i < interactiveEls.length && crampedCount < 15; i += 1) {
      const el = interactiveEls[i];
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (!isVisibleElement(el, style, rect)) continue;

      if (rect.height < 32 || rect.width < 32) {
        const isInlineProseLink =
          el.tagName === 'A' && style.display === 'inline' && el.closest('p, li') !== null;
        const severity: 'critical' | 'warning' | 'info' = isInlineProseLink
          ? 'info'
          : rect.height < 24 || rect.width < 24
            ? 'critical'
            : 'warning';

        crampedCount += 1;
        violations.push({
          id: nextId('layout'),
          category: 'layout_rhythm',
          severity,
          selector: buildSelector(el),
          message: 'Interactive tap target is smaller than 32x32px minimum',
          measured: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
          threshold: '>= 32x32px',
          snippet: trimSnippet(el.textContent || el.getAttribute('aria-label')),
          rect: roundRect(rect),
        });
      }
    }

    // Overlapping sibling text bounding boxes in the hero viewport
    const byParent = new Map<Element, typeof heroTextBoxes>();
    for (let i = 0; i < heroTextBoxes.length; i += 1) {
      const item = heroTextBoxes[i];
      const group = byParent.get(item.parent);
      if (group) {
        group.push(item);
      } else {
        byParent.set(item.parent, [item]);
      }
    }

    let overlapCount = 0;
    byParent.forEach((siblings) => {
      if (siblings.length < 2 || overlapCount >= 8) return;
      for (let i = 0; i < siblings.length && overlapCount < 8; i += 1) {
        for (let j = i + 1; j < siblings.length && overlapCount < 8; j += 1) {
          const a = siblings[i];
          const b = siblings[j];
          const overlapW = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          const overlapH = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
          if (overlapW > 4 && overlapH > 4) {
            overlapCount += 1;
            violations.push({
              id: nextId('layout'),
              category: 'layout_rhythm',
              severity: 'critical',
              selector: `${a.selector} <> ${b.selector}`,
              message: 'Sibling text bounding boxes overlap in hero viewport',
              measured: `${Math.round(overlapW)}x${Math.round(overlapH)}px overlap`,
              threshold: '0px sibling text overlap',
              snippet: a.snippet || b.snippet,
              rect: roundRect(a.rect),
            });
          }
        }
      }
    });

    // -------------------------------------------------------------------------
    // 4. SEMANTIC A11Y AUDIT
    // -------------------------------------------------------------------------
    const mainLandmark = document.querySelector('main, [role="main"]');
    if (!mainLandmark) {
      violations.push({
        id: nextId('a11y'),
        category: 'semantic_a11y',
        severity: 'warning',
        selector: 'body',
        message: 'Page is missing a semantic <main> landmark',
        measured: '0 <main> or [role="main"] elements',
        threshold: '>= 1 <main> landmark',
      });
    }

    const images = Array.from(document.querySelectorAll('img'));
    for (let i = 0; i < images.length; i += 1) {
      const img = images[i];
      if (img.getAttribute('aria-hidden') === 'true' || img.getAttribute('role') === 'presentation') {
        continue;
      }
      const style = window.getComputedStyle(img);
      const rect = img.getBoundingClientRect();
      if (!isVisibleElement(img, style, rect)) continue;

      if (!img.hasAttribute('alt')) {
        violations.push({
          id: nextId('a11y'),
          category: 'semantic_a11y',
          severity: 'critical',
          selector: buildSelector(img),
          message: 'Visible <img> element is missing an alt attribute',
          measured: 'alt attribute absent',
          threshold: 'alt attribute required on <img>',
          snippet: trimSnippet(img.getAttribute('src')),
          rect: roundRect(rect),
        });
      }
    }

    const buttons = Array.from(document.querySelectorAll('button'));
    for (let i = 0; i < buttons.length; i += 1) {
      const btn = buttons[i];
      const style = window.getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      if (!isVisibleElement(btn, style, rect)) continue;

      const textContent = (btn.textContent || '').trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').trim();
      const ariaLabelledBy = (btn.getAttribute('aria-labelledby') || '').trim();
      const titleAttr = (btn.getAttribute('title') || '').trim();
      const nestedImgAlt = btn.querySelector('img[alt]:not([alt=""])');

      if (!textContent && !ariaLabel && !ariaLabelledBy && !titleAttr && !nestedImgAlt) {
        violations.push({
          id: nextId('a11y'),
          category: 'semantic_a11y',
          severity: 'critical',
          selector: buildSelector(btn),
          message: 'Visible <button> has empty text content and no aria-label',
          measured: 'accessible name empty',
          threshold: 'non-empty text or aria-label required',
          rect: roundRect(rect),
        });
      }
    }

    const labels = Array.from(document.querySelectorAll('label[for]'));
    const labelForIds = new Set<string>();
    for (let i = 0; i < labels.length; i += 1) {
      const forVal = (labels[i].getAttribute('for') || '').trim();
      if (forVal) labelForIds.add(forVal);
    }

    const inputs = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])'
      )
    );
    for (let i = 0; i < inputs.length; i += 1) {
      const input = inputs[i];
      const style = window.getComputedStyle(input);
      const rect = input.getBoundingClientRect();
      if (!isVisibleElement(input, style, rect)) continue;

      const ariaLabel = (input.getAttribute('aria-label') || '').trim();
      const ariaLabelledBy = (input.getAttribute('aria-labelledby') || '').trim();
      const hasWrappingLabel = input.closest('label') !== null;
      const hasForLabel = Boolean(input.id && labelForIds.has(input.id));

      if (!ariaLabel && !ariaLabelledBy && !hasWrappingLabel && !hasForLabel) {
        violations.push({
          id: nextId('a11y'),
          category: 'semantic_a11y',
          severity: 'critical',
          selector: buildSelector(input),
          message: 'Visible <input> control has no associated <label> or aria-label',
          measured: `unlabeled input[type="${input.getAttribute('type') || 'text'}"]`,
          threshold: 'associated <label> or aria-label required',
          snippet: trimSnippet(input.getAttribute('placeholder') || input.getAttribute('name')),
          rect: roundRect(rect),
        });
      }
    }

    return {
      totalElementsScanned,
      textNodesAudited,
      viewport: { width: vw, height: vh },
      violations,
    };
  });

  const { deduped, capped } = deduplicateAndSortViolations(rawResult.violations);
  const categoryScores = computeCategoryScores(deduped);
  const overallScore = computeOverallScore(categoryScores);
  const engineeringFixDirectives = synthesizeEngineeringFixDirectives(deduped, categoryScores);
  const latencyMs = Math.max(0, Date.now() - startedAt);

  return {
    overallScore,
    categoryScores,
    totalElementsScanned: rawResult.totalElementsScanned,
    textNodesAudited: rawResult.textNodesAudited,
    violations: capped,
    engineeringFixDirectives,
    latencyMs,
    viewport: rawResult.viewport,
  };
}
