#!/bin/bash
# CyberSarah Revenue OS — Deploy-Script
# Führe auf dem Hetzner-Server aus: bash deploy.sh
set -e
cd /opt/cybersarah
echo "🔄 Stoppe alten Server..."
pm2 delete all 2>/dev/null || true
echo "📥 Pull neueste Änderungen..."
git fetch origin
git reset --hard origin/main
echo "📦 Installiere Dependencies..."
pnpm install
echo "⚙️  Kopiere .env..."
cp .env artifacts/api-server/.env
echo "🚀 Starte Server..."
cd artifacts/api-server
pm2 start "npx tsx src/index.ts" --name cybersarah
pm2 save
echo "✅ Deploy abgeschlossen!"
pm2 status
echo "📋 Logs: pm2 logs cybersarah --lines 30"
