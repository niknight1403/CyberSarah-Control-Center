import { describe, expect, it, vi } from "vitest";

import {
  HubspotApiError,
  HubspotClient,
  HubspotConfigError,
  HubspotService,
  SandboxHubspotService,
  assertValidToken,
  createHubspotModule,
  HUBSPOT_API_HOSTS,
  regionFromToken,
  classifyHubspotToken,
  describeHubspotEnv,
  resolveHubspotToken,
} from "@/server/integrations/hubspot";

const TOKEN = "pat-na1-" + "a".repeat(24);

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };

function makeFetch(responses: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  let index = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const entry = responses[Math.min(index, responses.length - 1)];
    index += 1;
    calls.push({
      url: String(input),
      method: String(init?.method ?? "GET"),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    });
    return new Response(entry.body === undefined ? "" : JSON.stringify(entry.body), {
      status: entry.status ?? 200,
      headers: entry.headers ?? { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const noSleep = async () => {};

describe("HubSpot: Token-Prüfung", () => {
  it("lehnt fehlendes Token mit Konfigurationsfehler ab", () => {
    expect(() => assertValidToken("")).toThrow(HubspotConfigError);
    expect(() => assertValidToken("   ")).toThrow(/fehlt/);
  });

  it("verlangt das pat-Präfix", () => {
    expect(() => assertValidToken("abc-" + "x".repeat(30))).toThrow(/Format/);
  });

  it("lehnt zu kurze Tokens ab", () => {
    expect(() => assertValidToken("pat-123")).toThrow(/zu kurz/);
  });

  it("akzeptiert ein gültiges Private-App-Token", () => {
    expect(assertValidToken(TOKEN)).toBe(TOKEN);
  });
});

describe("HubSpot: Umgebungsprüfung", () => {
  it("meldet fehlende Konfiguration ohne Token", () => {
    const status = describeHubspotEnv({});
    expect(status.configured).toBe(false);
    expect(status.problem).toMatch(/Kein HubSpot-Schluessel gesetzt/);
  });

  it("akzeptiert den Namen HUBSPOT_ACCESS_TOKEN", () => {
    const status = describeHubspotEnv({ HUBSPOT_ACCESS_TOKEN: TOKEN });
    expect(status.configured).toBe(true);
    expect(status.variable).toBe("HUBSPOT_ACCESS_TOKEN");
  });

  it("bevorzugt HUBSPOT_PRIVATE_APP_TOKEN", () => {
    const env = { HUBSPOT_PRIVATE_APP_TOKEN: TOKEN, HUBSPOT_ACCESS_TOKEN: "pat-alt-" + "b".repeat(20) };
    expect(resolveHubspotToken(env)).toBe(TOKEN);
    expect(describeHubspotEnv(env).variable).toBe("HUBSPOT_PRIVATE_APP_TOKEN");
  });

  it("erkennt ein falsches Tokenformat", () => {
    const status = describeHubspotEnv({ HUBSPOT_ACCESS_TOKEN: "kein-pat-token" });
    expect(status.configured).toBe(false);
    expect(status.validFormat).toBe(false);
  });
});

describe("HubSpot: Modulauswahl", () => {
  it("liefert ohne Token die Sandbox statt zu scheitern", () => {
    const module = createHubspotModule({});
    expect(module.mode).toBe("sandbox");
    expect(module.service).toBeInstanceOf(SandboxHubspotService);
  });

  it("liefert mit Token den Live-Service", () => {
    const module = createHubspotModule({ HUBSPOT_ACCESS_TOKEN: TOKEN }, { fetchImpl: makeFetch([{}]).impl });
    expect(module.mode).toBe("live");
    expect(module.service).toBeInstanceOf(HubspotService);
  });
});

describe("HubSpot: HTTP-Client", () => {
  it("wiederholt nach 429 und liefert beim zweiten Versuch", async () => {
    const { impl, calls } = makeFetch([{ status: 429, body: { message: "rate" } }, { body: { id: "1" } }]);
    const client = new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep });
    await expect(client.request("/crm/v3/objects/contacts")).resolves.toEqual({ id: "1" });
    expect(calls).toHaveLength(2);
  });

  it("gibt nach ausgeschöpften Versuchen einen API-Fehler mit Status", async () => {
    const { impl } = makeFetch([{ status: 503, body: {} }]);
    const client = new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep, maxAttempts: 2 });
    await expect(client.request("/crm/v3/objects/contacts")).rejects.toBeInstanceOf(HubspotApiError);
  });

  it("wiederholt bei 400 nicht", async () => {
    const { impl, calls } = makeFetch([{ status: 400, body: { message: "bad" } }]);
    const client = new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep });
    await expect(client.request("/crm/v3/objects/contacts")).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });

  it("bricht ab, wenn die Zeitgrenze greift", async () => {
    const hanging = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const client = new HubspotClient({
      token: TOKEN,
      fetchImpl: hanging,
      sleep: noSleep,
      timeoutMs: 5,
      maxAttempts: 1,
    });
    await expect(client.request("/crm/v3/objects/contacts")).rejects.toBeInstanceOf(HubspotApiError);
  });
});

