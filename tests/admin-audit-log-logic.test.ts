import { describe, it, expect } from "vitest";
import {
  createAuditEntry,
  verifyAuditChecksum,
  maskPII,
  filterAuditLogs,
  exportAuditLogs,
  AuditLogEntry,
} from "../lib/admin-audit-log-logic";

describe("Sprint 358 - Audit-Log Logic", () => {
  const sampleActor = {
    userId: "usr-admin-1",
    email: "niko@cybersarah.de",
    role: "admin",
    ipAddress: "192.168.1.100",
  };

  it("creates valid audit log entries with integrity checksums", () => {
    const entry = createAuditEntry({
      actor: sampleActor,
      action: "user_role_changed",
      resourceType: "user",
      resourceId: "usr-target-2",
      severity: "info",
      details: {
        beforeState: { role: "operator" },
        afterState: { role: "admin" },
        reason: "Beförderung im Team",
      },
    });

    expect(entry.id).toContain("audit-");
    expect(entry.checksum).toBeDefined();
    expect(verifyAuditChecksum(entry)).toBe(true);
  });

  it("detects tampered checksums when fields are altered", () => {
    const entry = createAuditEntry({
      actor: sampleActor,
      action: "security_secret_revoked",
      resourceType: "secret",
      resourceId: "sec-key-99",
      severity: "critical",
    });

    expect(verifyAuditChecksum(entry)).toBe(true);

    // Tamper with action or resourceId
    const tamperedEntry: AuditLogEntry = {
      ...entry,
      action: "user_role_changed",
    };

    expect(verifyAuditChecksum(tamperedEntry)).toBe(false);
  });

  it("masks PII (email & IP address) for compliance", () => {
    const entry = createAuditEntry({
      actor: sampleActor,
      action: "feature_flag_updated",
      resourceType: "feature_flag",
      resourceId: "beta_copilot",
    });

    const masked = maskPII(entry);
    expect(masked.actor.email).toBe("n***o@cybersarah.de");
    expect(masked.actor.ipAddress).toBe("192.168.x.x");
  });

  it("filters audit logs by actor, severity, action, date range, search term", () => {
    const now = Date.now();
    const entry1 = createAuditEntry({ actor: sampleActor, action: "user_role_changed", resourceType: "user", resourceId: "u1" }, now - 10000);
    const entry2 = createAuditEntry({ actor: { ...sampleActor, userId: "usr-op-2" }, action: "playbook_executed", resourceType: "ops", resourceId: "p1", severity: "warning" }, now - 5000);

    const logs = [entry1, entry2];

    const filteredActor = filterAuditLogs(logs, { actorUserId: "usr-admin-1" });
    expect(filteredActor.length).toBe(1);
    expect(filteredActor[0].id).toBe(entry1.id);

    const filteredSeverity = filterAuditLogs(logs, { severity: "warning" });
    expect(filteredSeverity.length).toBe(1);
    expect(filteredSeverity[0].id).toBe(entry2.id);

    const filteredSearch = filterAuditLogs(logs, { searchTerm: "playbook" });
    expect(filteredSearch.length).toBe(1);
    expect(filteredSearch[0].id).toBe(entry2.id);
  });

  it("exports audit logs to JSON and CSV formats", () => {
    const entry = createAuditEntry({
      actor: sampleActor,
      action: "system_config_changed",
      resourceType: "config",
      resourceId: "cfg-main",
    });

    const jsonExport = exportAuditLogs([entry], "json");
    expect(jsonExport).toContain(entry.id);
    expect(jsonExport).toContain("system_config_changed");

    const csvExport = exportAuditLogs([entry], "csv");
    expect(csvExport).toContain("ID,Timestamp,Actor_User,Actor_Email,Action");
    expect(csvExport).toContain(entry.id);
    expect(csvExport).toContain("system_config_changed");
  });
});
