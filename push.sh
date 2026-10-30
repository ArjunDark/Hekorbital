#!/usr/bin/env bash
# ---------------------------------------------------------------------
# push.sh — put this project into a GitHub repository in one step.
#
#   ./push.sh git@github.com:<owner>/<repo>.git
#   ./push.sh https://github.com/<owner>/<repo>.git main
#
# Creates the commit if there is not one yet, then pushes. Safe to
# re-run: it amends nothing, it just commits any new changes.
# ---------------------------------------------------------------------
set -euo pipefail

REMOTE="${1:-}"
BRANCH="${2:-main}"

if [ -z "$REMOTE" ]; then
  echo "usage: ./push.sh <remote-url> [branch]" >&2
  exit 1
fi

cd "$(dirname "$0")"

if [ ! -d .git ]; then
  git init -q
  git branch -M "$BRANCH"
fi

git add -A

if git rev-parse --verify HEAD >/dev/null 2>&1; then
  if ! git diff --cached --quiet; then
    git commit -q -m "update: pipeline simulator"
  fi
else
  git -c user.name="${GIT_AUTHOR_NAME:-sat-img-pipe}" \
      -c user.email="${GIT_AUTHOR_EMAIL:-dev@localhost}" \
      commit -q -m "SAT-IMG-PIPE: onboard imaging pipeline simulator

Browser simulator for a satellite imaging pipeline: 4.2 MB SRAM staging
buffer, preprocessing, pluggable model connector, and a storage manager
that compresses and evicts frames as mass memory fills.

- dataset/     18 public-domain satellite tiles + manifest
- preprocess/  feature extraction (cloud mask, entropy, edge density)
- model/       connector registry + placeholder feature scorer
- js/          dashboard, stage, storage policy, UI"
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git push -u origin "$BRANCH"

echo
echo "pushed to $REMOTE ($BRANCH)"
