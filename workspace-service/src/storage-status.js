// Sprint 85 (Persistent Disk): Speicher-Status des Workspace-Service.
//
// Auf Render Free laeuft der Service in einem ephemeralen Dateisystem —
// Workspace-Daten (Git-Clones, Audit-Log) ueberleben kein Re-Deploy. Sobald
// der Owner eine Persistent Disk gebucht hat (Mount /data, WORKSPACES_DIR
// = /data/workspaces) und WORKSPACE_STORAGE_PERSISTENT=true gesetzt ist,
// meldet der Health-Endpoint den produktiven Speicher-Modus, damit die App
// den Speicherpfad diagnosefaehig anzeigt.
//
// Bewusst konservativ: "persistent" gilt nur, wenn das Flag gesetzt UND der
// aufgeloeste Workspaces-Pfad identisch mit dem konfigurierten Pfad ist
// (d. h. KEIN automatischer Fallback auf cwd/tmpdir aktiv wurde). Sonst
// bleibt der Modus "ephemeral" — der Health-Endpoint soll keine falsche
// Sicherheit signalisieren.
import path from "node:path";

export const DEFAULT_WORKSPACES_DIR = "/data/workspaces";

function parseBooleanFlag(value) {
  return ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

export function resolveStorageStatus({ env, activeDir, defaultDir = DEFAULT_WORKSPACES_DIR }) {
  const configuredDir = path.resolve(env.WORKSPACES_DIR?.trim() || defaultDir);
  const declaredPersistent = parseBooleanFlag(env.WORKSPACE_STORAGE_PERSISTENT);
  const onConfiguredPath = path.resolve(activeDir) === configuredDir;
  const persistent = declaredPersistent && onConfiguredPath;
  return {
    mode: persistent ? "persistent" : "ephemeral",
    persistent,
    // Diagnose-Felder fuer Logs/Tests (nicht Teil des oeffentlichen Health-Payloads):
    declaredPersistent,
    onConfiguredPath,
  };
}
