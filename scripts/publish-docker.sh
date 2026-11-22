#!/usr/bin/env bash
set -euo pipefail

# Build and push UMPIRE API + web images to Docker Hub.
#
# Credentials (repo root, gitignored via .env.*):
#   DOCKER_HUB_USERNAME=nitroxstudios
#   PERSONAL_ACCESS_TOKEN=dckr_pat_…
#
# File: .env.dockerhub or .env.docker (first found wins)
#
# Tags: API_VERSION / WEB_VERSION env, else VERSION (both), else each
# package.json. Also pushes :latest unless PUSH_LATEST=false.
#
# Usage:
#   ./scripts/publish-docker.sh
#   VERSION=1.0.0 ./scripts/publish-docker.sh
#   API_VERSION=1.0.8 WEB_VERSION=1.0.4 ./scripts/publish-docker.sh
#   BASE_PATH=/umpire WEB_VERSION=umpire ./scripts/publish-docker.sh --web-only
#   ./scripts/publish-docker.sh --api-only
#   ./scripts/publish-docker.sh --web-only

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.dockerhub"
BASE_PATH="${BASE_PATH:-/}"

pkg_version() {
  node -p "require('${ROOT_DIR}/$1/package.json').version"
}

API_VERSION="${API_VERSION:-${VERSION:-$(pkg_version api)}}"
WEB_VERSION="${WEB_VERSION:-${VERSION:-$(pkg_version web)}}"
PUSH_LATEST="${PUSH_LATEST:-true}"
BUILD_API=true
BUILD_WEB=true

log() {
  printf "\n==> %s\n" "$1"
}

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
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
  log "Building ${API_IMAGE}:${API_VERSION}"
  docker build -f api/Dockerfile -t "${API_IMAGE}:${API_VERSION}" .

  log "Pushing ${API_IMAGE}:${API_VERSION}"
  docker push "${API_IMAGE}:${API_VERSION}"

  if [[ "${API_VERSION}" != "latest" && "${PUSH_LATEST}" == true ]]; then
    docker tag "${API_IMAGE}:${API_VERSION}" "${API_IMAGE}:latest"
    log "Pushing ${API_IMAGE}:latest"
    docker push "${API_IMAGE}:latest"
  fi
fi

if [[ "${BUILD_WEB}" == true ]]; then
  log "Building ${WEB_IMAGE}:${WEB_VERSION} (BASE_PATH=${BASE_PATH})"
  docker build -f web/Dockerfile \
    --build-arg "BASE_PATH=${BASE_PATH}" \
    -t "${WEB_IMAGE}:${WEB_VERSION}" .

  log "Pushing ${WEB_IMAGE}:${WEB_VERSION}"
  docker push "${WEB_IMAGE}:${WEB_VERSION}"

  if [[ "${WEB_VERSION}" != "latest" && "${PUSH_LATEST}" == true ]]; then
    docker tag "${WEB_IMAGE}:${WEB_VERSION}" "${WEB_IMAGE}:latest"
    log "Pushing ${WEB_IMAGE}:latest"
    docker push "${WEB_IMAGE}:latest"
  fi
fi

log "Done"
[[ "${BUILD_API}" == true ]] && echo "  ${API_IMAGE}:${API_VERSION}"
[[ "${BUILD_WEB}" == true ]] && echo "  ${WEB_IMAGE}:${WEB_VERSION}"
