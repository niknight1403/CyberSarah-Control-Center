#!/usr/bin/env python3
"""
CyberSarah Auto-Pilot V2 — Autonome Revenue Engine
──────────────────────────────────────────────────
Läuft dauerhaft auf dem Handy/Rechner und generiert Umsatz.
Nutzt die bestehenden Server-APIs — kein Deploy nötig!

Start: python3 autopilot-v2.py
"""
import json, time, os, sys, subprocess
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError

# ─── Konfiguration ─────────────────────────────────────────────
SERVER = "http://167.233.196.20:3000"
API = f"{SERVER}/api"
CHECK_INTERVAL = 45  # Sekunden
VERSION = "2.0.0"

# ─── API Helper ────────────────────────────────────────────────
def api(path, method="GET", data=None):
    url = f"{API}{path}" if not path.startswith("http") else path
    req = Request(url, method=method)
    req.add_header("Content-Type", "application/json")
    if data:
        req.data = json.dumps(data).encode()
    try:
        with urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except URLError as e:
        return {"error": str(e.reason or "Connection failed")}
    except Exception as e:
        return {"error": str(e)}

def clear():
    os.system("clear" if os.name == "posix" else "cls")

# ─── Formatting ────────────────────────────────────────────────
C = {
    'p': '\033[1;35m',  # purple
    'g': '\033[1;32m',  # green
    'y': '\033[1;33m',  # yellow
    'r': '\033[1;31m',  # red
    'b': '\033[1;34m',  # blue
    'c': '\033[1;36m',  # cyan
    'n': '\033[0m',     # reset
}

def color(c, text): return f"{C.get(c, '')}{text}{C['n']}"

# ─── State ─────────────────────────────────────────────────────
class State:
    def __init__(self):
        self.iteration = 0
        self.start_time = time.time()
        self.last_revenue = 0
        self.total_recovery_actions = 0
        self.max_success_rate = 0
        self.products_count = 0
        self.stripe_mode = "unknown"
    
    @property
    def uptime(self):
        s = int(time.time() - self.start_time)
        h, m = s // 3600, (s % 3600) // 60
        return f"{h}h {m}m" if h else f"{m}m"

state = State()

# ─── Dashboard Screens ─────────────────────────────────────────

def render_dashboard(status_data, products_data):
    clear()
    
    # Header
    print(f"{color('p', '╔══════════════════════════════════════════════════════╗')}")
    print(f"{color('p', '║')}  🤖 CyberSarah Auto-Pilot V2                    {color('p', '║')}")
    print(f"{color('p', '║')}  Autonome Revenue Engine — läuft 24/7            {color('p', '║')}")
    print(f"{color('p', '╚══════════════════════════════════════════════════════╝')}")
    print(f"  Zyklus #{state.iteration}  |  Laufzeit: {state.uptime}  |  {datetime.now().strftime('%H:%M:%S')}")
    print()
    
    if "error" in status_data:
        print(f"  {color('r', '❌ SERVER OFFLINE:')} {status_data['error']}")
        print()
        print(f"  {color('y', '⏳ Warte auf Server...')}")
        return
    
    # ─── System Health ─────────────────────────────────────
    health = status_data.get("systemGesund", False)
    rate = status_data.get("erfolgsrate24h", 0) or 0
    sys_h = status_data.get("systemGesundheit", 0) or 0
    agents_total = status_data.get("agentenGesamt", 0) or 0
    agent_status = status_data.get("agentenNachStatus", {})
    
    if rate > state.max_success_rate:
        state.max_success_rate = rate
    
    h_icon = color('g', '✅') if health else color('r', '❌')
    r_color = 'g' if rate > 80 else 'y' if rate > 50 else 'r'
    s_color = 'g' if sys_h > 80 else 'y' if sys_h > 50 else 'r'
    
    print(f"  ╔══ {color('c', 'SYSTEM-STATUS')} ═══════════════════════════╗")
    print(f"  ║  {h_icon}  Status:     {'Gesund' if health else 'Fehler'}")
    print(f"  ║  {color(r_color, '⬤')}  Erfolgsr.:  {rate}% (max: {state.max_success_rate}%)")
    print(f"  ║  {color(s_color, '⬤')}  Gesundh.:   {sys_h}/100")
    print(f"  ║  {color('p', '⬤')}  Agenten:    {agents_total}")
    print(f"  ╚════════════════════════════════════╝")
    
    # Agent breakdown
    w = agent_status.get("wartend", 0)
    a = agent_status.get("aktiv", 0)
    f = agent_status.get("fehler", 0)
    p = agent_status.get("pausiert", 0)
    
    print(f"  ╔══ {color('c', 'AGENTEN')} ═══════════════════════════════╗")
    if a > 0: print(f"  ║  {color('g', '🟢')} Aktiv:   {a}")
    if w > 0: print(f"  ║  {color('y', '🟡')} Wartend: {w}")
    if f > 0: print(f"  ║  {color('r', '🔴')} Fehler:  {f}  {color('y', '⚠️  Auto-Recovery aktiv!')}")
    if p > 0: print(f"  ║  {color('c', '⚪')} Pausiert:{p}")
    print(f"  ╚════════════════════════════════════╝")
    
    # ─── Revenue ───────────────────────────────────────────
    stripe_data = status_data.get("apiKeyStatus", {}).get("stripe", {})
    stripe_mode = "LIVE 💰" if stripe_data.get("modell") == "LIVE 💰" else stripe_data.get("modell", "?")
    state.stripe_mode = stripe_mode
    
    print(f"  ╔══ {color('c', '💰 REVENUE')} ══════════════════════════╗")
    print(f"  ║  Stripe:     {color('g', stripe_mode)}")
    
    # Products from stripe
    products = products_data.get("products", []) if "error" not in products_data else []
    state.products_count = len(products)
    if products:
        total_value = sum((p.get("price", {}) or {}).get("unitAmount", 0) or 0 for p in products) / 100
        print(f"  ║  Produkte:   {color('p', str(len(products)))} (Gesamtwert: €{total_value:.2f})")
        print(f"  ║  Bestes:     {products[0].get('name', '?')[:40]}")
    else:
        print(f"  ║  Produkte:   {color('y', 'Keine (KI-Agenten arbeiten daran)')}")
    print(f"  ╚════════════════════════════════════╝")
    
    # ─── Auto Actions ──────────────────────────────────────
    print(f"  ╔══ {color('c', '🤖 AUTO-AKTIONEN')} ════════════════════╗")
    
    # Auto-recovery
    if f > 0:
        print(f"  ║  {color('y', '⚠️  Fehlerhafte Agenten erkannt!')}")
        print(f"  ║  Starte Quick-Start...")
        result = api("/quick-start", method="POST")
        if "error" not in result:
            state.total_recovery_actions += 1
            print(f"  ║  {color('g', '✅ Quick-Start ausgeführt')}")
        else:
            print(f"  ║  {color('y', 'ℹ️  Quick-Start API nicht verfügbar')}")
    else:
        print(f"  ║  {color('g', '✅ Alle Agenten gesund')}")
    
    print(f"  ║  Erholungen gesamt: {state.total_recovery_actions}")
    print(f"  ╚════════════════════════════════════╝")
    
    # ─── Top Products ──────────────────────────────────────
    if products:
        print(f"  ╔══ {color('c', '🛍️  TOP PRODUKTE')} ═════════════════════╗")
        for i, p in enumerate(products[:3], 1):
            name = p.get("name", "?")[:35]
            price = (p.get("price", {}) or {}).get("unitAmount", 0) / 100
            url = p.get("url", "#")
            print(f"  ║  {i}. {name}")
            print(f"  ║     €{price:.2f}  {color('b', url)}")
        print(f"  ╚════════════════════════════════════╝")
    
    # ─── Next Check ────────────────────────────────────────
    print(f"  {color('c', '📡')} Nächster Check in {CHECK_INTERVAL}s  ({color('y', 'Ctrl+C')} zum Beenden)")
    
    # ─── Actions ───────────────────────────────────────────
    print()
    print(f"  {color('p', 'Aktionen:')}")
    print(f"  {color('g', '1')}) Quick-Start ausführen")
    print(f"  {color('g', '2')}) Store im Browser öffnen")
    print(f"  {color('g', '3')}) Revenue Dashboard")
    print(f"  {color('g', '4')}) Auto-Pilot neustarten")
    print(f"  {color('r', '0')}) Beenden")

