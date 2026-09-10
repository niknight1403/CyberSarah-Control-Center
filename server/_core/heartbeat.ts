import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import {
  buildHeartbeatCreateBody,
  buildHeartbeatUpdateBody,
  mapHeartbeatStatus,
  stringifyHeartbeatPayload,
  validateHeartbeatCron,
  validateHeartbeatPath,
  type HeartbeatJob,
  type HeartbeatJobUpdate,
} from "../../lib/heartbeat-logic";

// Typen leben in lib/heartbeat-logic (pure, deterministisch getestet);
// Re-Export fuer bestehende Importe.
export type { HeartbeatJob, HeartbeatJobUpdate } from "../../lib/heartbeat-logic";

export type HeartbeatJobInfo = {
  taskUid: string;
  name: string;
  userId: string;
  description: string;
  cronExpression: string;
  callbackPath: string;
  callbackMethod: string;
  callbackPayload: string;
  isEnable: boolean;
  createdAt?: string | null;
  lastExecutedAt?: string | null;
  nextExecutionAt?: string | null;
};

const SERVICE = "webdevtoken.v1.WebDevService";

const buildEndpoint = (rpc: string): string => {
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service URL is not configured (BUILT_IN_FORGE_API_URL).",
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service API key is not configured (BUILT_IN_FORGE_API_KEY).",
    });
  }
  const baseUrl = ENV.forgeApiUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`${SERVICE}/${rpc}`, normalizedBase).toString();
};

const callForge = async <T>(
  rpc: string,
  body: Record<string, unknown>,
  userSession: string
): Promise<T> => {
  const endpoint = buildEndpoint(rpc);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${ENV.forgeApiKey}`,
    "content-type": "application/json",
    "connect-protocol-version": "1",
  };
  // userSession is the decoded `app_session_id` cookie value (NOT the raw
  // Cookie header). Empty string falls back to the project owner identity.
  if (userSession) {
    headers["x-manus-user-session"] = userSession;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Heartbeat ${rpc} network error: ${String(error)}`,
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw mapForgeError(response, detail, rpc);
  }
  return (await response.json()) as T;
};

const mapForgeError = (
  response: Response,
  detail: string,
  rpc: string
): TRPCError => {
  const status = response.status;
  return new TRPCError({
    code: mapHeartbeatStatus(status),
    message: `Heartbeat ${rpc} failed (${status})${detail ? `: ${detail}` : ""}`,
  });
};

/**
 * Create a new HTTP cron job. Returns the assigned `taskUid` to persist on
 * your business row so callbacks can dereference it.
 */
export async function createHeartbeatJob(
  job: HeartbeatJob,
  userSession: string
): Promise<{ taskUid: string; nextExecutionAt?: string | null }> {
  const pathCheck = validateHeartbeatPath(job.path);
  if (!pathCheck.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: pathCheck.reason });
  }
  const cronCheck = validateHeartbeatCron(job.cron);
  if (!cronCheck.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: cronCheck.reason });
  }
  return callForge<{ taskUid: string; nextExecutionAt?: string | null }>(
    "CreateHeartbeatJob",
    buildHeartbeatCreateBody(job),
    userSession
  );
}

/**
 * Update an existing cron located by `taskUid`. Only fields you pass in
 * `patch` are mutated. `enable` flips resume/pause; omit to leave alone.
 */
export async function updateHeartbeatJob(
  taskUid: string,
  patch: HeartbeatJobUpdate,
  userSession: string
): Promise<{ nextExecutionAt?: string | null }> {
  if (patch.path !== undefined) {
    const pathCheck = validateHeartbeatPath(patch.path);
    if (!pathCheck.ok) {
      throw new TRPCError({ code: "BAD_REQUEST", message: pathCheck.reason });
    }
  }
  if (patch.cron !== undefined) {
    const cronCheck = validateHeartbeatCron(patch.cron);
    if (!cronCheck.ok) {
      throw new TRPCError({ code: "BAD_REQUEST", message: cronCheck.reason });
    }
  }
  return callForge<{ nextExecutionAt?: string | null }>(
    "UpdateHeartbeatJob",
    buildHeartbeatUpdateBody(taskUid, patch),
    userSession
  );
}

/** Delete a cron located by `taskUid`. Idempotent on caller side. */
export async function deleteHeartbeatJob(
  taskUid: string,
  userSession: string
): Promise<void> {
  await callForge("DeleteHeartbeatJob", { taskUid }, userSession);
}

/**
 * List cron jobs owned by the resolved actor (end-user when `userSession`
 * is set, project owner otherwise) within the current project.
 *
 * `actorUserId` in the response echoes whose cron list you got back. End-users
 * cannot list other users' crons via this SDK; cross-user inspection is
 * owner-only via the sandbox CLI (`manus-heartbeat list --user-id <uid>`).
 */
export async function listHeartbeatJobs(
  userSession: string,
  pagination?: { page?: number; pageSize?: number }
): Promise<{ total: number; actorUserId: string; jobs: HeartbeatJobInfo[] }> {
  const body: Record<string, unknown> = {};
  if (pagination?.page !== undefined) body.page = pagination.page;
  if (pagination?.pageSize !== undefined) body.pageSize = pagination.pageSize;
  return callForge<{
    total: number;
    actorUserId: string;
    jobs: HeartbeatJobInfo[];
  }>("ListHeartbeatJobs", body, userSession);
}
