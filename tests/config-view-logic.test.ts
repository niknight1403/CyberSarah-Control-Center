import { describe, it, expect, beforeEach } from "vitest";
import { configViewManager } from "../lib/config-view-logic";

describe("Sprint 360 — Konfigurations-Screen Logic", () => {
  beforeEach(() => {
    configViewManager.resetToDefault();
  });

  it("erkennt sensible Schlüssel automatisch", () => {
    expect(configViewManager.isSensitiveKey("DATABASE_URL")).toBe(true);
    expect(configViewManager.isSensitiveKey("JWT_SECRET")).toBe(true);
    expect(configViewManager.isSensitiveKey("API_KEY")).toBe(true);
    expect(configViewManager.isSensitiveKey("MY_TOKEN_VAL")).toBe(true);

    expect(configViewManager.isSensitiveKey("NODE_ENV")).toBe(false);
    expect(configViewManager.isSensitiveKey("PORT")).toBe(false);
    expect(configViewManager.isSensitiveKey("LOG_LEVEL")).toBe(false);
  });

  it("maskiert Passwoerter und Tokens zuverlässig", () => {
    expect(configViewManager.maskValue("postgresql://user:secretpass@host:5432/db", "DATABASE_URL")).toBe(
      "postgresql://user:****@host:5432/db"
    );

    expect(
      configViewManager.maskValue("sk_test_1234567890abcdef", "STRIPE_API_KEY")
    ).toBe("sk_t****cdef");

    expect(configViewManager.maskValue("production", "NODE_ENV")).toBe("production");
  });

  it("liefert die maskierte Ansicht ohne rawValue im Ergebnis", () => {
    const maskedItems = configViewManager.getMaskedView("usr-123", "operator");

    expect(maskedItems.length).toBeGreaterThan(0);
    expect((maskedItems[0] as any).rawValue).toBeUndefined();

    const dbItem = maskedItems.find((i) => i.key === "DATABASE_URL");
    expect(dbItem).toBeDefined();
    expect(dbItem?.isSecret).toBe(true);
    expect(dbItem?.maskedValue).toContain("****");
  });

  it("erlaubt Unmasking nur für Admins und protokolliert die Aktion", () => {
    // Non-admin attempt should fail
    const forbiddenRes = configViewManager.unmaskSecret("JWT_SECRET", "user-norm", "operator");
    expect(forbiddenRes.success).toBe(false);
    expect(forbiddenRes.message).toContain("Zugriff verweigert");
    expect(forbiddenRes.rawValue).toBeUndefined();

    // Admin attempt should succeed
    const adminRes = configViewManager.unmaskSecret("JWT_SECRET", "admin-1", "admin", "10.0.0.5");
    expect(adminRes.success).toBe(true);
    expect(adminRes.rawValue).toContain("super-secret-jwt");

    // Check audit log
    const auditLogs = configViewManager.getAuditLogs();
    expect(auditLogs.length).toBeGreaterThan(0);
    const unmaskAudit = auditLogs.find((a) => a.action === "unmask_secret");
    expect(unmaskAudit).toBeDefined();
    expect(unmaskAudit?.actorUserId).toBe("admin-1");
    expect(unmaskAudit?.key).toBe("JWT_SECRET");
  });

  it("filtert Konfigurationselemente nach Kategorien und Suchbegriffen", () => {
    const dbItems = configViewManager.getConfigItems({ category: "Database" });
    expect(dbItems.every((i) => i.category === "Database")).toBe(true);

    const secretItems = configViewManager.getConfigItems({ onlySecrets: true });
    expect(secretItems.every((i) => i.isSecret)).toBe(true);

    const searched = configViewManager.getConfigItems({ searchQuery: "GitHub" });
    expect(searched.length).toBe(1);
    expect(searched[0].key).toBe("GITHUB_TOKEN");
  });

  it("exportiert maskierte Konfiguration ohne Rohgeheimnisse", () => {
    const jsonExport = configViewManager.exportMaskedConfig("admin-1", "admin");
    const parsed = JSON.parse(jsonExport);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);

    const secretInExport = parsed.find((i: any) => i.key === "JWT_SECRET");
    expect(secretInExport.value).not.toContain("super-secret-jwt");
    expect(secretInExport.value).toContain("****");
  });
});
