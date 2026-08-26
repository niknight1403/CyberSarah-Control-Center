export type FileDiffInput = { path: string; before: string; after: string };

export type FileDiffSummary = {
  path: string;
  addedLines: number;
  removedLines: number;
  changedLineCount: number;
};

export type DetailedDiffLine = { kind: "context" | "added" | "removed"; lineNumber: number; content: string };
export type DetailedFileDiffPreview = FileDiffSummary & { lines: DetailedDiffLine[]; truncated: boolean };

function toLines(content: string) {
  if (!content) return [];
  return content.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Counts line additions and removals using a memory-bounded LCS pass.
 * The result is a concise review signal, not a patch that can be auto-applied.
 */
export function getFileDiffSummary({ path, before, after }: FileDiffInput): FileDiffSummary {
  const beforeLines = toLines(before);
  const afterLines = toLines(after);
  let previous = new Array<number>(afterLines.length + 1).fill(0);

  for (let beforeIndex = 1; beforeIndex <= beforeLines.length; beforeIndex += 1) {
    const current = new Array<number>(afterLines.length + 1).fill(0);
    for (let afterIndex = 1; afterIndex <= afterLines.length; afterIndex += 1) {
      current[afterIndex] = beforeLines[beforeIndex - 1] === afterLines[afterIndex - 1]
        ? previous[afterIndex - 1] + 1
        : Math.max(previous[afterIndex], current[afterIndex - 1]);
    }
    previous = current;
  }

  const sharedLines = previous[afterLines.length];
  const addedLines = afterLines.length - sharedLines;
  const removedLines = beforeLines.length - sharedLines;
  return { path, addedLines, removedLines, changedLineCount: addedLines + removedLines };
}

export function getFileDiffSummaries(files: FileDiffInput[]) {
  return files.map(getFileDiffSummary).filter((summary) => summary.changedLineCount > 0);
}

/**
 * Produces a compact, bounded review hunk. It preserves unchanged lines around the modified block
 * without attempting to auto-apply a patch or allocate an unbounded diff matrix.
 */
export function getDetailedFileDiffPreview(input: FileDiffInput, maxChangedLines = 32): DetailedFileDiffPreview | null {
  const summary = getFileDiffSummary(input);
  if (!summary.changedLineCount) return null;
  const beforeLines = toLines(input.before);
  const afterLines = toLines(input.after);
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < beforeLines.length - prefix && suffix < afterLines.length - prefix && beforeLines[beforeLines.length - suffix - 1] === afterLines[afterLines.length - suffix - 1]) suffix += 1;
  const beforeChanged = beforeLines.slice(prefix, beforeLines.length - suffix);
  const afterChanged = afterLines.slice(prefix, afterLines.length - suffix);
  const changedLines = [...beforeChanged.map((content, index) => ({ kind: "removed" as const, lineNumber: prefix + index + 1, content })), ...afterChanged.map((content, index) => ({ kind: "added" as const, lineNumber: prefix + index + 1, content }))];
  const visibleChanged = changedLines.slice(0, Math.max(1, maxChangedLines));
  const contextBefore = prefix ? [{ kind: "context" as const, lineNumber: prefix, content: beforeLines[prefix - 1] }] : [];
  const contextAfter = suffix ? [{ kind: "context" as const, lineNumber: afterLines.length - suffix + 1, content: afterLines[afterLines.length - suffix] }] : [];
  return { ...summary, lines: [...contextBefore, ...visibleChanged, ...contextAfter], truncated: changedLines.length > visibleChanged.length };
}

export function getDetailedFileDiffPreviews(files: FileDiffInput[], maxFiles = 4, maxChangedLines = 32) {
  return files.slice(0, maxFiles).map((file) => getDetailedFileDiffPreview(file, maxChangedLines)).filter((preview): preview is DetailedFileDiffPreview => Boolean(preview));
}
