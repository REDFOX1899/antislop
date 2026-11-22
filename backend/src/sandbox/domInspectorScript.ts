import type { Page } from 'puppeteer';

export interface InspectedDomNode {
  tag: string;
  id?: string;
  className?: string;
  selector: string;
  textSnippet: string;
  rect: { x: number; y: number; width: number; height: number };
  computedStyles: {
    color: string;
    backgroundColor: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    padding: string;
    borderRadius: string;
  };
  reactComponentName?: string;
  sourceFile?: string;
  sourceLine?: number;
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
  weight: number;
}

interface RawPointInspection {
  node: InspectedDomNode;
  hitCount: number;
  score: number;
  isRootContainer: boolean;
}

interface ReactDebugSource {
  fileName?: unknown;
  lineNumber?: unknown;
}

interface ReactComponentTypeLike {
  displayName?: unknown;
  name?: unknown;
  render?: { displayName?: unknown; name?: unknown };
  type?: { displayName?: unknown; name?: unknown };
}

interface ReactFiberNode {
  type?: unknown;
  return?: ReactFiberNode | null;
  _debugSource?: ReactDebugSource | null;
  _debugOwner?: ReactFiberNode | null;
  _debugStack?: { stack?: unknown } | null;
}

const MAX_REGION_NODES = 6;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Evaluates one or more normalized [0..1] viewport coordinates inside the live
 * Puppeteer page in a single atomic roundtrip, deduplicating DOM elements and
 * enriching each hit with computed styles, a concise CSS selector, and React
 * Dev Fiber source metadata when available.
 */
