/**
 * Vektor-Gedaechtnis-Logik (Sprint 161) — rein und testbar.
 *
 * Aehnlichkeitsbasierte Retrieval-Grundlage fuer das Langzeit-Gedaechtnis der
 * Agenten: Historische Postings, Analytics-Eintraege und Conversion-Erfolge
 * werden als Vektoren gespeichert und vor neuen Aktionen als
 * Best-Practice-Kontext abgefragt (V4.0: "Agenten fragen vor neuen Aktionen
 * historische Best-Practices ab").
 *
 * Architektur:
 *  - cosineSimilarity: reine Mathematik, identisch in Postgres `pgvector`
 *    (`<=>`-Operator) und im Sandbox-Store auswertbar.
 *  - deterministicLocalEmbedding: deterministische Hash-N-Gramm-
 *    Einbettung als Offline-Fallback, solange kein Embedding-Provider
 *    (z. B. Gemini/OpenAI) konfiguriert ist. Produktion kann spaeter einen
 *    echten Embedding-Provider einspeisen — die Ranking-Logik bleibt gleich.
 *  - VectorMemoryStore: injizierbarer Speicher-Adapter. createInMemoryVector-
 *    MemoryStore() fuer Tests/Sandbox; server-seitig kann derselbe Vertrag
 *    gegen Neon-Pgvector (Drizzle, `vector(256)`-Spalte) implementiert werden.
 */

export interface VectorMemoryRecord {
  id: string;
  /** Rohtext der Erinnerung (Postings, Analytics, Conversion-Notizen). */
  text: string;
  /** Einbettungsvektor (Laenge = EMBEDDING_DIMENSIONS). */
  vector: number[];
  /** Frei verwendbare Metadaten (Quelle, Kategorie, ROI, Zeitraum, ...). */
  metadata?: Record<string, unknown>;
}

/** Speicher-Vertrag: Tests/Sandbox In-Memory, Produktion Pgvector-Adapter. */
export interface VectorMemoryStore {
  save(record: VectorMemoryRecord): Promise<void>;
  query(vector: number[], topK: number): Promise<VectorMemoryRecord[]>;
}

/** Dimension der deterministischen Fallback-Einbettung. */
export const EMBEDDING_DIMENSIONS = 256;

/** Kosinus-Aehnlichkeit zweier Vektoren (0..1-Bereich bei positiven Vektoren). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministische lokale Einbettung: Zeichen-Trigramm-Hashing in einen
 * normalisierten EMBEDDING_DIMENSIONS-Vektor. Ohne externen Provider
 * reproduzierbar (gleicher Text -> identischer Vektor), sprachunabhaengig und
 * offline faehig — bewusst als Fallback dokumentiert, nicht als semantische
 * Ersetzung eines Embedding-Modells.
 */
export function deterministicLocalEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const normalized = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return vector;

  for (let i = 0; i < normalized.length - 2; i += 1) {
    const trigram = normalized.slice(i, i + 3);
    const slot = hashToSlot(trigram);
    vector[slot] += 1;
  }

  return l2Normalize(vector);
}

/** L2-Normalisierung (Pgvector-Konvention: Einheitsvektoren). */
export function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector.slice();
  return vector.map((value) => value / norm);
}

/** FNV-1a-aehnlicher String-Hash auf einen Slot-Bereich. */
function hashToSlot(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % EMBEDDING_DIMENSIONS;
}

/**
 * Rankt Erinnerungen nach Aehnlichkeit zur Abfrage und liefert die Top-K
 * Treffer mit Score (fuer Prompt-Injektion als Best-Practice-Kontext).
 */
export function rankBySimilarity(
  queryVector: number[],
  records: VectorMemoryRecord[],
  topK: number = 3
): (VectorMemoryRecord & { score: number })[] {
  return records
    .map((record) => ({ ...record, score: cosineSimilarity(queryVector, record.vector) }))
    .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id))
    .slice(0, Math.max(0, topK));
}

/**
 * Best-Practice-Abfrage fuer Agenten vor neuen Aktionen: Einbetten der
 * Frage, Aehnlichkeitssuche im Store, Rueckgabe der Top-Treffer-Texte.
 */
export async function bestPracticesFor(
  queryText: string,
  store: VectorMemoryStore,
  topK: number = 3
): Promise<{ text: string; score: number; metadata?: Record<string, unknown> }[]> {
  const queryVector = deterministicLocalEmbedding(queryText);
  const hits = await store.query(queryVector, topK);
  return hits.map((hit) => ({ text: hit.text, score: cosineSimilarity(queryVector, hit.vector), metadata: hit.metadata }));
}

/** In-Memory-Implementierung des Speicher-Vertrags (Tests, Sandbox, Fallback). */
export function createInMemoryVectorMemoryStore(): VectorMemoryStore & {
  all(): VectorMemoryRecord[];
} {
  const records = new Map<string, VectorMemoryRecord>();
  return {
    async save(record: VectorMemoryRecord): Promise<void> {
      records.set(record.id, record);
    },
    async query(vector: number[], topK: number): Promise<VectorMemoryRecord[]> {
      const all = [...records.values()];
      return rankBySimilarity(vector, all, topK).map(({ score: _score, ...record }) => record);
    },
    all(): VectorMemoryRecord[] {
      return [...records.values()];
    },
  };
}
