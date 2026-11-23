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

describe("Sprint 361 — Konfigurations-Screen: Grenzfaelle und Verwaltung", () => {
  beforeEach(() => {
    configViewManager.resetToDefault();
  });

  it("maskiert leere und sehr kurze Geheimnisse vollstaendig", () => {
    expect(configViewManager.maskValue("", "JWT_SECRET")).toBe("••••••••");
    expect(configViewManager.maskValue("abc", "JWT_SECRET")).toBe("••••••••");
    expect(configViewManager.maskValue("12345678", "JWT_SECRET")).toBe("••••••••");
    // Genau neun Zeichen ueberschreiten die Kurzgrenze und werden teilweise sichtbar.
    expect(configViewManager.maskValue("123456789", "JWT_SECRET")).toBe("1234****6789");
  });

  it("maskiert auch postgres-URLs mit postgres-Schema", () => {
    expect(configViewManager.maskValue("postgres://app:pw@db.local:5432/x", "DB_URL")).toBe(
      "postgres://app:****@db.local:5432/x"
    );
  });

  it("laesst nicht-sensitive Werte unveraendert, auch wenn sie leer sind", () => {
    expect(configViewManager.maskValue("", "NODE_ENV")).toBe("");
    expect(configViewManager.maskValue("kurz", "PORT")).toBe("kurz");
  });

  it("erkennt Werttypen inklusive ungueltigem JSON", () => {
    expect(configViewManager.setConfigVariable("FEATURE_ON", "true").valueType).toBe("boolean");
    expect(configViewManager.setConfigVariable("FEATURE_OFF", "false").valueType).toBe("boolean");
    expect(configViewManager.setConfigVariable("WORKERS", "8").valueType).toBe("number");
    expect(configViewManager.setConfigVariable("BLANK", "   ").valueType).toBe("string");
    expect(configViewManager.setConfigVariable("API_BASE", "https://api.example.com").valueType).toBe("url");
    expect(configViewManager.setConfigVariable("HTTP_BASE", "http://api.example.com").valueType).toBe("url");
    expect(configViewManager.setConfigVariable("PG_URL", "postgresql://u:p@h/db").valueType).toBe("url");
    expect(configViewManager.setConfigVariable("OBJ", '{"a":1}').valueType).toBe("json");
    expect(configViewManager.setConfigVariable("ARR", "[1,2]").valueType).toBe("json");
    expect(configViewManager.setConfigVariable("BROKEN_JSON", "{nope").valueType).toBe("string");
  });

  it("markiert erforderliche Variablen ohne Wert als ungueltig", () => {
    const invalid = configViewManager.setConfigVariable("MAIL_KEY", "", "Integrations", {
      isRequired: true,
      description: "SMTP-Zugang",
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.validationError).toContain("MAIL_KEY");
    expect(invalid.isRequired).toBe(true);
    expect(invalid.isSecret).toBe(true);
    expect(invalid.maskedValue).toBe("••••••••");
    expect(invalid.description).toBe("SMTP-Zugang");

    // Nur Leerraum zaehlt ebenfalls als fehlender Wert.
    const blank = configViewManager.setConfigVariable("MAIL_USER", "   ", "Integrations", { isRequired: true });
    expect(blank.isValid).toBe(false);
    expect(blank.validationError).toContain("MAIL_USER");

    // Nicht erforderliche Variable ohne Wert bleibt gueltig.
    const optional = configViewManager.setConfigVariable("OPTIONAL_FLAG", "", "General");
    expect(optional.isValid).toBe(true);
    expect(optional.isRequired).toBe(false);
    expect(optional.validationError).toBeUndefined();
    expect(optional.source).toBe("environment");
  });

  it("ueberschreibt bestehende Variablen statt sie zu duplizieren", () => {
    const first = configViewManager.setConfigVariable("CUSTOM_LIMIT", "10", "General", { source: "file" });
    expect(first.valueType).toBe("number");
    const second = configViewManager.setConfigVariable("CUSTOM_LIMIT", "25", "Server", {
      source: "database",
      description: "Limit aus der Datenbank",
    });
    expect(second.source).toBe("database");
    expect(second.category).toBe("Server");

    const matches = configViewManager.getConfigItems({ searchQuery: "CUSTOM_LIMIT" });
    expect(matches).toHaveLength(1);
    expect(matches[0].rawValue).toBe("25");
    expect(matches[0].maskedValue).toBe("25");
  });

  it("filtert ungueltige Eintraege und ignoriert leere Suchanfragen", () => {
    expect(configViewManager.getConfigItems({ onlyInvalid: true })).toHaveLength(0);

    configViewManager.setConfigVariable("BROKEN_REQUIRED", "", "General", { isRequired: true });
    const invalidOnly = configViewManager.getConfigItems({ onlyInvalid: true });
    expect(invalidOnly.map((i) => i.key)).toEqual(["BROKEN_REQUIRED"]);

    // Leerraum-Suche filtert nichts weg.
    expect(configViewManager.getConfigItems({ searchQuery: "   " })).toHaveLength(
      configViewManager.getConfigItems().length
    );
    // Suche greift auch auf die Beschreibung.
    const byDescription = configViewManager.getConfigItems({ searchQuery: "postgresql" });
    expect(byDescription.some((i) => i.key === "DATABASE_URL")).toBe(true);
    // Gross-/Kleinschreibung ist egal.
    expect(configViewManager.getConfigItems({ searchQuery: "github" })).toHaveLength(1);
    // Kombinierte Filter werden nacheinander angewandt.
    const combined = configViewManager.getConfigItems({ category: "Integrations", onlySecrets: true });
    expect(combined.length).toBeGreaterThan(0);
    expect(combined.every((i) => i.category === "Integrations" && i.isSecret)).toBe(true);
  });

  it("protokolliert maskierte Ansichten inklusive Filter", () => {
    const before = configViewManager.getAuditLogs().length;
    const masked = configViewManager.getMaskedView("viewer-7", "operator", { category: "Auth" });
    expect(masked).toHaveLength(1);
    expect(masked[0].key).toBe("JWT_SECRET");
    expect((masked[0] as any).rawValue).toBeUndefined();

    const logs = configViewManager.getAuditLogs();
    expect(logs).toHaveLength(before + 1);
    expect(logs[0].action).toBe("view_masked");
    expect(logs[0].actorUserId).toBe("viewer-7");
  });

  it("meldet unbekannte Schluessel beim Aufdecken ohne Audit-Eintrag", () => {
    const before = configViewManager.getAuditLogs().length;
    const result = configViewManager.unmaskSecret("GIBT_ES_NICHT", "admin-1", "admin");
    expect(result.success).toBe(false);
    expect(result.rawValue).toBeUndefined();
    expect(result.message).toContain("nicht gefunden");
    expect(configViewManager.getAuditLogs()).toHaveLength(before);
  });

  it("speichert die IP-Adresse im Aufdeck-Audit", () => {
    configViewManager.unmaskSecret("DATABASE_URL", "admin-2", "admin", "203.0.113.9");
    const entry = configViewManager.getAuditLogs()[0];
    expect(entry.action).toBe("unmask_secret");
    expect(entry.ipAddress).toBe("203.0.113.9");
  });

  it("exportiert alle maskierten Felder und protokolliert den Export", () => {
    const before = configViewManager.getAuditLogs().length;
    const parsed = JSON.parse(configViewManager.exportMaskedConfig("admin-3", "admin"));
    const keys = parsed.map((i: any) => i.key);
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("PORT");

    const port = parsed.find((i: any) => i.key === "PORT");
    expect(port).toMatchObject({
      value: "3000",
      category: "Server",
      isSecret: false,
      source: "environment",
      isValid: true,
    });
    expect(parsed.every((i: any) => typeof i.value === "string")).toBe(true);

    const logs = configViewManager.getAuditLogs();
    expect(logs).toHaveLength(before + 1);
    expect(logs[0].action).toBe("export_config");
  });

  it("liefert Audit-Logs als Kopie und setzt beim Reset alles zurueck", () => {
    configViewManager.getMaskedView("usr-9", "operator");
    const copy = configViewManager.getAuditLogs();
    copy.push({ timestamp: 0, actorUserId: "x", actorRole: "x", action: "view_masked" });
    expect(configViewManager.getAuditLogs()).toHaveLength(1);

    configViewManager.setConfigVariable("TEMP_ONLY", "1");
    configViewManager.resetToDefault();
    expect(configViewManager.getAuditLogs()).toHaveLength(0);
    expect(configViewManager.getConfigItems({ searchQuery: "TEMP_ONLY" })).toHaveLength(0);
    expect(configViewManager.getConfigItems()).toHaveLength(8);
  });
});
