#!/bin/sh
# Install good-qwen into OMP's extensions directory.
# Symlink: this git repo stays the single source of truth; the install is a link.
set -eu

DEST="$HOME/.omp/agent/extensions/good-qwen"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

if [ -L "$DEST" ] || [ -e "$DEST" ]; then
	echo "Refusing to overwrite existing $DEST — remove it first." >&2
	exit 1
fi

mkdir -p "$(dirname "$DEST")"
ln -s "$REPO" "$DEST"

cd "$REPO"
[ -d node_modules ] || npm install --no-audit --no-fund

echo "Installed: $DEST -> $REPO"
echo "Restart the agent (or /reload) to load; verify with /good-qwen."
