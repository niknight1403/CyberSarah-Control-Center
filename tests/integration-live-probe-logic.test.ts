import { describe, expect, it } from "vitest";
import {
  dnsRecordIsPresent,
  evaluateDnsAlignment,
  evaluateMetaAppProbe,
  evaluateMetaTokenProbe,
  evaluateResendDomains,
  evaluateTikTokClientProbe,
  evaluateTikTokTokenProbe,
  extractResendRecords,
  isPlaceholderValue,
  isUsableCredential,
  looksLikeResendKey,
  normalizeDnsTextValue,
  summarizeProbes,
  type ProbeResult,
} from "../lib/integration-live-probe-logic";

const verifiedDomain = {
  object: "list",
  has_more: false,
  data: [
    {
      id: "cfc99964-6057-43e8-bd08-12a239d58017",
      name: "cybersarah-ki.com",
      status: "verified",
      region: "eu-west-1",
    },
  ],
};

describe("Platzhalter-Erkennung", () => {
  it("erkennt leere und fehlende Werte", () => {
    expect(isPlaceholderValue(undefined)).toBe(true);
    expect(isPlaceholderValue(null)).toBe(true);
    expect(isPlaceholderValue("")).toBe(true);
    expect(isPlaceholderValue("   ")).toBe(true);
    expect(isUsableCredential("")).toBe(false);
  });

  it("erkennt Vorlagenwerte aus .env.example", () => {
    expect(isPlaceholderValue("<client-key>")).toBe(true);
    expect(isPlaceholderValue("changeme")).toBe(true);
    expect(isPlaceholderValue("your-app-secret")).toBe(true);
    expect(isPlaceholderValue("re_***")).toBe(true);
    expect(isPlaceholderValue("dummy-token")).toBe(true);
  });

  it("akzeptiert echte Werte", () => {
    expect(isPlaceholderValue("re_9Xk2mQ")).toBe(false);
    expect(isUsableCredential("pat-eu1-abc")).toBe(true);
  });

  it("bestaetigt nur Resend-foermige Keys", () => {
    expect(looksLikeResendKey("re_9Xk2mQ8sT4vW")).toBe(true);
    expect(looksLikeResendKey("sk_live_abc")).toBe(false);
    expect(looksLikeResendKey("re_***")).toBe(false);
    expect(looksLikeResendKey(undefined)).toBe(false);
  });
});

describe("Resend: Absenderdomain", () => {
  it("meldet Fehler, wenn der Key abgelehnt wird", () => {
    const result = evaluateResendDomains(401, { message: "API key is invalid" }, "cybersarah-ki.com");
    expect(result.severity).toBe("fail");
    expect(result.detail).toMatch(/lehnt den API-Key ab/);
    expect(result.domain).toBeNull();
  });

  it("meldet Fehler, wenn keine Domain hinterlegt ist", () => {
    const result = evaluateResendDomains(200, { data: [] }, "cybersarah-ki.com");
    expect(result.severity).toBe("fail");
    expect(result.detail).toMatch(/Keine Absenderdomain/);
  });

  it("wertet not_started als Ausfall (Mailversand tot)", () => {
    const body = { data: [{ id: "abc", name: "cybersarah-ki.com", status: "not_started" }] };
    const result = evaluateResendDomains(200, body, "cybersarah-ki.com");
    expect(result.severity).toBe("fail");
    expect(result.detail).toMatch(/nie gestartet/);
    expect(result.domain).toEqual({ id: "abc", name: "cybersarah-ki.com", status: "not_started" });
  });

  it("wertet pending als Hinweis, nicht als Fehler", () => {
    const body = { data: [{ id: "abc", name: "cybersarah-ki.com", status: "pending" }] };
    expect(evaluateResendDomains(200, body, "cybersarah-ki.com").severity).toBe("warn");
  });

  it("bestaetigt eine verifizierte Domain", () => {
    const result = evaluateResendDomains(200, verifiedDomain, "cybersarah-ki.com");
    expect(result.severity).toBe("pass");
    expect(result.detail).toMatch(/verifiziert/);
  });

  it("findet die erwartete Domain auch bei mehreren Eintraegen", () => {
    const body = {
      data: [
        { id: "1", name: "andere.de", status: "not_started" },
        { id: "2", name: "cybersarah-ki.com", status: "verified" },
      ],
    };
    const result = evaluateResendDomains(200, body, "cybersarah-ki.com");
    expect(result.severity).toBe("pass");
    expect(result.domain?.id).toBe("2");
  });

  it("wertet gescheiterte Verifizierung als Fehler", () => {
    const body = { data: [{ id: "abc", name: "cybersarah-ki.com", status: "failure" }] };
    expect(evaluateResendDomains(200, body, null).severity).toBe("fail");
  });

  it("bleibt bei Serverfehlern nur Warnung", () => {
    expect(evaluateResendDomains(502, {}, null).severity).toBe("warn");
    expect(evaluateResendDomains(200, "kaputt", null).severity).toBe("warn");
  });
});

