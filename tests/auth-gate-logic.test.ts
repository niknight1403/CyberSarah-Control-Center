import { describe, expect, it } from "vitest";

import { authGateRoute, resolveAuthGate } from "@/lib/auth-gate-logic";

describe("Sprint 373: Auth-Gate-Logik", () => {
  it("bleibt im Loading, solange die Session-Abfrage nicht entschieden ist", () => {
    expect(resolveAuthGate({ meResolved: false, user: { role: "admin" }, onboardingStatus: "incomplete" })).toBe("loading");
    expect(resolveAuthGate({ meResolved: false, user: null, onboardingStatus: "complete" })).toBe("loading");
  });

  it("leitet ohne Anmeldung auf den Login — Login ist der Start der App", () => {
    expect(resolveAuthGate({ meResolved: true, user: null, onboardingStatus: "complete" })).toBe("login");
    // Login hat Vorrang vor dem einmaligen Onboarding.
    expect(resolveAuthGate({ meResolved: true, user: null, onboardingStatus: "incomplete" })).toBe("login");
  });

  it("zeigt nach der Anmeldung das einmalige Onboarding", () => {
    expect(resolveAuthGate({ meResolved: true, user: { role: "admin" }, onboardingStatus: "incomplete" })).toBe("onboarding");
  });

  it("laesst angemeldete Nutzer mit abgeschlossenem Onboarding in die App", () => {
    expect(resolveAuthGate({ meResolved: true, user: { role: "admin" }, onboardingStatus: "complete" })).toBe("app");
    expect(resolveAuthGate({ meResolved: true, user: { role: "user" }, onboardingStatus: "complete" })).toBe("app");
  });

  it("leitet nur Login und Onboarding auf Routen — loading und app bleiben sitzen", () => {
    expect(authGateRoute("login")).toBe("/login");
    expect(authGateRoute("onboarding")).toBe("/onboarding");
    expect(authGateRoute("loading")).toBeNull();
    expect(authGateRoute("app")).toBeNull();
  });
});
