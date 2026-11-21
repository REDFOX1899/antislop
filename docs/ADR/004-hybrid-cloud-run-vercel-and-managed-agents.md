# ADR-004: Hybrid Production Topology (Vercel + Google Cloud Run) & Antigravity Managed Agents

- **Status:** Accepted
- **Date:** 2026-11-21
- **Context:** AntiSlop edits real files on disk, runs a live Vite HMR dev server, executes headless Chromium via Puppeteer, and supports shipping verified taste upgrades to arbitrary remote GitHub repositories.

## Decision
1. **AntiSlop Studio (`/studio`, Next.js)** → **Vercel** (or Firebase Hosting) with optional custom domain (e.g., `antislop.fde.guru` via Cloudflare DNS). Zero-latency edge delivery for the UI.
2. **AntiSlop Engine (`/backend` + embedded `/target-repo` + Chromium)** → **Google Cloud Run** under `patilshantanu1899@gmail.com` (`4 vCPU / 8 GiB RAM`, session affinity enabled, WebSocket support, single HTTPS origin serving both `/api/*` and `/preview/*` reverse-proxied to embedded Vite HMR). Serverless platforms like Vercel Functions cannot keep Chromium + persistent Vite HMR alive; Cloud Run handles containerized real-time stateful demos cleanly with automatic TLS.
3. **Artifact Persistence** → **Google Cloud Storage (GCS)** (optional in local dev, enabled in prod) for moodboard uploads, before/after Puppeteer captures, and shareable benchmark reports.
4. **Remote GitHub Repository Shipping ($5K Managed Agents Track)** → **Google-Hosted Antigravity Managed Agent** (`antigravity-preview-09-2026`, registered via `client.agents.create` as `antislop-repo-surgeon` on `v1beta`) with `environment: "remote"` mounting external GitHub repos cleanly in Google's Linux sandbox and gating edits with `npm run build` verification.

## Consequences
- Instant local zero-latency demo during judging AND a live, publicly accessible production URL (`https://...`) for judges to test on their own devices.
- Direct, authentic integration of Managed Agents without adding latency to the sub-second local Vite HMR editing loop.
