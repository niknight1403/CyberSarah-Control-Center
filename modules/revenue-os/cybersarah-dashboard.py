#!/usr/bin/env python3
"""
CyberSarah Ultimate Dashboard v4.0
───────────────────────────────────
All-in-One Terminal Dashboard für Termux/Desktop.
Zeigt System, Revenue, Content und Aktionen in Echtzeit.

Start: python3 cybersarah-dashboard.py
"""
import json, time, os, sys, random
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError
import select, termios, tty

# ─── Config ───────────────────────────────────────────────────
SERVER = "http://167.233.196.20:3000"
API = f"{SERVER}/api"
REFRESH = 30  # seconds

# ─── Colors ───────────────────────────────────────────────────
C = {
    'p': '\033[0;35m', 'g': '\033[0;32m', 'y': '\033[1;33m',
    'r': '\033[0;31m', 'b': '\033[0;36m', 'c': '\033[1;36m',
    'w': '\033[1;37m', 'n': '\033[0m', 'cls': '\033[2J\033[H',
}

def color(c, text): return f"{C.get(c, '')}{text}{C['n']}"

# ─── API ──────────────────────────────────────────────────────
def api(path, method="GET", data=None):
    url = f"{API}{path}" if not path.startswith("http") else path
    req = Request(url, method=method)
    req.add_header("Content-Type", "application/json")
    if data: req.data = json.dumps(data).encode()
    try:
        with urlopen(req, timeout=15) as r: return json.loads(r.read())
    except: return {}

# ─── State ─────────────────────────────────────────────────────
class State:
    def __init__(self):
        self.iteration = 0
        self.start = time.time()
        self.tab = "main"
        self.status = {}
        self.products = []
        self.logs = []
        self.recovery_count = 0
    
    @property
    def uptime(self):
        s = int(time.time() - self.start)
        h, m = s // 3600, (s % 3600) // 60
        return f"{h}h {m:02d}m"

state = State()

# ─── Render Functions ─────────────────────────────────────────

def render_header():
    lines = [
        f"{color('p', '╔══════════════════════════════════════════════════════════╗')}",
        f"{color('p', '║')}  🚀 CyberSarah Ultimate Dashboard v4.0               {color('p', '║')}",
        f"{color('p', '╚══════════════════════════════════════════════════════════╝')}",
        f"  {color('c', 'Zyklus')} #{state.iteration}  |  {color('c', 'Laufzeit')} {state.uptime}  |  {color('c', datetime.now().strftime(\"%H:%M:%S\"))}",
        ""
    ]
    return "\n".join(lines)

def render_system(s):
    health = s.get("systemGesund", False)
    rate = s.get("erfolgsrate24h", 0) or 0
    sys_h = s.get("systemGesundheit", 0) or 0
    agents = s.get("agentenGesamt", 0) or 0
    status = s.get("agentenNachStatus", {})
    stripe_m = s.get("apiKeyStatus", {}).get("stripe", {}).get("modell", "?")
    
    ok = status.get("aktiv", 0)
    wa = status.get("wartend", 0)
    err = status.get("fehler", 0)
    pa = status.get("pausiert", 0)
    
    r_c = 'g' if rate > 80 else 'y' if rate > 50 else 'r'
    h_c = 'g' if sys_h > 80 else 'y' if sys_h > 50 else 'r'
    
    return f"""
  {color('c', '┌── SYSTEM ──────────────────────────────────────────┐')}
  │  {color('g' if health else 'r', '●')} Status:     {'Gesund' if health else 'FEHLER'}                   │
  │  {color(r_c, '●')} Erfolgsr.:  {rate}%                             │
  │  {color(h_c, '●')} Gesundh.:   {sys_h}/100                          │
  │  {color('p', '●')} Agenten:    {agents} ({color('g', f'{ok} aktiv') if ok else ''}{' ' + color('y', f'{wa} wartend') if wa else ''}{' ' + color('r', f'{err} fehler') if err else ''})  │
  │  {color('b', '●')} Stripe:     {stripe_m}                          │
  {color('c', '└──────────────────────────────────────────────────────┘')}"""

def render_products(products):
    if not products:
        return f"""
  {color('c', '┌── STORE ────────────────────────────────────────────┐')}
  │  {color('y', '📦 Keine Produkte verfügbar')}                       │
  {color('c', '└──────────────────────────────────────────────────────┘')}"""
    
    items = []
    total_val = 0
    for p in products[:4]:
        price = ((p.get("price") or {}).get("unitAmount", 0) or 0) / 100
        total_val += price
        name = (p.get("name") or "?")[:30]
        items.append(f"  │  {color('p', '●')} {name:<30} {color('g', f'€{price:.2f}')}")
    
    rest = max(0, len(products) - 4)
    items.append(f"  │  {' ' * 4}{color('y', f'+{rest} weitere') if rest else ''}")
    
    return f"""
  {color('c', f'┌── STORE ({len(products)} Produkte, €{total_val:.2f}) ──────────────────────┐')}
{chr(10).join(items)}
  {color('c', '└──────────────────────────────────────────────────────┘')}"""

