#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah ULTIMATE One-Command Deploy v5.0
# Kopiere diesen Befehl in dein SSH-Terminal:
#   curl -sL https://raw.githubusercontent.com/niknight1403/cybersarah-revenue-os/main/ultimate-deploy.sh | bash
# ═══════════════════════════════════════════════════════════════════

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  🚀 CyberSarah ULTIMATE DEPLOY v5.0 ║"
echo "║  Alles auf einmal — kein manuelles  ║"
echo "║  Eingreifen nötig!                  ║"
echo "╚══════════════════════════════════════╝"
echo ""

cd /opt/cybersarah

# 1. Code updaten
echo "📥 1/7 Pull neueste Code-Änderungen..."
git fetch origin
git reset --hard origin/main

# 2. Dependencies
echo "📦 2/7 Installiere Dependencies..."
pnpm install 2>&1 | tail -5

# 3. .env kopieren
echo "⚙️  3/7 Kopiere Konfiguration..."
cp .env artifacts/api-server/.env 2>/dev/null || true
cp .env apps/api/.env 2>/dev/null || true

# 4. Dashboard bauen
echo "🏗️  4/7 Baue Dashboard..."
if [ -d "artifacts/dashboard" ]; then
  cd artifacts/dashboard
  pnpm run build 2>&1 | tail -5
  cd /opt/cybersarah
fi

# 5. Capacitor sync
echo "🔄 5/7 Synchronisiere Capacitor..."
npx cap sync android 2>&1 | tail -3

# 6. Alte Prozesse killen & Server neustarten
echo "🚀 6/7 Starte Server neu..."
pm2 delete cybersarah 2>/dev/null || true
pm2 delete cybersarah-api 2>/dev/null || true
cd artifacts/api-server
pm2 start "npx tsx src/index.ts" --name cybersarah --time --max-memory-restart 500M
pm2 save
sleep 3

# 7. Verifikation
echo "✅ 7/7 Prüfe Server-Status..."
echo ""
echo "╔══════════════════════════════════════╗"
echo "║  Server-Status:                      ║"
pm2 status cybersarah --no-color 2>/dev/null || echo "  🟡 Prüfe..."
echo "╚══════════════════════════════════════╝"
echo ""

# API Health-Check
sleep 2
HEALTH=$(curl -s --connect-timeout 5 http://localhost:3000/api/health 2>/dev/null || echo "{}")
echo "📡 API Health: $HEALTH"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✅ DEPLOY ABGESCHLOSSEN!            ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "🌐 Wichtige URLs:"
echo "  🏠 Dashboard:     http://167.233.196.20:3000"
echo "  🛍️ Store:         http://167.233.196.20:3000/api/store"
echo "  💰 Revenue:       http://167.233.196.20:3000/api/revenue"
echo "  📊 Monitoring:    http://167.233.196.20:3000/api/system-dashboard"
echo "  🚀 Quick-Start:   curl -X POST http://167.233.196.20:3000/api/quick-start"
echo "  📱 APK:           http://167.233.196.20:3000/apk/CyberSarah-Master-v5.0-release.apk"
echo ""
echo "📋 Logs: pm2 logs cybersarah --lines 20"
