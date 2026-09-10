import { describe, expect, it } from "vitest";
import {
  buildServiceCreateRequest,
  buildServiceEnv,
  buildWorkspaceEnv,
  envVarsFromLines,
  findServiceByName,
  maskSecrets,
  publicServiceUrl,
  renderApiError,
  validateDatabaseUrl,
  validateRenderApiKey,
} from "../lib/render-deploy-logic.mjs";

describe("render-deploy-logic: validateRenderApiKey", () => {
  it("akzeptiert ein gueltigen Render-Key (rnd_…)", () => {
    const result = validateRenderApiKey("rnd_abc123XYZdefGHI456");
    expect(result.ok).toBe(true);
    expect(result.key).toBe("rnd_abc123XYZdefGHI456");
  });

  it("stript Anfuehrungszeichen und $-Praefixe", () => {
    expect(validateRenderApiKey('  "rnd_abcdefghij1234"  ').key).toBe("rnd_abcdefghij1234");
    expect(validateRenderApiKey("$'rnd_abcdefghij1234'").ok).toBe(true);
  });

  it("lehnt Fliesstext, OpenAI-Keys und leere Werte ab", () => {
    expect(validateRenderApiKey("Hier ist der Key aus der Console …").ok).toBe(false);
    expect(validateRenderApiKey("sk-proj-ABCDEFG12345").ok).toBe(false);
    expect(validateRenderApiKey("").ok).toBe(false);
    expect(validateRenderApiKey(undefined as unknown as string).ok).toBe(false);
  });
});

describe("render-deploy-logic: validateDatabaseUrl", () => {
  it("akzeptiert Neon-Connection-Strings", () => {
    const result = validateDatabaseUrl(
      "postgresql://user:pass@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    );
    expect(result.ok).toBe(true);
  });

  it("lehnt MySQL-Schemes, Fliesstext und localhost ab", () => {
    expect(validateDatabaseUrl("mysql://u:p@localhost/db").ok).toBe(false);
    expect(validateDatabaseUrl("Das ist kein Connection-String").ok).toBe(false);
    expect(validateDatabaseUrl("postgresql://postgres@127.0.0.1:55432/postgres").ok).toBe(false);
    expect(validateDatabaseUrl("").ok).toBe(false);
  });
});

describe("render-deploy-logic: buildServiceEnv", () => {
  const base = {
    databaseUrl: "postgresql://u:p@ep-x.neon.tech/db",
    appBaseUrl: "https://cybersarah-control-center.onrender.com",
    allowedOrigins: "https://cybersarah-control-center.onrender.com",
    jwtSecret: "jwt-geheim",
  };

  it("setzt Pflicht-ENV und laesst PORT weg (Render routet selbst)", () => {
    const lines = buildServiceEnv(base);
    expect(lines).toContain(`DATABASE_URL=${base.databaseUrl}`);
    expect(lines).toContain(`JWT_SECRET=jwt-geheim`);
    expect(lines).toContain("NODE_ENV=production");
    expect(lines.find((l) => l.startsWith("PORT="))).toBeUndefined();
  });

  it("nimmt optionale ENVs nur bei vorhandenen Werten auf", () => {
    const withOptional = buildServiceEnv({ ...base, metricsToken: "mt", openAiApiKey: "sk-test-123456" });
    expect(withOptional.find((l) => l.startsWith("METRICS_TOKEN="))).toBeTruthy();
    expect(withOptional.find((l) => l.startsWith("OPENAI_API_KEY="))).toBeTruthy();
    const withoutOptional = buildServiceEnv(base);
    expect(withoutOptional.find((l) => l.startsWith("METRICS_TOKEN="))).toBeUndefined();
  });

  it("wirft bei fehlender Pflicht-ENV, Newlines und ungueltigen extra-Zeilen", () => {
    expect(() => buildServiceEnv({ ...base, jwtSecret: " " })).toThrow("Pflicht-ENV fehlt: JWT_SECRET");
    expect(() => buildServiceEnv({ ...base, metricsToken: "a\nb" })).toThrow("Zeilenumbrueche");
    expect(() => buildServiceEnv({ ...base, extra: ["kein-gleiches-zeichen"] })).toThrow("extra-ENV");
  });
});

describe("render-deploy-logic: buildWorkspaceEnv", () => {
  it("erfordert SERVICE_ACCESS_TOKEN und setzt PORT 8787", () => {
    const lines = buildWorkspaceEnv({ serviceAccessToken: "tok" });
    expect(lines).toContain("SERVICE_ACCESS_TOKEN=tok");
    expect(lines).toContain("PORT=8787");
    expect(lines).toContain("NODE_ENV=production");
    expect(() => buildWorkspaceEnv({ serviceAccessToken: "" })).toThrow("SERVICE_ACCESS_TOKEN");
  });
});

describe("render-deploy-logic: envVarsFromLines", () => {
  it("wandelt KEY=VALUE-Zeilen in Render-Objekte", () => {
    expect(envVarsFromLines(["A=1", "B=x=y"])).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "x=y" },
    ]);
  });

  it("lehnt Zeilen ohne '=', ungueltige Namen und Nicht-Arrays ab", () => {
    expect(() => envVarsFromLines(["ohne-gleich"])).toThrow();
    expect(() => envVarsFromLines(["kleinbuchstabe=1"])).toThrow("Ungueltiger ENV-Name");
    expect(() => envVarsFromLines("A=1" as unknown as string[])).toThrow("Array");
  });
});

