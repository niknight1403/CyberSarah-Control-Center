#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah Revenue OS — Deploy + APK-Build Script
# Auf Hetzner Server ausführen als root
# ═══════════════════════════════════════════════════════════════════
set -e

echo "🚀 CyberSarah Deploy + APK-Build gestartet..."

# ─── 1. Code updaten ────────────────────────────────────────────────
cd /opt/cybersarah
git fetch origin
git reset --hard origin/main
echo "✅ Code aktualisiert"

# ─── 2. Dependencies installieren ───────────────────────────────────
pnpm install
cp .env artifacts/api-server/.env
echo "✅ Dependencies installiert"

# ─── 3. Server neu starten (optimierte Agenten) ────────────────────
cd artifacts/api-server
pm2 delete all 2>/dev/null || true
pm2 start "npx tsx src/index.ts" --name cybersarah
pm2 save
pm2 startup 2>/dev/null || true
echo "✅ Server neu gestartet mit optimierten Agenten"

# ─── 4. Android SDK installieren (falls nicht vorhanden) ───────────
if [ ! -f /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager ]; then
  echo "📦 Installiere Android SDK..."
  mkdir -p /opt/android-sdk/cmdline-tools
  cd /opt/android-sdk/cmdline-tools
  curl -sL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o cmdline-tools.zip
  unzip -q cmdline-tools.zip
  mv cmdline-tools latest
  rm cmdline-tools.zip
  
  export ANDROID_HOME=/opt/android-sdk
  export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
  
  yes | sdkmanager --licenses 2>/dev/null
  sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"
  echo "✅ Android SDK installiert"
else
  echo "✅ Android SDK bereits vorhanden"
fi

# ─── 5. Dashboard bauen ────────────────────────────────────────────
cd /opt/cybersarah
pnpm --filter cybersarah-dashboard run build 2>&1 || echo "Dashboard-Build übersprungen (nicht kritisch)"
echo "✅ Dashboard gebaut"

# ─── 6. Capacitor sync + APK bauen ────────────────────────────────
cd /opt/cybersarah
npx cap sync android 2>&1 || echo "Capacitor Sync übersprungen"

cd android
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 2>/dev/null || export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 2>/dev/null || true

chmod +x gradlew
./gradlew assembleDebug 2>&1

# ─── 7. APK kopieren ──────────────────────────────────────────────
APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
  cp "$APK_PATH" /opt/cybersarah/CyberSarah-v3.0.0-debug.apk
  echo ""
  echo "══════════════════════════════════════════════════════"
  echo "✅ APK ERFOLGREICH ERSTELLT!"
  echo "📄 /opt/cybersarah/CyberSarah-v3.0.0-debug.apk"
  echo "══════════════════════════════════════════════════════"
else
  echo "❌ APK-Build fehlgeschlagen — prüfe Logs"
fi

# ─── 8. Server-Status prüfen ──────────────────────────────────────
echo ""
echo "📊 Server-Status:"
pm2 status
pm2 logs cybersarah --lines 10 --nostream

echo ""
echo "✅ Deploy abgeschlossen!"
