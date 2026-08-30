#!/usr/bin/env bash
set -euo pipefail

# Push Docker Hub repo descriptions, overviews, and categories.
#
# Credentials file (first match wins):
#   .env.dockerhub
#   .env.docker
#
#   DOCKER_HUB_USERNAME=nitroxstudios
#   PERSONAL_ACCESS_TOKEN=dckr_pat_…
#
# Usage:
#   ./scripts/publish-dockerhub-metadata.sh
#   ./scripts/publish-dockerhub-metadata.sh umpire-api umpire-web

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HUB_DIR="${ROOT_DIR}/deploy/dockerhub"
API_BASE="https://hub.docker.com/v2"

log() {
  printf "\n==> %s\n" "$1"
}

die() {
  echo "Error: $*" >&2
  exit 1
}

resolve_env_file() {
  for candidate in "${ROOT_DIR}/.env.dockerhub" "${ROOT_DIR}/.env.docker"; do
    if [[ -f "${candidate}" ]]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done
  die "Missing .env.dockerhub or .env.docker with DOCKER_HUB_USERNAME and PERSONAL_ACCESS_TOKEN."
}

hub_login() {
  local payload resp
  payload=$(DOCKER_HUB_USERNAME="${DOCKER_HUB_USERNAME}" PERSONAL_ACCESS_TOKEN="${PERSONAL_ACCESS_TOKEN}" python3 - <<'PY'
import json, os
print(json.dumps({
    "username": os.environ["DOCKER_HUB_USERNAME"],
    "password": os.environ["PERSONAL_ACCESS_TOKEN"],
}))
PY
)
  resp=$(curl -sS -X POST "${API_BASE}/users/login/" \
    -H 'Content-Type: application/json' \
    -d "${payload}") || die "Docker Hub login request failed"
  HUB_JWT=$(LOGIN_RESP="${resp}" python3 - <<'PY'
import json, os, sys
raw = os.environ.get("LOGIN_RESP", "")
if not raw.strip():
    print("Docker Hub login returned an empty response", file=sys.stderr)
    sys.exit(1)
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    print(f"Docker Hub login returned non-JSON: {raw[:200]}", file=sys.stderr)
    sys.exit(1)
if "token" not in data:
    print(data.get("detail") or data.get("message") or data, file=sys.stderr)
    sys.exit(1)
print(data["token"])
PY
)
}

patch_repo() {
  local name="$1"
  local payload="$2"
  local http_code body
  body=$(curl -sS -X PATCH "${API_BASE}/repositories/${DOCKER_HUB_USERNAME}/${name}/" \
    -H "Authorization: JWT ${HUB_JWT}" \
    -H 'Content-Type: application/json' \
    -d "${payload}" \
    -w '\n%{http_code}')
  http_code=$(printf '%s' "${body}" | tail -n1)
  body=$(printf '%s' "${body}" | sed '$d')
  printf '%s\n%s' "${http_code}" "${body}"
}

update_repo() {
  local name="$1"
  local meta_file="${HUB_DIR}/${name}.meta.json"
  local overview_file="${HUB_DIR}/${name}-overview.md"

  [[ -f "${meta_file}" ]] || die "missing ${meta_file}"
  [[ -f "${overview_file}" ]] || die "missing ${overview_file}"

  local payload_with_categories payload_text_only result http_code body
  payload_with_categories=$(META_FILE="${meta_file}" OVERVIEW_FILE="${overview_file}" python3 - <<'PY'
import json, os, pathlib, sys
meta = json.load(open(os.environ["META_FILE"]))
overview = pathlib.Path(os.environ["OVERVIEW_FILE"]).read_text()
desc = meta["description"]
if len(desc.encode("utf-8")) > 100:
    print(f"description exceeds Docker Hub 100-byte limit ({len(desc.encode('utf-8'))} bytes): {desc!r}", file=sys.stderr)
    sys.exit(1)
print(json.dumps({
    "description": desc,
    "full_description": overview,
    "categories": meta["categories"],
}))
PY
)
  payload_text_only=$(META_FILE="${meta_file}" OVERVIEW_FILE="${overview_file}" python3 - <<'PY'
import json, os, pathlib, sys
meta = json.load(open(os.environ["META_FILE"]))
overview = pathlib.Path(os.environ["OVERVIEW_FILE"]).read_text()
desc = meta["description"]
if len(desc.encode("utf-8")) > 100:
    print(f"description exceeds Docker Hub 100-byte limit ({len(desc.encode('utf-8'))} bytes): {desc!r}", file=sys.stderr)
    sys.exit(1)
print(json.dumps({
    "description": desc,
    "full_description": overview,
}))
PY
)

  log "Updating ${DOCKER_HUB_USERNAME}/${name}"
  result=$(patch_repo "${name}" "${payload_with_categories}")
  http_code=$(printf '%s' "${result}" | head -n1)
  body=$(printf '%s' "${result}" | tail -n +2)

  if [[ "${http_code}" == "200" ]]; then
    echo "  description, overview, and categories updated"
    return 0
  fi

  if [[ "${http_code}" == "403" || "${http_code}" == "400" ]]; then
    echo "  categories update rejected (HTTP ${http_code}); retrying without categories..." >&2
    [[ -n "${body}" ]] && echo "  ${body}" >&2
    result=$(patch_repo "${name}" "${payload_text_only}")
    http_code=$(printf '%s' "${result}" | head -n1)
    body=$(printf '%s' "${result}" | tail -n +2)
    if [[ "${http_code}" == "200" ]]; then
      echo "  description and overview updated (add categories manually on Hub)"
      return 0
    fi
  fi

  echo "${body}" >&2
  die "PATCH ${name} failed (HTTP ${http_code}). Log in with the account that owns the repo; token needs Read, Write, Delete."
}

ENV_FILE="$(resolve_env_file)"

# shellcheck disable=SC1090
source "${ENV_FILE}"

: "${DOCKER_HUB_USERNAME:?DOCKER_HUB_USERNAME is required in ${ENV_FILE}}"
: "${PERSONAL_ACCESS_TOKEN:?PERSONAL_ACCESS_TOKEN is required in ${ENV_FILE}}"

REPOS=("$@")
if [[ ${#REPOS[@]} -eq 0 ]]; then
  REPOS=(umpire-api umpire-web)
fi

log "Logging in to Docker Hub as ${DOCKER_HUB_USERNAME} (using ${ENV_FILE##*/})"
hub_login

for repo in "${REPOS[@]}"; do
  update_repo "${repo}"
done

log "Done"
for repo in "${REPOS[@]}"; do
  echo "  https://hub.docker.com/r/${DOCKER_HUB_USERNAME}/${repo}"
done
