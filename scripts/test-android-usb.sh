#!/usr/bin/env bash
set -Eeuo pipefail

# CyberSarah Control Center — Android USB smoke test
# Starts the Expo development build on a physically connected Android device.
# Optional environment variables:
#   ANDROID_SERIAL   Select one device when multiple devices are connected.
#   EXPO_PORT        Metro port, default 8081.
#   SKIP_BUILD=1     Skip `expo run:android` and only start Metro.
#   RESET_CACHE=1    Start Metro with --clear.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPO_PORT="${EXPO_PORT:-8081}"
ANDROID_SERIAL="${ANDROID_SERIAL:-}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v adb >/dev/null 2>&1 || fail "adb wurde nicht gefunden. Installiere Android Studio/SDK Platform Tools und setze ANDROID_HOME bzw. PATH."
command -v npx >/dev/null 2>&1 || fail "npx wurde nicht gefunden. Installiere Node.js."

if [[ -n "$ANDROID_SERIAL" ]]; then
  adb start-server >/dev/null
  device_state="$(adb -s "$ANDROID_SERIAL" get-state 2>/dev/null || true)"
  [[ "$device_state" == "device" ]] || fail "Das Gerät '$ANDROID_SERIAL' ist nicht bereit (Status: ${device_state:-nicht gefunden}). USB-Debugging und Autorisierung prüfen."
else
  mapfile -t devices < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
  case "${#devices[@]}" in
    0) fail "Kein autorisiertes Android-Gerät gefunden. USB-Debugging aktivieren, Gerät entsperren und RSA-Abfrage bestätigen." ;;
    1) ANDROID_SERIAL="${devices[0]}" ;;
    *)
      printf 'Mehrere Android-Geräte gefunden:\n'
      printf '  %s\n' "${devices[@]}"
      fail "Setze ANDROID_SERIAL=<Geräte-ID> und führe das Skript erneut aus."
      ;;
  esac
fi

printf 'Android-Gerät: %s\n' "$ANDROID_SERIAL"
adb -s "$ANDROID_SERIAL" reverse "tcp:${EXPO_PORT}" "tcp:${EXPO_PORT}" >/dev/null
printf 'adb reverse: tcp:%s -> tcp:%s\n' "$EXPO_PORT" "$EXPO_PORT"

cd "$PROJECT_ROOT"
[[ -f package.json ]] || fail "package.json fehlt in $PROJECT_ROOT."

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  printf '%s\n' 'Baue/installiere den Expo-Entwicklungsbuild und starte ihn auf dem USB-Gerät ...'
  if [[ "${RESET_CACHE:-0}" == "1" ]]; then
    npx expo run:android --device "$ANDROID_SERIAL" --no-build-cache
  else
    npx expo run:android --device "$ANDROID_SERIAL"
  fi
else
  printf '%s\n' 'SKIP_BUILD=1 gesetzt — starte nur den Metro-Bundler ...'
  if [[ "${RESET_CACHE:-0}" == "1" ]]; then
    npx expo start --localhost --port "$EXPO_PORT" --clear
  else
    npx expo start --localhost --port "$EXPO_PORT"
  fi
fi
