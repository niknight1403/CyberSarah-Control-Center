export type FileDiffInput = { path: string; before: string; after: string };

export type FileDiffSummary = {
  path: string;
  addedLines: number;
  removedLines: number;
  changedLineCount: number;
};

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
