/**
 * Sprint 332 — Health-Deep-Check: reine, deterministische Logik fuer
 * /api/ready — prueft DB und Abhaengigkeiten MIT Timeouts.
 *
 * Datenfluss:
 *   Pruef-Katalog (Name, Timeout, kritisch) plus Check-Ergebnisse
 *   ergeben den Gesamt-Zustand: bereit, degraded oder nicht bereit.
 *
 * Ehrlichkeits-Grenze: Ein lahmender, unkritischer Check macht
 *   "degraded" — nicht "ready". Timeout wird als EIGENER Fehlerzustand
 *   gewertet, nicht als Erfolg mit langer Latenz.
 */

export type HealthCheckKind = "db" | "external-api" | "cache" | "storage";

export type HealthCheckSpec = {
  name: string;
  kind: HealthCheckKind;
  timeoutMs: number;
  critical: boolean;
};

export type HealthCheckOutcome = {
  name: string;
  /** null = Timeout innerhalb der Spezifikation. */
  ok: boolean | null;
  latencyMs: number | null;
  detail: string;
};

export type ReadinessState = "bereit" | "degraded" | "nicht-bereit";

/** Ergebnis je Check bewerten (Timeout bleibt eigener Zustand). */
export function evaluateCheck(spec: HealthCheckSpec, outcome: HealthCheckOutcome): {
  status: "ok" | "langsam" | "timeout" | "fehler";
  note: string;
} {
  if (outcome.ok === null || outcome.latencyMs === null || outcome.latencyMs > spec.timeoutMs) {
    return {
      status: "timeout",
      note: `${spec.name}: keine Antwort innerhalb ${spec.timeoutMs} ms — Timeout, kein Erfolg.`,
    };
  }
  if (!outcome.ok) {
    return { status: "fehler", note: `${spec.name}: ${outcome.detail || "fehlgeschlagen"}.` };
  }
  if (outcome.latencyMs > spec.timeoutMs * 0.8) {
    return { status: "langsam", note: `${spec.name}: ok, aber ${outcome.latencyMs} ms knapp am Timeout.` };
  }
  return { status: "ok", note: `${spec.name}: ok (${outcome.latencyMs} ms).` };
}

/** Gesamt-Zustand: kritische Checks entscheiden, degardierte ehrlich melden. */
export function aggregateReadiness(
  specs: HealthCheckSpec[],
  outcomes: HealthCheckOutcome[],
): { state: ReadinessState; report: string; perCheck: string[] } {
  const perCheck = specs.map((spec) => {
    const outcome = outcomes.find((o) => o.name === spec.name) ?? {
      name: spec.name,
      ok: null,
      latencyMs: null,
      detail: "kein Ergebnis geliefert",
    };
    return { spec, result: evaluateCheck(spec, outcome) };
  });

  const failedCritical = perCheck.filter((c) => c.spec.critical && c.result.status !== "ok");
  const degradedOnly = perCheck.filter((c) => !c.spec.critical && c.result.status !== "ok" && c.result.status !== "langsam");

  const state: ReadinessState =
    failedCritical.length > 0 ? "nicht-bereit" : degradedOnly.length > 0 ? "degraded" : "bereit";

  return {
    state,
    report: `Readiness: ${state}. ${perCheck.map((c) => c.result.note).join(" ")}`,
    perCheck: perCheck.map((c) => `${c.spec.name}: ${c.result.status} (kritisch: ${c.spec.critical})`),
  };
}

/** HTTP-Status fuer /api/ready — 503 bei nicht-bereit, niemals 200 gelogen. */
export function readinessHttpStatus(state: ReadinessState): 200 | 503 {
  return state === "nicht-bereit" ? 503 : 200;
}
