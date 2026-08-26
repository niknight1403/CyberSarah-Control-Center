import { describe, expect, it } from "vitest";
import { integrationFixture } from "../constants/integration-fixture";

describe("repository attachment fixture", () => {
  it("provides a private GitHub HTTPS repository and a concrete branch for the in-app integration flow", () => {
    expect(integrationFixture.repositoryUrl).toMatch(/^https:\/\/github\.com\/[\w-]+\/[\w.-]+\.git$/);
    expect(integrationFixture.branch).toBe("main");
  });
});
