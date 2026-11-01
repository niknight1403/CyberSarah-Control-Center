#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah Quick-Fix — Server sofort reparieren & optimieren
# Einziger Befehl (auf dem Server ausführen):
#   curl -sL https://raw.githubusercontent.com/niknight1403/cybersarah-revenue-os/main/quick-fix-server.sh | bash
# ═══════════════════════════════════════════════════════════════════

set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  🔧 CyberSarah Quick-Fix & Optimierung  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

cd /opt/cybersarah

# 1. Neuesten Code holen
echo "📥 1/9 Pull neueste Code-Änderungen..."
git fetch origin
git reset --hard origin/main

# 2. Dependencies installieren
echo "📦 2/9 Installiere Dependencies..."
pnpm install 2>&1 | tail -3

# 3. .env kopieren
echo "⚙️  3/9 Kopiere Konfiguration..."
cp .env artifacts/api-server/.env 2>/dev/null || true

# 4. Alte PM2-Prozesse killen
echo "🛑 4/9 Stoppe alte Prozesse..."
pm2 delete cybersarah 2>/dev/null || true
pm2 delete cybersarah-api 2>/dev/null || true
pm2 delete auto-update 2>/dev/null || true
sleep 1

# 5. Server starten
echo "🚀 5/9 Starte API-Server..."
cd artifacts/api-server
pm2 start "npx tsx src/index.ts" --name cybersarah --time --max-memory-restart 500M
pm2 save
cd /opt/cybersarah
sleep 4

# 6. Quick-Start ausführen (alle Agenten aktivieren)
echo "⚡ 6/9 Quick-Start — alle Agenten aktivieren..."
curl -s -X POST http://localhost:3000/api/quick-start 2>/dev/null || echo "⚠️ Quick-Start API nicht verfügbar (erwartet bei 1. Start)"

# 7. Health-Check
echo "🏥 7/9 Health-Check..."
sleep 2
curl -s --connect-timeout 5 http://localhost:3000/api/health 2>/dev/null || echo "⚠️ Health-Endpunkt nicht gefunden"
curl -s --connect-timeout 5 http://localhost:3000/api/quick-status 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print('📊',d.get('oneLine','?'))" 2>/dev/null || echo "⚠️ Status nicht verfügbar"

# 8. Dashboard bauen (falls vorhanden)
echo "🏗️  8/9 Baue Dashboard (dauert ~7 Min)..."
if [ -d "artifacts/dashboard" ]; then
  cd artifacts/dashboard
  pnpm run build 2>&1 | tail -5 &
  BUILD_PID=$!
  echo "   Dashboard-Build läuft im Hintergrund (PID: $BUILD_PID)"
  cd /opt/cybersarah
fi

# 9. Zusammenfassung
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ QUICK-FIX ABGESCHLOSSEN!            ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "📋 Server-Status:"
pm2 status cybersarah --no-color 2>/dev/null | head -10
echo ""
echo "📋 Logs: pm2 logs cybersarah --lines 30"
echo "🌐 Dashboard: http://167.233.196.20:3000"
echo "💰 Revenue:   http://167.233.196.20:3000/api/revenue"
echo "🚀 Quick-Start: curl -X POST http://167.233.196.20:3000/api/quick-start"
echo ""
echo "💡 Tipp: Dashboard-Build prüfen mit: pm2 logs cybersarah --lines 10"
