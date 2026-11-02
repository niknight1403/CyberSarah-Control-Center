import {describe,expect,it} from "vitest";
import {ComputeTier, estimateTokens, initialComputeTier, ComputeCascadingRouter} from "../server/compute-cascading-router";
describe("compute cascading policy", () => {
  it("routes small tasks to local and medium tasks to free cloud", () => {
    expect(initialComputeTier(100)).toBe(ComputeTier.TIER_1_LOCAL);
    expect(initialComputeTier(2000)).toBe(ComputeTier.TIER_2_FREE_CLOUD);
    expect(initialComputeTier(5000)).toBe(ComputeTier.TIER_3_PAID_API);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
  it("rejects empty tasks without contacting a provider", async () => {
    await expect(new ComputeCascadingRouter().executeTask({id:"x",prompt:""})).rejects.toThrow("required");
  });
  it("never falls back to cloud for air-gapped tasks", async () => {
    const prior = process.env.OLLAMA_ENDPOINT;
    process.env.OLLAMA_ENDPOINT = "http://127.0.0.1:1";
    try {
      await expect(new ComputeCascadingRouter().executeTask({id:"offline",prompt:"hello",privacy:"air-gapped"})).rejects.toThrow("No permitted inference route");
    } finally {
      if (prior === undefined) delete process.env.OLLAMA_ENDPOINT;
      else process.env.OLLAMA_ENDPOINT = prior;
    }
  });
});
