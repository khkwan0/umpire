#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ARCHIVE_PATH="${ARCHIVE_PATH:-build/UMPIRE.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-build}"
EXPORT_OPTIONS="${EXPORT_OPTIONS:-ios-export/ExportOptions.plist}"
PRIVATE_KEYS_DIR="${PRIVATE_KEYS_DIR:-private_keys}"
ARCHIVE_ONLY="${ARCHIVE_ONLY:-0}"

# Load local secrets if present (ASC_KEY_ID, ASC_ISSUER_ID)
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

require_upload_credentials() {
  if [ -z "${ASC_KEY_ID:-}" ] || [ -z "${ASC_ISSUER_ID:-}" ]; then
    cat >&2 <<'MSG'
Missing App Store Connect API credentials.

Create an API key in App Store Connect → Users and Access → Integrations → App Store Connect API,
then set in .env.local (or your environment):

  ASC_KEY_ID=XXXXXXXXXX
  ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

Place the downloaded key at:

  private_keys/AuthKey_${ASC_KEY_ID}.p8

Or skip upload with:

  ARCHIVE_ONLY=1 npm run archive_ios
MSG
    exit 1
  fi

  local key_file="${PRIVATE_KEYS_DIR}/AuthKey_${ASC_KEY_ID}.p8"
  if [ ! -f "$key_file" ]; then
    # altool also searches ~/.appstoreconnect/private_keys
    local home_key="${HOME}/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
    if [ ! -f "$home_key" ]; then
      echo "Missing API key file: ${key_file}" >&2
      echo "(also checked ${home_key})" >&2
      exit 1
    fi
  fi
}

if [ "$ARCHIVE_ONLY" != "1" ]; then
  require_upload_credentials
fi

# shellcheck disable=SC1091
source "$(dirname "$0")/unlock_signing_keychain.sh"
prepare_signing_keychain_if_needed

echo "Running prebuild…"
npx expo prebuild --platform ios

mkdir -p "$(dirname "$ARCHIVE_PATH")" "$EXPORT_PATH" "$PRIVATE_KEYS_DIR"

echo "Stopping stale Xcode build services…"
killall XCBBuildService 2>/dev/null || true

if [ "${CLEAN_DERIVED_DATA:-0}" = "1" ]; then
  echo "Cleaning DerivedData for UMPIRE…"
  rm -rf "${HOME}/Library/Developer/Xcode/DerivedData/"*UMPIRE* 2>/dev/null || true
fi

# Cap parallelism so the archive doesn't pin every core (override with MAX_CPUS).
MAX_CPUS="${MAX_CPUS:-4}"
ARCHIVE_LOG="${ARCHIVE_LOG:-${EXPORT_PATH}/archive-xcodebuild.log}"

echo "Archiving Release build (iPhone only) → ${ARCHIVE_PATH}…"
echo "Logging to ${ARCHIVE_LOG} (MAX_CPUS=${MAX_CPUS})…"
xcodebuild -workspace ios/UMPIRE.xcworkspace \
  -scheme UMPIRE \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -jobs "$MAX_CPUS" \
  -IDEBuildOperationMaxNumberOfConcurrentCompileTasks="$MAX_CPUS" \
  COMPILER_INDEX_STORE_ENABLE=NO \
  TARGETED_DEVICE_FAMILY=1 \
  archive \
  "$@" \
  2>&1 | tee "$ARCHIVE_LOG"

echo "Archive ready: ${ARCHIVE_PATH}"

if [ "$ARCHIVE_ONLY" = "1" ]; then
  echo "ARCHIVE_ONLY=1 — skipping export/upload."
  exit 0
fi

echo "Exporting IPA → ${EXPORT_PATH}…"
UPLOAD=1 exec "$(dirname "$0")/export_ios.sh"