describe("Resend: DNS-Records", () => {
  const domainDetail = {
    id: "abc",
    name: "cybersarah-ki.com",
    status: "not_started",
    records: [
      { record: "SPF", name: "send.cybersarah-ki.com", type: "TXT", status: "not_started", value: "v=spf1 include:amazonses.com ~all" },
      { record: "DKIM", name: "resend._domainkey", type: "TXT", status: "not_started", value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ" },
      { record: "MX", name: "send.cybersarah-ki.com", type: "MX", status: "not_started", value: "feedback-smtp.eu-west-1.amazonses.com" },
    ],
  };

  it("liest Records aus der Domain-Detailantwort", () => {
    const records = extractResendRecords(domainDetail);
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      record: "SPF",
      name: "send.cybersarah-ki.com",
      type: "TXT",
      status: "not_started",
      value: "v=spf1 include:amazonses.com ~all",
    });
  });

  it("ignoriert unbrauchbare Record-Eintraege", () => {
    expect(extractResendRecords({ records: [{ name: "x" }, null, "kaputt"] })).toEqual([]);
    expect(extractResendRecords({})).toEqual([]);
  });

  it("normalisiert gequotete und umbrochene TXT-Werte", () => {
    expect(normalizeDnsTextValue('"v=spf1  include:amazonses.com ~all"')).toBe("v=spf1 include:amazonses.com ~all");
    expect(normalizeDnsTextValue('"p=abc" "def"')).toBe("p=abc def");
  });

  it("erkennt einen Record trotz DNS-Chunking", () => {
    const record = extractResendRecords(domainDetail)[1]!;
    expect(dnsRecordIsPresent(record, ['"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ" "rest"'])).toBe(true);
    expect(dnsRecordIsPresent(record, ['"v=spf1 include:amazonses.com ~all"'])).toBe(false);
    expect(dnsRecordIsPresent(record, [])).toBe(false);
  });

  it("meldet fehlende Records mit Namen", () => {
    const records = extractResendRecords(domainDetail);
    const result = evaluateDnsAlignment(records, {
      "TXT:send.cybersarah-ki.com": ['"v=spf1 include:amazonses.com ~all"'],
    });
    expect(result.severity).toBe("fail");
    expect(result.missing).toEqual(["TXT resend._domainkey", "MX send.cybersarah-ki.com"]);
    expect(result.present).toEqual(["TXT send.cybersarah-ki.com"]);
    expect(result.detail).toMatch(/2\/3/);
  });

  it("bestaetigt vollstaendige Records", () => {
    const records = extractResendRecords(domainDetail);
    const result = evaluateDnsAlignment(records, {
      "TXT:send.cybersarah-ki.com": ['"v=spf1 include:amazonses.com ~all"'],
      "TXT:resend._domainkey": ['"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ"'],
      "MX:send.cybersarah-ki.com": ["10 feedback-smtp.eu-west-1.amazonses.com."],
    });
    expect(result.severity).toBe("pass");
    expect(result.missing).toEqual([]);
  });

  it("warnt, wenn Resend keine Records liefert", () => {
    expect(evaluateDnsAlignment([], {}).severity).toBe("warn");
  });
});

describe("TikTok", () => {
  it("erkennt abgelehnte Client-Daten", () => {
    const result = evaluateTikTokClientProbe(400, { error: "invalid_client", error_description: "Client key not found" });
    expect(result.severity).toBe("fail");
    expect(result.detail).toMatch(/invalid_client/);
  });

  it("bestaetigt akzeptierte Client-Daten", () => {
    expect(evaluateTikTokClientProbe(200, { access_token: "act.abc", expires_in: 7200 }).severity).toBe("pass");
  });

  it("prueft nicht, wenn der Grant nicht freigeschaltet ist", () => {
    const result = evaluateTikTokClientProbe(400, { error: "unsupported_grant_type" });
    expect(result.severity).toBe("skip");
    expect(result.detail).toMatch(/nicht pruefbar/);
  });

  it("erkennt ungueltige Tokens", () => {
    expect(evaluateTikTokTokenProbe(401, {}).severity).toBe("fail");
    expect(evaluateTikTokTokenProbe(200, { error: { code: "access_token_invalid" } }).severity).toBe("fail");
  });

  it("bestaetigt ein lesendes Token mit Profilnamen", () => {
    const result = evaluateTikTokTokenProbe(200, { data: { user: { display_name: "cybersarah" } } });
    expect(result.severity).toBe("pass");
    expect(result.detail).toMatch(/cybersarah/);
  });
});

describe("Meta", () => {
  it("bestaetigt ein gueltiges Token", () => {
    const result = evaluateMetaTokenProbe(200, { id: "123", name: "CyberSarah" });
    expect(result.severity).toBe("pass");
    expect(result.detail).toMatch(/CyberSarah/);
  });

  it("erkennt abgelaufene Tokens am Fehlercode", () => {
    const result = evaluateMetaTokenProbe(400, { error: { code: 190, message: "Invalid OAuth access token" } });
    expect(result.severity).toBe("fail");
    expect(result.detail).toMatch(/190/);
  });

  it("bestaetigt App-Credentials", () => {
    expect(evaluateMetaAppProbe(200, { id: "987", name: "CyberSarah App" }).severity).toBe("pass");
  });

  it("erkennt falsche App-Credentials", () => {
    expect(evaluateMetaAppProbe(400, { error: { code: 100, message: "Invalid appsecret_proof" } }).severity).toBe("fail");
  });
});

describe("Zusammenfassung", () => {
  const results: ProbeResult[] = [
    { name: "a", severity: "pass", detail: "" },
    { name: "b", severity: "warn", detail: "" },
    { name: "c", severity: "skip", detail: "" },
  ];

  it("zaehlt nach Severity", () => {
    const summary = summarizeProbes(results);
    expect(summary).toMatchObject({ total: 3, passed: 1, warned: 1, skipped: 1, failed: 0, exitCode: 0 });
  });

  it("bricht bei Fail ab", () => {
    expect(summarizeProbes([...results, { name: "d", severity: "fail", detail: "" }]).exitCode).toBe(1);
  });

  it("bricht im Strict-Modus auch bei Warnungen ab", () => {
    expect(summarizeProbes(results, false).exitCode).toBe(0);
    expect(summarizeProbes(results, true).exitCode).toBe(1);
  });
});
