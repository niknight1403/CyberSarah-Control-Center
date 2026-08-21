export type ProposalFileChange = { path: string; content: string };
export type WorkspaceFileSnapshotSource = { id: string; path: string; content: string };
export type ProposalFileSnapshot = { id: string; path: string; content: string };

export function getSelectedProposalChanges(changes: ProposalFileChange[], selectedPaths: string[]) {
  const selected = new Set(selectedPaths);
  return changes.filter((change) => selected.has(change.path));
}

export function captureProposalSnapshots(files: WorkspaceFileSnapshotSource[], changes: ProposalFileChange[]): ProposalFileSnapshot[] {
  const affectedPaths = new Set(changes.map((change) => change.path));
  return files.filter((file) => affectedPaths.has(file.path)).map(({ id, path, content }) => ({ id, path, content }));
}
