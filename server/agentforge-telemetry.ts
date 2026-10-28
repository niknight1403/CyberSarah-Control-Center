import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";

const EVENT_TYPES = new Set(["task.created", "task.updated", "agent.step.started", "agent.failed", "tool.executed", "checkpoint.saved", "llm.completed", "llm.failed"]);
const SAFE_KEYS = new Set(["villaId", "taskId", "agentId", "status", "tool", "blocked", "code", "durationMs", "latencyMs", "tokensUsed", "costUsd", "provider", "model", "route", "checkpointId", "step", "processed", "open", "verification"]);
const FORBIDDEN = /thought|reasoning|prompt|secret|token|password|credential|authorization|content|arguments|answer/i;
type SafeEvent = { id: string; type: string; at: number; metadata: Record<string, string | number | boolean> };

export function normalizeAgentforgeEvent(input: unknown): SafeEvent | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.id !== "string" || value.id.length < 8 || value.id.length > 120 || !EVENT_TYPES.has(String(value.type))) return null;
  const at = Number(value.at);
  if (!Number.isSafeInteger(at) || at < 1) return null;
  const metadata: SafeEvent["metadata"] = {};
  for (const key of SAFE_KEYS) {
    const field = value[key];
    if (field == null) continue;
    if (typeof field === "string") metadata[key] = field.slice(0, 160);
    else if (typeof field === "boolean") metadata[key] = field;
    else if (typeof field === "number" && Number.isFinite(field)) metadata[key] = field;
  }
  return { id: value.id, type: String(value.type), at, metadata };
}

function normalizeCheckpoint(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const taskId = String(body.taskId ?? "");
  const agentId = String(body.agentId ?? "");
  const sequence = Number(body.sequence);
  const checkpointId = String(body.checkpointId ?? "");
  const parentId = body.parentId == null ? null : String(body.parentId);
  if (!/^\d{1,20}$/.test(taskId) || !/^\d{1,20}$/.test(agentId) || !Number.isSafeInteger(sequence) || sequence < 1 || !/^[a-f0-9]{64}$/.test(checkpointId) || (parentId !== null && !/^[a-f0-9]{64}$/.test(parentId))) return null;
  const state = normalizeSafeState(body.state);
  if (!state) return null;
  const stateJson = JSON.stringify(state);
  if (Buffer.byteLength(stateJson) > 65536) return null;
  const expected = createHash("sha256").update(`${taskId}\0${agentId}\0${sequence}\0${parentId ?? ""}\0${stateJson}`).digest("hex");
  const actualBytes = Buffer.from(checkpointId, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  return { checkpointId, taskId, agentId, sequence, parentId, state };
}

function normalizeSafeState(input: unknown, depth = 0): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input) || depth > 16) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (FORBIDDEN.test(key)) return null;
    if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) out[key] = value;
    else if (Array.isArray(value)) {
      if (value.length > 500 || value.some((entry) => !(entry === null || ["string", "number", "boolean"].includes(typeof entry)))) return null;
      out[key] = value;
    } else if (typeof value === "object") {
      const nested = normalizeSafeState(value, depth + 1);
      if (!nested) return null;
      out[key] = nested;
    } else return null;
  }
  return out;
}

export function verifyAgentforgeCheckpoint(input: unknown) {
  return normalizeCheckpoint(input);
}

