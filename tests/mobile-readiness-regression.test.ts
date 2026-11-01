import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeMobileReadiness } from "@/lib/mobile-readiness-logic";

describe("mobile readiness wiring regression", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  it("checks the real server readiness contract instead of process-only health", () => {
    const server = read("server/_core/index.ts");
    expect(server).toContain('app.get("/api/ready"');
    expect(server).toContain("const database = await checkDatabaseHealth()");
    expect(server).toContain("res.status(database ? 200 : 503)");
    const client = read("lib/mobile-readiness-client.ts");
    expect(client).toContain('new URL("/api/ready", parsed)');
    expect(client).not.toContain('new URL("/api/health", parsed)');
  });
  it("has a retryable status in both mobile navigation surfaces", () => {
    const top = read("components/responsive/top-navigation.tsx");
    const drawer = read("components/responsive/nav-drawer.tsx");
    for (const source of [top, drawer]) {
      expect(source).toContain("useMobileReadiness()");
      expect(source).toContain("readiness.view.label");
      expect(source).toContain("onPress={readiness.refresh}");
      expect(source).toContain("disabled={readiness.isChecking}");
    }
  });
  it("never gives a green result solely because the app is mounted", () => {
    for (const outcome of ["degraded", "unreachable"] as const) {
      const view = describeMobileReadiness({ outcome, checkedAtMs: 100 }, 101);
      expect(view.accent).not.toBe("green");
      expect(view.label).not.toBe("LIVE");
    }
  });
});
