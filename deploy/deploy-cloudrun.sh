#!/usr/bin/env bash
# =============================================================================
# AntiSlop Engine — One-Command Google Cloud Run Deployment Script
# =============================================================================
# Reads secrets safely from env/.env (NEVER echoes secret values), builds the
# multi-stage container via Cloud Build, and deploys to Cloud Run under
# GCP_PROJECT_ID=gitunderstand (patilshantanu1899@gmail.com) with session
# affinity enabled for live Vite HMR + SSE + Puppeteer visual auditing.
#
# Usage:
#   ./deploy/deploy-cloudrun.sh              # Full build + deploy
#   ./deploy/deploy-cloudrun.sh --dry-run    # Validate config without deploying
#   ./deploy/deploy-cloudrun.sh --skip-build # Re-deploy latest image + env vars
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/env/.env"

EXPECTED_ACCOUNT="patilshantanu1899@gmail.com"
DRY_RUN=false
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    --skip-build)
      SKIP_BUILD=true
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--skip-build]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

# -----------------------------------------------------------------------------
# 1. Safely load env/.env without echoing any secret values
# -----------------------------------------------------------------------------
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "❌ Missing ${ENV_FILE}" >&2
  echo "   Copy env/.env.example to env/.env and fill in GEMINI_API_KEY first." >&2
  exit 1
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  # Trim leading whitespace
  trimmed="${line#"${line%%[![:space:]]*}"}"
  # Skip blank lines and comments
  [[ -z "$trimmed" || "$trimmed" == \#* ]] && continue
  # Strip optional leading 'export '
  trimmed="${trimmed#export }"
  # Require KEY=VALUE format
  [[ "$trimmed" != *=* ]] && continue

  key="${trimmed%%=*}"
  val="${trimmed#*=}"
  # Trim whitespace around key
  key="${key//[[:space:]]/}"
  # Strip surrounding matching single or double quotes from value
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
    val="${val:1:${#val}-2}"
  fi

  # Only export valid POSIX identifier keys
  if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    export "${key}=${val}"
  fi
done < "${ENV_FILE}"

# Apply production defaults (project gitunderstand under patilshantanu1899@gmail.com)
GCP_PROJECT_ID="${GCP_PROJECT_ID:-gitunderstand}"
GCP_REGION="${GCP_REGION:-us-central1}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-antislop-engine}"

# Ensure production domain origins are always permitted by CORS (deduplicated)
PROD_ORIGINS="https://antislop.live,https://www.antislop.live,http://localhost:3000"
RAW_ORIGINS="${PROD_ORIGINS}${CORS_ORIGIN:+,${CORS_ORIGIN}}"
EFFECTIVE_CORS_ORIGIN="$(
  IFS=',' read -r -a raw_arr <<< "${RAW_ORIGINS}"
  out=""
  for item in "${raw_arr[@]}"; do
    trimmed="${item#"${item%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    [[ -z "${trimmed}" ]] && continue
    if [[ ",${out}," != *",${trimmed},"* ]]; then
      out="${out:+${out},}${trimmed}"
    fi
  done
  printf '%s' "${out}"
)"

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "❌ GEMINI_API_KEY is empty in env/.env" >&2
  exit 1
fi

mask_status() {
  local v="${1:-}"
  if [[ -n "$v" ]]; then
    echo "SET ([REDACTED])"
  else
    echo "UNSET"
  fi
}

IMAGE_TAG="$(date -u +%Y%m%d-%H%M%S)"
IMAGE_URI="gcr.io/${GCP_PROJECT_ID}/${CLOUD_RUN_SERVICE}:${IMAGE_TAG}"
IMAGE_LATEST="gcr.io/${GCP_PROJECT_ID}/${CLOUD_RUN_SERVICE}:latest"

echo ""
echo "🚀 AntiSlop Engine — Google Cloud Run Deployment"
echo "========================================================================"
echo "  GCP Account Target : ${EXPECTED_ACCOUNT}"
echo "  GCP Project ID     : ${GCP_PROJECT_ID}"
echo "  GCP Region         : ${GCP_REGION}"
echo "  Cloud Run Service  : ${CLOUD_RUN_SERVICE}"
echo "  Container Image    : ${IMAGE_URI}"
echo "  CORS Origins       : ${EFFECTIVE_CORS_ORIGIN}"
echo "  GEMINI_API_KEY     : $(mask_status "${GEMINI_API_KEY:-}")"
echo "  GEMINI_SECONDARY   : $(mask_status "${GEMINI_API_KEY_SECONDARY:-}")"
echo "  GITHUB_TOKEN       : $(mask_status "${GITHUB_TOKEN:-}")"
echo "  LANGSMITH_API_KEY  : $(mask_status "${LANGSMITH_API_KEY:-}") (tracing=${LANGSMITH_TRACING:-false})"
echo "========================================================================"
echo ""

# -----------------------------------------------------------------------------
# 2. Create secure temporary env-vars YAML (chmod 600, auto-deleted on EXIT)
#    Note: Cloud Run reserves PORT automatically; do NOT pass PORT in env file.
# -----------------------------------------------------------------------------
TMP_DIR="$(mktemp -d)"
ENV_YAML="${TMP_DIR}/cloudrun-env.yaml"
BUILD_YAML="${TMP_DIR}/cloudbuild-image.yaml"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

yaml_escape() {
  local s="${1//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '"%s"' "$s"
}

write_env_var() {
  local k="$1"
  local v="${2:-}"
  if [[ -n "$v" ]]; then
    printf '%s: %s\n' "$k" "$(yaml_escape "$v")" >> "${ENV_YAML}"
  fi
}

umask 077
: > "${ENV_YAML}"
chmod 600 "${ENV_YAML}"

write_env_var "NODE_ENV" "production"
write_env_var "TARGET_VITE_PORT" "${TARGET_VITE_PORT:-5173}"
write_env_var "PUPPETEER_EXECUTABLE_PATH" "/usr/bin/chromium"
write_env_var "CORS_ORIGIN" "${EFFECTIVE_CORS_ORIGIN}"

write_env_var "GEMINI_API_KEY" "${GEMINI_API_KEY:-}"
write_env_var "GEMINI_API_KEY_SECONDARY" "${GEMINI_API_KEY_SECONDARY:-}"
write_env_var "GEMINI_MODEL_DIRECTOR" "${GEMINI_MODEL_DIRECTOR:-gemini-4-carbon}"
write_env_var "GEMINI_MODEL_ARCHITECT" "${GEMINI_MODEL_ARCHITECT:-gemini-4-neon}"
write_env_var "GEMINI_MODEL_PATCHER" "${GEMINI_MODEL_PATCHER:-gemini-4-hydrogen}"
write_env_var "GEMINI_MODEL_FAST_CRITIC" "${GEMINI_MODEL_FAST_CRITIC:-gemini-4-argon}"
write_env_var "GEMINI_MODEL_DECISIONS" "${GEMINI_MODEL_DECISIONS:-gemini-decision-1}"
write_env_var "GEMINI_MODEL_IMAGE_GEN" "${GEMINI_MODEL_IMAGE_GEN:-gemini-nano-banana-2.1}"
write_env_var "GEMINI_MODEL_EMBEDDING" "${GEMINI_MODEL_EMBEDDING:-gemini-embedding-2}"
write_env_var "GEMINI_MODEL_TRANSCRIBE" "${GEMINI_MODEL_TRANSCRIBE:-gemini-3.5-transcribe}"
write_env_var "GEMINI_MODEL_LIVE" "${GEMINI_MODEL_LIVE:-gemini-3.8-live}"
write_env_var "GEMINI_MANAGED_AGENT_BASE" "${GEMINI_MANAGED_AGENT_BASE:-antigravity-preview-09-2026}"

write_env_var "ANTISLOP_PARALLEL_CANDIDATES" "${ANTISLOP_PARALLEL_CANDIDATES:-3}"
write_env_var "ANTISLOP_MAX_CRITIC_ITERATIONS" "${ANTISLOP_MAX_CRITIC_ITERATIONS:-4}"

write_env_var "GCP_PROJECT_ID" "${GCP_PROJECT_ID}"
write_env_var "GCP_REGION" "${GCP_REGION}"
write_env_var "GCS_ARTIFACT_BUCKET" "${GCS_ARTIFACT_BUCKET:-}"
write_env_var "CLOUD_RUN_SERVICE" "${CLOUD_RUN_SERVICE}"

write_env_var "LANGSMITH_TRACING" "${LANGSMITH_TRACING:-false}"
write_env_var "LANGSMITH_API_KEY" "${LANGSMITH_API_KEY:-}"
write_env_var "LANGSMITH_WORKSPACE_ID" "${LANGSMITH_WORKSPACE_ID:-}"
write_env_var "LANGSMITH_PROJECT" "${LANGSMITH_PROJECT:-antislop-gemini4-nyc}"
write_env_var "GITHUB_TOKEN" "${GITHUB_TOKEN:-}"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "🧪 DRY RUN: validated env/.env and generated temporary Cloud Run env file ($(wc -l < "${ENV_YAML}" | tr -d ' ') keys, redacted)."
  echo "   Would deploy ${CLOUD_RUN_SERVICE} -> project=${GCP_PROJECT_ID}, region=${GCP_REGION}, memory=8Gi, cpu=4, session-affinity, timeout=900."
  exit 0
fi

# -----------------------------------------------------------------------------
# 3. Verify gcloud CLI, account, project, and required APIs
# -----------------------------------------------------------------------------
if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ gcloud CLI is not installed. Install Google Cloud SDK first." >&2
  exit 1
fi

ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
if [[ "${ACTIVE_ACCOUNT}" != "${EXPECTED_ACCOUNT}" ]]; then
  echo "🔄 Switching gcloud account from '${ACTIVE_ACCOUNT:-none}' to '${EXPECTED_ACCOUNT}'..."
  if ! gcloud config set account "${EXPECTED_ACCOUNT}" >/dev/null 2>&1; then
    echo "❌ Account ${EXPECTED_ACCOUNT} is not authenticated in gcloud." >&2
    echo "   Run: gcloud auth login ${EXPECTED_ACCOUNT}" >&2
    exit 1
  fi
fi

gcloud config set project "${GCP_PROJECT_ID}" >/dev/null

echo "🔧 Ensuring Cloud Build & Cloud Run APIs are enabled on ${GCP_PROJECT_ID}..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  --project="${GCP_PROJECT_ID}" >/dev/null

# -----------------------------------------------------------------------------
# 4. Build & Push container image via Cloud Build (never bundles env/.env)
# -----------------------------------------------------------------------------
DEPLOY_IMAGE="${IMAGE_URI}"
if [[ "${SKIP_BUILD}" == "true" ]]; then
  DEPLOY_IMAGE="${IMAGE_LATEST}"
  echo "⏭️  Skipping container build (--skip-build). Using ${DEPLOY_IMAGE}"
else
  cat > "${BUILD_YAML}" <<EOF
steps:
  - name: "gcr.io/cloud-builders/docker"
    args:
      - "build"
      - "-f"
      - "deploy/Dockerfile"
      - "-t"
      - "${IMAGE_URI}"
      - "-t"
      - "${IMAGE_LATEST}"
      - "."
images:
  - "${IMAGE_URI}"
  - "${IMAGE_LATEST}"
options:
  machineType: "E2_HIGHCPU_8"
  logging: CLOUD_LOGGING_ONLY
timeout: "1800s"
EOF

  echo "🏗️  Submitting Cloud Build from ${REPO_ROOT}..."
  (
    cd "${REPO_ROOT}"
    gcloud builds submit \
      --project="${GCP_PROJECT_ID}" \
      --config="${BUILD_YAML}" \
      .
  )
fi

# -----------------------------------------------------------------------------
# 5. Deploy to Google Cloud Run with Session Affinity & 4 vCPU / 8 GiB RAM
# -----------------------------------------------------------------------------
echo "☁️  Deploying ${CLOUD_RUN_SERVICE} to Cloud Run (${GCP_REGION})..."
gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --platform=managed \
  --image="${DEPLOY_IMAGE}" \
  --memory=8Gi \
  --cpu=4 \
  --cpu-boost \
  --session-affinity \
  --timeout=900 \
  --concurrency=20 \
  --min-instances=1 \
  --max-instances=3 \
  --port=8080 \
  --allow-unauthenticated \
  --env-vars-file="${ENV_YAML}"

SERVICE_URL="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --format='value(status.url)')"

echo ""
echo "✅ AntiSlop Engine deployed successfully!"
echo "   Cloud Run URL : ${SERVICE_URL}"
echo "   Health Check  : ${SERVICE_URL}/api/health"
echo "   Live Preview  : ${SERVICE_URL}/preview/"
echo ""

echo "🩺 Verifying live /api/health endpoint..."
if curl -fsS --max-time 20 "${SERVICE_URL}/api/health" >/dev/null; then
  echo "✅ Health check passed!"
else
  echo "⚠️  Health check did not immediately return 200 (container may still be warming Vite). Check logs:"
  echo "   gcloud run services logs read ${CLOUD_RUN_SERVICE} --project=${GCP_PROJECT_ID} --region=${GCP_REGION} --limit=50"
fi
