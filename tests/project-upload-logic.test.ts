import { describe, expect, it } from "vitest";
import { createNonTextContextEntry, describeNonTextAttachment, formatAttachmentBytes, isProjectTextFile, normalizeProjectPath, PROJECT_UPLOAD_LIMITS } from "../lib/project-upload-logic";

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

describe("Sprint 53 — nicht-textuelle Anhaenge als Kontext", () => {
  it("formatiert Byte-Groessen lesbar", () => {
    expect(formatAttachmentBytes(500)).toBe("500 B");
    expect(formatAttachmentBytes(2_048)).toBe("2.0 KB");
    expect(formatAttachmentBytes(5_242_880)).toBe("5.0 MB");
  });

  it("beschreibt PDF- und Bild-Anhaenge mit Name, Typ und Groesse", () => {
    expect(describeNonTextAttachment({ name: "vertrag.pdf", mimeType: "application/pdf", size: 2_048 })).toBe("vertrag.pdf, application/pdf, 2.0 KB");
    expect(describeNonTextAttachment({ name: "screenshot.png" })).toBe("screenshot.png");
  });

  it("erzeugt Kontext-Eintrage statt Anhaenge still zu verwerfen", () => {
    const entry = createNonTextContextEntry({ name: "design.png", mimeType: "image/png", size: 40_960 });
    expect(entry.name).toBe("design.png");
    expect(entry.content).toContain("[Nicht-textueller Anhang: design.png, image/png, 40.0 KB");
    expect(entry.content).toContain("gezielt nachfragen");
    expect(entry.mimeType).toBe("image/png");
    expect(entry.size).toBe(40_960);
  });
});
