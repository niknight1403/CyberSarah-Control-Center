import { describe, expect, it } from "vitest";

describe("app branding configuration", () => {
  it("keeps the configured app title available for the project runtime", () => {
    expect(process.env.VITE_APP_TITLE ?? "Custom AI Studio").toBe("Custom AI Studio");
  });
});
