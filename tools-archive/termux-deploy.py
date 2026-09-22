#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════╗
║  🚀 CyberSarah Termux Deploy Bot v1.0                       ║
║  Ein Befehl — Server updated, App deployed, Revenue ready   ║
╚═══════════════════════════════════════════════════════════════╝

Verwendung:
  python3 termux-deploy.py

Oder mit installiertem sshpass:
  python3 termux-deploy.py --password DEIN_SERVER_PASS

Oder mit max Automatisierung:
  python3 termux-deploy.py --auto
"""

import os
import sys
import json
import time
import subprocess
import tempfile
import shutil
from pathlib import Path

# ─── Konfiguration ─────────────────────────────────────────────────────────────

SERVER_IP = "167.233.196.20"
SERVER_PORT = 22
SERVER_USER = "root"
SERVER_PATH = "/opt/cybersarah"
GIT_REPO = "https://github.com/niknight1403/cybersarah-revenue-os.git"
APK_FILE = "CyberSarah-Master-v5.0-release.apk"

# ─── Farben (Termux-kompatibel) ────────────────────────────────────────────────

class C:
    RESET = "\033[0m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"


def print_banner():
    """Start-Banner anzeigen"""
    print(f"\n{C.CYAN}{C.BOLD}")
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  🚀 CyberSarah Termux Deploy Bot v1.0                       ║")
    print("║  Ein Befehl — Server updated, Revenue ready!                ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print(f"{C.RESET}\n")


def check_prerequisites():
    """Prüft ob sshpass installiert ist und bietet Hilfe an"""
    has_sshpass = shutil.which("sshpass") is not None
    if not has_sshpass:
        print(f"{C.YELLOW}⚠️  sshpass nicht gefunden. Installiere für Passwort-automatisierung...{C.RESET}")
        try:
            subprocess.run(["pkg", "install", "sshpass", "-y"], check=True, capture_output=True)
            has_sshpass = True
            print(f"{C.GREEN}✅ sshpass installiert{C.RESET}")
        except:
            print(f"{C.RED}❌ sshpass Installation fehlgeschlagen. Fallback zu manueller SSH-Eingabe.{C.RESET}")
    return has_sshpass


def ssh_run(host, cmd, password=None, timeout=120):
    """Führt einen Befehl per SSH aus, mit oder ohne sshpass"""
    ssh_cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=30",
        f"{SERVER_USER}@{host}",
        cmd,
    ]
    
    if password:
        pre = ["sshpass", "-p", password]
        ssh_cmd = pre + ssh_cmd
    
    try:
        result = subprocess.run(
            ssh_cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", "Timeout"
    except Exception as e:
        return False, "", str(e)


def deploy_server(password=None):
    """Vollständiges Deployment auf dem Hetzner Server"""
    print(f"\n{C.BOLD}{C.BLUE}📦 Schritt 1/6: Pull neueste Code-Änderungen...{C.RESET}")
    ok, out, err = ssh_run(SERVER_IP, f"cd {SERVER_PATH} && git fetch origin && git reset --hard origin/main", password)
    if ok:
        print(f"{C.GREEN}✅ Code geupdated{C.RESET}")
    else:
        print(f"{C.RED}❌ Git Pull fehlgeschlagen: {err[:200]}{C.RESET}")
        return False

    print(f"{C.BOLD}{C.BLUE}📦 Schritt 2/6: Installiere Dependencies...{C.RESET}")
    ok, out, err = ssh_run(SERVER_IP, f"cd {SERVER_PATH} && pnpm install 2>&1 | tail -5", password, timeout=180)
    if ok:
        print(f"{C.GREEN}✅ Dependencies installiert{C.RESET}")
    else:
        print(f"{C.RED}❌ pnpm install fehlgeschlagen: {err[:200]}{C.RESET}")
        return False

    print(f"{C.BOLD}{C.BLUE}⚙️  Schritt 3/6: Kopiere Konfiguration...{C.RESET}")
    ok, out, err = ssh_run(SERVER_IP, f"cd {SERVER_PATH} && cp .env artifacts/api-server/.env 2>/dev/null; echo 'ok'", password)
    if ok:
        print(f"{C.GREEN}✅ .env kopiert{C.RESET}")

    print(f"{C.BOLD}{C.BLUE}🏗️  Schritt 4/6: Baue Dashboard...{C.RESET}")
    ok, out, err = ssh_run(SERVER_IP, f"cd {SERVER_PATH}/artifacts/dashboard && pnpm run build 2>&1 | tail -5", password, timeout=300)
    if ok:
        print(f"{C.GREEN}✅ Dashboard gebaut{C.RESET}")
    else:
        print(f"{C.YELLOW}⚠️  Dashboard-Build Output: {out[:100]}{C.RESET}")

    print(f"{C.BOLD}{C.BLUE}🔄 Schritt 5/6: Synchronisiere Capacitor...{C.RESET}")
    ok, out, err = ssh_run(SERVER_IP, f"cd {SERVER_PATH} && npx cap sync android 2>&1 | tail -3", password, timeout=120)
    if ok:
        print(f"{C.GREEN}✅ Capacitor sync{C.RESET}")
    else:
        print(f"{C.YELLOW}⚠️  Capacitor: {out[:100]}{C.RESET}")

    print(f"{C.BOLD}{C.BLUE}🚀 Schritt 6/6: Starte Server neu...{C.RESET}")
    ok, out, err = ssh_run(SERVER_IP, f"cd {SERVER_PATH}/artifacts/api-server && pm2 delete cybersarah 2>/dev/null; pm2 start npx tsx src/index.ts --name cybersarah --time && pm2 save && sleep 3 && pm2 status cybersarah", password)
    if ok:
        print(f"{C.GREEN}✅ Server neugestartet!{C.RESET}")
        for line in out.split("\n"):
            if "online" in line.lower() or "cybersarah" in line.lower():
                print(f"  {line}")
    else:
        print(f"{C.YELLOW}⚠️  Server-Start: {out[:200]}{C.RESET}")

    return True


def verify_server():
    """Prüft ob der Server läuft und API antwortet"""
    print(f"\n{C.BOLD}{C.BLUE}🔍 Verifiziere Server...{C.RESET}")
    time.sleep(3)
    
    try:
        import urllib.request
        req = urllib.request.Request("http://167.233.196.20:3000/api/health", method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read().decode()
            print(f"{C.GREEN}✅ Server Health: OK ({resp.status}){C.RESET}")
            try:
                parsed = json.loads(data)
                print(f"   {json.dumps(parsed, indent=2)[:300]}")
            except:
                print(f"   {data[:200]}")
    except Exception as e:
        print(f"{C.YELLOW}⚠️  Health-Check: {e}{C.RESET}")

    # System Status prüfen
    try:
        req = urllib.request.Request("http://167.233.196.20:3000/api/quick-status", method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            print(f"{C.GREEN}✅ Quick-Status: OK{C.RESET}")
            one_line = data.get("oneLine", "")
            if one_line:
                print(f"   {one_line}")
    except Exception as e:
        print(f"{C.YELLOW}⚠️  Quick-Status: {e}{C.RESET}")

    # Store prüfen
    try:
        req = urllib.request.Request("http://167.233.196.20:3000/api/store", method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"{C.GREEN}✅ Store-Seite: OK ({resp.status}){C.RESET}")
    except Exception as e:
        print(f"{C.YELLOW}⚠️  Store: {e}{C.RESET}")


def quick_start_agents(password=None):
    """Startet alle Agenten über die Quick-Start API"""
    print(f"\n{C.BOLD}{C.BLUE}🚀 Quick-Start: Starte alle Agenten...{C.RESET}")
    try:
        import urllib.request
        req = urllib.request.Request(
            "http://167.233.196.20:3000/api/quick-start",
            method="POST",
            data=b"{}",
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            details = data.get("details", [])
            for d in details[:10]:
                print(f"   {d[:120]}")
            print(f"{C.GREEN}✅ Quick-Start ausgeführt{C.RESET}")
    except Exception as e:
        print(f"{C.YELLOW}⚠️  Quick-Start: {e}{C.RESET}")
        # Fallback: SSH-Direct
        if password:
            ok, out, err = ssh_run(SERVER_IP, f"curl -s -X POST http://localhost:3000/api/quick-start", password)
            if ok:
                print(f"{C.GREEN}✅ Quick-Start via SSH{C.RESET}")


def upload_apk(password=None):
    """Lädt die APK auf den Server hoch"""
    print(f"\n{C.BOLD}{C.BLUE}📱 Upload APK...{C.RESET}")
    apk_path = Path(__file__).parent / APK_FILE
    if not apk_path.exists():
        print(f"{C.YELLOW}⚠️  APK nicht gefunden: {apk_path}{C.RESET}")
        return

    # APK in ein temp-Verzeichnis auf dem Server kopieren
    try:
        if password:
            cmd = [
                "sshpass", "-p", password,
                "scp",
                "-o", "StrictHostKeyChecking=no",
                str(apk_path),
                f"{SERVER_USER}@{SERVER_IP}:{SERVER_PATH}/apk/"
            ]
            subprocess.run(cmd, check=True, timeout=60)
            print(f"{C.GREEN}✅ APK auf Server hochgeladen{C.RESET}")
            print(f"   Download: http://{SERVER_IP}:3000/apk/{APK_FILE}")
        else:
            print(f"{C.YELLOW}⚠️  Kein Passwort — APK nicht hochgeladen{C.RESET}")
    except Exception as e:
        print(f"{C.YELLOW}⚠️  APK-Upload: {e}{C.RESET}")


def print_summary():
    """Zeigt Zusammenfassung und wichtige URLs"""
    print(f"\n{C.CYAN}{C.BOLD}")
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  ✅ DEPLOY ABGESCHLOSSEN!                                    ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print(f"{C.RESET}")
    print(f"{C.GREEN}🌐 Wichtige URLs:{C.RESET}")
    print(f"   🏠 {C.BOLD}Dashboard:{C.RESET}     http://{SERVER_IP}:3000")
    print(f"   🛍️ {C.BOLD}Store:{C.RESET}         http://{SERVER_IP}:3000/api/store")
    print(f"   💰 {C.BOLD}Revenue:{C.RESET}       http://{SERVER_IP}:3000/api/revenue")
    print(f"   📊 {C.BOLD}Monitoring:{C.RESET}    http://{SERVER_IP}:3000/api/system-dashboard")
    print(f"   🚀 {C.BOLD}Quick-Start:{C.RESET}   http://{SERVER_IP}:3000/api/quick-start")
    print(f"   📱 {C.BOLD}APK:{C.RESET}           http://{SERVER_IP}:3000/apk/{APK_FILE}")
    print()
    print(f"{C.YELLOW}📋 Nützliche Befehle:{C.RESET}")
    print(f"   Logs ansehen:   ssh root@{SERVER_IP} \"pm2 logs cybersarah --lines 30\"")
    print(f"   Status:         curl -s http://{SERVER_IP}:3000/api/quick-status | python3 -m json.tool")
    print(f"   Revenue-Check:  curl -s http://{SERVER_IP}:3000/api/revenue/dashboard | python3 -m json.tool")
    print(f"   Agenten:        curl -s http://{SERVER_IP}:3000/api/agents | python3 -m json.tool")
    print()


def main():
    print_banner()
    
    # Argumente parsen
    password = None
    auto_mode = False
    
    if "--password" in sys.argv:
        idx = sys.argv.index("--password")
        if idx + 1 < len(sys.argv):
            password = sys.argv[idx + 1]
    
    if "--auto" in sys.argv:
        auto_mode = True
    
    has_sshpass = check_prerequisites()
    
    # Wenn sshpass verfügbar, nach Passwort fragen
    if has_sshpass and not password:
        if auto_mode:
            # Versuche mit leerem Passwort (für Key-basierte Auth)
            password = ""
        else:
            import getpass
            password = getpass.getpass(f"{C.YELLOW}🔑 SSH-Passwort für root@{SERVER_IP}: {C.RESET}")
    
    # Deployment durchführen
    print(f"\n{C.BOLD}{C.MAGENTA}▶ Starte Deployment auf {SERVER_IP}...{C.RESET}\n")
    
    success = deploy_server(password)
    
    if success:
        verify_server()
        quick_start_agents(password)
        upload_apk(password)
        print_summary()
    else:
        print(f"\n{C.RED}{C.BOLD}❌ Deployment fehlgeschlagen!{C.RESET}")
        print(f"{C.YELLOW}Bitte manuell SSH:\n  ssh root@{SERVER_IP}\n  cd /opt/cybersarah && bash deploy-simple.sh{C.RESET}")
        sys.exit(1)


if __name__ == "__main__":
    main()