def handle_action(key):
    if key == "1":
        print(f"\n  {color('y', '🚀 Starte Quick-Start...')}")
        result = api("/quick-start", method="POST")
        print(f"  {color('g', '✅ Quick-Start ausgeführt')}" if "error" not in result else f"  {color('y', 'ℹ️ Nicht verfügbar')}")
        time.sleep(1)
    elif key == "2":
        print(f"\n  🛍️  Store öffnen: {color('b', f'{API}/store')}")
        time.sleep(1)
    elif key == "3":
        print(f"\n  💰 Revenue: {color('b', f'{API}/revenue')}")
        time.sleep(1)
    elif key == "4":
        print(f"\n  {color('y', '🔄 Neustart...')}")
        time.sleep(1)
        os.execv(sys.executable, [sys.executable] + sys.argv)
    elif key == "0":
        print(f"\n  {color('g', '👋 Tschüss!')}")
        sys.exit(0)

def main_loop():
    """Hauptschleife mit Tastaturabfrage"""
    import select, termios, tty
    
    def get_key(timeout=0):
        """Non-blocking keyboard input"""
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            if select.select([sys.stdin], [], [], timeout)[0]:
                return sys.stdin.read(1)
            return ""
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
    
    while True:
        state.iteration += 1
        
        # Fetch data
        status_data = api("/system-status")
        products_data = api("/stripe/products")
        
        # Render
        render_dashboard(status_data, products_data)
        
        # Wait for input or timeout
        deadline = time.time() + CHECK_INTERVAL
        buffer = ""
        while time.time() < deadline:
            key = get_key(0.1)
            if key == "\x03":  # Ctrl+C
                print(f"\n  {color('g', '👋 Tschüss!')}")
                return
            elif key in "01234":
                handle_action(key)
                buffer = ""
                # Re-render
                status_data = api("/system-status")
                products_data = api("/stripe/products")
                render_dashboard(status_data, products_data)
            elif key:
                buffer = ""

if __name__ == "__main__":
    try:
        main_loop()
    except KeyboardInterrupt:
        print(f"\n  {color('g', '👋 Auto-Pilot V2 beendet')}")
        sys.exit(0)
    except Exception as e:
        print(f"\n  {color('r', f'❌ Fehler: {e}')}")
        time.sleep(3)
        sys.exit(1)
