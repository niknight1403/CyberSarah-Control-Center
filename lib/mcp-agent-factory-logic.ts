/**
 * Sprint 6 — Agent Factory: aus einer Aufgabe einen pruefbaren Agenten bauen.
 *
 * Diese Datei ist reine Logik: kein IO, keine Uhr, keine Datenbank. Sie
 * beantwortet drei Fragen deterministisch:
 *
 *   1. Welche Rolle und welche Werkzeuge passen zu dieser Aufgabe?
 *   2. Welches Sicherheitsprofil (Modus, Budget, Schrittlimit) folgt daraus?
 *   3. Ist der fertige Entwurf ueberhaupt freigabefaehig?
 *
 * Bewusst KEINE erfundenen Faehigkeiten: Werkzeuge kommen ausschliesslich aus
 * dem uebergebenen Katalog, alles andere landet als Warnung im Entwurf.
 */
import {
  classifyRisk,
  searchTools,
  type CapabilityTag,
  type GovernanceMode,
  type RiskLevel,
  type RiskAssessment,
  type ToolProfile,
} from "./mcp-governance-logic";

export const RISK_ORDER: readonly RiskLevel[] = ["low", "medium", "high", "critical"];

export function riskRank(level: RiskLevel): number {
  return RISK_ORDER.indexOf(level);
}

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}

export type AgentRole =
  | "research"
  | "sales"
  | "marketing"
  | "content"
  | "engineering"
  | "support"
  | "finance"
  | "security"
  | "operations"
  | "generalist";

const ROLE_KEYWORDS: { role: AgentRole; words: readonly string[] }[] = [
  { role: "research", words: ["recherche", "research", "analyse", "analyseagent", "markt", "wettbewerb", "lead", "leads", "prospect"] },
  { role: "sales", words: ["verkauf", "vertrieb", "sales", "angebot", "pipeline", "deal", "crm"] },
  { role: "marketing", words: ["marketing", "kampagne", "campaign", "ads", "anzeigen", "seo", "social"] },
  { role: "content", words: ["content", "text", "blog", "artikel", "video", "bild", "podcast", "newsletter"] },
  { role: "engineering", words: ["code", "entwickl", "repository", "refactor", "bug", "deploy", "pipeline", "test"] },
  { role: "support", words: ["support", "kunde", "kunden", "ticket", "hilfe", "onboarding"] },
  { role: "finance", words: ["finanz", "rechnung", "buchhalt", "umsatz", "kosten", "budget", "stripe"] },
  { role: "security", words: ["sicherheit", "security", "audit", "schwachstelle", "berechtigung", "secret"] },
  { role: "operations", words: ["betrieb", "operations", "monitor", "infrastruktur", "scheduler", "autopilot"] },
];

const ROLE_LABELS: Record<AgentRole, string> = {
  research: "Research-Agent",
  sales: "Sales-Agent",
  marketing: "Marketing-Agent",
  content: "Content-Agent",
  engineering: "Engineering-Agent",
  support: "Customer-Success-Agent",
  finance: "Finance-Agent",
  security: "Security-Agent",
  operations: "Operations-Agent",
  generalist: "Generalist-Agent",
};

const ROLE_BUDGET_CENTS: Record<AgentRole, number> = {
  research: 250,
  sales: 300,
  marketing: 500,
  content: 500,
  engineering: 400,
  support: 200,
  finance: 150,
  security: 200,
  operations: 200,
  generalist: 200,
};

const ROLE_MAX_STEPS: Record<AgentRole, number> = {
  research: 20,
  sales: 18,
  marketing: 20,
  content: 24,
  engineering: 30,
  support: 16,
  finance: 12,
  security: 20,
  operations: 18,
  generalist: 16,
};

export const DEFAULT_MAX_GRANTS = 6;

export function inferAgentRole(brief: string): AgentRole {
  const text = brief.toLowerCase();
  let best: { role: AgentRole; hits: number } = { role: "generalist", hits: 0 };
  for (const entry of ROLE_KEYWORDS) {
    const hits = entry.words.filter((word) => text.includes(word)).length;
    if (hits > best.hits) best = { role: entry.role, hits };
  }
  return best.role;
}

