/**
 * Self-Healing-Logik (Sprint 125) — reine, testbare Kernlogik.
 *
 * Anomalieerkennung fuer Server-Logs (Runtime-Logger, Render-Streams) und
 * mobile Crash-Reports: bekannte Fehlersignaturen werden klassifiziert
 * (Severity), dedupliziert und — wenn eine bekannte Gegenmassnahme
 * existiert — einem automatisierten Remedy-Workflow zugefuehrt.
 *
 * Diese Datei ist frei von Server- und UI-Importen: Server (Detektion,
 * Enforcement) und Tests werten identisch aus.
 */

export type AnomalySeverity = "low" | "medium" | "critical";

export type AnomalySignatureId =
  | "stack_trace"
  | "esm_interop"
  | "db_connection"
  | "api_timeout"
  | "port_in_use"
  | "out_of_memory"
  | "unhandled_rejection"
  | "http_5xx"
  | "unknown_error";

export interface AnomalyMatch {
  signature: AnomalySignatureId;
  severity: AnomalySeverity;
  /** Menschlich lesbarer Befund fuer das Incident-Ledger. */
  finding: string;
}

interface SignatureRule {
  id: AnomalySignatureId;
  severity: AnomalySeverity;
  patterns: RegExp[];
  finding: string;
  /** Bekannte Gegenmassnahme ("analyze" = Orchestrator-Analyse, "redeploy" = Rollout-Dispatch). */
  remedy: "analyze" | "redeploy" | "none";
}

/** Bekannte Fehlersignaturen — erweiterbar, Reihenfolge = Prioritaet. */
export const SIGNATURE_RULES: readonly SignatureRule[] = [
  {
    id: "out_of_memory",
    severity: "critical",
    patterns: [/heap out of memory/i, /JavaScript heap out of memory/, /OOMKilled/, /fatal error.*memory/i],
    finding: "Speichererschöpfung (Heap/OOM) — Memory Leak oder zu grosse Payloads.",
    remedy: "analyze",
  },
  {
    id: "esm_interop",
    severity: "critical",
    patterns: [/is not a function.*import_/i, /import_\w+\.parse is not a function/, /ERR_REQUIRE_ESM/, /Cannot use import statement outside a module/],
    finding: "ESM/CJS-Interop-Fehler im Bundle — Package-Import inakzeptabel im gebuendelten Build.",
    remedy: "analyze",
  },
  {
    id: "db_connection",
    severity: "critical",
    patterns: [/ECONNREFUSED/, /ETIMEDOUT.*postgres/i, /connection terminated unexpectedly/i, /too many clients/i, /neon.*error/i],
    finding: "Datenbank-Verbindungsproblem (Neon) — Pool-Erschoepfung oder Netzwerk.",
    remedy: "analyze",
  },
  {
    id: "port_in_use",
    severity: "critical",
    patterns: [/EADDRINUSE/, /address already in use/i],
    finding: "Port bereits belegt — Zombie-Prozess oder Doppelstart.",
    remedy: "redeploy",
  },
  {
    id: "stack_trace",
    severity: "medium",
    patterns: [/^\s*at .+\(.*:\d+:\d+\)/, /TypeError:/, /ReferenceError:/, /SyntaxError:/, /RangeError:/],
    finding: "Stack Trace / unbehandelter Laufzeitfehler im Serverprozess.",
    remedy: "analyze",
  },
  {
    id: "unhandled_rejection",
    severity: "medium",
    patterns: [/unhandled promise rejection/i, /UnhandledPromiseRejection/],
    finding: "Unbehandelte Promise-Rejection — fehlende Fehlerbehandlung.",
    remedy: "analyze",
  },
  {
    id: "api_timeout",
    severity: "medium",
    patterns: [/ETIMEDOUT/, /EAI_AGAIN/, /timeout of \d+ms exceeded/i, /Request timeout/i],
    finding: "API-Timeout — externer Provider oder Netzwerklangsamkeit.",
    remedy: "none",
  },
  {
    id: "http_5xx",
    severity: "medium",
    patterns: [/HTTP 5\d\d/, /statusCode.*5\d\d/, /internal server error/i],
    finding: "HTTP-5xx-Antwort — serverseitiger Fehlerpfad getroffen.",
    remedy: "analyze",
  },
];

/** Klassifiziert eine Log-Zeile; null = keine Anomalie. */
export function classifyLogLine(level: string, message: string): AnomalyMatch | null {
  if (level !== "error" && level !== "warn") {
    // Nur Fehler- und Warnstufen pruefen — Info-Logs sind zu teuer zu scannen.
    if (!/error|fail|exception/i.test(message)) return null;
  }
  const text = message.slice(0, 2000);
  for (const rule of SIGNATURE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return { signature: rule.id, severity: rule.severity, finding: rule.finding };
    }
  }
  if (level === "error" && /error|fail|exception/i.test(text)) {
    return { signature: "unknown_error", severity: "low", finding: "Unklassifizierter Fehler (error-Level)." };
  }
  return null;
}

