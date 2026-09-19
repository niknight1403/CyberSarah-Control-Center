/**
 * Vektor-Gedaechtnis-Store-Adapter (Sprint 162) — bindet den reinen
 * VectorMemoryStore-Vertrag aus lib/vector-memory-logic.ts an die
 * persistente Tabelle agentMemoryVectors (Drizzle/Neon).
 *
 * Speicherstrategie: Vektoren liegen als normalisiertes jsonb-Array pro
 * Nutzer vor (laeuft ohne Erweiterung auf jedem Postgres). Das Ranking
 * passiert anwendungsseitig ueber rankBySimilarity (dieselbe Kosinus-
 * Mathematik, die Pgvector als <=> anbietet) — sobald der Owner die
 * pgvector-Erweiterung aktiviert, kann die query()-Methode auf SQL-
 * seitiges Ranking umgestellt werden, ohne den Vertrag zu aendern.
 *
 * Alle Methoden sind Best-Effort mit ehrlichem Fehlerzustand: Ohne
 * DATABASE_URL liefert query() eine leere Trefferliste und save()
 * protokolliert einen Hinweis — der Chat bleibt voll funktionsfaehig.
 */

import {
  bestPracticesFor,
  deterministicLocalEmbedding,
  rankBySimilarity,
  type VectorMemoryRecord,
  type VectorMemoryStore,
} from "../lib/vector-memory-logic";
import { insertAgentMemoryVectorRecord, listRecentAgentMemoryVectors } from "./db";

export const VECTOR_MEMORY_QUERY_CANDIDATES = 200;

/** Persistenter Store fuer genau einen Nutzer (Zeilen-Level-Scope). */
export function createDbVectorMemoryStore(userOpenId: string): VectorMemoryStore {
  return {
    async save(record: VectorMemoryRecord): Promise<void> {
      try {
        await insertAgentMemoryVectorRecord({
          userOpenId,
          source: typeof record.metadata?.source === "string" ? String(record.metadata.source) : "agentLearning",
          refId: typeof record.metadata?.refId === "string" ? String(record.metadata.refId) : null,
          text: record.text,
          vector: record.vector,
          metadata: record.metadata ?? null,
        });
      } catch (error) {
        console.warn(
          "[vectorMemory] Erinnerung nicht persistiert (Best-Effort):",
          error instanceof Error ? error.message.slice(0, 120) : error
        );
      }
    },

    async query(vector: number[], topK: number): Promise<VectorMemoryRecord[]> {
      try {
        const rows = await listRecentAgentMemoryVectors(userOpenId, VECTOR_MEMORY_QUERY_CANDIDATES);
        const records: VectorMemoryRecord[] = rows.map((row) => ({
          id: String(row.id),
          text: row.text,
          vector: Array.isArray(row.vector) ? (row.vector as number[]) : [],
          metadata: {
            ...(row.metadata as Record<string, unknown> | null),
            source: row.source,
            refId: row.refId,
          },
        }));
        // Kosinus-Ranking anwendungsseitig (pgvector <=>-aequivalent).
        return rankBySimilarity(vector, records, topK).map(({ score: _score, ...record }) => record);
      } catch (error) {
        console.warn(
          "[vectorMemory] Erinnerungen nicht geladen (Best-Effort):",
          error instanceof Error ? error.message.slice(0, 120) : error
        );
        return [];
      }
    },
  };
}

/**
 * Sprint 162 — Best-Practices-Abfrage fuer Agenten vor neuen Aktionen
 * (V4.0): konvenienz-Wrapper, der einbettet, im Nutzer-Store sucht und
 * die Top-Treffer mit Score zurueckliefert. Bei DB-Problemen leer.
 */
export async function queryUserBestPractices(
  userOpenId: string,
  queryText: string,
  topK = 3
): Promise<{ text: string; score: number; metadata?: Record<string, unknown> }[]> {
  const store = createDbVectorMemoryStore(userOpenId);
  return bestPracticesFor(queryText, store, topK);
}

/**
 * Sprint 162 — Learning als Vektor-Erinnerung persistieren (Best-Effort,
 * nie blockierend). Text-Zusammensetzung bewusst titelstark, damit die
 * Einbettung thematisch scharf bleibt.
 */
export async function persistLearningVector(
  userOpenId: string,
  learning: { title: string; detail: string; kind?: string },
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const text = `${learning.title} — ${learning.detail}`;
  await createDbVectorMemoryStore(userOpenId).save({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    vector: deterministicLocalEmbedding(text),
    metadata: { ...metadata, source: metadata.source ?? "agentLearning" },
  });
}
