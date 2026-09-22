#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah AUTO-DEPLOY AGENT v1.0                                  ║
║  Automatisches Deployment von GitHub → Hetzner Server              ║
║                                                                     ║
║  - Prüft alle 15 Minuten auf neue Commits                          ║
║  - Deployed automatisch via SSH                                    ║
║  - Funktioniert in Termux                                          ║
║  - Einmal eingerichtet → für immer autonom                         ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 auto-deploy-agent.py
"""
import os, sys, json, time, subprocess
from datetime import datetime
from urllib.request import Request, urlopen
from pathlib import Path

C = {'p': '\033[95m', 'g': '\033[92m', 'y': '\033[93m', 'r': '\033[91m', 'b': '\033[96m', 'n': '\033[0m', 'bold': '\033[1m'}
def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)

GITHUB_REPO = "niknight1403/cybersarah-revenue-os"
GITHUB_BRANCH = "main"
SERVER_IP = "167.233.196.20"
SERVER_USER = "root"
CHECK_INTERVAL = 15 * 60  # 15 minutes
CONFIG_FILE = Path.home() / ".cybersarah-deploy.json"

def load_config():
    if CONFIG_FILE.exists():
        try: return json.loads(CONFIG_FILE.read_text())
        except: pass
    return {'password': '', 'last_commit': '', 'auto_mode': False}

def save_config(config):
    CONFIG_FILE.write_text(json.dumps(config, indent=2))
    os.chmod(CONFIG_FILE, 0o600)

def check_github():
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/commits/{GITHUB_BRANCH}"
        req = Request(url, headers={'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CyberSarah-Deploy'})
        with urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            return data.get('sha', '')
    except Exception as e:
        print(f" {clr('r', '❌')} GitHub nicht erreichbar: {str(e)[:50]}")
        return None

def deploy(config):
    password = config.get('password', '')
    if not password:
        print(f" {clr('r', '❌ Kein SSH-Passwort konfiguriert!')}")
        return False
    
    print(f" {clr('y', '🔄 Deploye...')}")
    
    commands = """
set -e
echo '📥 Pull Code...'
cd /opt/cybersarah 2>/dev/null || mkdir -p /opt/cybersarah
if [ -d /opt/cybersarah/.git ]; then
  git fetch origin 2>&1 | tail -1
  git reset --hard origin/main 2>&1 | tail -1
else
  git clone https://github.com/niknight1403/cybersarah-revenue-os.git /opt/cybersarah 2>&1 | tail -1
  cd /opt/cybersarah
fi
echo '📦 Installiere Dependencies...'
cd /opt/cybersarah
pnpm install 2>&1 | tail -3 || npm install 2>&1 | tail -3
echo '⚙️  Kopiere .env...'
cp .env artifacts/api-server/.env 2>/dev/null || true
echo '🚀 Starte Server neu...'
pm2 delete cybersarah 2>/dev/null || true
cd artifacts/api-server
npx tsx src/index.ts &
sleep 3
echo '✅ Fertig!'
"""
    
    try:
        result = subprocess.run(
            ['sshpass', '-p', password, 'ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10',
             f'{SERVER_USER}@{SERVER_IP}', commands],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            print(f" {clr('g', '✅ Deploy erfolgreich!')}")
            return True
        else:
            print(f" {clr('r', f'❌ Deploy fehlgeschlagen: {result.stderr[:200]}')}")
            return False
    except subprocess.TimeoutExpired:
        print(f" {clr('r', '❌ Timeout (120s)')}")
        return False
    except FileNotFoundError:
        print(f" {clr('r', '❌ sshpass nicht installiert!')}")
        print(f"   Installiere: pkg install sshpass")
        return False

def auto_mode(config):
    print(f"\n{clr('bold', '🚀 AUTO-MODE AKTIV')}")
    print(f" Prüft alle {CHECK_INTERVAL//60} Minuten auf neue Commits\n")
    
    while True:
        try:
            latest = check_github()
            if latest and latest != config.get('last_commit'):
                print(f" {clr('g', '🔄')} Neuer Commit: {latest[:8]}")
                print(f" {clr('y', '   Starte Deployment...')}")
                deploy(config)
                config['last_commit'] = latest
                save_config(config)
            else:
                print(f" {clr('b', '  ✓')} {datetime.now().strftime('%H:%M')} — Keine Updates ({latest[:8] if latest else '?'})")
            
            time.sleep(CHECK_INTERVAL)
        except KeyboardInterrupt:
            print(f"\n {clr('y', '👋 Auto-Mode beendet')}")
            break
        except Exception as e:
            print(f" {clr('r', f'❌ Fehler: {e}')}")
            time.sleep(60)

def main():
    config = load_config()
    
    while True:
        os.system('clear' if os.name == 'posix' else 'cls')
        print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════╗'))}")
        print(f"{bold(clr('p', '║  🚀 CyberSarah AUTO-DEPLOY AGENT v1.0            ║'))}")
        print(f"{bold(clr('p', '╚══════════════════════════════════════════════════╝'))}")
        print(f" {clr('b', 'GitHub:')} {GITHUB_REPO}")
        print(f" {clr('b', 'Server:')} {SERVER_USER}@{SERVER_IP}")
        print(f" {clr('b', 'Passwort:')} {'✅ konfiguriert' if config.get('password') else '❌ fehlt'}")
        print(f" {clr('b', 'Letzter Commit:')} {config.get('last_commit', '—')[:12]}")
        print(f" {clr('b', 'Auto-Mode:')} {'✅ AKTIV' if config.get('auto_mode') else '❌ inaktiv'}\n")
        
        # Check GitHub
        latest = check_github()
        if latest:
            print(f" {clr('g', '✓')} GitHub: {latest[:8]}")
            if latest == config.get('last_commit'):
                print(f" {clr('g', '✓')} Server ist aktuell")
            else:
                print(f" {clr('y', '⚠️')} Neuer Commit verfügbar!")
        else:
            print(f" {clr('r', '✗')} GitHub nicht erreichbar")
        
        print(f"\n{clr('p', '─' * 50)}")
        print(f"\n{clr('bold', '🎯 Aktionen:')}")
        print(f"  {clr('g', '1)')} SSH-Passwort eingeben/ändern")
        print(f"  {clr('g', '2)')} Jetzt deployen")
        print(f"  {clr('g', '3)')} Auto-Mode starten (alle 15 Min)")
        print(f"  {clr('g', '4)')} Status prüfen")
        print(f"  {clr('r', '0)')} Beenden")
        
        try:
            choice = input(f"\n {bold(clr('p', '➜'))} Auswahl: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        
        if choice == '0': break
        elif choice == '1':
            import getpass
            pw = getpass.getpass(" SSH-Passwort: ")
            if pw:
                config['password'] = pw
                save_config(config)
                print(f" {clr('g', '✅ Passwort gespeichert')}")
        elif choice == '2':
            if config.get('password'):
                deploy(config)
                config['last_commit'] = latest or config.get('last_commit', '')
                save_config(config)
            else:
                print(f" {clr('r', '❌ Bitte zuerst Passwort eingeben (Option 1)')}")
        elif choice == '3':
            config['auto_mode'] = True
            save_config(config)
            auto_mode(config)
        elif choice == '4':
            print(f"\n Server: {'✅ erreichbar' if check_github() else '❌ nicht erreichbar'}")
            print(f" Auto-Mode: {'✅ AKTIV' if config.get('auto_mode') else '❌ inaktiv'}")
        
        if choice != '3':
            input(f"\n ⏎ Enter...")

if __name__ == "__main__":
    main()
