import { describe, expect, it, vi } from "vitest";

/**
 * Server-Adapter für Nutzungsmessung (Ausführungsprotokoll + ROI-Bericht).
 *
 * Der Adapter sitzt auf dem öffentlichen API-Pfad: ein Fehler beim Protokollieren
 * darf keinen Lauf verhindern, ein Fehler beim Lesen darf keine erfundenen Zahlen
 * liefern. Beides wird hier mit einer nachgebildeten Drizzle-Kette belegt —
 * kein echter Postgres, kein Netzwerk. Die DB kommt über den Deps-Seam, weil die
 * Suite mit `isolate: false` läuft und `vi.mock("./db")` in Nachbardateien lecken
 * würde.
 */
const metering = await import("../server/usage-metering");

type MeteringDeps = Parameters<typeof metering.recordAgentExecution>[1];

function insertDb(options: { failWith?: Error; capture?: (row: Record<string, unknown>) => void }) {
  return {
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        options.capture?.(row);
        return {
          onConflictDoNothing: async () => {
            if (options.failWith) throw options.failWith;
            return {};
          },
        };
      },
    }),
  };
}

function selectDb(options: { rows?: unknown[]; failWith?: Error; captureLimit?: (n: number) => void }) {
  const rows = options.rows ?? [];
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async (n: number) => {
      options.captureLimit?.(n);
      if (options.failWith) throw options.failWith;
      return rows;
    },
  };
  return { select: () => chain };
}

const depsFor = (db: unknown): MeteringDeps => ({
  getDb: async () => db as never,
});

const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
const DAY = 86_400_000;

