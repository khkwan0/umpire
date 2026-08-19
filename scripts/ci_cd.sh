#!/usr/bin/env bash
set -euo pipefail

# All-in-one local CI/CD runner.
# - Always runs API/Web lint + format check + tests/build.
# - Optional deploy: set DEPLOY=1 to run docker compose up + health check.
#
# Examples:
#   ./scripts/ci_cd.sh
#   DEPLOY=1 ./scripts/ci_cd.sh
#   DEPLOY=1 WEB_PORT=8089 ./scripts/ci_cd.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="${DEPLOY:-0}"
WEB_PORT="${WEB_PORT:-8089}"
HEALTH_URL="http://127.0.0.1:${WEB_PORT}/api/health"

log() {
  printf "\n==> %s\n" "$1"
}

run_api_checks() {
  log "API checks"
  cd "${ROOT_DIR}/api"
  npm ci
  npm run lint
  npm run format:check
  npm run test:ci
  npm run build
}

run_web_checks() {
  log "Web checks"
  cd "${ROOT_DIR}/web"
  npm ci
  npm run lint
  npm run format:check
  npm run build
}

deploy_stack() {
  log "Deploying stack with docker compose"
  cd "${ROOT_DIR}"

  if [[ ! -f firebase-service-account.json && -f firebase-service-account.json.example ]]; then
    cp firebase-service-account.json.example firebase-service-account.json
    echo "Using example Firebase credentials (FCM will report ready=false)"
  fi

  if [[ ! -f .env && -f .env.example ]]; then
    cp .env.example .env
  fi

  docker compose up -d --build

  log "Waiting for health endpoint: ${HEALTH_URL}"
  local i=0
  while [[ "${i}" -lt 30 ]]; do
    if curl -fsS "${HEALTH_URL}" | rg -q '"ok"'; then
      echo "Health check passed"
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done

  echo "Health check failed"
  docker compose ps
  docker compose logs --tail=80
  return 1
}

main() {
  run_api_checks
  run_web_checks

  if [[ "${DEPLOY}" == "1" ]]; then
    deploy_stack
  else
    log "Skipping deploy (set DEPLOY=1 to deploy)"
  fi

  log "Done"
}

main "$@"
