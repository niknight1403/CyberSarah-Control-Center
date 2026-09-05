import { afterEach, describe, expect, it, vi } from "vitest";
import { createSecurityMiddleware } from "../server/_core/security";

afterEach(() => {
  vi.unstubAllEnvs();
});

function response() {
  const headers = new Map<string, string>();
  return {
    headers,
    header(name: string, value: string) {
      headers.set(name, value);
    },
    setHeader(name: string, value: string | number) {
      headers.set(name, String(value));
    },
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn(),
    sendStatus: vi.fn(),
  };
}

describe("HTTP security middleware", () => {
  it("allows configured origins and sets security headers", () => {
    vi.stubEnv("APP_ALLOWED_ORIGINS", "https://app.example.com");
    const middleware = createSecurityMiddleware();
    const res = response();
    const next = vi.fn();
    middleware(
      {
        method: "GET",
        headers: { origin: "https://app.example.com" },
        ip: "1.2.3.4",
      } as never,
      res as never,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("rejects unconfigured origins", () => {
    vi.stubEnv("APP_ALLOWED_ORIGINS", "https://app.example.com");
    const middleware = createSecurityMiddleware();
    const res = response();
    const next = vi.fn();
    middleware(
      {
        method: "GET",
        headers: { origin: "https://evil.example" },
        ip: "1.2.3.4",
      } as never,
      res as never,
      next,
    );
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 429 after the configured request limit", () => {
    vi.stubEnv("APP_ALLOWED_ORIGINS", "");
    vi.stubEnv("RATE_LIMIT_MAX_REQUESTS", "1");
    const middleware = createSecurityMiddleware();
    const next = vi.fn();
    const first = response();
    const second = response();
    const request = { method: "GET", headers: {}, ip: "1.2.3.4" } as never;
    middleware(request, first as never, next);
    middleware(request, second as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(second.statusCode).toBe(429);
  });
});
