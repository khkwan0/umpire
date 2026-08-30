#!/usr/bin/env bash
set -euo pipefail

# Build and push UMPIRE API + web images to Docker Hub.
#
# Credentials (repo root, gitignored via .env.*):
#   DOCKER_HUB_USERNAME=nitroxstudios
#   PERSONAL_ACCESS_TOKEN=dckr_pat_…
#
# Usage:
#   ./scripts/publish-docker.sh
#   VERSION=1.0.0 ./scripts/publish-docker.sh
#   BASE_PATH=/umpire VERSION=1.0.0 ./scripts/publish-docker.sh
#   ./scripts/publish-docker.sh --api-only
#   ./scripts/publish-docker.sh --web-only

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.dockerhub"
VERSION="${VERSION:-latest}"
BASE_PATH="${BASE_PATH:-/}"
PUSH_LATEST="${PUSH_LATEST:-true}"
BUILD_API=true
BUILD_WEB=true

log() {
  printf "\n==> %s\n" "$1"
}

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage 0
      ;;
    --api-only)
      BUILD_WEB=false
      shift
      ;;
    --web-only)
      BUILD_API=false
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Create it with DOCKER_HUB_USERNAME and PERSONAL_ACCESS_TOKEN." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

: "${DOCKER_HUB_USERNAME:?DOCKER_HUB_USERNAME is required in .env.dockerhub}"
: "${PERSONAL_ACCESS_TOKEN:?PERSONAL_ACCESS_TOKEN is required in .env.dockerhub}"

API_IMAGE="${DOCKER_HUB_USERNAME}/umpire-api"
WEB_IMAGE="${DOCKER_HUB_USERNAME}/umpire-web"

cd "${ROOT_DIR}"

log "Logging in to Docker Hub as ${DOCKER_HUB_USERNAME}"
printf '%s' "${PERSONAL_ACCESS_TOKEN}" | docker login -u "${DOCKER_HUB_USERNAME}" --password-stdin

if [[ "${BUILD_API}" == true ]]; then
  log "Building ${API_IMAGE}:${VERSION}"
  docker build -f api/Dockerfile -t "${API_IMAGE}:${VERSION}" .

  log "Pushing ${API_IMAGE}:${VERSION}"
  docker push "${API_IMAGE}:${VERSION}"

  if [[ "${VERSION}" != "latest" && "${PUSH_LATEST}" == true ]]; then
    docker tag "${API_IMAGE}:${VERSION}" "${API_IMAGE}:latest"
    log "Pushing ${API_IMAGE}:latest"
    docker push "${API_IMAGE}:latest"
  fi
fi

if [[ "${BUILD_WEB}" == true ]]; then
  log "Building ${WEB_IMAGE}:${VERSION} (BASE_PATH=${BASE_PATH})"
  docker build -f web/Dockerfile \
    --build-arg "BASE_PATH=${BASE_PATH}" \
    -t "${WEB_IMAGE}:${VERSION}" .

  log "Pushing ${WEB_IMAGE}:${VERSION}"
  docker push "${WEB_IMAGE}:${VERSION}"

  if [[ "${VERSION}" != "latest" && "${PUSH_LATEST}" == true ]]; then
    docker tag "${WEB_IMAGE}:${VERSION}" "${WEB_IMAGE}:latest"
    log "Pushing ${WEB_IMAGE}:latest"
    docker push "${WEB_IMAGE}:latest"
  fi
fi

log "Done"
[[ "${BUILD_API}" == true ]] && echo "  ${API_IMAGE}:${VERSION}"
[[ "${BUILD_WEB}" == true ]] && echo "  ${WEB_IMAGE}:${VERSION}"
