/**
 * Sprint 4 — Tests der Credential-Logik.
 *
 * Sicherheitszusagen im Vordergrund: Klartext wird nie gelistet, Token-URLs
 * nur über HTTPS und nie mit Zugangsdaten, OAuth-Antworten mit Ablaufzeit,
 * Frische mit Sicherheitsabstand.
 */
import { describe, expect, it } from "vitest";

import {
  buildOAuthTokenRequest,
  describeCredentialForList,
  describeCredentialStatus,
  isTokenFresh,
  isValidCredentialValue,
  isValidTokenUrl,
  maskCredential,
  parseOAuthTokenResponse,
  resolveCredentialSource,
} from "../lib/mcp-credential-logic";

const NOW = Date.parse("2026-11-11T06:00:00.000Z");

describe("Quellenauflösung", () => {
  it("bevorzugt den Vault vor der Umgebung", () => {
    const result = resolveCredentialSource({ envVarName: "MCP_TOKEN", env: { MCP_TOKEN: "env-value" }, hasVaultEntry: true });
    expect(result.source).toBe("vault");
    expect(result.value).toBeNull();
    expect(result.reason).toBeNull();
  });

  it("nutzt die ENV-Variable als Fallback", () => {
    const result = resolveCredentialSource({ envVarName: "MCP_TOKEN", env: { MCP_TOKEN: " env-value " }, hasVaultEntry: false });
    expect(result).toEqual({ source: "env", value: "env-value", reason: null });
  });

  it("meldet fehlende Zugangsdaten im Klartext", () => {
    const missingEnv = resolveCredentialSource({ envVarName: "MCP_TOKEN", env: {}, hasVaultEntry: false });
    expect(missingEnv.source).toBe("none");
    expect(missingEnv.reason).toContain("MCP_TOKEN");
    const nothing = resolveCredentialSource({ hasVaultEntry: false });
    expect(nothing.reason).toContain("weder ENV-Referenz noch Vault-Eintrag");
  });

  it("meldet eine leere ENV-Variable als fehlend, nicht als vorhanden", () => {
    const result = resolveCredentialSource({ envVarName: "MCP_TOKEN", env: { MCP_TOKEN: "   " }, hasVaultEntry: false });
    expect(result.source).toBe("none");
  });
});

describe("Maskierung", () => {
  it("zeigt höchstens 3 + 2 Zeichen", () => {
    expect(maskCredential("sk-live-abcdefghijklmnop")).toBe("sk-••••••op");
  });

  it("maskiert kurze Werte vollständig", () => {
    const masked = maskCredential("short");
    expect(masked).not.toContain("short");
    expect(masked).toMatch(/^•+$/);
  });

  it("akzeptiert nur plausible Werte", () => {
    expect(isValidCredentialValue("12345678")).toBe(true);
    expect(isValidCredentialValue("kurz")).toBe(false);
    expect(isValidCredentialValue("x".repeat(9000))).toBe(false);
    expect(isValidCredentialValue(null)).toBe(false);
  });
});

describe("Token-URL", () => {
  it("akzeptiert öffentliche HTTPS-Adressen", () => {
    expect(isValidTokenUrl("https://auth.example.com/oauth/token").ok).toBe(true);
  });

  it("lehnt HTTP, Zugangsdaten in der URL und private Adressen ab", () => {
    expect(isValidTokenUrl("http://auth.example.com/token").ok).toBe(false);
    expect(isValidTokenUrl("https://user:pass@auth.example.com/token").ok).toBe(false);
    expect(isValidTokenUrl("https://localhost/token").ok).toBe(false);
    expect(isValidTokenUrl("https://192.168.1.10/token").ok).toBe(false);
    expect(isValidTokenUrl("keine-url").ok).toBe(false);
  });
});

