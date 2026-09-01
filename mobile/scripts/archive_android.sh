#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ARCHIVE_ONLY="${ARCHIVE_ONLY:-0}"
PLAY_TRACK="${PLAY_TRACK:-internal}"
PLAY_RELEASE_STATUS="${PLAY_RELEASE_STATUS:-completed}"
PLAY_PACKAGE_NAME="${PLAY_PACKAGE_NAME:-com.umpire}"
AAB_OUT_DIR="android/app/build/outputs/bundle/release"
AAB_PATH="${AAB_PATH:-${AAB_OUT_DIR}/app-release.aab}"

# Load local secrets if present
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

require_signing_credentials() {
  local missing=0
  for var in ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
    if [ -z "${!var:-}" ]; then
      echo "Missing ${var}" >&2
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    cat >&2 <<'MSG'

Add Android signing credentials to .env.local:

  ANDROID_KEYSTORE_PATH=private_keys/android-release.jks
  ANDROID_KEYSTORE_PASSWORD=...
  ANDROID_KEY_ALIAS=...
  ANDROID_KEY_PASSWORD=...

MSG
    exit 1
  fi
  if [ ! -f "$ANDROID_KEYSTORE_PATH" ]; then
    echo "Keystore not found: ${ANDROID_KEYSTORE_PATH}" >&2
    exit 1
  fi
}

require_upload_credentials() {
  if [ -z "${PLAY_SERVICE_ACCOUNT_JSON:-}" ]; then
    cat >&2 <<'MSG'
Missing Google Play service account.

Set in .env.local:

  PLAY_SERVICE_ACCOUNT_JSON=private_keys/play-service-account.json
  PLAY_TRACK=internal

Create a service account in Google Cloud, download its JSON key, and in
Play Console → Users and permissions invite that account with Release permissions.

Or skip upload with:

  ARCHIVE_ONLY=1 npm run archive_android
MSG
    exit 1
  fi
  if [ ! -f "$PLAY_SERVICE_ACCOUNT_JSON" ]; then
    echo "Service account JSON not found: ${PLAY_SERVICE_ACCOUNT_JSON}" >&2
    exit 1
  fi
}

require_signing_credentials
if [ "$ARCHIVE_ONLY" != "1" ]; then
  require_upload_credentials
fi

echo "Running prebuild…"
npx expo prebuild --platform android

# Written after prebuild because android/ is regenerated
STORE_FILE_PATH="$(node -e "console.log(require('path').resolve(process.argv[1]))" "$ANDROID_KEYSTORE_PATH")"
cat > android/keystore.properties <<EOF
storePassword=${ANDROID_KEYSTORE_PASSWORD}
keyPassword=${ANDROID_KEY_PASSWORD}
keyAlias=${ANDROID_KEY_ALIAS}
storeFile=${STORE_FILE_PATH}
EOF

# Cap CPU + JVM heaps so the Mac mini stays out of swap.
# shellcheck source=android_gradle_limits.sh
source "$(dirname "$0")/android_gradle_limits.sh"
apply_android_gradle_limits

echo "Building release AAB…"
(
  cd android
  ./gradlew bundleRelease --max-workers="$MAX_CPUS" "$@"
)

if [ ! -f "$AAB_PATH" ]; then
  # Gradle sometimes names the AAB with the app name
  AAB_PATH="$(find "$AAB_OUT_DIR" -name '*.aab' | head -n 1 || true)"
fi
if [ -z "${AAB_PATH}" ] || [ ! -f "$AAB_PATH" ]; then
  echo "error: No .aab found under ${AAB_OUT_DIR}" >&2
  exit 1
fi

mkdir -p build
cp "$AAB_PATH" "build/$(basename "$AAB_PATH")"
echo "AAB ready: ${AAB_PATH}"
echo "Copied to: build/$(basename "$AAB_PATH")"

if [ "$ARCHIVE_ONLY" = "1" ]; then
  echo "ARCHIVE_ONLY=1 — skipping Play upload."
  exit 0
fi

echo "Uploading to Google Play (track=${PLAY_TRACK})…"
PLAY_TRACK="$PLAY_TRACK" \
PLAY_RELEASE_STATUS="$PLAY_RELEASE_STATUS" \
PLAY_PACKAGE_NAME="$PLAY_PACKAGE_NAME" \
PLAY_SERVICE_ACCOUNT_JSON="$PLAY_SERVICE_ACCOUNT_JSON" \
  node scripts/upload_play.js "$AAB_PATH"

echo "Upload complete. Check Play Console → ${PLAY_TRACK} track."
