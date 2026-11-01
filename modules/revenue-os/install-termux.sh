#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah Revenue OS — Termux Install
# Ausführung: bash install-termux.sh
# ═══════════════════════════════════════════════════════════════════
set -e

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'
ok() { echo -e "${G}✅ $1${NC}"; }
warn() { echo -e "${Y}⚠️  $1${NC}"; }
err() { echo -e "${R}❌ $1${NC}"; }

echo -e "${G}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${G}║  CyberSarah Revenue OS — Termux Quick Install       ║${NC}"
echo -e "${G}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Node.js installieren
warn "Installiere Node.js..."
pkg install -y nodejs 2>/dev/null || pkg install -y nodejs-lts 2>/dev/null || {
    err "Node.js konnte nicht installiert werden"
    err "Versuche: pkg install nodejs"
    exit 1
}
ok "Node.js: $(node --version)"

# 2. pnpm installieren
warn "Installiere pnpm..."
npm install -g pnpm 2>/dev/null || true
ok "pnpm: $(pnpm --version 2>/dev/null || echo 'nicht verfügbar')"

# 3. Git (falls nicht vorhanden)
pkg install -y git 2>/dev/null || true

# 4. In Projekt-Verzeichnis wechseln
cd ~/cybersarah-revenue-os 2>/dev/null || {
    warn "Klone Repository..."
    git clone https://github.com/niknight1403/cybersarah-revenue-os.git ~/cybersarah-revenue-os
    cd ~/cybersarah-revenue-os
}
ok "Projekt: $(pwd)"

# 5. .env erstellen
if [ ! -f .env ]; then
    cp .env.example .env
    ok ".env erstellt"
fi

# 6. Dependencies installieren (mit --ignore-scripts um esbuild-Problem zu umgehen)
warn "Installiere Dependencies (kann 1-2 Minuten dauern)..."
pnpm install --ignore-scripts 2>&1 | tail -5

# 7. esbuild manuell bauen
warn "Baue esbuild..."
cd node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild 2>/dev/null && {
    node install.js
    ok "esbuild gebaut"
} || {
    warn "esbuild Pfad nicht gefunden - versuche npm"
    cd ~/cybersarah-revenue-os
    npm install esbuild@0.27.3 --save-dev 2>/dev/null || true
}

# 8. tsx installieren
warn "Installiere tsx..."
cd ~/cybersarah-revenue-os
pnpm add -D tsx 2>/dev/null || npm install tsx --save-dev 2>/dev/null || true
ok "tsx installiert"

# 9. Server starten
echo ""
echo -e "${G}═══════════════════════════════════════════════════════${NC}"
echo -e "${G}  ✅ INSTALLATION ABGESCHLOSSEN!${NC}"
echo -e "${G}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "  📝 .env bearbeiten:"
echo "  → nano ~/cybersarah-revenue-os/.env"
echo ""
echo "  🚀 Server starten:"
echo "  → cd ~/cybersarah-revenue-os"
echo "  → pnpm run dev"
echo ""
echo "  🌐 Dashboard öffnen:"
echo "  → http://localhost:3000"
echo ""
