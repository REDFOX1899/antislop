# =============================================================================
# AntiSlop Engine — Production Multi-Stage Dockerfile for Google Cloud Run
# =============================================================================
# Build context MUST be the repository root:
#   docker build -f deploy/Dockerfile -t antislop-engine .
#
# Serves on $PORT (8080 on Cloud Run):
#   - /api/*        Express REST & SSE endpoints (Gemini 4 + Decisions API + Managed Agents)
#   - /artifacts/*  Puppeteer screenshots & Nano Banana bespoke visual assets
#   - /preview/*    Reverse-proxied embedded Vite HMR dev server (HTTP + WebSocket)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder — compile /backend TypeScript & install Linux dependencies
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Skip Puppeteer's bundled Chromium download (system Debian Chromium is installed in runtime)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    CI=true

# 1. Copy shared TypeScript contract
COPY shared/ /app/shared/

# 2. Install /backend dependencies (Linux-native modules) & compile TypeScript
COPY backend/package.json backend/package-lock.json* backend/tsconfig.json /app/backend/
WORKDIR /app/backend
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY backend/src/ /app/backend/src/
RUN npm run build

# 3. Copy & install Linux dependencies for /target-repo (embedded Vite HMR)
WORKDIR /app
COPY target-repo/ /app/target-repo/
RUN rm -rf /app/target-repo/node_modules /app/target-repo/dist /app/target-repo/public/generated \
 && mkdir -p /app/target-repo/public/generated \
 && cd /app/target-repo \
 && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# 4. Copy & install Linux dependencies for all /target-templates/* (e.g. shopcraft)
COPY target-templates/ /app/target-templates/
RUN for dir in /app/target-templates/*; do \
      if [ -d "$dir" ] && [ -f "$dir/package.json" ]; then \
        echo "Installing Linux deps for target template: $dir"; \
        rm -rf "$dir/node_modules" "$dir/dist" "$dir/public/generated"; \
        mkdir -p "$dir/public/generated"; \
        (cd "$dir" && if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi); \
      fi; \
    done

# 5. Prepare clean production /backend node_modules (retaining tsx for rootDir-safe fallback)
WORKDIR /app/backend-prod
COPY backend/package.json backend/package-lock.json* /app/backend-prod/
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi \
 && npm install --no-save --no-audit --no-fund tsx@4.19.2

# -----------------------------------------------------------------------------
# Stage 2: Runtime — Node 22 Debian bookworm-slim + Chromium + Fonts + Git
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Install Chromium + fonts for Puppeteer visual auditing, git for GitHub repo cloning,
# dumb-init for clean PID 1 signal forwarding, and curl for container health checks.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      git \
      ca-certificates \
      curl \
      dumb-init \
      fonts-liberation \
      fonts-noto-core \
      fonts-dejavu-core \
      fonts-freefont-ttf \
      libnss3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libasound2 \
      libpango-1.0-0 \
      libcairo2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080 \
    BACKEND_PORT=8080 \
    TARGET_VITE_PORT=5173 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium

# Copy built artifacts and workspaces from builder (NEVER copies env/.env)
COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/target-repo /app/target-repo
COPY --from=builder /app/target-templates /app/target-templates
COPY --from=builder /app/backend/package.json /app/backend/tsconfig.json /app/backend/
COPY --from=builder /app/backend/src /app/backend/src
COPY --from=builder /app/backend/dist /app/backend/dist
COPY --from=builder /app/backend-prod/node_modules /app/backend/node_modules

# Create runtime directories for uploads, screenshots, baseline snapshots, and cloned GitHub repos
RUN mkdir -p \
      /app/backend/uploads \
      /app/backend/screenshots \
      /app/backend/.snapshots \
      /app/target-repo/public/generated \
      /tmp/antislop-repos

WORKDIR /app/backend

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=8s --start-period=25s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Prefer flat compiled dist/server.js when emitted there; otherwise launch via tsx
# so __dirname-relative REPO_ROOT resolution in src/config/env.ts always resolves to /app.
CMD ["sh", "-c", "if [ -f /app/backend/dist/server.js ]; then exec node /app/backend/dist/server.js; else exec /app/backend/node_modules/.bin/tsx /app/backend/src/server.ts; fi"]
