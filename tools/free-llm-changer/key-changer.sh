#!/usr/bin/env bash
# Free-Tier Key-Changer — autonome Rotation ueber alle kostenlosen LLM-Anbieter.
#
# Sprint 202c: Dynamische Modell-Discovery. Der Changer fragt je Anbieter live
# GET /models ab und waehlt das erste verfuegbare Modell (bevorzugt aus der
# Registry). Modell-Rueckzuege des Anbieters koennen den Changer daher nicht
# mehr lahmlegen; nur echte Erreichbarkeits-/Limit-Zustaende zaehlen.

set -euo pipefail
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="$KIT_DIR/provider-registry.json"
OUT_ENV="$KIT_DIR/aktive-anbindung.env"
STATUS_FILE="$KIT_DIR/changer-status.json"
ONLY_PROBE="${CHANGER_ONLY_PROBE:-false}"

# Waehlt aus einer Live-Modellliste das bevorzugte (Registry) oder erste Modell.
pick_model() { # $1=models-json $2=prefs $3=max_kandidaten — JSON via stdin
  # WICHTIG: grosse Modelllisten (OpenRouter ~750 KB) ueberschreiten Linux'
  # MAX_ARG_STRLEN von 128 KB pro Argument — daher stdin, nie argv.
  printf '%s' "$1" | python3 "$KIT_DIR/pick_model.py" - "$2" "${3:-5}"
}

probe_chat() { # $1=base_url $2=key $3=prefs -> "OK <modell>" | "<status> <modell>"
  local base="$1" key="$2" prefs="$3"
  local models_json status chosen mstatus
  models_json=$(curl -sS -m 15 "${base%/}/models" -H "Authorization: Bearer ${key}" 2>/dev/null || true)
  mstatus=$(printf '%s' "$models_json" | head -c 200 | grep -q '"error"' && echo "err" || echo "ok")
  if [[ "$mstatus" == "err" ]]; then
    # Anbieter meldet Fehler auf /models: haeufig 401/403 (Key ungueltig) oder leer.
    if printf '%s' "$models_json" | grep -qi 'invalid\|unauthorized\|api key'; then
      echo "KEYUNGUELTIG -"
    else
      echo "404 -"
    fi
    return
  fi
  candidates="$(pick_model "$models_json" "$prefs" 5)"
  if [[ -z "$candidates" ]]; then
    echo "404 -"
    return
  fi
  # Bis zu 5 Kandidaten durchprobieren: nicht jedes Projekt serve jedes Modell
  # (OpenHands-Doku: projektbezogene 404s sind bei Gemini real).
  status="000"; chosen=""
  while IFS= read -r cand; do
    [[ -z "$cand" ]] && continue
    chosen="$cand"
    status=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' \
      "${base%/}/chat/completions" \
      -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \
      -d "{\"model\":\"${cand}\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}" 2>/dev/null || true)
    if [[ "${status:-000}" == "200" ]]; then
      echo "OK $cand"
      return
    fi
  done <<< "$candidates"
  echo "${status:-000} $chosen"
}

probe_ollama() {
  local status
  status=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "${1%/}/models" 2>/dev/null || true)
  [[ "${status:-000}" == "200" ]] && echo "OK lokal" || echo "${status:-000} -"
}

echo "== Free-Tier Key-Changer: pruefe alle Anbieter (dynamische Modell-Discovery) =="
results=()
winner_id="" ; winner_name="" ; winner_base="" ; winner_model="" ; winner_key=""

while IFS=$'\t' read -r id name base_url env_key first_model prefs; do
  [[ -z "$id" ]] && continue
  verdict="FEHLT"
  key=""
  [[ "$env_key" != "-" ]] && key="${!env_key:-}"
  if [[ "$id" == "ollama" ]]; then
    verdict="$(probe_ollama "$base_url")"
  elif [[ -n "$key" ]]; then
    verdict="$(probe_chat "$base_url" "$key" "$prefs")"
  fi
  verdict_model="${verdict#* }"
  case "$verdict" in
    OK*) verdict="VERFUEGBAR"
         if [[ -z "$winner_id" ]]; then
           winner_id="$id"; winner_name="$name"; winner_base="$base_url"
           winner_model="$verdict_model"; winner_key="$key"
         fi ;;
    429*|402*) verdict="LIMIT ERREICHT ($verdict) — Changer rotiert weiter" ;;
    KEYUNGUELTIG*) verdict="KEY UNGUELTIG ($verdict) — Secret erneuern" ;;
    401*|403*) verdict="KEY UNGUELTIG ($verdict)" ;;
    *) verdict="NICHT KONFIGURIERT/ERREICHBAR ($verdict)" ;;
  esac
  printf '  [%-13s] %-38s -> %s\n' "$id" "$name" "$verdict"
  results+=("$id|$verdict")
done < <(python3 -c "
import json
for a in json.load(open('$REGISTRY'))['anbieter']:
    print('\t'.join([a['id'], a['name'], a['base_url'], a['env_key'] or '-',
                      (a['kostenlose_modelle'] or [''])[0],
                      '|'.join(a['kostenlose_modelle'] or [])]))
")

# Never-Fail-Fallback: Ollama lokal, immer gratis, unbegrenzt, ohne Key.
if [[ -z "$winner_id" ]] && [[ "$(probe_ollama http://127.0.0.1:11434/v1)" == "OK"* ]]; then
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
echo "   Modell:   $winner_model (dynamisch ermittelt)"
echo "   ENV-Datei: $OUT_ENV"
