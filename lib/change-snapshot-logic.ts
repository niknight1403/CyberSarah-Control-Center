export type ChangeSnapshot = {
  id: string;
  targetPath: string;
  content: string;
  contentHash: string;
  createdAtMs: number;
  rolledBackAtMs: number | null;
};

/**
 * Erstellt einen unveränderlichen Snapshot des aktuellen Dateiinhalts vor der
 * Anwendung eines Vorschlags. Der Snapshot trägt einen stabilen FNV-1a-Hash,
 * damit der Rollback die Integrität vor der Wiederherstellung prüfen kann.
 */
export function createSnapshot(input: {
  id: string;
  targetPath: string;
  content: string;
  createdAtMs: number;
}): ChangeSnapshot {
  if (!input.targetPath) {
    throw new Error("Ein Snapshot benötigt einen Zieldateipfad.");
  }
  if (typeof input.content !== "string") {
    throw new Error("Ein Snapshot benötigt Zeichenfolgen-Inhalt.");
  }
  return {
    id: input.id,
    targetPath: input.targetPath,
    content: input.content,
    contentHash: hashContent(input.content),
    createdAtMs: input.createdAtMs,
    rolledBackAtMs: null,
  };
}

export type RollbackOutcome = {
  rolledBack: boolean;
  restoredContent: string | null;
  reason: string;
};

/**
 * Stellt den Inhalt eines Snapshots wieder her, wenn
 * 1. der Snapshot noch nicht zurückgerollt wurde (Einmal-Schutz),
 * 2. der Hash des gespeicherten Inhalts mit dem dokumentierten Hash
 *    übereinstimmt (Integrität), und
 * 3. der aktuelle Inhalt vom Snapshot-Inhalt abweicht, sonst ist kein
 *    Rollback erforderlich.
 * Manipulierte Snapshots werden grundsätzlich nicht angewendet.
 */
export function rollbackSnapshot(snapshot: ChangeSnapshot, currentContent: string | null, nowMs: number): RollbackOutcome {
  if (snapshot.rolledBackAtMs !== null) {
    return { rolledBack: false, restoredContent: null, reason: "Der Snapshot wurde bereits zurückgerollt." };
  }
  if (hashContent(snapshot.content) !== snapshot.contentHash) {
    return { rolledBack: false, restoredContent: null, reason: "Integritätsprüfung fehlgeschlagen. Rollback verweigert." };
  }
  if (currentContent === snapshot.content) {
    return { rolledBack: false, restoredContent: null, reason: "Kein Rollback erforderlich. Der Inhalt entspricht dem Snapshot." };
  }
  snapshot.rolledBackAtMs = nowMs;
  return {
    rolledBack: true,
    restoredContent: snapshot.content,
    reason: "Snapshot-Inhalt wurde nach erfolgreicher Integritätsprüfung wiederhergestellt.",
  };
}

/** Stabiler, deterministischer FNV-1a-Hash (32 Bit, hexadezimal). */
export function hashContent(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
