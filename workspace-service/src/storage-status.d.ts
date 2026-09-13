// Typdeklaration fuer workspace-service/src/storage-status.js (reines JS-Modul,
// das der Service ohne Build-Schritt direkt ausfuehrt — daher JS + d.ts statt TS).
export type StorageStatusEnv = Record<string, string | undefined>;

export interface ResolveStorageStatusInput {
  env: StorageStatusEnv;
  /** Tatsaechlich aufgeloester Workspaces-Pfad (nach Fallback-Logik). */
  activeDir: string;
  /** Default, wenn WORKSPACES_DIR nicht gesetzt ist. */
  defaultDir?: string;
  /** Sprint-85-Follow-up: true, wenn der Neon-Postgres-Heartbeat erfolgreich war. */
  databaseConnected?: boolean;
}

export interface StorageStatus {
  /** "persistent" = Render-Disk (bezahlte Variante), "postgres" = kostenlose Neon-Persistenz. */
  mode: "persistent" | "postgres" | "ephemeral";
  persistent: boolean;
  declaredPersistent: boolean;
  onConfiguredPath: boolean;
  databaseConnected: boolean;
}

export declare function resolveStorageStatus(input: ResolveStorageStatusInput): StorageStatus;
export declare const DEFAULT_WORKSPACES_DIR: string;
