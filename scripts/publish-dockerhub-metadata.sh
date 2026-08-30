#!/usr/bin/env bash
set -euo pipefail

# Push Docker Hub repo descriptions, overviews, and categories.
#
# Uses the same credentials as publish-docker.sh:
#   DOCKER_HUB_USERNAME=nitroxstudios
#   PERSONAL_ACCESS_TOKEN=dckr_pat_…
#
# Usage:
#   ./scripts/publish-dockerhub-metadata.sh
#   ./scripts/publish-dockerhub-metadata.sh umpire-api umpire-web

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.dockerhub"
HUB_DIR="${ROOT_DIR}/deploy/dockerhub"
API_BASE="https://hub.docker.com/v2"

log() {
  printf "\n==> %s\n" "$1"
}

die() {
  echo "Error: $*" >&2
  exit 1
}

hub_auth_header() {
  # PAT works directly as Bearer on Hub API v2 (no login exchange required).
  HUB_AUTH_HEADER="Authorization: Bearer ${PERSONAL_ACCESS_TOKEN}"
}

update_repo() {
  local name="$1"
  local meta_file="${HUB_DIR}/${name}.meta.json"
  local overview_file="${HUB_DIR}/${name}-overview.md"

  [[ -f "${meta_file}" ]] || die "missing ${meta_file}"
  [[ -f "${overview_file}" ]] || die "missing ${overview_file}"

  local payload
  payload=$(META_FILE="${meta_file}" OVERVIEW_FILE="${overview_file}" python3 - <<'PY'
import json, os, pathlib
meta = json.load(open(os.environ["META_FILE"]))
overview = pathlib.Path(os.environ["OVERVIEW_FILE"]).read_text()
print(json.dumps({
    "description": meta["description"],
    "full_description": overview,
    "categories": meta["categories"],
}))
PY
)

  log "Updating ${DOCKER_HUB_USERNAME}/${name}"
  local http_code body
  body=$(curl -sS -X PATCH "${API_BASE}/repositories/${DOCKER_HUB_USERNAME}/${name}/" \
    -H "${HUB_AUTH_HEADER}" \
    -H 'Content-Type: application/json' \
    -d "${payload}" \
    -w '\n%{http_code}')
  http_code=$(printf '%s' "${body}" | tail -n1)
  body=$(printf '%s' "${body}" | sed '$d')

  if [[ "${http_code}" != "200" ]]; then
    echo "${body}" >&2
    die "PATCH ${name} failed (HTTP ${http_code}). Use a Docker Hub token with Read, Write, Delete permissions."
  fi
  echo "  description, overview, categories updated"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  die "Missing ${ENV_FILE}. Create it with DOCKER_HUB_USERNAME and PERSONAL_ACCESS_TOKEN."
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

: "${DOCKER_HUB_USERNAME:?DOCKER_HUB_USERNAME is required in .env.dockerhub}"
: "${PERSONAL_ACCESS_TOKEN:?PERSONAL_ACCESS_TOKEN is required in .env.dockerhub}"

REPOS=("$@")
if [[ ${#REPOS[@]} -eq 0 ]]; then
  REPOS=(umpire-api umpire-web)
fi

log "Authenticating to Docker Hub as ${DOCKER_HUB_USERNAME}"
hub_auth_header

for repo in "${REPOS[@]}"; do
  update_repo "${repo}"
done

log "Done"
for repo in "${REPOS[@]}"; do
  echo "  https://hub.docker.com/r/${DOCKER_HUB_USERNAME}/${repo}"
done
