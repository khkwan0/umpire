#!/usr/bin/env bash
# Unlock the login keychain and authorize codesign for Distribution export.
# Sourced by archive_ios.sh / export_ios.sh, or run directly:
#   bash scripts/unlock_signing_keychain.sh

LOGIN_KEYCHAIN="${LOGIN_KEYCHAIN:-${HOME}/Library/Keychains/login.keychain-db}"

prepare_signing_keychain() {
  local password="${KEYCHAIN_PASSWORD:-}"

  if [ -z "$password" ]; then
    read -rsp "Mac login password (for code signing keychain): " password
    echo
  fi

  echo "Unlocking login keychain for code signing…"
  security unlock-keychain -p "$password" "$LOGIN_KEYCHAIN"

  echo "Authorizing codesign for the login keychain…"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
    -k "$password" "$LOGIN_KEYCHAIN"
}

distribution_signing_works() {
  local dist_id sign_test
  dist_id="$(security find-identity -v -p codesigning 2>/dev/null \
    | awk -F\" '/Apple Distribution|iPhone Distribution/{print $2; exit}')"
  if [ -z "$dist_id" ]; then
    return 1
  fi

  sign_test="$(mktemp)"
  echo test >"$sign_test"
  if /usr/bin/codesign --force --sign "$dist_id" "$sign_test" 2>/dev/null; then
    rm -f "$sign_test"
    return 0
  fi
  rm -f "$sign_test"
  return 1
}

prepare_signing_keychain_if_needed() {
  if distribution_signing_works; then
    return 0
  fi
  prepare_signing_keychain
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
  prepare_signing_keychain_if_needed
  echo "Code signing keychain ready."
fi
