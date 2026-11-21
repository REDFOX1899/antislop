import dns from 'node:dns/promises';
import fsPromises from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { DecisionsScorecard } from '../../../shared/types.js';
import { BACKEND_ROOT, ENV } from '../config/env.js';

export const SCREENSHOTS_DIR = path.join(BACKEND_ROOT, 'screenshots');

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface ExtractedCssDna {
  title: string;
  bodyBg: string;
  bodyColor: string;
  displayFont: string;
  bodyFont: string;
  h1Size: string;
  bodySize: string;
  accentColors: string[];
  borderRadiusSample: string;
  hasAnimations: boolean;
}

export interface ReferenceWebsiteCapture {
  url: string;
  title: string;
  screenshotUrl: string;
  screenshotBase64: string;
  mimeType: 'image/jpeg';
  extractedCssSummary: string;
  cssDna: ExtractedCssDna;
  latencyMs: number;
}

export interface CaptureAuditOptions {
  includeMobile?: boolean;
  fullPage?: boolean;
  settleMs?: number;
  navigationTimeoutMs?: number;
}

export interface PuppeteerAuditCapture {
  desktopBase64: string;
  desktopUrl: string;
  desktopPath: string;
  mobileBase64?: string;
  mobileUrl?: string;
  mobilePath?: string;
  domAudit: DecisionsScorecard['domAudit'];
  consoleErrors: string[];
  viteOverlayError?: string;
  isBlankPage: boolean;
}

export interface CompositeOverlayResult {
  annotatedBase64: string;
  annotatedUrl: string;
  annotatedPath: string;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

function stripBase64Prefix(input: string): string {
  return input.replace(/^data:[^;]+;base64,/i, '').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map((n) => Number.parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
    if (a >= 224) return true; // multicast & reserved
    return false;
  }

  if (version === 6) {
    if (ip === '::' || ip === '::1') return true;
    // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254
    const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4Mapped) {
      return isPrivateOrReservedIp(v4Mapped[1]);
    }
    const firstHextet = ip.split(':')[0] || '';
    if (/^f[cd]/i.test(firstHextet)) return true; // fc00::/7 ULA
    if (/^fe[89ab]/i.test(firstHextet)) return true; // fe80::/10 link-local
    if (/^ff/i.test(firstHextet)) return true; // ff00::/8 multicast
    return false;
  }

  return false;
}

function isBlockedHostnameLiteral(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa') ||
    host === 'metadata' ||
    host === 'metadata.google.internal' ||
    host === 'metadata.goog'
  ) {
    return true;
  }
  if (net.isIP(host) !== 0) {
    return isPrivateOrReservedIp(host);
  }
  // Reject non-standard integer / hex / octal IP tricks (e.g. http://2130706433/ or 0x7f000001)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    return true;
  }
  return false;
}

async function validatePublicReferenceUrl(rawUrl: string): Promise<URL> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Reference URL is required');
  }

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`Invalid URL: "${trimmed}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol "${parsed.protocol}" — only http:// and https:// are allowed`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }

  const hostname = parsed.hostname;
  if (isBlockedHostnameLiteral(hostname)) {
    throw new Error(`Blocked unsafe or local host: "${hostname}"`);
  }

  // Resolve DNS and reject private/loopback/metadata targets (prevents DNS rebinding / internal SSRF)
  try {
    const records = await Promise.race([
      dns.lookup(hostname, { all: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`DNS lookup timed out for "${hostname}"`)), 3000)
      ),
    ]);
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error(`Could not resolve hostname "${hostname}"`);
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error(`Blocked private or reserved IP resolution for "${hostname}"`);
      }
    }
  } catch (err) {
    if (err instanceof Error && /Blocked|Could not resolve|timed out/i.test(err.message)) {
      throw err;
    }
    throw new Error(`Unable to resolve host "${hostname}"`);
  }

  return parsed;
}

