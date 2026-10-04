#!/usr/bin/env bash
# Puts preview files (videos, samples) on their own branch, replacing what was there,
# so they are easy to open from GitHub. Nothing else in the repo is touched.
set -euo pipefail
branch="$1"; msg="$2"; shift 2
tmp=$(mktemp -d)
for src in "$@"; do [ -e "$src" ] && cp -r "$src" "$tmp/"; done
find "$tmp" -name 'voice.wav' -delete
cd "$tmp"
git init -q -b "$branch"
git config user.name "pip-bot"
git config user.email "pip-bot@users.noreply.github.com"
git add -A
git commit -qm "$msg"
git push -f "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "$branch"
echo "Pushed to the $branch branch"