/** Stabiler Schluessel: "Research Agent B2B" -> "research-agent-b2b". */
export function slugifyAgentKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export type AgentToolGrant = {
  serverKey: string;
  toolName: string;
  riskLevel: RiskLevel;
  purpose: string;
};

export type AgentSecurityProfile = {
  mode: GovernanceMode;
  maxRiskLevel: RiskLevel;
  budgetCentsPerRun: number;
  maxStepsPerRun: number;
  /** Risikostufen, die immer eine menschliche Freigabe brauchen. */
  approvalFor: RiskLevel[];
  allowedServers: string[];
};

export type AgentMonitoringRule = { metric: string; warnAbove: number; note: string };

export type AgentSpecDraft = {
  key: string;
  name: string;
  role: AgentRole;
  purpose: string;
  systemPrompt: string;
  grants: AgentToolGrant[];
  security: AgentSecurityProfile;
  acceptanceTests: string[];
  qualityCriteria: string[];
  monitoring: AgentMonitoringRule[];
  version: 1;
  warnings: string[];
};

export type AgentBriefInput = {
  name: string;
  brief: string;
  profiles: ToolProfile[];
  /** Kritische Werkzeuge nur auf ausdrueckliche Anforderung. */
  allowCritical?: boolean;
  maxGrants?: number;
  /** Fuer Stabilitaet in Tests injizierbar. */
  roleHint?: AgentRole;
};

function purposeLine(brief: string): string {
  const cleaned = brief.replace(/\s+/g, " ").trim();
  return cleaned.length > 240 ? `${cleaned.slice(0, 237)}...` : cleaned;
}

function acceptanceTestsFor(role: AgentRole, grants: AgentToolGrant[]): string[] {
  const tests: string[] = [];
  const tools = grants.map((grant) => grant.toolName).slice(0, 3);
  tests.push(
    tools.length > 0
      ? `Fuehrt mindestens einen echten Aufruf ueber ${tools.join(", ")} aus und belegt das Ergebnis.`
      : "Belegt jede Behauptung mit einer Quelle; ohne Werkzeug keine Erfolgsmeldung.",
  );
  switch (role) {
    case "research":
      tests.push("Liefert mindestens drei belegte Quellen mit Datum.");
      tests.push("Kennzeichnet Unsicherheiten statt sie zu ueberspielen.");
      break;
    case "sales":
      tests.push("Erzeugt einen Angebotsentwurf, der ohne Freigabe nicht versendet wird.");
      break;
    case "marketing":
      tests.push("Nennt Zielgruppe, Kanal und Erfolgskennzahl je Vorschlag.");
      break;
    case "content":
      tests.push("Prueft Fakten vor Veroeffentlichung und markiert offene Punkte.");
      break;
    case "engineering":
      tests.push("Aendert Code nur mit Test und gruenem Lauf.");
      break;
    case "finance":
      tests.push("Bewegt kein Geld ohne menschliche Freigabe.");
      break;
    case "security":
      tests.push("Meldet Befunde mit Schweregrad und Reproduktionsschritten.");
      break;
    default:
      tests.push("Bricht bei fehlenden Rechten mit klarer Meldung ab.");
  }
  tests.push("Bricht bei fehlender Freigabe ab, statt sie zu umgehen.");
  return tests;
}

function qualityCriteriaFor(role: AgentRole): string[] {
  const common = [
    "Jedes Ergebnis nennt die verwendeten Werkzeuge und Server.",
    "Keine erfundenen Ergebnisse, Quellen oder Erfolgsquoten.",
  ];
  const specific: Record<AgentRole, string[]> = {
    research: ["Aussagen sind auf Quellen zurueckfuehrbar.", "Aktualitaet der Quellen ist angegeben."],
    sales: ["Angebote passen nachweislich zum Bedarf des Kontakts.", "Kein Versand ohne Freigabe."],
    marketing: ["Jede Massnahme hat eine messbare Kennzahl."],
    content: ["Inhalte sind faktentreu und markenkonform."],
    engineering: ["Aenderungen sind getestet und rueckrollbar."],
    support: ["Antworten loesen das Anliegen oder eskalieren es klar."],
    finance: ["Zahlen sind nachvollziehbar und stimmen mit der Quelle ueberein."],
    security: ["Befunde sind reproduzierbar und priorisiert."],
    operations: ["Stoerungen werden erkannt, bevor Kunden sie melden."],
    generalist: ["Ergebnis erfuellt die Aufgabe vollstaendig, nicht teilweise."],
  };
  return [...common, ...specific[role]];
}