async function inspectNormalizedPointsInPage(
  page: Page,
  points: NormalizedPoint[],
): Promise<RawPointInspection[]> {
  if (points.length === 0) return [];

  return page.evaluate((samplePoints: NormalizedPoint[]): RawPointInspection[] => {
    const viewportWidth = Math.max(
      1,
      window.innerWidth || document.documentElement?.clientWidth || 1,
    );
    const viewportHeight = Math.max(
      1,
      window.innerHeight || document.documentElement?.clientHeight || 1,
    );

    const escapeIdent = (ident: string): string => {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(ident);
      }
      return ident.replace(/([^\w-])/g, '\\$1');
    };

    const getElementClassString = (el: Element): string => {
      const raw = el.getAttribute('class');
      if (typeof raw === 'string') return raw.trim();
      const cn = (el as HTMLElement).className;
      if (typeof cn === 'string') return cn.trim();
      if (cn && typeof cn === 'object' && 'baseVal' in cn) {
        const baseVal = (cn as { baseVal?: unknown }).baseVal;
        return typeof baseVal === 'string' ? baseVal.trim() : '';
      }
      return '';
    };

    const buildCssSelector = (target: Element): string => {
      const parts: string[] = [];
      let current: Element | null = target;
      let depth = 0;

      while (current && depth < 5) {
        const tag = current.tagName.toLowerCase();
        if (current.id) {
          parts.unshift(`${tag}#${escapeIdent(current.id)}`);
          break;
        }

        const classTokens = getElementClassString(current)
          .split(/\s+/)
          .filter((token) => token.length > 0 && !token.includes('[') && !token.includes(':'))
          .slice(0, 2);

        let segment = tag;
        if (classTokens.length > 0) {
          segment += classTokens.map((token) => `.${escapeIdent(token)}`).join('');
        }

        const parent: Element | null = current.parentElement;
        if (parent) {
          const sameTagSiblings = Array.from(parent.children).filter(
            (child) => child.tagName === current?.tagName,
          );
          if (sameTagSiblings.length > 1) {
            const index = sameTagSiblings.indexOf(current) + 1;
            if (index > 0) {
              segment += `:nth-of-type(${index})`;
            }
          }
        }

        parts.unshift(segment);
        if (tag === 'body' || tag === 'html') break;
        current = parent;
        depth += 1;
      }

      return parts.join(' > ');
    };

    const extractTextSnippet = (el: Element): string => {
      const directText = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (directText.length > 0) {
        return directText.length > 120 ? `${directText.slice(0, 117)}...` : directText;
      }
      const fallbackAttr =
        el.getAttribute('aria-label') ||
        el.getAttribute('alt') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        '';
      const cleaned = fallbackAttr.replace(/\s+/g, ' ').trim();
      return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned;
    };

    const extractComponentName = (fiberType: unknown): string | undefined => {
      if (typeof fiberType === 'function') {
        const fn = fiberType as ReactComponentTypeLike;
        if (typeof fn.displayName === 'string' && fn.displayName.trim()) {
          return fn.displayName.trim();
        }
        if (typeof fn.name === 'string' && fn.name.trim()) {
          return fn.name.trim();
        }
        return undefined;
      }

      if (fiberType && typeof fiberType === 'object') {
        const obj = fiberType as ReactComponentTypeLike;
        if (typeof obj.displayName === 'string' && obj.displayName.trim()) {
          return obj.displayName.trim();
        }
        if (obj.render) {
          if (typeof obj.render.displayName === 'string' && obj.render.displayName.trim()) {
            return obj.render.displayName.trim();
          }
          if (typeof obj.render.name === 'string' && obj.render.name.trim()) {
            return obj.render.name.trim();
          }
        }
        if (obj.type) {
          if (typeof obj.type.displayName === 'string' && obj.type.displayName.trim()) {
            return obj.type.displayName.trim();
          }
          if (typeof obj.type.name === 'string' && obj.type.name.trim()) {
            return obj.type.name.trim();
          }
        }
      }

      return undefined;
    };

    const normalizeSourceFile = (rawFile: string): string => {
      const trimmed = rawFile.trim();
      // Strip Vite / browser origin prefix such as http://localhost:5173/src/App.tsx?t=...
      const withoutQuery = trimmed.split('?')[0] ?? trimmed;
      const originMatch = withoutQuery.match(/^https?:\/\/[^/]+\/(.+)$/);
      if (originMatch && originMatch[1]) {
        return originMatch[1];
      }
      return withoutQuery;
    };

    const parseDebugStackSource = (
      debugStack: { stack?: unknown } | null | undefined,
    ): { sourceFile: string; sourceLine?: number } | undefined => {
      if (!debugStack || typeof debugStack.stack !== 'string') return undefined;
      const lines = debugStack.stack.split('\n');
      for (const line of lines) {
        if (line.includes('node_modules') || line.includes('react-dom')) continue;
        const match = line.match(/\(?((?:https?:\/\/[^\s)]+|\/[^\s)]+|[A-Za-z]:\\[^\s)]+)):(\d+)(?::\d+)?\)?/);
        if (match && match[1]) {
          const parsedLine = Number.parseInt(match[2] ?? '', 10);
          return {
            sourceFile: normalizeSourceFile(match[1]),
            sourceLine: Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : undefined,
          };
        }
      }
      return undefined;
    };

    const extractReactMetadata = (
      el: Element,
    ): { reactComponentName?: string; sourceFile?: string; sourceLine?: number } => {
      let reactComponentName: string | undefined;
      let sourceFile: string | undefined;
      let sourceLine: number | undefined;

      // Locate React Fiber attached to this element or a close DOM ancestor.
      let fiber: ReactFiberNode | null = null;
      let cursor: Element | null = el;
      let domHops = 0;
      while (cursor && !fiber && domHops < 4) {
        const record = cursor as unknown as Record<string, unknown>;
        const fiberKey = Object.keys(record).find(
          (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'),
        );
        if (fiberKey) {
          const candidate = record[fiberKey];
          if (candidate && typeof candidate === 'object') {
            fiber = candidate as ReactFiberNode;
          }
        }
        cursor = cursor.parentElement;
        domHops += 1;
      }

      let currentFiber: ReactFiberNode | null = fiber;
      let fiberHops = 0;
      while (currentFiber && fiberHops < 30) {
        if (!sourceFile && currentFiber._debugSource) {
          const fileName = currentFiber._debugSource.fileName;
          const lineNumber = currentFiber._debugSource.lineNumber;
          if (typeof fileName === 'string' && fileName.trim().length > 0) {
            sourceFile = normalizeSourceFile(fileName);
            if (typeof lineNumber === 'number' && Number.isFinite(lineNumber) && lineNumber > 0) {
              sourceLine = Math.round(lineNumber);
            }
          }
        }

        if (!sourceFile && currentFiber._debugStack) {
          const fromStack = parseDebugStackSource(currentFiber._debugStack);
          if (fromStack) {
            sourceFile = fromStack.sourceFile;
            sourceLine = fromStack.sourceLine;
          }
        }

        if (!reactComponentName) {
          const name = extractComponentName(currentFiber.type);
          if (name && name !== 'Fragment' && name !== 'Suspense' && name !== 'StrictMode') {
            reactComponentName = name;
          }
        }

        if (reactComponentName && sourceFile) break;

        currentFiber = currentFiber.return ?? currentFiber._debugOwner ?? null;
        fiberHops += 1;
      }

      // Optional data-attribute fallback when instrumented at build time.
      if (!sourceFile) {
        const dataFile = el.getAttribute('data-source-file');
        if (dataFile && dataFile.trim()) {
          sourceFile = normalizeSourceFile(dataFile);
        }
      }
      if (!sourceLine) {
        const dataLine = el.getAttribute('data-source-line');
        if (dataLine) {
          const parsed = Number.parseInt(dataLine, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            sourceLine = parsed;
          }
        }
      }
      if (!reactComponentName) {
        const dataComponent = el.getAttribute('data-component');
        if (dataComponent && dataComponent.trim()) {
          reactComponentName = dataComponent.trim();
        }
      }

      return { reactComponentName, sourceFile, sourceLine };
    };

    const serializeElement = (el: Element): InspectedDomNode => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      const className = getElementClassString(el);
      const reactMeta = extractReactMetadata(el);

      const inspected: InspectedDomNode = {
        tag: el.tagName.toLowerCase(),
        selector: buildCssSelector(el),
        textSnippet: extractTextSnippet(el),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        computedStyles: {
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontWeight: styles.fontWeight,
          padding: styles.padding,
          borderRadius: styles.borderRadius,
        },
      };

      if (el.id) {
        inspected.id = el.id;
      }
      if (className) {
        inspected.className = className;
      }
      if (reactMeta.reactComponentName) {
        inspected.reactComponentName = reactMeta.reactComponentName;
      }
      if (reactMeta.sourceFile) {
        inspected.sourceFile = reactMeta.sourceFile;
      }
      if (typeof reactMeta.sourceLine === 'number') {
        inspected.sourceLine = reactMeta.sourceLine;
      }

      return inspected;
    };

    const interactiveOrSemanticTags = new Set([
      'a',
      'button',
      'input',
      'select',
      'textarea',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'img',
      'svg',
      'nav',
      'header',
      'footer',
      'section',
      'article',
      'form',
      'table',
      'li',
      'label',
    ]);

    const hitsByElement = new Map<
      Element,
      { node: InspectedDomNode; hitCount: number; weightSum: number }
    >();

    for (const pt of samplePoints) {
      const px = Math.min(viewportWidth - 1, Math.max(0, Math.round(pt.x * viewportWidth)));
      const py = Math.min(viewportHeight - 1, Math.max(0, Math.round(pt.y * viewportHeight)));
      const el = document.elementFromPoint(px, py);
      if (!el) continue;

      const existing = hitsByElement.get(el);
      if (existing) {
        existing.hitCount += 1;
        existing.weightSum += pt.weight;
      } else {
        hitsByElement.set(el, {
          node: serializeElement(el),
          hitCount: 1,
          weightSum: pt.weight,
        });
      }
    }

    const viewportArea = viewportWidth * viewportHeight;
    const results: RawPointInspection[] = [];

    for (const { node, hitCount, weightSum } of hitsByElement.values()) {
      const isRootContainer = node.tag === 'html' || node.tag === 'body';
      const elementArea = Math.max(1, node.rect.width * node.rect.height);
      const areaRatio = elementArea / viewportArea;

      let score = weightSum * 10 + hitCount * 4;
      if (node.reactComponentName) score += 6;
      if (node.sourceFile) score += 4;
      if (interactiveOrSemanticTags.has(node.tag)) score += 3;
      if (node.textSnippet.length > 0) score += 2;
      // Penalize full-viewport background wrappers so specific components surface first.
      if (areaRatio > 0.85) score -= 8;
      if (isRootContainer) score -= 20;

      results.push({
        node,
        hitCount,
        score,
        isRootContainer,
      });
    }

    return results;
  }, points);
}

