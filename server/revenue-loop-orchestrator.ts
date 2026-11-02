/**
 * Autonomer Revenue-Loop: führt die reine Logik mit echten Daten aus.
 *
 * Ein Lauf (Iteration):
 *  1. messen    – Funnel/Snapshot aus dem Revenue-Autopilot, B2B-Netzwerk aus
 *                 den Netzwerk-Tabellen, Reichweite aus dem Funnel.
 *  2. priorisieren – größter Hebel (buildRevenueLoopDigest).
 *  3. handeln   – nur interne Auswertung/Entwurf; externe Ansprache bleibt
 *                 freigabepflichtig und wird hier nicht versendet.
 *  4. bewerten  – Vergleich mit dem letzten Lauf (MRR), Urteil scale/iterate/stop.
 *  5. festhalten – append-only-Zeile in revenue_loop_runs inkl. Direktive, die
 *                 eine Endlosschleife erkennt (alternate-strategy/escalate).
 */
import { desc } from "drizzle-orm";
import { b2bNetworkEdges, b2bNetworkNodes, revenueLoopRuns } from "../drizzle/schema";
import {
  buildRevenueLoopDigest,
  deriveNetworkStages,
  evaluateLoopOutcome,
  reachFromSnapshot,
  revenueLoopSummaryLines,
  type B2BNode,
  type LoopOutcome,
  type NetworkEdgeRecord,
  type NetworkNodeRecord,
  type RevenueLoopDigest,
} from "../lib/revenue-loop-orchestrator-logic";
import { collectRevenueAutopilotSnapshot } from "./revenue-autopilot";
import { getDb } from "./db";

const LOOP_MAX_NODES = 1000;
const LOOP_MAX_EDGES = 4000;

export type RevenueLoopRunResult = {
  ok: boolean;
  runKey: string | null;
  digest: RevenueLoopDigest;
  outcome: LoopOutcome | null;
  persisted: boolean;
  summary: string[];
};

/** B2B-Knoten und -Kanten laden; ohne Datenbank ehrlich leer zurückgeben. */
export async function loadB2BNetwork(now = Date.now()): Promise<B2BNode[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const [nodes, edges] = await Promise.all([
      db.select().from(b2bNetworkNodes).limit(LOOP_MAX_NODES),
      db.select().from(b2bNetworkEdges).limit(LOOP_MAX_EDGES),
    ]);
    const nodeRecords: NetworkNodeRecord[] = nodes.map((node) => ({
      nodeKey: node.nodeKey,
      kind: node.kind,
      relationshipStrength: node.relationshipStrength,
      estimatedValueCents: node.estimatedValueCents,
      lastActivityAt: node.lastActivityAt ? node.lastActivityAt.getTime() : null,
      optedOut: node.optedOut,
    }));
    const edgeRecords: NetworkEdgeRecord[] = edges.map((edge) => ({
      fromNodeKey: edge.fromNodeKey,
      toNodeKey: edge.toNodeKey,
      stage: edge.stage,
      strength: edge.strength,
    }));
    void now;
    return deriveNetworkStages(nodeRecords, edgeRecords);
  } catch (error) {
    console.warn(
      "[Revenue-Loop] B2B-Netzwerk nicht lesbar:",
      error instanceof Error ? error.message : String(error),
    );
    return [];
  }
}

/** Letzten Lauf lesen, um die Wirkung der Iteration zu bewerten. */
export async function loadPreviousLoop(): Promise<{ digestMrr: number | null; runKey: string } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [row] = await db.select().from(revenueLoopRuns).orderBy(desc(revenueLoopRuns.createdAt)).limit(1);
    if (!row) return null;
    // Messwert des letzten Laufs: bevorzugt "after", sonst die Baseline.
    return { digestMrr: row.mrrEurAfter ?? row.mrrEurBefore ?? null, runKey: row.runKey };
  } catch {
    return null;
  }
}

/** Ein vollständiger Loop-Durchlauf. Externe Wirkung findet hier nicht statt. */
export async function runRevenueLoopIteration(options: { now?: number; persist?: boolean } = {}): Promise<RevenueLoopRunResult> {
  const now = options.now ?? Date.now();
  const persist = options.persist ?? true;

  const snapshot = await collectRevenueAutopilotSnapshot();
  const [network, previous] = await Promise.all([loadB2BNetwork(now), loadPreviousLoop()]);

  const digest = buildRevenueLoopDigest({
    snapshot,
    reach: reachFromSnapshot(snapshot),
    b2b: network,
    now,
  });

  // Bewertung des VORHERIGEN Laufs gegen den aktuellen Messwert. So lernt der
  // Loop, ob der letzte Hebel gewirkt hat, statt nur neue Entwürfe zu erzeugen.
  let outcome: LoopOutcome | null = null;
  if (previous && previous.digestMrr !== null && digest.revenue.mrrEur !== null) {
    outcome = evaluateLoopOutcome(
      buildRevenueLoopDigest({ snapshot: { ...snapshot, mrrEur: previous.digestMrr }, reach: reachFromSnapshot(snapshot), b2b: network, now }),
      digest,
    );
  }

  const runKey = `${new Date(now).toISOString().slice(0, 13)}-${network.length}-${digest.lever?.key ?? "none"}`.slice(0, 190);
  let persisted = false;

  if (persist) {
    const db = await getDb();
    if (db) {
      try {
        await db
          .insert(revenueLoopRuns)
          .values({
            runKey,
            leverKey: digest.lever?.key ?? null,
            leverTitle: digest.lever?.title?.slice(0, 200) ?? null,
            status: digest.status,
            verdict: outcome?.verdict ?? null,
            mrrEurBefore: previous?.digestMrr ?? digest.revenue.mrrEur,
            mrrEurAfter: digest.revenue.mrrEur,
            deltaPct: outcome?.deltaPct !== null && outcome?.deltaPct !== undefined ? String(outcome.deltaPct) : null,
            reachSnapshot: digest.reach as unknown as Record<string, unknown>,
            networkSnapshot: {
              total: digest.network.total,
              byStage: digest.network.byStage,
              staleCount: digest.network.staleCount,
              note: digest.network.note,
            },
            actions: digest.actions as unknown as unknown[],
            directive: digest.directive.action,
          })
          .onConflictDoNothing({ target: revenueLoopRuns.runKey });
        persisted = true;
      } catch (error) {
        console.warn(
          "[Revenue-Loop] Lauf nicht gespeichert:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  return {
    ok: true,
    runKey: persisted ? runKey : null,
    digest,
    outcome,
    persisted,
    summary: revenueLoopSummaryLines(digest),
  };
}

/** Verlauf der letzten Läufe für Umsatz-/Reichweiten-/Netzwerk-Update. */
export async function revenueLoopHistory(limit = 10) {
  const db = await getDb();
  if (!db) return { available: false as const, runs: [] as never[] };
  try {
    const rows = await db
      .select()
      .from(revenueLoopRuns)
      .orderBy(desc(revenueLoopRuns.createdAt))
      .limit(Math.max(1, Math.min(50, limit)));
    return {
      available: true as const,
      runs: rows.map((row) => ({
        runKey: row.runKey,
        leverKey: row.leverKey,
        status: row.status,
        verdict: row.verdict,
        mrrEur: row.mrrEurBefore,
        deltaPct: row.deltaPct === null ? null : Number(row.deltaPct),
        directive: row.directive,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  } catch {
    return { available: false as const, runs: [] as never[] };
  }
}
