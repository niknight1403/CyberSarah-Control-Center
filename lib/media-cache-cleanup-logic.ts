/**
 * Sprint 309 — Medien-Cache: reine, deterministische Logik fuer Ablauf
 * (TTL) und Aufraeumauftrag (Speicher ehrlich begrenzen).
 *
 * Datenfluss:
 *   Cache-Eintraege (Audio/Bild/Video) werden mit Groesse und Zugriffs-
 *   zeit uebergeben; die Logik plant, welche Eintraege geloescht werden
 *   muessen, um TTL und Byte-Budget einzuhalten — aelteste zuerst.
 *
 * Ehrlichkeits-Grenze: Der Plan ist nur so gut wie die Metadaten.
 *   Fehlende Groessen zaehlen als 0 und werden nie "gross genug" gelogen;
 *   was bleibt, wird mit Rest-Groesse gemeldet, nicht verschwiegen.
 */

export type MediaCacheKind = "audio" | "image" | "video";

export type CacheEntry = {
  id: string;
  kind: MediaCacheKind;
  bytes: number;
  createdAt: number;
  lastAccessedAt: number;
  projectId: string;
};

export const CACHE_LIMITS = {
  ttlDays: 14,
  maxTotalBytes: 512 * 1024 * 1024,
  maxEntries: 200,
} as const;

/** TTL abgelaufen? */
export function isExpired(entry: CacheEntry, now: number): boolean {
  return now - entry.createdAt >= CACHE_LIMITS.ttlDays * 86_400_000;
}

/** Zugriffszeit ehrlich nachziehen (kein Faken von Frische). */
export function markAccessed(entry: CacheEntry, now: number): CacheEntry {
  return { ...entry, lastAccessedAt: now };
}

/** Abgelaufene zuerst (aelteste zuerst), dann LRU, dann aelteste Creation. */
export function cleanupOrder(entries: CacheEntry[], now: number): CacheEntry[] {
  const expired = entries.filter((e) => isExpired(e, now));
  const fresh = entries.filter((e) => !isExpired(e, now));
  const byAge = (a: CacheEntry, b: CacheEntry) => a.createdAt - b.createdAt;
  const byLru = (a: CacheEntry, b: CacheEntry) =>
    a.lastAccessedAt - b.lastAccessedAt || a.createdAt - b.createdAt;
  return [...expired].sort(byAge).concat([...fresh].sort(byLru));
}

export type CleanupPlan = {
  toDelete: CacheEntry[];
  toKeep: CacheEntry[];
  totalBytesBefore: number;
  totalBytesAfter: number;
  report: string;
};

/** Plant die Loeschungen, bis TTL- und Budget-Grenzen eingehalten sind. */
export function planCleanup(
  entries: CacheEntry[],
  now: number,
): CleanupPlan {
  const totalBytesBefore = entries.reduce((sum, e) => sum + e.bytes, 0);
  const ordered = cleanupOrder(entries, now);
  const toDelete: CacheEntry[] = [];

  const mustShrink =
    entries.length > CACHE_LIMITS.maxEntries ||
    totalBytesBefore > CACHE_LIMITS.maxTotalBytes ||
    entries.some((e) => isExpired(e, now));

  let bytes = totalBytesBefore;
  let count = entries.length;
  for (const candidate of ordered) {
    const overBudget = bytes > CACHE_LIMITS.maxTotalBytes;
    const overCount = count > CACHE_LIMITS.maxEntries;
    const ttlHit = isExpired(candidate, now);
    if (!overBudget && !overCount && !ttlHit) break;
    toDelete.push(candidate);
    bytes -= candidate.bytes;
    count -= 1;
  }

  const toKeep = entries.filter((e) => !toDelete.includes(e));
  const report =
    toDelete.length === 0
      ? "Cache im Budget — kein Aufraeumauftrag noetig."
      : `${toDelete.length} Eintrag/Eintraege zum Loeschen vorgemerkt (${Math.round((totalBytesBefore - bytes) / 1024 / 1024)} MB frei), ${toKeep.length} bleiben.`;

  return {
    toDelete,
    toKeep,
    totalBytesBefore,
    totalBytesAfter: bytes,
    report,
  };
}
