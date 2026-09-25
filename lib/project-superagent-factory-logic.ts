/**
 * Sprint 364 — Projekt-Superagenten-Fabrik (rein, deterministisch).
 *
 * Fuer jedes neue Projekt/Produkt entsteht ein eigener, dedizierter
 * Superagent inklusive Bot-Villa (Kern-Team + Pool von bis zu 5000
 * Worker-Definitionen, siehe lib/bot-villa-logic.ts). Die Fabrik baut
 * nur den Blueprint — Persistenz und Ausfuehrung liegen im Server
 * (server/project-superagent-factory.ts) bzw. Orchestrator.
 *
 * Autonomie-Philosophie (ehrlich):
 *   Maximale Autonomie heisst: alles Reversible und Interne wird selbst-
 *   staendig erledigt; Zahlungen, externe Sends und Loeschungen bleiben
 *   HITL-pflichtig (Human-in-the-Loop). Maximale Geschwindigkeit entsteht
 *   durch Spawn-on-Demand statt Dauerbetrieb — nicht durch unbegrenzte
 *   Parallelitaet.
 */

import { SUPER_AGENT_COLORS, SUPER_AGENT_PURPOSE_MAX_LENGTH, SUPER_AGENT_NAME_MAX_LENGTH } from "./super-agents-logic";
import {
  buildVillaBlueprint,
  validateVillaBlueprint,
  type ProjectKind,
  type VillaBlueprint,
} from "./bot-villa-logic";

export const PROJECT_KINDS: ProjectKind[] = [
  "web-app",
  "mobile-app",
  "saas",
  "content",
  "automation",
  "forschung",
];

/** Grundrechte je Projektart (read-lastig, bewusst konservativ). */
const KIND_TOOLS: Record<ProjectKind, string[]> = {
  "web-app": ["fs.readWorkspaceFile", "fs.writeWorkspaceFile", "repo.searchCode"],
  "mobile-app": ["fs.readWorkspaceFile", "fs.writeWorkspaceFile", "repo.searchCode"],
  saas: ["fs.readWorkspaceFile", "fs.writeWorkspaceFile", "repo.searchCode", "db.query"],
  content: ["fs.readWorkspaceFile", "fs.writeWorkspaceFile", "influencer.planCampaign"],
  automation: ["fs.readWorkspaceFile", "fs.writeWorkspaceFile", "scheduler.createJob"],
  forschung: ["fs.readWorkspaceFile", "web.search"],
};

/** Autonomie-Profil: maximale Selbststaendigkeit mit harten HITL-Schienen. */
export type AutonomyProfile = {
  level: "maximal";
  selfService: string[];
  hitlRequired: string[];
};

export const MAXIMAL_AUTONOMY_PROFILE: AutonomyProfile = {
  level: "maximal",
  selfService: [
    "Interne Reads und Writes (Workspace, Repo-Suche, Entitaeten)",
    "Planung, Entwuerfe, Kampagnen-Slots, Villa-Spawns",
    "Code-Reviews und Vorschlaege ohne Seiteneffekte nach aussen",
  ],
  hitlRequired: [
    "Zahlungen und Budgetfreigaben",
    "Externe Sends (E-Mail, Social-Media-Publishing, Deploy)",
    "Loeschungen von Produktivdaten",
  ],
};

export type ProjectSuperagentBlueprint = {
  project: { name: string; kind: ProjectKind; goal: string };
  superagent: { name: string; purpose: string; color: string; status: "aktiv" };
  villa: VillaBlueprint;
  toolGrants: string[];
  autonomy: AutonomyProfile;
};

export function normalizeProjectName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) throw new Error("Der Projektname muss mindestens 2 Zeichen enthalten.");
  if (trimmed.length > SUPER_AGENT_NAME_MAX_LENGTH) {
    throw new Error(`Der Projektname darf hoechstens ${SUPER_AGENT_NAME_MAX_LENGTH} Zeichen enthalten.`);
  }
  return trimmed;
}

/** Deterministische Farbe aus dem Namen (zyklische Palette, kollisionsarm). */
function colorForName(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return SUPER_AGENT_COLORS[hash % SUPER_AGENT_COLORS.length];
}

/**
 * Erstellt den Blueprint fuer den dedizierten Projekt-Superagenten
 * inklusive Villa. Reine Funktion — gleicher Input, gleiches Ergebnis.
 */
export function createProjectSuperagentBlueprint(input: {
  name: string;
  kind: ProjectKind;
  goal: string;
  poolSize?: number;
}): ProjectSuperagentBlueprint {
  const name = normalizeProjectName(input.name);
  if (!PROJECT_KINDS.includes(input.kind)) {
    throw new Error(`Unbekannte Projektart: ${input.kind}`);
  }
  const goal = input.goal.trim();
  if (goal.length < 3) throw new Error("Das Projektziel muss mindestens 3 Zeichen enthalten.");
  if (goal.length > SUPER_AGENT_PURPOSE_MAX_LENGTH) {
    throw new Error(`Das Projektziel darf hoechstens ${SUPER_AGENT_PURPOSE_MAX_LENGTH} Zeichen enthalten.`);
  }

  const villa = buildVillaBlueprint(input.kind, { poolSize: input.poolSize });
  const villaErrors = validateVillaBlueprint(villa);
  if (villaErrors.length) throw new Error(`Villa-Blueprint ungueltig: ${villaErrors[0]}`);

  const purpose = `Dedizierter Projekt-Superagent fuer "${name}" (${input.kind}). Ziel: ${goal}. Fuehrt Projektarbeit mit Kern-Team (${villa.coreTeam.length} Live-Worker) und Spawn-on-Demand-Pool (Kapazitaet ${villa.poolCapacity}, max. ${villa.liveWorkerCap} gleichzeitig aktiv) autonom aus.`;
  if (purpose.length > SUPER_AGENT_PURPOSE_MAX_LENGTH * 2) {
    throw new Error("Projektbeschreibung zu lang.");
  }

  return {
    project: { name, kind: input.kind, goal },
    superagent: {
      name: `Projekt-Assistent ${name}`,
      purpose,
      color: colorForName(name),
      status: "aktiv" as const,
    },
    villa,
    toolGrants: KIND_TOOLS[input.kind],
    autonomy: MAXIMAL_AUTONOMY_PROFILE,
  };
}
