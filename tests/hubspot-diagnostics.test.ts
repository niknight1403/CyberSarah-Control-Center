import { describe, expect, it, vi } from "vitest";
import {
  createHubspotModule,
  probeHubspotCapabilities,
  requiredScopeHint,
  summarizeCapabilities,
} from "../server/integrations/hubspot/index";
import { HubspotClient } from "../server/integrations/hubspot/client";

const TOKEN = "pat-eu1-" + "a".repeat(36);

function client(fetchImpl: (input: any, init?: any) => Promise<Response>, baseUrl = "https://api-eu1.hubapi.com") {
  return new HubspotClient({ token: TOKEN, baseUrl, fetchImpl: fetchImpl as unknown as typeof fetch });
}

const ok = (body: unknown = { results: [] }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const denied = () =>
  new Response(JSON.stringify({ message: "This app hasn't been granted all required scopes", category: "MISSING_SCOPES" }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
const notFound = () => new Response(JSON.stringify({ message: "not found" }), { status: 404 });

describe("HubSpot: Scope-Hinweise", () => {
  it("leitet aus Pfad und Methode den Scope ab", () => {
    expect(requiredScopeHint("POST", "/crm/v3/objects/contacts")).toBe("crm.objects.contacts.write");
    expect(requiredScopeHint("PATCH", "/crm/v3/objects/deals/1")).toBe("crm.objects.deals.write");
    expect(requiredScopeHint("POST", "/crm/v3/objects/contacts/search")).toBe("crm.objects.contacts.read");
    expect(requiredScopeHint("GET", "/crm/v3/objects/companies?limit=1")).toBe("crm.objects.companies.read");
    expect(requiredScopeHint("GET", "/crm/v3/owners?limit=1")).toBe("crm.objects.owners.read");
    expect(requiredScopeHint("GET", "/irgendwas")).toBeNull();
  });

  it("nennt den fehlenden Scope in der Fehlermeldung eines 403", async () => {
    const hub = createHubspotModule({ HUBSPOT_SERVICE_KEY: TOKEN }, {
      fetchImpl: (async () => denied()) as unknown as typeof fetch,
    });
    await expect(hub.service.findContactByEmail("a@b.de")).rejects.toThrow(/crm\.objects\.contacts\.read/);
  });
});

describe("HubSpot: Rechtepruefung", () => {
  it("erkennt reine Leserechte und fehlenden Schreibzugriff", async () => {
    const impl = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "PATCH") return url.includes("/contacts/") ? notFound() : denied();
      if (url.includes("/owners")) return denied();
      return ok();
    });
    const checks = await probeHubspotCapabilities(client(impl));
    const summary = summarizeCapabilities(checks);
    expect(summary.writable).toBe(false);
    expect(summary.missing.join(" ")).toMatch(/Owner lesen/);
    expect(summary.missing.join(" ")).toMatch(/deals schreiben/);
    expect(summary.granted).toContain("Kontakte lesen");
    expect(checks.find((c) => c.name === "contacts schreiben")?.ok).toBe(true);
  });

  it("meldet vollen Schreibzugriff, wenn alle Probes 404 liefern", async () => {
    const impl = async (input: any, init?: any) =>
      (init?.method ?? "GET") === "PATCH" ? notFound() : ok();
    const summary = summarizeCapabilities(await probeHubspotCapabilities(client(impl as any)));
    expect(summary.writable).toBe(true);
    expect(summary.missing).toEqual([]);
  });

  it("prueft Schreibrechte ohne Datensatz anzulegen", async () => {
    const seen: string[] = [];
    const impl = async (input: any, init?: any) => {
      if (init?.method === "PATCH") seen.push(String(input));
      return init?.method === "PATCH" ? notFound() : ok();
    };
    await probeHubspotCapabilities(client(impl as any));
    expect(seen).toHaveLength(3);
    for (const url of seen) expect(url).toMatch(/999999999999999999$/);
  });
});
