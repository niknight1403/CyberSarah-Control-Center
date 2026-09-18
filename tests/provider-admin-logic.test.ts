/**
 * Sprint 154 — Tests: Provider-Admin-Logik (Diagnose, Masking, Ablauf,
 * Rotation, Verschluesselung, Audit-Hygiene).
 *
 * Deckt die Spezifikations-Punkte ab: fehlender/ungueltiger/abgelaufener/
 * widerrufener Key, 401/403/429/402, Timeout, Netzwerkfehler, 5xx,
 * Rotation erfolgreich/fehlgeschlagen (aktiver Key bleibt unberuehrt),
 * Ablaufwarnstufen, keine Secrets in Audit-Events, Verschluesselungs-
 * Roundtrip und Key-Nie-Im-Klartext.
 */
import { describe, expect, it } from "vitest";

import {
  buildAuditEvent,
  classifyProviderFailure,
  decryptSecret,
  decideRotation,
  encryptSecret,
  expiryWarningLevel,
  maskApiKey,
  missingKeyGuidance,
  providerAdminMeta,
  PROVIDER_ADMIN_META,
  sanitizeAuditDetail,
  secretIntegrityHash,
} from "../lib/provider-admin-logic";

// ---------------------------------------------------------------------------
// Provider-Matrix (Phase 1)
// ---------------------------------------------------------------------------

describe("Provider-Matrix", () => {
  it("enthält alle spezifizierten Provider mit ENV-Namen und Health-Check", () => {
    const ids = PROVIDER_ADMIN_META.map((meta) => meta.id);
    expect(ids).toEqual(
      expect.arrayContaining(["openai", "gemini", "anthropic", "openrouter", "groq", "together", "huggingface", "ollama", "lmstudio", "custom"]),
    );
    for (const meta of PROVIDER_ADMIN_META) {
      if (!meta.local) {
        expect(meta.envKeys.length).toBeGreaterThan(0);
        expect(meta.envKeys[0]).toMatch(/^[A-Z_]+$/);
      }
    }
  });

  it("lehnt unbekannte Provider ab", () => {
    expect(() => providerAdminMeta("kein echter Provider" as never)).toThrow();
  });

  it("nennt fuer fehlende Keys die benoetigte ENV-Variable ohne Wert", () => {
    const meta = providerAdminMeta("groq");
    const { envVar, guidance } = missingKeyGuidance(meta);
    expect(envVar).toBe("AI_GROQ_API_KEY");
    expect(guidance).toContain("AI_GROQ_API_KEY");
    expect(guidance).toContain("KEINEN erfundenen Key");
    expect(guidance).not.toMatch(/gsk_[A-Za-z0-9]/);
  });
});

// ---------------------------------------------------------------------------
// Fehlerklassifikation (Phase 2/3)
// ---------------------------------------------------------------------------

describe("classifyProviderFailure", () => {
  it("401 => ungültiger Key", () => {
    const result = classifyProviderFailure({ status: 401 });
    expect(result.diagnosis).toBe("invalid");
    expect(result.safeMessage).not.toContain("sk-");
  });

  it("403 mit expired-Hinweis => abgelaufen", () => {
    const result = classifyProviderFailure({ status: 403, bodyText: "API key has expired" });
    expect(result.diagnosis).toBe("expired");
  });

  it("403 mit revoked-Hinweis => widerrufen", () => {
    const result = classifyProviderFailure({ status: 403, bodyText: "token revoked" });
    expect(result.diagnosis).toBe("revoked");
  });

  it("403 ohne Hinweis => keine Berechtigung", () => {
    const result = classifyProviderFailure({ status: 403 });
    expect(result.diagnosis).toBe("permission_denied");
  });

  it("402 => Billing-/Quota-Problem", () => {
    expect(classifyProviderFailure({ status: 402 }).diagnosis).toBe("quota");
  });

  it("429 => Rate-Limit", () => {
    expect(classifyProviderFailure({ status: 429 }).diagnosis).toBe("rate_limited");
  });

  it("408 => Timeout", () => {
    expect(classifyProviderFailure({ status: 408 }).diagnosis).toBe("timeout");
  });

  it("500/502/503/504 => Provider nicht verfügbar", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyProviderFailure({ status }).diagnosis).toBe("unavailable");
    }
  });

  it("AbortError/ETIMEDOUT => Timeout", () => {
    expect(classifyProviderFailure({ errorText: "This operation was aborted" }).diagnosis).toBe("timeout");
    expect(classifyProviderFailure({ errorText: "ETIMEDOUT" }).diagnosis).toBe("timeout");
  });

  it("ENOTFOUND/ECONNREFUSED => Netzwerkfehler", () => {
    expect(classifyProviderFailure({ errorText: "fetch failed ENOTFOUND" }).diagnosis).toBe("network_error");
    expect(classifyProviderFailure({ errorText: "ECONNREFUSED 127.0.0.1:443" }).diagnosis).toBe("network_error");
  });

  it("kuerzt Roh-Antworten und leakt keine Key-Reste", () => {
    const long = `x`.repeat(10000) + "sk-secret1234567890";
    const result = classifyProviderFailure({ status: 400, bodyText: long });
    expect(result.safeMessage.length).toBeLessThan(200);
    expect(result.safeMessage).not.toContain("sk-secret");
  });
});

