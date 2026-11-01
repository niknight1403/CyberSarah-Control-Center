import { describe, it, expect } from "vitest";
import {
  DEFAULT_CHANNELS,
  decideSend,
  connectChannel,
  describeChannels,
  canReceive,
} from "@/lib/channel-parity-logic";

describe("Paritaet 5/6 — Channel-Paritaet", () => {
  it("unverbundene Kanaele senden nichts — ehrlich", () => {
    const r = decideSend(DEFAULT_CHANNELS, "telegram");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("nicht verbunden");
    const connected = connectChannel(DEFAULT_CHANNELS, "telegram");
    const ok = decideSend(connected, "telegram");
    expect(ok.ok).toBe(true);
    expect(decideSend(DEFAULT_CHANNELS, "gibtsnicht" as never).ok).toBe(false);
  });

  it("Richtung wird respektiert: nur eingehend sendet nichts", () => {
    const inboundOnly = [{ id: "phone" as const, label: "Telefon", direction: "rein" as const, freePossible: false, connected: true }];
    const r = decideSend(inboundOnly, "phone");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("nur eingehend");
  });

  it("Empfang nur ueber verbundene, empfangsbereite Kanaele", () => {
    expect(canReceive(DEFAULT_CHANNELS, "telegram")).toBe(false);
    const connected = connectChannel(DEFAULT_CHANNELS, "telegram");
    expect(canReceive(connected, "telegram")).toBe(true);
    const phoneConnected = connectChannel(DEFAULT_CHANNELS, "phone");
    expect(canReceive(phoneConnected, "phone")).toBe(false); // direction: raus
  });

  it("Uebersicht trennt gratis verbindbar von ehrlich ausgeschlossen", () => {
    const connected = connectChannel(DEFAULT_CHANNELS, "slack");
    const text = describeChannels(connected);
    expect(text).toContain("Verbunden: Slack");
    expect(text).toContain("Gratis verbindbar: Telegram");
    expect(text).toContain("ehrlich ausgeschlossen");
    expect(describeChannels(DEFAULT_CHANNELS)).toContain("erreicht niemanden");
  });
});
