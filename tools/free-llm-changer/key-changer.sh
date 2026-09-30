#!/usr/bin/env bash
# OpenHands/Agent Canvas — Free-Tier Key-Changer
# Prueft alle konfigurierten kostenlosen Anbieter, schaltet den ersten
# verfuegbaren als aktive Anbindung und rotiert bei einem Limit (429/Quota)
# automatisch auf den naechsten weiter. Ollama ist der Never-Fail-Fallback.

set -euo pipefail
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$KIT_DIR/provider-registry.json"
OUT_ENV="$KIT_DIR/aktive-anbindung.env"
STATUS_FILE="$KIT_DIR/changer-status.json"
ONLY_PROBE="${CHANGER_ONLY_PROBE:-false}"

probe_chat() { # $1=base_url $2=key $3=model -> "ok" | HTTP-Status
  local status
  status=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' \
    "${1%/}/chat/completions" \
    -H "Authorization: Bearer ${2}" -H "Content-Type: application/json" \
    -d "{\"model\":\"${3}\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}" 2>/dev/null || true)
  [[ "$status" == "200" ]] && echo "ok" || echo "${status:-000}"
}

probe_ollama() {
  local status
  status=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "${1%/}/models" 2>/dev/null || true)
  [[ "$status" == "200" ]] && echo "ok" || echo "${status:-000}"
}

echo "== Free-Tier Key-Changer: pruefe alle Anbieter =="
results=()
winner_id="" ; winner_name="" ; winner_base="" ; winner_model="" ; winner_key=""

while IFS=$'\t' read -r id name base_url env_key first_model; do
  [[ -z "$id" ]] && continue
  verdict="FEHLT"
  key=""
  [[ "$env_key" != "-" ]] && key="${!env_key:-}"
  if [[ "$id" == "ollama" ]]; then
    verdict="$(probe_ollama "$base_url")"
  elif [[ -n "$key" ]]; then
    verdict="$(probe_chat "$base_url" "$key" "$first_model")"
  fi
  case "$verdict" in
    ok) verdict="VERFUEGBAR"
        if [[ -z "$winner_id" ]]; then
          winner_id="$id"; winner_name="$name"; winner_base="$base_url"
          winner_model="$first_model"; winner_key="$key"
        fi ;;
    429|402) verdict="LIMIT ERREICHT ($verdict) — Changer rotiert weiter" ;;
    *) verdict="NICHT KONFIGURIERT/ERREICHBAR ($verdict)" ;;
  esac
  printf '  [%-10s] %-38s -> %s\n' "$id" "$name" "$verdict"
  results+=("$id|$verdict")
done < <(python3 -c "
import json
for a in json.load(open('$REGISTRY'))['anbieter']:
    print('\t'.join([a['id'], a['name'], a['base_url'], a['env_key'] or '-',
                      (a['kostenlose_modelle'] or [''])[0]]))
")

# Never-Fail-Fallback: Ollama lokal, immer gratis, unbegrenzt, ohne Key.
if [[ -z "$winner_id" ]] && [[ "$(probe_ollama http://127.0.0.1:11434/v1)" == "ok" ]]; then
  winner_id="ollama"; winner_name="Ollama lokal (unbegrenzt, gratis)"
  winner_base="http://127.0.0.1:11434/v1"; winner_model="qwen3-coder"; winner_key=""
fi

python3 - "$STATUS_FILE" "$winner_id" "$winner_name" "$winner_base" "$winner_model" "${results[@]}" <<'PY'
import datetime, json, sys
path, winner_id, wname, wbase, wmodel, *res = sys.argv[1:]
json.dump({"stand": datetime.datetime.now().isoformat(timespec="seconds"),
           "aktiv": winner_id or None, "aktiv_name": wname or None,
           "endpunkt": wbase or None, "modell": wmodel or None,
           "anbieter": [dict(zip(("id", "status"), r.split("|", 1)))
                        for r in res if "|" in r]},
          open(path, "w"), indent=2, ensure_ascii=False)
PY

if [[ "$ONLY_PROBE" == "true" ]]; then
  echo ""
  [[ -z "$winner_id" ]] && echo "Kein Anbieter verfuegbar." && exit 2
  echo "Gewinner: $winner_name"
  exit 0
fi

if [[ -z "$winner_id" ]]; then
  echo ""
  echo "KEIN Anbieter verfuegbar. Tipp: 'ollama serve && ollama pull qwen3-coder' startet den gratis Fallback."
  exit 2
fi

cat > "$OUT_ENV" <<ENVEOF
# Automatisch vom Key-Changer geschrieben: $(date '+%Y-%m-%d %H:%M:%S')
# Aktive kostenlose Anbindung: $winner_name
LLM_API_KEY="$winner_key"
LLM_BASE_URL="$winner_base"
LLM_MODEL="$winner_model"
ENVEOF
echo ""
echo "== Aktiv geschaltet: $winner_name =="
echo "   Endpunkt: $winner_base"
echo "   Modell:   $winner_model"
echo "   ENV-Datei: $OUT_ENV"
