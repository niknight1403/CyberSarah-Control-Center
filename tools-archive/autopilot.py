#!/usr/bin/env python3
"""
CyberSarah Auto-Pilot — Autonomer Revenue-Bot für Termux
Läuft auf dem Handy und überwacht/steuert den Server autonom.

Nutung: python3 autopilot.py
"""

import json, time, os, sys
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError

SERVER = "http://167.233.196.20:3000/api"
CHECK_INTERVAL = 60  # Sekunden
VERSION = "1.0.0"

def api(path, method="GET", data=None):
    url = f"{SERVER}{path}"
    req = Request(url, method=method)
    req.add_header("Content-Type", "application/json")
    if data:
        req.data = json.dumps(data).encode()
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except URLError as e:
        return {"error": str(e.reason or "Connection failed")}
    except Exception as e:
        return {"error": str(e)}

def clear_screen():
    os.system("clear" if os.name == "posix" else "cls")

def print_header():
    clear_screen()
    print("\033[1;35m╔══════════════════════════════════════════╗\033[0m")
    print("\033[1;35m║\033[0m  🤖 CyberSarah Auto-Pilot v" + VERSION + "       \033[1;35m║\033[0m")
    print("\033[1;35m║\033[0m  Autonomer Revenue-Bot                \033[1;35m║\033[0m")
    print("\033[1;35m╚══════════════════════════════════════════╝\033[0m")
    print()

def print_status(data, iteration):
    if "error" in data:
        print(f"\033[1;31m❌ Server Offline: {data['error']}\033[0m")
        return

    health = data.get("systemGesund", False)
    rate = data.get("erfolgsrate24h", 0)
    sys_health = data.get("systemGesundheit", 0)
    agents = data.get("agentenGesamt", 0)
    agent_status = data.get("agentenNachStatus", {})
    warnungen = data.get("warnungen", [])
    
    status_icon = "\033[1;32m✅\033[0m" if health else "\033[1;31m❌\033[0m"
    rate_color = "\033[1;32m" if rate > 80 else "\033[1;33m" if rate > 50 else "\033[1;31m"
    health_color = "\033[1;32m" if sys_health > 80 else "\033[1;33m" if sys_health > 50 else "\033[1;31m"
    
    now = datetime.now().strftime("%H:%M:%S")
    print(f"  Zyklus #{iteration}  |  {now}  |  Laufzeit: {get_uptime()}")
    print()
    print(f"  {status_icon}  Server:    {'Gesund' if health else 'Fehler'}")
    print(f"  {rate_color}⬤\033[0m  Erfolgsr.: {rate}% (24h)")
    print(f"  {health_color}⬤\033[0m  Gesundh.:  {sys_health}/100")
    print(f"  \033[1;35m⬤\033[0m  Agenten:   {agents}")
    print()
    
    # Agent breakdown
    wartend = agent_status.get("wartend", 0)
    aktiv = agent_status.get("aktiv", 0)
    fehler = agent_status.get("fehler", 0)
    pausiert = agent_status.get("pausiert", 0)
    
    print(f"  ┌── Agenten-Status ──┐")
    if aktiv > 0: print(f"  │ 🟢 Aktiv:    {aktiv}")
    if wartend > 0: print(f"  │ 🟡 Wartend:  {wartend}")
    if fehler > 0: print(f"  │ 🔴 Fehler:   {fehler}")
    if pausiert > 0: print(f"  │ ⚪ Pausiert: {pausiert}")
    print(f"  └────────────────────┘")
    
    if warnungen:
        print(f"\n  ⚠️  Warnungen: {len(warnungen)}")
        for w in warnungen[:3]:
            print(f"     • {w}")
    
    print()

def get_uptime():
    try:
        with open("/proc/uptime") as f:
            uptime_sec = float(f.read().split()[0])
            hours = int(uptime_sec // 3600)
            mins = int((uptime_sec % 3600) // 60)
            return f"{hours}h {mins}m"
    except:
        return "?"

def auto_recovery(status_data):
    """Auto-Recovery: Versucht fehlerhafte Agenten zu reparieren"""
    fehler = status_data.get("agentenNachStatus", {}).get("fehler", 0)
    if fehler > 0:
        print(f"  ⚠️  {fehler} fehlerhafte Agenten erkannt — starte Recovery...")
        # Try Quick-Start (might not be available on old server)
        result = api("/quick-start", method="POST")
        if "error" not in result:
            print(f"  ✅ Quick-Start ausgeführt")
            return True
        else:
            print(f"  ℹ️  Quick-Start API nicht verfügbar (Server muss updated werden)")
    return False

def revenue_scan():
    """Prüft auf neue Transaktionen und Chancen"""
    result = api("/system-status")
    if "error" in result:
        return None
    
    # Check if we have any transactions from the API
    try:
        stripe_data = result.get("apiKeyStatus", {}).get("stripe", {})
        if stripe_data.get("verfuegbar"):
            return {"stripe": "live" if stripe_data.get("modell") == "LIVE 💰" else "test"}
    except:
        pass
    return None

def main():
    iteration = 0
    
    while True:
        try:
            print_header()
            
            # Get server status
            status = api("/system-status")
            
            # Print dashboard
            print_status(status, iteration)
            
            # Auto-recovery
            if "error" not in status:
                auto_recovery(status)
            
            # Revenue check (every 5 minutes)
            if iteration % 5 == 0:
                rev = revenue_scan()
                if rev:
                    print(f"  💰 Stripe: {rev.get('stripe', 'aktiv')}")
            
            # Server info
            print(f"  📡 Nächster Check in {CHECK_INTERVAL}s  (Ctrl+C zum Beenden)")
            
            iteration += 1
            time.sleep(CHECK_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n  👋 Auto-Pilot beendet")
            sys.exit(0)
        except Exception as e:
            print(f"\n  ❌ Fehler: {e}")
            time.sleep(10)

if __name__ == "__main__":
    print_header()
    print(f"  Verbinde zu {SERVER}...")
    time.sleep(1)
    main()