describe("render-deploy-logic: buildServiceCreateRequest", () => {
  it("baut einen web_service-Body mit Docker-Runtime und free-Plan", () => {
    const body = buildServiceCreateRequest({
      serviceName: "cybersarah-control-center",
      envLines: ["DATABASE_URL=postgresql://u:p@ep-x.neon.tech/db"],
    });
    expect(body.type).toBe("web_service");
    expect(body.autoDeploy).toBe("yes");
    expect(body.envVars).toEqual([{ key: "DATABASE_URL", value: "postgresql://u:p@ep-x.neon.tech/db" }]);
    expect(body.serviceDetails).toEqual({ runtime: "docker", plan: "free", region: "frankfurt" });
    expect(body.rootDir).toBeUndefined();
    expect(body.serviceDetails.healthCheckPath).toBeUndefined();
  });

  it("unterstuetzt rootDir und optionalen healthCheckPath fuer den Workspace-Service", () => {
    const body = buildServiceCreateRequest({
      serviceName: "cybersarah-workspace",
      rootDir: "workspace-service",
      envLines: ["SERVICE_ACCESS_TOKEN=tok"],
      healthCheckPath: "/api/v1/health",
    });
    expect(body.rootDir).toBe("workspace-service");
    expect(body.serviceDetails.healthCheckPath).toBe("/api/v1/health");
  });

  it("validiert Namen, healthCheckPath und rootDir", () => {
    expect(() => buildServiceCreateRequest({ serviceName: "Ungültig!" })).toThrow();
    expect(() => buildServiceCreateRequest({ serviceName: "ok", healthCheckPath: "api/health" })).toThrow("healthCheckPath");
    expect(() => buildServiceCreateRequest({ serviceName: "ok", rootDir: "../escape" })).toThrow("rootDir");
  });
});

describe("render-deploy-logic: publicServiceUrl / findServiceByName", () => {
  it("erkennt https-URLs und ignoriert kaputte Antworten", () => {
    expect(publicServiceUrl({ serviceDetails: { url: "https://x.onrender.com" } })).toBe("https://x.onrender.com");
    expect(publicServiceUrl({ serviceDetails: {} })).toBeNull();
    expect(publicServiceUrl(null)).toBeNull();
    expect(publicServiceUrl({ serviceDetails: { url: "http://unsicher" } })).toBeNull();
  });

  it("findet den Service exakt nach Namen und Typ", () => {
    const list = [
      { name: "cybersarah-workspace", type: "web_service" },
      { name: "cybersarah-control-center", type: "web_service" },
    ];
    expect(findServiceByName(list, "cybersarah-control-center")?.name).toBe("cybersarah-control-center");
    expect(findServiceByName(list, "cybersarah")).toBeNull();
    expect(findServiceByName(null, "x")).toBeNull();
  });
});

describe("render-deploy-logic: renderApiError / maskSecrets", () => {
  it("uebersetzt 401 in eine handlungsbefähige Meldung", () => {
    expect(renderApiError(401, "")).toContain("RENDER_API_KEY");
    expect(renderApiError(429, "")).toContain("Rate-Limit");
    expect(renderApiError(500, "boom")).toContain("HTTP 500");
  });

  it("maskiert DB-Passwoerter, Tokens, Render-Keys und OpenAI-Keys", () => {
    const masked = maskSecrets(
      "postgresql://user:geheim@ep-x.neon.tech/db SERVICE_ACCESS_TOKEN=abc METRICS_TOKEN=xyz rnd_geheimerkey123 sk-proj-ABCDEFG",
    );
    expect(masked).not.toContain("geheim");
    expect(masked).not.toContain("SERVICE_ACCESS_TOKEN=abc");
    expect(masked).not.toContain("rnd_geheimerkey123");
    expect(masked).not.toContain("sk-proj-ABCDEFG");
    expect(masked).toContain("rnd_***");
  });

  it("maskiert Secrets auch in JSON-Strukturen (Dry-Run-Ausgabe)", () => {
    const masked = maskSecrets(
      JSON.stringify([
        { key: "STRIPE_SECRET_KEY", value: "sk_live_51AbCdEf1234567890" },
        { key: "STRIPE_WEBHOOK_SECRET", value: "whsec_vBgl12345678" },
        { key: "OPENAI_API_KEY", value: "sk-proj-XYZ123456789" },
        { key: "JWT_SECRET", value: "geheimjwt" },
        { key: "APP_ALLOWED_ORIGINS", value: "https://x.onrender.com" },
      ]),
    );
    expect(masked).not.toContain("sk_live_51AbCdEf1234567890");
    expect(masked).not.toContain("whsec_vBgl12345678");
    expect(masked).not.toContain("sk-proj-XYZ123456789");
    expect(masked).not.toContain("geheimjwt");
    expect(masked).toContain("https://x.onrender.com");
  });
});
