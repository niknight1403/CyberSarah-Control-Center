/**
 * Sprint 9 — Execution Bridge Service.
 *
 * Macht aus einer Team-Aufgabe einen echten `callTool`-Aufruf und schreibt
 * JEDEN Ausgang ins Audit. Die Bridge entscheidet nicht selbst ueber Rechte:
 * Policy, Credentials, Supervisor und Transport liegen weiterhin im
 * Server-Service (Sprint 2/3/5) und werden dort geprueft.
 *
 * Reihenfolge vor dem Netzwerk: Agent -> Werkzeug aus Grants -> Argumente ->
 * Policy -> Aufruf -> Audit.
 */
import {
  DEFAULT_CALL_COST_CENTS,
  buildAuditEntry,
  checkArguments,
  hashArguments,
  classifyCallResult,
  gateCall,
  requiredArguments,
  selectToolForTask,
  type BridgeTool,
  type CallResultLike,
} from "../lib/mcp-execution-bridge-logic";
import {
  buildToolProfiles,
  type RiskLevel,
  type ToolDescriptorLike,
  type ToolProfile,
} from "../lib/mcp-governance-logic";
import type { StepOutcome, TaskExecutor } from "../lib/mcp-run-engine-logic";
import type { TeamTask } from "../lib/mcp-team-orchestration-logic";
import type { StoredAgent } from "./mcp-agent-store";
import type { McpAuditStore } from "./mcp-execution-audit-store";
import type { McpServerStore } from "./mcp-server-store";

export type CallToolFn = (
  serverKey: string,
  input: { toolName: string; args: Record<string, unknown> },
) => Promise<CallResultLike>;

/** Freigabe-Pruefung vor dem Aufruf (Sprint 10). */
export type ApprovalGate = {
  findUsable(target: { runId: number; taskId: string; serverKey: string; toolName: string; argsHash: string }): Promise<{ id: number } | null>;
  consume(id: number): Promise<unknown>;
};

export type BridgeDeps = {
  agents: { findByKey(agentKey: string): Promise<StoredAgent | null> };
  approvals?: ApprovalGate;
  servers: Pick<McpServerStore, "list">;
  audit: McpAuditStore;
  callTool: CallToolFn;
  now?: () => number;
  costPerCallCents?: number;
  timeoutMs?: number;
};

export type ResolvePreview =
  | {
      ok: true;
      serverKey: string;
      toolName: string;
      riskLevel: RiskLevel;
      decision: string;
      missingArguments: string[];
      matched: string[];
    }
  | { ok: false; code: string; reason: string };

export type ExecutionBridge = {
  executor: TaskExecutor;
  resolve(input: { task: TeamTask; agentKey: string }): Promise<ResolvePreview>;
};

type CatalogEntry = BridgeTool & { permissions: string[]; governanceMode: string };

function asTools(value: unknown): ToolDescriptorLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ToolDescriptorLike => !!entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string");
}

function agentMode(agent: StoredAgent): "manual" | "assisted" | "autonomous" {
  const security = (agent.security ?? {}) as Record<string, unknown>;
  const mode = typeof security.mode === "string" ? security.mode : "assisted";
  return mode === "manual" || mode === "autonomous" ? mode : "assisted";
}

function riskOf(value: unknown): RiskLevel {
  return value === "medium" || value === "high" || value === "critical" ? value : "low";
}

