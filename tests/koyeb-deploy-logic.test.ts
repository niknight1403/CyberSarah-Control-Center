import { describe, expect, it } from "vitest";
import {
  buildAppCreateRequest,
  buildServiceEnv,
  koyebApiError,
  maskSecrets,
  publicUrlFromApp,
  validateDatabaseUrl,
  validateKoyebToken,
} from "../lib/koyeb-deploy-logic.mjs";

const VALID_TOKEN = "koyeb-token-abcdefghijklmnopqrstuvwxyz1234567890";

describe("validateKoyebToken", () => {
  it("akzeptiert einen sauberen Token", () => {
    expect(validateKoyebToken(VALID_TOKEN)).toEqual({
      ok: true,
      token: VALID_TOKEN,
    });
  });

  it("bereinigt Anfuehrungszeichen und $-Praefixe", () => {
    const result = validateKoyebToken(`$'${VALID_TOKEN}"`);
    expect(result.ok).toBe(true);
    expect(result.token).toBe(VALID_TOKEN);
  });

  it("lehnt Fliesstext mit Leerzeichen ab", () => {
    const result = validateKoyebToken(
      "Hier ist der Token aus der Konsole kopiert.",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Leerzeichen");
  });

  it("lehnt leere und kurze Werte ab", () => {
    expect(validateKoyebToken("").ok).toBe(false);
    expect(validateKoyebToken("   ").ok).toBe(false);
    expect(validateKoyebToken("kurz").ok).toBe(false);
  });
});

describe("buildServiceEnv", () => {
  const base = {
    databaseUrl: "postgresql://u:pw@db:5432/cs",
    appBaseUrl: "https://cs.koyeb.app",
    allowedOrigins: "https://cs.koyeb.app",
    jwtSecret: "geheim",
  };

  it("erzeugt KEY=VALUE-Zeilen mit Pflicht-ENV", () => {
    const list = buildServiceEnv(base);
    expect(list).toContain("NODE_ENV=production");
    expect(list).toContain("PORT=8000");
    expect(list.join("\n")).toContain("DATABASE_URL=postgresql://u:pw@db:5432/cs");
  });

  it("wirft bei fehlender Pflicht-ENV", () => {
    expect(() =>
      buildServiceEnv({ ...base, databaseUrl: "" }),
    ).toThrow("Pflicht-ENV fehlt: DATABASE_URL");
  });

  it("nimmt optionale ENVs nur wenn gesetzt", () => {
    const withStripe = buildServiceEnv({
      ...base,
      metricsToken: "m1",
      stripeSecretKey: "sk_test_1",
    });
    expect(withStripe.join("\n")).toContain("METRICS_TOKEN=m1");
    expect(withStripe.join("\n")).toContain("STRIPE_SECRET_KEY=sk_test_1");

    const withoutStripe = buildServiceEnv(base);
    expect(withoutStripe.some((e) => e.startsWith("METRICS_TOKEN="))).toBe(false);
  });

  it("akzeptiert zusaetzliche extra-ENV und ueberschreibt optional", () => {
    const list = buildServiceEnv({ ...base, extra: ["FOO=bar"] });
    expect(list).toContain("FOO=bar");
  });

  it("reicht OAuth-, Admin- und Stripe-Variablen nur bei Vorhandensein durch", () => {
    const voll = buildServiceEnv({
      ...base,
      oauthServerUrl: "https://oauth.example.com",
      ownerOpenId: "owner-open-id-123",
      adminEmail: "admin@cybersarah-ki.com",
      stripeMode: "live",
      stripePriceLookupKey: "cybersarah-monthly",
      stripeProductId: "price_123",
      trustProxy: "1",
    });
    expect(voll).toContain("OAUTH_SERVER_URL=https://oauth.example.com");
    expect(voll).toContain("OWNER_OPEN_ID=owner-open-id-123");
    expect(voll).toContain("ADMIN_EMAIL=admin@cybersarah-ki.com");
    expect(voll).toContain("STRIPE_MODE=live");
    expect(voll).toContain("STRIPE_PRICE_LOOKUP_KEY=cybersarah-monthly");
    expect(voll).toContain("STRIPE_PRICE_ID=price_123");
    expect(voll).toContain("TRUST_PROXY=1");

    const gefiltert = buildServiceEnv(base).filter(
      (zeile) =>
        zeile.startsWith("OAUTH_") ||
        zeile.startsWith("OWNER_") ||
        zeile.startsWith("ADMIN_") ||
        zeile.startsWith("STRIPE_MODE") ||
        zeile.startsWith("STRIPE_PRICE") ||
        zeile.startsWith("TRUST_PROXY"),
    );
    expect(gefiltert).toEqual([]);
  });

  it("lehnt Zeilenumbrueche in Werten ab", () => {
    expect(() =>
      buildServiceEnv({ ...base, extra: ["KEY=wert\ninjektion"] }),
    ).toThrow("Zeilenumbrueche");
  });
});

describe("buildAppCreateRequest", () => {
  it("baut einen Kombidienst mit Docker-Builder, Port und Health-Check", () => {
    const body = buildAppCreateRequest({
      appName: "cybersarah",
      envList: ["NODE_ENV=production"],
    });
    expect(body.name).toBe("cybersarah");
    const service = body.services[0];
    expect(service.type).toBe("web");
    expect(service.definition.builder.type).toBe("docker");
    expect(service.definition.github.repository).toBe(
      "niknight1403/CyberSarah-Control-Center",
    );
    expect(service.definition.ports[0].port).toBe(8000);
    expect(service.definition.health_checks[0].path).toBe("/api/health");
    expect(service.definition.regions).toEqual(["fra"]);
    expect(service.definition.instance_type).toBe("free");
  });

  it("lehnt ungültige App-Namen ab", () => {
    expect(() => buildAppCreateRequest({ appName: "Cyber Sarah!" })).toThrow();
  });
});

describe("publicUrlFromApp", () => {
  it("bevorzugt koyeb.app-Domains", () => {
    const url = publicUrlFromApp({
      domains: [{ name: "custom.example.com" }, { name: "cs.koyeb.app" }],
    });
    expect(url).toBe("https://cs.koyeb.app");
  });

  it("liefert null ohne Domains", () => {
    expect(publicUrlFromApp({})).toBeNull();
  });
});

describe("koyebApiError", () => {
  it("uebersetzt 401 in Token-Hinweis", () => {
    expect(koyebApiError(401, "")).toContain("Token");
  });
  it("uebersetzt 409 in Konflikt-Hinweis", () => {
    expect(koyebApiError(409, "exists")).toContain("Konflikt");
  });
});

describe("maskSecrets", () => {
  it("maskiert Passwoerter in URLs", () => {
    expect(maskSecrets("postgresql://u:geheim@db/cs")).toBe(
      "postgresql://u:***@db/cs",
    );
  });
});

describe("validateDatabaseUrl", () => {
  it("akzeptiert gueltige postgres- und postgresql-Connection-Strings", () => {
    expect(
      validateDatabaseUrl("postgresql://koyeb-adm:geheim@db-abc.example.com:5432/koyebdb"),
    ).toEqual({
      ok: true,
      url: "postgresql://koyeb-adm:geheim@db-abc.example.com:5432/koyebdb",
    });
    expect(validateDatabaseUrl("postgres://u:p@host.example.com/db").ok).toBe(true);
  });

  it("streicht Leerzeichen und Fliesstext ab", () => {
    expect(validateDatabaseUrl("Hier steht der Connection String.").ok).toBe(false);
    expect(validateDatabaseUrl("  postgresql://u:p@host/db  ").ok).toBe(true);
  });

  it("lehnt falsche Schemata, leere Werte und fehlenden Host ab", () => {
    expect(validateDatabaseUrl("mysql://u:p@host/db").ok).toBe(false);
    expect(validateDatabaseUrl("").ok).toBe(false);
    expect(validateDatabaseUrl("postgresql://:5432/db").ok).toBe(false);
  });

  it("lehnt localhost fuer Koyeb-Einsatz ab", () => {
    expect(validateDatabaseUrl("postgresql://u:p@localhost:5432/cybersarah").ok).toBe(false);
    expect(validateDatabaseUrl("postgres://u:p@127.0.0.1/cybersarah").ok).toBe(false);
  });
});