function primaryFontName(fontFamily: string): string {
  const first = (fontFamily || '').split(',')[0] || '';
  return first.replace(/['"]/g, '').trim() || 'system-ui';
}

export class PuppeteerAuditor {
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;

  private async ensureScreenshotsDir(): Promise<void> {
    await fsPromises.mkdir(SCREENSHOTS_DIR, { recursive: true });
  }

  async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    if (this.launchPromise) {
      return this.launchPromise;
    }

    this.launchPromise = (async () => {
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined;
      const browser = await puppeteer.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      });

      browser.on('disconnected', () => {
        if (this.browser === browser) {
          this.browser = null;
        }
      });

      this.browser = browser;
      return browser;
    })();

    try {
      return await this.launchPromise;
    } finally {
      this.launchPromise = null;
    }
  }

  async captureAndAudit(
    url?: string,
    outputPrefix = `capture-${Date.now()}`,
    options?: CaptureAuditOptions
  ): Promise<PuppeteerAuditCapture> {
    await this.ensureScreenshotsDir();
    const targetUrl = url || `http://127.0.0.1:${ENV.TARGET_VITE_PORT}/preview/`;
    const safePrefix = sanitizeFilename(outputPrefix);
    const settleMs = options?.settleMs ?? 350;
    const navTimeout = options?.navigationTimeoutMs ?? 15_000;

    const browser = await this.ensureBrowser();
    const page: Page = await browser.newPage();

    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const locUrl = msg.location()?.url || '';
        if (/favicon\.ico(\?|$)/i.test(locUrl)) {
          return;
        }
        const text = msg.text();
        if (text && !consoleErrors.includes(text)) {
          consoleErrors.push(text.slice(0, 500));
        }
      }
    });

    page.on('pageerror', (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg && !consoleErrors.includes(msg)) {
        consoleErrors.push(`pageerror: ${msg.slice(0, 500)}`);
      }
    });

    try {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

      try {
        await page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: navTimeout,
        });
      } catch (navErr) {
        // Persistent Vite HMR WebSocket or slow external font can trigger networkidle2 timeout even after full render
        const msg = navErr instanceof Error ? navErr.message : String(navErr);
        if (!/timeout/i.test(msg)) {
          throw navErr;
        }
      }

      // Wait for Google Fonts / web fonts (capped at 3s so offline or slow CDNs never stall)
      await page
        .evaluate(async () => {
          if (document.fonts && document.fonts.ready) {
            await Promise.race([
              document.fonts.ready,
              new Promise<void>((resolve) => setTimeout(resolve, 3000)),
            ]);
          }
        })
        .catch(() => undefined);

      if (settleMs > 0) {
        await sleep(settleMs);
      }

      // Deterministic DOM audit
      const evalAudit = await page.evaluate(() => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const horizontalOverflowPx = Math.max(
          0,
          Math.round(document.documentElement.scrollWidth - window.innerWidth)
        );

        // Detect Vite error overlay if compilation/HMR failed
        let viteOverlayError: string | undefined;
        const overlay = document.querySelector('vite-error-overlay') as
          | (Element & { shadowRoot?: ShadowRoot | null })
          | null;
        if (overlay) {
          const shadowText = overlay.shadowRoot?.textContent?.trim();
          viteOverlayError = (shadowText || 'Vite error overlay detected').slice(0, 800);
        }

        // Count broken visible images
        let brokenImageCount = 0;
        const imgs = Array.from(document.querySelectorAll('img'));
        for (const img of imgs) {
          const style = window.getComputedStyle(img);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          if (!img.complete || img.naturalWidth === 0) {
            brokenImageCount += 1;
          }
        }

        // Detect significant bounding-box overlap (>25% intersection area) between non-ancestor visible text nodes
        const textSelector = 'h1, h2, h3, h4, h5, h6, p, button, a, label, li, span';
        const rawElements = Array.from(document.querySelectorAll(textSelector));
        const visibleTextEls: Array<{ el: Element; rect: DOMRect }> = [];

        for (const el of rawElements) {
          if (visibleTextEls.length >= 250) break;
          const style = window.getComputedStyle(el);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number.parseFloat(style.opacity || '1') < 0.05
          ) {
            continue;
          }

          // Check direct non-empty text content so wrapper containers do not false-positive
          let hasDirectText = false;
          for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim().length > 0) {
              hasDirectText = true;
              break;
            }
          }
          if (!hasDirectText) continue;

          const rect = el.getBoundingClientRect();
          if (rect.width < 4 || rect.height < 4) continue;
          // Ignore elements completely outside reasonable document bounds
          if (rect.bottom < 0 || rect.right < 0) continue;

          visibleTextEls.push({ el, rect });
        }

        let overlappingTextNodes = 0;
        for (let i = 0; i < visibleTextEls.length; i += 1) {
          const a = visibleTextEls[i];
          const areaA = a.rect.width * a.rect.height;
          if (areaA <= 0) continue;

          for (let j = i + 1; j < visibleTextEls.length; j += 1) {
            const b = visibleTextEls[j];
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;

            const ix = Math.max(
              0,
              Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
            );
            const iy = Math.max(
              0,
              Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
            );

            if (ix > 0 && iy > 0) {
              const interArea = ix * iy;
              const minArea = Math.min(areaA, b.rect.width * b.rect.height);
              if (minArea > 0 && interArea / minArea > 0.25) {
                overlappingTextNodes += 1;
              }
            }
          }
        }

        const bodyTextLength = (document.body?.innerText || '').trim().length;
        const rootChildren = document.getElementById('root')?.children.length ?? document.body?.children.length ?? 0;

        return {
          horizontalOverflowPx,
          overlappingTextNodes,
          brokenImageCount,
          viewportWidth,
          viewportHeight,
          viteOverlayError,
          isBlankPage: bodyTextLength === 0 && rootChildren === 0,
        };
      });

      if (evalAudit.viteOverlayError) {
        consoleErrors.push(`vite-error-overlay: ${evalAudit.viteOverlayError}`);
      }

      // Capture Desktop 1440x900 PNG
      const desktopFilename = `${safePrefix}-desktop.png`;
      const desktopPath = path.join(SCREENSHOTS_DIR, desktopFilename);
      const desktopRaw = await page.screenshot({
        type: 'png',
        fullPage: options?.fullPage ?? false,
      });
      const desktopBuffer = Buffer.from(desktopRaw);
      await fsPromises.writeFile(desktopPath, desktopBuffer);

      let mobileBase64: string | undefined;
      let mobileUrl: string | undefined;
      let mobilePath: string | undefined;

      if (options?.includeMobile) {
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
        await sleep(250);
        const mobileFilename = `${safePrefix}-mobile.png`;
        mobilePath = path.join(SCREENSHOTS_DIR, mobileFilename);
        const mobileRaw = await page.screenshot({
          type: 'png',
          fullPage: options?.fullPage ?? false,
        });
        const mobileBuffer = Buffer.from(mobileRaw);
        await fsPromises.writeFile(mobilePath, mobileBuffer);
        mobileBase64 = mobileBuffer.toString('base64');
        mobileUrl = `/artifacts/screenshots/${mobileFilename}`;
      }

      const domAudit: DecisionsScorecard['domAudit'] = {
        horizontalOverflowPx: evalAudit.horizontalOverflowPx,
        overlappingTextNodes: evalAudit.overlappingTextNodes,
        brokenImageCount: evalAudit.brokenImageCount,
        consoleErrorCount: consoleErrors.length,
        viewportWidth: evalAudit.viewportWidth,
        viewportHeight: evalAudit.viewportHeight,
      };

      return {
        desktopBase64: desktopBuffer.toString('base64'),
        desktopUrl: `/artifacts/screenshots/${desktopFilename}`,
        desktopPath,
        ...(mobileBase64 ? { mobileBase64, mobileUrl, mobilePath } : {}),
        domAudit,
        consoleErrors,
        ...(evalAudit.viteOverlayError ? { viteOverlayError: evalAudit.viteOverlayError } : {}),
        isBlankPage: evalAudit.isBlankPage,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async compositeCircleOverlay(
    baseScreenshotBase64: string,
    overlayPngBase64: string,
    outputFilename: string
  ): Promise<CompositeOverlayResult> {
    await this.ensureScreenshotsDir();
    const safeName = sanitizeFilename(
      outputFilename.endsWith('.png') ? outputFilename : `${outputFilename}.png`
    );

    const cleanBase = stripBase64Prefix(baseScreenshotBase64);
    const cleanOverlay = stripBase64Prefix(overlayPngBase64);

    const browser = await this.ensureBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent('<!doctype html><html><body style="margin:0;padding:0;"></body></html>');

      const compositedDataUrl = await page.evaluate(
        async ({ baseB64, overlayB64 }) => {
          const loadImg = (src: string): Promise<HTMLImageElement> =>
            new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error('Failed to load image for canvas composite'));
              img.src = src;
            });

          const [baseImg, overlayImg] = await Promise.all([
            loadImg(`data:image/png;base64,${baseB64}`),
            loadImg(`data:image/png;base64,${overlayB64}`),
          ]);

          const canvas = document.createElement('canvas');
          canvas.width = baseImg.naturalWidth || 1440;
          canvas.height = baseImg.naturalHeight || 900;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('2D canvas context unavailable');
          }

          ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
          ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/png');
        },
        { baseB64: cleanBase, overlayB64: cleanOverlay }
      );

      const annotatedBase64 = stripBase64Prefix(compositedDataUrl);
      const annotatedPath = path.join(SCREENSHOTS_DIR, safeName);
      await fsPromises.writeFile(annotatedPath, Buffer.from(annotatedBase64, 'base64'));

      return {
        annotatedBase64,
        annotatedUrl: `/artifacts/screenshots/${safeName}`,
        annotatedPath,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * Captures a live external website as a high-res 1440x900 JPEG moodboard anchor + extracts
   * real computed CSS DNA (palette, display/body fonts, type scale, accent colors, radii, motion).
   * Protected against SSRF (blocks localhost, private RFC1918, and cloud metadata IPs) and
   * bounded by a hard 10s overall capture budget so slow sites never hang.
   */
  async captureReferenceWebsite(rawUrl: string): Promise<ReferenceWebsiteCapture> {
    const startedAt = Date.now();
    const parsedUrl = await validatePublicReferenceUrl(rawUrl);
    await this.ensureScreenshotsDir();

    const hardDeadline = startedAt + 10_000;
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent(DESKTOP_USER_AGENT);
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

      // Block sub-requests or redirects targeting local/private/metadata addresses
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        try {
          const reqUrl = req.url();
          if (reqUrl.startsWith('http://') || reqUrl.startsWith('https://')) {
            const u = new URL(reqUrl);
            if (isBlockedHostnameLiteral(u.hostname)) {
              void req.abort('blockedbyclient');
              return;
            }
          }
          void req.continue();
        } catch {
          void req.abort('blockedbyclient');
        }
      });

      const navBudget = Math.max(2500, Math.min(7500, hardDeadline - Date.now() - 1800));
      let navTimedOut = false;
      try {
        await page.goto(parsedUrl.toString(), {
          waitUntil: 'domcontentloaded',
          timeout: navBudget,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/timeout/i.test(msg)) {
          navTimedOut = true;
        } else {
          throw err;
        }
      }

      // Verify final redirected URL isn't an unsafe host
      const finalUrl = page.url() || parsedUrl.toString();
      try {
        const finalParsed = new URL(finalUrl);
        if (
          (finalParsed.protocol === 'http:' || finalParsed.protocol === 'https:') &&
          isBlockedHostnameLiteral(finalParsed.hostname)
        ) {
          throw new Error(`Redirected to blocked host: "${finalParsed.hostname}"`);
        }
      } catch (err) {
        if (err instanceof Error && /Redirected to blocked/i.test(err.message)) {
          throw err;
        }
      }

      // Race document.fonts.ready + 1200ms visual settle strictly within hard 10s deadline
      const fontBudget = Math.max(0, Math.min(1400, hardDeadline - Date.now() - 1400));
      if (fontBudget > 150) {
        await page
          .evaluate(async (budgetMs: number) => {
            if (document.fonts && document.fonts.ready) {
              await Promise.race([
                document.fonts.ready,
                new Promise<void>((resolve) => setTimeout(resolve, budgetMs)),
              ]);
            }
          }, fontBudget)
          .catch(() => undefined);
      }

      const settleBudget = Math.max(0, Math.min(1200, hardDeadline - Date.now() - 900));
      if (settleBudget > 0) {
        await sleep(settleBudget);
      }

      if (navTimedOut) {
        const hasBody = await page
          .evaluate(() => Boolean(document.body && (document.body.innerText.trim().length > 0 || document.body.children.length > 0)))
          .catch(() => false);
        if (!hasBody) {
          throw new Error(`Timed out loading reference website "${parsedUrl.hostname}" within 10s`);
        }
      }

      // Extract real computed CSS DNA
      const cssDna = await page.evaluate((): ExtractedCssDna => {
        const toHexIfOpaque = (cssColor: string): string | null => {
          const m = cssColor.match(
            /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i
          );
          if (!m) return null;
          const alpha = m[4] !== undefined ? Number.parseFloat(m[4]) : 1;
          if (!Number.isFinite(alpha) || alpha < 0.15) return null;
          const r = Math.min(255, Math.max(0, Number.parseInt(m[1], 10)));
          const g = Math.min(255, Math.max(0, Number.parseInt(m[2], 10)));
          const b = Math.min(255, Math.max(0, Number.parseInt(m[3], 10)));
          const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
          return `#${hex(r)}${hex(g)}${hex(b)}`;
        };

        const body = document.body;
        const html = document.documentElement;
        const bodyStyle = body ? window.getComputedStyle(body) : window.getComputedStyle(html);
        const htmlStyle = window.getComputedStyle(html);

        const bodyBg =
          toHexIfOpaque(bodyStyle.backgroundColor) ||
          toHexIfOpaque(htmlStyle.backgroundColor) ||
          '#FFFFFF';
        const bodyColor = toHexIfOpaque(bodyStyle.color) || '#111111';

        const pickLargestVisible = (selector: string): Element | null => {
          let best: Element | null = null;
          let bestSize = 0;
          for (const el of Array.from(document.querySelectorAll(selector))) {
            const st = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (st.display === 'none' || st.visibility === 'hidden' || r.width < 10 || r.height < 10) {
              continue;
            }
            const px = Number.parseFloat(st.fontSize || '0') || 0;
            if (px > bestSize) {
              bestSize = px;
              best = el;
            }
          }
          return best;
        };

        const headingEl = pickLargestVisible('h1') || pickLargestVisible('h2') || body;

        const headingStyle = headingEl ? window.getComputedStyle(headingEl) : bodyStyle;
        const paragraphEl = document.querySelector('p');
        const bodyFontStyle = paragraphEl ? window.getComputedStyle(paragraphEl) : bodyStyle;

        const displayFont = headingStyle.fontFamily || bodyStyle.fontFamily || 'system-ui';
        const bodyFont = bodyFontStyle.fontFamily || bodyStyle.fontFamily || 'system-ui';
        const h1Size = headingStyle.fontSize || '48px';
        const bodySize = bodyFontStyle.fontSize || bodyStyle.fontSize || '16px';

        // Sample distinct accent colors from links and buttons
        const colorCounts = new Map<string, number>();
        const interactiveEls = Array.from(
          document.querySelectorAll('a, button, [role="button"], input[type="submit"]')
        ).slice(0, 120);

        const radiusCounts = new Map<string, number>();

        for (const el of interactiveEls) {
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden') continue;
          const bgHex = toHexIfOpaque(st.backgroundColor);
          const fgHex = toHexIfOpaque(st.color);
          if (bgHex && bgHex !== bodyBg && bgHex !== bodyColor) {
            colorCounts.set(bgHex, (colorCounts.get(bgHex) || 0) + 2);
          }
          if (fgHex && fgHex !== bodyBg && fgHex !== bodyColor) {
            colorCounts.set(fgHex, (colorCounts.get(fgHex) || 0) + 1);
          }
          const rad = (st.borderRadius || '').trim();
          if (rad && rad !== '0px' && rad !== 'none') {
            radiusCounts.set(rad, (radiusCounts.get(rad) || 0) + 1);
          }
        }

        // Also sample card/panel radii if buttons didn't yield enough samples
        if (radiusCounts.size === 0) {
          const cardEls = Array.from(document.querySelectorAll('section, article, div')).slice(0, 80);
          for (const el of cardEls) {
            const rad = (window.getComputedStyle(el).borderRadius || '').trim();
            if (rad && rad !== '0px' && rad !== 'none') {
              radiusCounts.set(rad, (radiusCounts.get(rad) || 0) + 1);
            }
          }
        }

        const accentColors = Array.from(colorCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([hex]) => hex)
          .slice(0, 5);

        const topRadius = Array.from(radiusCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
        const borderRadiusSample = topRadius || '0px';

        // Detect motion/animation affordances (CSS animations, transitions, SVG, canvas)
        let hasAnimations = Boolean(
          document.querySelector('canvas, svg animate, svg animateTransform, video')
        );
        if (!hasAnimations) {
          const sampleEls = Array.from(document.querySelectorAll('body, header, nav, main, section, a, button')).slice(0, 60);
          for (const el of sampleEls) {
            const st = window.getComputedStyle(el);
            const hasAnimName = st.animationName && st.animationName !== 'none';
            const transDur = Number.parseFloat(st.transitionDuration || '0');
            if (hasAnimName || (Number.isFinite(transDur) && transDur > 0.05)) {
              hasAnimations = true;
              break;
            }
          }
        }
        if (!hasAnimations && document.querySelectorAll('svg').length >= 3) {
          hasAnimations = true;
        }

        return {
          title: (document.title || window.location.hostname || '').trim().slice(0, 140),
          bodyBg,
          bodyColor,
          displayFont,
          bodyFont,
          h1Size,
          bodySize,
          accentColors,
          borderRadiusSample,
          hasAnimations,
        };
      });

      const filename = `ref-${Date.now()}.jpg`;
      const filePath = path.join(SCREENSHOTS_DIR, filename);
      const jpegRaw = await page.screenshot({
        type: 'jpeg',
        quality: 85,
        fullPage: false,
      });
      const jpegBuffer = Buffer.from(jpegRaw);
      await fsPromises.writeFile(filePath, jpegBuffer);

      const displayPrimary = primaryFontName(cssDna.displayFont);
      const bodyPrimary = primaryFontName(cssDna.bodyFont);
      const accentText =
        cssDna.accentColors.length > 0 ? cssDna.accentColors.join(', ') : 'monochrome';
      const extractedCssSummary = [
        `Canvas ${cssDna.bodyBg} / Ink ${cssDna.bodyColor}`,
        `Display: ${displayPrimary} (${cssDna.h1Size})`,
        `Body: ${bodyPrimary} (${cssDna.bodySize})`,
        `Accents: ${accentText}`,
        `Radius: ${cssDna.borderRadiusSample}`,
        `Motion: ${cssDna.hasAnimations ? 'detected' : 'static'}`,
      ].join(' · ');

      return {
        url: finalUrl,
        title: cssDna.title || parsedUrl.hostname,
        screenshotUrl: `/artifacts/screenshots/${filename}`,
        screenshotBase64: jpegBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        extractedCssSummary,
        cssDna,
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      const b = this.browser;
      this.browser = null;
      await b.close().catch(() => undefined);
    }
  }
}

export const puppeteerAuditor = new PuppeteerAuditor();
