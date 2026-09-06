import {
  createSnapshot,
  hashContent,
  rollbackSnapshot,
  type ChangeSnapshot,
} from "./change-snapshot-logic";

export type { ChangeSnapshot };

export type SnapshotFileSource = { id: string; path: string; content: string };
export type ProposalFileChange = { path: string; content: string };

/**
 * Sprint 46: Erzeugt vor jeder Anwendung eines Vorschlags automatisch
 * unveränderliche, hash-gesicherte Snapshots der betroffenen Dateien. Die
 * Snapshot-Erstellung und Integritätssicherung stammt unverändert aus der
 * geprüften Sprint-36-Logik (`createSnapshot`).
 */
export function buildProposalSnapshots(files: SnapshotFileSource[], changes: ProposalFileChange[], nowMs: number): ChangeSnapshot[] {
  if (!Array.isArray(files)) throw new Error("Dateien müssen ein Array sein.");
  if (!Array.isArray(changes)) throw new Error("Änderungen müssen ein Array sein.");
  if (!Number.isFinite(nowMs)) throw new Error("Der Referenzzeitpunkt muss eine endliche Zahl sein.");
  const affectedPaths = new Set(changes.map((change) => change.path));
  return files
    .filter((file) => affectedPaths.has(file.path))
    .map((file) =>
      createSnapshot({
        id: file.id,
        targetPath: file.path,
        content: file.content,
        createdAtMs: nowMs,
      }),
    );
}

export type SnapshotRestoreEntry = { id: string; path: string; content: string };
export type SnapshotSkipEntry = { id: string; path: string; reason: string };

export type SnapshotRestoreOutcome = {
  restored: SnapshotRestoreEntry[];
  skipped: SnapshotSkipEntry[];
  rolledBackCount: number;
  summaryText: string;
};

/**
 * Stellt ausschließlich verifizierte Snapshot-Inhalte wieder her. Jeder
 * Snapshot läuft durch die geprüfte Sprint-36-Logik (`rollbackSnapshot`):
 * bereits zurückgerollte Snapshots sind nur einmal wiederherstellbar,
 * manipulierte Inhalte werden grundsätzlich verweigert, und unveränderte
 * Inhalte benötigen keinen Rollback. Verweigerte Snapshots werden mit ihrer
 * begründeten reason übersprungen — niemals mit ihrem Inhalt.
 */
export function restoreProposalSnapshots(
  snapshots: ChangeSnapshot[],
  currentContentsByPath: Record<string, string | null>,
  nowMs: number,
): SnapshotRestoreOutcome {
  if (!Array.isArray(snapshots)) throw new Error("Snapshots müssen ein Array sein.");
  if (!currentContentsByPath || typeof currentContentsByPath !== "object") {
    throw new Error("Die aktuellen Inhalte müssen je Pfad übergeben werden.");
  }
  if (!Number.isFinite(nowMs)) throw new Error("Der Referenzzeitpunkt muss eine endliche Zahl sein.");

  const restored: SnapshotRestoreEntry[] = [];
  const skipped: SnapshotSkipEntry[] = [];

  for (const snapshot of snapshots) {
    const currentContent = Object.prototype.hasOwnProperty.call(currentContentsByPath, snapshot.targetPath)
      ? currentContentsByPath[snapshot.targetPath]
      : null;
    const outcome = rollbackSnapshot(snapshot, currentContent, nowMs);
    if (outcome.rolledBack && outcome.restoredContent !== null) {
      restored.push({ id: snapshot.id, path: snapshot.targetPath, content: outcome.restoredContent });
    } else {
      skipped.push({ id: snapshot.id, path: snapshot.targetPath, reason: outcome.reason });
    }
  }

  const summaryParts = [
    `${restored.length} Datei(en) wiederhergestellt`,
  ];
  if (skipped.length) summaryParts.push(`${skipped.length} übersprungen`);

  return {
    restored,
    skipped,
    rolledBackCount: restored.length,
    summaryText: summaryParts.join(" · "),
  };
}

/**
 * Prüft die Integrität eines Snapshots ohne ihn zurückzurollen — Grundlage
 * für die Anzeige des Verifizierungszustands.
 */
export function verifyProposalSnapshot(snapshot: ChangeSnapshot): boolean {
  return hashContent(snapshot.content) === snapshot.contentHash;
}