export function createMcpExecutionBridge(deps: BridgeDeps): ExecutionBridge {
  const now = deps.now ?? (() => Date.now());
  const costPerCall = deps.costPerCallCents ?? DEFAULT_CALL_COST_CENTS;
  const timeoutMs = deps.timeoutMs ?? 30_000;

  async function catalog(): Promise<CatalogEntry[]> {
    const servers = await deps.servers.list();
    const entries: CatalogEntry[] = [];
    for (const server of servers) {
      if (!server.enabled) continue;
      const tools = asTools(server.tools);
      if (tools.length === 0) continue;
      const profiles = buildToolProfiles(server.serverKey, tools);
      for (const tool of tools) {
        const profile = profiles.find((candidate: ToolProfile) => candidate.name === tool.name);
        if (!profile) continue;
        entries.push({
          serverKey: server.serverKey,
          tool,
          profile,
          permissions: Array.isArray(server.permissions) ? server.permissions : [],
          governanceMode: typeof server.governanceMode === "string" ? server.governanceMode : "assisted",
        });
      }
    }
    return entries;
  }

  async function audit(input: {
    task: TeamTask;
    agentKey: string;
    serverKey: string;
    toolName: string;
    decision: "succeeded" | "approval_required" | "blocked" | "failed";
    riskLevel: RiskLevel;
    costCents: number;
    durationMs: number;
    note: string;
    attempt: number;
    runId?: number;
  }) {
    const entry = buildAuditEntry({
      runId: input.runId ?? null,
      taskId: input.task.id,
      agentKey: input.agentKey,
      serverKey: input.serverKey,
      toolName: input.toolName,
      decision: input.decision,
      riskLevel: input.riskLevel,
      args: input.task.args,
      costCents: input.costCents,
      durationMs: input.durationMs,
      note: input.note,
      attempt: input.attempt,
      createdAtMs: now(),
    });
    try {
      await deps.audit.insert(entry);
    } catch {
      // Ein Audit-Fehler darf den Aufruf nicht in einen Erfolg verwandeln,
      // wird aber auch nicht verschluckt: der Aufrufer sieht den Hinweis.
      return "Audit konnte nicht gespeichert werden.";
    }
    return null;
  }

  async function prepare(task: TeamTask, agentKey: string) {
    const agent = await deps.agents.findByKey(agentKey);
    if (!agent) return { ok: false as const, code: "unknown_agent", reason: `Agent "${agentKey}" nicht gefunden.` };
    if (agent.status !== "active") {
      return { ok: false as const, code: "agent_inactive", reason: `Agent "${agentKey}" ist nicht aktiv (${agent.status}).` };
    }

    const entries = await catalog();
    const choice = selectToolForTask({
      taskText: `${task.title} ${task.goal}`,
      grants: agent.grants.map((grant) => ({ serverKey: grant.serverKey, toolName: grant.toolName })),
      catalog: entries,
    });
    if (!choice.ok) return { ok: false as const, code: choice.code, reason: choice.reason };

    const entry = entries.find((candidate) => candidate.serverKey === choice.serverKey && candidate.tool.name === choice.toolName);
    if (!entry) return { ok: false as const, code: "no_catalog_entry", reason: "Werkzeug verschwand zwischen Auswahl und Aufruf." };

    const required = requiredArguments(entry.tool.inputSchema);
    const argsCheck = checkArguments({ required, provided: task.args });
    const gate = gateCall({
      serverKey: entry.serverKey,
      tool: entry.tool,
      profile: entry.profile,
      permissions: entry.permissions,
      mode: agentMode(agent),
    });

    return { ok: true as const, agent, entry, choice, required, argsCheck, gate };
  }

  const executor: TaskExecutor = async ({ task, agentKey, attempt, runId }): Promise<StepOutcome> => {
    const prepared = await prepare(task, agentKey);
    const fallbackTool = { serverKey: "unbekannt", toolName: task.id };

    if (!prepared.ok) {
      const note = await audit({
        task,
        agentKey,
        serverKey: fallbackTool.serverKey,
        toolName: fallbackTool.toolName,
        decision: "blocked",
        riskLevel: riskOf(task.riskLevel),
        costCents: 0,
        durationMs: 0,
        note: prepared.reason,
        attempt,
        runId,
      });
      return {
        ok: false,
        costCents: 0,
        durationMs: 0,
        retryable: false,
        code: prepared.code,
        note: note ? `${prepared.reason} ${note}` : prepared.reason,
      };
    }

    const { entry, gate, argsCheck, choice } = prepared;
    const base = {
      task,
      agentKey,
      serverKey: entry.serverKey,
      toolName: entry.tool.name,
      riskLevel: choice.riskLevel,
      attempt,
      runId,
    };

    if (gate.decision === "block") {
      const reason = `Policy blockt: ${gate.reasons.join("; ")}`;
      await audit({ ...base, decision: "blocked", costCents: 0, durationMs: 0, note: reason });
      return { ok: false, costCents: 0, durationMs: 0, retryable: false, code: "policy_blocked", note: reason };
    }
    if (!argsCheck.ok) {
      await audit({ ...base, decision: "blocked", costCents: 0, durationMs: 0, note: argsCheck.reason });
      return { ok: false, costCents: 0, durationMs: 0, retryable: false, code: "missing_arguments", note: argsCheck.reason };
    }

    // Freigabepflicht: nur eine gueltige, noch nicht verbrauchte Freigabe fuer
    // GENAU diesen Aufruf (Lauf, Aufgabe, Werkzeug, Argument-Hash) oeffnet die Tuer.
    let approvalNote = "";
    let approvalId: number | null = null;
    if (gate.decision === "approval_required") {
      const argsHash = hashArguments(argsCheck.args);
      const usable =
        deps.approvals && typeof runId === "number"
          ? await deps.approvals.findUsable({
              runId,
              taskId: task.id,
              serverKey: entry.serverKey,
              toolName: entry.tool.name,
              argsHash,
            })
          : null;

      if (!usable) {
        const reason = `Freigabe erforderlich (${gate.riskLevel}): ${gate.reasons.join("; ")}`;
        await audit({ ...base, decision: "approval_required", costCents: 0, durationMs: 0, note: reason });
        return { ok: false, costCents: 0, durationMs: 0, retryable: false, code: "approval_required", note: reason };
      }
      approvalId = usable.id;
      approvalNote = ` Freigabe #${usable.id} genutzt.`;
    }

    const startedAt = now();
    let result: CallResultLike;
    try {
      result = await Promise.race([
        deps.callTool(entry.serverKey, { toolName: entry.tool.name, args: argsCheck.args }),
        new Promise<CallResultLike>((resolve) =>
          setTimeout(() => resolve({ ok: false, reason: `Timeout nach ${timeoutMs} ms` }), timeoutMs),
        ),
      ]);
    } catch (error) {
      result = { ok: false, reason: `Aufruf fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannt"}` };
    }
    const durationMs = Math.max(0, now() - startedAt);
    const classification = classifyCallResult(result);
    const costCents = result.ok ? costPerCall : 0;

    await audit({
      ...base,
      decision:
        classification.kind === "success"
          ? "succeeded"
          : classification.kind === "approval_required"
            ? "approval_required"
            : classification.kind === "blocked"
              ? "blocked"
              : "failed",
      costCents,
      durationMs,
      note: `${classification.reason}${approvalNote}`,
    });

    // Eine Freigabe gilt fuer genau einen Aufruf — auch bei Fehlschlag.
    if (approvalId !== null && deps.approvals) {
      await deps.approvals.consume(approvalId);
    }

    return {
      ok: classification.kind === "success",
      costCents,
      durationMs,
      note: `${classification.reason}${approvalNote}`,
      retryable: classification.retryable,
      code: classification.kind,
    };
  };

  return {
    executor,
    async resolve(input) {
      const prepared = await prepare(input.task, input.agentKey);
      if (!prepared.ok) return { ok: false, code: prepared.code, reason: prepared.reason };
      return {
        ok: true,
        serverKey: prepared.entry.serverKey,
        toolName: prepared.entry.tool.name,
        riskLevel: prepared.choice.riskLevel,
        decision: prepared.gate.decision,
        missingArguments: prepared.argsCheck.ok ? [] : prepared.argsCheck.missing,
        matched: prepared.choice.matched,
      };
    },
  };
}
