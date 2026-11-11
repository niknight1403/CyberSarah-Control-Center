/**
 * Sprint 6 — Tests der Agent-Factory-Logik.
 *
 * Zusagen: Werkzeuge stammen nur aus dem Katalog, kritische Werkzeuge werden
 * nicht stillschweigend vergeben, Sicherheitsprofil und Budget folgen der
 * Rolle, und ein Entwurf ist nur freigabefaehig, wenn er gegen den echten
 * Katalog und die Sicherheitsregeln besteht.
 */
import { describe, expect, it } from "vitest";

import { buildToolProfiles } from "../lib/mcp-governance-logic";
import {
  capabilityHints,
  inferAgentRole,
  nextVersion,
  planAgentFromBrief,
  riskRank,
  roleLabel,
  slugifyAgentKey,
  summarizeAgentSpec,
  validateAgentSpec,
  type AgentSpecDraft,
} from "../lib/mcp-agent-factory-logic";

const profiles = [
  ...buildToolProfiles("websearch", [
    { name: "search_web", description: "Searches the public web and returns ranked results with URLs." },
    { name: "fetch_page", description: "Fetches a web page and returns its text content." },
  ]),
  ...buildToolProfiles("crm-server", [
    { name: "list_contacts", description: "Lists CRM contacts with company and email." },
    { name: "create_note", description: "Creates a note on a contact record." },
    { name: "charge_invoice", description: "Charges the customer invoice and moves money." },
  ]),
  ...buildToolProfiles("docs", [
    { name: "read_pdf", description: "Reads a PDF document and extracts its text." },
  ]),
];

const BRIEF = "Recherchiere taeglich neue B2B-Unternehmen, analysiere deren Webseiten und bewerte qualifizierte Leads.";

function plan(overrides: Partial<Parameters<typeof planAgentFromBrief>[0]> = {}) {
  const result = planAgentFromBrief({ name: "Lead Researcher", brief: BRIEF, profiles, ...overrides });
  if (!result.ok) throw new Error(result.reason);
  return result.draft;
}

describe("Rollen und Schluessel", () => {
  it("erkennt die Rolle aus der Aufgabe", () => {
    expect(inferAgentRole(BRIEF)).toBe("research");
    expect(inferAgentRole("Erstelle eine Marketing-Kampagne mit Ads und SEO")).toBe("marketing");
    expect(inferAgentRole("Betreibe Monitoring der Infrastruktur und Autopiloten")).toBe("operations");
    expect(inferAgentRole("irgendetwas Unbestimmtes")).toBe("generalist");
  });

  it("bildet stabile Schluessel mit Umlauten", () => {
    expect(slugifyAgentKey("Vertriebs Agent Süd")).toBe("vertriebs-agent-sued");
    expect(slugifyAgentKey("  Test  ")).toBe("test");
    expect(slugifyAgentKey("")).toBe("");
  });

  it("liefert lesbare Rollenlabels", () => {
    expect(roleLabel("research")).toBe("Research-Agent");
  });
});

