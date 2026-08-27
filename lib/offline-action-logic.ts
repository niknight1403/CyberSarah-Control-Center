export type OfflineActionStatus = "queued" | "retrying" | "failed" | "completed";

export type OfflineAction = {
  id: string;
  repositoryId: string;
  kind: "commit" | "push" | "pull-request";
  summary: string;
  createdAt: string;
  attempts: number;
  status: OfflineActionStatus;
  hasConflictRisk: boolean;
};

export function enqueueOfflineAction(input: Omit<OfflineAction, "attempts" | "status">): OfflineAction {
  return { ...input, attempts: 0, status: "queued" };
}

export function markOfflineActionRetry(action: OfflineAction, hasConflictRisk: boolean): OfflineAction {
  if (action.status === "completed") return action;
  return { ...action, attempts: action.attempts + 1, status: "retrying", hasConflictRisk };
}

export function markOfflineActionFailed(action: OfflineAction): OfflineAction {
  if (action.status === "completed") return action;
  return { ...action, status: "failed" };
}

export function getNextOfflineAction(actions: OfflineAction[], repositoryId: string): OfflineAction | undefined {
  return actions.find((action) => action.repositoryId === repositoryId && ["queued", "retrying"].includes(action.status));
}

export function canApplyOfflineAction(action: OfflineAction, isOnline: boolean) {
  return isOnline && action.status !== "completed" && !action.hasConflictRisk;
}
