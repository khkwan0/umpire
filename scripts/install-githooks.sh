#!/usr/bin/env bash
# Install .githooks/post-commit into this clone's .git/hooks (no git config).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"
chmod +x .githooks/post-commit
dest="$(git rev-parse --git-path hooks/post-commit)"
mkdir -p "$(dirname "${dest}")"
ln -sfr .githooks/post-commit "${dest}"
echo "Installed ${dest} -> .githooks/post-commit"
