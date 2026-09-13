import { describe, expect, it } from "vitest";

import { resolveManagedModel } from "../lib/managed-model-logic";

describe("resolveManagedModel (Sprint 85)", () => {
  it("bevorzugt das explizit angeforderte Modell", () => {
    expect(resolveManagedModel(" gpt-4.1 ", {})).toBe("gpt-4.1");
  });

  it("faellt ohne Anforderung auf AI_MANAGED_MODEL zurueck", () => {
    expect(resolveManagedModel(undefined, { AI_MANAGED_MODEL: "gpt-4.1-mini" })).toBe("gpt-4.1-mini");
  });

  it("bevorzugt AI_MANAGED_MODEL vor OPENAI_MODEL und AI_OPENAI_MODEL", () => {
    expect(
      resolveManagedModel(undefined, {
        AI_MANAGED_MODEL: "managed-a",
        OPENAI_MODEL: "openai-b",
        AI_OPENAI_MODEL: "ai-openai-c",
      }),
    ).toBe("managed-a");
  });

  it("rueckt auf OPENAI_MODEL zurueck, wenn AI_MANAGED_MODEL fehlt", () => {
    expect(
      resolveManagedModel(undefined, {
        OPENAI_MODEL: "openai-b",
        AI_OPENAI_MODEL: "ai-openai-c",
      }),
    ).toBe("openai-b");
  });

  it("liefert gpt-4o-mini, wenn weder Anforderung noch ENV ein Modell liefern", () => {
    expect(resolveManagedModel(undefined, {})).toBe("gpt-4o-mini");
    expect(resolveManagedModel("   ", { AI_MANAGED_MODEL: "   " })).toBe("gpt-4o-mini");
  });
});
