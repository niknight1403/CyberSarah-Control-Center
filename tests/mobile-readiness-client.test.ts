import { describe, expect, it, vi } from "vitest";
import { probeMobileReadiness } from "@/lib/mobile-readiness-client";

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

describe("anonymous mobile readiness network check", () => {
  it("confirms only a successful database-backed response", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true, checks: { database: true } }));
    const result = await probeMobileReadiness({
      baseUrl: "https://app.example.test/anything?q=key#fragment",
      now: () => 1234,
      fetcher: fetcher as typeof fetch,
    });
    expect(result).toEqual({ outcome: "ready", checkedAtMs: 1234 });
    expect(fetcher).toHaveBeenCalledWith("https://app.example.test/api/ready", expect.objectContaining({
      method: "GET", cache: "no-store", credentials: "omit", signal: expect.any(AbortSignal),
    }));
  });
  it("classifies explicitly failed database readiness as degraded", async () => {
    const result = await probeMobileReadiness({
      baseUrl: "http://localhost:3000",
      fetcher: (async () => jsonResponse(503, { ok: false, checks: { database: false } })) as typeof fetch,
      now: () => 88,
    });
    expect(result).toEqual({ outcome: "degraded", checkedAtMs: 88 });
  });
  it("rejects HTML, malformed JSON and transport failure without throwing", async () => {
    for (const fetcher of [
      (async () => new Response("<html>oops</html>", { status: 200 })) as typeof fetch,
      (async () => { throw new Error("token=should-not-leak"); }) as typeof fetch,
      (async () => jsonResponse(401, { secret: "do-not-display" })) as typeof fetch,
    ]) {
      const result = await probeMobileReadiness({ baseUrl: "https://example.test", fetcher, now: () => 10 });
      expect(result).toEqual({ outcome: "unreachable", checkedAtMs: 10 });
      expect(JSON.stringify(result)).not.toMatch(/token|secret/i);
    }
  });
  it("never sends requests to invalid or credential-bearing endpoint URLs", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { ok: true, checks: { database: true } }));
    for (const baseUrl of ["javascript:alert(1)", "https://user:pass@example.test", "not-an-url"]) {
      expect((await probeMobileReadiness({ baseUrl, fetcher: fetcher as typeof fetch })).outcome).toBe("unreachable");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("aborts a stalled readiness check after the bounded timeout", async () => {
    const fetcher = (async (_url: string | URL | Request, options?: RequestInit) => new Promise<Response>((_, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })) as typeof fetch;
    const result = await probeMobileReadiness({ baseUrl: "https://example.test", fetcher, timeoutMs: 250, now: () => 50 });
    expect(result).toEqual({ outcome: "unreachable", checkedAtMs: 50 });
  }, 3000);
});