function monitoringFor(role: AgentRole): AgentMonitoringRule[] {
  return [
    { metric: "fehlerquote_prozent", warnAbove: 20, note: `${ROLE_LABELS[role]}: haeufige Fehler deuten auf falsche Werkzeuge hin.` },
    { metric: "kosten_pro_lauf_cent", warnAbove: ROLE_BUDGET_CENTS[role], note: "Budget ueberschritten — Lauf stoppen und pruefen." },
    { metric: "freigaben_offen", warnAbove: 5, note: "Zu viele offene Freigaben blockieren den Autopiloten." },
  ];
}

function buildSystemPrompt(input: {
  name: string;
  role: AgentRole;
  purpose: string;
  grants: AgentToolGrant[];
  security: AgentSecurityProfile;
}): string {
  const toolLines =
    input.grants.length > 0
      ? input.grants.map((grant) => `- ${grant.serverKey}/${grant.toolName} (${grant.riskLevel}): ${grant.purpose}`).join("\n")
      : "- (keine Werkzeuge zugeordnet — Aufgabe ehrlich als nicht ausfuehrbar melden)";

  return [
    `Du bist ${input.name}, ${ROLE_LABELS[input.role]} im CyberSarah Control Center.`,
    `Aufgabe: ${input.purpose}`,
    "",
    "Verfuegbare Werkzeuge (nur diese):",
    toolLines,
    "",
    "Regeln:",
    `1. Arbeite im Modus "${input.security.mode}". Externe oder riskante Aktionen brauchen vorher eine Freigabe.`,
    `2. Halte dich an das Budget von ${input.security.budgetCentsPerRun} Cent und ${input.security.maxStepsPerRun} Schritten pro Lauf.`,
    "3. Erfinde keine Ergebnisse, Quellen, Preise oder Erfolgsquoten. Ohne Beleg keine Behauptung.",
    "4. Wenn ein Werkzeug fehlt oder ein Aufruf scheitert, melde das konkret und schlage die naechste sinnvolle Aktion vor.",
    "5. Fasse am Ende zusammen: was getan wurde, welches Ergebnis belegt ist und was offen bleibt.",
  ].join("\n");
}

export type PlanResult = {
  ok: true;
  draft: AgentSpecDraft;
};

export type PlanFailure = { ok: false; reason: string };

/**
 * Plant einen Agenten aus einer Aufgabe. Werkzeuge stammen ausschliesslich aus
 * dem Katalog; kritische Werkzeuge werden ohne ausdrueckliche Erlaubnis nicht
 * vergeben, sondern als Warnung genannt.
 */
