import { describe, expect, it } from "vitest";

/**
 * Sprint 11: Die Draft-Engine darf die Oberflaeche nie minutenlang haengen
 * lassen. Diese Tests belegen das Zeitbudget mit einer nachgebildeten DB
 * (kein echter Postgres, kein Netzwerk, kein LLM-Aufruf nach aussen).
 */

type DbLike = {
  select: () => unknown;
  insert: () => { values: (row: unknown) => Promise<unknown> };
};

function selectChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => rows,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const fakeDb: DbLike = {
  select: () => selectChain([]),
  insert: () => ({ values: async () => ({}) }),
};

const engineDb = fakeDb as unknown as Parameters<typeof draftEngine.runDraftEngine>[0] extends infer T
  ? T extends { db?: infer D } ? D : never
  : never;

const draftEngine = await import("../server/draft-engine");

const slowLlm = (delayMs: number) => async () => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return JSON.stringify({
    personaId: "nova", platform: "x", topic: "Zeitbudget",
    content: "Ein ehrlicher Testtext fuer das Zeitbudget der Draft-Engine.",
    hub: "hara", name: "Test", hypothesis: "Testhypothese fuer das Budget.",
    stages: ["a", "b", "c"], experiment: "Ein konkreter Test mit Messung.",
    metric: "Conversion", unit: "Prozent", targetValue: 5, currentValue: 0,
    note: "Eine Idee.", rationale: "Weil sie jetzt hilft.",
  });
};

describe("Sprint 11: Zeitbudget der Draft-Engine", () => {
  // Kein Modul-Mocking: die Engine bekommt ihre DB explizit. Das laeuft
  // lokal und in der CI identisch, ohne echten Postgres.
  const db = () => (fakeDb as unknown as NonNullable<Parameters<typeof draftEngine.runDraftEngine>[0]>["db"]);

  it("bricht am Zeitbudget ab und liefert einen ehrlichen Teilbericht", async () => {
    // Deterministische Uhr statt echter Wartezeit: jede Abfrage springt
    // 500 ms weiter. Nach drei Abfragen ist das 1,2-s-Budget sicher erreicht —
    // unabhaengig davon, wie schnell der CI-Rechner gerade ist.
    let ticks = 0;
    const base = Date.UTC(2026, 10, 11, 7, 0, 0);
    const result = await draftEngine.runDraftEngine({
      llm: slowLlm(0), budgetMs: 1_200, now: () => base + (++ticks) * 500, db: db(),
    });

    expect(result.truncated).toBe(true);
    expect(result.skipped.some((entry) => entry.reason.includes("Zeitbudget"))).toBe(true);
    expect(typeof result.elapsedMs).toBe("number");
    expect(result.elapsedMs).toBeGreaterThan(0);
  });

  it("meldet ohne Datenbank ehrlich ab, statt Entwuerfe zu erfinden", async () => {
    const result = await draftEngine.runDraftEngine({ llm: slowLlm(1), budgetMs: 5_000, db: null });
    expect(result.generated).toEqual({});
    expect(result.truncated).toBe(false);
    expect(result.skipped.some((entry) => entry.reason.includes("Datenbank nicht konfiguriert"))).toBe(true);
  });

  it("nennt die Budgets fuer Cron und interaktiven Lauf", () => {
    expect(draftEngine.DRAFT_ENGINE_DEFAULT_BUDGET_MS).toBe(90_000);
    expect(draftEngine.DRAFT_ENGINE_RUN_NOW_BUDGET_MS).toBe(25_000);
    expect(draftEngine.DRAFT_ENGINE_RUN_NOW_BUDGET_MS).toBeLessThan(draftEngine.DRAFT_ENGINE_DEFAULT_BUDGET_MS);
  });

  it("behandelt LLM-Fehler als uebersprungene Art, nicht als Absturz", async () => {
    const failing = async () => {
      throw new Error("LLM HTTP 429 rate limit");
    };
    const result = await draftEngine.runDraftEngine({ llm: failing, budgetMs: 5_000, db: db() });
    expect(result.truncated).toBe(false);
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.skipped[0]!.reason).toContain("429");
  });
});
