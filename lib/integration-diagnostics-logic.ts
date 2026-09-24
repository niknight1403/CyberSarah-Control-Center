/**
 * Sprint 342 — Integrations-Diagnose: reine, deterministische Logik
 * fuer einen ECHTEN Probe-Call je Integration.
 *
 * Datenfluss:
 *   Je Integration wird ein definierter Probe-Call beschrieben,
 *   ausgefuehrt (vom Server-Adapter) und das Ergebnis bewertet:
 *   ok, langsam, fehler — mit Latenz und Ursache.
 *
 * Ehrlichkeits-Grenze: Eine Diagnose ohne gelaufenen Probe-Call hat
 *   den Zustand "nicht geprueft" — das ist KEIN Gruen. Ergebnis-Texte
 *   beschreiben, was geprueft wurde, nicht was hoffentlich stimmt.
 */

export type IntegrationName = "email" | "calendar" | "stripe" | "slack" | "webhook-eingang";

export type ProbeSpec = {
  integration: IntegrationName;
  /** Was der Probe-Call wirklich tut (fuer den Nutzer lesbauer Text). */
  actionDescription: string;
  timeoutMs: number;
};

export type ProbeResult = {
  integration: IntegrationName;
  /** null = Probe-Call nicht gelaufen (z. B. nicht konfiguriert). */
  ran: boolean;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
};

export type ProbeVerdict = "gruen" | "langsam" | "rot" | "nicht-geprueft";

export const PROBE_SPECS: Record<IntegrationName, ProbeSpec> = {
  email: { integration: "email", actionDescription: "Test-EMail an die eigene Adresse senden", timeoutMs: 10_000 },
  calendar: { integration: "calendar", actionDescription: "Terminliste des kommenden Tages lesen", timeoutMs: 8_000 },
  stripe: { integration: "stripe", actionDescription: "Abrechnungs-Konto-Status abfragen", timeoutMs: 8_000 },
  slack: { integration: "slack", actionDescription: "Test-Nachricht in den konfigurierten Kanal", timeoutMs: 8_000 },
  "webhook-eingang": { integration: "webhook-eingang", actionDescription: "Signierten Probe-POST an den eigenen Endpunkt", timeoutMs: 8_000 },
};

/** Einzelnen Probe bewerten (reine Funktion). */
export function evaluateProbe(spec: ProbeSpec, result: ProbeResult): { verdict: ProbeVerdict; note: string } {
  if (!result.ran) {
    return {
      verdict: "nicht-geprueft",
      note: `${spec.integration}: NICHT geprueft — ${result.detail || "kein Probe-Call gelaufen"}.`,
    };
  }
  if (!result.ok) {
    return { verdict: "rot", note: `${spec.integration}: Probe FEHLGESCHLAGEN — ${result.detail}.` };
  }
  if (result.latencyMs !== null && result.latencyMs > spec.timeoutMs * 0.8) {
    return { verdict: "langsam", note: `${spec.integration}: ok, aber ${result.latencyMs} ms (knapp am ${spec.timeoutMs} ms Timeout).` };
  }
  return { verdict: "gruen", note: `${spec.integration}: ok (${result.latencyMs ?? "?"} ms) — ${spec.actionDescription}.` };
}

/** Gesamtdiagnose: nur wenn ALLE gelaufenen Probes gruen sind, ist alles gruen. */
export function overallVerdict(verdicts: ProbeVerdict[]): ProbeVerdict {
  if (verdicts.includes("rot")) return "rot";
  if (verdicts.includes("nicht-geprueft")) return "nicht-geprueft";
  if (verdicts.includes("langsam")) return "langsam";
  return "gruen";
}

/** Diagnose-Bericht fuer den Nutzer, je Integration eine Zeile. */
export function buildDiagnosticReport(results: ProbeResult[]): string {
  const lines = results.map((r) => evaluateProbe(PROBE_SPECS[r.integration], r).note);
  const verdict = overallVerdict(results.map((r) => evaluateProbe(PROBE_SPECS[r.integration], r).verdict));
  return `Integrations-Diagnose: ${verdict.toUpperCase()}\n${lines.join("\n")}`;
}

/** Eindeutige klare Farbe fuers UI: nicht geprueft ist GRAU, nicht gruen. */
export function verdictColor(verdict: ProbeVerdict): string {
  switch (verdict) {
    case "gruen": return "#00F2FE";
    case "langsam": return "#FFB300";
    case "rot": return "#FF007F";
    case "nicht-geprueft": return "#666666";
  }
}