describe("HubSpot: Service-Endpunkte", () => {
  it("legt einen Kontakt mit normalisierter E-Mail an", async () => {
    const { impl, calls } = makeFetch([{ body: { id: "c1", properties: { email: "a@b.de" } } }]);
    const service = new HubspotService(new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep }));
    const contact = await service.createContact({ email: " A@B.de ", firstname: "Ada" });
    expect(contact.id).toBe("c1");
    expect(calls[0].url).toContain("/crm/v3/objects/contacts");
    expect(calls[0].method).toBe("POST");
    expect((calls[0].body?.properties as Record<string, string>).email).toBe("a@b.de");
  });

  it("lehnt eine ungültige E-Mail vor dem Netzwerkaufruf ab", async () => {
    const { impl, calls } = makeFetch([{}]);
    const service = new HubspotService(new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep }));
    await expect(service.createContact({ email: "keine-mail" })).rejects.toThrow(/Ungueltige E-Mail/);
    expect(calls).toHaveLength(0);
  });

  it("macht aus einem 409 einen Aktualisierungslauf (Upsert)", async () => {
    const { impl, calls } = makeFetch([
      { status: 409, body: { message: "exists" } },
      { body: { total: 1, results: [{ id: "c9", properties: { email: "a@b.de" } }] } },
      { body: { id: "c9", properties: { email: "a@b.de", firstname: "Ada" } } },
    ]);
    const service = new HubspotService(new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep }));
    const result = await service.upsertContact({ email: "a@b.de", firstname: "Ada" });
    expect(result.created).toBe(false);
    expect(calls[1].url).toContain("/crm/v3/objects/contacts/search");
    expect(calls[2].method).toBe("PATCH");
  });

  it("aktualisiert eine bestehende Firma anhand der Domain", async () => {
    const { impl, calls } = makeFetch([
      { body: { total: 1, results: [{ id: "co1", properties: { domain: "acme.de" } }] } },
      { body: { id: "co1", properties: { name: "Acme", domain: "acme.de" } } },
    ]);
    const service = new HubspotService(new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep }));
    const result = await service.upsertCompany({ name: "Acme GmbH", domain: "https://www.Acme.de/kontakt" });
    expect(result.created).toBe(false);
    expect(calls[1].url).toContain("/crm/v3/objects/companies/co1");
    expect((calls[1].body?.properties as Record<string, string>).domain).toBe("acme.de");
  });

  it("legt einen Deal mit Kontakt-Assoziation an", async () => {
    const { impl, calls } = makeFetch([{ body: { id: "d1", properties: { dealname: "Pilot" } } }]);
    const service = new HubspotService(new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep }));
    await service.createDeal({ dealname: "Pilot", dealstage: "appointmentscheduled", amount: 4900, contactId: "c1" });
    const body = calls[0].body as { properties: Record<string, string>; associations: unknown[] };
    expect(body.properties.amount).toBe("4900");
    expect(body.associations).toHaveLength(1);
  });

  it("verlangt eine Deal-Phase beim Anlegen", async () => {
    const { impl } = makeFetch([{}]);
    const service = new HubspotService(new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep }));
    await expect(service.createDeal({ dealname: "X", dealstage: "" })).rejects.toThrow(/dealstage/);
  });

  it("klemmt das Suchlimit auf 1..100", async () => {
    const { impl, calls } = makeFetch([{ body: { total: 0, results: [] } }]);
    const service = new HubspotService(new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep }));
    await service.search({ objectType: "deals", filters: [{ propertyName: "dealstage", operator: "EQ", value: "x" }], limit: 500 });
    expect((calls[0].body as { limit: number }).limit).toBe(100);
  });

  it("baut die Filtergruppe für die Search-API korrekt", async () => {
    const { impl, calls } = makeFetch([{ body: { total: 0, results: [] } }]);
    const service = new HubspotService(new HubspotClient({ token: TOKEN, fetchImpl: impl, sleep: noSleep }));
    await service.search({
      objectType: "companies",
      filters: [{ propertyName: "domain", operator: "EQ", value: "acme.de" }],
      properties: ["name"],
    });
    const body = calls[0].body as {
      filterGroups: Array<{ filters: Array<Record<string, string>> }>;
      properties: string[];
    };
    expect(body.filterGroups[0].filters[0]).toEqual({ propertyName: "domain", operator: "EQ", value: "acme.de" });
    expect(body.properties).toEqual(["name"]);
  });
});

