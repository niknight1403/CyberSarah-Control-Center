#!/usr/bin/env bash
# Bricht ab, wenn getrackte Dateien echte Secret-Werte oder .env-Dateien enthalten.
set -uo pipefail
fail=0

# 1) Keine .env-Dateien im Index (ausser Vorlagen)
tracked=$(git ls-files | grep -E '(^|/)\.env' | grep -vE '\.env\.example$' || true)
if [ -n "$tracked" ]; then
  echo "FEHLER: .env-Dateien im Git-Index:"; echo "$tracked"; fail=1
fi

# 2) Bekannte Token-Muster in getrackten Textdateien
pattern='(sk_live_[A-Za-z0-9]{16,}|sk_test_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_-]{35}|gsk_[A-Za-z0-9]{30,}|sk-or-v1-[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(ql)?://[^:@/ ]+:[^@/ ]{6,}@)'
hits=$(git grep -nIE "$pattern" -- . ':!*.lock' ':!package-lock.json' ':!pnpm-lock.yaml' ':!tests' ':!docs' ':!.env.example' ':!modules/revenue-os/.env.example' ':!lib/admin-log-viewer-logic.ts' ':!lib/config-view-logic.ts' ':!modules/revenue-os/artifacts/api-server/src/lib/pushNotifications.ts' ':!modules/revenue-os/artifacts/dashboard/src/pages/pushNotifications.tsx' ':!modules/revenue-os/firebase-setup.sh' ':!modules/revenue-os/hetzner_bootstrap.sh' ':!scripts/install-play-store-credentials.sh' ':!.github/workflows/revenue-db-bridge.yml' ':!scripts/check-no-secrets.sh' 2>/dev/null | cut -c1-160 || true)
if [ -n "$hits" ]; then
  echo "FEHLER: moegliche Secrets in getrackten Dateien (Werte gekuerzt):"
  echo "$hits" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#' | cut -c1-120
  fail=1
fi

# 3) .env.example darf keine Werte enthalten
if grep -nE '^[A-Z0-9_]+=.+' .env.example >/dev/null 2>&1; then
  echo "FEHLER: .env.example enthaelt Werte:"; grep -nE '^[A-Z0-9_]+=.+' .env.example | cut -d= -f1; fail=1
fi

[ "$fail" = "0" ] && echo "OK: keine Secrets im Repo gefunden."
exit $fail
