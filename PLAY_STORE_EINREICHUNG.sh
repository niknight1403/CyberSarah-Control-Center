#!/bin/bash
# Play Store Einreichungs-Validierungs-Skript
# Führt alle erforderlichen Überprüfungen vor der Einreichung im Google Play Store durch

set -e

echo "🚀 CyberSarah Control Center – Play Store Einreichungs-Checkliste"
echo "=================================================================="
echo ""

# Farbcodes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # Keine Farbe

pass_count=0
fail_count=0
warn_count=0

check_step() {
  local step=$1
  local command=$2
  local is_warning=${3:-false}
  
  echo -n "Überprüfe: $step... "
  
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ BESTANDEN${NC}"
    ((pass_count++))
  else
    if [ "$is_warning" = true ]; then
      echo -e "${YELLOW}⚠ WARNUNG${NC}"
      ((warn_count++))
    else
      echo -e "${RED}✗ FEHLER${NC}"
      ((fail_count++))
    fi
  fi
}

warn_step() {
  local step=$1
  echo -e "${YELLOW}⚠ TODO: $step${NC}"
  ((warn_count++))
}

# ============================================================
# 1. BUILD & ABHÄNGIGKEITEN
# ============================================================
echo -e "\n${YELLOW}1. Build & Abhängigkeiten${NC}"
check_step "Node-Version kompatibel" "node --version | grep -E 'v(18|19|20|21)' > /dev/null"
check_step "pnpm installiert" "pnpm --version > /dev/null"
check_step "Abhängigkeiten installiert" "[ -d node_modules ]"

# ============================================================
# 2. TYPPRÜFUNG & LINTING
# ============================================================
echo -e "\n${YELLOW}2. Typprüfung & Linting${NC}"
check_step "TypeScript-Kompilierung" "pnpm check"
check_step "ESLint erfolgreich" "pnpm lint" true
check_step "Keine Konsolenfehler" "grep -r 'console\\.error\\|console\\.log' app --include='*.ts' --include='*.tsx' | wc -l | grep -q '^0$'" true

# ============================================================
# 3. TESTING
# ============================================================
echo -e "\n${YELLOW}3. Testing${NC}"
check_step "Alle Tests erfolgreich" "pnpm test"
check_step "Workspace-Service-Syntax" "node --check workspace-service/src/index.js"

# ============================================================
# 4. BUILD-VALIDIERUNG
# ============================================================
echo -e "\n${YELLOW}4. Build-Validierung${NC}"
check_step "Server-Build erfolgreich" "pnpm build"
check_step "App-Config gültig TypeScript" "grep -q 'export default config' app.config.ts"

# ============================================================
# 5. KONFIGURATION-VALIDIERUNG
# ============================================================
echo -e "\n${YELLOW}5. Konfiguration-Validierung${NC}"

# Überprüfe app.config.ts Werte
check_step "App-Name gesetzt" "grep -q 'CyberSarah Control Center' app.config.ts"
check_step "Paket-ID gültig" "grep -q 'com.app.customaistudiomobile' app.config.ts"
check_step "Ausrichtung Portrait" "grep -q \"orientation: \\\"portrait\\\"\" app.config.ts"
check_step "Android SDK 24+" "grep -q \"minSdkVersion: 24\" app.config.ts"
check_step "Adaptives Icon konfiguriert" "grep -q 'adaptiveIcon' app.config.ts"

# Überprüfe eas.json
check_step "EAS-Config hat Production" "grep -q 'production' eas.json"
check_step "Auto-Inkrement aktiviert" "grep -q 'autoIncrement' eas.json"

# ============================================================
# 6. SICHERHEITSPRÜFUNGEN
# ============================================================
echo -e "\n${YELLOW}6. Sicherheitsprüfungen${NC}"
check_step "Keine hardcodierten API-Schlüssel" "grep -r 'sk_live_\\|AIza\\|api_key.*=' app --include='*.ts' --include='*.tsx' | wc -l | grep -q '^0$'" true
check_step "Keine hardcodierten Tokens" "grep -r 'ghp_\\|github.*token' app --include='*.ts' --include='*.tsx' --include='*.js' | wc -l | grep -q '^0$'" true
check_step "Geheimnisse verwenden SecureStore" "grep -r 'SecureStore\\|@react-native-async-storage' app --include='*.ts' --include='*.tsx' | wc -l | grep -q '^[1-9]'"
check_step "Keine console.log in Production" "grep -r 'console\\.log' server --include='*.ts' --include='*.js' | wc -l | grep -q '^0$'" true