/**
 * Resolves normalized [0..1] canvas coordinates to the live DOM element at that
 * point, returning its selector, bounding rect, computed styles, and React Dev
 * Fiber component/source location metadata when running a React/Vite app.
 */
export async function inspectNormalizedPoint(
  page: Page,
  normX: number,
  normY: number,
): Promise<InspectedDomNode | null> {
  const x = clampUnit(normX);
  const y = clampUnit(normY);

  const results = await inspectNormalizedPointsInPage(page, [{ x, y, weight: 1 }]);
  return results[0]?.node ?? null;
}

/**
 * Samples a 3x3 grid inside the normalized [0..1] circled bounding box,
 * deduplicates unique DOM nodes, and returns up to 6 most relevant elements
 * ordered by spatial relevance and component specificity.
 */
export async function inspectCircledRegion(
  page: Page,
  box: NormalizedBox,
): Promise<InspectedDomNode[]> {
  const left = clampUnit(box.x);
  const top = clampUnit(box.y);
  const width = Math.max(0, Math.min(1 - left, Number.isFinite(box.width) ? box.width : 0));
  const height = Math.max(0, Math.min(1 - top, Number.isFinite(box.height) ? box.height : 0));

  const fractions = [0.2, 0.5, 0.8];
  const gridPoints: NormalizedPoint[] = [];

  for (const fy of fractions) {
    for (const fx of fractions) {
      const isCenter = fx === 0.5 && fy === 0.5;
      const isAxisMid = fx === 0.5 || fy === 0.5;
      gridPoints.push({
        x: clampUnit(left + width * fx),
        y: clampUnit(top + height * fy),
        weight: isCenter ? 2.0 : isAxisMid ? 1.3 : 1.0,
      });
    }
  }

  const rawHits = await inspectNormalizedPointsInPage(page, gridPoints);
  if (rawHits.length === 0) return [];

  const hasNonRoot = rawHits.some((item) => !item.isRootContainer);
  const filtered = hasNonRoot ? rawHits.filter((item) => !item.isRootContainer) : rawHits;

  filtered.sort((a, b) => b.score - a.score || b.hitCount - a.hitCount);

  const seenSelectors = new Set<string>();
  const deduped: InspectedDomNode[] = [];
  for (const item of filtered) {
    if (seenSelectors.has(item.node.selector)) continue;
    seenSelectors.add(item.node.selector);
    deduped.push(item.node);
    if (deduped.length >= MAX_REGION_NODES) break;
  }

  return deduped;
}