function hasValidServiceToken(req: Request): boolean {
  const configured = process.env.AGENTFORGE_TELEMETRY_TOKEN ?? "";
  const supplied = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : "";
  if (!configured || !supplied) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clients = new Set<{ res: Response; pending: Array<{ id: number; event: string; data: unknown }>; ready: boolean; lastId: number }>();
const writeSse = (res: Response, event: { id: number; event: string; data: unknown }) => {
  res.write(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
};

export function registerAgentforgeTelemetryRoutes(app: Express) {
  app.post("/api/agentforge/events", async (req, res) => {
    if (!hasValidServiceToken(req)) { res.status(process.env.AGENTFORGE_TELEMETRY_TOKEN ? 401 : 503).json({ error: "telemetry_auth_failed" }); return; }
    const event = normalizeAgentforgeEvent(req.body);
    if (!event) { res.status(400).json({ error: "invalid_event" }); return; }
    const db = await getDb();
    if (!db) { res.status(503).json({ error: "database_unavailable" }); return; }
    try {
      const row = await db.transaction(async (tx) => {
        const inserted = await tx.execute(sql`INSERT INTO agentforge_events (event_id, event_type, occurred_at, metadata)
          VALUES (${event.id}, ${event.type}, to_timestamp(${event.at} / 1000.0), ${JSON.stringify(event.metadata)}::jsonb)
          ON CONFLICT (event_id) DO NOTHING RETURNING id`);
        const insertedRow = (inserted as unknown as { rows?: Array<{ id: number }> }).rows?.[0];
        if (!insertedRow) return null;
        const taskId = event.metadata.taskId;
        if (taskId != null) {
          const state = String(event.metadata.status ?? (event.type === "agent.failed" ? "FAILED" : event.type === "agent.step.started" ? "RUNNING" : "UPDATED")).slice(0, 32);
          const errorCode = event.type === "agent.failed" ? String(event.metadata.code ?? "AGENT_FAILED").slice(0, 80) : null;
          await tx.execute(sql`INSERT INTO agentforge_task_states (task_id, state, agent_id, last_event_id, error_code)
            VALUES (${String(taskId)}, ${state}, ${event.metadata.agentId == null ? null : String(event.metadata.agentId)}, ${event.id}, ${errorCode})
            ON CONFLICT (task_id) DO UPDATE SET state = EXCLUDED.state, agent_id = COALESCE(EXCLUDED.agent_id, agentforge_task_states.agent_id), last_event_id = EXCLUDED.last_event_id, error_code = EXCLUDED.error_code, updated_at = now()`);
        }
        return { id: Number(insertedRow.id), event };
      });
      if (!row) { res.status(200).json({ ok: true, duplicate: true }); return; }
      const outgoing = { id: row.id, event: row.event.type, data: row.event };
      for (const client of clients) {
        if (!client.ready) client.pending.push(outgoing);
        else if (outgoing.id > client.lastId) { writeSse(client.res, outgoing); client.lastId = outgoing.id; }
      }
      res.status(202).json({ ok: true, id: row.id });
    } catch (error) {
      console.warn("[AgentforgeTelemetry] event persistence failed:", error instanceof Error ? error.message : "unknown");
      res.status(500).json({ error: "telemetry_persistence_failed" });
    }
  });

  app.post("/api/agentforge/checkpoints", async (req, res) => {
    if (!hasValidServiceToken(req)) { res.status(process.env.AGENTFORGE_TELEMETRY_TOKEN ? 401 : 503).json({ error: "telemetry_auth_failed" }); return; }
    const checkpoint = verifyAgentforgeCheckpoint(req.body);
    if (!checkpoint) { res.status(400).json({ error: "invalid_checkpoint" }); return; }
    const db = await getDb();
    if (!db) { res.status(503).json({ error: "database_unavailable" }); return; }
    try {
      await db.execute(sql`INSERT INTO agentforge_checkpoints (checkpoint_id, task_id, agent_id, sequence, parent_id, state)
        VALUES (${checkpoint.checkpointId}, ${checkpoint.taskId}, ${checkpoint.agentId}, ${checkpoint.sequence}, ${checkpoint.parentId}, ${JSON.stringify(checkpoint.state)}::jsonb)
        ON CONFLICT (checkpoint_id) DO NOTHING`);
      res.status(202).json({ ok: true, checkpointId: checkpoint.checkpointId });
    } catch (error) {
      console.warn("[AgentforgeTelemetry] checkpoint persistence failed:", error instanceof Error ? error.message : "unknown");
      res.status(500).json({ error: "checkpoint_persistence_failed" });
    }
  });

  app.get("/api/agentforge/stream", async (req, res) => {
    try { await sdk.authenticateRequest(req); }
    catch { res.status(401).json({ error: "authentication_required" }); return; }
    if (clients.size >= 100) { res.status(429).json({ error: "too_many_streams" }); return; }
    const db = await getDb();
    if (!db) { res.status(503).json({ error: "database_unavailable" }); return; }
    const parsed = Number(req.headers["last-event-id"] ?? 0);
    const since = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write(": agentforge telemetry connected\n\n");
    const client = { res, pending: [] as Array<{ id: number; event: string; data: unknown }>, ready: false, lastId: since };
    clients.add(client);
    try {
      const replay = await db.execute(sql`SELECT id, event_type, event_id, occurred_at, metadata FROM agentforge_events WHERE id > ${since} ORDER BY id ASC LIMIT 100`);
      const rows = (replay as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [];
      for (const row of rows) {
        const id = Number(row.id);
        if (id <= client.lastId) continue;
        writeSse(res, { id, event: String(row.event_type), data: { id: row.event_id, type: row.event_type, at: new Date(String(row.occurred_at)).getTime(), ...((row.metadata && typeof row.metadata === "object") ? row.metadata as Record<string, unknown> : {}) } });
        client.lastId = id;
      }
      client.pending.sort((a, b) => a.id - b.id);
      client.ready = true;
      for (const event of client.pending) if (event.id > client.lastId) { writeSse(res, event); client.lastId = event.id; }
      client.pending = [];
    } catch (error) {
      clients.delete(client);
      console.warn("[AgentforgeTelemetry] stream replay failed:", error instanceof Error ? error.message : "unknown");
      res.end();
      return;
    }
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(`: ping ${Date.now()}\n\n`); }, 15_000);
    req.on("close", () => { clearInterval(heartbeat); clients.delete(client); });
  });
}
