#!/usr/bin/env bash
# =============================================================================
# AntiSlop — One-Command Local Development Launcher
# =============================================================================
# Verifies env/.env, launches /backend (which auto-boots embedded Vite HMR on
# port 5173) and /studio (Next.js on port 3000) concurrently, and tears down
# the entire process tree cleanly on Ctrl+C.
#
# Usage:
#   ./scripts/dev.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/env/.env"
BACKEND_DIR="${REPO_ROOT}/backend"
STUDIO_DIR="${REPO_ROOT}/studio"
TARGET_REPO_DIR="${REPO_ROOT}/target-repo"

# ANSI colors (disabled automatically if not a TTY)
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_CYAN=$'\033[36m'
  C_MAGENTA=$'\033[35m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
else
  C_RESET="" C_BOLD="" C_CYAN="" C_MAGENTA="" C_GREEN="" C_YELLOW="" C_RED=""
fi

# -----------------------------------------------------------------------------
# 1. Verify env/.env & required GEMINI_API_KEY (never echoes secret values)
# -----------------------------------------------------------------------------
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "${C_RED}❌ Missing ${ENV_FILE}${C_RESET}" >&2
  echo "   Run: cp env/.env.example env/.env" >&2
  echo "   Then add your GEMINI_API_KEY inside env/.env and re-run ./scripts/dev.sh" >&2
  exit 1
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  trimmed="${line#"${line%%[![:space:]]*}"}"
  [[ -z "$trimmed" || "$trimmed" == \#* ]] && continue
  trimmed="${trimmed#export }"
  [[ "$trimmed" != *=* ]] && continue

  key="${trimmed%%=*}"
  val="${trimmed#*=}"
  key="${key//[[:space:]]/}"
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
    val="${val:1:${#val}-2}"
  fi

  if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    export "${key}=${val}"
  fi
done < "${ENV_FILE}"

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "${C_RED}❌ GEMINI_API_KEY is not set in env/.env${C_RESET}" >&2
  echo "   Open env/.env and paste your Gemini 4 Tier-3 API key." >&2
  exit 1
fi

BACKEND_PORT="${BACKEND_PORT:-4000}"
TARGET_VITE_PORT="${TARGET_VITE_PORT:-5173}"
STUDIO_PORT="${STUDIO_PORT:-3000}"

# -----------------------------------------------------------------------------
# 2. Verify Node toolchain, workspace directories & dependencies
# -----------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "${C_RED}❌ node and npm are required (Node 22+ recommended).${C_RESET}" >&2
  exit 1
fi

for dir in "${BACKEND_DIR}" "${STUDIO_DIR}" "${TARGET_REPO_DIR}"; do
  if [[ ! -f "${dir}/package.json" ]]; then
    echo "${C_RED}❌ Expected package.json in ${dir}${C_RESET}" >&2
    exit 1
  fi
  if [[ ! -d "${dir}/node_modules" ]]; then
    echo "${C_YELLOW}📦 Installing missing dependencies in $(basename "${dir}")...${C_RESET}"
    (cd "${dir}" && npm install --no-audit --no-fund)
  fi
done

# Warn if any required port is already bound
check_port_busy() {
  local port="$1"
  local label="$2"
  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"${port}" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      echo "${C_YELLOW}⚠️  Port ${port} (${label}) is already in use. Stop existing listeners if startup fails.${C_RESET}"
    fi
  fi
}

check_port_busy "${BACKEND_PORT}" "Backend API"
check_port_busy "${TARGET_VITE_PORT}" "Embedded Target Vite HMR"
check_port_busy "${STUDIO_PORT}" "AntiSlop Studio"

# -----------------------------------------------------------------------------
# 3. Clean recursive process-tree shutdown trap (Ctrl+C / SIGTERM / EXIT)
# -----------------------------------------------------------------------------
BACKEND_PID=""
STUDIO_PID=""
WATCHER_PID=""
SHUTTING_DOWN=false

kill_tree() {
  local pid="$1"
  local sig="${2:-TERM}"
  [[ -z "$pid" ]] && return 0

  if command -v pgrep >/dev/null 2>&1; then
    local children
    children="$(pgrep -P "$pid" 2>/dev/null || true)"
    for child in $children; do
      kill_tree "$child" "$sig"
    done
  fi
  kill "-${sig}" "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ "${SHUTTING_DOWN}" == "true" ]]; then
    return 0
  fi
  SHUTTING_DOWN=true
  echo ""
  echo "${C_YELLOW}🛑 Shutting down AntiSlop dev servers (Studio, Backend, Embedded Vite)...${C_RESET}"

  [[ -n "${WATCHER_PID}" ]] && kill_tree "${WATCHER_PID}" TERM
  [[ -n "${STUDIO_PID}" ]] && kill_tree "${STUDIO_PID}" TERM
  [[ -n "${BACKEND_PID}" ]] && kill_tree "${BACKEND_PID}" TERM

  sleep 0.6

  [[ -n "${STUDIO_PID}" ]] && kill_tree "${STUDIO_PID}" KILL
  [[ -n "${BACKEND_PID}" ]] && kill_tree "${BACKEND_PID}" KILL

  wait 2>/dev/null || true
  echo "${C_GREEN}✅ All AntiSlop processes stopped cleanly.${C_RESET}"
}

trap cleanup INT TERM EXIT

# -----------------------------------------------------------------------------
# 4. Print clickable local URLs & launch /backend + /studio concurrently
# -----------------------------------------------------------------------------
echo ""
echo "${C_BOLD}🎨⚡ AntiSlop — Local Multimodal Studio & Gemini 4 Engine${C_RESET}"
echo "========================================================================"
echo "  ${C_GREEN}Studio:${C_RESET}          http://localhost:${STUDIO_PORT}"
echo "  ${C_CYAN}Backend API:${C_RESET}     http://localhost:${BACKEND_PORT}"
echo "  ${C_MAGENTA}Live Target App:${C_RESET} http://localhost:${TARGET_VITE_PORT}"
echo "  ${C_CYAN}Proxied Preview:${C_RESET} http://localhost:${BACKEND_PORT}/preview"
echo "  ${C_CYAN}Health Endpoint:${C_RESET} http://localhost:${BACKEND_PORT}/api/health"
echo "========================================================================"
echo "  Press Ctrl+C to stop all services cleanly."
echo ""

prefix_logs() {
  local tag="$1"
  while IFS= read -r line; do
    printf '%s %s\n' "$tag" "$line"
  done
}

# Launch /backend (auto-boots embedded Vite HMR server on TARGET_VITE_PORT)
(
  cd "${BACKEND_DIR}"
  exec env \
    PORT="${BACKEND_PORT}" \
    BACKEND_PORT="${BACKEND_PORT}" \
    TARGET_VITE_PORT="${TARGET_VITE_PORT}" \
    npm run dev 2>&1
) > >(prefix_logs "${C_CYAN}[backend]${C_RESET}") &
BACKEND_PID=$!

# Launch /studio (Next.js App Router on STUDIO_PORT)
(
  cd "${STUDIO_DIR}"
  exec env \
    PORT="${STUDIO_PORT}" \
    NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-http://localhost:${BACKEND_PORT}}" \
    NEXT_PUBLIC_PREVIEW_URL="${NEXT_PUBLIC_PREVIEW_URL:-http://localhost:${TARGET_VITE_PORT}}" \
    npx next dev -p "${STUDIO_PORT}" 2>&1
) > >(prefix_logs "${C_MAGENTA}[studio]${C_RESET}") &
STUDIO_PID=$!

# Background readiness banner once both HTTP endpoints respond
(
  backend_up=false
  studio_up=false
  for _ in $(seq 1 60); do
    if [[ "${backend_up}" == "false" ]] && curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
      backend_up=true
      echo "${C_GREEN}✅ [ready] Backend API & Embedded Vite listening → http://localhost:${BACKEND_PORT} (Target: http://localhost:${TARGET_VITE_PORT})${C_RESET}"
    fi
    if [[ "${studio_up}" == "false" ]] && curl -fsS "http://127.0.0.1:${STUDIO_PORT}" >/dev/null 2>&1; then
      studio_up=true
      echo "${C_GREEN}✅ [ready] AntiSlop Studio live → http://localhost:${STUDIO_PORT}${C_RESET}"
    fi
    if [[ "${backend_up}" == "true" && "${studio_up}" == "true" ]]; then
      break
    fi
    sleep 1
  done
) &
WATCHER_PID=$!

# Monitor both primary processes; if either exits unexpectedly, trigger clean shutdown
while true; do
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo "${C_RED}❌ Backend process exited unexpectedly.${C_RESET}" >&2
    exit 1
  fi
  if ! kill -0 "${STUDIO_PID}" 2>/dev/null; then
    echo "${C_RED}❌ Studio process exited unexpectedly.${C_RESET}" >&2
    exit 1
  fi
  sleep 1
done
