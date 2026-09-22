import { describe, expect, it } from "vitest";

import { addSoftBreakOpportunities } from "@/lib/text-wrap-logic";

describe("text-wrap-logic", () => {
  it("keeps ordinary prose readable without changing visible characters", () => {
    const value = "Die Verbindung ist aktiv und wurde erfolgreich geprüft.";
    expect(addSoftBreakOpportunities(value).replaceAll("\u200B", "")).toBe(value);
  });

  it("adds invisible break opportunities to long connection strings", () => {
    const value = "postgres://user:password@example.com:5432/database?sslmode=verify-full";
    const wrapped = addSoftBreakOpportunities(value);
    expect(wrapped).not.toBe(value);
    expect(wrapped.replaceAll("\u200B", "")).toBe(value);
    expect(wrapped).toContain("\u200B");
  });

  it("does not create a visible placeholder or alter whitespace", () => {
    const value = "npm install && npm run build\nStatus: grün";
    const wrapped = addSoftBreakOpportunities(value);
    expect(wrapped.replaceAll("\u200B", "")).toBe(value);
    expect(wrapped).not.toContain("...");
  });
});
