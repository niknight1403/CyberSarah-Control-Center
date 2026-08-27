import { describe, expect, it } from "vitest";
import { isProjectTextFile, normalizeProjectPath, PROJECT_UPLOAD_LIMITS } from "../lib/project-upload-logic";

describe("project upload logic", () => {
  it("accepts source and structured text files but rejects binaries", () => {
    expect(isProjectTextFile({ name: "src/App.tsx", mimeType: "text/typescript" })).toBe(true);
    expect(isProjectTextFile({ name: "package.json", mimeType: "application/json" })).toBe(true);
    expect(isProjectTextFile({ name: "release.zip", mimeType: "application/zip" })).toBe(false);
    expect(isProjectTextFile({ name: "build.png", mimeType: "image/png" })).toBe(false);
  });

  it("removes traversal segments from project file labels", () => {
    expect(normalizeProjectPath("../../CyberSarah-revenue-os\\src\\App.tsx")).toBe("CyberSarah-revenue-os/src/App.tsx");
  });

  it("keeps bounded upload limits explicit", () => {
    expect(PROJECT_UPLOAD_LIMITS.maxFiles).toBe(24);
    expect(PROJECT_UPLOAD_LIMITS.maxTotalBytes).toBeLessThanOrEqual(1_200_000);
    expect(PROJECT_UPLOAD_LIMITS.maxFileBytes).toBeLessThan(PROJECT_UPLOAD_LIMITS.maxTotalBytes);
  });
});
