/**
 * Klassifikation von Produktiv-Health-Antworten fuer den Uptime-Waechter
 * (.github/workflows/uptime-waechter.yml).
 *
 * Hintergrund (Issue #340, 26.-28.11.2026): app.cybersarah-ki.com lieferte
 * HTTP 503 mit dem Render-Body "This service has been suspended by its owner."
 * Der Waechter behandelte das wie einen gewoehnlichen Ausfall und schrieb bei
 * jeder Pruefung "Render reagiert evtl. gerade neu". Tatsaechlich war der
 * Dienst auf Plattform-Ebene suspendiert: Der Render-API-Aufruf
 * /services/{id}/resume antwortete mit HTTP 400
 * "only services suspended by a user can be resumed" - ein Resume, Deploy oder
 * Code-Fix kann das also grundsaetzlich nicht beheben, es braucht eine
 * Konto-/Billing-Klaerung durch den Eigentuemer.
 *
 * Diese Logik trennt deshalb:
 * - platform_suspended: vom Anbieter suspendiert, nur der Eigentuemer kann handeln
 * - unreachable: keine HTTP-Antwort (DNS, Netz, Timeout)
 * - gateway_error: 502/503/504 ohne Suspension-Marker (Deploy/Neustart moeglich)
 * - http_error: sonstige Fehlerstatus
 * - ok: HTTP 200
 */

/** Marker, die Render bei einer Plattform-Suspendierung ausliefert. */
const SUSPENSION_PATTERNS = [
  /service has been suspended/i,
  /suspended by (its|the) owner/i,
  /service is suspended/i,
];

