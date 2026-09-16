/**
 * Sprint 137 — Mehrere Superagenten (rein, testbar).
 *
 * Validierung, Normalisierung und Seed-Daten fuer die Verwaltung mehrerer
 * benannter Superagenten pro Nutzer, die jeweils an einer eigenen Aufgabe
 * arbeiten und einen eigenen, isolierten Chatverlauf besitzen (verknuepft
 * ueber sessionId mit der bestehenden chatMessages-Sitzungslogik, siehe
 * lib/chat-session-logic.ts). Die eigentliche DB-Anbindung liegt in
 * server/db.ts — dieses Modul bleibt frei von Seiteneffekten.
 */

import { DEFAULT_SESSION_ID, sanitizeSessionId } from "./chat-session-logic";

export const SUPER_AGENT_STATUSES = ["aktiv", "pausiert", "archiviert"] as const;
export type SuperAgentStatus = (typeof SUPER_AGENT_STATUSES)[number];

export const SUPER_AGENT_STATUS_LABELS: Record<SuperAgentStatus, string> = {
  aktiv: "Aktiv",
  pausiert: "Pausiert",
  archiviert: "Archiviert",
};

/** Kuratierte Farbpalette fuer neue Agenten (zyklisch vergeben, kollisionsarm). */
export const SUPER_AGENT_COLORS = [
  "#FFB000", // Bernstein (Standard-Agent)
  "#00F2FE", // Cyan
  "#7B5CFF", // Violett
  "#37E58C", // Gruen
  "#FF6B7A", // Rosa-Rot
  "#5AC8FA", // Himmelblau
  "#FFD54F", // Gelb
] as const;

export const DEFAULT_SUPER_AGENT_NAME = "Elara";
export const DEFAULT_SUPER_AGENT_PURPOSE = "Allgemeiner Assistent für das Control Center — ohne festgelegte Einzelaufgabe.";
export const SUPER_AGENT_NAME_MAX_LENGTH = 80;
export const SUPER_AGENT_PURPOSE_MAX_LENGTH = 400;

export function isSuperAgentStatus(value: string): value is SuperAgentStatus {
  return (SUPER_AGENT_STATUSES as readonly string[]).includes(value);
}

export type SuperAgentInput = {
  name: string;
  purpose?: string;
  color?: string;
};

export type NormalizedSuperAgentInput = {
  name: string;
  purpose: string;
  color: string;
};

function normalizeColor(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed : fallback;
}

/** Validiert + normalisiert eine Agenten-Eingabe. Wirft bei fehlendem Namen. */
export function normalizeSuperAgentInput(input: SuperAgentInput, colorFallback: string = SUPER_AGENT_COLORS[0]): NormalizedSuperAgentInput {
  const name = (input.name ?? "").trim().slice(0, SUPER_AGENT_NAME_MAX_LENGTH);
  if (name.length === 0) throw new Error("Der Name des Superagenten darf nicht leer sein.");
  return {
    name,
    purpose: (input.purpose ?? "").trim().slice(0, SUPER_AGENT_PURPOSE_MAX_LENGTH),
    color: normalizeColor(input.color, colorFallback),
  };
}

export type SuperAgentPatch = Partial<SuperAgentInput> & { status?: SuperAgentStatus };
export type NormalizedSuperAgentPatch = Partial<NormalizedSuperAgentInput> & { status?: SuperAgentStatus };

/** Wie normalizeSuperAgentInput, aber fuer Teil-Updates: nur uebergebene
 * Felder werden normalisiert, ein leerer Name in einem Patch wird abgelehnt
 * (leeres Objekt heisst hingegen "nichts aendern"). */
export function normalizeSuperAgentPatch(patch: SuperAgentPatch): NormalizedSuperAgentPatch {
  const result: NormalizedSuperAgentPatch = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, SUPER_AGENT_NAME_MAX_LENGTH);
    if (name.length === 0) throw new Error("Der Name des Superagenten darf nicht leer sein.");
    result.name = name;
  }
  if (patch.purpose !== undefined) result.purpose = patch.purpose.trim().slice(0, SUPER_AGENT_PURPOSE_MAX_LENGTH);
  if (patch.color !== undefined) result.color = normalizeColor(patch.color, SUPER_AGENT_COLORS[0]);
  if (patch.status !== undefined) {
    if (!isSuperAgentStatus(patch.status)) throw new Error(`Unbekannter Status: ${patch.status}`);
    result.status = patch.status;
  }
  return result;
}

/** Seed des Standard-Agenten — nutzt bewusst die feste sessionId "default",
 * damit vor dieser Funktion gefuehrte Chatverlaeufe erhalten bleiben. */
export function defaultSeedSuperAgent(): { name: string; purpose: string; color: string; sessionId: string; isDefault: true } {
  return {
    name: DEFAULT_SUPER_AGENT_NAME,
    purpose: DEFAULT_SUPER_AGENT_PURPOSE,
    color: SUPER_AGENT_COLORS[0],
    sessionId: DEFAULT_SESSION_ID,
    isDefault: true,
  };
}

/** Naechste Farbe zyklisch nach Anzahl bereits vorhandener Agenten. */
export function nextSuperAgentColor(existingCount: number): string {
  return SUPER_AGENT_COLORS[existingCount % SUPER_AGENT_COLORS.length];
}

export interface SuperAgentLike {
  id: number;
  name: string;
  purpose: string;
  color: string;
  sessionId: string;
  status: SuperAgentStatus;
  isDefault: boolean;
  lastActiveAt: string;
  createdAt: string;
}

/** Sortierung fuer "Zuletzt verwendete Agenten": aktivste zuerst, archivierte ans Ende. */
export function sortSuperAgentsByActivity<T extends SuperAgentLike>(agents: T[]): T[] {
  return [...agents].sort((a, b) => {
    if (a.status === "archiviert" && b.status !== "archiviert") return 1;
    if (b.status === "archiviert" && a.status !== "archiviert") return -1;
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });
}

/** Generiert eine stabile, eindeutige sessionId fuer einen neuen Agenten. */
export function generateSuperAgentSessionId(randomSuffix: string): string {
  return sanitizeSessionId(`agent-${randomSuffix}`);
}

/**
 * Sprint-137-Fix: Entfernen-Route wirft jetzt auch dann sauber, wenn der
 * Agent dem anfragenden Nutzer gar nicht (mehr) gehoert — zuvor antwortete
 * die Route in dem Fall mit success:true, obwohl nichts geloescht wurde.
 */
export function assertSuperAgentRemovable<T extends { id: number; isDefault: boolean }>(
  agents: T[],
  id: number,
): void {
  const target = agents.find((agent) => agent.id === id);
  if (!target) {
    throw new Error("Superagent nicht gefunden.");
  }
  if (target.isDefault) {
    throw new Error("Der Standard-Agent kann nicht gelöscht werden — archiviere ihn stattdessen.");
  }
}
