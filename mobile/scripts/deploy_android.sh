#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Running prebuild…"
npx expo prebuild --platform android

# Cap CPU + JVM heaps so the Mac mini stays out of swap.
# shellcheck source=android_gradle_limits.sh
source "$(dirname "$0")/android_gradle_limits.sh"
apply_android_gradle_limits

echo "Building and installing on device (max ${MAX_CPUS} CPUs, heap ${MAX_HEAP_MB}m)…"
npx expo run:android --device "$@"
