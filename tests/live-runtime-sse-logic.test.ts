import { describe, expect, it } from "vitest";
import {
  decodeSseLogEvent,
  formatLogTime,
  formatUptime,
  isSseContentType,
  mergeRuntimeLogs,
  parseSseChunk,
} from "../lib/live-runtime-sse-logic";
import type { LiveRuntimeLogEntry } from "../lib/live-runtime-sse-logic";

const ENTRY = { id: "a1", level: "warn", source: "server", message: "Kaltstart", atMs: 1_762_600_000_000 };

describe("live-runtime-sse-logic", () => {
  it("parst SSE-Chunks ueber Grenzen hinweg und ignoriert Kommentare", () => {
    const first = parseSseChunk("", "data: {\"id\":\"a1\"}\n\n: ping 123\n\n");
    expect(first.events).toEqual(['{"id":"a1"}']);
    expect(first.remainder).toBe("");
    const split = parseSseChunk("", 'data: {"id":"b2');
    expect(split.events).toEqual([]);
    const completed = parseSseChunk(split.remainder, '"}\n\n');
    expect(completed.events).toEqual(['{"id":"b2"}']);
    expect(completed.remainder).toBe("");
  });

  it("akzeptiert nur text/event-stream als Content-Type", () => {
    expect(isSseContentType("text/event-stream; charset=utf-8")).toBe(true);
    expect(isSseContentType("application/json")).toBe(false);
    expect(isSseContentType(null)).toBe(false);
  });

  it("deserialisiert Log-Payloads tolerante und lehnt Muell ab", () => {
    expect(decodeSseLogEvent(JSON.stringify(ENTRY))).toEqual(ENTRY);
    expect(decodeSseLogEvent(JSON.stringify({ ...ENTRY, level: "boom" }))?.level).toBe("info");
    expect(decodeSseLogEvent("kein json")).toBeNull();
    expect(decodeSseLogEvent(JSON.stringify({ id: "x" }))).toBeNull();
    expect(decodeSseLogEvent(JSON.stringify([ENTRY]))).toBeNull();
  });

  it("verschmilzt Logstrecken ohne Duplikate und begrenzt die Groesse", () => {
    const a = [{ id: "1", level: "info" as const, source: "s", message: "m", atMs: 1 }];
    const b = [{ id: "1", level: "info" as const, source: "s", message: "m", atMs: 1 }, { id: "2", level: "info" as const, source: "s", message: "m", atMs: 2 }];
    expect(mergeRuntimeLogs(a, b)).toHaveLength(2);
    const many = Array.from({ length: 10 }, (_, i): LiveRuntimeLogEntry => ({
      id: `x-${i}`,
      level: "info",
      source: "s",
      message: "m",
      atMs: i,
    }));
    expect(mergeRuntimeLogs([], many, 5)).toHaveLength(5);
    expect(mergeRuntimeLogs([], many, 5).at(-1)?.id).toBe("x-9");
  });

  it("formatiert Zeit und Uptime menschenlesbar", () => {
    expect(formatLogTime(new Date("2026-09-10T14:03:09").getTime())).toBe("14:03:09");
    expect(formatUptime(0)).toBe("0 s");
    expect(formatUptime(65_000)).toBe("1 min 5 s");
    expect(formatUptime(7_200_000)).toBe("2 h 0 min");
  });
});
