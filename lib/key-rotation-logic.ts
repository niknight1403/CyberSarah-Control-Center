/**
 * Autonome API-Key-Rotation & Smart-Tier-Routing (rein, testbar).
 *
 * Verwaltet einen Pool von Provider-Keys je Cloud-Provider:
 * - Quota-/Rate-Limit-Tracking (HTTP 429), Latenz- und Restguthaben-Beobachtung
 * - Sofort-Failover auf den naechsten gesunden Key, ohne den Ausfuehrungs-
 *   Kontext zu verlieren (der Rotation-Report traegt ihn mit)
 * - Kostenoptimierte Modell-Tier-Auswahl je Task-Klasse (aus model-router-logic)
 *
 * Die Rotation ist deterministisch (Health-Score + stabile Tie-Breaks), damit
 * Failover-Entscheidungen nachvollziehbar und testbar bleiben.
 */

import { type Complexity, type TaskType } from "@/lib/model-router-logic";

export const KEY_ROTATION_COOLDOWN_MS = 60_000;

export type KeyPoolStatus = "active" | "cooling" | "exhausted";

export type KeyPoolEntry = {
  id: string;
  provider: string;
  /** Sichtbares Key-Ende ("…ab12") — niemals der Voll-Key. */
  label: string;
  status: KeyPoolStatus;
  /** Beobachtete durchschnittliche Latenz in ms (juenger gewichtet). */
  latencyMs: number;
  /** Restguthaben relativ (0..1), falls der Provider es meldet. */
  remainingCredits: number | null;
  /** Millisekunden-Zeitstempel, bis zu dem ein 429-/Erschoepfungs-Cooldown gilt. */
  cooldownUntilMs: number | null;
};

export function createKeyPoolEntry(input: {
  id: string;
  provider: string;
  label: string;
  latencyMs?: number;
  remainingCredits?: number | null;
}): KeyPoolEntry {
  return {
    id: input.id,
    provider: input.provider,
    label: input.label,
    status: "active",
    latencyMs: Math.max(input.latencyMs ?? 0, 0),
    remainingCredits: input.remainingCredits ?? null,
    cooldownUntilMs: null,
  };
}

/** Normalisiertes Latenzmass in 0..1 (0 ms → 1, ab 4 s → 0). */
function latencyScore(latencyMs: number): number {
  if (latencyMs <= 0) return 1;
  return Math.max(1 - latencyMs / 4_000, 0);
}

/** Health-Score eines Keys (0..1): Latenz, Restguthaben und Status. */
export function keyHealthScore(entry: KeyPoolEntry): number {
  if (entry.status === "exhausted") return 0;
  let score = latencyScore(entry.latencyMs);
  if (typeof entry.remainingCredits === "number") {
    score *= Math.min(Math.max(entry.remainingCredits, 0), 1);
  }
  return score;
}

export type KeyObservation = {
  httpStatus?: number;
  latencyMs?: number;
  remainingCredits?: number | null;
  nowMs?: number;
};

/** Beobachtung eines Requests in den Pool-Eintrag einarbeiten (unveränderlich). */
export function recordKeyObservation(entry: KeyPoolEntry, observation: KeyObservation): KeyPoolEntry {
  const nowMs = observation.nowMs ?? 0;
  let next: KeyPoolEntry = {
    ...entry,
    latencyMs: observation.latencyMs !== undefined ? Math.max(observation.latencyMs, 0) : entry.latencyMs,
    remainingCredits: observation.remainingCredits !== undefined ? observation.remainingCredits : entry.remainingCredits,
  };

  if (observation.httpStatus === 429) {
    return {
      ...next,
      status: "cooling",
      cooldownUntilMs: nowMs > 0 ? nowMs + KEY_ROTATION_COOLDOWN_MS : Number.MAX_SAFE_INTEGER,
    };
  }
  if (observation.httpStatus === 402 || observation.httpStatus === 403 || next.remainingCredits === 0) {
    return { ...next, status: "exhausted", cooldownUntilMs: null };
  }
  if (next.status === "cooling" && next.cooldownUntilMs !== null && next.cooldownUntilMs <= nowMs) {
    return { ...next, status: "active", cooldownUntilMs: null };
  }
  return next;
}

