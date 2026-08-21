export type WorkspaceSyncState = { offlineDraftCount: number; hasConflictRisk: boolean };

export function getWorkspaceSyncState(changedFileCount: number, remoteAhead: boolean): WorkspaceSyncState {
  return { offlineDraftCount: Math.max(0, changedFileCount), hasConflictRisk: changedFileCount > 0 && remoteAhead };
}
