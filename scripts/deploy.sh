#!/usr/bin/env bash
set -euo pipefail

# Deploy script for local/on-host use.
# Builds and starts services with Docker Compose, then waits for health.
#
# Usage:
#   ./scripts/deploy.sh
#   WEB_PORT=8090 ./scripts/deploy.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${WEB_PORT:-8089}"
HEALTH_URL="http://127.0.0.1:${WEB_PORT}/api/health"

log() {
  printf "\n==> %s\n" "$1"
}

log "Preparing env files"
cd "${ROOT_DIR}"

if [[ ! -f firebase-service-account.json && -f firebase-service-account.json.example ]]; then
  cp firebase-service-account.json.example firebase-service-account.json
  echo "Using example Firebase credentials (FCM will report ready=false)"
fi

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
fi

log "Docker compose build + up"
docker compose up -d --build

log "Waiting for health endpoint: ${HEALTH_URL}"
i=0
while [[ "${i}" -lt 30 ]]; do
  if curl -fsS "${HEALTH_URL}" | grep -q '"ok"'; then
    echo "Health check passed"
    exit 0
  fi
  i=$((i + 1))
  sleep 2
done

echo "Health check failed"
docker compose ps
docker compose logs --tail=80
exit 1
