# AntiSlop Production Deployment Guide (`antislop.live` + `api.antislop.live`)

AntiSlop runs on a hybrid edge + container production topology designed for sub-second UI responsiveness and stateful Vite HMR + headless Chromium visual auditing:

| Surface | Host / Domain | Hosting Platform | Role |
| :--- | :--- | :--- | :--- |
| **AntiSlop Studio (`/studio`)** | `https://antislop.live` (`www.antislop.live`) | **Vercel** (Next.js App Router) | Live multimodal canvas IDE (moodboards, webcam, voice, Circle-to-Tweak, telemetry) |
| **AntiSlop Engine (`/backend`)** | `https://api.antislop.live` | **Google Cloud Run** (`us-central1`, `4 vCPU / 8 GiB RAM`, `--session-affinity`) | Gemini 4 multi-model orchestrator (`/api/*`), Puppeteer/Nano Banana artifacts (`/artifacts/*`), and embedded Vite HMR reverse proxy (`/preview/*` over HTTP + WebSocket) |

---

## Step 1 — Deploy AntiSlop Engine to Google Cloud Run (`api.antislop.live`)

1. Ensure `env/.env` contains your Tier 3 `GEMINI_API_KEY` (and optional `GEMINI_API_KEY_SECONDARY`, `GITHUB_TOKEN`, `LANGSMITH_API_KEY`).
2. Authenticate the target personal GCP account (`patilshantanu1899@gmail.com`) and project (`gitunderstand`):

```bash
gcloud auth login patilshantanu1899@gmail.com
gcloud config set project gitunderstand
```

3. Run the one-command deployment script from the repository root:

```bash
# Optional pre-flight validation (prints redacted config, makes no cloud changes)
./deploy/deploy-cloudrun.sh --dry-run

# Build multi-stage container via Cloud Build & deploy to Cloud Run
./deploy/deploy-cloudrun.sh
```

This provisions `antislop-engine` in `us-central1` with:
- `--memory=8Gi`, `--cpu=4`, `--cpu-boost`
- `--session-affinity` *(keeps browser iframe HMR WebSockets, SSE streams, and target workspace state pinned to the same instance)*
- `--timeout=900`, `--allow-unauthenticated`
- `CORS_ORIGIN=https://antislop.live,https://www.antislop.live,http://localhost:3000`

---

## Step 2 — Map `api.antislop.live` to Cloud Run (GoDaddy DNS)

1. Verify domain ownership of `antislop.live` in Google Cloud (one-time if not already verified under `patilshantanu1899@gmail.com`):

```bash
gcloud domains verify antislop.live --project=gitunderstand
```
*(Follow the Google Search Console prompt to add the Google verification `TXT` record in GoDaddy DNS for `@`, then click **Verify**.)*

2. Create the Cloud Run custom domain mapping:

```bash
gcloud beta run domain-mappings create \
  --service=antislop-engine \
  --domain=api.antislop.live \
  --region=us-central1 \
  --project=gitunderstand
```

3. Inspect the exact DNS records returned by Cloud Run:

```bash
gcloud beta run domain-mappings describe \
  --domain=api.antislop.live \
  --region=us-central1 \
  --project=gitunderstand
```

4. Add the following record in **GoDaddy → Domain Portfolio → `antislop.live` → DNS → DNS Records**:

| Type | Name | Value | TTL |
| :--- | :--- | :--- | :--- |
| **CNAME** | `api` | `ghs.googlehosted.com` | `600` (10 min) |

Cloud Run automatically provisions and renews a managed TLS certificate for `https://api.antislop.live` (typically 5–15 minutes after DNS propagation).

---

## Step 3 — Deploy AntiSlop Studio (`/studio`) to Vercel (`antislop.live`)

1. Import `https://github.com/REDFOX1899/antislop` in **Vercel → Add New Project**.
2. Configure Build & Root Directory settings:
   - **Framework Preset:** `Next.js` *(also pinned in `studio/vercel.json`)*
   - **Root Directory:** `studio`
3. Add **Production Environment Variables** in Vercel Project Settings:

| Key | Value |
| :--- | :--- |
| `NEXT_PUBLIC_BACKEND_URL` | `https://api.antislop.live` |
| `NEXT_PUBLIC_PREVIEW_URL` | `https://api.antislop.live/preview` |

4. Deploy! *(Or deploy directly via CLI: `cd studio && npx vercel --prod`)*

---

## Step 4 — Map `antislop.live` & `www.antislop.live` in GoDaddy DNS to Vercel

1. In **Vercel → Project Settings → Domains**, add `antislop.live` (primary) and `www.antislop.live` (redirect to `antislop.live`).
2. In **GoDaddy → `antislop.live` → DNS Records**, remove any default GoDaddy parking `A` / forwarding records for `@` and add:

| Type | Name | Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` | `76.76.21.21` | `600` | Apex domain `antislop.live` → Vercel Edge |
| **CNAME** | `www` | `cname.vercel-dns.com` | `600` | `www.antislop.live` → Vercel Edge |
| **CNAME** | `api` | `ghs.googlehosted.com` | `600` | `api.antislop.live` → Google Cloud Run |
| **TXT** | `@` | `google-site-verification=...` | `600` | Google Cloud Run domain ownership proof |

---

## Step 5 — Post-Deploy Verification Checklist

```bash
# 1. Verify Cloud Run API health & Gemini 4 pool status
curl -fsS https://api.antislop.live/api/health | jq .

# 2. Verify embedded Vite HMR preview proxy serves HTML cleanly
curl -fsSI https://api.antislop.live/preview/

# 3. Verify CORS allows https://antislop.live
curl -fsSI -X OPTIONS \
  -H "Origin: https://antislop.live" \
  -H "Access-Control-Request-Method: POST" \
  https://api.antislop.live/api/transform

# 4. Run 5-Sigma benchmark suite against live production engine (optional)
cd benchmarks && npm run run:fast -- --url https://api.antislop.live
```
