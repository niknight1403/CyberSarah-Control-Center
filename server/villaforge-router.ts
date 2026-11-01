import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  formatFleetHeadline,
  isSnapshotFresh,
  summarizeFleet,
  type VillaForgeFleetSnapshot,
} from "../lib/villaforge-logic";

/**
 * Sprint 110 — villaforgeRouter: Flottenbruecke zum VillaForge-Hub.
 *
 * Liest den oeffentlichen, auth-freien Endpunkt /api/public/fleet des
 * VillaForge-Hubs (Oracle-VM, hub.cybersarah-ki.com) und stellt der
 * CyberSarah-App aggregated Flottendaten bereit: Slot-Auslastung, Villa-
 * Bestenliste (Scorer), Local-First-Anteil und Messenger-Status.
 *
 * fleet: protected — nur aggregierte, nicht-sensitive Daten.
 * Kein Admin-Gate: Der Status ist fuer alle angemeldeten Nutzer sichtbar.
 */

const VILLAFORGE_HUB_URL = process.env.VILLAFORGE_HUB_URL || "https://hub.cybersarah-ki.com";
const FLEET_TIMEOUT_MS = 4_000;

const fleetSnapshotSchema = z.object({
  villas: z.array(z.object({ status: z.string(), c: z.number() })),
  scheduler: z.object({ slots: z.number(), active: z.array(z.number()), queued: z.number() }),
  scores: z.array(
    z.object({
      villaId: z.number(),
      name: z.string().nullable(),
      score: z.number(),
      doneLastHour: z.number(),
      open: z.number(),
      avgTaskScore: z.number(),
    }),
  ),
  scoredTasks: z.object({ c: z.number(), avg: z.number().nullable() }),
  localFirst: z.object({ localSharePct: z.number() }),
  messenger: z.object({ enabled: z.boolean(), allowedChats: z.number(), running: z.boolean() }),
  ts: z.number(),
});

export async function fetchVillaForgeFleet(): Promise<VillaForgeFleetSnapshot> {
  const response = await fetch(`${VILLAFORGE_HUB_URL}/api/public/fleet`, {
    signal: AbortSignal.timeout(FLEET_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`VillaForge-Hub antwortet mit HTTP ${response.status}`);
  }
  return fleetSnapshotSchema.parse(await response.json()) as VillaForgeFleetSnapshot;
}

export const villaforgeRouter = router({
  /** Aggregierter Flottenstatus des VillaForge-Hubs (protected). */
  fleet: protectedProcedure.query(async () => {
    try {
      const snapshot = await fetchVillaForgeFleet();
      const summary = summarizeFleet(snapshot);
      return {
        ok: true as const,
        fresh: isSnapshotFresh(snapshot),
        summary,
        headline: formatFleetHeadline(summary),
        scores: snapshot.scores.slice(0, 10),
        messenger: snapshot.messenger,
        ts: snapshot.ts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      return { ok: false as const, fresh: false as const, error: message };
    }
  }),
});
