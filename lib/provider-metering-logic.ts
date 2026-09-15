/**
 * Sprint 115 — Provider-Metering: reine, deterministische Logik, die den
 * Key-Pool (Sprint 78/85) fuer den Admin transparent macht — Verbrauch,
 * 429-Raten, aktiver Fallback-Pfad und naechste Rotation je Provider,
 * ohne Log-Auswertung.
 *
 * Zwei Datenquellen (beide ohne Voll-Keys, nur maskierte Labels):
 *   - der Pool-Zustand (Status, Cooldown-Enden, Restguthaben)
 *   - ein Metering-Ledger: rollierendes Fenster von Aufruf-Ereignissen
 *
 * Warnschwelle vor Key-Erschoepfung: ueberschreitet der Verbrauch eines
 * Keys mit Restguthaben-Angabe die Schwelle (Standard 80 %), wird genau
 * EINE Benachrichtigung je Schwelle und Key getriggert — nachvollziehbar
 * ueber die firedThresholds-Menge, ohne Zaehler-Reset-Magie.
 *
 * Standardnutzer sehen keine Key-Details: die Overview ist admin-only
 * (tRPC adminProcedure im metering-router) und enthaelt keine Secrets.
 */

/* ==================== Konstanten ==================== */

/** Rollierendes Metering-Fenster (24 h). */
export const METERING_WINDOW_MS = 24 * 60 * 60 * 1_000;
/** Maximale Ledger-Ereignisse im Prozessspeicher (Deckel gegen Ausuferung). */
export const METERING_LEDGER_CAP = 2_000;
/** Verbrauchsschwelle (0..1), ab der eine Erschoepfungswarnung feuert. */
export const QUOTA_WARN_THRESHOLD = 0.8;

/* ==================== Typen ==================== */

export type ProviderCallKind = "success" | "http-429" | "http-auth" | "http-other" | "network" | "failover";

export type ProviderMeteringEvent = {
  /** Quelle des Endpoints (z. B. "forge", "gemini-1", "openai") — niemals der Key. */
  source: string;
  kind: ProviderCallKind;
  at: number;
  latencyMs: number;
  /** Beim Failover: Ziel-Quelle des naechsten Versuchs. */
  failoverTo?: string;
};

/** Klassifiziert einen Aufruf-Ausgang in eine Ledger-Kategorie (rein). */
export function classifyProviderCall(httpStatus: number | null, networkError: boolean): ProviderCallKind {
  if (networkError) return "network";
  if (httpStatus === null) return "network";
  if (httpStatus === 429) return "http-429";
  if (httpStatus === 401 || httpStatus === 402 || httpStatus === 403) return "http-auth";
  if (httpStatus >= 200 && httpStatus < 300) return "success";
  return "http-other";
}

/* ==================== Aggregation (rein) ==================== */

export type ProviderMeteringAggregate = {
  source: string;
  /** Aufrufe im Zeitfenster. */
  callsWindow: number;
  /** 429-Antworten im Zeitfenster. */
  http429Window: number;
  /** 429-Rate im Zeitfenster (0..1). */
  rate429Window: number;
  /** Auth-/Guthaben-Fehler im Zeitfenster (401/402/403). */
  httpAuthWindow: number;
  /** Netzwerkfehler im Zeitfenster. */
  networkWindow: number;
  /** Failover-Away-Ereignisse im Zeitfenster. */
  failoversWindow: number;
  /** Durchschnittliche Latenz (ms) der Erfolgs-Aufrufe im Fenster. */
  avgLatencyMs: number;
  /** Letzter Failover-Zeitpunkt (Epoch-ms) oder null. */
  lastFailoverAt: number | null;
};

/** Aggregiert das rollierende Fenster je Quelle — rein, ohne Nebeneffekte. */
export function aggregateProviderMetering(
  events: ProviderMeteringEvent[],
  nowMs: number,
  windowMs: number = METERING_WINDOW_MS,
): Map<string, ProviderMeteringAggregate> {
  const aggregates = new Map<string, ProviderMeteringAggregate>();
  for (const event of events) {
    if (nowMs - event.at > windowMs) continue;
    let entry = aggregates.get(event.source);
    if (!entry) {
      entry = {
        source: event.source,
        callsWindow: 0,
        http429Window: 0,
        httpAuthWindow: 0,
        networkWindow: 0,
        failoversWindow: 0,
        rate429Window: 0,
        avgLatencyMs: 0,
        lastFailoverAt: null,
      };
      aggregates.set(event.source, entry);
    }
    if (event.kind === "success") {
      entry.callsWindow += 1;
      entry.avgLatencyMs = entry.avgLatencyMs === 0 ? event.latencyMs : Math.round((entry.avgLatencyMs + event.latencyMs) / 2);
    } else if (event.kind === "http-429") {
      entry.http429Window += 1;
    } else if (event.kind === "http-auth") {
      entry.httpAuthWindow += 1;
    } else if (event.kind === "network") {
      entry.networkWindow += 1;
    } else if (event.kind === "failover") {
      entry.failoversWindow += 1;
      entry.lastFailoverAt = Math.max(entry.lastFailoverAt ?? 0, event.at);
    } else {
      entry.callsWindow += 1;
    }
  }
  for (const entry of aggregates.values()) {
    const attempts = entry.callsWindow + entry.http429Window + entry.httpAuthWindow + entry.networkWindow;
    entry.rate429Window = attempts > 0 ? entry.http429Window / attempts : 0;
  }
  return aggregates;
}

