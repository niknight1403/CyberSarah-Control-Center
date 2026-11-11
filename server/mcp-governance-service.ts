/**
 * Sprint 3 — Governance-Service: Fähigkeitsindex, Policy-Gate und Freigaben.
 *
 * Der Service ist die einzige Stelle, an der ein Werkzeugaufruf von
 * "Server hat so ein Tool" zu "Agent darf es jetzt ausführen" wird:
 *
 *   indexServerTools()  leitet Fähigkeiten und Risiko aus `tools/list` ab und
 *                       persistiert die Entscheidung je Werkzeug (mit Signatur).
 *   searchTools()       beantwortet semantische Anfragen ("Tool zum Lesen von
 *                       PDFs") über die gecachten Deskriptoren aller Server.
 *   evaluateCall()      prüft Argumente, Least Privilege und Freigabestatus
 *                       VOR dem Netzwerkaufruf und legt bei Bedarf eine
 *                       Freigabeanfrage an.
 *   decideApproval()    genehmigt/lehnt ab (nur die entscheidende Person).
 *
 * Alles IO ist injiziert; die Fachlogik bleibt in lib/mcp-governance-logic.ts.
 */
import {
  buildToolProfiles,
  buildToolSignature,
  computeApprovalExpiry,
  deriveCapabilities,
  evaluateToolPolicy,
  sanitizeToolArguments,
  searchTools,
  type CapabilityTag,
  type GovernanceMode,
  type PolicyDecision,
  type RankedTool,
  type RiskLevel,
  type ToolDescriptorLike,
} from "../lib/mcp-governance-logic";
import type { ApprovalStore, ToolGovernanceStore } from "./mcp-governance-store";

export type GovernanceServer = {
  serverKey: string;
  tools: ToolDescriptorLike[];
  permissions: string[];
  governanceMode: GovernanceMode;
  enabled: boolean;
};

export type McpGovernanceServiceDeps = {
  toolStore: ToolGovernanceStore;
  approvalStore: ApprovalStore;
  loadServers: () => Promise<GovernanceServer[]>;
  now?: () => number;
  /** TTL einer Freigabe (Default 24 h). */
  approvalTtlMs?: number;
};

export type CallEvaluation = {
  decision: PolicyDecision;
  riskLevel: RiskLevel;
  reasons: string[];
  /** Bei approval_required: die offene/neue Freigabeanfrage. */
  approvalId: number | null;
  /** Nur bei allow: die geprüften Argumente. */
  args: Record<string, unknown> | null;
};

export type GovernanceService = {
  indexServerTools(serverKey: string): Promise<{ ok: true; indexed: number; removed: number } | { ok: false; reason: string }>;
  listGovernance(serverKey?: string): Promise<{ ok: true; tools: GovernanceListing[] } | { ok: false; reason: string }>;
  search(query: string, options?: { limit?: number; capability?: CapabilityTag; serverKey?: string }): Promise<RankedTool[]>;
  evaluateCall(input: {
    serverKey: string;
    toolName: string;
    args: Record<string, unknown>;
    requestedBy?: string | null;
  }): Promise<CallEvaluation>;
  decideApproval(input: {
    id: number;
    decision: "approved" | "rejected";
    decidedBy: string;
  }): Promise<{ ok: true; approval: ApprovalListing } | { ok: false; reason: string }>;
  listApprovals(status?: string): Promise<ApprovalListing[]>;
  expireStaleApprovals(): Promise<number>;
};

