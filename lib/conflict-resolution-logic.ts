export type ConflictKind =
  | "identical"
  | "local-only"
  | "remote-only"
  | "both-changed-same"
  | "both-changed-different";

export type ConflictResolution = "keep-local" | "keep-remote" | "needs-manual";

export type SyncFileState = {
  path: string;
  localHash: string | null;
  remoteHash: string | null;
  baseHash: string | null;
};

export type ConflictAssessment = {
  path: string;
  kind: ConflictKind;
  resolution: ConflictResolution;
  safeAutoResolve: boolean;
  reason: string;
};

/**
 * Klassifiziert den Abgleich einer Datei zwischen lokalem Workspace und
 * Remote-Repository anhand stabiler Inhalts-Hashes. Nur Konstellationen mit
 * einem eindeutig sicheren Ergebnis (identisch, oder eine Seite hat sich
 * gegenüber der Basis nicht geändert) werden automatisch aufgelöst. Alle
 * echten beidseitigen Änderungen erfordern eine manuelle Entscheidung.
 */
export function assessConflict(file: SyncFileState): ConflictAssessment {
  const { path, localHash, remoteHash, baseHash } = file;

  if (localHash === remoteHash) {
    return {
      path,
      kind: "identical",
      resolution: "keep-local",
      safeAutoResolve: true,
      reason: "Lokaler und entfernter Inhalt stimmen überein.",
    };
  }

  if (remoteHash === null) {
    return {
      path,
      kind: "local-only",
      resolution: "keep-local",
      safeAutoResolve: true,
      reason: "Die Datei existiert nur lokal und kann sicher übertragen werden.",
    };
  }

  if (localHash === null) {
    return {
      path,
      kind: "remote-only",
      resolution: "keep-remote",
      safeAutoResolve: true,
      reason: "Die Datei existiert nur remote und kann sicher übernommen werden.",
    };
  }

  if (localHash === baseHash && remoteHash !== baseHash) {
    return {
      path,
      kind: "remote-only",
      resolution: "keep-remote",
      safeAutoResolve: true,
      reason: "Nur remote wurde geändert; die Remote-Änderung kann sicher übernommen werden.",
    };
  }

  if (remoteHash === baseHash && localHash !== baseHash) {
    return {
      path,
      kind: "local-only",
      resolution: "keep-local",
      safeAutoResolve: true,
      reason: "Nur lokal wurde geändert; die lokale Änderung kann sicher übertragen werden.",
    };
  }

  if (localHash === remoteHash) {
    return {
      path,
      kind: "both-changed-same",
      resolution: "keep-local",
      safeAutoResolve: true,
      reason: "Beide Seiten haben unabhängig denselben Inhalt erzeugt.",
    };
  }

  return {
    path,
    kind: "both-changed-different",
    resolution: "needs-manual",
    safeAutoResolve: false,
    reason: "Lokal und remote wurden unterschiedlich geändert und müssen manuell entschieden werden.",
  };
}

export type SyncPlan = {
  assessments: ConflictAssessment[];
  autoResolvableCount: number;
  manualCount: number;
  blocked: boolean;
};

/**
 * Erstellt einen vollständigen Synchronisationsplan für eine Dateimenge.
 * Der Plan ist blockiert, solange mindestens eine Datei manuell entschieden
 * werden muss.
 */
export function planSync(files: SyncFileState[]): SyncPlan {
  const assessments = files.map(assessConflict);
  const manualCount = assessments.filter((assessment) => !assessment.safeAutoResolve).length;
  return {
    assessments,
    autoResolvableCount: assessments.length - manualCount,
    manualCount,
    blocked: manualCount > 0,
  };
}
