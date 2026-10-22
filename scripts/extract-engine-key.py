#!/usr/bin/env python3
"""Laeuft auf Hetzner: extrahiert den internen Engine-Key aus dem pm2-Dump.
stdout = Key-Wert, stderr = Diagnose (nur Variablennamen/Laengen)."""
import json, os, subprocess, sys

val = ""
seen = []

def note(name, ln):
    if name not in seen:
        seen.append(name)
        print(f"KANDIDAT {name} len={ln}", file=sys.stderr)

dump = os.path.expanduser("~/.pm2/dump.pm2")
try:
    apps = json.load(open(dump))
    print(f"dump.pm2 Apps: {len(apps)}", file=sys.stderr)
    for a in apps:
        env = a.get("pm2_env", {}).get("env", {}) or {}
        for k, v in env.items():
            if not isinstance(v, str):
                continue
            if ("INTERNAL" in k.upper() or "REVENUE_OS_API" in k.upper()) and len(v) >= 16:
                note(k, len(v))
                if not val:
                    val = v
except Exception as e:
    print(f"dump-Fehler: {e}", file=sys.stderr)

if not val:
    out = subprocess.run(["pm2", "jlist"], capture_output=True, text=True).stdout
    try:
        for a in json.loads(out or "[]"):
            pmid = a.get("pm_id")
            eo = subprocess.run(["pm2", "env", str(pmid)], capture_output=True, text=True).stdout
            for line in eo.splitlines():
                if "=" not in line:
                    continue
                k, _, v = line.partition("=")
                if ("INTERNAL" in k.upper() or "REVENUE_OS_API" in k.upper()) and len(v.strip()) >= 16:
                    note(k.strip(), len(v.strip()))
                    if not val:
                        val = v.strip()
    except Exception as e:
        print(f"pm2-Fallback-Fehler: {e}", file=sys.stderr)

if not val:
    print("KEY NICHT GEFUNDEN", file=sys.stderr)
    sys.exit(3)
print(val)
