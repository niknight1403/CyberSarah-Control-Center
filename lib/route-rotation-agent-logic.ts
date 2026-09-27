/**
 * Sprint 196 — Autonomer Route-Rotations-Agent: reine Entscheidungslogik.
 *
 * Der Rotations-Agent haelt die kostenlose Managed-Kette (Custom > Groq >
 * OpenRouter > Gemini, lokal Ollama > LM Studio) unterbrechungsfrei am
 * Laufen: Ist die aktive Gratis-Route beeintraechtigt (erschöpfter Key,
 * Cooldown, nicht erreichbar), waehlt der Agent autonom die naechste
 * beste KOSTENFREIE Alternative. Kostenpflichtige Quellen werden NIE
 * gewaehlt. Der Administrator behaelt jederzeit vollen Zugriff: Er kann
 * die Primärroute manuell erzwingen (Force) oder den Agenten pausieren —
 * eine erzwungene Route gilt, solange sie gesund ist; degradiert sie,
 * uebernimmt die Autonomie wieder (unterbrechungsfreie Entwicklung hat
 * Vorrang, die Erzwingung wird mit Grund protokolliert und geloescht).
 *
 * Diese Datei ist bewusst pure (keine fetch/ENV/DB-Abhaengigkeiten) und
 * damit vollstaendig deterministisch testbar. Die Laufzeit (Takt, Probes,
 * KV-Persistenz) liegt in server/route-rotation-agent.ts.
 */

/** Kostenvorbehalt: Quellen der gratis Kette in Zero-Cost-Prioritaet. */
export const FREE_ROUTE_SOURCES = [
  "custom",
  "groq",
  "openrouter",
  "gemini",
  "local-ollama",
  "local-lmstudio",
] as const;

export type FreeRouteSource = (typeof FREE_ROUTE_SOURCES)[number];

/** Pool-Zustand einer Quelle (aus dem realen Anrufverkehr). */
export type RoutePoolStatus = "active" | "cooling" | "exhausted" | "unknown";

/** Ergebnis einer Erreichbarkeits-Probe einer Quelle. */
export type RouteProbeResult = {
  reachable: boolean;
  latencyMs: number;
};

/** Eine entscheidungsrelevante Route im Kandidatensnapshot. */
export type RouteRotationCandidate = {
  source: FreeRouteSource;
  configured: boolean;
  poolStatus: RoutePoolStatus;
  /** Ende des Cooldowns (ms epoch) — null wenn nicht im Cooldown. */
  cooldownUntilMs: number | null;
  /** Letzte Probe (null = noch nie aktiv geprueft). */
  probe: RouteProbeResult | null;
};

/** Entschluss des Agenten pro Tick. */
export type RouteRotationDecision = {
  action: "keep" | "rotate" | "degraded";
  /** Route, die kuenftig die Kette anfuehrt. */
  primary: FreeRouteSource;
  /** Route, die bislang die Kette anfuehrte. */
  previous: FreeRouteSource;
  /** Verstaendlicher Grund (fuer Ledger + Admin-Status). */
  reason: string;
};

/** Persistenter Ledger-Eintrag einer Rotation. */
export type RouteRotationLogEntry = {
  at: string;
  action: RouteRotationDecision["action"];
  from: FreeRouteSource;
  to: FreeRouteSource;
  reason: string;
};

/** Maximal persistierte Ledger-Eintraege (Ring). */
export const MAX_ROUTE_ROTATION_LEDGER = 20;

const freePriority = (source: FreeRouteSource): number => FREE_ROUTE_SOURCES.indexOf(source);

/** Cooldown aktiv? (Status 'cooling' UNED ohne abgelaufenen Endzeitpunkt) */
function cooldownActive(candidate: RouteRotationCandidate, nowMs: number): boolean {
  if (candidate.poolStatus !== "cooling") return false;
  if (candidate.cooldownUntilMs == null) return true;
  return candidate.cooldownUntilMs > nowMs;
}

/** Gesundheit einer Route: konfiguriert, kein aktiver Cooldown, nicht erschöpft, Probe unauffaellig. */
export function isRouteHealthy(candidate: RouteRotationCandidate, nowMs: number): boolean {
  if (!candidate.configured) return false;
  if (candidate.poolStatus === "exhausted") return false;
  if (cooldownActive(candidate, nowMs)) return false;
  if (candidate.probe && !candidate.probe.reachable) return false;
  return true;
}

