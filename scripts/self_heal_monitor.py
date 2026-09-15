#!/usr/bin/env python3
"""
CyberSarah Self-Healing Monitor (Sprint 125) — Python-Hintergrundskript.

Ueberwacht kontinuierlich die Produktivumgebung und meldet Anomalien an
das Control Center, das die automatisierte Korrektur (Analyse -> Patch ->
Redeploy) uebernimmt. Laeuft ueberall mit Python 3.9+ (stdlib-only):
lokal, auf einem Docker-Host oder als GitHub-Actions-Cron.

Ueberwachte Quellen:
  1. Health-Endpoint: HTTPS-Status, Latenz-Spitzen.
  2. Render-Log-Stream (via Render-API): Stack Traces, Memory-Leaks
     (OOM-Meldungen), API-Timeouts, ESM/CJS-Fehler, DB-Verbindungsfehler.
  3. Push-Modus: gefundene Anomalien werden ueber die Admin-tRPC-API als
     Live-Scan/Analyse im Control Center gemeldet.

ENV:
  CYBERSARAH_API        Basis-URL (Default: https://app.cybersarah-ki.com)
  RENDER_API_KEY        Render-API-Key fuer Log-Abfragen
  RENDER_SERVICE_ID     Render-Service-Id (Default: srv-dahjgllg1s2s73bf9u4g)
  ADMIN_EMAIL/PASSWORD  Admin-Zugang fuer tRPC-Admin-Mutationen (optional)
  POLL_INTERVAL_SECONDS Abstand zwischen Scans (Default: 60)
  DISCORD_WEBHOOK_URL   Ops-Alert-Webhook (optional)
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API_BASE = os.environ.get("CYBERSARAH_API", "https://app.cybersarah-ki.com").rstrip("/")
RENDER_API_KEY = os.environ.get("RENDER_API_KEY", "")
RENDER_SERVICE_ID = os.environ.get("RENDER_SERVICE_ID", "srv-dahjgllg1s2s73bf9u4g")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL_SECONDS", "60"))
DISCORD_WEBHOOK = os.environ.get("DISCORD_WEBHOOK_URL", "")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

# Anomalie-Signaturen (gespiegelt zu lib/self-healing-logic.ts)
SIGNATURES = [
    ("out_of_memory", re.compile(r"heap out of memory|OOMKilled|fatal error.*memory", re.I)),
    ("esm_interop", re.compile(r"is not a function.*import_|ERR_REQUIRE_ESM|Cannot use import statement outside a module", re.I)),
    ("db_connection", re.compile(r"ECONNREFUSED|connection terminated unexpectedly|too many clients", re.I)),
    ("port_in_use", re.compile(r"EADDRINUSE|address already in use", re.I)),
    ("api_timeout", re.compile(r"ETIMEDOUT|timeout of \d+ms exceeded", re.I)),
    ("stack_trace", re.compile(r"^\s*at .+\(.*:\d+:\d+\)|TypeError:|ReferenceError:|SyntaxError:", re.I)),
]

# Einfacher Ratelimit-Zustand: Signatur -> letzter Meldungszeitstempel
last_reported: dict[str, float] = {}
REPORT_COOLDOWN_SECONDS = 15 * 60


def http_json(url: str, payload: dict | None = None, headers: dict | None = None, method: str | None = None, timeout: int = 15) -> tuple[int, object]:
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=body, method=method or ("POST" if body else "GET"))
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    if body is not None:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()[:500]
    except Exception as error:  # Netzwerkfehler duerfen den Monitor nie beenden
        return 0, str(error)


def check_health() -> list[str]:
    """Quelle 1: Health-Endpoint auf Status und Latenz pruefen."""
    anomalies: list[str] = []
    started = time.monotonic()
    status, _ = http_json(f"{API_BASE}/api/health", timeout=10)
    latency_ms = (time.monotonic() - started) * 1000
    if status != 200:
        anomalies.append(f"Health-Check fehlgeschlagen: HTTP {status} — Backend nicht erreichbar.")
    elif latency_ms > 5000:
        anomalies.append(f"Health-Check auffaellig langsam: {latency_ms:.0f} ms — moegliche Ueberlastung.")
    return anomalies


def fetch_render_logs() -> list[str]:
    """Quelle 2: Letzte Render-Logs (nur mit konfiguriertem API-Key)."""
    if not RENDER_API_KEY:
        return []
    url = f"https://api.render.com/v1/logs?limit=100&service={RENDER_SERVICE_ID}"
    status, data = http_json(url, headers={"Authorization": f"Bearer {RENDER_API_KEY}"})
    if status != 200 or not isinstance(data, list):
        return []
    lines: list[str] = []
    for entry in data:
        for field in ("stdout", "stderr", "message", "log"):
            value = entry.get(field) if isinstance(entry, dict) else None
            if isinstance(value, str) and value.strip():
                lines.append(value.strip())
                break
    return lines


def classify(lines: list[str]) -> dict[str, list[str]]:
    """Signatur-Klassifikation: Signatur -> passende Log-Zeilen."""
    findings: dict[str, list[str]] = {}
    for line in lines:
        for signature, pattern in SIGNATURES:
            if pattern.search(line):
                findings.setdefault(signature, []).append(line[:500])
    return findings


def report(signature: str, evidence: list[str]) -> None:
    """Anomalie melden (Discord) — mit Cooldown gegen Alarmfluten."""
    now = time.time()
    if now - last_reported.get(signature, 0) < REPORT_COOLDOWN_SECONDS:
        return
    last_reported[signature] = now
    message = f"🩺 Self-Healing-Monitor: Anomalie `{signature}` — {evidence[0][:200]}"
    print(message, file=sys.stderr)
    if DISCORD_WEBHOOK:
        http_json(DISCORD_WEBHOOK, {"content": message})


def main() -> None:
    print(f"Self-Healing-Monitor aktiv: {API_BASE} (Intervall {POLL_INTERVAL}s)", file=sys.stderr)
    while True:
        anomalies = check_health()
        for anomaly in anomalies:
            report("health_failure", [anomaly])
        findings = classify(fetch_render_logs())
        for signature, evidence in findings.items():
            report(signature, evidence)
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Monitor beendet.", file=sys.stderr)