describe("OAuth2-Client-Credentials", () => {
  const base = {
    tokenUrl: "https://auth.example.com/oauth/token",
    clientId: "cybersarah",
    clientSecret: "super-secret-value",
    scopes: ["read", "write"],
  };

  it("baut einen formatierten Request mit Basic-Auth", () => {
    const result = buildOAuthTokenRequest(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.method).toBe("POST");
    expect(result.request.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(result.request.headers.authorization).toMatch(/^Basic /);
    const body = new URLSearchParams(result.request.body);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("scope")).toBe("read write");
    // Geheimnis niemals in der URL
    expect(result.request.url).not.toContain("super-secret-value");
  });

  it("verweigert ungültige URLs und fehlende Zugangsdaten", () => {
    expect(buildOAuthTokenRequest({ ...base, tokenUrl: "http://auth.example.com/token" }).ok).toBe(false);
    expect(buildOAuthTokenRequest({ ...base, clientId: "  " }).ok).toBe(false);
    expect(buildOAuthTokenRequest({ ...base, clientSecret: "kurz" }).ok).toBe(false);
  });

  it("parst eine erfolgreiche Antwort mit Ablaufzeit", () => {
    const result = parseOAuthTokenResponse(
      200,
      { access_token: "token-abc", token_type: "Bearer", expires_in: 3600, scope: "read write" },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(result.accessToken).toBe("token-abc");
    expect(result.expiresAt?.toISOString()).toBe(new Date(NOW + 3600_000).toISOString());
    expect(result.scopes).toEqual(["read", "write"]);
  });

  it("behandelt Antworten ohne expires_in als unbefristet, aber gültig", () => {
    const result = parseOAuthTokenResponse(200, { access_token: "abc" }, NOW);
    expect(result.ok).toBe(true);
    expect(result.expiresAt).toBeNull();
  });

  it("meldet Fehlerantworten ohne Geheimnisse", () => {
    const rejected = parseOAuthTokenResponse(401, { error: "invalid_client" }, NOW);
    expect(rejected.ok).toBe(false);
    expect(rejected.reason).toContain("invalid_client");
    const noToken = parseOAuthTokenResponse(200, { token_type: "Bearer" }, NOW);
    expect(noToken.reason).toContain("access_token");
    const notJson = parseOAuthTokenResponse(200, null, NOW);
    expect(notJson.ok).toBe(false);
  });
});

describe("Frische und Status", () => {
  it("hält ein Token 60 Sekunden vor Ablauf für verbraucht", () => {
    expect(isTokenFresh(new Date(NOW + 120_000), NOW)).toBe(true);
    expect(isTokenFresh(new Date(NOW + 30_000), NOW)).toBe(false);
    expect(isTokenFresh(null, NOW)).toBe(false);
  });

  it("beschreibt Statik, Frische, Ablauf und Fehlen", () => {
    expect(describeCredentialStatus({ hasSecret: false, kind: "bearer", nowMs: NOW })).toBe("missing");
    expect(describeCredentialStatus({ hasSecret: true, kind: "api_key", nowMs: NOW })).toBe("static");
    expect(
      describeCredentialStatus({
        hasSecret: true,
        kind: "oauth2_client_credentials",
        expiresAt: new Date(NOW + 3_600_000),
        nowMs: NOW,
      }),
    ).toBe("fresh");
    expect(
      describeCredentialStatus({
        hasSecret: true,
        kind: "oauth2_client_credentials",
        expiresAt: new Date(NOW + 5 * 60_000),
        nowMs: NOW,
      }),
    ).toBe("expiring");
    expect(
      describeCredentialStatus({
        hasSecret: true,
        kind: "oauth2_client_credentials",
        expiresAt: new Date(NOW - 1),
        nowMs: NOW,
      }),
    ).toBe("expired");
  });

  it("liefert für Listen nur Metadaten", () => {
    const entry = describeCredentialForList(
      {
        serverKey: "srv",
        kind: "bearer",
        maskedPreview: "sk-••••••op",
        expiresAt: null,
        updatedAt: new Date(NOW),
      },
      NOW,
    );
    expect(entry).toEqual({
      serverKey: "srv",
      kind: "bearer",
      preview: "sk-••••••op",
      status: "static",
      expiresAt: null,
      updatedAt: new Date(NOW).toISOString(),
    });
    expect(Object.keys(entry)).not.toContain("value");
  });
});
