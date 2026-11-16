import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkEmailDomain, resetEmailDomainCache } from "@/server/email-domain-health";

/**
 * Der Readiness-Gate des Mailversands.
 *
 * Die Datei entscheidet, ob Kundenbestaetigungen ueberhaupt zugestellt werden
 * koennen. Zwei Fehlentscheidungen sind teuer: "ok" trotz unverifizierter
 * Domain (Mails landen im Nichts) und "unverified", obwohl der Anbieter gar
 * nicht befragt werden konnte (Betreiber sucht am falschen Ort).
 */

const configuredEnv = {
  RESEND_API_KEY: "re_test_key",
  RESEND_FROM_EMAIL: "team@cybersarah-ki.com",
};

function domainsResponse(domains: Array<Record<string, unknown>>, status = 200) {
  return new Response(JSON.stringify({ data: domains }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetEmailDomainCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetEmailDomainCache();
});

describe("checkEmailDomain — Konfiguration", () => {
  it("meldet ohne jede Konfiguration 'unconfigured' und ruft den Anbieter nicht auf", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const check = await checkEmailDomain({});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(check.status).toBe("unconfigured");
    expect(check.configured).toBe(false);
    expect(check.fromDomain).toBeNull();
    expect(check.domainVerified).toBe(false);
    expect(check.hint).toContain("RESEND_API_KEY fehlt");
  });

  it("nennt den konkreten Konfigurationsfehler statt eines Sammelhinweises", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Schluessel vorhanden, aber falsches Format: der Anbieter wird nicht gefragt.
    const check = await checkEmailDomain({
      RESEND_API_KEY: "sk_live_falsch",
      RESEND_FROM_EMAIL: "team@cybersarah-ki.com",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(check.status).toBe("unconfigured");
    expect(check.hint).toContain("re_…");
    expect(check.hint).not.toContain("nicht abrufbar");
  });

  it("meldet eine Adresse ohne Domain als nicht zustellbar", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const check = await checkEmailDomain({
      RESEND_API_KEY: "re_test_key",
      RESEND_FROM_EMAIL: "keine-mail",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(check.status).toBe("unconfigured");
    expect(check.configured).toBe(true);
    expect(check.fromDomain).toBeNull();
    expect(check.hint).toContain("keine Domain");
  });
});

describe("checkEmailDomain — Anbieterabfrage", () => {
  it("bestaetigt eine verifizierte Absenderdomain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      domainsResponse([
        { name: "cybersarah-ki.com", status: "verified" },
        { name: "andere-domain.de", status: "pending" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const check = await checkEmailDomain(configuredEnv);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/domains");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    expect(check.status).toBe("ok");
    expect(check.domainVerified).toBe(true);
    expect(check.fromDomain).toBe("cybersarah-ki.com");
    expect(check.hint).toBeNull();
  });

  it("akzeptiert eine Unterdomain der verifizierten Domain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(domainsResponse([{ name: "cybersarah-ki.com", status: "verified" }])),
    );

    const check = await checkEmailDomain({
      ...configuredEnv,
      RESEND_FROM_EMAIL: "team@mail.cybersarah-ki.com",
    });

    expect(check.status).toBe("ok");
    expect(check.fromDomain).toBe("mail.cybersarah-ki.com");
  });

  it("meldet eine unbekannte Domain als 'unverified' mit 403-Warnung", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(domainsResponse([{ name: "fremde-domain.de", status: "verified" }])),
    );

    const check = await checkEmailDomain(configuredEnv);

    expect(check.status).toBe("unverified");
    expect(check.domainVerified).toBe(false);
    expect(check.hint).toContain("nicht verifiziert");
    expect(check.hint).toContain("403");
  });

  it("wertet eine nur 'pending' Domain nicht als verifiziert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(domainsResponse([{ name: "cybersarah-ki.com", status: "pending" }])),
    );

    expect((await checkEmailDomain(configuredEnv)).status).toBe("unverified");
  });

  it("behauptet bei nicht erreichbarem Anbieter 'unknown' statt 'unverified'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const check = await checkEmailDomain(configuredEnv);

    expect(check.status).toBe("unknown");
    expect(check.domainVerified).toBe(false);
    expect(check.hint).toContain("nicht abrufbar");
  });

  it("behandelt eine Fehlerantwort des Anbieters als 'unknown', nicht als Ablehnung", async () => {
    for (const status of [401, 403, 500, 503]) {
      resetEmailDomainCache();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(domainsResponse([], status)));
      expect((await checkEmailDomain(configuredEnv)).status).toBe("unknown");
    }
  });

  it("verwirft unvollstaendige Eintraege, ohne die Bewertung zu verfaelschen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        domainsResponse([
          { name: "cybersarah-ki.com" },
          { status: "verified" },
          { name: 42, status: "verified" },
          {},
          { name: "cybersarah-ki.com", status: "verified" },
        ]),
      ),
    );

    // Nur der letzte Eintrag ist vollstaendig und traegt die Bewertung.
    expect((await checkEmailDomain(configuredEnv)).status).toBe("ok");
  });

  it("liefert ohne passende Domain 'unverified', wenn die Liste leer ist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(domainsResponse([])));

    const check = await checkEmailDomain(configuredEnv);

    expect(check.status).toBe("unverified");
    expect(check.domainVerified).toBe(false);
  });
});

describe("checkEmailDomain — Testdomain des Anbieters", () => {
  it("wertet resend.dev als nutzbar, aber nur fuer das eigene Postfach", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(domainsResponse([])));

    const check = await checkEmailDomain({
      RESEND_API_KEY: "re_test_key",
      RESEND_FROM_EMAIL: "onboarding@resend.dev",
    });

    expect(check.status).toBe("ok");
    expect(check.domainVerified).toBe(true);
    expect(check.hint).toContain("nur an das eigene Postfach");
  });
});

describe("checkEmailDomain — Zwischenspeicher", () => {
  it("fragt den Anbieter innerhalb des Fensters nur einmal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      domainsResponse([{ name: "cybersarah-ki.com", status: "verified" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await checkEmailDomain(configuredEnv);
    const second = await checkEmailDomain(configuredEnv);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
  });

  it("fragt nach Ablauf des Fensters erneut", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      domainsResponse([{ name: "cybersarah-ki.com", status: "verified" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await checkEmailDomain(configuredEnv);
    // Das Fenster ist 5 Minuten breit: erst danach darf erneut gefragt werden.
    clock.mockReturnValue(now + 5 * 60_000 + 1_000);
    await checkEmailDomain(configuredEnv);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cached auch den Nicht-Konfiguriert-Fall", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const first = await checkEmailDomain({});
    const second = await checkEmailDomain({});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(second).toEqual(first);
    expect(second.status).toBe("unconfigured");
  });
});
