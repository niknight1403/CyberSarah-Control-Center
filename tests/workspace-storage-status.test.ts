import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveStorageStatus } from "../workspace-service/src/storage-status.js";

/**
 * Sprint 85 (Persistent Disk) + Follow-up (Neon-Postgres): Unit-Tests fuer
 * die Speicher-Modus-Erkennung.
 *
 * Der Modus muss bewusst konservativ sein: "persistent" (Render-Disk) gilt
 * nur, wenn das Flag WORKSPACE_STORAGE_PERSISTENT gesetzt UND der aktive
 * Workspaces-Pfad dem konfigurierten Pfad entspricht (kein Fallback aktiv).
 * Die KOSTENLOSE Alternative ist der Modus "postgres" (Heartbeat der
 * Neon-Persistenz erfolgreich). Der Spawn-Smoke
 * (tests/workspace-service-smoke.test.ts) deckt nur den Fallback-Kandidaten
 * ab — diese Suite prueft die Kombinatorik deterministisch in der CI.
 */
describe("resolveStorageStatus (Sprint 85)", () => {
  it("meldet persistent, wenn Flag gesetzt ist UND der aktive Pfad dem konfigurierten Pfad entspricht", () => {
    const status = resolveStorageStatus({
      env: { WORKSPACES_DIR: "/data/workspaces", WORKSPACE_STORAGE_PERSISTENT: "true" },
      activeDir: "/data/workspaces",
    });
    expect(status.mode).toBe("persistent");
    expect(status.persistent).toBe(true);
    expect(status.declaredPersistent).toBe(true);
    expect(status.onConfiguredPath).toBe(true);
  });

  it("bleibt ephemeral, wenn der Service trotz Flag auf einen Fallback-Pfad ausgewichen ist", () => {
    const status = resolveStorageStatus({
      env: { WORKSPACES_DIR: "/data/workspaces", WORKSPACE_STORAGE_PERSISTENT: "true" },
      activeDir: "/tmp/cybersarah-workspaces",
    });
    expect(status.mode).toBe("ephemeral");
    expect(status.persistent).toBe(false);
    expect(status.onConfiguredPath).toBe(false);
  });

  it("bleibt ephemeral ohne Flag — auch auf dem konfigurierten Pfad (Default: Free-Tier)", () => {
    const status = resolveStorageStatus({
      env: { WORKSPACES_DIR: "/data/workspaces" },
      activeDir: "/data/workspaces",
    });
    expect(status.mode).toBe("ephemeral");
    expect(status.persistent).toBe(false);
    expect(status.declaredPersistent).toBe(false);
  });

  it("normalisiert Pfade (Trailing-Slash, relative Segmente) vor dem Vergleich", () => {
    const status = resolveStorageStatus({
      env: { WORKSPACES_DIR: "/data/workspaces/", WORKSPACE_STORAGE_PERSISTENT: "1" },
      activeDir: path.resolve("/data/workspaces/./"),
    });
    expect(status.persistent).toBe(true);
  });

  it("akzeptiert die truthy-Schreibweisen true/1/yes (case-insensitive) fuer das Flag", () => {
    for (const value of ["true", "TRUE", "1", "yes", "Yes"]) {
      const status = resolveStorageStatus({
        env: { WORKSPACES_DIR: "/data/workspaces", WORKSPACE_STORAGE_PERSISTENT: value },
        activeDir: "/data/workspaces",
      });
      expect(status.declaredPersistent, `Flag "${value}"`).toBe(true);
    }
  });

  it("verwendet DEFAULT_WORKSPACES_DIR, wenn WORKSPACES_DIR fehlt", () => {
    const status = resolveStorageStatus({
      env: { WORKSPACE_STORAGE_PERSISTENT: "true" },
      activeDir: "/data/workspaces",
    });
    expect(status.persistent).toBe(true);
  });

  it("bleibt ephemeral bei leeren/whitespace Env-Werten", () => {
    const status = resolveStorageStatus({
      env: { WORKSPACE_STORAGE_PERSISTENT: "  " },
      activeDir: "/data/workspaces",
    });
    expect(status.persistent).toBe(false);
  });
});

describe("resolveStorageStatus: Postgres-Modus (Sprint-85-Follow-up, kostenlose Alternative)", () => {
  it("meldet postgres, wenn der Neon-Heartbeat erfolgreich war (persistent: true)", () => {
    const status = resolveStorageStatus({
      env: {},
      activeDir: "/tmp/cybersarah-workspaces",
      databaseConnected: true,
    });
    expect(status.mode).toBe("postgres");
    expect(status.persistent).toBe(true);
    expect(status.databaseConnected).toBe(true);
  });

  it("bleibt ephemeral, wenn die DB-URL gesetzt ist, der Heartbeat aber fehlschlug", () => {
    const status = resolveStorageStatus({
      env: {},
      activeDir: "/tmp/cybersarah-workspaces",
      databaseConnected: false,
    });
    expect(status.mode).toBe("ephemeral");
    expect(status.persistent).toBe(false);
  });

  it("priorisiert die Render-Disk ueber Postgres (Disk ist die staerkere Garantie)", () => {
    const status = resolveStorageStatus({
      env: { WORKSPACES_DIR: "/data/workspaces", WORKSPACE_STORAGE_PERSISTENT: "true" },
      activeDir: "/data/workspaces",
      databaseConnected: true,
    });
    expect(status.mode).toBe("persistent");
    expect(status.persistent).toBe(true);
  });

  it("postgres gilt auch auf dem Fallback-Pfad — der Speicher liegt ja ausserhalb des Dateisystems", () => {
    const status = resolveStorageStatus({
      env: {},
      activeDir: path.resolve(process.cwd(), "workspaces"),
      databaseConnected: true,
    });
    expect(status.mode).toBe("postgres");
    expect(status.persistent).toBe(true);
    expect(status.onConfiguredPath).toBe(false);
  });
});
