#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ARCHIVE_PATH="${ARCHIVE_PATH:-build/UMPIRE.xcarchive}"
EXPORT_PATH="${EXPORT_PATH:-build}"
EXPORT_OPTIONS="${EXPORT_OPTIONS:-ios-export/ExportOptions.plist}"
PRIVATE_KEYS_DIR="${PRIVATE_KEYS_DIR:-private_keys}"
UPLOAD="${UPLOAD:-0}"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

require_upload_credentials() {
  if [ -z "${ASC_KEY_ID:-}" ] || [ -z "${ASC_ISSUER_ID:-}" ]; then
    cat >&2 <<'MSG'
Missing App Store Connect API credentials for upload.

Set in .env.local:

  ASC_KEY_ID=XXXXXXXXXX
  ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

Place the key at private_keys/AuthKey_${ASC_KEY_ID}.p8

Or export only without upload (default).
MSG
    exit 1
  fi

  local key_file="${PRIVATE_KEYS_DIR}/AuthKey_${ASC_KEY_ID}.p8"
  if [ ! -f "$key_file" ]; then
    local home_key="${HOME}/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
    if [ ! -f "$home_key" ]; then
      echo "Missing API key file: ${key_file}" >&2
      exit 1
    fi
  fi
}

if [ ! -d "$ARCHIVE_PATH" ]; then
  cat >&2 <<MSG
error: Archive not found at ${ARCHIVE_PATH}

Create one with:

  ARCHIVE_ONLY=1 npm run archive_ios

Or set ARCHIVE_PATH to an existing .xcarchive.
MSG
  exit 1
fi

if [ -z "${APPLE_TEAM_ID:-}" ]; then
  cat >&2 <<'MSG'
Missing APPLE_TEAM_ID for IPA export.

Set in .env.local:

  APPLE_TEAM_ID=XXXXXXXXXX
MSG
  exit 1
fi

mkdir -p "$EXPORT_PATH"

# shellcheck disable=SC1091
source "$(dirname "$0")/unlock_signing_keychain.sh"

verify_distribution_signing() {
  local dist_id
  dist_id="$(security find-identity -v -p codesigning 2>/dev/null \
    | awk -F\" '/Apple Distribution|iPhone Distribution/{print $2; exit}')"
  if [ -z "$dist_id" ]; then
    cat >&2 <<'MSG'
error: No Apple Distribution certificate in the login keychain.

Open Xcode → Settings → Accounts → Manage Certificates and create or download
an Apple Distribution certificate for this team.
MSG
    exit 1
  fi

  local sign_test
  sign_test="$(mktemp)"
  echo test >"$sign_test"
  if ! /usr/bin/codesign --force --sign "$dist_id" "$sign_test" 2>/dev/null; then
    rm -f "$sign_test"
    cat >&2 <<'MSG'
error: Apple Distribution certificate cannot sign (errSecInternalComponent).

The Distribution identity is listed in the keychain but codesign cannot use its private key.
Unlocking the keychain is not enough when the key is broken, iCloud-synced without
local signing access, or blocked by ACLs.

Try (in order):

1. Keychain Access → login → My Certificates → expand Apple Distribution →
   double-click the private key → Access Control → allow all applications.

2. Run: npm run unlock_signing_keychain

3. Recreate the Distribution cert on THIS Mac (most reliable fix):
   Xcode → Settings → Accounts → Manage Certificates → delete Apple Distribution
   → + → Apple Distribution. Then run export again.
MSG
    echo "Quick test: codesign --force --sign \"${dist_id}\" /tmp/sign-test.txt && echo OK" >&2
    exit 1
  fi
  rm -f "$sign_test"
}

prepare_signing_keychain_if_needed

echo "Verifying Apple Distribution signing…"
verify_distribution_signing

/usr/libexec/PlistBuddy -c "Add :teamID string ${APPLE_TEAM_ID}" "$EXPORT_OPTIONS" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :teamID ${APPLE_TEAM_ID}" "$EXPORT_OPTIONS"

echo "Exporting IPA from ${ARCHIVE_PATH} → ${EXPORT_PATH}…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

IPA_PATH="$(find "$EXPORT_PATH" -maxdepth 1 -name '*.ipa' -print -quit)"
if [ -z "$IPA_PATH" ]; then
  echo "error: No .ipa found in ${EXPORT_PATH}" >&2
  exit 1
fi

echo "Export complete: ${IPA_PATH}"

if [ "$UPLOAD" != "1" ]; then
  echo "Set UPLOAD=1 to upload to App Store Connect."
  exit 0
fi

require_upload_credentials

echo "Uploading ${IPA_PATH} to App Store Connect…"
export API_PRIVATE_KEYS_DIR
API_PRIVATE_KEYS_DIR="$(cd "$PRIVATE_KEYS_DIR" && pwd)"

xcrun altool --upload-app \
  -f "$IPA_PATH" \
  -t ios \
  --apiKey "${ASC_KEY_ID}" \
  --apiIssuer "${ASC_ISSUER_ID}"

echo "Upload complete. Processing will appear in App Store Connect / TestFlight shortly."
