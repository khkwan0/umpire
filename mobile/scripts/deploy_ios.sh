#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

echo "Unlocking login keychain for code signing…"
security unlock-keychain ~/Library/Keychains/login.keychain-db

echo "Running prebuild…"
npx expo prebuild --platform ios

# Cap parallelism so the build doesn't pin every core.
# expo run:ios doesn't forward -jobs, so wrap xcodebuild on PATH.
MAX_CPUS="${MAX_CPUS:-4}"
XCODEBUILD_BIN="$(command -v xcodebuild)"
WRAP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/xcodebuild-wrap.XXXXXX")"
cleanup_wrap() { rm -rf "$WRAP_DIR"; }
trap cleanup_wrap EXIT
cat > "$WRAP_DIR/xcodebuild" <<EOF
#!/usr/bin/env bash
exec "$XCODEBUILD_BIN" \\
  -jobs "$MAX_CPUS" \\
  -IDEBuildOperationMaxNumberOfConcurrentCompileTasks="$MAX_CPUS" \\
  "\$@"
EOF
chmod +x "$WRAP_DIR/xcodebuild"
export PATH="$WRAP_DIR:$PATH"

echo "Building and installing on device (max ${MAX_CPUS} CPUs)…"
npx expo run:ios --device "$@"
