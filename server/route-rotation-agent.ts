/**
 * Sprint 196 — Autonomer Route-Rotations-Agent (Laufzeit).
 *
 * Haelt die kostenlose Managed-Kette unterbrechungsfrei am Laufen:
 * Der Agent tickt in einem konfigurierbaren Intervall (ENV
 * AI_ROUTE_ROTATION_INTERVAL_MS, Standard 60 s, deaktivierbar mit
 * AI_ROUTE_ROTATION=false oder Admin-Pause), probiert konfigurierte
 * Gratis-Routen aktiv (GET /models, 2,5 s Timeout) und waehlt — basierend
 * auf Pool-Zustand (echter Anrufverkehr) und Probe-Ergebnissen — autonom
 * die naechste gesunde KOSTENFREIE Route als Primaerroute, sobald die
 * aktive Route erschöpft/abgekuehlt/nicht erreichbar ist. Die Entscheidung
 * liegt rein in lib/route-rotation-agent-logic.ts (deterministisch
 * getestet); dieses Modul kuemmert sich um Takt, Probes und Persistenz.
 *
 * Administrator-Vollzugriff (immer, ohne Ausnahme):
 *  - routeRotationStatus: vollstaendiger Snapshot (Routes, Health, Ledger).
 *  - setRouteRotationEnabled: Agent pausieren/fortsetzen.
 *  - forceRouteRotation: Primaerroute erzwingen ('auto' = Zwang aufheben).
 *    Eine erzwungene Route gilt, solange sie gesund ist; degradiert sie,
 *    uebernimmt die Autonomie wieder und protokolliert den Grund.
 *
 * Persistenz: KV-Schiene (Neon) via db.setModelRouterSetting — der Zustand
 * ueberlebt Restarts; der synchrone Spiegel fuer den Hot-Pfad liegt in
 * server/_core/route-rotation-state.ts (llm.ts sortiert die Primaerroute
 * an die Spitze der Kette, der per-Aufruf-Failover bleibt als zweite
 * Verteidigungslinie vollstaendig erhalten).
 */

import {
  appendRouteRotationLedger,
  FREE_ROUTE_SOURCES,
  isRouteHealthy,
  normalizeRouteRotationLedger,
  planRouteRotation,
  type FreeRouteSource,
  type RouteRotationCandidate,
  type RouteRotationLogEntry,
} from "../lib/route-rotation-agent-logic";
import { getManagedPoolSnapshotForMetering, listManagedFreeRoutes } from "./_core/llm";
import { setRouteRotationPrimary } from "./_core/route-rotation-state";
import * as db from "./db";

const PRIMARY_KEY = "routeRotation.primary";
const ENABLED_KEY = "routeRotation.enabled";
const FORCED_KEY = "routeRotation.forcedPrimary";
const LEDGER_KEY = "routeRotation.ledger";
const LAST_PROBES_KEY = "routeRotation.lastProbes";
const LAST_TICK_KEY = "routeRotation.lastTickAt";

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 2_500;

/** Gespeicherte/aktuelle Zustandswerte (In-Memory; restauriert beim Boot). */
type AgentState = {
  primary: FreeRouteSource | null;
  enabled: boolean;
  forced: FreeRouteSource | null;
  ledger: RouteRotationLogEntry[];
  lastProbes: Partial<Record<FreeRouteSource, { reachable: boolean; latencyMs: number; at: string }>>;
  lastTickAt: string | null;
};

const state: AgentState = {
  primary: null,
  enabled: true,
  forced: null,
  ledger: [],
  lastProbes: {},
  lastTickAt: null,
};

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Konfiguration (ENV)
// ---------------------------------------------------------------------------

export function getRouteRotationIntervalMs(): number {
  const parsed = Number(process.env.AI_ROUTE_ROTATION_INTERVAL_MS);
  if (!Number.isFinite(parsed) || parsed < MIN_INTERVAL_MS) return DEFAULT_INTERVAL_MS;
  return Math.min(parsed, 3_600_000);
}

function rotationEnabledByEnv(): boolean {
  return process.env.AI_ROUTE_ROTATION?.trim().toLowerCase() !== "false";
}

// ---------------------------------------------------------------------------
// Probes (Erreichbarkeit konfigurierter Gratis-Routen)
// ---------------------------------------------------------------------------

type FreeRouteProbeOutcome = { reachable: boolean; latencyMs: number };

