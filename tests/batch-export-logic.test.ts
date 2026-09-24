/**
 * Sprint 311 — Tests fuer Batch-Export mit Fehlerfortsetzung.
 */
import { describe, it, expect } from "vitest";
import {
  createBatch,
  nextPendingProject,
  recordItemResult,
  summarizeBatch,
  resetFailedForRetry,
} from "@/lib/batch-export-logic";

describe("Sprint 311 — Batch Export Logic", () => {
  it("erstellt einen deduplizierten Batch mit laufendem Status", () => {
    const b = createBatch("b1", ["p1", "p2", "p1"]);
    expect(b.items.map((i) => i.projectId)).toEqual(["p1", "p2"]);
    expect(b.state).toBe("running");
    expect(createBatch("b2", []).state).toBe("done");
  });

  it("liefert Projekte in Reihenfolge und null am Ende", () => {
    const b = createBatch("b1", ["p1", "p2"]);
    expect(nextPendingProject(b)).toBe("p1");
    const after = recordItemResult(b, "p1", { ok: true }, 10);
    expect(nextPendingProject(after)).toBe("p2");
    const done = recordItemResult(after, "p2", { ok: true }, 20);
    expect(nextPendingProject(done)).toBeNull();
    expect(done.finishedAt).toBe(20);
  });

  it("Fehler stoppen den Batch NICHT — Fortsetzung bleibt moeglich", () => {
    const b = createBatch("b1", ["p1", "p2", "p3"]);
    let run = recordItemResult(b, "p1", { ok: false, reason: "FFmpeg fehlt" }, 1);
    expect(nextPendingProject(run)).toBe("p2");
    run = recordItemResult(run, "p2", { ok: true }, 2);
    run = recordItemResult(run, "p3", { ok: true }, 3);
    const sum = summarizeBatch(run);
    expect(sum.state).toBe("partial");
    expect(sum.report).toContain("p1");
    expect(sum.report).toContain("nicht als Erfolg");
  });

  it("alle erfolgreich => done; alle fehlgeschlagen => failed", () => {
    let b = createBatch("b1", ["p1", "p2"]);
    b = recordItemResult(b, "p1", { ok: true }, 1);
    expect(summarizeBatch(recordItemResult(b, "p2", { ok: true }, 2)).state).toBe("done");

    let c = createBatch("b2", ["p1"]);
    c = recordItemResult(c, "p1", { ok: false, reason: "x" }, 1);
    expect(summarizeBatch(c).state).toBe("failed");
  });

  it("ignoriert Ergebnisse fuer bereits abgeschlossene Items", () => {
    let b = createBatch("b1", ["p1"]);
    b = recordItemResult(b, "p1", { ok: true }, 1);
    const again = recordItemResult(b, "p1", { ok: false, reason: "spaet" }, 2);
    expect(again.items[0].state).toBe("exported");
  });

  it("resetFailedForRetry setzt nur Fehler zurueck", () => {
    let b = createBatch("b1", ["p1", "p2"]);
    b = recordItemResult(b, "p1", { ok: false, reason: "x" }, 1);
    b = recordItemResult(b, "p2", { ok: true }, 2);
    const retry = resetFailedForRetry(b);
    expect(retry.items.find((i) => i.projectId === "p1")?.state).toBe("pending");
    expect(retry.items.find((i) => i.projectId === "p2")?.state).toBe("exported");
    expect(retry.state).toBe("running");
  });
});
