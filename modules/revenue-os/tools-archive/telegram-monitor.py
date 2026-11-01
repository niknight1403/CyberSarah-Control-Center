#!/usr/bin/env python3
"""
CyberSarah Telegram Monitor — Push-Benachrichtigungen aufs Handy
───────────────────────────────────────────────────────────────
Sendet Server-Status per Telegram. Läuft 24/7.

Setup:
  1. Erstelle Bot bei @BotFather auf Telegram
  2. Setze BOT_TOKEN und CHAT_ID unten
  3. Start: python3 telegram-monitor.py
"""
import json, time, os, sys
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError

# ─── KONFIGURATION ────────────────────────────────────────────
SERVER = "http://167.233.196.20:3000/api"
CHECK_INTERVAL = 300  # Alle 5 Minuten prüfen
NOTIFY_INTERVAL = 3600  # Max 1x pro Stunde benachrichtigen

# Telegram Konfiguration (aus Umgebungsvariablen)
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# ─── State ────────────────────────────────────────────────────
last_notify_time = 0
last_status = ""
last_error_time = 0

def api(path):
    try:
        with urlopen(f"{SERVER}{path}", timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}

def send_telegram(message):
    """Sendet Nachricht via Telegram Bot API"""
    if not BOT_TOKEN or not CHAT_ID:
        return False
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        data = json.dumps({"chat_id": CHAT_ID, "text": message, "parse_mode": "HTML"}).encode()
        req = Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        with urlopen(req, timeout=10):
            return True
    except:
        return False

def format_message(data):
    """Formatiert Server-Status als Telegram-Nachricht"""
    if "error" in data:
        return f"❌ <b>Server Offline</b>\n{data['error']}"
    
    health = "✅ Gesund" if data.get("systemGesund") else "❌ Fehler"
    rate = data.get("erfolgsrate24h", 0)
    sys_h = data.get("systemGesundheit", 0)
    agents = data.get("agentenGesamt", 0)
    status = data.get("agentenNachStatus", {})
    stripe = data.get("apiKeyStatus", {}).get("stripe", {}).get("modell", "?")
    
    a = status.get("aktiv", 0)
    w = status.get("wartend", 0)
    f = status.get("fehler", 0)
    
    msg = f"🤖 <b>CyberSarah System-Update</b>\n\n"
    msg += f"🕐 {datetime.now().strftime('%d.%m.%Y %H:%M')}\n\n"
    msg += f"<b>System:</b> {health}\n"
    msg += f"<b>Gesundheit:</b> {sys_h}%\n"
    msg += f"<b>Erfolgsrate:</b> {rate}%\n"
    msg += f"<b>Agenten:</b> {agents} ({'🟢'+str(a) if a else ''}{' 🟡'+str(w) if w else ''}{' 🔴'+str(f) if f else ''})\n"
    msg += f"<b>Stripe:</b> {stripe}\n"
    
    if f > 0:
        msg += f"\n⚠️ <b>{f} Agent(en) mit Fehlern!</b>"
    
    return msg

def main():
    global last_notify_time, last_status, last_error_time
    
    print("🤖 CyberSarah Telegram Monitor")
    print(f"📡 Server: {SERVER}")
    print(f"⏱ Check-Intervall: {CHECK_INTERVAL}s")
    print(f"📱 Telegram: {'✅ aktiv' if BOT_TOKEN else '❌ nicht konfiguriert'}")
    print()
    
    if BOT_TOKEN:
        # Test-Nachricht senden
        send_telegram(f"🤖 CyberSarah Monitor gestartet!\n📡 Check alle {CHECK_INTERVAL}s")
        print("📱 Test-Nachricht gesendet!")
    
    print("📡 Überwache Server...")
    
    while True:
        try:
            data = api("/system-status")
            current_status = json.dumps(data.get("agentenNachStatus", {}))
            is_error = "error" in data
            now = time.time()
            
            # Bei Fehler sofort benachrichtigen
            if is_error and (now - last_error_time > NOTIFY_INTERVAL):
                msg = format_message(data)
                if send_telegram(msg):
                    print(f"  ❌ Fehler-Benachrichtigung gesendet: {data['error']}")
                last_error_time = now
            
            # Status-Änderung erkennen
            elif current_status != last_status and not is_error:
                fehler = data.get("agentenNachStatus", {}).get("fehler", 0)
                if fehler > 0 and (now - last_notify_time > NOTIFY_INTERVAL):
                    msg = format_message(data)
                    if send_telegram(msg):
                        print(f"  ⚠️ Fehler-Benachrichtigung: {fehler} Agent(en) fehlerhaft")
                    last_notify_time = now
                elif fehler == 0 and (now - last_notify_time > NOTIFY_INTERVAL * 2):
                    # Stündliche Gesundmeldung
                    msg = format_message(data)
                    if send_telegram(msg):
                        print(f"  ✅ Status-Update gesendet")
                    last_notify_time = now
            
            last_status = current_status
            last_error_time = 0 if is_error else last_error_time
            
            # Kurzer Status in Konsole
            if not is_error:
                a = data.get("agentenGesamt", 0)
                f = data.get("agentenNachStatus", {}).get("fehler", 0)
                print(f"  [{datetime.now().strftime('%H:%M')}] {a} Agenten | {f} Fehler | ✅")
            else:
                print(f"  [{datetime.now().strftime('%H:%M')}] ❌ {data['error']}")
            
            time.sleep(CHECK_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n👋 Monitor beendet")
            if BOT_TOKEN:
                send_telegram("🛑 CyberSarah Monitor gestoppt")
            sys.exit(0)
        except Exception as e:
            print(f"❌ Fehler: {e}")
            time.sleep(30)

if __name__ == "__main__":
    main()
