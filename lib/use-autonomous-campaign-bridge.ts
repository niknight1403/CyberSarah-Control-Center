import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

import { createTRPCClient } from "@/lib/trpc";
import { planCampaignBridges, type BridgePlan } from "@/lib/campaign-bridge-logic";
import { loadBridgeLedger, markIdeasBridged, type LedgerKeyValueAdapter } from "@/lib/campaign-bridge-ledger";
import { loadIdeaItems } from "@/lib/idea-inbox-store";

/**
 * Sprint 373 — Autonome Ideen→Influencer-Kampagnen-Bruecke (Hook).
 *
 * Laeuft nach dem ADMIN-Login still im Hintergrund (auf jedem Screen, via
 * useAdminFullIntegration) und bringt Produkte und Ideen NACHEINANDER ins
 * Influencer-Marketing: pro Zyklus werden die aeltesten offenen Ideen per
 * reiner Logik zu Kampagnen-Briefs (Persona + Plattform + Ziel), der Server
 * erzeugt daraus echte Content-Entwuerfe in der Freigabe-Queue.
 *
 * Ehrlichkeit:
 *   - Ideen bleiben unangetastet in der Inbox; nur der Ledger merkt sich,
 *     welche Idee bereits verbrueckt wurde (kein Doppel-Brief, auch nach
 *     App-Neustart).
 *   - Dauerskips (z. B. ungueltiges Thema) werden im Ledger vermerkt, damit
 *     die Bruecke sie nicht endlos wieder anfasst.
 *   - Veröffentlicht wird weiterhin nur nach menschlicher Freigabe (HITL) —
 *     die Bruecke integriert und produziert, sie publiziert nicht.
 *   - Idempotent: laeuft mehrfach ohne Nebenwirkungen; nur EINE Instanz
 *     fuehrt Zyklen aus (Modul-Level-Lock).
 */

const BRIDGE_CYCLE_INTERVAL_MS = 120_000;

type AdminUser = { role?: string } | null | undefined;

export type CampaignBridgeState = {
  /** Letzter Zyklus mit Ergebnis — null bis zum ersten Lauf. */
  lastPlan: BridgePlan | null;
  lastRunAt: number | null;
  /** Ehrliche Meldung des letzten Aufrufs (ok oder Fehlergrund). */
  lastMessage: string | null;
};

const INITIAL_STATE: CampaignBridgeState = { lastPlan: null, lastRunAt: null, lastMessage: null };

const stateListeners = new Set<(next: CampaignBridgeState) => void>();
let cycleOwnerMounted = false;
let sharedState: CampaignBridgeState = INITIAL_STATE;

function setState(next: CampaignBridgeState) {
  sharedState = next;
  for (const listener of stateListeners) listener(next);
}

const adapter: LedgerKeyValueAdapter & Parameters<typeof loadIdeaItems>[0] = AsyncStorage;

export function useAutonomousCampaignBridge(user: AdminUser, options?: { cycleIntervalMs?: number }) {
  const [state, setStateLocal] = useState<CampaignBridgeState>(sharedState);
  const isAdmin = user?.role === "admin";
  const runningRef = useRef(false);
  const clientRef = useRef<ReturnType<typeof createTRPCClient> | null>(null);

  useEffect(() => {
    const listener = (next: CampaignBridgeState) => setStateLocal(next);
    stateListeners.add(listener);
    return () => {
      stateListeners.delete(listener);
    };
  }, []);

  const runCycle = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const ledger = await loadBridgeLedger(adapter);
      const { items } = await loadIdeaItems(adapter);
      const plan = planCampaignBridges({
        ideas: items,
        bridgedIdeaIds: new Set(ledger.bridgedIdeaIds),
        pendingContentCount: 0, // Budget schützt server-seitig (ehrlich, kein Client-Raten)
      });
      if (plan.briefs.length === 0 && plan.skipped.length === 0) {
        setState({ lastPlan: plan, lastRunAt: Date.now(), lastMessage: null });
        return;
      }
      clientRef.current ??= createTRPCClient();
      const result = await clientRef.current.campaignBridge.queueFromIdeas.mutate({ briefs: plan.briefs });
      // Erfolgreiche Briefs + Dauerskips im Ledger vermerken (idempotent).
      const doneIds = [
        ...result.result.outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.ideaId),
        ...plan.skipped.map((skip) => skip.ideaId),
      ];
      if (doneIds.length > 0) await markIdeasBridged(adapter, doneIds);
      const failures = result.result.outcomes.filter((outcome) => !outcome.ok);
      const message =
        result.result.queued > 0
          ? `${result.result.queued} Kampagnen-Entwurf/-entwürfe erzeugt — wartet/warten auf deine Freigabe.`
          : plan.briefs.length === 0
            ? null
            : failures.length > 0
              ? `Kein Entwurf erzeugt: ${failures[0]?.reason ?? "unbekannter Grund"}`
              : null;
      setState({ lastPlan: plan, lastRunAt: Date.now(), lastMessage: message });
    } catch (error) {
      setState({ lastPlan: null, lastRunAt: Date.now(), lastMessage: `Brücken-Zyklus fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}` });
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    cycleOwnerMounted = true;
    let disposed = false;
    const start = setTimeout(() => {
      if (!disposed) void runCycle();
    }, 3_000);
    const interval = setInterval(() => {
      if (!disposed && cycleOwnerMounted) void runCycle();
    }, options?.cycleIntervalMs ?? BRIDGE_CYCLE_INTERVAL_MS);
    return () => {
      disposed = true;
      cycleOwnerMounted = false;
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [isAdmin, options?.cycleIntervalMs, runCycle]);

  return state;
}
