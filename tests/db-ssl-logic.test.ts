import { describe, expect, it } from "vitest";
import { extractSslMode, normalizeAliasSslModes, resolvePgSslConfig, stripSslModeParam } from "../lib/db-ssl-logic";

describe("db-ssl-logic", () => {
  it("liest sslmode aus einer Neon-Connection-URL", () => {
    expect(extractSslMode("postgresql://u:p@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require")).toBe("require");
  });

  it("liefert null ohne sslmode-Parameter", () => {
    expect(extractSslMode("postgresql://u:p@localhost:5432/cybersarah")).toBeNull();
  });

  it("liefert null bei ungueltigem URL-Format statt zu werfen", () => {
    expect(extractSslMode("nicht-eine-url")).toBeNull();
  });

  it("erzwingt TLS ohne Zertifikatspruefung fuer require/prefer (libpq-Semantik)", () => {
    for (const mode of ["require", "prefer"]) {
      expect(resolvePgSslConfig(`postgresql://u:p@host/db?sslmode=${mode}`)).toEqual({ rejectUnauthorized: false });
    }
  });

  it("erzwingt volle Zertifikatspruefung fuer verify-ca/verify-full", () => {
    for (const mode of ["verify-ca", "verify-full"]) {
      expect(resolvePgSslConfig(`postgresql://u:p@host/db?sslmode=${mode}`)).toEqual({ rejectUnauthorized: true });
    }
  });

  it("deaktiviert TLS explizit bei sslmode=disable", () => {
    expect(resolvePgSslConfig("postgresql://u:p@host/db?sslmode=disable")).toBe(false);
  });

  it("erzwingt kein TLS ohne sslmode-Parameter (lokale Entwicklung)", () => {
    expect(resolvePgSslConfig("postgresql://u:p@localhost:5432/cybersarah")).toBe(false);
  });

  it("normalisiert unsichere Alias-Modi zu verify-full", () => {
    for (const mode of ["prefer", "require", "verify-ca"]) {
      const normalized = new URL(normalizeAliasSslModes(`postgresql://u:p@host/db?sslmode=${mode}`));
      expect(normalized.searchParams.get("sslmode")).toBe("verify-full");
    }
  });

  it("lässt verify-full, disable, fehlende Modi und ungültige URLs unverändert", () => {
    for (const url of [
      "postgresql://u:p@host/db?sslmode=verify-full",
      "postgresql://u:p@host/db?sslmode=disable",
      "postgresql://u:p@host/db",
      "not-a-url?sslmode=require",
    ]) {
      expect(normalizeAliasSslModes(url)).toBe(url);
    }
  });
});

describe("stripSslModeParam", () => {
  it("entfernt sslmode aus der URL, behaelt Host/Port/Credentials/DB", () => {
    const out = stripSslModeParam("postgres://u:p@92.5.177.159:443/cybersarah?sslmode=require");
    expect(out).toBe("postgres://u:p@92.5.177.159:443/cybersarah");
  });

  it("laesst URLs ohne sslmode unangetastet", () => {
    const url = "postgres://u:p@hub.example.com:5432/db";
    expect(stripSslModeParam(url)).toBe(url);
  });

  it("behält andere Query-Parameter", () => {
    const out = stripSslModeParam("postgres://u:p@h:5432/db?application_name=x&sslmode=require");
    expect(out).toContain("application_name=x");
    expect(out).not.toContain("sslmode");
  });

  it("gibt ungueltige URLs unveraendert zurueck", () => {
    expect(stripSslModeParam("kein-url")).toBe("kein-url");
  });
});
