import { describe, expect, it } from "vitest";
import {
  buildAppCreateRequest,
  buildServiceEnv,
  koyebApiError,
  maskSecrets,
  publicUrlFromApp,
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