def render_logs(logs):
    if not logs:
        return f"""
  {color('c', '┌── AKTIVITÄTEN ──────────────────────────────────────┐')}
  │  {color('y', 'Keine aktuellen Aktivitäten')}                      │
  {color('c', '└──────────────────────────────────────────────────────┘')}"""
    
    items = []
    for log in logs[:5]:
        msg = (log.get("nachricht") or log.get("aktion") or "?")[:45]
        st = log.get("status", "?")
        ic = '✅' if st in ('erfolgreich', 'ok') else '❌' if st == 'fehler' else '⏳'
        items.append(f"  │  {ic} {msg:<45} │")
    
    return f"""
  {color('c', '┌── AKTIVITÄTEN ──────────────────────────────────────┐')}
{chr(10).join(items)}
  {color('c', '└──────────────────────────────────────────────────────┘')}"""

def render_actions():
    return f"""
  {color('c', '┌── AKTIONEN ─────────────────────────────────────────┐')}
  │  {color('g', '[1]')} Quick-Start   {color('g', '[2]')} Watchdog     {color('g', '[3]')} Store    │
  │  {color('g', '[4]')} Revenue       {color('g', '[5]')} Mobile       {color('g', '[6]')} Refresh  │
  │  {color('g', '[7]')} Content       {color('g', '[8]')} Telegram     {color('r', '[0]')} Exit     │
  {color('c', '└──────────────────────────────────────────────────────┘')}"""

def render_full():
    return f"""
{render_header()}
{render_system(state.status)}
{render_products(state.products)}
{render_logs(state.logs)}
{render_actions()}
{color('y', '  Drücke eine Zahl für Aktionen...')}"""

# ─── Key Handler ──────────────────────────────────────────────

def handle_action(key):
    if key == "1":
        print(f"\n  🚀 Quick-Start...")
        r = api("/quick-start", method="POST")
        time.sleep(1)
    elif key == "2":
        print(f"\n  ⚡ Watchdog...")
        r = api("/admin/watchdog-trigger", method="POST")
        time.sleep(1)
    elif key == "3":
        print(f"\n  🛍️ Store: {color('b', f'{API}/store')}")
        time.sleep(2)
    elif key == "4":
        print(f"\n  💰 Revenue: {color('b', f'{API}/revenue')}")
        time.sleep(2)
    elif key == "5":
        print(f"\n  📱 Mobile: {color('b', f'{SERVER}/mobile.html')}")
        time.sleep(2)
    elif key == "6":
        print(f"\n  🔄 Refreshing...")
        load_data()
    elif key == "7":
        print(f"\n  📰 Content: python3 content-empire.py")
        time.sleep(2)
    elif key == "8":
        print(f"\n  📲 Telegram: python3 telegram-monitor.py")
        time.sleep(2)
    elif key == "0":
        print(f"\n  {color('g', '👋 Tschüss!')}")
        sys.exit(0)

def load_data():
    state.status = api("/system-status")
    state.products = api("/stripe/products").get("products", [])
    state.logs = api("/admin/logs?limit=5").get("logs", [])
    state.iteration += 1
    
    # Auto-recovery if errors detected
    if state.status.get("agentenNachStatus", {}).get("fehler", 0) > 0:
        r = api("/quick-start", method="POST")
        if "error" not in r:
            state.recovery_count += 1

# ─── Main Loop ────────────────────────────────────────────────

def get_key(timeout=0):
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        if select.select([sys.stdin], [], [], timeout)[0]:
            return sys.stdin.read(1)
        return ""
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)

def main():
    print(C['cls'], end="")
    
    # Initial load
    load_data()
    
    # Show initial render
    print(C['cls'], end="")
    print(render_full())
    
    while True:
        deadline = time.time() + REFRESH
        
        while time.time() < deadline:
            remaining = deadline - time.time()
            key = get_key(min(0.1, remaining))
            
            if key == "\x03":  # Ctrl+C
                print(f"\n  {color('g', '👋 Tschüss!')}")
                sys.exit(0)
            elif key in "012345678":
                handle_action(key)
                # Re-render after action
                load_data()
                print(C['cls'], end="")
                print(render_full())
            elif key:
                pass  # Ignore other keys
        
        # Auto-refresh
        load_data()
        print(C['cls'], end="")
        print(render_full())

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n  {color('g', '👋 Tschüss!')}")
    except Exception as e:
        print(f"\n  {color('r', f'❌ Fehler: {e}')}")
        time.sleep(5)
