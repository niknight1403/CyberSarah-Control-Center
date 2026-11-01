import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_WORKSPACE_SERVICE_URL,
  ENV,
} from "../server/_core/env";

const originalWorkspaceServiceUrl = process.env.WORKSPACE_SERVICE_URL;

afterEach(() => {
  if (originalWorkspaceServiceUrl === undefined) {
    delete process.env.WORKSPACE_SERVICE_URL;
  } else {
    process.env.WORKSPACE_SERVICE_URL = originalWorkspaceServiceUrl;
  }
});

describe("ENV.workspaceServiceUrl", () => {
  it("uses the zero-config Render service when no override exists", () => {
    delete process.env.WORKSPACE_SERVICE_URL;

    expect(ENV.workspaceServiceUrl).toBe(DEFAULT_WORKSPACE_SERVICE_URL);
  });

  it("normalizes a valid explicit service URL", () => {
    process.env.WORKSPACE_SERVICE_URL = "  https://workspace.example.com///  ";

    expect(ENV.workspaceServiceUrl).toBe("https://workspace.example.com");
  });

  it("rejects invalid overrides and keeps the safe default", () => {
    process.env.WORKSPACE_SERVICE_URL = "javascript:alert(1)";

    expect(ENV.workspaceServiceUrl).toBe(DEFAULT_WORKSPACE_SERVICE_URL);
  });
});
