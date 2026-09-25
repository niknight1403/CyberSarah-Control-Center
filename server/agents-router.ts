/**
 * Sprint 371 — agents-Router: Laufzeit-Sicht und Kontrolle der Superagenten.
 *
 * - getStatus: Agenten des angemeldeten Nutzers inkl. Live-Telemetrie
 *   (gepufferte Loop-Events, Live-Abonnenten) und Status-Zusammenfassung.
 * - control: Zod-validierte Status-Aenderung (activate/pause/archive),
 *   strikt nutzer-gescoped — fremde Agenten-IDs sind NOT_FOUND, nicht 403-Orakel.
 * - getLogs: Replay des Session-Telemetrie-Bus (Ring-Puffer) mit
 *   Ownership-Check: die Session muss zu einem Agenten des Nutzers gehoeren.
 *
 * Es wird bewusst KEIN neuer Laufzeit-Agent gestartet — die Ausfuehrung
 * laeuft ueber die bestehenden Agentic-Loops/Orchestrator-Pfade; dieser
 * Router ist die ehrliche Lese-/Kontrollschiene dafuer.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  listSuperAgentsForUser,
  touchSuperAgentLastActive,
  updateSuperAgentRecord,
} from "./db";
import { agenticLoopTelemetryBus } from "./agentic-loop-telemetry";
import { replayLoopEvents } from "../lib/agentic-loop-telemetry-logic";
import {
  AGENT_CONTROL_ACTIONS,
  agentControlActionToStatus,
  clampAgentLogLimit,
  describeAgentTelemetry,
  serializeAgentRow,
  summarizeAgentStatuses,
} from "../lib/agents-router-logic";

export const agentsRouter = router({
  /** Laufzeit-Status aller Agenten des Nutzers inkl. Telemetrie-Snapshot. */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listSuperAgentsForUser(ctx.user.openId);
    const agents = rows.map((row) => ({
      ...serializeAgentRow(row),
      telemetry: describeAgentTelemetry(
        agenticLoopTelemetryBus.buffer(row.sessionId).length,
        agenticLoopTelemetryBus.subscriberCount(row.sessionId),
      ),
    }));
    return {
      agents,
      summary: summarizeAgentStatuses(rows),
    };
  }),

  /** Zod-validierte Kontroll-Aktion auf einem Agenten des Nutzers. */
  control: protectedProcedure
    .input(
      z.object({
        agentId: z.number().int().positive(),
        action: z.enum(AGENT_CONTROL_ACTIONS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const status = agentControlActionToStatus(input.action);
      const saved = await updateSuperAgentRecord(input.agentId, ctx.user.openId, { status });
      if (!saved) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent nicht gefunden oder kein Zugriff.",
        });
      }
      // Aktivierung zaehlt als Interaktion — Laufzeit-Marker aktualisieren.
      if (input.action === "activate") {
        await touchSuperAgentLastActive(input.agentId, ctx.user.openId);
      }
      return {
        agent: serializeAgentRow(saved),
        applied: { action: input.action, status },
      };
    }),

  /** Loop-Logs einer Agenten-Session (Replay ab sinceEventId, max. 240). */
  getLogs: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().min(8).max(64),
        sinceEventId: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(240).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const owned = await listSuperAgentsForUser(ctx.user.openId);
      if (!owned.some((row) => row.sessionId === input.sessionId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session nicht gefunden oder kein Zugriff.",
        });
      }
      const buffered = agenticLoopTelemetryBus.buffer(input.sessionId);
      const replayed = replayLoopEvents(buffered, input.sinceEventId ?? 0);
      const limit = clampAgentLogLimit(input.limit);
      return {
        sessionId: input.sessionId,
        events: replayed.slice(-limit),
        total: buffered.length,
        truncated: replayed.length > limit,
      };
    }),
});
