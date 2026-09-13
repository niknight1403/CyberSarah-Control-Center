// Typdeklaration fuer workspace-service/src/db-persistence.js (reines JS-Modul,
// das der Service ohne Build-Schritt direkt ausfuehrt — daher JS + d.ts statt TS).
export interface DatabaseUrlInfo {
  url: string;
  hostname: string;
}

/** Pool-Substitut fuer Tests (echter Betrieb: pg.Pool). */
export interface PersistencePoolLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface AuditEventLike {
  eventId: string;
  action: string;
  status: string;
  repository?: string;
  branch?: string;
  commitSha?: string;
  runId?: string;
  message?: string;
  metadata?: Record<string, unknown> | null;
  occurredAt?: string;
}

export interface Persistence {
  pool: PersistencePoolLike;
  url: string;
  heartbeat(): Promise<boolean>;
  initSchema(): Promise<void>;
  appendAuditEvent(event: AuditEventLike): Promise<void>;
  saveFileBackup(workspaceId: string, filePath: string, content: string): Promise<void>;
  restoreFileBackups(
    workspaceId: string,
    apply: (filePath: string, content: string) => Promise<void> | void,
  ): Promise<number>;
  clearFileBackups(workspaceId: string): Promise<void>;
}

export interface CreatePersistenceInput {
  env: Record<string, string | undefined>;
  PoolImpl?: new (options: Record<string, unknown>) => PersistencePoolLike;
  now?: () => Date;
}

/** WORKSPACE_DATABASE_URL aufloesen (null, wenn ungueltig/leer). */
export declare function databaseUrlFromEnv(env: Record<string, string | undefined>): DatabaseUrlInfo | null;

/** Pool + Operationen erstellen; null ohne gueltige URL (ephemeral weiterlaufen). */
export declare function createPersistence(input?: CreatePersistenceInput): Persistence | null;

/** Startup-Heartbeat + Schema-Init mit Zeitbudget; false bei Ausfall (graceful). */
export declare function connectPersistence(persistence: Persistence | null, timeoutMs?: number): Promise<boolean>;
