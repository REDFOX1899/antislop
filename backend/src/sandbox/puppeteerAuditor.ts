import fsPromises from 'node:fs/promises';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { DecisionsScorecard } from '../../../shared/types.js';
import { BACKEND_ROOT, ENV } from '../config/env.js';

export const SCREENSHOTS_DIR = path.join(BACKEND_ROOT, 'screenshots');

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

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      const b = this.browser;
      this.browser = null;
      await b.close().catch(() => undefined);
    }
  }
}

export const puppeteerAuditor = new PuppeteerAuditor();
