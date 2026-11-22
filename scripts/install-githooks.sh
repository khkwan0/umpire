#!/usr/bin/env bash
# Point this clone at .githooks/ (post-commit version bump on master).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"
git config core.hooksPath .githooks
chmod +x .githooks/post-commit
echo "core.hooksPath=.githooks (post-commit version bump on master)"
