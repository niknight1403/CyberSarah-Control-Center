import { describe, expect, it } from "vitest";
import { extractSslMode, resolvePgSslConfig } from "../lib/db-ssl-logic";

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

  it("erzwingt Zertifikatspruefung fuer require/prefer/verify-ca/verify-full", () => {
    for (const mode of ["require", "prefer", "verify-ca", "verify-full"]) {
      expect(resolvePgSslConfig(`postgresql://u:p@host/db?sslmode=${mode}`)).toEqual({ rejectUnauthorized: true });
    }
  });

  it("deaktiviert TLS explizit bei sslmode=disable", () => {
    expect(resolvePgSslConfig("postgresql://u:p@host/db?sslmode=disable")).toBe(false);
  });

  it("erzwingt kein TLS ohne sslmode-Parameter (lokale Entwicklung)", () => {
    expect(resolvePgSslConfig("postgresql://u:p@localhost:5432/cybersarah")).toBe(false);
  });
});
