#!/usr/bin/env bash
# Sprint 349 — Ein-Befehl-Bootstrap fuer einen frischen Gratis-Server
# (GitHub Codespaces, HF Space, Oracle Cloud Always Free, jeder Ubuntu-22.04+-
# KVM-Host). Verwandelt die Instanz in die Ollama-Rechenzentrale des
# CyberSarah Control Centers: Ollama-Daemon per systemd (Auto-Restart),
# Qwen-2.5-Leiter (0.5b–7b, optional 14b) und ein Latenz-Selbsttest.
#
# Nutzung auf dem Server:  bash ollama-server-setup.sh [--with-14b]
# Danach auf Render setzen: AI_OLLAMA_BASE_URL=https://<server-host>/v1
#
# Ehrlich: Fuer HTTPS von Render zum Server empfiehlt sich ein Reverse-Proxy
# mit TLS (z. B. Caddy oder nginx mit Let's Encrypt) — der Daemon selbst
# horcht bewusst nur lokal und wird NIE ungefiltert ins offene Netz gelegt.
set -euo pipefail

WITH_14B="${1:-}"
LADDER=(qwen2.5:0.5b qwen2.5:1.5b qwen2.5:3b qwen2.5:7b)
if [[ "$WITH_14B" == "--with-14b" ]]; then LADDER+=(qwen2.5:14b); fi

echo "== [1/4] Ollama installieren (offizieller Installer) =="
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "Ollama bereits vorhanden: $(ollama --version 2>/dev/null | head -1)"
fi

echo "== [2/4] Daemon pruefen (systemd startet/haelt ihn am Leben) =="
systemctl enable --now ollama 2>/dev/null || true
for i in $(seq 1 20); do
  curl -sf http://127.0.0.1:11434/api/version >/dev/null && break
  sleep 1
done
curl -sf http://127.0.0.1:11434/api/version || { echo "FEHLER: Ollama antwortet nicht."; exit 1; }
echo

echo "== [3/4] Qwen-2.5-Leiter ziehen =="
for model in "${LADDER[@]}"; do
  echo "-- Pull: $model"
  ollama pull "$model"
done

echo "== [4/4] Latenz-Selbsttest (Kurzfassung) =="
for model in "${LADDER[@]}"; do
  start=$(date +%s%3N)
  if ollama run "$model" "Antworte mit einem Wort: bereit?" >/dev/null 2>&1; then
    end=$(date +%s%3N)
    echo "-- $model: OK ($((end-start)) ms)"
  else
    echo "-- $model: FEHLGESCHLAGEN"
  fi
done

echo
echo "FERTIG. Naechste Schritte:"
echo " 1. HTTPS-Zugang einrichten (Caddy/nginx mit Let's Encrypt) — der Daemon bleibt lokal."
echo " 2. Auf Render setzen: AI_OLLAMA_BASE_URL=https://<server-host>/v1"
echo " 3. Validieren: npx tsx scripts/ollama-validate.ts"
