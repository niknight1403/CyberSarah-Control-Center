import { describe, expect, it } from "vitest";
import { AI_INFLUENZA_PACKAGE_IDS } from "../lib/ai-influenza-team-logic";
import {
  buildPackageLoginPath,
  resolvePostLoginPath,
  resolveRequestedPackage,
} from "../lib/post-login-navigation-logic";

describe("AI Influenza package selection round-trip", () => {
  it.each(AI_INFLUENZA_PACKAGE_IDS)(
    "retains %s from sales page through login to checkout selection",
    (packageId) => {
      const loginPath = buildPackageLoginPath(packageId);
      const loginUrl = new URL(loginPath, "https://app.example.invalid");
      expect(loginUrl.pathname).toBe("/login");

      const afterLogin = resolvePostLoginPath(loginUrl.searchParams.get("next"));
      const teamUrl = new URL(afterLogin, "https://app.example.invalid");
      expect(teamUrl.pathname).toBe("/ai-influenza-team");
      expect(
        resolveRequestedPackage(teamUrl.searchParams.get("package") ?? undefined, AI_INFLUENZA_PACKAGE_IDS),
      ).toBe(packageId);
    },
  );

  it("never forwards a malicious external post-login target", () => {
    const loginUrl = new URL("/login?next=https%3A%2F%2Fevil.example%2Fcheckout", "https://app.example.invalid");
    expect(resolvePostLoginPath(loginUrl.searchParams.get("next"))).toBe("/");
  });
});
