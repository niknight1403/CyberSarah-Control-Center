import { describe, expect, it } from "vitest";
import { compressChatHistory, fnv1aHash } from "../lib/chat-compression-logic";

function message(id: string, role: "user" | "assistant" | "system", content: string, timestampMs: number) {
  return { id, role, content, timestampMs };
}

describe("chat compression logic", () => {
  it("keeps short histories untouched without a digest", () => {
    const history = [message("1", "user", "hallo", 1), message("2", "assistant", "hi", 2)];
    const result = compressChatHistory(history, { maxMessages: 5 });
    expect(result.kept).toHaveLength(2);
    expect(result.digest).toBeNull();
  });

  it("always keeps system messages outside the message limit", () => {
    const history = [
      message("s", "system", "anweisung", 0),
      ...Array.from({ length: 6 }, (_, index) => message(`m${index}`, "user", `text ${index}`, index + 1)),
    ];
    const result = compressChatHistory(history, { maxMessages: 3 });
    expect(result.kept.filter((entry) => entry.role === "system")).toHaveLength(1);
    expect(result.kept.filter((entry) => entry.role !== "system")).toHaveLength(3);
    expect(result.digest?.removedCount).toBe(3);
  });

  it("keeps only the most recent messages and orders deterministically", () => {
    const history = Array.from({ length: 10 }, (_, index) => message(`m${index}`, "user", `inhalt ${index}`, 10 - index));
    const result = compressChatHistory(history, { maxMessages: 4 });
    const ids = result.kept.map((entry) => entry.id);
    expect(ids).toEqual(["m3", "m2", "m1", "m0"]);
  });

  it("produces a stable digest hash for identical removed content", () => {
    const history = Array.from({ length: 5 }, (_, index) => message(`m${index}`, "user", `x ${index}`, index));
    const first = compressChatHistory(history, { maxMessages: 2 });
    const second = compressChatHistory(history, { maxMessages: 2 });
    expect(first.digest?.contentHash).toBe(second.digest?.contentHash);
    expect(first.digest?.contentHash).toBe(fnv1aHash("m0:user:x 0\nm1:user:x 1\nm2:user:x 2"));
  });

  it("produces a different digest hash when removed content changes", () => {
    const base = Array.from({ length: 5 }, (_, index) => message(`m${index}`, "user", `x ${index}`, index));
    const changed = base.map((entry, index) => (index === 0 ? { ...entry, content: "geändert" } : entry));
    const first = compressChatHistory(base, { maxMessages: 2 });
    const second = compressChatHistory(changed, { maxMessages: 2 });
    expect(first.digest?.contentHash).not.toBe(second.digest?.contentHash);
  });

  it("removes the plaintext of compressed messages from the result", () => {
    const history = Array.from({ length: 8 }, (_, index) => message(`m${index}`, "user", `geheim ${index}`, index));
    const result = compressChatHistory(history, { maxMessages: 3 });
    expect(JSON.stringify(result)).not.toContain("geheim 0");
    expect(JSON.stringify(result)).not.toContain("geheim 4");
  });

  it("rejects invalid limits", () => {
    expect(() => compressChatHistory([], { maxMessages: 0 })).toThrow();
    expect(() => compressChatHistory([], { maxMessages: Number.NaN })).toThrow();
  });
});
