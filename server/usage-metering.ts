/**
 * Ausführungsprotokoll und Nutzungsbericht (Server-Adapter).
 *
 * Protokolliert nur Kennzahlen (Tokens, Kosten, Dauer, Status) — keine Prompts,
 * keine Modellantworten. Grundlage für /api/v1/analytics/usage und die
 * ROI-Sicht des Nutzers.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { agentExecutions } from "../drizzle/schema";
import {
  aggregateUsage,
  estimateCostEur,
  resolveUsageProvider,
  type UsageRow,
  type UsageSummary,
} from "../lib/usage-metering-logic";
import { getDb } from "./db";

export interface ExecutionRecordInput {
  executionKey: string;
  userOpenId: string;
  agentId?: string | null;
  surface?: string;
  provider: string;
  model?: string | null;
  status: "ok" | "error" | "blocked";
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  errorCode?: string | null;
}

type UsageDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Test-Seam (Repo-Konvention wie in `server/credit-guard.ts`): die Suite laeuft
 * mit `isolate: false`, ein `vi.mock("./db")` wuerde in Nachbardateien lecken.
 * Der Adapter bekommt seine Datenbank deshalb explizit; produktiv greift der
 * Default unveraendert.
 */
export interface UsageMeteringDeps {
  getDb: () => Promise<UsageDb | null>;
}

const defaultDeps: UsageMeteringDeps = { getDb };

/** Felder werden auf Spaltenbreite gekuerzt, damit ein Zulieferer nicht den Insert sprengt. */
function clampText(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  return value.slice(0, max);
}

/** Einen Lauf festhalten. Scheitert das Protokoll, leidet der Lauf nicht darunter. */
export async function recordAgentExecution(
  input: ExecutionRecordInput,
  deps: UsageMeteringDeps = defaultDeps,
): Promise<boolean> {
  const db = await deps.getDb();
  if (!db) return false;
  const cost =
    input.promptTokens === null && input.completionTokens === null
      ? null
      : estimateCostEur({
          provider: resolveUsageProvider(input.provider),
          promptTokens: input.promptTokens ?? null,
          completionTokens: input.completionTokens ?? null,
        });
  try {
    await db
      .insert(agentExecutions)
      .values({
        executionKey: input.executionKey.slice(0, 190),
        userOpenId: input.userOpenId,
        agentId: clampText(input.agentId, 64),
        surface: (input.surface ?? "api").slice(0, 40),
        provider: resolveUsageProvider(input.provider),
        model: clampText(input.model, 120),
        status: input.status,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        costEur: cost === null ? null : String(cost),
        durationMs: input.durationMs ?? null,
        errorCode: clampText(input.errorCode, 60),
      })
      .onConflictDoNothing({ target: agentExecutions.executionKey });
    return true;
  } catch (error) {
    console.warn(
      "[usage-metering] Lauf nicht protokolliert:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

/** Nutzungsbericht eines Nutzers über die letzten Tage. */
export async function readUsageAnalytics(
  input: {
    userOpenId: string;
    days?: number;
    now?: number;
    planValueEurPerMonth?: number | null;
  },
  deps: UsageMeteringDeps = defaultDeps,
): Promise<{ available: boolean; summary: UsageSummary }> {
  const now = input.now ?? Date.now();
  const days = Math.max(1, Math.min(365, Math.floor(input.days ?? 30)));
  const empty = aggregateUsage([], { now, windowDays: days, planValueEurPerMonth: input.planValueEurPerMonth ?? null });
  const db = await deps.getDb();
  if (!db) return { available: false, summary: empty };

  try {
    const cutoff = new Date(now - days * 86_400_000);
    const rows = await db
      .select({
        agentId: agentExecutions.agentId,
        provider: agentExecutions.provider,
        model: agentExecutions.model,
        status: agentExecutions.status,
        promptTokens: agentExecutions.promptTokens,
        completionTokens: agentExecutions.completionTokens,
        costEur: agentExecutions.costEur,
        durationMs: agentExecutions.durationMs,
        createdAt: agentExecutions.createdAt,
      })
      .from(agentExecutions)
      .where(and(eq(agentExecutions.userOpenId, input.userOpenId), gte(agentExecutions.createdAt, cutoff)))
      .orderBy(desc(agentExecutions.createdAt))
      .limit(5000);

    const usageRows: UsageRow[] = rows.map((row) => ({
      agentId: row.agentId,
      provider: row.provider,
      model: row.model,
      status: (row.status === "error" || row.status === "blocked" ? row.status : "ok") as UsageRow["status"],
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      costEur: row.costEur === null ? null : Number(row.costEur),
      durationMs: row.durationMs,
      createdAt: row.createdAt.getTime(),
    }));

    return {
      available: true,
      summary: aggregateUsage(usageRows, {
        now,
        windowDays: days,
        planValueEurPerMonth: input.planValueEurPerMonth ?? null,
      }),
    };
  } catch (error) {
    console.warn(
      "[usage-metering] Nutzung nicht lesbar:",
      error instanceof Error ? error.message : String(error),
    );
    return { available: false, summary: empty };
  }
}
