/**
 * Sprint 9 — Tests der Execution Bridge.
 *
 * Zusagen: nur zugewiesene Werkzeuge werden aufgerufen, fehlende Pflichtfelder
 * blocken statt zu raten, Retries gelten nur fuer echte Netzfehler, und das
 * Audit enthaelt niemals Argumentwerte.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CALL_COST_CENTS,
  buildAuditEntry,
  capabilitiesOf,
  checkArguments,
  classifyCallResult,
  describeCall,
  gateCall,
  hashArguments,
  requiredArguments,
  selectToolForTask,
  summarizeArguments,
  type BridgeTool,
} from "../lib/mcp-execution-bridge-logic";
import { buildToolProfiles } from "../lib/mcp-governance-logic";

const searchProfile = buildToolProfiles("websearch", [
  { name: "search_web", description: "Searches the public web and returns ranked results." },
])[0];
const fetchProfile = buildToolProfiles("websearch", [
  { name: "fetch_page", description: "Fetches a web page and returns its text." },
])[0];
const pdfProfile = buildToolProfiles("docs", [
  { name: "read_pdf", description: "Reads a PDF document and extracts its text." },
])[0];
const chargeProfile = buildToolProfiles("stripe", [
  { name: "charge_invoice", description: "Charges the customer invoice and moves money." },
])[0];

const CATALOG: BridgeTool[] = [
  { serverKey: "websearch", tool: { name: "search_web", description: "Searches the public web and returns ranked results." }, profile: searchProfile },
  { serverKey: "websearch", tool: { name: "fetch_page", description: "Fetches a web page and returns its text." }, profile: fetchProfile },
  { serverKey: "docs", tool: { name: "read_pdf", description: "Reads a PDF document and extracts its text." }, profile: pdfProfile },
  { serverKey: "stripe", tool: { name: "charge_invoice", description: "Charges the customer invoice and moves money." }, profile: chargeProfile },
];

const GRANTS = [
  { serverKey: "websearch", toolName: "search_web" },
  { serverKey: "websearch", toolName: "fetch_page" },
];

describe("Werkzeugwahl", () => {
  it("waehlt ein zugewiesenes Werkzeug passend zur Aufgabe", () => {
    const choice = selectToolForTask({ taskText: "Suche im Web nach Wettbewerbern", grants: GRANTS, catalog: CATALOG });
    expect(choice.ok).toBe(true);
    if (!choice.ok) return;
    expect(choice.serverKey).toBe("websearch");
    expect(["search_web", "fetch_page"]).toContain(choice.toolName);
    expect(choice.matched.length).toBeGreaterThan(0);
  });

  it("ignoriert Werkzeuge ohne Grant, auch wenn sie besser passen", () => {
    const choice = selectToolForTask({ taskText: "Lies ein PDF Dokument", grants: GRANTS, catalog: CATALOG });
    if (!choice.ok) return;
    expect(choice.serverKey).not.toBe("docs");
    expect(choice.toolName).not.toBe("read_pdf");
  });

  it("meldet fehlende Katalogtreffer ehrlich", () => {
    const choice = selectToolForTask({ taskText: "Suche im Web", grants: [{ serverKey: "weg", toolName: "fort" }], catalog: CATALOG });
    expect(choice.ok).toBe(false);
    if (choice.ok) return;
    expect(choice.code).toBe("no_granted_tools");
  });

  it("meldet, wenn nichts zur Aufgabe passt", () => {
    const choice = selectToolForTask({ taskText: "xyzzy voellig fremd", grants: GRANTS, catalog: CATALOG });
    expect(choice.ok).toBe(false);
    if (choice.ok) return;
    expect(choice.code).toBe("no_match");
  });

  it("erkennt kritische Werkzeuge", () => {
    const choice = selectToolForTask({
      taskText: "Rechnung charge invoice customer",
      grants: [{ serverKey: "stripe", toolName: "charge_invoice" }],
      catalog: CATALOG,
    });
    expect(choice.ok).toBe(true);
    if (!choice.ok) return;
    expect(choice.riskLevel).toBe("critical");
  });
});

describe("Argumente", () => {
  it("liest Pflichtfelder fehlertolerant", () => {
    expect(requiredArguments({ required: ["url", "depth"] })).toEqual(["url", "depth"]);
    expect(requiredArguments({ required: [1, "url", ""] })).toEqual(["url"]);
    expect(requiredArguments(null)).toEqual([]);
    expect(requiredArguments("kaputt")).toEqual([]);
  });

  it("blockt fehlende Pflichtfelder", () => {
    const check = checkArguments({ required: ["url"], provided: {} });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.missing).toEqual(["url"]);
    expect(check.reason).toContain("keine Werte erfunden");
  });

  it("akzeptiert 0 und false als gueltige Werte", () => {
    const check = checkArguments({ required: ["limit", "force"], provided: { limit: 0, force: false } });
    expect(check.ok).toBe(true);
  });

  it("behandelt leere Strings als fehlend", () => {
    const check = checkArguments({ required: ["url"], provided: { url: "   " } });
    expect(check.ok).toBe(false);
  });

  it("laesst Aufrufe ohne Pflichtfelder durch", () => {
    const check = checkArguments({ required: [], provided: { query: "x" } });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.args).toEqual({ query: "x" });
  });
});

describe("Policy-Gate", () => {
  it("erlaubt harmlose Lese-Werkzeuge im autonomen Modus", () => {
    const gate = gateCall({
      serverKey: "websearch",
      tool: { name: "search_web", description: "Searches the public web." },
      profile: searchProfile,
      permissions: ["read", "network"],
      mode: "autonomous",
    });
    expect(gate.decision).toBe("allow");
  });

  it("verlangt Freigabe fuer Zahlungen in jedem Modus", () => {
    const gate = gateCall({
      serverKey: "stripe",
      tool: { name: "charge_invoice", description: "Charges the customer invoice and moves money." },
      profile: chargeProfile,
      permissions: ["read", "write", "network"],
      mode: "autonomous",
    });
    expect(gate.decision).toBe("approval_required");
    expect(gate.riskLevel).toBe("critical");
  });

  it("blockt bei fehlender Server-Berechtigung", () => {
    const gate = gateCall({
      serverKey: "websearch",
      tool: { name: "search_web", description: "Searches the public web." },
      profile: searchProfile,
      permissions: [],
      mode: "assisted",
    });
    expect(gate.decision).toBe("block");
  });
});

describe("Ergebnis-Einordnung", () => {
  it("erkennt Erfolg", () => {
    expect(classifyCallResult({ ok: true }).kind).toBe("success");
  });

  it("erkennt Freigabebedarf", () => {
    const result = classifyCallResult({ ok: false, reason: "x", approvalRequired: { approvalId: 1, riskLevel: "high", reasons: ["y"] } });
    expect(result.kind).toBe("approval_required");
    expect(result.retryable).toBe(false);
  });

  it("erkennt Blockaden ohne Retry", () => {
    expect(classifyCallResult({ ok: false, reason: "Governance: Werkzeug verboten" }).kind).toBe("blocked");
    expect(classifyCallResult({ ok: false, reason: "Zugangsdaten fehlen: ENV API_KEY" }).retryable).toBe(false);
  });

  it("erkennt wiederholbare Netzfehler", () => {
    expect(classifyCallResult({ ok: false, reason: "Request timeout after 30s" }).retryable).toBe(true);
    expect(classifyCallResult({ ok: false, reason: "HTTP 503" }).retryable).toBe(true);
    expect(classifyCallResult({ ok: false, reason: "x", retryAfterMs: 5000 }).kind).toBe("retryable_failure");
  });

  it("behandelt unklare Fehler als nicht wiederholbar", () => {
    const result = classifyCallResult({ ok: false, reason: "Werkzeug hat eine ungueltige Antwort geliefert" });
    expect(result.kind).toBe("failure");
    expect(result.retryable).toBe(false);
  });
});

describe("Audit", () => {
  it("hasht Argumente stabil und unabhaengig von der Schluesselreihenfolge", () => {
    const a = hashArguments({ a: 1, b: { c: 2, d: 3 } });
    const b = hashArguments({ b: { d: 3, c: 2 }, a: 1 });
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
    expect(hashArguments({ a: 2 })).not.toBe(a);
  });

  it("protokolliert nur Schluessel und Typen, niemals Werte", () => {
    const summary = summarizeArguments({ token: "secret-value", limit: 5, tags: [1, 2], nothing: null });
    expect(summary).toEqual({ token: "string", limit: "number", tags: "array(2)", nothing: "null" });
    expect(JSON.stringify(summary)).not.toContain("secret-value");
  });

  it("baut einen Audit-Eintrag ohne Geheimnisse", () => {
    const entry = buildAuditEntry({
      runId: 3,
      taskId: "research",
      agentKey: "research-scout",
      serverKey: "websearch",
      toolName: "search_web",
      decision: "succeeded",
      riskLevel: "low",
      args: { query: "geheim", apiKey: "sk-live-123" },
      costCents: -5,
      durationMs: -1,
      note: "ok",
      attempt: 0,
      createdAtMs: 1_700_000_000_000,
    });
    expect(entry.costCents).toBe(0);
    expect(entry.durationMs).toBe(0);
    expect(entry.attempt).toBe(1);
    expect(entry.argKeys).toEqual({ query: "string", apiKey: "string" });
    expect(JSON.stringify(entry)).not.toContain("sk-live-123");
    expect(JSON.stringify(entry)).not.toContain("geheim");
    expect(entry.argsHash).toHaveLength(32);
  });

  it("beschreibt Aufrufe kurz und lesbar", () => {
    expect(describeCall({ serverKey: "websearch", toolName: "search_web", decision: "succeeded", riskLevel: "low" })).toBe(
      "websearch/search_web (low): succeeded",
    );
  });

  it("dokumentiert konservative Standardkosten", () => {
    expect(DEFAULT_CALL_COST_CENTS).toBeGreaterThan(0);
    expect(capabilitiesOf(searchProfile)).toContain("search");
  });
});