export function planAgentFromBrief(input: AgentBriefInput): PlanResult | PlanFailure {
  const brief = input.brief.trim();
  if (brief.length < 12) return { ok: false, reason: "Aufgabe ist zu kurz (mindestens 12 Zeichen)." };
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, reason: "Agentenname fehlt." };

  const role = input.roleHint ?? inferAgentRole(brief);
  const warnings: string[] = [];
  const maxGrants = Math.max(1, Math.min(input.maxGrants ?? DEFAULT_MAX_GRANTS, 12));

  const ranked = searchTools(brief, input.profiles, { limit: maxGrants * 3 });
  const byKey = new Map(input.profiles.map((profile) => [`${profile.serverKey}\u0000${profile.name}`, profile]));

  const grants: AgentToolGrant[] = [];
  let excludedCritical = 0;
  for (const hit of ranked) {
    if (grants.length >= maxGrants) break;
    const profile = byKey.get(`${hit.serverKey}\u0000${hit.name}`);
    if (!profile) continue;
    const risk = classifyRisk(
      { name: profile.name, description: profile.description },
      profile,
    ) as RiskAssessment;
    if (risk.level === "critical" && !input.allowCritical) {
      excludedCritical += 1;
      continue;
    }
    if (grants.some((grant) => grant.serverKey === hit.serverKey && grant.toolName === hit.name)) continue;
    grants.push({
      serverKey: hit.serverKey,
      toolName: hit.name,
      riskLevel: risk.level,
      purpose: profile.description?.trim() ? profile.description.trim().slice(0, 160) : `Passt zu "${hit.matchedTerms.join(", ")}".`,
    });
  }

  if (input.profiles.length === 0) {
    warnings.push("Kein Werkzeugkatalog vorhanden: der Agent kann nichts ausfuehren, bis Server registriert sind.");
  } else if (ranked.length === 0) {
    warnings.push("Keine passenden Werkzeuge gefunden: Aufgabe praeziser formulieren oder Server registrieren.");
  }
  if (excludedCritical > 0) {
    warnings.push(
      `${excludedCritical} kritische Werkzeuge (z. B. Zahlungen) wurden bewusst nicht vergeben; nur auf ausdrueckliche Anforderung.`,
    );
  }
  if (grants.length === 0) {
    warnings.push("Ohne Werkzeuge bleibt der Agent auf Beratung beschraenkt — kein echter Ausfuehrungspfad.");
  }

  const highestRisk = grants.reduce<RiskLevel>((level, grant) => maxRisk(level, grant.riskLevel), "low");
  const needsApproval = highestRisk === "high" || highestRisk === "critical";
  const mode: GovernanceMode = needsApproval ? "assisted" : "assisted";
  const approvalFor: RiskLevel[] = ["critical"];
  if (needsApproval) approvalFor.push("high");

  const security: AgentSecurityProfile = {
    mode,
    maxRiskLevel: highestRisk,
    budgetCentsPerRun: ROLE_BUDGET_CENTS[role],
    maxStepsPerRun: ROLE_MAX_STEPS[role],
    approvalFor: [...new Set(approvalFor)],
    allowedServers: [...new Set(grants.map((grant) => grant.serverKey))],
  };

  const purpose = purposeLine(brief);
  const draft: AgentSpecDraft = {
    key: slugifyAgentKey(name),
    name,
    role,
    purpose,
    systemPrompt: buildSystemPrompt({ name, role, purpose, grants, security }),
    grants,
    security,
    acceptanceTests: acceptanceTestsFor(role, grants),
    qualityCriteria: qualityCriteriaFor(role),
    monitoring: monitoringFor(role),
    version: 1,
    warnings,
  };

  return { ok: true, draft };
}

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

/** Prueft einen Entwurf gegen den echten Katalog — nicht gegen sich selbst. */
export function validateAgentSpec(spec: AgentSpecDraft, profiles: ToolProfile[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [...spec.warnings];

  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(spec.key)) {
    errors.push("Schluessel muss aus a-z, 0-9 und Bindestrichen bestehen (2..48 Zeichen).");
  }
  if (spec.name.trim().length < 2) errors.push("Name fehlt.");
  if (spec.systemPrompt.trim().length < 80) errors.push("Systemprompt ist zu kurz fuer eine belastbare Rolle.");
  if (spec.purpose.trim().length < 12) errors.push("Aufgabe ist zu kurz beschrieben.");

  const catalog = new Set(profiles.map((profile) => `${profile.serverKey}\u0000${profile.name}`));
  for (const grant of spec.grants) {
    if (!catalog.has(`${grant.serverKey}\u0000${grant.toolName}`)) {
      errors.push(`Werkzeug nicht im Katalog: ${grant.serverKey}/${grant.toolName}.`);
    }
  }
  const keys = spec.grants.map((grant) => `${grant.serverKey}\u0000${grant.toolName}`);
  if (new Set(keys).size !== keys.length) errors.push("Doppelte Werkzeugvergabe.");
  if (spec.grants.length > DEFAULT_MAX_GRANTS * 2) {
    errors.push("Zu viele Werkzeuge fuer einen einzelnen Agenten (maximal 12).");
  }
  if (spec.grants.length === 0) {
    warnings.push("Agent ohne Werkzeuge ist freigabefaehig, aber nicht ausfuehrbar.");
  }

  const required = spec.grants.reduce<RiskLevel>((level, grant) => maxRisk(level, grant.riskLevel), "low");
  if (riskRank(spec.security.maxRiskLevel) < riskRank(required)) {
    errors.push("Sicherheitsprofil deckt nicht alle vergebenen Risikostufen ab.");
  }
  if (spec.security.mode === "autonomous") {
    const risky = spec.grants.filter((grant) => riskRank(grant.riskLevel) >= riskRank("high"));
    if (risky.length > 0) {
      errors.push("Autonomer Modus ist mit High-/Critical-Werkzeugen nicht erlaubt.");
    }
  }
  for (const level of spec.security.approvalFor) {
    if (riskRank(level) < riskRank("medium")) errors.push(`Freigabe fuer "${level}" ist unnoetig und verschleiert echte Risiken.`);
  }
  if (!spec.security.approvalFor.includes("critical")) {
    errors.push("Kritische Aktionen muessen immer freigabepflichtig bleiben.");
  }
  if (spec.security.budgetCentsPerRun <= 0) errors.push("Budget muss groesser als 0 Cent sein.");
  if (spec.security.budgetCentsPerRun > 5_000) warnings.push("Budget ueber 50 EUR pro Lauf — pruefen, ob das gewollt ist.");
  if (spec.security.maxStepsPerRun <= 0 || spec.security.maxStepsPerRun > 60) {
    errors.push("Schrittlimit muss zwischen 1 und 60 liegen.");
  }

  const allowed = new Set(spec.security.allowedServers);
  for (const grant of spec.grants) {
    if (!allowed.has(grant.serverKey)) errors.push(`Server ${grant.serverKey} fehlt in allowedServers.`);
  }
  const grantedServers = new Set(spec.grants.map((grant) => grant.serverKey));
  for (const server of allowed) {
    if (!grantedServers.has(server)) warnings.push(`Server ${server} ist erlaubt, aber ohne vergebenes Werkzeug.`);
  }

  return { ok: errors.length === 0, errors, warnings: [...new Set(warnings)] };
}

