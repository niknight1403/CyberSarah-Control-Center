import { describe, expect, it, vi, type Mock } from "vitest";

import {
  connectPersistence,
  createPersistence,
  databaseUrlFromEnv,
} from "../workspace-service/src/db-persistence.js";

/**
 * Sprint 85 (Follow-up): Unit-Tests fuer die Neon-Postgres-Persistenz —
 * die KOSTENLOSE Alternative zur Render Persistent Disk.
 *
 * Der echte DB-Zugriff passiert nur produktiv (Render → Neon); in der CI
 * wird ein Fake-Pool injiziert. Geprueft werden: ENV-Aufloesung, SSL-Logik,
 * SQL-Statements (Schema, Audit-Append idempotent, WIP-Upsert/-Restore/
 * -Cleanup) und die Graceful-Degradation bei DB-Ausfall.
 */

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
type FakeQuery = Mock<QueryFn>;
type QueryCall = [string, unknown[]?];

/** Mock-Query-Funktion mit vordefiniertem Verhalten (Default: leere Rows). */
function mockQuery(behaviour: { rows?: Record<string, unknown>[]; fail?: boolean } = {}): FakeQuery {
  return vi.fn(async () => {
    if (behaviour.fail) throw new Error("ECONNREFUSED");
    return { rows: behaviour.rows ?? [] };
  }) as unknown as FakeQuery;
}

/** Haengende Query (liefert nie) fuer Timeout-Tests. */
function hangingQuery(): FakeQuery {
  return vi.fn(() => new Promise(() => {})) as unknown as FakeQuery;
}

/** PoolImpl-Substitut: Instanz traegt die Query-Mock — wie pg.Pool, nur ohne Netz. */
function fakePoolClass(options: { query?: FakeQuery; capture?: Record<string, unknown>[] } = {}) {
  return class {
    query: QueryFn;
    constructor(constructorOptions?: Record<string, unknown>) {
      options.capture?.push(constructorOptions ?? {});
      this.query = options.query ?? mockQuery();
    }
  };
}

/** createPersistence mit Nicht-null-Assertion (Testkonvention: URL gesetzt). */
function mustCreate(input: Parameters<typeof createPersistence>[0]) {
  const persistence = createPersistence(input);
  if (!persistence) throw new Error("createPersistence gab unerwartet null zurueck");
  return persistence;
}

/** Ersten SQL-Aufruf der Mock als [sql, params] zurueckgeben. */
function firstCall(query: FakeQuery): QueryCall {
  return query.mock.calls[0] as QueryCall;
}

describe("databaseUrlFromEnv (Sprint-85-Follow-up)", () => {
  it("liefert URL + Hostname bei gueltiger Postgres-URL", () => {
    const result = databaseUrlFromEnv({ WORKSPACE_DATABASE_URL: " postgresql://u:p@ep-1.eu-central-1.aws.neon.tech/db?sslmode=require " });
    expect(result?.hostname).toBe("ep-1.eu-central-1.aws.neon.tech");
  });

  it("liefert null ohne URL, bei Leerstring und bei ungueltiger URL", () => {
    expect(databaseUrlFromEnv({})).toBeNull();
    expect(databaseUrlFromEnv({ WORKSPACE_DATABASE_URL: "  " })).toBeNull();
    expect(databaseUrlFromEnv({ WORKSPACE_DATABASE_URL: "not-a-url" })).toBeNull();
  });
});