/** Probe EINER Route: GET {base}/models mit Bearer (Keys bleiben serverintern). */
async function probeFreeRoute(route: { url: string; apiKey: string; headers?: Record<string, string> }): Promise<FreeRouteProbeOutcome> {
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(`${route.url.replace(/\/+$/, "")}/models`, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${route.apiKey}`, ...(route.headers ?? {}) },
    });
    clearTimeout(timer);
    return { reachable: response.ok, latencyMs: Date.now() - startedAt };
  } catch {
    return { reachable: false, latencyMs: Date.now() - startedAt };
  }
}

// ---------------------------------------------------------------------------
// Kandidaten-Aufbau (Pool-Snapshot + eigene Probes)
// ---------------------------------------------------------------------------

function buildCandidates(
  routes: { source: string }[],
  pool: { id: string; status: string; cooldownUntilMs: number | null }[],
  lastProbes: AgentState["lastProbes"],
): RouteRotationCandidate[] {
  return FREE_ROUTE_SOURCES.map((source) => {
    const route = routes.find((entry) => entry.source === source);
    const poolEntry = pool.find((entry) => entry.id === source);
    const probe = lastProbes[source] ?? null;
    return {
      source,
      configured: Boolean(route),
      poolStatus: (poolEntry?.status as RouteRotationCandidate["poolStatus"]) ?? "unknown",
      cooldownUntilMs: poolEntry?.cooldownUntilMs ?? null,
      probe: probe ? { reachable: probe.reachable, latencyMs: probe.latencyMs } : null,
    };
  });
}

/** Erste konfigurierte Gratis-Route in Zero-Cost-Prioritaet (Boot-Default). */
function defaultPrimary(routes: { source: string }[]): FreeRouteSource | null {
  return FREE_ROUTE_SOURCES.find((source) => routes.some((route) => route.source === source)) ?? null;
}

// ---------------------------------------------------------------------------
// Persistenz (KV, Best-Effort — nie den Tick blockieren)
// ---------------------------------------------------------------------------

async function persistIfChanged(key: string, value: unknown): Promise<void> {
  try {
    await db.setModelRouterSetting(key, value);
  } catch (error) {
    console.warn("[route-rotation] Persistenz fehlgeschlagen:", error instanceof Error ? error.message : error);
  }
}

// ---------------------------------------------------------------------------
// Tick (autonome Entscheidung) — testbar ueber injizierbare Abhaengigkeiten
// ---------------------------------------------------------------------------

export async function runRouteRotationTick(options?: { now?: number }): Promise<void> {
  if (!state.enabled || !rotationEnabledByEnv()) return;
  const nowMs = options?.now ?? Date.now();
  const routes = listManagedFreeRoutes();
  if (routes.length === 0) return;

  // 1. Probes: Erreichbarkeit aller konfigurierten Gratis-Routen bestimmen.
  const probes = await Promise.all(
    routes.map(async (route) => [route.source, await probeFreeRoute(route)] as const),
  );
  for (const [source, outcome] of probes) {
    state.lastProbes[source as FreeRouteSource] = { ...outcome, at: new Date(nowMs).toISOString() };
  }

  // 2. Kandidaten aus Pool-Snapshot (echter Anrufverkehr) + Probes bauen.
  const pool = getManagedPoolSnapshotForMetering();
  const candidates = buildCandidates(routes, pool, state.lastProbes);

  // 3. Primaerroute bestimmen: Admin-Zwang > persistiert > Default.
  let forcedCleared = false;
  if (state.forced && candidates.some((candidate) => candidate.source === state.forced && !candidate.configured)) {
    // Erzwungene Route wurde dekonfiguriert → Zwang verfaellt.
    state.forced = null;
    forcedCleared = true;
  }
  const currentPrimary = state.forced ?? state.primary ?? defaultPrimary(routes);
  if (!currentPrimary) return;

  // 4. Entscheidung (reine Logik, deterministisch getestet).
  let decision = planRouteRotation(candidates, currentPrimary, nowMs);
  let reason = decision.reason;

  // Admin-Zwang: gilt, solange die erzwungene Route gesund ist; sonst
  // uebernimmt die Autonomie wieder (unterbrechungsfreie Entwicklung).
  if (state.forced) {
    const forcedCandidate = candidates.find((candidate) => candidate.source === state.forced);
    if (forcedCandidate && isRouteHealthy(forcedCandidate, nowMs)) {
      decision = { action: "keep", primary: state.forced, previous: state.forced, reason: `Administrator-Zwang aktiv: Route '${state.forced}' gesund.` };
      reason = decision.reason;
    } else {
      forcedCleared = true;
      reason = `Erzwungene Route '${state.forced}' beeintraechtigt — Autonomie uebernimmt. ${decision.reason}`;
      decision = { ...decision, reason };
      state.forced = null;
    }
  }
  if (forcedCleared) await persistIfChanged(FORCED_KEY, null);

  // 5. Anwenden + Ledger (Rotationen immer; 'degraded' nur bei Aenderung).
  if (decision.primary !== state.primary) {
    state.primary = decision.primary;
    setRouteRotationPrimary(decision.primary);
    await persistIfChanged(PRIMARY_KEY, decision.primary);
  }
  if (decision.action !== "keep") {
    const newest = state.ledger[0];
    const duplicate =
      decision.action === "degraded" && newest?.action === "degraded" && newest.to === decision.primary;
    if (!duplicate) {
      state.ledger = appendRouteRotationLedger(
        state.ledger,
        { ...decision, reason },
        nowMs,
      );
      await persistIfChanged(LEDGER_KEY, state.ledger);
    }
  }

  state.lastTickAt = new Date(nowMs).toISOString();
  await Promise.all([
    persistIfChanged(LAST_PROBES_KEY, state.lastProbes),
    persistIfChanged(LAST_TICK_KEY, state.lastTickAt),
  ]);
}

// ---------------------------------------------------------------------------
// Boot / Intervall
// ---------------------------------------------------------------------------

/** Beim Boot den persistenten Zustand restaurieren und den Takt starten. */
export async function restoreRouteRotationState(): Promise<void> {
  try {
    const [primary, enabled, forced, ledger, lastProbes, lastTickAt] = await Promise.all([
      db.getModelRouterSetting<FreeRouteSource>(PRIMARY_KEY),
      db.getModelRouterSetting<boolean>(ENABLED_KEY),
      db.getModelRouterSetting<FreeRouteSource>(FORCED_KEY),
      db.getModelRouterSetting<unknown>(LEDGER_KEY),
      db.getModelRouterSetting<AgentState["lastProbes"]>(LAST_PROBES_KEY),
      db.getModelRouterSetting<string>(LAST_TICK_KEY),
    ]);
    state.primary = primary && FREE_ROUTE_SOURCES.includes(primary) ? primary : null;
    state.enabled = enabled == null ? rotationEnabledByEnv() : Boolean(enabled);
    state.forced = forced && FREE_ROUTE_SOURCES.includes(forced) ? forced : null;
    state.ledger = normalizeRouteRotationLedger(ledger);
    state.lastProbes = lastProbes ?? {};
    state.lastTickAt = lastTickAt ?? null;
    if (state.primary) setRouteRotationPrimary(state.primary);
  } catch (error) {
    console.warn("[route-rotation] Zustand nicht ladbar:", error instanceof Error ? error.message : error);
  }
  startRouteRotationAgent();
}

/** Tick-Intervall starten (idempotent; Deaktivierung bleibt im Tick geprueft). */
export function startRouteRotationAgent(): void {
  if (started) return;
  started = true;
  const intervalMs = getRouteRotationIntervalMs();
  timer = setInterval(() => {
    void runRouteRotationTick().catch((error) => {
      console.warn("[route-rotation] Tick fehlgeschlagen:", error instanceof Error ? error.message : error);
    });
  }, intervalMs);
}

/** Best-Effort-Stopp (Test-Hook; Produktivbetrieb laeuft bis Prozess-Ende). */
export function stopRouteRotationAgentForTests(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

/** Vollstaendiger Reset (nur Tests). */
export function resetRouteRotationAgentForTests(): void {
  stopRouteRotationAgentForTests();
  state.primary = null;
  state.enabled = true;
  state.forced = null;
  state.ledger = [];
  state.lastProbes = {};
  state.lastTickAt = null;
  setRouteRotationPrimary(null);
}

// ---------------------------------------------------------------------------
// Admin-API (voller Zugriff, jederzeit)
// ---------------------------------------------------------------------------

export async function getRouteRotationStatus() {
  const routes = listManagedFreeRoutes();
  const pool = getManagedPoolSnapshotForMetering();
  const candidates = buildCandidates(routes, pool, state.lastProbes);
  return {
    enabled: state.enabled && rotationEnabledByEnv(),
    primary: state.primary,
    forced: state.forced,
    intervalMs: getRouteRotationIntervalMs(),
    lastTickAt: state.lastTickAt,
    routes: candidates.map((candidate) => ({
      ...candidate,
      healthy: isRouteHealthy(candidate, Date.now()),
    })),
    ledger: state.ledger,
  };
}

export async function setRouteRotationEnabled(enabled: boolean): Promise<boolean> {
  state.enabled = Boolean(enabled);
  await persistIfChanged(ENABLED_KEY, state.enabled);
  if (state.enabled) {
    void runRouteRotationTick().catch(() => undefined);
  }
  return state.enabled;
}

/**
 * Primaerroute erzwingen ('to') oder Zwang aufheben ('auto').
 * Ein Zwang gilt, solange die Route gesund ist; degradiert sie, rotiert der
 * Agent autonom weiter und protokolliert den Grund im Ledger.
 */
export async function forceRouteRotation(input: { to: FreeRouteSource | "auto" }): Promise<{ forced: FreeRouteSource | null }> {
  if (input.to === "auto") {
    state.forced = null;
    await persistIfChanged(FORCED_KEY, null);
    void runRouteRotationTick().catch(() => undefined);
    return { forced: null };
  }
  if (!FREE_ROUTE_SOURCES.includes(input.to)) {
    throw new Error(`UNGUELTIGE_ROUTE: '${input.to}' ist keine kostenfreie Route.`);
  }
  state.forced = input.to;
  state.primary = input.to;
  setRouteRotationPrimary(input.to);
  await Promise.all([
    persistIfChanged(FORCED_KEY, input.to),
    persistIfChanged(PRIMARY_KEY, input.to),
  ]);
  return { forced: input.to };
}
