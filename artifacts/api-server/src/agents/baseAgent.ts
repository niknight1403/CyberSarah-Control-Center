/**
 * CyberSarah Control Center — BaseAgent
 *
 * Basis-Klasse aller spezialisierten Agenten. Definiert den Task-Vertrag
 * der zentralen Task-Execution-Pipeline:
 * - Ein Task ist ein reiner Datenbaustein (id, type, action, payload) plus
 *   einer execute()-Funktion, die ihre Ressourcen (Provider, Key, Tool)
 *   ausschliesslich aus dem uebergebenen Ausfuehrungs-Kontext bezieht.
 * - Dadurch kann der ToolLimitResolverAgent nach einem Limit-Fehler den
 *   Task ohne Datenverlust erneut ausfuehren — dieselbe execute()-Funktion,
 *   dasselbe (eingefrorene) Payload, nur mit rotiertem Kontext.
 */

import type { ProviderAssignment, ToolAssignment, ToolKind } from "../lib/toolRotatorEngine";

/** Ressourcen-Zuweisung eines Versuchs (rotierbar ohne Datenverlust). */
export interface AgentTaskContext {
  /** 1-basierter Versuchszähler. */
  attempt: number;
  /** Obergrenze der Versuche ueber alle Rotations-Spruenge. */
  maxAttempts: number;
  /** LLM-Provider-Zuweisung (nur wenn der Task einen benoetigt). */
  provider?: ProviderAssignment;
  /** Tool-Zuweisung (nur wenn der Task eines benoetigt). */
  tool?: ToolAssignment;
  /** True, wenn die reservierte Admin-VIP-Lane genutzt wird. */
  isAdminLane: boolean;
}

export interface AgentTask {
  /** Eindeutige Task-ID (z. B. ULID/UUID) — Basis fuer Wiederaufnahme. */
  id: string;
  /** Logischer Task-Typ (z. B. "llm.chat", "tool.search", "social.post"). */
  type: string;
  /** HITL-Aktionslabel fuer die Risiko-Bewertung (evaluateHITLRisk). */
  action: string;
  /** Geschuetzte Nutzdaten — werden bei Re-Routing unveraendert wiederverwendet. */
  payload: Record<string, unknown>;
  /** True: Task laeuft über die reservierte Admin-VIP-Lane (0% Limits). */
  isAdmin?: boolean;
  /** LLM-Task: rotiert bei Limits durch die Free-Provider-Kaskade. */
  requiresProvider?: boolean;
  /** Tool-Task: rotiert bei Limits durch die Fallback-Kette des Kinds. */
  requiresTool?: ToolKind;
  /** Max. Versuche (Default: Laenge der Provider-Kaskade + Tool-Kette). */
  maxAttempts?: number;
  /**
   * Fuehrt den Task mit dem uebergebenen Kontext aus. Muss dieselben
   * Eingabedaten bei jedem Aufruf akzeptieren — keine Seiteneffekte
   * auf payload, damit Re-Routing verlustfrei bleibt.
   */
  execute: (context: AgentTaskContext) => Promise<unknown>;
}

export type AgentTaskStatus =
  | "completed" // erfolgreich ausgefuehrt (ggf. nach Rotation)
  | "operator_confirm_required" // HITL-Stopp: bezahltes Upgrade / schwere Systemaenderung
  | "exhausted"; // alle kostenlosen Tiers erschöpft

export interface AgentTaskResult {
  status: AgentTaskStatus;
  /** Ergebnis von execute() bei Status "completed". */
  output?: unknown;
  /** Anzahl tatsaechlich ausgefuehrter Versuche. */
  attempts: number;
  /** Fuer OPERATOR_CONFIRM_REQUIRED: HITL-Begruendung. */
  reason?: string;
  /** Zuletzt genutzter Provider bzw. Key (Diagnose, ohne Klartext-Key). */
  providerUsed?: string;
  toolUsed?: string;
}

/** Gemeinsame Basis aller Agenten des Control Centers. */
export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly description: string;

  /** Aufgabe verarbeiten — von spezialisierten Agenten implementiert. */
  abstract processTask(task: AgentTask): Promise<AgentTaskResult>;

  /** Konsolige Diagnose ohne Klartext-Secrets. */
  describe(): string {
    return `${this.name}: ${this.description}`;
  }
}

/** Friert Nutzdaten rekursiv ein — verhindert Datenverlust/-mutation beim Re-Routing. */
export function freezePayload<T extends Record<string, unknown>>(payload: T): Readonly<T> {
  return Object.freeze(payload);
}
