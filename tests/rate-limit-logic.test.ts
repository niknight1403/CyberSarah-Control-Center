import { describe, it, expect } from "vitest";
import {
  rateLimitKey,
  currentCount,
  decideRateLimit,
  recordAllowedRequest,
  formatTooManyRequestsMessage,
} from "@/lib/rate-limit-logic";
import type { RateLimitRule } from "@/lib/rate-limit-logic";

const MIN = 60_000;
const rules: RateLimitRule[] = [{ route: "/api/chat", limit: 2, windowMs: MIN }];

describe("Sprint 325 — Rate-Limits pro Route und Nutzer", () => {
  it("Schluessel trennt Route und Nutzer", () => {
    expect(rateLimitKey("/api/chat", "u1")).toBe("/api/chat::u1");
    expect(rateLimitKey("/api/chat", "u1")).not.toBe(rateLimitKey("/api/chat", "u2"));
  });

  it("Fensterzaehler startet neu, wenn das Fenster abgelaufen ist", () => {
    const key = rateLimitKey("/api/chat", "u1");
    const counters = { [key]: { count: 5, windowStartedAt: 0 } };
    expect(currentCount(counters, key, MIN, MIN).count).toBe(0);
    expect(currentCount(counters, key, 1000, MIN).count).toBe(5);
  });

  it("limitiert beim Limit mit echtem Retry-After aus dem Fensterende", () => {
    let counters: Record<string, { count: number; windowStartedAt: number }> = {};
    counters = recordAllowedRequest(counters, "/api/chat", "u1", 0);
    counters = recordAllowedRequest(counters, "/api/chat", "u1", 100);
    expect(decideRateLimit(rules, "/api/chat", "u1", counters, 200).allowed).toBe(false);
    const d = decideRateLimit(rules, "/api/chat", "u1", counters, 200);
    if (!d.allowed) expect(d.retryAfterMs).toBe(MIN - 200);
  });

  it("andere Nutzer sind von der Limitierung nicht betroffen", () => {
    let counters: Record<string, { count: number; windowStartedAt: number }> = {};
    counters = recordAllowedRequest(counters, "/api/chat", "u1", 0);
    counters = recordAllowedRequest(counters, "/api/chat", "u1", 100);
    const u2 = decideRateLimit(rules, "/api/chat", "u2", counters, 200);
    expect(u2.allowed).toBe(true);
  });

  it("Routes ohne Regel bleiben bewusst unbegrenzt", () => {
    const d = decideRateLimit(rules, "/api/health", "u1", {}, 0);
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.remaining).toBe(Infinity);
  });

  it("429-Nachricht mit Sekunden aus dem Retry-After", () => {
    expect(formatTooManyRequestsMessage(59_900)).toContain("60 Sekunde");
    expect(formatTooManyRequestsMessage(1000)).toContain("1 Sekunde");
  });
});