/** Pool in den aktuell gueltigen Zustand ueberfuehren (abgelaufene Cooldowns). */
export function refreshKeyPool(pool: readonly KeyPoolEntry[], nowMs: number): KeyPoolEntry[] {
  return pool.map((entry) =>
    entry.status === "cooling" && entry.cooldownUntilMs !== null && entry.cooldownUntilMs <= nowMs
      ? { ...entry, status: "active", cooldownUntilMs: null }
      : entry,
  );
}

export type FailoverSelection = {
  selected: KeyPoolEntry | null;
  reason: string;
};

/**
 * Waehlt den naechsten gesunden Key: hoechster Health-Score unter den
 * verfuegbaren (aktiv, kein laufender Cooldown), deterministischer Tie-Break
 * nach id. `excludeId` schliesst den gerade limitierten Key aus.
 */
export function selectFailoverKey(
  pool: readonly KeyPoolEntry[],
  options: { excludeId?: string; provider?: string } = {},
): FailoverSelection {
  const candidates = pool.filter(
    (entry) =>
      entry.status === "active" &&
      entry.id !== options.excludeId &&
      (options.provider === undefined || entry.provider === options.provider),
  );
  if (candidates.length === 0) {
    const anyProviderLeft = pool.some((entry) => entry.status === "active" && entry.id !== options.excludeId);
    return {
      selected: null,
      reason: anyProviderLeft ? "Kein freier Key für den Provider" : "Key-Pool erschöpft — alle Keys im Cooldown oder verbraucht",
    };
  }
  const ranked = [...candidates].sort((a, b) => keyHealthScore(b) - keyHealthScore(a) || (a.id < b.id ? -1 : 1));
  const selected = ranked[0];
  return { selected, reason: `Failover auf Key ${selected.label} (Health ${keyHealthScore(selected).toFixed(2)})` };
}

export type RotationReport = {
  fromKeyId: string;
  toKeyId: string;
  reason: string;
  atMs: number;
  /** Mitgefuerte Ausfuehrungsdaten (Kontext bleibt beim Key-Wechsel erhalten). */
  carriedContext: Record<string, unknown>;
};

/** Kontext-erhaltender Failover: 429/402 → naechster Key, Kontext wird getragen. */
export function rotateOnFailure(input: {
  pool: readonly KeyPoolEntry[];
  failedKeyId: string;
  observation: KeyObservation;
  carriedContext: Record<string, unknown>;
}): { pool: readonly KeyPoolEntry[]; report: RotationReport | null } {
  const failed = input.pool.find((entry) => entry.id === input.failedKeyId);
  const observedPool = input.pool.map((entry) =>
    entry.id === input.failedKeyId ? recordKeyObservation(entry, input.observation) : entry,
  );
  if (!failed) {
    return { pool: [...input.pool], report: null };
  }
  const selection = selectFailoverKey(observedPool, { excludeId: input.failedKeyId, provider: failed.provider });
  if (!selection.selected) {
    return { pool: observedPool, report: null };
  }
  return {
    pool: observedPool,
    report: {
      fromKeyId: failed.id,
      toKeyId: selection.selected.id,
      reason: selection.reason,
      atMs: input.observation.nowMs ?? 0,
      carriedContext: { ...input.carriedContext },
    },
  };
}

/** Kostengewichtete Modell-Tiers (relative Kosten je 1k Tokens). */
export const MODEL_TIERS = {
  mini: { cost: 1, handles: ["chat"] as TaskType[] },
  standard: { cost: 4, handles: ["chat", "ui", "code"] as TaskType[] },
  flagship: { cost: 16, handles: ["chat", "ui", "code", "reasoning"] as TaskType[] },
} as const;

export type ModelTierId = keyof typeof MODEL_TIERS;

/** Billigstes Tier, das die Task-Klasse bewaeltigt — Komplexitaet hebt auf. */
export function selectModelTier(taskType: TaskType, complexity: Complexity): ModelTierId {
  const capable = (Object.keys(MODEL_TIERS) as ModelTierId[])
    .filter((tier) => (MODEL_TIERS[tier].handles as readonly TaskType[]).includes(taskType))
    .sort((a, b) => MODEL_TIERS[a].cost - MODEL_TIERS[b].cost);
  if (capable.length === 0) return "flagship";
  if (complexity === "heavy") return "flagship";
  if (complexity === "medium" && capable.length > 1) {
    const standardIndex = capable.indexOf("standard");
    return standardIndex >= 0 ? "standard" : capable[capable.length - 1];
  }
  return capable[0];
}
