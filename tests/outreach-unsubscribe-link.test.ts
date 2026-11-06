import { describe, expect, it } from "vitest";

import { buildUnsubscribeUrl } from "../lib/outreach-unsubscribe-link";

const BASE = "https://app.cybersarah-ki.com/api/outreach/unsubscribe";

describe("buildUnsubscribeUrl", () => {
  it("nimmt den Knotenschluessel, damit der richtige Lead getroffen wird", () => {
    const url = buildUnsubscribeUrl(BASE, { leadNodeKey: "ai-influenza-lead:musterbetrieb.de", email: "chef@musterbetrieb.de" });
    expect(url).toContain("lead=ai-influenza-lead%3Amusterbetrieb.de");
    expect(url.startsWith(BASE)).toBe(true);
  });

  it("faellt auf die Adresse zurueck, wenn kein Knoten bekannt ist", () => {
    const url = buildUnsubscribeUrl(BASE, { email: "Chef@Musterbetrieb.de" });
    expect(url).toBe(`${BASE}?email=chef%40musterbetrieb.de`);
  });

  it("baut keinen Link ohne Empfaenger", () => {
    expect(buildUnsubscribeUrl(BASE, {})).toBe("");
    expect(buildUnsubscribeUrl(BASE, { leadNodeKey: "  ", email: "" })).toBe("");
  });

  it("baut keinen Link ohne Basis-URL", () => {
    expect(buildUnsubscribeUrl("", { email: "a@b.de" })).toBe("");
  });

  it("haengt Parameter korrekt an, wenn die Basis schon eine hat", () => {
    expect(buildUnsubscribeUrl(`${BASE}?x=1`, { email: "a@b.de" })).toBe(`${BASE}?x=1&email=a%40b.de`);
  });

  it("kodiert Sonderzeichen, damit der Link nicht bricht", () => {
    const url = buildUnsubscribeUrl(BASE, { email: "a+test@b.de" });
    expect(url).toContain("a%2Btest%40b.de");
  });
});
