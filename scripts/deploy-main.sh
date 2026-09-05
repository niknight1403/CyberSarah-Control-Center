#!/usr/bin/env bash
set -euo pipefail

cd /opt/cybersarah-control-center
git fetch origin main
git pull --ff-only origin main
npm install
npm run build
pm2 restart cybersarah-backend --update-env
pm2 save
pm2 status cybersarah-backend
