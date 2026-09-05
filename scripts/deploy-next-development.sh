#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/cybersarah-control-center"
BRANCH="next-development"

cd "$REPO_DIR"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"
npm install
npm run build

if pm2 describe cybersarah-backend >/dev/null 2>&1; then
  pm2 restart cybersarah-backend --update-env
elif pm2 describe cybersarah-control-center >/dev/null 2>&1; then
  echo "PM2-App cybersarah-backend nicht gefunden; starte cybersarah-control-center neu."
  pm2 restart cybersarah-control-center --update-env
else
  echo "Keine passende PM2-App gefunden (cybersarah-backend oder cybersarah-control-center)." >&2
  exit 1
fi

pm2 save
pm2 status
