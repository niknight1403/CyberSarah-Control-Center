import { beforeEach, describe, expect, it } from "vitest";

import { computeProbeOverall } from "../lib/integration-live-probe-logic";
import {
  collectLiveProbes,
  getLiveProbes,
  resetLiveProbeCache,
} from "../server/integrations/live-probe-service";

const DOMAIN = "cybersarah-ki.com";

type Route = { match: RegExp; status: number; body: unknown };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Baut einen fetch-Fake aus Routen; nicht passende Aufrufe landen auf 404. */
function fakeFetch(routes: Route[]) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const route = routes.find((entry) => entry.match.test(url));
    if (!route) return jsonResponse(404, { error: "not found" });
    return jsonResponse(route.status, route.body);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const resendRoutes = (): Route[] => [
  {
    match: /api\.resend\.com\/domains$/,
    status: 200,
    body: { object: "list", data: [{ id: "dom-1", name: DOMAIN, status: "not_started" }] },
  },
  {
    match: /api\.resend\.com\/domains\/dom-1$/,
    status: 200,
    body: {
      id: "dom-1",
      name: DOMAIN,
      records: [
        { record: "SPF", name: "send", type: "TXT", value: "v=spf1 include:amazonses.com ~all" },
        { record: "DKIM", name: "resend._domainkey", type: "TXT", value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ" },
      ],
    },
  },
  {
    // SPF-Record ist gesetzt, DKIM fehlt, DMARC fehlt.
    match: /dns-query\?name=send&type=TXT/,
    status: 200,
    body: { Status: 0, Answer: [{ data: '"v=spf1 include:amazonses.com ~all"' }] },
  },
  { match: /dns-query\?name=resend\._domainkey/, status: 200, body: { Status: 3 } },
  { match: /dns-query\?name=_dmarc\./, status: 200, body: { Status: 3 } },
];

describe("Live-Probe-Service", () => {
  beforeEach(() => {
    resetLiveProbeCache();
  });

  it("prueft Resend inklusive DNS-Abgleich und benennt die fehlenden Records", async () => {
    const { impl } = fakeFetch(resendRoutes());
    const report = await collectLiveProbes({
      env: { RESEND_API_KEY: "re_" + "a".repeat(20) },
      fetchImpl: impl,
      domain: DOMAIN,
    });

    const byName = Object.fromEntries(report.results.map((result) => [result.name, result]));
    expect(byName["Resend-Absenderdomain"]?.severity).toBe("fail");
    expect(byName["Resend-Absenderdomain"]?.detail).toMatch(/nie gestartet/);
    expect(byName["Resend-DNS-Records"]?.severity).toBe("fail");
    expect(byName["Resend-DNS-Records"]?.detail).toMatch(/resend\._domainkey/);
    expect(byName["Resend-DNS-Records"]?.detail).not.toMatch(/TXT send,/);
    expect(byName["DMARC-Record"]?.severity).toBe("warn");
    expect(report.overall).toBe("fail");
    expect(report.domain).toBe(DOMAIN);
  });

  it("markiert jedes Ergebnis mit seinem Provider", async () => {
    const { impl } = fakeFetch([
      ...resendRoutes(),
      { match: /open\.tiktokapis\.com\/v2\/oauth\/token\//, status: 400, body: { error: "invalid_client" } },
      { match: /graph\.facebook\.com/, status: 400, body: { error: { code: 190, message: "expired" } } },
    ]);
    const report = await collectLiveProbes({
      env: {
        RESEND_API_KEY: "re_" + "a".repeat(20),
        TIKTOK_CLIENT_KEY: "client-key",
        TIKTOK_CLIENT_SECRET: "client-secret",
        META_ACCESS_TOKEN: "meta-token",
      },
      fetchImpl: impl,
      domain: DOMAIN,
    });

    expect(report.results.every((result) => typeof result.provider === "string")).toBe(true);
    const tiktok = report.results.find((result) => result.name === "TikTok Client-Credentials");
    expect(tiktok?.severity).toBe("fail");
    const meta = report.results.find((result) => result.name === "Meta Access-Token");
    expect(meta?.severity).toBe("fail");
  });

  it("ueberspringt alles ohne Schluessel und meldet das nicht als gruen", async () => {
    const report = await collectLiveProbes({ env: {}, fetchImpl: fakeFetch([]).impl, domain: DOMAIN });
    expect(report.results).toHaveLength(5);
    expect(report.results.every((result) => result.severity === "skip")).toBe(true);
    expect(report.overall).toBe("warn");
  });

  it("behandelt Netzwerkfehler als Warnung, nicht als Absturz", async () => {
    const throwing = (async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    const report = await collectLiveProbes({
      env: { RESEND_API_KEY: "re_" + "a".repeat(20) },
      fetchImpl: throwing,
      domain: DOMAIN,
    });
    const domainCheck = report.results.find((result) => result.name === "Resend-Absenderdomain");
    expect(domainCheck?.severity).toBe("warn");
    expect(report.overall).toBe("warn");
  });

  it("cacht das Ergebnis und laesst sich erzwingen", async () => {
    const { impl, calls } = fakeFetch(resendRoutes());
    const options = {
      env: { RESEND_API_KEY: "re_" + "a".repeat(20) },
      fetchImpl: impl,
      domain: DOMAIN,
    };

    const first = await getLiveProbes(options);
    expect(first.fromCache).toBe(false);
    const firstCallCount = calls.length;

    const second = await getLiveProbes(options);
    expect(second.fromCache).toBe(true);
    expect(calls.length).toBe(firstCallCount);

    const forced = await getLiveProbes({ ...options, force: true });
    expect(forced.fromCache).toBe(false);
    expect(calls.length).toBeGreaterThan(firstCallCount);
  });

  it("verwirft den Cache bei resetLiveProbeCache", async () => {
    const { impl, calls } = fakeFetch(resendRoutes());
    const options = {
      env: { RESEND_API_KEY: "re_" + "a".repeat(20) },
      fetchImpl: impl,
      domain: DOMAIN,
    };
    await getLiveProbes(options);
    const callsBefore = calls.length;
    resetLiveProbeCache();
    const again = await getLiveProbes(options);
    expect(again.fromCache).toBe(false);
    expect(calls.length).toBeGreaterThan(callsBefore);
  });

  it("bestaetigt eine verifizierte Domain mit vollstaendigen Records", async () => {
    const { impl } = fakeFetch([
      { match: /api\.resend\.com\/domains$/, status: 200, body: { data: [{ id: "d", name: DOMAIN, status: "verified" }] } },
      {
        match: /api\.resend\.com\/domains\/d$/,
        status: 200,
        body: { records: [{ record: "SPF", name: "send", type: "TXT", value: "v=spf1 include:amazonses.com ~all" }] },
      },
      {
        match: /dns-query\?name=send&type=TXT/,
        status: 200,
        body: { Answer: [{ data: '"v=spf1 include:amazonses.com ~all"' }] },
      },
      {
        match: /dns-query\?name=_dmarc\./,
        status: 200,
        body: { Answer: [{ data: '"v=DMARC1; p=none; rua=mailto:dmarc@cybersarah-ki.com"' }] },
      },
    ]);
    const report = await collectLiveProbes({
      env: { RESEND_API_KEY: "re_" + "a".repeat(20) },
      fetchImpl: impl,
      domain: DOMAIN,
    });
    expect(report.overall).toBe("pass");
    const resend = report.results.filter((result) => result.provider === "resend");
    expect(resend.every((result) => result.severity === "pass")).toBe(true);
    // TikTok/Meta sind ohne Schluessel skip — ein Lauf mit echten gruenen
    // Pruefungen bleibt trotzdem gruen.
    expect(report.results.filter((result) => result.severity === "skip")).toHaveLength(4);
  });

  it("prueft Meta per App-Credentials, wenn kein Nutzer-Token da ist", async () => {
    const { impl, calls } = fakeFetch([
      { match: /graph\.facebook\.com\/v21\.0\/12345\?/, status: 200, body: { id: "12345", name: "CyberSarah" } },
    ]);
    const report = await collectLiveProbes({
      env: { META_APP_ID: "12345", META_APP_SECRET: "s3cr3t" },
      fetchImpl: impl,
      domain: DOMAIN,
    });
    const meta = report.results.find((result) => result.provider === "meta");
    expect(meta?.severity).toBe("pass");
    expect(meta?.name).toBe("Meta App-Credentials");
    expect(calls.some((url) => url.includes("12345"))).toBe(true);
  });
});

describe("Gesamturteil", () => {
  it("behandelt einen Lauf ohne echte Pruefung als Warnung", () => {
    expect(computeProbeOverall([{ name: "a", severity: "skip", detail: "" }])).toBe("warn");
    expect(computeProbeOverall([])).toBe("warn");
  });

  it("priorisiert Fehler vor Warnungen", () => {
    expect(
      computeProbeOverall([
        { name: "a", severity: "pass", detail: "" },
        { name: "b", severity: "warn", detail: "" },
      ]),
    ).toBe("warn");
    expect(
      computeProbeOverall([
        { name: "a", severity: "warn", detail: "" },
        { name: "b", severity: "fail", detail: "" },
      ]),
    ).toBe("fail");
  });
});
