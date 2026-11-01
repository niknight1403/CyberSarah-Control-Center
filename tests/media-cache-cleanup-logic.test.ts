/**
 * Sprint 309 — Tests fuer Medien-Cache-Aufraeumlogik.
 */
import { describe, it, expect } from "vitest";
import {
  isExpired,
  markAccessed,
  cleanupOrder,
  planCleanup,
  CACHE_LIMITS,
} from "@/lib/media-cache-cleanup-logic";
import type { CacheEntry } from "@/lib/media-cache-cleanup-logic";

const DAY = 86_400_000;
const entry = (overrides: Partial<CacheEntry> = {}): CacheEntry => ({
  id: "e1",
  kind: "image",
  bytes: 1024,
  createdAt: 0,
  lastAccessedAt: 0,
  projectId: "p1",
  ...overrides,
});

describe("Sprint 309 — Media Cache Cleanup Logic", () => {
  it("erkennt TTL-Ablauf nach 14 Tagen", () => {
    expect(isExpired(entry({ createdAt: 0 }), 0)).toBe(false);
    expect(isExpired(entry({ createdAt: 0 }), 15 * DAY)).toBe(true);
    expect(isExpired(entry({ createdAt: 0 }), CACHE_LIMITS.ttlDays * DAY)).toBe(true);
  });

  it("markAccessed zieht die Zugriffszeit nach", () => {
    const e = markAccessed(entry({ lastAccessedAt: 0 }), 5000);
    expect(e.lastAccessedAt).toBe(5000);
    expect(e.id).toBe("e1");
  });

  it("cleanupOrder: abgelaufene zuerst, dann LRU", () => {
    const now = 20 * DAY;
    const freshOld = entry({ id: "freshOld", createdAt: 10 * DAY, lastAccessedAt: 10 * DAY });
    const freshNew = entry({ id: "freshNew", createdAt: 10 * DAY, lastAccessedAt: 15 * DAY });
    const expired = entry({ id: "expired", createdAt: 0 });
    const order = cleanupOrder([freshNew, freshOld, expired], now);
    expect(order.map((e) => e.id)).toEqual(["expired", "freshOld", "freshNew"]);
  });

  it("planCleanup meldet 'kein Auftrag' im Budget", () => {
    const plan = planCleanup([entry({ createdAt: Date.now() - 1000 })], Date.now());
    expect(plan.toDelete).toHaveLength(0);
    expect(plan.report).toContain("kein Aufraeumauftrag");
  });

  it("planCleanup loescht Abgelaufene und meldet befreite Bytes", () => {
    const now = 20 * DAY;
    const plan = planCleanup(
      [entry({ id: "old", createdAt: 0, bytes: 5 * 1024 * 1024 }), entry({ id: "new", createdAt: 10 * DAY })],
      now,
    );
    expect(plan.toDelete.map((e) => e.id)).toEqual(["old"]);
    expect(plan.toKeep.map((e) => e.id)).toEqual(["new"]);
    expect(plan.totalBytesAfter).toBeLessThan(plan.totalBytesBefore);
    expect(plan.report).toContain("bleiben");
  });

  it("planCleanup kuerzt, wenn das Byte-Budget ueberschritten ist", () => {
    const big = CACHE_LIMITS.maxTotalBytes + 1;
    const plan = planCleanup(
      [
        entry({ id: "a", createdAt: 100, lastAccessedAt: 100, bytes: big / 2 }),
        entry({ id: "b", createdAt: 200, lastAccessedAt: 200, bytes: big / 2 + 1 }),
      ],
      1000,
    );
    expect(plan.toDelete.length).toBeGreaterThan(0);
    expect(plan.totalBytesAfter).toBeLessThanOrEqual(CACHE_LIMITS.maxTotalBytes);
  });
});
