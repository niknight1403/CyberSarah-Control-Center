import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

import { createTRPCClient } from "@/lib/trpc";
import {
  ADMIN_AGENT_SCAN_INTERVAL_MS,
  ADMIN_AGENT_STATE_STORAGE_KEY,
  appendAgentLog,
  planAdminAgentCycle,
  type AdminAgentLogEntry,
  type AdminAgentSystemStatus,
} from "@/lib/admin-autonomous-agent-logic";

type AdminAgentUser = { role?: string } | null | undefined;

export type AdminAgentState = {
  status: AdminAgentSystemStatus;
  lastScanAt: number | null;
  openCount: number;
  criticalCount: number;
  autoRedeployEnabled: boolean;
  log: AdminAgentLogEntry[];
};

const INITIAL_STATE: AdminAgentState = {
  status: "green",
  lastScanAt: null,
  openCount: 0,
  criticalCount: 0,
  autoRedeployEnabled: false,
  log: [],
};

function loadState(raw: string | null): AdminAgentState {
  if (raw == null) return INITIAL_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<AdminAgentState>;
    return {
      status: parsed.status ?? "green",
      lastScanAt: typeof parsed.lastScanAt === "number" ? parsed.lastScanAt : null,
      openCount: typeof parsed.openCount === "number" ? parsed.openCount : 0,
      criticalCount: typeof parsed.criticalCount === "number" ? parsed.criticalCount : 0,
      autoRedeployEnabled: parsed.autoRedeployEnabled === true,
      log: Array.isArray(parsed.log) ? parsed.log : [],
    };
  } catch {
    return INITIAL_STATE;
  }
}

// ---------------------------------------------------------------------------
// Modul-Level Sharing: Mehrere Hook-Instanzen (Root-Layout + Admin-Screen)
// teilen Zustand und Zyklus — nur EINE Instanz fuehrt den Live-Scan aus.
// ---------------------------------------------------------------------------
const stateListeners = new Set<(next: AdminAgentState) => void>();
let cycleOwnerMounted = false;

function notifyStateListeners(next: AdminAgentState) {
  for (const listener of stateListeners) listener(next);
}

/**
 * Sprint 142 — Autonomer Administrator-Agent (Live-Zyklus).
 *
 * Nach dem Admin-Login scannt der Agent im 60s-Intervall (und bei jedem
 * App-Foreground) das Self-Healing-Ledger, leitet eine Korrekturmassnahme
 * ab und fuehrt sie autonom aus. Der Agent darf NIE blockieren oder crashen:
 * Jeder Fehler wird still geschluckt und im naechsten Zyklus erneut versucht.
 */
export function useAdminAutonomousAgent(user: AdminAgentUser) {
  const [state, setState] = useState<AdminAgentState>(INITIAL_STATE);
  const running = useRef(false);
  const lastRemedyAt = useRef<number | null>(null);
  const clientRef = useRef<ReturnType<typeof createTRPCClient> | null>(null);

  /** Vanilla-tRPC-Client (imperative Zyklus, unabhaengig vom React-Query-Cache). */
  const getClient = useCallback(() => {
    clientRef.current ??= createTRPCClient();
    return clientRef.current;
  }, []);

  // Einmalig gespeicherten Zustand laden (Live-Log ueber App-Starts hinweg).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ADMIN_AGENT_STATE_STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) setState(loadState(raw));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: AdminAgentState) => {
    setState(next);
    notifyStateListeners(next);
    AsyncStorage.setItem(ADMIN_AGENT_STATE_STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  // Als Konsument registrieren: Nur der Zyklus-Owner schreibt, alle
  // Instanzen (z. B. Admin-Screen-Karte) erhalten Live-Updates.
  useEffect(() => {
    const listener = (next: AdminAgentState) => setState(next);
    stateListeners.add(listener);
    return () => {
      stateListeners.delete(listener);
    };
  }, []);

  const runCycle = useCallback(async () => {
    const isAdmin = user?.role === "admin";
    if (running.current) return;
    running.current = true;
    try {
      // (1) Live-Scan des Runtime-Log-Puffers + Ledger lesen.
      const client = getClient();
      await client.selfHealing.scanNow.mutate();
      const [list, signatureInfo] = await Promise.all([
        client.selfHealing.incidents.query({ limit: 100 }),
        client.selfHealing.signatures.query(),
      ]);
      const autoRedeployEnabled = signatureInfo?.autoRedeployEnabled === true;

      // (2) Deterministische Entscheidung treffen.
      const plan = planAdminAgentCycle({
        isAdmin,
        incidents: Array.isArray(list) ? list : [],
        autoRedeployEnabled,
        lastRemedyAt: lastRemedyAt.current,
        nowMs: Date.now(),
      });

      // (3) Massnahme autonom ausfuehren (max. eine pro Zyklus).
      const action = plan.actions[0];
      let logEntry: AdminAgentLogEntry = {
        at: Date.now(),
        kind: "wait",
        reason: action?.kind === "wait" ? action.reason : "Zyklus ohne Massnahme",
      };
      if (action && action.kind !== "wait" && "incidentId" in action) {
        logEntry = { at: Date.now(), kind: action.kind, incidentId: action.incidentId, reason: action.reason };
        if (action.kind === "analyze") {
          await client.selfHealing.analyze.mutate({ id: action.incidentId });
        } else if (action.kind === "apply-remedy") {
          await client.selfHealing.applyRemedy.mutate({ id: action.incidentId });
          lastRemedyAt.current = Date.now();
        } else if (action.kind === "acknowledge") {
          await client.selfHealing.acknowledge.mutate({ id: action.incidentId });
        }
      }

      // (4) Zustand aktualisieren + persistieren.
      persist({
        status: plan.status,
        lastScanAt: Date.now(),
        openCount: plan.openCount,
        criticalCount: plan.criticalCount,
        autoRedeployEnabled,
        log: appendAgentLog(state.log, logEntry),
      });
    } catch {
      // Der Agent darf den Betrieb niemals gefaehrden: still bleiben,
      // naechster Zyklus versucht es erneut.
    } finally {
      running.current = false;
    }
  }, [getClient, persist, state.log, user]);

  // Zyklus: sofort, im 60s-Intervall und bei App-Foreground. Nur der
  // erste gemountete Owner aktiviert den Zyklus (keine Doppel-Scans).
  useEffect(() => {
    if (user?.role !== "admin" || cycleOwnerMounted) return;
    cycleOwnerMounted = true;
    void runCycle();
    const interval = setInterval(() => {
      void runCycle();
    }, ADMIN_AGENT_SCAN_INTERVAL_MS);
    return () => {
      cycleOwnerMounted = false;
      clearInterval(interval);
    };
  }, [runCycle, user?.role]);

  return state;
}
