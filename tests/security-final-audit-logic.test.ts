import { describe, expect, it } from "vitest";
import {
  auditRLSPolicies,
  auditSecretHygiene,
  auditRateLimits,
  generateSecurityComplianceReport,
  DBTableSecurity,
  ConfigSecretAudit,
  EndpointRateLimitAudit,
  SecurityFinding,
} from "../lib/security-final-audit-logic";

describe("Sprint 378: Security-Final (security-final-audit-logic)", () => {
  it("prüft RLS-Status aller Datenbanktabellen ehrlich", () => {
    const tables: DBTableSecurity[] = [
      { tableName: "users", rlsEnabled: true, hasPolicies: true, sensitiveColumnsMasked: true },
      { tableName: "audits", rlsEnabled: true, hasPolicies: true, sensitiveColumnsMasked: true },
    ];

    const result = auditRLSPolicies(tables);
    expect(result.isAllRLSEnabled).toBe(true);
    expect(result.unprotectedTables).toEqual([]);

    const dirtyTables: DBTableSecurity[] = [
      ...tables,
      { tableName: "temp_logs", rlsEnabled: false, hasPolicies: false, sensitiveColumnsMasked: false },
    ];
    const dirtyResult = auditRLSPolicies(dirtyTables);
    expect(dirtyResult.isAllRLSEnabled).toBe(false);
    expect(dirtyResult.unprotectedTables).toContain("temp_logs");
  });

  it("auditiert Umgebungsvariablen und Geheimnis-Hygiene", () => {
    const configs: ConfigSecretAudit[] = [
      { key: "DATABASE_URL", value: "postgres://...", isSecretKeyName: true, isExposedUnmasked: false },
      { key: "PUBLIC_SITE_NAME", value: "CyberSarah", isSecretKeyName: false, isExposedUnmasked: true },
    ];

    const clean = auditSecretHygiene(configs);
    expect(clean.isClean).toBe(true);
    expect(clean.exposedKeys).toEqual([]);

    const dirtyConfigs: ConfigSecretAudit[] = [
      ...configs,
      { key: "GITHUB_TOKEN", value: "ghp_123456", isSecretKeyName: true, isExposedUnmasked: true },
    ];
    const dirty = auditSecretHygiene(dirtyConfigs);
    expect(dirty.isClean).toBe(false);
    expect(dirty.exposedKeys).toContain("GITHUB_TOKEN");
  });

  it("prüft Rate-Limiting-Deckung an allen Endpunkten", () => {
    const endpoints: EndpointRateLimitAudit[] = [
      { endpoint: "/api/chat", rateLimitEnabled: true, requestsPerMinuteLimit: 60, isPublic: true },
      { endpoint: "/api/auth/login", rateLimitEnabled: true, requestsPerMinuteLimit: 10, isPublic: true },
    ];

    const protectedResult = auditRateLimits(endpoints);
    expect(protectedResult.isFullyProtected).toBe(true);

    const unprotectedEndpoints: EndpointRateLimitAudit[] = [
      ...endpoints,
      { endpoint: "/api/public/query", rateLimitEnabled: false, requestsPerMinuteLimit: 0, isPublic: true },
    ];
    const unprotectedResult = auditRateLimits(unprotectedEndpoints);
    expect(unprotectedResult.isFullyProtected).toBe(false);
    expect(unprotectedResult.unprotectedEndpoints).toContain("/api/public/query");
  });

  it("erzeugt einen abschließenden Security Compliance Report für Serie-E-Befunde", () => {
    const findings: SecurityFinding[] = [
      { id: "S1", category: "rls", severity: "high", description: "RLS enabled", resolved: true },
      { id: "S2", category: "secrets", severity: "medium", description: "Secrets masked", resolved: true },
      { id: "S3", category: "ratelimit", severity: "high", description: "Rate limit active", resolved: true },
    ];

    const report = generateSecurityComplianceReport(findings);
    expect(report.isFullyCompliant).toBe(true);
    expect(report.securityScore).toBe(100);
    expect(report.openFindings.length).toBe(0);

    const openFindings: SecurityFinding[] = [
      ...findings,
      { id: "S4", category: "pii", severity: "high", description: "Unmasked PII in log", resolved: false },
    ];
    const openReport = generateSecurityComplianceReport(openFindings);
    expect(openReport.isFullyCompliant).toBe(false);
    expect(openReport.securityScore).toBe(75);
    expect(openReport.openFindings.length).toBe(1);
  });
});
