#!/usr/bin/env bash
set -Eeuo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-10}"
LOG_FILE="${LOG_FILE:-/var/log/cybersarah-health.log}"

log_dir="$(dirname -- "$LOG_FILE")"
if [[ ! -d "$log_dir" ]]; then
  mkdir -p -- "$log_dir"
fi

timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
tmp_body="$(mktemp)"
tmp_headers="$(mktemp)"
cleanup() {
  rm -f -- "$tmp_body" "$tmp_headers"
}
trap cleanup EXIT

start_ns="$(date +%s%N)"
http_code="000"
curl_exit=0

if http_code="$(curl \
  --silent \
  --show-error \
  --location \
  --max-time "$CURL_TIMEOUT_SECONDS" \
  --connect-timeout "$CURL_TIMEOUT_SECONDS" \
  --output "$tmp_body" \
  --dump-header "$tmp_headers" \
  --write-out '%{http_code}' \
  "$HEALTH_URL" 2>"$tmp_headers.curl-error")"; then
  curl_exit=0
else
  curl_exit=$?
fi

end_ns="$(date +%s%N)"
elapsed_ms="$(( (end_ns - start_ns) / 1000000 ))"
body="$(tr -d '\r\n' < "$tmp_body" 2>/dev/null || true)"
error_detail="$(tr '\r\n' '  ' < "$tmp_headers.curl-error" 2>/dev/null || true)"

if [[ "$curl_exit" -eq 0 && "$http_code" == "200" && "$body" == *'"ok":true'* ]]; then
  printf '%s status=UP url=%s http=%s latency_ms=%s\n' "$timestamp" "$HEALTH_URL" "$http_code" "$elapsed_ms" >> "$LOG_FILE"
  printf 'UP http=%s latency_ms=%s url=%s\n' "$http_code" "$elapsed_ms" "$HEALTH_URL"
  exit 0
fi

printf '%s status=DOWN url=%s http=%s curl_exit=%s latency_ms=%s body=%s error=%s\n' \
  "$timestamp" "$HEALTH_URL" "$http_code" "$curl_exit" "$elapsed_ms" "$body" "$error_detail" >> "$LOG_FILE"
printf 'DOWN http=%s curl_exit=%s latency_ms=%s url=%s\n' "$http_code" "$curl_exit" "$elapsed_ms" "$HEALTH_URL" >&2
exit 1