describe("recordAgentExecution", () => {
  it("meldet ohne Datenbank ehrlich false statt eines Scheinerfolgs", async () => {
    const ok = await metering.recordAgentExecution(
      { executionKey: "k1", userOpenId: "u1", provider: "groq", status: "ok" },
      depsFor(null),
    );
    expect(ok).toBe(false);
  });

  it("kürzt Zuliefererfelder auf Spaltenbreite und füllt Defaults", async () => {
    let captured: Record<string, unknown> = {};
    const ok = await metering.recordAgentExecution(
      {
        executionKey: "k".repeat(300),
        userOpenId: "u1",
        provider: "aussen-unbekannt",
        model: "m".repeat(300),
        agentId: "a".repeat(200),
        errorCode: "e".repeat(200),
        status: "error",
      },
      depsFor(insertDb({ capture: (row) => { captured = row; } })),
    );

    expect(ok).toBe(true);
    expect(String(captured.executionKey)).toHaveLength(190);
    expect(String(captured.model)).toHaveLength(120);
    expect(String(captured.agentId)).toHaveLength(64);
    expect(String(captured.errorCode)).toHaveLength(60);
    // Unbekannte Provider werden konservativ als "unknown" geführt, nicht erfunden.
    expect(captured.provider).toBe("unknown");
    // Ohne Surface-Angabe gilt der API-Pfad.
    expect(captured.surface).toBe("api");
  });

  it("setzt fehlende optionale Felder auf null statt auf leere Strings", async () => {
    let captured: Record<string, unknown> = {};
    await metering.recordAgentExecution(
      { executionKey: "k2", userOpenId: "u2", provider: "groq", status: "ok", agentId: null, model: null, errorCode: undefined },
      depsFor(insertDb({ capture: (row) => { captured = row; } })),
    );

    expect(captured.agentId).toBeNull();
    expect(captured.model).toBeNull();
    expect(captured.errorCode).toBeNull();
  });

  it("berechnet Kosten nur, wenn Token-Messwerte vorliegen", async () => {
    let withTokens: Record<string, unknown> = {};
    await metering.recordAgentExecution(
      { executionKey: "k3", userOpenId: "u3", provider: "groq", status: "ok", promptTokens: 1_000_000, completionTokens: 0 },
      depsFor(insertDb({ capture: (row) => { withTokens = row; } })),
    );
    expect(withTokens.costEur).not.toBeNull();
    expect(Number(withTokens.costEur)).toBeGreaterThan(0);

    let withoutTokens: Record<string, unknown> = {};
    await metering.recordAgentExecution(
      { executionKey: "k4", userOpenId: "u4", provider: "groq", status: "ok", promptTokens: null, completionTokens: null },
      depsFor(insertDb({ capture: (row) => { withoutTokens = row; } })),
    );
    // Keine Messwerte heißt "unbekannt", nicht "kostenlos".
    expect(withoutTokens.costEur).toBeNull();
  });

  it("lässt einen Lauf nicht scheitern, wenn das Protokoll wirft", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = await metering.recordAgentExecution(
      { executionKey: "k5", userOpenId: "u5", provider: "groq", status: "ok" },
      depsFor(insertDb({ failWith: new Error("connection reset") })),
    );
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("readUsageAnalytics", () => {
  it("meldet ohne Datenbank available:false mit leerer Zusammenfassung", async () => {
    const result = await metering.readUsageAnalytics({ userOpenId: "u1", now: NOW }, depsFor(null));
    expect(result.available).toBe(false);
    expect(result.summary.runs).toBe(0);
    expect(result.summary.daily).toHaveLength(30);
  });

  it("begrenzt das Zeitfenster auf 1 bis 365 Tage", async () => {
    const tooSmall = await metering.readUsageAnalytics(
      { userOpenId: "u1", days: 0, now: NOW },
      depsFor(selectDb({ rows: [] })),
    );
    expect(tooSmall.summary.windowDays).toBe(1);

    const tooLarge = await metering.readUsageAnalytics(
      { userOpenId: "u1", days: 10_000, now: NOW },
      depsFor(selectDb({ rows: [] })),
    );
    expect(tooLarge.summary.windowDays).toBe(365);
  });

  it("liest höchstens 5000 Zeilen und wandelt DB-Typen in Berichtstypen", async () => {
    let limitSeen = 0;
    const rows = [
      {
        agentId: "agent-1",
        provider: "groq",
        model: "llama",
        status: "error",
        promptTokens: 1000,
        completionTokens: 500,
        costEur: "0.0012",
        durationMs: 800,
        createdAt: new Date(NOW - DAY),
      },
      {
        agentId: null,
        provider: "ollama",
        model: null,
        status: "irgendwas",
        promptTokens: 10,
        completionTokens: 10,
        costEur: null,
        durationMs: null,
        createdAt: new Date(NOW - DAY),
      },
    ];

    const result = await metering.readUsageAnalytics(
      { userOpenId: "u1", now: NOW, days: 7 },
      depsFor(selectDb({ rows, captureLimit: (n) => { limitSeen = n; } })),
    );

    expect(limitSeen).toBe(5000);
    expect(result.available).toBe(true);
    expect(result.summary.runs).toBe(2);
    expect(result.summary.errorRuns).toBe(1);
    // Unbekannte Statuswerte werden nicht als Fehler erfunden, sondern als ok geführt.
    expect(result.summary.okRuns).toBe(1);
    expect(result.summary.tokens.total).toBe(1520);
    // Numeric kommt als String aus Postgres: muss als Zahl in die Auswertung.
    expect(result.summary.costEur).toBeCloseTo(0.0012, 6);
    // Zeilen ohne agentId dürfen die Agenten-Rangliste nicht mit "null" füllen.
    expect(result.summary.byAgent).toHaveLength(1);
    expect(result.summary.byAgent[0].agentId).toBe("agent-1");
  });

  it("liefert bei Lesefehler keine erfundenen Kennzahlen", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await metering.readUsageAnalytics(
      { userOpenId: "u1", now: NOW, days: 7 },
      depsFor(selectDb({ failWith: new Error("statement timeout") })),
    );
    expect(result.available).toBe(false);
    expect(result.summary.runs).toBe(0);
    expect(result.summary.windowDays).toBe(7);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("gibt ohne Planpreis keinen geschätzten Nutzen aus", async () => {
    const result = await metering.readUsageAnalytics(
      { userOpenId: "u1", now: NOW, days: 30 },
      depsFor(selectDb({ rows: [] })),
    );
    expect(result.summary.roi.valueEurPerMonth).toBeNull();
    expect(result.summary.roi.costEurPerMonth).toBeNull();
  });
});
