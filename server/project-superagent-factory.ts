/**
 * Sprint 364 — Server-Service: Projekt-Superagenten-Fabrik.
 *
 * Verdrahtet die reine Blueprint-Logik (lib/project-superagent-factory-
 * logic.ts) mit der Superagenten-Tabelle. Aufgerufen wird dieser Service
 * NUR aus geschuetzten tRPC-Prozeduren (ctx.user.openId) — der
 * Orchestrator bekommt ausschliesslich read-only Plan-Tools, damit keine
 * Tool-Argumente Nutzeridentitaeten vortaeuschen koennen.
 */

import { randomUUID } from "crypto";

import {
  generateSuperAgentSessionId,
  normalizeSuperAgentInput,
  type SuperAgentInput,
} from "../lib/super-agents-logic";
import {
  createProjectSuperagentBlueprint,
  type ProjectSuperagentBlueprint,
} from "../lib/project-superagent-factory-logic";
import { insertSuperAgentRecord, listSuperAgentsForUser } from "./db";

export type ProjectSuperagentCreation = {
  superagent: { id: number; name: string; purpose: string; color: string; sessionId: string };
  blueprint: ProjectSuperagentBlueprint;
};

/**
 * Erstellt den dedizierten Projekt-Superagenten inklusive Bot-Villa und
 * persistiert ihn fuer den Nutzer. Wirft bei ungueltigen Eingaben —
 * Aufrufer (tRPC) reicht die Fehlermeldung strukturiert weiter.
 */
export async function createProjectSuperagent(
  userOpenId: string,
  input: { name: string; kind: ProjectSuperagentBlueprint["project"]["kind"]; goal: string; poolSize?: number }
): Promise<ProjectSuperagentCreation> {
  if (!userOpenId) throw new Error("Nutzerkontext fehlt — Projektsuperagent nicht erstellbar.");

  const blueprint = createProjectSuperagentBlueprint(input);
  const normalized = normalizeSuperAgentInput(blueprint.superagent as SuperAgentInput, blueprint.superagent.color);
  const existing = await listSuperAgentsForUser(userOpenId);
  const duplicate = existing.find((row) => row.name === normalized.name);
  if (duplicate) {
    throw new Error(`Es existiert bereits ein Projekt-Superagent namens "${normalized.name}" — bitte anderen Projektnamen waehlen.`);
  }

  const saved = await insertSuperAgentRecord({
    ...normalized,
    sessionId: generateSuperAgentSessionId(randomUUID()),
    userOpenId,
    isDefault: false,
  });

  return {
    superagent: {
      id: saved.id,
      name: saved.name,
      purpose: saved.purpose,
      color: saved.color,
      sessionId: saved.sessionId,
    },
    blueprint,
  };
}
