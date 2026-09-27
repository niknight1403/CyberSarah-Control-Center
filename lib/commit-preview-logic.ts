/**
 * Sprint 291 — Diff-Vorschau vor jedem Dev-Agent-Commit im Chat sichtbar
 *
 * Reine, deterministische Logik zur Erstellung und Formatierung strukturierter
 * Commit-Diff-Vorschauen fuer den Dev-Agenten. Ermöglicht die transparente
 * Ansicht aller geänderten Dateien, Zeilenänderungen und Vorschau-Hunks
 * direkt im Chat vor der finalen Git-Commit-Ausfuehrung.
 */

import {
  FileDiffInput,
  getDetailedFileDiffPreview,
  DetailedFileDiffPreview,
} from "./file-diff-logic";

export type CommitPreviewOptions = {
  commitMessage: string;
  files: FileDiffInput[];
  maxFilesToPreview?: number;
  maxLinesPerPreview?: number;
  branchName?: string;
};

export type CommitPreview = {
  commitMessage: string;
  branchName: string;
  totalFilesCount: number;
  totalAddedLines: number;
  totalRemovedLines: number;
  filePreviews: DetailedFileDiffPreview[];
  readyToCommit: boolean;
  blockReason?: string;
};

/**
 * Baut eine strukturierte Commit-Vorschau aus einer Menge von Dateiänderungen.
 */
export function buildCommitPreview(options: CommitPreviewOptions): CommitPreview {
  const commitMessage = (options.commitMessage ?? "").trim();
  const branchName = (options.branchName ?? "main").trim();
  const maxFiles = options.maxFilesToPreview ?? 5;
  const maxLines = options.maxLinesPerPreview ?? 24;

  if (!commitMessage) {
    return {
      commitMessage: "",
      branchName,
      totalFilesCount: 0,
      totalAddedLines: 0,
      totalRemovedLines: 0,
      filePreviews: [],
      readyToCommit: false,
      blockReason: "Keine Commit-Message angegeben.",
    };
  }

  if (!options.files || options.files.length === 0) {
    return {
      commitMessage,
      branchName,
      totalFilesCount: 0,
      totalAddedLines: 0,
      totalRemovedLines: 0,
      filePreviews: [],
      readyToCommit: false,
      blockReason: "Keine geänderten Dateien zum Committen vorhanden.",
    };
  }

  const previews: DetailedFileDiffPreview[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  options.files.forEach((file) => {
    const detailed = getDetailedFileDiffPreview(file, maxLines);
    if (detailed) {
      totalAdded += detailed.addedLines;
      totalRemoved += detailed.removedLines;
      if (previews.length < maxFiles) {
        previews.push(detailed);
      }
    }
  });

  return {
    commitMessage,
    branchName,
    totalFilesCount: options.files.length,
    totalAddedLines: totalAdded,
    totalRemovedLines: totalRemoved,
    filePreviews: previews,
    readyToCommit: totalAdded + totalRemoved > 0,
    blockReason: totalAdded + totalRemoved === 0 ? "Keine Zeilenänderungen erkannt." : undefined,
  };
}

/**
 * Formatiert die Commit-Vorschau in sauberes, lesbares Chat-Markdown.
 */
export function formatCommitPreviewForChat(preview: CommitPreview): string {
  if (!preview.readyToCommit) {
    return `⚠️ **Commit-Vorschau blockiert**: ${preview.blockReason ?? "Aenderungen koennen nicht committet werden."}`;
  }

  const header = `🔍 **Commit-Vorschau** (${preview.branchName})`;
  const msgLine = `**Message:** \`${preview.commitMessage}\``;
  const statsLine = `**Statistik:** ${preview.totalFilesCount} Datei(en) | +${preview.totalAddedLines} / -${preview.totalRemovedLines} Zeilen`;

  const previewsMarkdown = preview.filePreviews.map((f) => {
    const fileHeader = `📄 **${f.path}** (+${f.addedLines} / -${f.removedLines})`;
    const linesMd = f.lines
      .map((l) => {
        const prefix = l.kind === "added" ? "+" : l.kind === "removed" ? "-" : " ";
        return `${prefix} ${l.content}`;
      })
      .join("\n");

    const truncatedNotice = f.truncated ? "\n  *(weitere Aenderungen gekuerzt)*" : "";
    return `${fileHeader}\n\`\`\`diff\n${linesMd}\n\`\`\`${truncatedNotice}`;
  });

  const hiddenFilesCount = preview.totalFilesCount - preview.filePreviews.length;
  const hiddenNotice = hiddenFilesCount > 0
    ? `\n*(+${hiddenFilesCount} weitere Datei(en) in der Vorschau ausgeblendet)*`
    : "";

  return [header, msgLine, statsLine, "", ...previewsMarkdown, hiddenNotice].join("\n").trim();
}
