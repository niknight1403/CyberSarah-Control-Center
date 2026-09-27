/**
 * Sprint 285 — Multi-File-Refactoring-Werkzeug für den Dev-Agenten.
 *
 * Atomare Transaktionsverarbeitung und Rollback-Mechanismen für gleichzeitige
 * Änderungen an mehreren Dateien durch den Dev-Agenten. Pure, deterministische Logik.
 */

export type MultiFileAction = "write" | "delete";

export interface MultiFileOperation {
  path: string;
  action: MultiFileAction;
  content?: string;
}

export type TransactionStatus = "pending" | "committed" | "rolled_back" | "failed";

export interface FileBackup {
  path: string;
  originalContent: string | null;
}

export interface MultiFileTransaction {
  id: string;
  operations: MultiFileOperation[];
  status: TransactionStatus;
  backups: FileBackup[];
  createdMs: number;
  commitMessage?: string;
  rollbackOnError: boolean;
}

export function validateMultiFileOperations(operations: MultiFileOperation[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!Array.isArray(operations) || operations.length === 0) {
    return { valid: false, errors: ["Die Transaktion muss mindestens eine Operation enthalten."] };
  }

  const seenPaths = new Set<string>();

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    if (!op || typeof op !== "object") {
      errors.push(`Operation #${i + 1} ist kein gültiges Objekt.`);
      continue;
    }

    if (typeof op.path !== "string" || !op.path.trim()) {
      errors.push(`Operation #${i + 1}: Pfad fehlt oder ist leer.`);
    } else {
      const normalizedPath = op.path.trim().replace(/\\/g, "/");
      if (seenPaths.has(normalizedPath)) {
        errors.push(`Doppelter Pfad '${normalizedPath}' in derselben Transaktion.`);
      }
      seenPaths.add(normalizedPath);
    }

    if (op.action !== "write" && op.action !== "delete") {
      errors.push(`Operation #${i + 1}: Unbekannte Aktion '${op.action}'. Erlaubt: 'write', 'delete'.`);
    }

    if (op.action === "write") {
      if (typeof op.content !== "string") {
        errors.push(`Operation #${i + 1} (${op.path}): Inhalt ('content') muss bei Aktion 'write' als String angegeben werden.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createMultiFileTransaction(params: {
  operations: MultiFileOperation[];
  commitMessage?: string;
  rollbackOnError?: boolean;
  nowMs?: number;
}): MultiFileTransaction {
  const now = params.nowMs ?? Date.now();
  const id = `tx-${now.toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  return {
    id,
    operations: params.operations.map((op) => ({
      path: op.path.trim().replace(/\\/g, "/"),
      action: op.action,
      content: op.content,
    })),
    status: "pending",
    backups: [],
    createdMs: now,
    commitMessage: params.commitMessage?.trim() || undefined,
    rollbackOnError: params.rollbackOnError ?? true,
  };
}

export function prepareTransactionBackups(
  fileSystemState: Record<string, string | null>,
  operations: MultiFileOperation[]
): FileBackup[] {
  const backups: FileBackup[] = [];

  for (const op of operations) {
    const normalizedPath = op.path.trim().replace(/\\/g, "/");
    const originalContent = fileSystemState[normalizedPath] !== undefined ? fileSystemState[normalizedPath] : null;
    backups.push({
      path: normalizedPath,
      originalContent,
    });
  }

  return backups;
}

export function rollbackTransaction(
  fileSystemState: Record<string, string | null>,
  backups: FileBackup[]
): Record<string, string | null> {
  const newState = { ...fileSystemState };

  for (const backup of backups) {
    if (backup.originalContent === null) {
      delete newState[backup.path];
    } else {
      newState[backup.path] = backup.originalContent;
    }
  }

  return newState;
}

export function executeMultiFileTransaction(
  fileSystemState: Record<string, string | null>,
  transaction: MultiFileTransaction,
  executor?: (op: MultiFileOperation, state: Record<string, string | null>) => void
): {
  success: boolean;
  newState: Record<string, string | null>;
  updatedTransaction: MultiFileTransaction;
  appliedOps: number;
  error?: string;
} {
  const validation = validateMultiFileOperations(transaction.operations);
  if (!validation.valid) {
    return {
      success: false,
      newState: fileSystemState,
      updatedTransaction: { ...transaction, status: "failed" },
      appliedOps: 0,
      error: `Validierungsfehler: ${validation.errors.join("; ")}`,
    };
  }

  const backups = prepareTransactionBackups(fileSystemState, transaction.operations);
  let workingState = { ...fileSystemState };
  let appliedCount = 0;

  try {
    for (const op of transaction.operations) {
      if (executor) {
        executor(op, workingState);
      } else {
        const path = op.path;
        if (op.action === "write") {
          if (op.content === undefined) {
            throw new Error(`Fehlender Content bei write für ${path}`);
          }
          workingState[path] = op.content;
        } else if (op.action === "delete") {
          delete workingState[path];
        }
      }
      appliedCount++;
    }

    const updatedTx: MultiFileTransaction = {
      ...transaction,
      status: "committed",
      backups,
    };

    return {
      success: true,
      newState: workingState,
      updatedTransaction: updatedTx,
      appliedOps: appliedCount,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const finalState = transaction.rollbackOnError
      ? rollbackTransaction(workingState, backups)
      : workingState;

    const updatedTx: MultiFileTransaction = {
      ...transaction,
      status: transaction.rollbackOnError ? "rolled_back" : "failed",
      backups,
    };

    return {
      success: false,
      newState: finalState,
      updatedTransaction: updatedTx,
      appliedOps: appliedCount,
      error: `Transaktionsfehler (${errorMessage}). ${transaction.rollbackOnError ? "Rollback erfolgreich durchgeführt." : "Kein Rollback."}`,
    };
  }
}

export function formatTransactionReport(
  transaction: MultiFileTransaction,
  appliedOps: number,
  error?: string
): string {
  if (transaction.status === "committed") {
    return `Multi-File-Refactoring Transaktion ${transaction.id} erfolgreich angewendet (${appliedOps} Datei(en) geändert).`;
  }
  if (transaction.status === "rolled_back") {
    return `Multi-File-Refactoring Transaktion ${transaction.id} fehlgeschlagen (${error || "Unbekannter Fehler"}). Rollback aller ${transaction.backups.length} Datei(en) wiederhergestellt.`;
  }
  return `Multi-File-Refactoring Transaktion ${transaction.id} Status: ${transaction.status}. ${error || ""}`;
}
