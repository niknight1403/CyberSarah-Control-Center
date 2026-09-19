import { describe, expect, it } from "vitest";

import {
  bestPracticesFor,
  BEST_PRACTICE_SNIPPET_MAX_CHARS,
  formatBestPracticesForContext,
  cosineSimilarity,
  createInMemoryVectorMemoryStore,
  deterministicLocalEmbedding,
  EMBEDDING_DIMENSIONS,
  l2Normalize,
  rankBySimilarity,
  type VectorMemoryRecord,
} from "../lib/vector-memory-logic";

/**
 * Sprint 161 — Vektor-Gedaechtnis-Logik: deterministische Basis fuer das
 * Langzeit-Gedächtnis (pgvector-faehiger Speicher-Vertrag + Kosinus-Ranking).
 */
describe("cosineSimilarity", () => {
  it("identische Vektoren -> 1, orthogonale -> 0", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("skaliert Richtung, nicht Laenge", () => {
    expect(cosineSimilarity([2, 4], [1, 2])).toBeCloseTo(1);
  });

  it("leere oder ungleich lange Vektoren -> 0 ohne Absturz", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
  });
});

describe("deterministicLocalEmbedding", () => {
  it("liefert fuer denselben Text identische Vektoren (Offline-Determinismus)", () => {
    const a = deterministicLocalEmbedding("TikTok Posting mit Comedy-Mashup erzielte hohe Conversion");
    const b = deterministicLocalEmbedding("TikTok Posting mit Comedy-Mashup erzielte hohe Conversion");
    expect(a).toEqual(b);
  });

  it("Dimension und L2-Norm stimmen (Pgvector-Konvention: Einheitsvektor)", () => {
    const vector = deterministicLocalEmbedding("Analytics: Retention gestiegen");
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("aehnliche Texte liegen naeher beieinander als unahnliche", () => {
    const base = deterministicLocalEmbedding("TikTok Comedy Posting Conversion hoch");
    const similar = deterministicLocalEmbedding("TikTok Comedy Posting Conversion stark");
    const different = deterministicLocalEmbedding("Datenbank-Migration Neon Postgres drizzle");
    expect(cosineSimilarity(base, similar)).toBeGreaterThan(cosineSimilarity(base, different));
  });

  it("leerer Text -> Nullvektor ohne Division durch Null", () => {
    const vector = deterministicLocalEmbedding("");
    expect(vector.every((value) => value === 0)).toBe(true);
    expect(cosineSimilarity(vector, vector)).toBe(0);
  });
});

describe("l2Normalize", () => {
  it("normalisiert und laesst Nullvektoren unberuehrt", () => {
    const normalized = l2Normalize([3, 4]);
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
    expect(l2Normalize([0, 0])).toEqual([0, 0]);
  });
});

function record(id: string, text: string): VectorMemoryRecord {
  return { id, text, vector: deterministicLocalEmbedding(text) };
}

describe("rankBySimilarity", () => {
  it("sortiert nach Score und begrenzt auf Top-K mit stabilem Tie-Break", () => {
    const queryVector = deterministicLocalEmbedding("Comedy Mashup auf TikTok erfolgreich");
    const records = [
      record("a", "Comedy Mashup auf TikTok erfolgreich"),
      record("b", "Comedy Mashup auf TikTok erfolgreich"),
      record("c", "Steuererklaerung einreichen"),
      record("d", "Comedy Mashup viral auf TikTok"),
    ];
    const ranked = rankBySimilarity(queryVector, records, 3);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
    expect(ranked[2].score).toBeGreaterThan(0);
  });
});

describe("In-Memory-Store & bestPracticesFor", () => {
  it("save/query-Runde durch den Speicher-Vertrag mit Metadaten", async () => {
    const store = createInMemoryVectorMemoryStore();
    await store.save({
      id: "post-1",
      text: "Comedy-Mashup-Abend: TikTok-Posting 18 Uhr brachte 12 % Conversion",
      vector: deterministicLocalEmbedding("Comedy-Mashup-Abend: TikTok-Posting 18 Uhr brachte 12 % Conversion"),
      metadata: { source: "tiktok", roi: 34 },
    });
    await store.save({
      id: "post-2",
      text: "Servermigration von Hetzner zu Render abgeschlossen",
      vector: deterministicLocalEmbedding("Servermigration von Hetzner zu Render abgeschlossen"),
    });

    const best = await bestPracticesFor("Wann poste ich TikTok-Content?", store, 2);
    expect(best).toHaveLength(2);
    expect(best[0].text).toContain("TikTok");
    expect(best[0].score).toBeGreaterThan(best[1].score);
    expect(best[0].metadata?.source).toBe("tiktok");
  });

  it("leerer Store liefert eine leere Trefferliste (kein Absturz)", async () => {
    const store = createInMemoryVectorMemoryStore();
    const best = await bestPracticesFor("irgendetwas", store);
    expect(best).toEqual([]);
  });
});

describe("formatBestPracticesForContext (Sprint 162 — Prompt-Injektion)", () => {
  it("formattiert Treffer als nummerierte, deduplizierte Snippet-Liste", () => {
    const formatted = formatBestPracticesForContext([
      { text: "TikTok-Comedy um 18 Uhr brachte 12 % Conversion", score: 0.9 },
      { text: "Server auf Render umstellen", score: 0.5 },
      { text: "TikTok-Comedy um 18 Uhr brachte 12 % Conversion", score: 0.4 },
    ]);
    expect(formatted).toContain("Historische Best-Practices");
    expect(formatted).toContain("1. TikTok-Comedy um 18 Uhr brachte 12 % Conversion");
    expect(formatted).toContain("2. Server auf Render umstellen");
    expect(formatted).not.toContain("3.");
  });

  it("kappt zu lange Snippets prompt-budget-sicher", () => {
    const long = "x".repeat(BEST_PRACTICE_SNIPPET_MAX_CHARS + 50);
    const formatted = formatBestPracticesForContext([{ text: long, score: 1 }]);
    const snippet = formatted.split("\n")[1] ?? "";
    expect(snippet.length).toBeLessThanOrEqual(BEST_PRACTICE_SNIPPET_MAX_CHARS + 3);
    expect(formatted).toContain("…");
  });

  it("leere oder ungültige Treffer liefern einen leeren String (Prompt unveraendert)", () => {
    expect(formatBestPracticesForContext([])).toBe("");
    expect(formatBestPracticesForContext([{ text: "   ", score: 1 }])).toBe("");
  });

  it("respektiert das Limit (Default 3)", () => {
    const hits = [1, 2, 3, 4, 5].map((n) => ({ text: `Erinnerung ${n}`, score: 0.9 - n * 0.01 }));
    const formatted = formatBestPracticesForContext(hits);
    expect((formatted.match(/^\d+\./gm) ?? []).length).toBe(3);
  });
});