describe("createPersistence (Sprint-85-Follow-up)", () => {
  it("gibt null zurueck, wenn keine URL konfiguriert ist (ephemeral weiterlaufen)", () => {
    expect(createPersistence({ env: {} })).toBeNull();
  });

  it("baut SSL nur fuer entfernte Hosts — lokale Test-DBs bleiben ohne SSL", () => {
    const captured: Record<string, unknown>[] = [];
    const remote = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@ep-1.neon.tech/db" },
      PoolImpl: fakePoolClass({ capture: captured }),
    });
    expect(captured[0].ssl).toEqual({ rejectUnauthorized: false });

    mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost:5432/db" },
      PoolImpl: fakePoolClass({ capture: captured }),
    });
    expect(captured[1].ssl).toBeUndefined();
    expect(remote.pool).toBeDefined();
  });

  it("initSchema: erzeugt Schema + beide Tabellen idempotent", async () => {
    const query = mockQuery();
    const persistence = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost/db" },
      PoolImpl: fakePoolClass({ query }),
    });
    await persistence.initSchema();
    const [sql] = firstCall(query);
    expect(sql).toContain("CREATE SCHEMA IF NOT EXISTS workspace_service");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS workspace_service.audit_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS workspace_service.workspace_file_backups");
  });

  it("appendAuditEvent: INSERT mit ON CONFLICT (event_id) DO NOTHING und allen Feldern", async () => {
    const query = mockQuery();
    const persistence = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost/db" },
      PoolImpl: fakePoolClass({ query }),
      now: () => new Date("2026-09-13T18:00:00.000Z"),
    });
    await persistence.appendAuditEvent({
      eventId: "evt-1",
      action: "push",
      status: "passed",
      branch: "main",
      metadata: { repo: "demo" },
    });
    const [sql, params] = firstCall(query);
    expect(sql).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(params).toEqual(["evt-1", "push", "passed", null, "main", null, null, null, '{"repo":"demo"}', "2026-09-13T18:00:00.000Z"]);
  });

  it("saveFileBackup: Upsert auf (workspace_id, file_path)", async () => {
    const query = mockQuery();
    const persistence = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost/db" },
      PoolImpl: fakePoolClass({ query }),
      now: () => new Date("2026-09-13T18:00:00.000Z"),
    });
    await persistence.saveFileBackup("owner-repo", "src/app.ts", "export {};");
    const [sql, params] = firstCall(query);
    expect(sql).toContain("ON CONFLICT (workspace_id, file_path)");
    expect(sql).toContain("DO UPDATE SET content = EXCLUDED.content");
    expect(params).toEqual(["owner-repo", "src/app.ts", "export {};", "2026-09-13T18:00:00.000Z"]);
  });

  it("restoreFileBackups: wendet Zeilen in Reihenfolge an und liefert die Anzahl", async () => {
    const query = mockQuery({ rows: [
      { file_path: "a.ts", content: "A" },
      { file_path: "b.ts", content: "B" },
    ] });
    const persistence = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost/db" },
      PoolImpl: fakePoolClass({ query }),
    });
    const applied: [string, string][] = [];
    const count = await persistence.restoreFileBackups("owner-repo", async (filePath, content) => {
      applied.push([filePath, content]);
    });
    expect(count).toBe(2);
    expect(applied).toEqual([["a.ts", "A"], ["b.ts", "B"]]);
    const [sql, params] = firstCall(query);
    expect(sql).toContain("ORDER BY updated_at ASC");
    expect(params).toEqual(["owner-repo"]);
  });

  it("clearFileBackups: DELETE begrenzt auf den Workspace", async () => {
    const query = mockQuery();
    const persistence = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost/db" },
      PoolImpl: fakePoolClass({ query }),
    });
    await persistence.clearFileBackups("owner-repo");
    const [sql, params] = firstCall(query);
    expect(sql).toBe("DELETE FROM workspace_service.workspace_file_backups WHERE workspace_id = $1");
    expect(params).toEqual(["owner-repo"]);
  });
});

describe("connectPersistence: Graceful Degradation (Sprint-85-Follow-up)", () => {
  it("liefert false ohne Persistenz-Objekt", async () => {
    expect(await connectPersistence(null)).toBe(false);
  });

  it("liefert true bei erfolgreichem Heartbeat + Schema-Init", async () => {
    const query = mockQuery();
    const persistence = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost/db" },
      PoolImpl: fakePoolClass({ query }),
    });
    expect(await connectPersistence(persistence)).toBe(true);
    expect(query).toHaveBeenCalledTimes(2); // SELECT 1 + Schema-Init
  });

  it("liefert false bei nicht erreichbarer Datenbank — Service bleibt ephemeral", async () => {
    const query = mockQuery({ fail: true });
    const persistence = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost/db" },
      PoolImpl: fakePoolClass({ query }),
    });
    expect(await connectPersistence(persistence)).toBe(false);
  });

  it("bricht bei haengendem Heartbeat nach Zeitbudget ab (kein endloser Start-Block)", async () => {
    const persistence = mustCreate({
      env: { WORKSPACE_DATABASE_URL: "postgresql://u:p@localhost/db" },
      PoolImpl: fakePoolClass({ query: hangingQuery() }),
    });
    const started = Date.now();
    expect(await connectPersistence(persistence, 150)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