/* ==================== Quota-Warnschwelle (rein) ==================== */

export type PoolKeyState = {
  id: string;
  /** Maskiertes Label ("…ab12") — niemals der Voll-Key. */
  label: string;
  status: "active" | "cooling" | "exhausted";
  /** Restguthaben relativ (0..1), falls der Provider es meldet — sonst null. */
  remainingCredits: number | null;
  /** Cooldown-Ende (Epoch-ms) oder null. */
  cooldownUntilMs: number | null;
};

export type QuotaWarning = {
  keyId: string;
  label: string;
  /** Verbrauchsanteil 0..1 (1 − Restguthaben). */
  consumptionRatio: number;
  threshold: number;
  message: string;
};

/** Stabile ID fuer die einmalig-je-Schwelle-Menge. */
export function quotaWarningKey(keyId: string, threshold: number): string {
  return `${keyId}:${threshold}`;
}

/**
 * Ermittelt neue Quota-Warnungen: nur Keys mit gemeldetem Restguthaben,
 * nur beim ersten Ueberschreiten der Schwelle je Key (firedThresholds
 * wird vom Aufrufer gepflegt und erweitert — einmalig je Schwelle).
 */
export function evaluateQuotaWarnings(
  pool: PoolKeyState[],
  firedThresholds: ReadonlySet<string>,
  threshold: number = QUOTA_WARN_THRESHOLD,
): { warnings: QuotaWarning[]; fired: string[] } {
  const warnings: QuotaWarning[] = [];
  const fired: string[] = [];
  for (const key of pool) {
    if (key.remainingCredits === null) continue;
    const consumptionRatio = 1 - Math.max(0, Math.min(1, key.remainingCredits));
    if (consumptionRatio < threshold) continue;
    const warningId = quotaWarningKey(key.id, threshold);
    if (firedThresholds.has(warningId)) continue;
    fired.push(warningId);
    warnings.push({
      keyId: key.id,
      label: key.label,
      consumptionRatio,
      threshold,
      message: `Key ${key.label} (${key.id}) hat ${Math.round(consumptionRatio * 100)} % seines Quotas verbraucht — Schwelle ${Math.round(threshold * 100)} % erreicht.`,
    });
  }
  return { warnings, fired };
}

/* ==================== Admin-Overview (rein) ==================== */

export type ProviderMeteringView = {
  source: string;
  label: string;
  status: "active" | "cooling" | "exhausted";
  callsWindow: number;
  /** 429-Antworten absolut im Zeitfenster. */
  http429Window: number;
  rate429Window: number;
  httpAuthWindow: number;
  failoversWindow: number;
  avgLatencyMs: number;
  /** Aktiver Fallback-Pfad: Reihenfolge aktiver Quellen in Ketten-Prioritaet. */
  activePath: string[];
  /** Sekunden bis zum Ablauf des Cooldowns oder null. */
  cooldownRemainingSec: number | null;
  /** Restguthaben relativ oder null (keine Angabe des Providers). */
  remainingCredits: number | null;
};

export type ProviderMeteringOverview = {
  providers: ProviderMeteringView[];
  /** Warnungen, die bereits gefeuert wurden (Admin-Nachvollziehbarkeit). */
  firedWarnings: string[];
  windowHours: number;
  generatedAt: string;
};

/** Kombiniert Pool-Zustaende und Ledger-Aggregate zur Admin-Overview — rein. */
export function buildProviderMeteringOverview(
  pool: PoolKeyState[],
  events: ProviderMeteringEvent[],
  firedThresholds: ReadonlySet<string>,
  nowMs: number,
  windowMs: number = METERING_WINDOW_MS,
): ProviderMeteringOverview {
  const aggregates = aggregateProviderMetering(events, nowMs, windowMs);
  const activePath = pool.filter((key) => key.status === "active").map((key) => key.id);

  const providers: ProviderMeteringView[] = pool.map((key) => {
    const aggregate = aggregates.get(key.id);
    let cooldownRemainingSec: number | null = null;
    if (key.status === "cooling" && key.cooldownUntilMs !== null) {
      cooldownRemainingSec = Math.max(0, Math.round((key.cooldownUntilMs - nowMs) / 1_000));
    }
    return {
      source: key.id,
      label: key.label,
      status: key.status,
      callsWindow: aggregate?.callsWindow ?? 0,
      http429Window: aggregate?.http429Window ?? 0,
      rate429Window: aggregate?.rate429Window ?? 0,
      httpAuthWindow: aggregate?.httpAuthWindow ?? 0,
      failoversWindow: aggregate?.failoversWindow ?? 0,
      avgLatencyMs: aggregate?.avgLatencyMs ?? 0,
      activePath,
      cooldownRemainingSec,
      remainingCredits: key.remainingCredits,
    };
  });

  return {
    providers,
    firedWarnings: [...firedThresholds],
    windowHours: Math.round(windowMs / 3_600_000),
    generatedAt: new Date(nowMs).toISOString(),
  };
}
