import { describe, it, expect } from "vitest";
import {
  isValidCorrelationId,
  deriveCorrelationId,
  maskContext,
  buildLogEntry,
  passesLevelFilter,
  serializeLogLine,
  filterByCorrelationId,
} from "@/lib/structured-logs-logic";

describe("Sprint 324 — Strukturierte Logs mit Korrelations-ID", () => {
  it("valide Korrelations-IDs erkennen, kaputte ablehnen", () => {
    expect(isValidCorrelationId("abc12345_x")).toBe(true);
    expect(isValidCorrelationId("kurz")).toBe(false);
    expect(isValidCorrelationId(null)).toBe(false);
  });

  it("deriveCorrelationId normalisiert auf 16 Zeichen", () => {
    expect(deriveCorrelationId("a1b2c3d4e5f60718")).toBe("a1b2c3d4e5f60718");
    expect(deriveCorrelationId("XYZ!!!")).toBe("0000000000000000");
  });

  it("maskiert sensitive Kontext-Felder als MASKIERT, laesst andere stehen", () => {
    const masked = maskContext({ apiKey: "sk-123", userId: 7, authToken: "x", note: "ok" });
    expect(masked.apiKey).toBe("MASKIERT");
    expect(masked.authToken).toBe("MASKIERT");
    expect(masked.userId).toBe(7);
    expect(masked.note).toBe("ok");
  });

  it("Log-Eintrag nur mit valider Korrelations-ID, sonst null", () => {
    expect(buildLogEntry("info", "hi", "abc12345_x", {}, 1)).not.toBeNull();
    expect(buildLogEntry("info", "hi", "bad", {}, 1)).toBeNull();
  });

  it("Level-Gate filtert unterhalb des Mindestlevels", () => {
    const e = buildLogEntry("debug", "x", "abc12345_x", {}, 1)!;
    expect(passesLevelFilter(e, "info")).toBe(false);
    expect(passesLevelFilter(e, "debug")).toBe(true);
  });

  it("JSON-Zeile ist parsebar und filterbar nach Korrelations-ID", () => {
    const e1 = buildLogEntry("info", "request", "corr-0001", { a: 1 }, 5)!;
    const e2 = buildLogEntry("error", "boom", "corr-0002", {}, 6)!;
    const lines = [serializeLogLine(e1), serializeLogLine(e2)];
    expect(JSON.parse(lines[0]).correlationId).toBe("corr-0001");
    expect(filterByCorrelationId(lines, "corr-0001")).toHaveLength(1);
    expect(filterByCorrelationId([...lines, "kein-json"], "corr-0002")).toHaveLength(1);
  });
});