/**
 * Kernentscheidung: Welche Gratis-Route soll die Kette anfuehren?
 *  - Aktive Route gesund → keep (kein Eingriff, ruhiger Betrieb).
 *  - Aktive Route beeintraechtigt → rotate auf die naechste gesunde
 *    Gratis-Route in Zero-Cost-Prioritaet (geringe Latenz vor Hoeherer).
 *  - KEINE Route gesund → degraded: Kette bleibt unangetastet (der
 *    per-Aufruf-Failover arbeitet Best-Effort weiter), Grund wird
 *    protokolliert und der frueheste Cooldown genannt.
 */
export function planRouteRotation(
  candidates: RouteRotationCandidate[],
  currentPrimary: FreeRouteSource,
  nowMs: number,
): RouteRotationDecision {
  const bySource = new Map(candidates.map((candidate) => [candidate.source, candidate]));
  const current = bySource.get(currentPrimary);
  if (current && isRouteHealthy(current, nowMs)) {
    return { action: "keep", primary: currentPrimary, previous: currentPrimary, reason: "Aktive Route gesund — keine Rotation noetig." };
  }

  const currentReason = !current
    ? `Aktive Route '${currentPrimary}' ist nicht (mehr) konfiguriert.`
    : current.poolStatus === "exhausted"
      ? `Route '${currentPrimary}' erschöpft (Key/Auth/Quota).`
      : cooldownActive(current, nowMs)
        ? `Route '${currentPrimary}' im Cooldown.`
        : current.probe && !current.probe.reachable
          ? `Route '${currentPrimary}' nicht erreichbar (Probe).`
          : `Route '${currentPrimary}' beeintraechtigt.`;

  const healthy = candidates
    .filter((candidate) => candidate.source !== currentPrimary && isRouteHealthy(candidate, nowMs))
    .sort((a, b) => {
      const priority = freePriority(a.source) - freePriority(b.source);
      if (priority !== 0) return priority;
      const latencyA = a.probe?.latencyMs ?? Number.MAX_SAFE_INTEGER;
      const latencyB = b.probe?.latencyMs ?? Number.MAX_SAFE_INTEGER;
      return latencyA - latencyB;
    });

  const next = healthy[0];
  if (next) {
    return { action: "rotate", primary: next.source, previous: currentPrimary, reason: `${currentReason} Rotation auf '${next.source}' (naechste gesunde Gratis-Route).` };
  }

  const cooling = candidates
    .filter((candidate) => cooldownActive(candidate, nowMs) && candidate.cooldownUntilMs != null)
    .sort((a, b) => (a.cooldownUntilMs ?? 0) - (b.cooldownUntilMs ?? 0))[0];
  const reason = cooling
    ? `${currentReason} Keine gesunde Alternative — Best-Effort weiter, fruehester Cooldown endet ${new Date(cooling.cooldownUntilMs ?? nowMs).toISOString()}.`
    : `${currentReason} Keine gesunde Alternative verfuegbar — Best-Effort weiter.`;
  return { action: "degraded", primary: currentPrimary, previous: currentPrimary, reason };
}

/** Ledger begrenzen (neueste zuerst, max. MAX_ROUTE_ROTATION_LEDGER). */
export function normalizeRouteRotationLedger(entries: unknown, max = MAX_ROUTE_ROTATION_LEDGER): RouteRotationLogEntry[] {
  if (!Array.isArray(entries)) return [];
  const cleaned: RouteRotationLogEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.at === "string" &&
      typeof record.reason === "string" &&
      typeof record.from === "string" &&
      typeof record.to === "string" &&
      (record.action === "keep" || record.action === "rotate" || record.action === "degraded")
    ) {
      cleaned.push({
        at: record.at,
        action: record.action,
        from: record.from as FreeRouteSource,
        to: record.to as FreeRouteSource,
        reason: record.reason,
      });
    }
  }
  return cleaned.slice(0, max);
}

/** Ledger-Eintrag aus Entscheidung bauen (neueste zuerst einfuegen). */
export function appendRouteRotationLedger(
  ledger: RouteRotationLogEntry[],
  decision: RouteRotationDecision,
  nowMs: number,
  max = MAX_ROUTE_ROTATION_LEDGER,
): RouteRotationLogEntry[] {
  const entry: RouteRotationLogEntry = {
    at: new Date(nowMs).toISOString(),
    action: decision.action,
    from: decision.previous,
    to: decision.primary,
    reason: decision.reason,
  };
  return [entry, ...ledger].slice(0, max);
}
