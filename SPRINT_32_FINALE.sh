#!/bin/bash
# Sprint 32 – Play Store Ready Finalizer
# Schließt alle erforderlichen Schritte für die Play Store Bereitschaft ab

set -e

echo "🎯 Sprint 32 – CyberSarah Control Center Play Store Ready"
echo "=========================================================="
echo ""

# Farben
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================
# 1. AUTOMATISIERTE ÜBERPRÜFUNGEN AUSFÜHREN
# ============================================================
echo -e "${BLUE}Schritt 1: Automatisierte Überprüfungen${NC}"
echo "=================================================="

echo "Überprüfe TypeScript..."
pnpm check

echo ""
echo "Führe Tests aus..."
pnpm test

echo ""
echo "Überprüfe ESLint..."
pnpm lint

echo ""
echo "Baue Server..."
pnpm build

echo ""
echo "Überprüfe Workspace-Service..."
node --check workspace-service/src/index.js

# ============================================================
# 2. DOKUMENTE VALIDIEREN
# ============================================================
echo -e "\n${BLUE}Schritt 2: Dokumentation validieren${NC}"
echo "=================================================="

if [ ! -f "PLAY_STORE_BEREITSCHAFT.md" ]; then
  echo "❌ PLAY_STORE_BEREITSCHAFT.md nicht gefunden!"
  exit 1
else
  echo -e "${GREEN}✓${NC} PLAY_STORE_BEREITSCHAFT.md gefunden"
fi

if [ ! -f "DATENSCHUTZ.md" ]; then
  echo "❌ DATENSCHUTZ.md nicht gefunden!"
  exit 1
else
  echo -e "${GREEN}✓${NC} DATENSCHUTZ.md gefunden"
fi

# ============================================================
# 3. KONFIGURATION ÜBERPRÜFEN
# ============================================================
echo -e "\n${BLUE}Schritt 3: Konfiguration überprüfen${NC}"
echo "=================================================="

echo "App-Name: $(grep -o 'appName: "[^"]*"' app.config.ts | cut -d'"' -f2)"
echo "Paket-ID: $(grep -o 'androidPackage: "[^"]*"' app.config.ts | cut -d'"' -f2)"
echo "Version: $(grep -o 'version: "[^"]*"' app.config.ts | cut -d'"' -f2)"
echo "Ausrichtung: $(grep -o 'orientation: "[^"]*"' app.config.ts | cut -d'"' -f2)"

# ============================================================
# 4. GIT COMMIT VORBEREITEN
# ============================================================
echo -e "\n${BLUE}Schritt 4: Git Commit vorbereiten${NC}"
echo "=================================================="

echo ""
echo "Aktuelle Git-Status:"
git status --short

echo ""
read -p "Möchten Sie diese Änderungen committen? (j/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Jj]$ ]]; then
  git add PLAY_STORE_BEREITSCHAFT.md DATENSCHUTZ.md PLAY_STORE_EINREICHUNG.sh SPRINT_32_FINALE.sh
  git commit -m "chore(sprint-32): Play Store Bereitschaft – Dokumentation, Datenschutz und Validierung"
  echo -e "${GREEN}✓${NC} Commit erfolgreich"
else
  echo "Commit übersprungen."
fi

# ============================================================
# 5. ZUSAMMENFASSUNG
# ============================================================
echo -e "\n${BLUE}Sprint 32 Zusammenfassung${NC}"
echo "=================================================="
echo -e "${GREEN}✓ TypeScript Validierung bestanden${NC}"
echo -e "${GREEN}✓ Tests erfolgreich${NC}"
echo -e "${GREEN}✓ Build erfolgreich${NC}"
echo -e "${GREEN}✓ Dokumentation komplett${NC}"
echo -e "${GREEN}✓ Datenschutz konfiguriert${NC}"
echo ""
echo "📋 Nächste Schritte:"
echo "1. Play Store Assets erstellen (Screenshots, Grafiken)"
echo "2. App-Beschreibung schreiben (Englisch & Deutsch)"
echo "3. Echtgerät-Test durchführen"
echo "4. Google Play Console Account einrichten"
echo "5. APK signieren und hochladen"
echo ""
echo "🚀 Sprint 32 – PLAY STORE READY!"
