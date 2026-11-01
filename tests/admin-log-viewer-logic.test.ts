import { describe, it, expect, beforeEach } from "vitest";
import {
  adminLogViewerManager,
  maskPiiInText,
  LogEntry,
} from "../lib/admin-log-viewer-logic";

describe("Sprint 362 — Log-Viewer im Admin Logic", () => {
  beforeEach(() => {
    adminLogViewerManager.resetToDefault();
  });

  it("maskiert PII und Credentials (E-Mails, Telefonnummern, IP-Adressen, Tokens) in Freitext", () => {
    const raw =
      "Fehler für user max.mustermann@example.de (+491761234567) von IP 10.0.0.12 mit Bearer token_secret_12345";
    const masked = maskPiiInText(raw);

    expect(masked).not.toContain("max.mustermann@example.de");
    expect(masked).toContain("m***n@example.de");

    expect(masked).not.toContain("+491761234567");
    expect(masked).toContain("+4917****4567");

    expect(masked).not.toContain("10.0.0.12");
    expect(masked).toContain("10.0.x.x");

    expect(masked).not.toContain("Bearer token_secret_12345");
    expect(masked).toContain("Bearer ****");
  });

  it("maskiert automatisch bei Ingestion neuer Log-Einträge", () => {
    const entry = adminLogViewerManager.ingestLog({
      timestamp: Date.now(),
      level: "error",
      component: "auth-service",
      message: "Anmeldung fehlgeschlagen für user sara.smith@domain.org",
      ipAddress: "192.168.1.50",
    });

    expect(entry.message).toContain("s***h@domain.org");
    expect(entry.message).not.toContain("sara.smith@domain.org");
    expect(entry.ipAddress).toBe("192.168.x.x");
  });

  it("filtert Logs nach Level, Komponente und Suchbegriff", () => {
    const errorsOnly = adminLogViewerManager.queryLogs({ levels: ["error", "fatal"] });
    expect(errorsOnly.entries.every((l) => l.level === "error" || l.level === "fatal")).toBe(true);

    const gatewayOnly = adminLogViewerManager.queryLogs({ components: ["api-gateway"] });
    expect(gatewayOnly.entries.every((l) => l.component === "api-gateway")).toBe(true);

    const searched = adminLogViewerManager.queryLogs({ searchQuery: "Zahlungs-Gateway" });
    expect(searched.entries.length).toBeGreaterThan(0);
    expect(searched.entries[0].component).toBe("payment-service");
  });

  it("unterstützt Paginierung korrekt", () => {
    const result = adminLogViewerManager.queryLogs({ page: 1, pageSize: 2 });
    expect(result.entries.length).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(result.totalPages).toBeGreaterThanOrEqual(2);
  });

  it("berechnet Log-Statistiken und Fehlerrate", () => {
    const stats = adminLogViewerManager.getLogStats();

    expect(stats.totalCount).toBeGreaterThan(0);
    expect(stats.countByLevel.info).toBeGreaterThan(0);
    expect(stats.errorRatePercentage).toBeGreaterThanOrEqual(0);
    expect(stats.topComponents.length).toBeGreaterThan(0);
  });

  it("exportiert gefilterte Logs im JSON- und CSV-Format", () => {
    const jsonExport = adminLogViewerManager.exportLogs({ levels: ["error"] }, "json");
    const parsed = JSON.parse(jsonExport);
    expect(Array.isArray(parsed)).toBe(true);

    const csvExport = adminLogViewerManager.exportLogs({}, "csv");
    expect(csvExport).toContain("id,timestamp,level,component,correlationId,message");
    expect(csvExport).toContain("api-gateway");
  });
});
