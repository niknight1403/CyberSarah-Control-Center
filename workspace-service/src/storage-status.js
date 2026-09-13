// Sprint 85 (Persistent Disk) + Follow-up (kostenlose Alternative):
// Speicher-Status des Workspace-Service.
//
// Auf Render Free laeuft der Service in einem ephemeralen Dateisystem.
// Zwei Wege aus dem Ephemeralfallback, priorisiert:
//
//   1. Render Persistent Disk (bezahlter Owner-Schritt): Flag
//      WORKSPACE_STORAGE_PERSISTENT=true UND aufgeloester Pfad == konfigurier-
//      tem Pfad (kein Fallback) → Modus "persistent".
//   2. Neon-Postgres-Persistenz (KOSTENLOS, Sprint-85-Follow-up): Heartbeat
//      erfolgreich (Audit-Log + WIP-Dateibackups in Postgres) → Modus
//      "postgres". Workspaces selbst sind Git-Clones — GitHub bleibt das
//      primaere Storage-Backend.
//
// Bewusst konservativ: Der Health-Endpoint soll keine falsche Sicherheit
// signalisieren. Ohne Disk-Flag/-Pfad und ohne bestätigte DB-Verbindung
// bleibt der Modus "ephemeral".
import path from "node:path";

export const DEFAULT_WORKSPACES_DIR = "/data/workspaces";

function parseBooleanFlag(value) {
  return ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

export function resolveStorageStatus({ env, activeDir, defaultDir = DEFAULT_WORKSPACES_DIR, databaseConnected = false }) {
  const configuredDir = path.resolve(env.WORKSPACES_DIR?.trim() || defaultDir);
  const declaredPersistent = parseBooleanFlag(env.WORKSPACE_STORAGE_PERSISTENT);
  const onConfiguredPath = path.resolve(activeDir) === configuredDir;
  const diskPersistent = declaredPersistent && onConfiguredPath;
  const dbPersistent = !diskPersistent && databaseConnected === true;
  const persistent = diskPersistent || dbPersistent;
  return {
    mode: diskPersistent ? "persistent" : dbPersistent ? "postgres" : "ephemeral",
    persistent,
    // Diagnose-Felder fuer Logs/Tests (nicht Teil des oeffentlichen Health-Payloads):
    declaredPersistent,
    onConfiguredPath,
    databaseConnected: dbPersistent,
  };
}