/** Remedy-Aktion fuer eine Signatur (automatisierbar vs. nur Analyse). */
export function remedyFor(signature: AnomalySignatureId): "analyze" | "redeploy" | "none" {
  const rule = SIGNATURE_RULES.find((entry) => entry.id === signature);
  return rule?.remedy ?? "none";
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export type IncidentStatus = "detected" | "analyzing" | "fix_proposed" | "remedied" | "escalated" | "acknowledged";

export interface SelfHealingIncident {
  id: string;
  source: "server_log" | "mobile_crash" | "manual_scan";
  signature: AnomalySignatureId;
  severity: AnomalySeverity;
  finding: string;
  /** Rohe Log-/Stack-Ausschnitte (bei Mobile: verschluesselt). */
  evidence: string[];
  status: IncidentStatus;
  /** Bei Mobile-Crashes: verschluesseltes Payload-Envelope (AES-256-GCM). */
  encryptedPayload?: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Orchestrator-Task-Id der Analyse (falls angestossen). */
  analysisTaskId?: string;
  /** Ergebnis der Analyse (Fix-Vorschlag des Superagenten). */
  analysisResult?: unknown;
  appliedRemedy?: string;
}

/** Dedup-Fenster: gleiche Signatur innerhalb dieserms zusaetzlich erhoehen nur den Zaehler. */
export const DEDUPE_WINDOW_MS = 15 * 60 * 1000;
/** Max. 1 automatische Remedy je Signatur innerhalb dieses Fensters. */
export const AUTO_REMEDY_COOLDOWN_MS = 60 * 60 * 1000;
export const MAX_EVIDENCE_PER_INCIDENT = 25;

/** Fuehrt neue Evidenz in ein passendes offenes Incident oder erstellt ein neues. */
export function mergeIncident(
  incidents: SelfHealingIncident[],
  input: Omit<SelfHealingIncident, "id" | "status" | "occurrenceCount" | "firstSeenAt" | "lastSeenAt">,
  now = new Date(),
): { incidents: SelfHealingIncident[]; incident: SelfHealingIncident; isNew: boolean } {
  const nowMs = now.getTime();
  const existing = incidents.find(
    (incident) =>
      incident.signature === input.signature &&
      incident.source === input.source &&
      incident.status !== "acknowledged" &&
      incident.status !== "remedied" &&
      nowMs - Date.parse(incident.lastSeenAt) < DEDUPE_WINDOW_MS,
  );

  if (existing) {
    existing.occurrenceCount += 1;
    existing.lastSeenAt = now.toISOString();
    existing.evidence = [...existing.evidence, ...input.evidence]
      .slice(-MAX_EVIDENCE_PER_INCIDENT);
    existing.severity = input.severity; // Severity nachfuehren (kann steigen)
    return { incidents: [...incidents], incident: existing, isNew: false };
  }

  const incident: SelfHealingIncident = {
    ...input,
    id: `inc-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    status: "detected",
    occurrenceCount: 1,
    firstSeenAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
  };
  return { incidents: [incident, ...incidents].slice(0, 200), incident, isNew: true };
}

/** Ob eine automatische Remedy-Aktion fuer dieses Incident erlaubt ist. */
export function shouldAutoRemedy(
  incident: SelfHealingIncident,
  lastAutoRemedyAt: Record<string, string>,
  now = new Date(),
): boolean {
  const remedy = remedyFor(incident.signature);
  if (remedy === "none" || incident.severity === "low") return false;
  const last = lastAutoRemedyAt[incident.signature];
  if (last && now.getTime() - Date.parse(last) < AUTO_REMEDY_COOLDOWN_MS) return false;
  return true;
}

/** Bau des Orchestrator-Ziels (Objective) fuer die Analyse eines Incidents. */
export function buildAnalysisObjective(incident: SelfHealingIncident): string {
  return [
    `Analysiere den folgenden ${incident.source === "mobile_crash" ? "mobilen Crash-Report" : "Server-Fehler"} und entwickle einen konkreten Fix-Vorschlag.`,
    ``,
    `Befund: ${incident.finding}`,
    `Signatur: ${incident.signature} | Severity: ${incident.severity} | Haeufigkeit: ${incident.occurrenceCount}x`,
    `Erste Detektion: ${incident.firstSeenAt}`,
    ``,
    `Evidenz (Log-/Stack-Ausschnitte):`,
    ...incident.evidence.slice(-8).map((line, index) => `[${index + 1}] ${line.slice(0, 500)}`),
    ``,
    `Vorgehen: Nutze git.repoStatus, um den aktuellen Code-Stand zu pruefen. Identifiziere die Ursache, schlage einen konkreten Code-Patch (Datei + Aenderung) vor und nenne Verifikationsschritte (Tests, Redeploy). Antworte mit der JSON-Zusammenfassung.`,
  ].join("\n");
}