# ============================================================
# 7. ASSET-VALIDIERUNG
# ============================================================
echo -e "\n${YELLOW}7. Asset-Validierung${NC}"
check_step "Icon vorhanden" "[ -f assets/images/icon.png ]"
check_step "Android Icon Vordergrund" "[ -f assets/images/android-icon-foreground.png ]"
check_step "Android Icon Hintergrund" "[ -f assets/images/android-icon-background.png ]"
check_step "Android Icon Monochrom" "[ -f assets/images/android-icon-monochrome.png ]"
check_step "Splash-Screen vorhanden" "[ -f assets/images/splash-icon.png ]"

# ============================================================
# 8. DOKUMENTATION
# ============================================================
echo -e "\n${YELLOW}8. Dokumentation${NC}"
check_step "README vorhanden" "[ -f README.md ]"
check_step "Datenschutzrichtlinie vorhanden" "[ -f DATENSCHUTZ.md ]"
check_step "Play Store Checkliste vorhanden" "[ -f PLAY_STORE_BEREITSCHAFT.md ]"
check_step "Release-Handoff vorhanden" "[ -f RELEASE_HANDOFF.md ]"

# ============================================================
# 9. GIT-STATUS
# ============================================================
echo -e "\n${YELLOW}9. Git-Status${NC}"
check_step "Keine ungespeicherten Änderungen" "git diff --quiet" true
check_step "Keine unverfolgten Dateien" "[ -z \"\$(git ls-files --others --exclude-standard)\" ]" true
check_step "Auf main oder Release-Branch" "git rev-parse --abbrev-ref HEAD | grep -E 'main|release' > /dev/null" true

# ============================================================
# 10. UMGEBUNG
# ============================================================
echo -e "\n${YELLOW}10. Umgebung${NC}"
check_step ".env.production vorhanden" "[ -f .env.production ]" true
check_step "Keine Geheimnisse in .env" "grep -i 'token\\|key\\|secret' .env 2>/dev/null | wc -l | grep -q '^0$'" true

# ============================================================
# 11. MANUELLE TODO-PUNKTE
# ============================================================
echo -e "\n${YELLOW}11. Manuelle Überprüfung (Vor Einreichung)${NC}"
warn_step "1024×500 Feature-Grafik für Play Store erstellen"
warn_step "5–8 App-Screenshots erstellen (min. 1080×1920 px)"
warn_step "Werbegrafik erstellen (1200×628 px)"
warn_step "Überzeugende App-Beschreibung schreiben (80–4000 Zeichen)"
warn_step "Content-Rating in Play Console setzen"
warn_step "Auf echtem Android 7.0+ Gerät testen"
warn_step "Offline-Modus funktioniert korrekt"
warn_step "Alle Provider-Integrationen testen (GitHub, KI, Workspace-Service)"
warn_step "Signierte APK generieren oder verwaltete Signierung in EAS aktivieren"

# ============================================================
# ZUSAMMENFASSUNG
# ============================================================
echo ""
echo "=================================================================="
echo "📊 Einreichungs-Bereitschafts-Zusammenfassung"
echo "=================================================================="
echo -e "${GREEN}✓ Bestanden:${NC}       $pass_count"
echo -e "${RED}✗ Fehler:${NC}         $fail_count"
echo -e "${YELLOW}⚠ Warnungen:${NC}      $warn_count"
echo ""

if [ $fail_count -gt 0 ]; then
  echo -e "${RED}❌ NICHT ZUR EINREICHUNG BEREIT${NC}"
  echo "Bitte beheben Sie die fehlgeschlagenen Überprüfungen oben und führen Sie dieses Skript erneut aus."
  exit 1
elif [ $warn_count -gt 0 ]; then
  echo -e "${YELLOW}⚠️  BEREIT MIT VORBEHALTEN${NC}"
  echo "Führen Sie die manuellen Überprüfungsschritte durch, bevor Sie im Play Store einreichen."
  exit 0
else
  echo -e "${GREEN}✅ ZUR EINREICHUNG BEREIT${NC}"
  echo "Alle automatisierten Überprüfungen bestanden. Fahren Sie mit manueller Überprüfung und Play Store Einreichung fort."
  exit 0
fi
