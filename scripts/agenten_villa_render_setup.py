#!/usr/bin/env python3
"""
Agenten-Villa Render-Setup (Ops-Helper im CyberSarah-Control-Center).

Traegt die Agenten-Villa-Laufzeit-Credentials als Render-Umgebungsvariablen
ein und deployt den Service. Der Render-API-Key kommt aus dem
GitHub-Actions-Secret RENDER_API_KEY; die Werte aus den Secrets
AGENTEN_VILLA_* (siehe .github/workflows/agenten-villa-setup.yml).

Niemals Werte der Secrets loggen — nur Schluesselnamen.

Aufruf (env-gesteuert, siehe Workflow):
  AV_ACTION: status | env-and-deploy | deploy-only
  AV_DRY_RUN: true | false
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

API = "https://api.render.com/v1"
SERVICE_NAME = "agenten-villa"
HEALTH_PATH = "/api/health"
DEPLOY_TIMEOUT_S = 15 * 60
DEPLOY_POLL_S = 15
HEALTH_RETRIES = 12
HEALTH_BACKOFF_S = 10

# (Render-Env-Key, Quell-Env-Var im Workflow)
TARGET_VARS = {
    "OPENROUTER_API_KEY": "AV_OPENROUTER_API_KEY",
    "GITHUB_TOKEN": "AV_GITHUB_TOKEN",
    "GOOGLE_CLIENT_ID": "AV_GOOGLE_CLIENT_ID",
    "JWT_SECRET": "AV_JWT_SECRET",
    "AGENT_ADMIN_EMAIL": "AV_AGENT_ADMIN_EMAIL",
}


def req(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    key = os.environ.get("RENDER_API_KEY", "")
    if not key:
        fail("RENDER_API_KEY fehlt")
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, method=method, data=data, headers={
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(r) as resp:
            payload = resp.read()
            return resp.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            detail = json.loads(payload) if payload else {}
        except Exception:
            detail = {"raw": payload.decode(errors="replace")[:400]}
        return e.code, detail


def fail(msg: str) -> None:
    print(f"FEHLER: {msg}")
    sys.exit(1)


def find_service() -> dict:
    status, data = req("GET", "/services?limit=100")
    if status != 200:
        fail(f"Serviceliste nicht abrufbar ({status}): {data}")
    # GET /v1/services liefert Eintraege der Form {"cursor": ..., "service": {...}}
    raw = data if isinstance(data, list) else []
    services = []
    for entry in raw:
        if isinstance(entry, dict) and isinstance(entry.get("service"), dict):
            services.append(entry["service"])
        elif isinstance(entry, dict):
            services.append(entry)
    print("Services im Render-Account:")
    for s in services:
        sd = s.get("serviceDetails") or {}
        print(f"  - {s.get('name')} ({s.get('type')}, {sd.get('url') or 'ohne URL'})")
    exact = [s for s in services if s.get("name") == SERVICE_NAME]
    if exact:
        return exact[0]
    loose = [s for s in services if "agenten" in (s.get("name") or "").lower()]
    if len(loose) == 1:
        return loose[0]
    fail(f"Service '{SERVICE_NAME}' nicht eindeutig gefunden (Treffer: {len(loose)})")


def get_env_vars(service_id: str) -> list:
    # GET /v1/services/{id}/env-vars liefert {"cursor":..., "envVar": {...}}
    status, data = req("GET", f"/services/{service_id}/env-vars?limit=100")
    if status != 200:
        print(f"  Env-Vars nicht abrufbar ({status}): {data}")
        return []
    out = []
    for entry in data if isinstance(data, list) else []:
        if isinstance(entry, dict) and isinstance(entry.get("envVar"), dict):
            out.append(entry["envVar"])
        elif isinstance(entry, dict) and entry.get("key"):
            out.append(entry)
    return out


def masked_env_report(env_vars: list) -> None:
    print("Aktuelle Env-Vars (Werte maskiert):")
    for v in env_vars:
        key = v.get("key", "?")
        ro = v.get("readonly")
        print(f"  - {key} (readonly={ro})")


def set_env_var(service_id: str, key: str, value: str) -> bool:
    status, data = req("PUT", f"/services/{service_id}/env-vars/{key}", {"value": value})
    if status in (200, 201):
        print(f"  OK: {key} gesetzt")
        return True
    print(f"  FEHLER bei {key} ({status}): {data}")
    return False


def trigger_deploy(service_id: str) -> str | None:
    status, data = req("POST", f"/services/{service_id}/deploys", {})
    if status not in (200, 201):
        print(f"  Deploy-Trigger fehlgeschlagen ({status}): {data}")
        return None
    deploy_id = data.get("id")
    print(f"  Deploy angestossen: {deploy_id}")
    return deploy_id


def wait_for_deploy(service_id: str, deploy_id: str) -> str:
    deadline = time.time() + DEPLOY_TIMEOUT_S
    while time.time() < deadline:
        status, data = req("GET", f"/services/{service_id}/deploys/{deploy_id}")
        state = (data or {}).get("status", "?") if status == 200 else f"HTTP {status}"
        print(f"  Deploy-Status: {state}")
        if state in ("live", "deactivated"):
            return state
        if state in ("build_failed", "update_failed", "canceled", "pre_deploy_failed"):
            return state
        time.sleep(DEPLOY_POLL_S)
    return "timeout"


def health_check(base_url: str) -> bool:
    url = base_url.rstrip("/") + HEALTH_PATH
    for attempt in range(1, HEALTH_RETRIES + 1):
        try:
            r = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(r, timeout=15) as resp:
                body = resp.read().decode(errors="replace")
                print(f"  Health-Check {attempt}: HTTP {resp.status} — {body[:200]}")
                return resp.status == 200
        except Exception as e:
            print(f"  Health-Check {attempt}: {e}")
        time.sleep(HEALTH_BACKOFF_S)
    return False


def main() -> None:
    action = os.environ.get("AV_ACTION", "status")
    dry = os.environ.get("AV_DRY_RUN", "false").lower() == "true"
    print(f"Aktion: {action} (dry_run={dry}, run={uuid.uuid4().hex[:8]})")

    service = find_service()
    sid = service["id"]
    base_url = service.get("serviceDetails", {}).get("url", "")
    print(f"Ziel: {service.get('name')} [{sid}] {base_url}")

    env_vars = get_env_vars(sid)
    masked_env_report(env_vars)

    if action == "status":
        return

    if action in ("env-and-deploy", "deploy-only"):
        if action == "env-and-deploy":
            print("Env-Vars setzen:")
            failures = []
            for render_key, src in TARGET_VARS.items():
                value = os.environ.get(src, "")
                if not value:
                    print(f"  FEHLER: {src} (Quelle fuer {render_key}) ist leer")
                    failures.append(render_key)
                    continue
                if dry:
                    print(f"  [dry-run] wuerde {render_key} setzen ({len(value)} Zeichen)")
                    continue
                if not set_env_var(sid, render_key, value):
                    failures.append(render_key)
            if failures:
                fail(f"Nicht gesetzte Env-Vars: {', '.join(failures)}")
            if dry:
                print("[dry-run] keine Aenderungen, kein Deploy.")
                return

        print("Deploy:")
        if service.get("autoDeploy") is False and action == "deploy-only":
            print("  Hinweis: Auto-Deploy ist deaktiviert.")
        deploy_id = trigger_deploy(sid)
        if not deploy_id:
            fail("Deploy konnte nicht angestossen werden")
        state = wait_for_deploy(sid, deploy_id)
        if state != "live":
            fail(f"Deploy nicht live (Status: {state})")
        print("Health-Check:")
        if not health_check(base_url):
            fail("Health-Check nicht bestanden")
        print("ERFOLG: Agenten-Villa ist mit neuer Konfiguration live.")


if __name__ == "__main__":
    main()