export type GovernanceListing = {
  serverKey: string;
  toolName: string;
  capabilities: string[];
  primaryCapability: string;
  riskLevel: string;
  decision: string;
  reasons: string[];
  signature: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export type ApprovalListing = {
  id: number;
  serverKey: string;
  toolName: string;
  riskLevel: string;
  status: string;
  reason: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

function toListing(row: {
  serverKey: string;
  toolName: string;
  capabilities: string[];
  primaryCapability: string;
  riskLevel: string;
  decision: string;
  reasons: string[];
  signature: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  updatedAt: Date;
}): GovernanceListing {
  return {
    serverKey: row.serverKey,
    toolName: row.toolName,
    capabilities: row.capabilities,
    primaryCapability: row.primaryCapability,
    riskLevel: row.riskLevel,
    decision: row.decision,
    reasons: row.reasons,
    signature: row.signature,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toApprovalListing(row: {
  id: number;
  serverKey: string;
  toolName: string;
  riskLevel: string;
  status: string;
  reason: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}): ApprovalListing {
  return {
    id: row.id,
    serverKey: row.serverKey,
    toolName: row.toolName,
    riskLevel: row.riskLevel,
    status: row.status,
    reason: row.reason,
    requestedBy: row.requestedBy,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createMcpGovernanceService(deps: McpGovernanceServiceDeps): GovernanceService {
  const now = deps.now ?? (() => Date.now());
  const ttl = deps.approvalTtlMs ?? 24 * 60 * 60 * 1000;

  async function findServer(serverKey: string): Promise<GovernanceServer | null> {
    const servers = await deps.loadServers();
    return servers.find((server) => server.serverKey === serverKey) ?? null;
  }

  return {
    async indexServerTools(serverKey) {
      const server = await findServer(serverKey);
      if (!server) return { ok: false, reason: `Unbekannter MCP-Server: ${serverKey}` };

      const tools = server.tools.filter((tool) => typeof tool.name === "string" && tool.name.length > 0);
      const profiles = buildToolProfiles(serverKey, tools);
      for (const profile of profiles) {
        const descriptor = tools.find((tool) => tool.name === profile.name) ?? { name: profile.name };
        const evaluation = evaluateToolPolicy({
          serverKey,
          tool: descriptor,
          profile,
          permissions: server.permissions,
          policy: { mode: server.governanceMode },
        });
        await deps.toolStore.upsert({
          serverKey,
          toolName: profile.name,
          capabilities: profile.capabilities,
          primaryCapability: profile.primaryCapability,
          riskLevel: evaluation.riskLevel,
          decision: evaluation.decision,
          reasons: evaluation.reasons,
          signature: profile.signature,
        });
      }
      const removed = await deps.toolStore.deleteForServer(
        serverKey,
        profiles.map((profile) => profile.name),
      );
      return { ok: true, indexed: profiles.length, removed };
    },

    async listGovernance(serverKey) {
      try {
        const rows = serverKey ? await deps.toolStore.listByServer(serverKey) : await deps.toolStore.listAll();
        return { ok: true, tools: rows.map(toListing) };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "Governance nicht lesbar." };
      }
    },

    async search(query, options = {}) {
      const servers = (await deps.loadServers()).filter((server) => server.enabled);
      const profiles = servers.flatMap((server) =>
        buildToolProfiles(
          server.serverKey,
          server.tools.filter((tool) => typeof tool.name === "string" && tool.name.length > 0),
        ),
      );
      return searchTools(query, profiles, options);
    },

    async evaluateCall({ serverKey, toolName, args, requestedBy }) {
      const server = await findServer(serverKey);
      if (!server) {
        return { decision: "block", riskLevel: "low", reasons: [`Unbekannter MCP-Server: ${serverKey}`], approvalId: null, args: null };
      }
      if (!server.enabled) {
        return { decision: "block", riskLevel: "low", reasons: ["Server ist deaktiviert"], approvalId: null, args: null };
      }

      const descriptor = server.tools.find((tool) => tool.name === toolName);
      if (!descriptor) {
        return {
          decision: "block",
          riskLevel: "low",
          reasons: [`Werkzeug ${toolName} ist auf ${serverKey} nicht (mehr) gelistet — bitte Healthcheck erneuern`],
          approvalId: null,
          args: null,
        };
      }

      const profile = buildToolProfiles(serverKey, [descriptor])[0];
      const evaluation = evaluateToolPolicy({
        serverKey,
        tool: descriptor,
        profile,
        permissions: server.permissions,
        policy: { mode: server.governanceMode },
      });

      const sanitized = sanitizeToolArguments(args, { capabilities: profile.capabilities });
      if (!sanitized.ok) {
        return {
          decision: "block",
          riskLevel: evaluation.riskLevel,
          reasons: [...evaluation.reasons, ...sanitized.issues],
          approvalId: null,
          args: null,
        };
      }

      if (evaluation.decision === "block") {
        return {
          decision: "block",
          riskLevel: evaluation.riskLevel,
          reasons: evaluation.reasons,
          approvalId: null,
          args: null,
        };
      }

      if (evaluation.decision === "allow") {
        return {
          decision: "allow",
          riskLevel: evaluation.riskLevel,
          reasons: evaluation.reasons,
          approvalId: null,
          args: sanitized.args,
        };
      }

      const usable = await deps.approvalStore.findUsable(serverKey, toolName, now());
      if (usable) {
        return {
          decision: "allow",
          riskLevel: evaluation.riskLevel,
          reasons: [...evaluation.reasons, `Freigabe #${usable.id} liegt vor`],
          approvalId: usable.id,
          args: sanitized.args,
        };
      }

      // Offene Anfrage wiederverwenden statt bei jedem Aufruf eine neue anzulegen.
      const pending = await deps.approvalStore.findPending(serverKey, toolName);
      if (pending) {
        return {
          decision: "approval_required",
          riskLevel: evaluation.riskLevel,
          reasons: [...evaluation.reasons, `Anfrage #${pending.id} wartet auf Entscheidung`],
          approvalId: pending.id,
          args: null,
        };
      }

      const approval = await deps.approvalStore.insert({
        serverKey,
        toolName,
        riskLevel: evaluation.riskLevel,
        status: "pending",
        reason: evaluation.reasons.join("; ").slice(0, 500),
        argsPreview: sanitized.args,
        requestedBy: requestedBy ?? null,
        expiresAt: computeApprovalExpiry(now(), ttl),
      });

      return {
        decision: "approval_required",
        riskLevel: evaluation.riskLevel,
        reasons: evaluation.reasons,
        approvalId: approval.id,
        args: null,
      };
    },

    async decideApproval({ id, decision, decidedBy }) {
      const existing = await deps.approvalStore.findById(id);
      if (!existing) return { ok: false, reason: `Freigabe #${id} existiert nicht.` };
      if (existing.status !== "pending") {
        return { ok: false, reason: `Freigabe #${id} ist bereits ${existing.status}.` };
      }
      const saved = await deps.approvalStore.decide(id, { status: decision, decidedBy, decidedAt: new Date(now()) });
      if (!saved) return { ok: false, reason: `Freigabe #${id} konnte nicht gespeichert werden.` };
      if (decision === "approved") {
        await deps.toolStore.markReviewed(saved.serverKey, saved.toolName, decidedBy, new Date(now()));
      }
      return { ok: true, approval: toApprovalListing(saved) };
    },

    async listApprovals(status) {
      const rows = await deps.approvalStore.list(status);
      return rows.map(toApprovalListing);
    },

    async expireStaleApprovals() {
      return deps.approvalStore.expireStale(new Date(now()));
    },
  };
}

/** Hilfsfunktion fuer Aufrufer, die nur die Signatur eines Tools brauchen. */
export function currentToolSignature(tool: ToolDescriptorLike): string {
  return buildToolSignature(tool);
}

/** Fähigkeiten eines Deskriptors ohne Persistenz (Anzeige/Diagnose). */
export function describeToolCapabilities(tool: ToolDescriptorLike): CapabilityTag[] {
  return deriveCapabilities(tool).capabilities;
}
