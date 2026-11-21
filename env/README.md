# Environment Configuration (`env/`)

> **Security Notice:** `https://github.com/REDFOX1899/antislop` is a **public** repository.  
> **NEVER** commit `env/.env` or any file containing real API keys. `.gitignore` explicitly blocks `env/.env` and `env/.env.*` (except `env/.env.example`).

## Setup (30 Seconds)

1. Copy the template:
   ```bash
   cp env/.env.example env/.env
   ```
2. Open `env/.env` and fill in at minimum:
   - `GEMINI_API_KEY` — Primary Tier 3 key from `ai.dev` (`gemini4nyc26nyc-2215`)
   - `GEMINI_API_KEY_SECONDARY` *(optional but recommended)* — Second Tier 3 key for parallel Best-of-N candidate racing & 5-Sigma benchmarks
3. Optional integrations:
   - `GCP_PROJECT_ID` & `GCS_ARTIFACT_BUCKET` — For Cloud Run deployment & persistent screenshot/benchmark storage under your GCP workspace
   - `LANGSMITH_API_KEY` + `LANGSMITH_TRACING=true` — If you want live trace graphs of every Gemini 4 & Decisions API step
   - `GITHUB_TOKEN` — Enables the Antigravity Managed Agent to open PRs on external repositories
