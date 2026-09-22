#!/bin/bash
# CyberSarah Termux Setup — einmalig ausführen!
# Installiert alles was für den Auto-Pilot nötig ist

echo "╔══════════════════════════════════════╗"
echo "║  📱 CyberSarah Termux Setup         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Python3 prüfen
if ! command -v python3 &> /dev/null; then
    echo "📦 Installiere Python..."
    pkg install python -y
fi

# curl prüfen
if ! command -v curl &> /dev/null; then
    echo "📦 Installiere curl..."
    pkg install curl -y
fi

# SSH prüfen
if ! command -v ssh &> /dev/null; then
    echo "📦 Installiere openssh..."
    pkg install openssh -y
fi

# Autopilot herunterladen
echo "📥 Lade Auto-Pilot herunter..."
curl -sL \
  https://raw.githubusercontent.com/niknight1403/cybersarah-revenue-os/main/autopilot.py \
  -o ~/cybersarah-autopilot.py 2>/dev/null || {
    # Fallback: direkt im Repo
    cp autopilot.py ~/cybersarah-autopilot.py 2>/dev/null || true
}

echo ""
echo "✅ Setup abgeschlossen!"
echo ""
echo "🚀 Auto-Pilot starten:"
echo "  python3 ~/cybersarah-autopilot.py"
echo ""
echo "📊 Status prüfen:"
echo "  curl -s http://167.233.196.20:3000/api/quick-status"
echo ""
echo "🚀 Server-Deploy:"
echo "  ssh root@167.233.196.20 \"cd /opt/cybersarah && bash deploy-simple.sh\""
