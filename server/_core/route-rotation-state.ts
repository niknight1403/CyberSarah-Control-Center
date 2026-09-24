/**
 * Sprint 196 — Synchroner Zustandsspiegel des Route-Rotations-Agenten.
 *
 * Bewusst winzig und import-frei: server/_core/llm.ts liest die aktuelle
 * Primaerroute SYNCHRON (Hot-Pfad der Kandidaten-Sortierung), ohne den
 * Agenten (server/route-rotation-agent.ts) direkt zu importieren — das
 * haette einen Import-Zyklus erzeugt (Agent liest den Pool-Snapshot aus
 * llm.ts). Die Persistenz (KV) liegt allein im Agenten; dieser Spiegel
 * wird beim Boot aus der KV restauriert und nach jeder Aenderung
 * aktualisiert. Fehlt eine Primaerroute (null), sortiert llm.ts wie
 * bisher nach Zero-Cost-Prioritaet.
 */

import type { FreeRouteSource } from "../../lib/route-rotation-agent-logic";

let rotationPrimary: FreeRouteSource | null = null;

/** Aktuell bevorzugte Primaerroute (null = Agent hat keine gesetzt). */
export function getRouteRotationPrimary(): FreeRouteSource | null {
  return rotationPrimary;
}

/** Primaerroute setzen (nur der Rotations-Agent / Admin-Force / Restore). */
export function setRouteRotationPrimary(source: FreeRouteSource | null): void {
  rotationPrimary = source;
}

/** Test-Hook: Spiegel zuruecksetzen. */
export function resetRouteRotationStateForTests(): void {
  rotationPrimary = null;
}