describe("Planung", () => {
  it("weist nur Werkzeuge aus dem Katalog zu", () => {
    const draft = plan();
    const catalog = new Set(profiles.map((profile) => `${profile.serverKey}/${profile.name}`));
    expect(draft.grants.length).toBeGreaterThan(0);
    for (const grant of draft.grants) {
      expect(catalog.has(`${grant.serverKey}/${grant.toolName}`)).toBe(true);
    }
  });

  it("vergibt kritische Werkzeuge nicht ohne ausdrueckliche Erlaubnis", () => {
    const draft = plan({ brief: "Erstelle invoices und charge customer payments fuer Kontakte im CRM" });
    expect(draft.grants.some((grant) => grant.toolName === "charge_invoice")).toBe(false);
    expect(draft.warnings.join(" ")).toContain("kritische Werkzeuge");
    expect(draft.security.approvalFor).toContain("critical");
  });

  it("vergibt kritische Werkzeuge mit Erlaubnis, aber im Assisted-Modus", () => {
    const draft = plan({ brief: "Erstelle invoices und charge customer payments fuer Kontakte im CRM", allowCritical: true });
    expect(draft.grants.some((grant) => grant.toolName === "charge_invoice")).toBe(true);
    expect(draft.security.mode).toBe("assisted");
    expect(draft.security.approvalFor).toEqual(expect.arrayContaining(["high", "critical"]));
  });

  it("respektiert das Vergabelimit", () => {
    const draft = plan({ maxGrants: 2 });
    expect(draft.grants).toHaveLength(2);
  });

  it("vergibt jedes Werkzeug nur einmal", () => {
    const draft = plan();
    const keys = draft.grants.map((grant) => `${grant.serverKey}/${grant.toolName}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("erzeugt Systemprompt, Tests, Kriterien und Monitoring", () => {
    const draft = plan();
    expect(draft.systemPrompt).toContain("Lead Researcher");
    expect(draft.systemPrompt).toContain("Erfinde keine Ergebnisse");
    expect(draft.systemPrompt).toContain("Budget");
    expect(draft.acceptanceTests.length).toBeGreaterThanOrEqual(2);
    expect(draft.qualityCriteria.length).toBeGreaterThanOrEqual(3);
    expect(draft.monitoring.map((rule) => rule.metric)).toContain("kosten_pro_lauf_cent");
    expect(draft.security.budgetCentsPerRun).toBeGreaterThan(0);
    expect(draft.version).toBe(1);
  });

  it("warnt ehrlich, wenn der Katalog leer ist", () => {
    const draft = plan({ profiles: [] });
    expect(draft.grants).toEqual([]);
    expect(draft.warnings.join(" ")).toContain("Kein Werkzeugkatalog");
    expect(draft.warnings.join(" ")).toContain("kein echter Ausfuehrungspfad");
  });

  it("warnt, wenn nichts zur Aufgabe passt", () => {
    const draft = plan({ brief: "Verwalte exotische Sonderfaelle ohne passende Werkzeuge", profiles });
    expect(draft.warnings.length).toBeGreaterThan(0);
  });

  it("weist zu kurze Aufgaben ab", () => {
    const result = planAgentFromBrief({ name: "X", brief: "kurz", profiles });
    expect(result.ok).toBe(false);
  });
});

describe("Validierung", () => {
  function validDraft(): AgentSpecDraft {
    return plan();
  }

  it("akzeptiert einen korrekt geplanten Entwurf", () => {
    const result = validateAgentSpec(validDraft(), profiles);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("erkennt Werkzeuge, die nicht im Katalog sind", () => {
    const draft = validDraft();
    draft.grants.push({ serverKey: "ghost", toolName: "do_magic", riskLevel: "low", purpose: "x" });
    draft.security.allowedServers.push("ghost");
    const result = validateAgentSpec(draft, profiles);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("nicht im Katalog");
  });

  it("verbietet autonomen Modus mit High-/Critical-Werkzeugen", () => {
    const draft = validDraft();
    draft.security.mode = "autonomous";
    draft.grants.push({ serverKey: "crm-server", toolName: "create_note", riskLevel: "high", purpose: "x" });
    draft.security.allowedServers = [...new Set(draft.grants.map((grant) => grant.serverKey))];
    draft.security.maxRiskLevel = "critical";
    const result = validateAgentSpec(draft, profiles);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Autonomer Modus");
  });

  it("verlangt, dass kritische Aktionen freigabepflichtig bleiben", () => {
    const draft = validDraft();
    draft.security.approvalFor = ["high"];
    const result = validateAgentSpec(draft, profiles);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Kritische Aktionen");
  });

  it("erkennt ein zu kleines Sicherheitsprofil", () => {
    const draft = validDraft();
    draft.grants.push({ serverKey: "crm-server", toolName: "create_note", riskLevel: "medium", purpose: "x" });
    draft.security.allowedServers = [...new Set(draft.grants.map((grant) => grant.serverKey))];
    draft.security.maxRiskLevel = "low";
    const result = validateAgentSpec(draft, profiles);
    expect(result.errors.join(" ")).toContain("Risikostufen");
  });

  it("prueft Budget und Schrittlimit", () => {
    const draft = validDraft();
    draft.security.budgetCentsPerRun = 0;
    draft.security.maxStepsPerRun = 0;
    const result = validateAgentSpec(draft, profiles);
    expect(result.errors.join(" ")).toContain("Budget");
    expect(result.errors.join(" ")).toContain("Schrittlimit");
  });

  it("verlangt Server in allowedServers", () => {
    const draft = validDraft();
    draft.grants.push({ serverKey: "docs", toolName: "read_pdf", riskLevel: "low", purpose: "x" });
    const result = validateAgentSpec(draft, profiles);
    expect(result.errors.join(" ")).toContain("fehlt in allowedServers");
  });

  it("warnt bei Agenten ohne Werkzeuge, blockt sie aber nicht", () => {
    const draft = validDraft();
    draft.grants = [];
    draft.security.allowedServers = [];
    draft.security.maxRiskLevel = "low";
    const result = validateAgentSpec(draft, profiles);
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("ohne Werkzeuge");
  });
});

describe("Zusammenfassung und Versionierung", () => {
  it("fasst den Entwurf ohne Prompt-Inhalte zusammen", () => {
    const summary = summarizeAgentSpec(plan());
    expect(summary.tools).toBeGreaterThan(0);
    expect(summary.servers).toBeGreaterThan(0);
    expect(summary.summary).toContain("Research-Agent");
    expect(summary.summary).not.toContain("Regeln:");
  });

  it("erhoeht die Version nur bei echter Aenderung", () => {
    expect(nextVersion(3, false)).toBe(3);
    expect(nextVersion(3, true)).toBe(4);
  });

  it("leitet Faehigkeitshinweise aus der Aufgabe ab", () => {
    expect(capabilityHints("Recherchiere im Web und lies PDFs")).toEqual(expect.arrayContaining(["web", "search", "filesystem"]));
    expect(capabilityHints("Versende Mails und Zahlungen")).toEqual(expect.arrayContaining(["communication", "payments"]));
  });

  it("ordnet Risikostufen korrekt", () => {
    expect(riskRank("critical")).toBeGreaterThan(riskRank("high"));
    expect(riskRank("low")).toBe(0);
  });
});
