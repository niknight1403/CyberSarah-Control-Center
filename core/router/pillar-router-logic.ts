/**
 * Sprint 351 — Kern-Router: Agenten-Rotator & Tool-Integrator.
 * Fuehrt die drei Geschaefstsaeulen (SaaS-Fabrik, Content-Engine,
 * Outreach-Agent) mit dem bestehenden API-Rotator (Sprint 196) und der
 * Ollama-Fleet (Sprint 349) zusammen. Reine, deterministische Logik:
 * Task-Tier -> Modell (Qwen-Leiter) und Primaerroute (Ollama vs.
 * Cloud-Gratis-Kette) — inklusive ehrlicher Selbstpruefung (Green Rule).
 */
import { pickQwenForTask, recommendPrimaryRoute, type FleetHealth, type QwenLadderModel, type QwenTaskTier } from "../../modules/../lib/ollama-fleet-logic";

export type PillarId = "saas-factory" | "content-engine" | "outreach-agent";

export type PillarDefinition = {
  id: PillarId;
  title: string;
  mission: string;
  module: string;
  defaultTier: QwenTaskTier;
};

export const PILLARS: readonly PillarDefinition[] = [
  { id: "saas-factory", title: "Micro-SaaS-Fabrik", mission: "Autonome Erstellung von Micro-Web-Tools bei 0 Euro Budget.", module: "modules/saas-factory", defaultTier: "reasoning" },
  { id: "content-engine", title: "Content-Netzwerk", mission: "Programmatische SEO- und Content-Generierung mit Ein-Klick-Freigabe.", module: "modules/content-engine", defaultTier: "chat" },
  { id: "outreach-agent", title: "Lead-Outreach-Pipeline", mission: "Lead-Scoring und Outreach-Sequenzen — Versand nur nach Regisseur-Freigabe.", module: "modules/outreach-agent", defaultTier: "chat" },
] as const;

export function getPillar(id: PillarId): PillarDefinition {
  const pillar = PILLARS.find((entry) => entry.id === id);
  if (!pillar) throw new Error(`Unbekannte Saeule: ${id}`);
  return pillar;
}

/** Rotator-Entscheidung fuer eine Saeulen-Aufgabe (LLM-Route + Modell). */
export type PillarRouteDecision = {
  pillar: PillarDefinition;
  model: QwenLadderModel | null;
  primaryRoute: "ollama" | "cloud";
  rationale: string;
};

export function routePillarTask(
  id: PillarId,
  fleet: FleetHealth,
  primaryLatencyMs: number,
  availableModels: readonly QwenLadderModel[] = [],
  tierOverride?: QwenTaskTier,
): PillarRouteDecision {
  const pillar = getPillar(id);
  const tier = tierOverride ?? pillar.defaultTier;
  const model = pickQwenForTask(tier, availableModels);
  const primaryRoute = recommendPrimaryRoute(fleet, primaryLatencyMs);
  const rationale =
    primaryRoute === "ollama"
      ? `Fleet ${fleet.status}: Aufgabe auf Ollama-Modell ${model ?? "(kein Modell verfuegbar)"} (Tier ${tier}).`
      : `Fleet ${fleet.status}/Latenz ${primaryLatencyMs} ms: Rotator weicht auf die Cloud-Gratis-Kette aus (Tier ${tier}).`;
  return { pillar, model, primaryRoute, rationale };
}

/** Green-Rule-Selbstpruefung: Registry vollstaendig, keine Schatten-Saeulen. */
export type PillarSelfTest = {
  ok: boolean;
  problems: string[];
};

export function selfTestPillarRegistry(requiredIds: readonly string[] = ["saas-factory", "content-engine", "outreach-agent"]): PillarSelfTest {
  const problems: string[] = [];
  const registered: string[] = PILLARS.map((pillar) => pillar.id);
  for (const required of requiredIds) {
    if (!registered.includes(required)) problems.push(`Saeule fehlt in der Registry: ${required}`);
  }
  for (const pillar of PILLARS) {
    if (!pillar.mission.trim()) problems.push(`Saeule ${pillar.id} ohne Mission.`);
    if (!requiredIds.includes(pillar.id)) problems.push(`Schatten-Saeule ohne Pflicht-Registrierung: ${pillar.id}`);
  }
  return { ok: problems.length === 0, problems };
}

/** Statusaggregation aller Saeulen (gruen = jede Saeule gruen). */
export function aggregatePillarStatus(states: readonly { id: PillarId; status: "green" | "yellow" | "red" }[]): "green" | "yellow" | "red" {
  if (states.length === 0) return "red";
  if (states.every((state) => state.status === "green")) return "green";
  if (states.some((state) => state.status === "red")) return "red";
  return "yellow";
}
