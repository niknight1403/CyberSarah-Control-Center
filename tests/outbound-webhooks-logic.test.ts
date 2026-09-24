import { describe, it, expect } from "vitest";
import {
  shouldNotify,
  buildPayload,
  summarizeDeliveries,
  isValidOutboundUrl,
} from "@/lib/outbound-webhooks-logic";
import type { OutboundConfig } from "@/lib/outbound-webhooks-logic";

const cfg = (over: Partial<OutboundConfig> = {}): OutboundConfig => ({
  target: "slack",
  webhookUrl: "https://hooks.example/x",
  minSeverity: "warnung",
  ...over,
});

describe("Sprint 341 — Slack/Discord-Webhooks", () => {
  it("Schweregrad-Filter: erst ab Mindest-Schweregrad", () => {
    expect(shouldNotify(cfg(), "info")).toBe(false);
    expect(shouldNotify(cfg(), "warnung")).toBe(true);
    expect(shouldNotify(cfg({ minSeverity: "info" }), "info")).toBe(true);
  });

  it("Payloads je Anbieter mit passender Schweregrad-Faerbung", () => {
    const slack = buildPayload("slack", "Hallo", "kritisch") as Record<string, any>;
    expect(slack.text).toContain(":rotating_light:");
    const discord = buildPayload("discord", "Hallo", "warnung") as Record<string, any>;
    expect(discord.embeds[0].color).toBe(16776960);
    expect(discord.content).toBe("Hallo");
  });

  it("ohne Ziel ehrlich: NICHT versendet; unbestaetigt bleibt unbestaetigt", () => {
    expect(summarizeDeliveries([])).toContain("NICHT versendet");
    const s = summarizeDeliveries([
      { target: "slack", confirmed: true, at: 1 },
      { target: "discord", confirmed: false, at: 1 },
    ]);
    expect(s).toContain("bestaetigt: slack");
    expect(s).toContain("Nicht bestaetigt");
  });

  it("nur https und kein localhost", () => {
    expect(isValidOutboundUrl("https://hooks.slack.com/x")).toBe(true);
    expect(isValidOutboundUrl("http://hooks.slack.com/x")).toBe(false);
    expect(isValidOutboundUrl("https://localhost/x")).toBe(false);
    expect(isValidOutboundUrl("gar-keine-url")).toBe(false);
  });
});
