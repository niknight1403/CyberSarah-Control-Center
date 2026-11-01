import { beforeEach, describe, expect, it, vi } from "vitest";

const { readAsStringAsync } = vi.hoisted(() => ({ readAsStringAsync: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({
  EncodingType: { UTF8: "utf8" },
  readAsStringAsync,
}));

import { formatProjectContext, readProjectContext } from "../lib/project-upload-reader";
import { PROJECT_UPLOAD_LIMITS } from "../lib/project-upload-logic";

const file = (name: string, extra: Record<string, unknown> = {}) => ({
  kind: "datei" as const,
  id: name,
  name,
  uri: `file:///${name}`,
  ...extra,
});

describe("project upload reader", () => {
  beforeEach(() => readAsStringAsync.mockReset());

  it("reads and bounds text files, while representing non-text files as metadata", async () => {
    readAsStringAsync.mockResolvedValue("export const answer = 42;");
    const result = await readProjectContext([
      file("src/answer.ts", { size: 28, mimeType: "text/typescript" }),
      file("diagram.png", { size: 2_048, mimeType: "image/png" }),
    ]);

    expect(readAsStringAsync).toHaveBeenCalledWith("file:///src/answer.ts", { encoding: "utf8" });
    expect(result.files[0]).toMatchObject({ name: "src/answer.ts", content: "export const answer = 42;", size: 28 });
    expect(result.files[1].content).toContain("diagram.png, image/png, 2.0 KB");
    expect(result.skipped).toEqual([]);
  });

  it("reports individually oversized files, aggregate-limit files, and read failures", async () => {
    for (let index = 0; index < 7; index += 1) readAsStringAsync.mockResolvedValueOnce("a".repeat(160_000));
    readAsStringAsync.mockRejectedValueOnce(new Error("read failed"));
    const result = await readProjectContext([
      file("large.txt", { size: PROJECT_UPLOAD_LIMITS.maxFileBytes + 1 }),
      ...Array.from({ length: 7 }, (_, index) => file(`part-${index}.txt`, { size: 160_000 })),
      file("over-total.txt", { size: 100_000 }),
      file("unreadable.txt", { size: 10 }),
    ]);

    expect(result.files).toHaveLength(7);
    expect(result.skipped).toEqual([
      "large.txt (zu groß)",
      "over-total.txt (Gesamtlimit)",
      "unreadable.txt (nicht lesbar)",
    ]);
  });

  it("limits processed attachments and formats context blocks", async () => {
    readAsStringAsync.mockResolvedValue("body");
    const attachments = Array.from({ length: PROJECT_UPLOAD_LIMITS.maxFiles + 1 }, (_, index) =>
      file(`file-${index}.txt`, { size: 4 }),
    );
    const result = await readProjectContext(attachments);

    expect(result.files).toHaveLength(PROJECT_UPLOAD_LIMITS.maxFiles);
    expect(readAsStringAsync).toHaveBeenCalledTimes(PROJECT_UPLOAD_LIMITS.maxFiles);
    expect(formatProjectContext(result.files.slice(0, 1))).toBe(
      "\n--- PROJECT FILE: file-0.txt ---\nbody\n--- END PROJECT FILE ---",
    );
    expect(formatProjectContext([])).toBe("");
  });
});