describe("HubSpot: Sandbox-Fallback", () => {
  it("legt Kontakte an und findet sie wieder", async () => {
    const sandbox = new SandboxHubspotService();
    const created = await sandbox.createContact({ email: "Test@Acme.de" });
    const found = await sandbox.findContactByEmail("test@acme.de");
    expect(found?.id).toBe(created.id);
    expect(sandbox.counters.contacts).toBe(1);
  });

  it("macht Upserts ohne Duplikate", async () => {
    const sandbox = new SandboxHubspotService();
    await sandbox.upsertContact({ email: "a@b.de" });
    const second = await sandbox.upsertContact({ email: "a@b.de", firstname: "Ada" });
    expect(second.created).toBe(false);
    expect(sandbox.counters.contacts).toBe(1);
    expect(second.contact.properties.firstname).toBe("Ada");
  });

  it("führt Deals über Phasen und filtert in der Suche", async () => {
    const sandbox = new SandboxHubspotService();
    const deal = await sandbox.createDeal({ dealname: "Pilot", dealstage: "appointmentscheduled", amount: 100 });
    const moved = await sandbox.updateDealStage(deal.id, { dealstage: "closedwon" });
    expect(moved.properties.dealstage).toBe("closedwon");
    const result = await sandbox.search({
      objectType: "deals",
      filters: [{ propertyName: "dealstage", operator: "EQ", value: "closedwon" }],
    });
    expect(result.total).toBe(1);
  });

  it("liefert einen klaren Fehler für unbekannte Firmen", async () => {
    const sandbox = new SandboxHubspotService();
    await expect(sandbox.getObject("companies", "fehlt")).rejects.toThrow(/existiert in der Sandbox/);
  });
});
describe("HubSpot: dritter Variablenname und Token-Form", () => {
  it("erkennt HUBSPOT_API_KEY als gespeichertes Geheimnis", () => {
    expect(resolveHubspotToken({ HUBSPOT_API_KEY: TOKEN })).toBe(TOKEN);
    expect(describeHubspotEnv({ HUBSPOT_API_KEY: TOKEN }).variable).toBe("HUBSPOT_API_KEY");
  });

  it("ordnet Token-Formen korrekt ein", () => {
    expect(classifyHubspotToken(TOKEN)).toBe("private_app");
    expect(classifyHubspotToken("123e4567-e89b-12d3-a456-426614174000")).toBe("legacy_api_key");
    expect(classifyHubspotToken("irgendwas")).toBe("unknown");
    expect(classifyHubspotToken("")).toBe("unknown");
  });

  it("weist einen abgeschalteten Legacy-Key mit klarer Begründung ab", () => {
    const status = describeHubspotEnv({ HUBSPOT_API_KEY: "123e4567-e89b-12d3-a456-426614174000" });
    expect(status.configured).toBe(false);
    expect(status.kind).toBe("legacy_api_key");
    expect(status.problem).toMatch(/abgeschaltet/);
    expect(createHubspotModule({ HUBSPOT_API_KEY: "123e4567-e89b-12d3-a456-426614174000" }).mode).toBe("sandbox");
  });
});
describe("HubSpot: Service Key (aktueller Weg seit 2026)", () => {
  it("hat Vorrang vor den aelteren Variablennamen", () => {
    const env = { HUBSPOT_SERVICE_KEY: TOKEN, HUBSPOT_API_KEY: "pat-alt-" + "c".repeat(24) };
    expect(resolveHubspotToken(env)).toBe(TOKEN);
    expect(describeHubspotEnv(env).variable).toBe("HUBSPOT_SERVICE_KEY");
  });

  it("akzeptiert ein Service Key im pat-na1-Format als live-faehig", () => {
    const serviceKey = "pat-na1-" + "12345678-1234-1234-1234-123456789012";
    expect(describeHubspotEnv({ HUBSPOT_SERVICE_KEY: serviceKey }).configured).toBe(true);
    expect(createHubspotModule({ HUBSPOT_SERVICE_KEY: serviceKey }, { fetchImpl: makeFetch([{}]).impl }).mode).toBe("live");
  });

  it("verwirft einen Wert ohne pat-Praefix auch unter dem Service-Key-Namen", () => {
    const fremd = "C" + "x".repeat(106);
    const status = describeHubspotEnv({ HUBSPOT_SERVICE_KEY: fremd });
    expect(status.configured).toBe(false);
    expect(status.variable).toBe("HUBSPOT_SERVICE_KEY");
    expect(createHubspotModule({ HUBSPOT_SERVICE_KEY: fremd }).mode).toBe("sandbox");
  });
});
describe("HubSpot: Rechenzentrum (NA und EU)", () => {
  it("nutzt ohne Angabe den Standardhost", () => {
    expect(describeHubspotEnv({ HUBSPOT_SERVICE_KEY: TOKEN }).baseUrl).toBe("https://api.hubapi.com");
    expect(HUBSPOT_API_HOSTS.eu).toBe("https://api-eu1.hubapi.com");
  });

  it("akzeptiert den EU-Host und normalisiert einen Schraegstrich", () => {
    const env = { HUBSPOT_SERVICE_KEY: TOKEN, HUBSPOT_API_BASE_URL: "https://api-eu1.hubapi.com/" };
    expect(describeHubspotEnv(env).baseUrl).toBe("https://api-eu1.hubapi.com");
  });

  it("schickt Live-Aufrufe an den konfigurierten EU-Host", async () => {
    const seen: string[] = [];
    const impl = (async (input: any) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ results: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const mod = createHubspotModule(
      { HUBSPOT_SERVICE_KEY: TOKEN, HUBSPOT_API_BASE_URL: "https://api-eu1.hubapi.com" },
      { fetchImpl: impl },
    );
    await mod.service.findContactByEmail("a@b.de");
    expect(seen[0]?.startsWith("https://api-eu1.hubapi.com/crm/v3/objects/contacts/search")).toBe(true);
  });

  it("verwirft fremde Hosts statt still umzuleiten", () => {
    const status = describeHubspotEnv({ HUBSPOT_SERVICE_KEY: TOKEN, HUBSPOT_API_BASE_URL: "https://evil.example.com" });
    expect(status.configured).toBe(false);
    expect(status.problem).toMatch(/bekannten HubSpot-Host/);
    expect(createHubspotModule({ HUBSPOT_SERVICE_KEY: TOKEN, HUBSPOT_API_BASE_URL: "https://evil.example.com" }).mode).toBe("sandbox");
  });
});
describe("HubSpot: Rechenzentrum aus dem Schluessel ableiten", () => {
  it("erkennt das Praefix", () => {
    expect(regionFromToken("pat-eu1-" + "a".repeat(36))).toBe("eu");
    expect(regionFromToken("pat-na1-" + "a".repeat(36))).toBe("na");
    expect(regionFromToken("pa-eu1-" + "a".repeat(36))).toBeNull();
    expect(regionFromToken("")).toBeNull();
  });

  it("waehlt ohne HUBSPOT_API_BASE_URL den Host des Schluessels", () => {
    expect(describeHubspotEnv({ HUBSPOT_SERVICE_KEY: "pat-eu1-" + "b".repeat(36) }).baseUrl)
      .toBe("https://api-eu1.hubapi.com");
    expect(describeHubspotEnv({ HUBSPOT_SERVICE_KEY: "pat-na1-" + "b".repeat(36) }).baseUrl)
      .toBe("https://api.hubapi.com");
  });

  it("laesst eine ausdrueckliche Angabe gewinnen", () => {
    expect(describeHubspotEnv({
      HUBSPOT_SERVICE_KEY: "pat-na1-" + "b".repeat(36),
      HUBSPOT_API_BASE_URL: "https://api-eu1.hubapi.com",
    }).baseUrl).toBe("https://api-eu1.hubapi.com");
  });
});
describe("HubSpot: Kontostammdaten", () => {
  it("liest Portal, Zeitzone und Waehrung aus der Account-Info-API", async () => {
    const seen: string[] = [];
    const impl = (async (input: any) => {
      seen.push(String(input));
      return new Response(
        JSON.stringify({ portalId: 148844654, timeZone: "US/Eastern", companyCurrency: "USD" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const hub = createHubspotModule({ HUBSPOT_SERVICE_KEY: TOKEN }, { fetchImpl: impl });
    const details = await hub.service.getAccountDetails();
    expect(details).toEqual({ portalId: 148844654, timeZone: "US/Eastern", currency: "USD" });
    expect(seen[0]).toContain("/account-info/v3/details");
  });

  it("meldet in der Sandbox keinen echten Portalkontext", async () => {
    const hub = createHubspotModule({});
    expect(hub.mode).toBe("sandbox");
    expect((await hub.service.getAccountDetails()).portalId).toBe(0);
  });

  it("ignoriert einen unbrauchbaren HUBSPOT_ACCESS_TOKEN neben gueltigem Service Key", () => {
    const env = {
      HUBSPOT_SERVICE_KEY: TOKEN,
      HUBSPOT_ACCESS_TOKEN: "C" + "x".repeat(106),
      HUBSPOT_PORTAL_ID: "6aae3873-c8ca-c734-62fd-12bb00000000",
    };
    const status = describeHubspotEnv(env);
    expect(status.configured).toBe(true);
    expect(status.variable).toBe("HUBSPOT_SERVICE_KEY");
    expect(createHubspotModule(env).mode).toBe("live");
  });
});