/** Kurzfassung fuer UI und Logs: keine Geheimnisse, keine Prompt-Dumps. */
export function summarizeAgentSpec(spec: AgentSpecDraft): {
  key: string;
  label: string;
  tools: number;
  servers: number;
  highestRisk: RiskLevel;
  budgetCents: number;
  summary: string;
} {
  const highestRisk = spec.grants.reduce<RiskLevel>((level, grant) => maxRisk(level, grant.riskLevel), "low");
  return {
    key: spec.key,
    label: ROLE_LABELS[spec.role],
    tools: spec.grants.length,
    servers: new Set(spec.grants.map((grant) => grant.serverKey)).size,
    highestRisk,
    budgetCents: spec.security.budgetCentsPerRun,
    summary: `${ROLE_LABELS[spec.role]} mit ${spec.grants.length} Werkzeug(en) auf ${
      new Set(spec.grants.map((grant) => grant.serverKey)).size
    } Server(n), hoechste Risikostufe ${highestRisk}, Budget ${spec.security.budgetCentsPerRun} Cent pro Lauf.`,
  };
}

/** Erhoeht die Version nur bei echter Aenderung (stabile Vergleiche). */
export function nextVersion(current: number, changed: boolean): number {
  return changed ? current + 1 : current;
}

export function roleLabel(role: AgentRole): string {
  return ROLE_LABELS[role];
}

export function capabilityHints(brief: string): CapabilityTag[] {
  const text = brief.toLowerCase();
  const hints: CapabilityTag[] = [];
  if (/datei|file|pdf|dokument/.test(text)) hints.push("filesystem");
  if (/datenbank|sql|query/.test(text)) hints.push("database");
  if (/web|url|seite|scrape|crawl/.test(text)) hints.push("web");
  if (/such|recherch|search/.test(text)) hints.push("search");
  if (/code|script|programm/.test(text)) hints.push("code-execution");
  if (/mail|nachricht|slack|telegram|whatsapp/.test(text)) hints.push("communication");
  if (/zahlung|rechnung|stripe|preis/.test(text)) hints.push("payments");
  if (/lead|crm|kunde|kontakt/.test(text)) hints.push("crm");
  if (/bild|video|audio|design/.test(text)) hints.push("media");
  if (/deploy|docker|vercel|cloudflare|git/.test(text)) hints.push("devops");
  if (/kalender|termin|meeting/.test(text)) hints.push("calendar");
  if (/analytics|kennzahl|metrik|report/.test(text)) hints.push("analytics");
  return hints;
}
