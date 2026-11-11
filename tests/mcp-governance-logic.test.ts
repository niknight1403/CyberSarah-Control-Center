/**
 * Sprint 3 — Tests der Governance-Logik (Mission Punkte 3 und 5).
 *
 * Geprüft wird, was ohne Netz und Datenbank entscheidbar ist: Fähigkeits-
 * ableitung, semantische Suche, Risikoklassen, Policy-Entscheidung mit Least
 * Privilege, Argument-Sanitizing und die Gültigkeit von Freigaben.
 */
import { describe, expect, it } from "vitest";

import {
  buildToolProfiles,
  buildToolSignature,
  classifyRisk,
  computeApprovalExpiry,
  deriveCapabilities,
  evaluateToolPolicy,
  isApprovalUsable,
  sanitizeToolArguments,
  searchTools,
  tokenize,
  type CapabilityTag,
} from "../lib/mcp-governance-logic";

const NOW = Date.parse("2026-11-11T06:00:00.000Z");

describe("Fähigkeitsableitung", () => {
  it("erkennt Dateisystem-Werkzeuge an Name und Beschreibung", () => {
    const result = deriveCapabilities({
      name: "read_pdf_file",
      description: "Liest eine PDF-Datei aus dem Verzeichnis",
    });
    expect(result.capabilities).toContain("filesystem");
    expect(result.primaryCapability).toBe("filesystem");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("erkennt Zahlungs-, Kommunikations- und Datenbankwerkzeuge", () => {
    expect(deriveCapabilities({ name: "charge_customer", description: "Stripe payment" }).capabilities).toContain(
      "payments",
    );
    expect(deriveCapabilities({ name: "send_email", description: "Nachricht senden" }).capabilities).toContain(
      "communication",
    );
    expect(deriveCapabilities({ name: "run_sql_query", description: "SQL query on database" }).capabilities).toContain(
      "database",
    );
  });

  it("bleibt bei unklaren Deskriptoren ehrlich bei 'other'", () => {
    const result = deriveCapabilities({ name: "zorp", description: "" });
    expect(result).toEqual({ capabilities: ["other"], primaryCapability: "other", confidence: 0 });
  });

  it("sortiert Fähigkeiten nach Signalstärke und begrenzt auf drei", () => {
    const result = deriveCapabilities({
      name: "query_database",
      description: "SQL database query, also fetch from url and send email",
    });
    expect(result.capabilities.length).toBeLessThanOrEqual(3);
    expect(result.capabilities[0]).toBe("database");
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe("Semantische Suche", () => {
  const profiles = buildToolProfiles("files", [
    { name: "read_pdf", description: "Liest PDF-Dateien aus dem Verzeichnis" },
    { name: "write_file", description: "Schreibt eine Datei" },
    { name: "list_files", description: "Listet Dateien" },
  ]).concat(
    buildToolProfiles("web", [
      { name: "search_web", description: "Websuche im Internet" },
      { name: "charge_card", description: "Zahlung per Stripe" },
    ]),
  );

  it("tokenisiert ohne Stoppwörter und Kleinschreibung", () => {
    expect(tokenize("Lies die PDF-Datei und return files")).toEqual(["lies", "pdf", "datei", "files"]);
  });

  it("findet das passende Werkzeug für 'Tool zum Lesen von PDFs'", () => {
    const results = searchTools("Tool zum Lesen von PDFs", profiles);
    expect(results[0].name).toBe("read_pdf");
    expect(results[0].serverKey).toBe("files");
  });

  it("gewichtet seltene Begriffe stärker als häufige", () => {
    const results = searchTools("pdf datei", profiles);
    expect(results.map((result) => result.name)).toContain("read_pdf");
    expect(results[0].name).toBe("read_pdf");
  });

  it("filtert nach Fähigkeit und Server", () => {
    const payments = searchTools("stripe", profiles, { capability: "payments" });
    expect(payments.map((result) => result.name)).toEqual(["charge_card"]);
    const onlyFiles = searchTools("datei", profiles, { serverKey: "files" });
    expect(onlyFiles.every((result) => result.serverKey === "files")).toBe(true);
  });

  it("liefert bei leerer Anfrage oder ohne Treffer eine leere Liste", () => {
    expect(searchTools("", profiles)).toEqual([]);
    expect(searchTools("quantencomputer", profiles)).toEqual([]);
  });

  it("respektiert das Limit", () => {
    expect(searchTools("datei", profiles, { limit: 1 })).toHaveLength(1);
  });
});

describe("Risikoklassifizierung", () => {
  const cases: [string, string, string][] = [
    ["list_files", "Listet Dateien", "medium"],
    ["drop_table", "Löscht eine Tabelle", "high"],
    ["execute_shell", "Führt einen Befehl aus", "critical"],
    ["charge_card", "Zahlung einziehen", "critical"],
    ["get_weather", "Wetter abrufen", "medium"],
  ];

  it.each(cases)("stuft %s als %s ein", (name, description, expected) => {
    const risk = classifyRisk({ name, description });
    expect(risk.level).toBe(expected);
    expect(risk.reasons.length).toBeGreaterThan(0);
  });

  it("erkennt destruktive Datenbankoperationen als kritisch", () => {
    const risk = classifyRisk({ name: "update_records", description: "Schreibt in die Datenbank" });
    expect(risk.level).toBe("critical");
    expect(risk.reasons.join(" ")).toContain("Datenbank");
  });

  it("nennt bei reinen Leseoperationen den Grund", () => {
    const risk = classifyRisk({ name: "get_status", description: "Status abrufen" });
    expect(risk.level).toBe("low");
    expect(risk.reasons).toContain("lesende Standardoperation");
  });
});

describe("Policy-Entscheidung", () => {
  const readTool = { name: "list_files", description: "Listet Dateien" };
  const writeTool = { name: "send_email", description: "Nachricht senden" };
  const criticalTool = { name: "execute_shell", description: "Führt einen Befehl aus" };

  function evaluate(tool: { name: string; description: string }, permissions: string[], mode: "manual" | "assisted" | "autonomous") {
    return evaluateToolPolicy({ serverKey: "srv", tool, permissions, policy: { mode } });
  }

  it("blockiert bei fehlender Berechtigung (Least Privilege)", () => {
    const result = evaluate(writeTool, ["read"], "autonomous");
    expect(result.decision).toBe("block");
    expect(result.missingPermissions).toContain("write");
    expect(result.reasons.join(" ")).toContain("Berechtigung fehlt");
  });

  it("erlaubt lesende Werkzeuge im assisted-Modus (Dateizugriff nur mit filesystem-Recht)", () => {
    expect(evaluate(readTool, ["read", "network"], "assisted").decision).toBe("block");
    expect(evaluate(readTool, ["read", "network", "filesystem"], "assisted").decision).toBe("allow");
  });

  it("verlangt im manual-Modus auch für mittleres Risiko eine Freigabe", () => {
    const tool = { name: "fetch_url", description: "HTTP fetch" };
    expect(evaluate(tool, ["read", "network"], "manual").decision).toBe("approval_required");
  });

  it("verlangt im assisted-Modus eine Freigabe für schreibende Werkzeuge", () => {
    expect(evaluate(writeTool, ["read", "write"], "assisted").decision).toBe("approval_required");
  });

  it("erlaubt im autonomous-Modus schreibende Werkzeuge, aber nie kritische", () => {
    expect(evaluate(writeTool, ["read", "write"], "autonomous").decision).toBe("allow");
    const critical = evaluate(criticalTool, ["read", "shell"], "autonomous");
    expect(critical.decision).toBe("approval_required");
  });

  it("respektiert die Deny-Liste vor allem anderen", () => {
    const result = evaluateToolPolicy({
      serverKey: "srv",
      tool: readTool,
      permissions: ["read", "network"],
      policy: { mode: "autonomous", deny: ["srv::list_files"] },
    });
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toContain("Deny-Liste");
  });

  it("erlaubt per Allow-Liste ohne fehlende Rechte zu übergehen", () => {
    const allowed = evaluateToolPolicy({
      serverKey: "srv",
      tool: writeTool,
      permissions: ["read", "write"],
      policy: { mode: "assisted", allow: ["send_email"] },
    });
    expect(allowed.decision).toBe("allow");

    const stillBlocked = evaluateToolPolicy({
      serverKey: "srv",
      tool: writeTool,
      permissions: ["read"],
      policy: { mode: "assisted", allow: ["send_email"] },
    });
    expect(stillBlocked.decision).toBe("block");
  });
});

describe("Argument-Sanitizing", () => {
  it("akzeptiert einfache Argumente", () => {
    const result = sanitizeToolArguments({ query: "mcp", limit: 10 });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("lehnt Nicht-Objekte ab", () => {
    expect(sanitizeToolArguments("hallo").ok).toBe(false);
    expect(sanitizeToolArguments([1, 2]).ok).toBe(false);
    expect(sanitizeToolArguments(null).ok).toBe(false);
  });

  it("blockiert Prototype-Pollution-Schlüssel", () => {
    const payload = JSON.parse('{"__proto__": {"admin": true}}') as Record<string, unknown>;
    const result = sanitizeToolArguments(payload);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("__proto__");
  });

  it("blockiert Shell-Metazeichen nur bei Ausführungsfähigkeit", () => {
    const args = { command: "ls; rm -rf /" };
    expect(sanitizeToolArguments(args).ok).toBe(true);
    const shell = sanitizeToolArguments(args, { capabilities: ["code-execution"] });
    expect(shell.ok).toBe(false);
    expect(shell.issues.join(" ")).toContain("Shell-Metazeichen");
  });

  it("blockiert Pfad-Traversal nur bei Dateisystemfähigkeit", () => {
    const args = { path: "../../etc/passwd" };
    expect(sanitizeToolArguments(args).ok).toBe(true);
    const fs = sanitizeToolArguments(args, { capabilities: ["filesystem"] });
    expect(fs.ok).toBe(false);
    expect(fs.issues.join(" ")).toContain("Pfad-Traversal");
  });

  it("begrenzt Tiefe, Länge und Gesamtgröße", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(sanitizeToolArguments(deep).ok).toBe(false);
    expect(sanitizeToolArguments({ text: "x".repeat(9_000) }).ok).toBe(false);
    expect(sanitizeToolArguments({ blob: "y".repeat(40_000) }).ok).toBe(false);
  });

  it("lehnt Steuerzeichen ab", () => {
    const result = sanitizeToolArguments({ text: "zeile\u0000zeile" });
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("Steuerzeichen");
  });
});

describe("Signatur und Freigaben", () => {
  it("Signatur ist stabil und ändert sich mit dem Schema", () => {
    const first = buildToolSignature({ name: "read_pdf", description: "Liest PDFs", inputSchema: { a: 1, b: 2 } });
    const second = buildToolSignature({ name: "read_pdf", description: "Liest PDFs", inputSchema: { b: 2, a: 1 } });
    const changed = buildToolSignature({ name: "read_pdf", description: "Liest PDFs", inputSchema: { a: 2, b: 2 } });
    expect(first).toBe(second);
    expect(changed).not.toBe(first);
  });

  it("berechnet Ablaufzeiten innerhalb fester Grenzen", () => {
    expect(computeApprovalExpiry(NOW, 60_000).getTime()).toBe(NOW + 5 * 60_000);
    expect(computeApprovalExpiry(NOW, 30 * 24 * 60 * 60_000).getTime()).toBe(NOW + 7 * 24 * 60 * 60_000);
    expect(computeApprovalExpiry(NOW).getTime()).toBe(NOW + 24 * 60 * 60_000);
  });

  it("akzeptiert nur genehmigte, nicht abgelaufene Freigaben für dasselbe Werkzeug", () => {
    const target = { serverKey: "srv", toolName: "execute_shell" };
    expect(isApprovalUsable({ status: "approved", expiresAt: new Date(NOW + 60_000) }, target, NOW)).toBe(true);
    expect(isApprovalUsable({ status: "pending", expiresAt: new Date(NOW + 60_000) }, target, NOW)).toBe(false);
    expect(isApprovalUsable({ status: "approved", expiresAt: new Date(NOW - 1) }, target, NOW)).toBe(false);
    expect(
      isApprovalUsable(
        { status: "approved", expiresAt: new Date(NOW + 60_000), serverKey: "other", toolName: "execute_shell" },
        target,
        NOW,
      ),
    ).toBe(false);
  });
});

describe("Profilaufbau", () => {
  it("baut je Werkzeug ein Profil mit Tokens und Signatur", () => {
    const profiles = buildToolProfiles("srv", [{ name: "read_pdf", description: "Liest PDF-Dateien" }]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].capabilities as CapabilityTag[]).toContain("filesystem");
    expect(profiles[0].tokens).toContain("pdf");
    expect(profiles[0].signature).toHaveLength(32);
  });
});