// ---------------------------------------------------------------------------
// Maskierung (Phase 2)
// ---------------------------------------------------------------------------

describe("maskApiKey", () => {
  it("zeigt nur Praefix und letzte 4 Zeichen", () => {
    const masked = maskApiKey("sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ1111");
    expect(masked).toBe("sk-proj…1111");
    expect(masked).not.toContain("ABCDEFGHIJKLMNOP");
  });

  it("behandelt AIza-Keys", () => {
    expect(maskApiKey("AIzaSyD-1234567890abcdefghijklmnopqrstuvwxyz7K2P")).toBe("AIzaSyD…7K2P");
  });

  it("leerer Key => (leer)", () => {
    expect(maskApiKey("   ")).toBe("(leer)");
  });
});

// ---------------------------------------------------------------------------
// Ablaufueberwachung (Phase 6)
// ---------------------------------------------------------------------------

describe("expiryWarningLevel", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-09-18T12:00:00Z");

  it("ohne Datum => unknown (Key wird nie als garantiert gültig behauptet)", () => {
    expect(expiryWarningLevel(null, now)).toBe("unknown");
    expect(expiryWarningLevel(undefined, now)).toBe("unknown");
    expect(expiryWarningLevel("kein-datum", now)).toBe("unknown");
  });

  it("Warnstufen: 14 d / 7 d / 24 h / abgelaufen", () => {
    expect(expiryWarningLevel(new Date(now + 10 * DAY).toISOString(), now)).toBe("warn_14d");
    expect(expiryWarningLevel(new Date(now + 5 * DAY).toISOString(), now)).toBe("warn_7d");
    expect(expiryWarningLevel(new Date(now + 12 * 3600_000).toISOString(), now)).toBe("warn_24h");
    expect(expiryWarningLevel(new Date(now - 3600_000).toISOString(), now)).toBe("expired");
    expect(expiryWarningLevel(new Date(now + 60 * DAY).toISOString(), now)).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Rotation (Phase 5)
// ---------------------------------------------------------------------------

describe("decideRotation", () => {
  it("promoviert nur bei erfolgreichem Health-Check", () => {
    const decision = decideRotation({ ok: true });
    expect(decision.action).toBe("promote");
  });

  it("behält aktiven Key bei jedem Misserfall unberührt", () => {
    for (const diagnosis of ["invalid", "expired", "revoked", "rate_limited", "timeout", "unavailable", "network_error"] as const) {
      const decision = decideRotation({ ok: false, diagnosis });
      expect(decision.action).toBe("keep_active");
      if (decision.action !== "keep_active") throw new Error("Rotation haette keep_active entscheiden muessen.");
      expect(decision.diagnosis).toBe(diagnosis);
    }
  });

  it("begründet den Abbruch sicher und ohne Key-Material", () => {
    const decision = decideRotation({ ok: false, diagnosis: "invalid" });
    if (decision.action === "keep_active") {
      expect(decision.reason).toContain("aktiver Key bleibt unverändert");
      expect(decision.reason).not.toContain("sk-");
    }
  });
});

// ---------------------------------------------------------------------------
// Verschluesselung (Phase 5/11)
// ---------------------------------------------------------------------------

describe("encryptSecret/decryptSecret", () => {
  const secret = "test-server-secret-jwt";

  it("Roundtrip liefert den Klartext zurück", () => {
    const payload = encryptSecret("sk-live-key-1234567890", secret);
    expect(payload).not.toContain("sk-live-key-1234567890");
    expect(decryptSecret(payload, secret)).toBe("sk-live-key-1234567890");
  });

  it("Ciphertext ist authentifiziert (GCM) — Manipulation schlägt fehl", () => {
    const payload = encryptSecret("geheimer-key", secret);
    const [iv, tag, data] = payload.split(":");
    const tampered = `${iv}:${tag}:${(parseInt(data.slice(0, 2), 16) ^ 0xff).toString(16)}${data.slice(2)}`;
    expect(() => decryptSecret(tampered, secret)).toThrow();
  });

  it("anderes Server-Secret kann den Datensatz nicht entschlüsseln", () => {
    const payload = encryptSecret("geheimer-key", secret);
    expect(() => decryptSecret(payload, "anderes-secret")).toThrow();
  });

  it("Integritäts-Hash ist stabil und nicht der Key selbst", () => {
    expect(secretIntegrityHash("key-a")).toBe(secretIntegrityHash("key-a"));
    expect(secretIntegrityHash("key-a")).not.toBe(secretIntegrityHash("key-b"));
    expect(secretIntegrityHash("sk-abc")).not.toBe("sk-abc");
  });
});

// ---------------------------------------------------------------------------
// Audit-Hygiene: keine Secrets in Events (Phase 8/11)
// ---------------------------------------------------------------------------

describe("Audit-Hygiene", () => {
  it("redigiert Bearer-Header und Key-artiges Material", () => {
    const detail = sanitizeAuditDetail("Key sk-proj-AbCdEfGh1234567890 hinterlegt, Authorization: Bearer sk-proj-AbCdEfGh1234567890");
    expect(detail).not.toContain("sk-proj-AbCdEfGh1234567890");
    expect(detail).toContain("[REDACTED]");
  });

  it("redigiert ghp_-, hf_- und gsk_-Tokens", () => {
    const detail = sanitizeAuditDetail("ghp_abcdefgh1234 hf_xyzabcde123 gsk_defghijk4567");
    expect(detail).not.toMatch(/ghp_|hf_[a-z]|gsk_/);
  });

  it("baut Events mit Zeitstempel und Provider, ohne Geheimnisse", () => {
    const event = buildAuditEvent({
      kind: "key_staged",
      provider: "openai",
      detail: "Neuer Key hintergelegt (sk-proj-SuperSecretKey9999AB)",
      at: "2026-09-18T12:00:00.000Z",
    });
    expect(event.detail).not.toContain("SuperSecretKey");
    expect(event.kind).toBe("key_staged");
    expect(event.provider).toBe("openai");
  });
});

// ---------------------------------------------------------------------------
// Key-Pools & autonome Rotation (Sprint 155)
// ---------------------------------------------------------------------------

import {
  parseKeyPool,
  nextPoolIndex,
  parseSecretManagerConfig,
  shouldTriggerAutonomousRotation,
  webhookSecretMatches,
} from "../lib/provider-admin-logic";

describe("parseKeyPool", () => {
  it("parst kommaseparierte ENV-Pools und ignoriert Leereinträge", () => {
    expect(parseKeyPool("key-a, key-b ,,key-c")).toEqual(["key-a", "key-b", "key-c"]);
  });

  it("leer/undefined => kein Kandidat (keine erfundenen Keys)", () => {
    expect(parseKeyPool(undefined)).toEqual([]);
    expect(parseKeyPool("  ,  ")).toEqual([]);
  });
});

describe("nextPoolIndex", () => {
  it("rotiert sequenziell durch den Pool und vorne herum", () => {
    expect(nextPoolIndex(0, 3)).toBe(1);
    expect(nextPoolIndex(1, 3)).toBe(2);
    expect(nextPoolIndex(2, 3)).toBe(0);
  });

  it("Pool der Größe 1 hat keinen zweiten Key", () => {
    expect(nextPoolIndex(0, 1)).toBe(0);
  });
});

describe("shouldTriggerAutonomousRotation", () => {
  it("löst bei invalid/expired/revoked/rate_limited/quota aus", () => {
    for (const diagnosis of ["invalid", "expired", "revoked", "rate_limited", "quota"] as const) {
      expect(shouldTriggerAutonomousRotation(diagnosis)).toBe(true);
    }
  });

  it("löst NICHT bei Timeout/Netzwerk/Ausfall/missing/disabled aus (kein blindes Probieren)", () => {
    for (const diagnosis of ["timeout", "network_error", "unavailable", "missing_key", "disabled", "healthy"] as const) {
      expect(shouldTriggerAutonomousRotation(diagnosis)).toBe(false);
    }
  });
});

describe("parseSecretManagerConfig", () => {
  it("erkennt nur vollständige, autorisierte Konfigurationen", () => {
    expect(parseSecretManagerConfig({})).toBeNull();
    expect(parseSecretManagerConfig({ SECRET_MANAGER_TYPE: "render" })).toBeNull();
    expect(parseSecretManagerConfig({ SECRET_MANAGER_TYPE: "render", SECRET_MANAGER_API_TOKEN: "tok", SECRET_MANAGER_RENDER_SERVICE: "srv-123" })).toEqual({
      type: "render",
      token: "tok",
      serviceRef: "srv-123",
    });
  });

  it("lehnt unbekannte Typen ab", () => {
    expect(parseSecretManagerConfig({ SECRET_MANAGER_TYPE: "hack", SECRET_MANAGER_API_TOKEN: "tok" })).toBeNull();
  });

  it("ohne Service-Referenz kein Render-Autofetch", () => {
    expect(parseSecretManagerConfig({ SECRET_MANAGER_TYPE: "render", SECRET_MANAGER_API_TOKEN: "tok" })).toBeNull();
  });
});

describe("webhookSecretMatches", () => {
  it("akzeptiert nur das exakte Secret", () => {
    expect(webhookSecretMatches("geheim", "geheim")).toBe(true);
    expect(webhookSecretMatches("falsch", "geheim")).toBe(false);
    expect(webhookSecretMatches(undefined, "geheim")).toBe(false);
    expect(webhookSecretMatches("geheim", "")).toBe(false);
  });
});