/** @param {unknown} body */
function normalizeBody(body) {
  if (typeof body !== "string") return "";
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Erkennt eine Anbieter-Suspendierung im Antwortkoerper.
 * @param {unknown} body
 * @returns {boolean}
 */
export function isSuspensionResponse(body) {
  const text = normalizeBody(body);
  if (!text) return false;
  return SUSPENSION_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * @typedef {Object} HealthClassification
 * @property {"ok"|"platform_suspended"|"unreachable"|"gateway_error"|"http_error"} kind
 * @property {number|null} httpStatus
 * @property {boolean} transient       Automatische Erholung plausibel (Neustart/Deploy)?
 * @property {boolean} ownerActionRequired Nur der Eigentuemer kann handeln?
 * @property {string} headline         Kurze Einordnung fuer Issue/Kommentar
 * @property {string} ownerAction      Konkreter naechster Schritt ("" wenn keiner noetig)
 */

/**
 * Klassifiziert eine Health-Antwort.
 * @param {{status?: unknown, body?: unknown}} [response]
 * @returns {HealthClassification}
 */
export function classifyHealthResponse(response) {
  const raw = response ?? {};
  const parsed = Number(raw.status);
  const status = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  const body = raw.body;

  if (status === 200) {
    return {
      kind: "ok",
      httpStatus: 200,
      transient: false,
      ownerActionRequired: false,
      headline: "Produktiv-Health gruen (HTTP 200).",
      ownerAction: "",
    };
  }

  if (isSuspensionResponse(body)) {
    return {
      kind: "platform_suspended",
      httpStatus: status,
      transient: false,
      ownerActionRequired: true,
      headline:
        "Der Dienst ist beim Anbieter suspendiert (Render: \"This service has been suspended by its owner\").",
      ownerAction:
        "Render-Dashboard oeffnen, Service cybersarah-control-center, Status/Billing pruefen und die Suspendierung aufheben. " +
        "Ein Resume ueber die API, ein Deploy oder ein Code-Fix kann das nicht beheben: " +
        "Render lehnt /resume mit HTTP 400 \"only services suspended by a user can be resumed\" ab.",
    };
  }

  if (status === null) {
    return {
      kind: "unreachable",
      httpStatus: null,
      transient: true,
      ownerActionRequired: false,
      headline: "Keine HTTP-Antwort erhalten (DNS-, Netzwerk- oder Timeout-Fehler).",
      ownerAction: "Wenn der Zustand laenger als 30 Minuten anhaelt: DNS-Ziel und Render-Status pruefen.",
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      kind: "gateway_error",
      httpStatus: status,
      transient: true,
      ownerActionRequired: false,
      headline: `Gateway-Fehler HTTP ${status} ohne Suspension-Marker - Dienst startet evtl. gerade neu.`,
      ownerAction: "Deploy-/Restart-Verlauf pruefen, wenn der Zustand laenger als 30 Minuten anhaelt.",
    };
  }

  return {
    kind: "http_error",
    httpStatus: status,
    transient: false,
    ownerActionRequired: false,
    headline: `Health-Endpunkt antwortet mit HTTP ${status}.`,
    ownerAction: "Server-Logs des Deployments pruefen; bei 5xx den letzten Deploy verifizieren.",
  };
}

/**
 * Titel fuer das Alert-Issue (stabil, damit keine Duplikate entstehen).
 * @param {HealthClassification} classification
 */
export function buildAlertTitle(classification) {
  if (classification?.kind === "platform_suspended") {
    return "🚨 Produktiv-Ausfall: Dienst bei Render suspendiert (Eigentuemer-Aktion noetig)";
  }
  return "🚨 Produktiv-Ausfall: app.cybersarah-ki.com nicht erreichbar";
}

/**
 * Body fuer ein neu angelegtes Alert-Issue.
 * @param {{healthUrl: string, classification: HealthClassification, timestamp: string, bodyExcerpt?: string}} input
 */
export function buildAlertIssueBody(input) {
  const healthUrl = input?.healthUrl || "https://app.cybersarah-ki.com/api/health";
  const timestamp = input?.timestamp || "";
  const classification = input?.classification ?? classifyHealthResponse({});
  const status = classification.httpStatus ?? "keine Antwort";
  const lines = [
    `Der automatische Uptime-Waechter hat **${healthUrl}** als nicht erreichbar erkannt (HTTP-Status: \`${status}\`, ${timestamp}).`,
    "",
    `**Einordnung:** ${classification.headline}`,
  ];

  if (classification.kind === "platform_suspended") {
    lines.push(
      "",
      "**Das ist kein Code- oder Deploy-Problem.** Render liefert die Suspensions-Seite aus und lehnt auch das API-Resume ab. " +
        "Der automatische Resume-Workflow (`render-resume.yml`) kann hier nichts bewirken.",
      "",
      `**Naechster Schritt (Eigentuemer):** ${classification.ownerAction}`,
      "",
      "Das Issue wird automatisch geschlossen, sobald der Health-Check wieder HTTP 200 liefert.",
    );
  } else {
    lines.push("", `**Naechster Schritt:** ${classification.ownerAction}`);
    lines.push(
      "",
      "Manuelle Pruefung: Render-Dashboard, `render-diagnose.yml`-Workflow und die Health-URL im Browser.",
    );
  }

  const excerpt = normalizeBody(input?.bodyExcerpt ?? "").slice(0, 300);
  if (excerpt) {
    lines.push("", "<details><summary>Antwortkoerper (gekuerzt)</summary>", "", "```", excerpt, "```", "", "</details>");
  }

  return lines.join("\n");
}

/**
 * Kommentar fuer eine Folgepruefung am bestehenden Alert-Issue.
 * @param {{classification: HealthClassification, timestamp: string}} input
 */
export function buildAlertComment(input) {
  const classification = input?.classification ?? classifyHealthResponse({});
  const timestamp = input?.timestamp || "";
  const status = classification.httpStatus ?? "keine Antwort";
  const head = `⚠️ Immer noch nicht erreichbar (HTTP \`${status}\`, ${timestamp}).`;

  if (classification.kind === "platform_suspended") {
    return [
      head,
      "",
      "Status unveraendert: Suspendierung beim Anbieter. Ohne Aufhebung im Render-Konto kann weder ein Deploy noch ein Resume den Dienst zurueckbringen.",
    ].join("\n");
  }

  return head;
}

/**
 * Discord-Text fuer die Alarmierung.
 * @param {{classification: HealthClassification, timestamp: string}} input
 */
export function buildDiscordMessage(input) {
  const classification = input?.classification ?? classifyHealthResponse({});
  const timestamp = input?.timestamp || "";
  const status = classification.httpStatus ?? "keine Antwort";
  if (classification.kind === "platform_suspended") {
    return `🚨 **CyberSarah Produktiv-Ausfall**: Dienst bei Render suspendiert (HTTP ${status}, ${timestamp}). Nur eine Aufhebung im Render-Konto hilft - Details im GitHub-Issue.`;
  }
  return `🚨 **CyberSarah Produktiv-Ausfall**: app.cybersarah-ki.com nicht erreichbar (HTTP ${status}) - ${timestamp}. Details im GitHub-Issue.`;
}
