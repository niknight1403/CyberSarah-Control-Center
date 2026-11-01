#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah Revenue OS — OPTIMIERTER Deploy
# Enthält: HARA V3, RevenueAnalyst V3, Monetization V3, schnellere Crons
# Führt aus: Code-Pull → Dependencies → Server-Restart → APK-Build
# ═══════════════════════════════════════════════════════════════════
set -e

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🚀 CyberSarah Revenue OS — OPTIMIERTER DEPLOY     ║"
echo "║  HARA V3 + RevenueAnalyst V3 + Monetization V3     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

cd /opt/cybersarah

# ─── 1. Aktuelle Code-Änderungen sichern (lokale Optimierungen) ───
echo "📦 Sichere lokale Optimierungen..."
mkdir -p /root/cybersarah-backup-$(date +%Y%m%d)
cp artifacts/api-server/src/agents/HaraAgent.ts /root/cybersarah-backup-$(date +%Y%m%d)/HaraAgent.ts 2>/dev/null || true
cp artifacts/api-server/src/agents/RevenueAnalystAgent.ts /root/cybersarah-backup-$(date +%Y%m%d)/RevenueAnalystAgent.ts 2>/dev/null || true
cp artifacts/api-server/src/agents/MonetizationAgent.ts /root/cybersarah-backup-$(date +%Y%m%d)/MonetizationAgent.ts 2>/dev/null || true
cp artifacts/api-server/src/agents/orchestrator.ts /root/cybersarah-backup-$(date +%Y%m%d)/orchestrator.ts 2>/dev/null || true
echo "✅ Backup gesichert"

# ─── 2. Git-Updates holen ──────────────────────────────────────────
echo "📥 Hole Code-Updates..."
git fetch origin
git stash 2>/dev/null || true  # Temporäre lokale Änderungen sichern
git pull origin main --rebase 2>/dev/null || git reset --hard origin/main
git stash pop 2>/dev/null || true  # Lokale Optimierungen zurück
echo "✅ Code aktualisiert"

# ─── 3. Optimierte Agenten-Dateien erneut anwenden (falls durch git überschrieben) ──
# (Hier werden die optimierten Dateien aus dem Backup wiederhergestellt, 
#  falls git sie überschrieben hat)
if [ -f /root/cybersarah-backup-*/HaraAgent.ts ]; then
  echo "🔄 Stelle optimierte Agenten wieder her..."
  cp /root/cybersarah-backup-*/HaraAgent.ts artifacts/api-server/src/agents/HaraAgent.ts 2>/dev/null || true
  cp /root/cybersarah-backup-*/RevenueAnalystAgent.ts artifacts/api-server/src/agents/RevenueAnalystAgent.ts 2>/dev/null || true
  cp /root/cybersarah-backup-*/MonetizationAgent.ts artifacts/api-server/src/agents/MonetizationAgent.ts 2>/dev/null || true
  cp /root/cybersarah-backup-*/orchestrator.ts artifacts/api-server/src/agents/orchestrator.ts 2>/dev/null || true
  echo "✅ Optimierte Agenten wiederhergestellt"
fi

# ─── 4. Dependencies installieren ──────────────────────────────────
echo "📦 Installiere Dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
cp .env artifacts/api-server/.env 2>/dev/null || true
echo "✅ Dependencies installiert"

# ─── 5. Server neu starten ─────────────────────────────────────────
echo "🔄 Starte Server neu..."
cd artifacts/api-server
pm2 delete cybersarah 2>/dev/null || true
pm2 start "npx tsx src/index.ts" --name cybersarah --max-memory-restart 512M
pm2 save
echo "✅ Server gestartet"

# ─── 6. APK bauen (Capacitor Android) ──────────────────────────────
echo "📱 Baue APK..."
cd /opt/cybersarah

# Dashboard bauen (für WebView-Inhalt)
pnpm --filter cybersarah-dashboard run build 2>/dev/null && echo "✅ Dashboard gebaut" || echo "⚠️ Dashboard-Build übersprungen"

# Capacitor sync
npx cap sync android 2>/dev/null || echo "⚠️ Capacitor Sync übersprungen"

# APK bauen
cd android
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 2>/dev/null || true
./gradlew assembleDebug 2>&1 | tail -5

# APK kopieren
APK_SRC="app/build/outputs/apk/debug/app-debug.apk"
APK_DST="/opt/cybersarah/CyberSarah-v3.0.0-optimized.apk"
if [ -f "$APK_SRC" ]; then
  cp "$APK_SRC" "$APK_DST"
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ✅ APK ERFOLGREICH ERSTELLT!                       ║"
  echo "║  📄 $APK_DST"
  echo "║  📦 Größe: $(ls -lh "$APK_DST" | awk '{print $5}')"
  echo "╚══════════════════════════════════════════════════════╝"
else
  echo "❌ APK-Build fehlgeschlagen — prüfe Logs"
fi

# ─── 7. Status-Prüfung ────────────────────────────────────────────
echo ""
echo "📊 Server-Status:"
pm2 status
echo ""
echo "✅ Optimierter Deploy abgeschlossen!"
echo ""
echo "═══ OPTIMIERUNGEN ═══"
echo "✅ HARA V3: Auto-Confirm-Schwelle 40 (vorher 55), 8 Vorschläge/Durchlauf, Stripe-Umsatz-Tracking"
echo "✅ RevenueAnalyst V3: Erstellt automatisch Stripe-Produkte + Payment-Links für Top-Chancen"
echo "✅ Monetization V3: Erstellt 5 Upsell-Produkte via Stripe, Auto-Kampagnen"
echo "✅ Orchestrator V3: HARA stündlich, RevenueAnalyst stündlich, Master alle 5 Min"
echo "════════════════════════"
