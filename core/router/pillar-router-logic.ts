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

/**
 * Sprint 351b — Abteilungs-Integration: Alle Agenten-Abteilungen der
 * Agenten-Villa in EINER Registry zusammengefuehrt (fachliche Saeulen +
 * operative Abteilungen). Ehrlich typisiert: Logic-Module laufen im
 * Serverprozess, die Python-Pipeline und die Embedded-App sind eigene
 * Runtimes mit klar benannter Integrationsschnittstelle.
 */
export type DepartmentId = "saas-factory" | "content-engine" | "outreach-agent" | "ai-health-influencer" | "revenue-os";

export type DepartmentKind = "logic-module" | "python-pipeline" | "embedded-app";

export type DepartmentDefinition = {
  id: DepartmentId;
  title: string;
  mission: string;
  modulePath: string;
  kind: DepartmentKind;
  pillar: PillarId | null;
  integration: string;
};

export const DEPARTMENTS: readonly DepartmentDefinition[] = [
  { id: "saas-factory", title: "Micro-SaaS-Fabrik", mission: "Autonome Erstellung von Micro-Web-Tools bei 0 Euro Budget.", modulePath: "modules/saas-factory", kind: "logic-module", pillar: "saas-factory", integration: "pillarsRouter (tRPC) + Draft-Engine-Freigabe" },
  { id: "content-engine", title: "Content-Netzwerk", mission: "Programmatische SEO- und Content-Generierung mit Ein-Klick-Freigabe.", modulePath: "modules/content-engine", kind: "logic-module", pillar: "content-engine", integration: "pillarsRouter (tRPC) + Draft-Engine-Freigabe" },
  { id: "outreach-agent", title: "Lead-Outreach-Pipeline", mission: "Lead-Scoring und Outreach-Sequenzen — Versand nur nach Regisseur-Freigabe.", modulePath: "modules/outreach-agent", kind: "logic-module", pillar: "outreach-agent", integration: "pillarsRouter (tRPC) + Draft-Engine-Freigabe" },
  { id: "ai-health-influencer", title: "KI-Health-Influencer-Pipeline", mission: "Autonome Video-/Skript-Pipeline (Python) fuer den Health-Kanal.", modulePath: "modules/ai_health_influencer", kind: "python-pipeline", pillar: "content-engine", integration: "Python-Runtime; Ausgaben laufen als Drafts in die Freigabe-Queue" },
  { id: "revenue-os", title: "Revenue OS (Embedded)", mission: "Umsatz-Betriebssystem als eingebettete App (Umsatz-Snapshots, HARA-Paket).", modulePath: "modules/revenue-os", kind: "embedded-app", pillar: "content-engine", integration: "Eigenes Bundle im Repo; Server-Snapshots via server/revenue-os.ts" },
] as const;

export function getDepartment(id: DepartmentId): DepartmentDefinition {
  const department = DEPARTMENTS.find((entry) => entry.id === id);
  if (!department) throw new Error(`Unbekannte Abteilung: ${id}`);
  return department;
}

export function listDepartmentsForPillar(id: PillarId): DepartmentDefinition[] {
  return DEPARTMENTS.filter((department) => department.pillar === id);
}

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
  // Sprint 351b — Abteilungs-Integration pruefen:
  // Jede Abteilung braucht Modulpfad, Missions- und Integrationsbeschreibung;
  // jede fachliche Saeule braucht mindestens eine zugeordnete Abteilung;
  // jede Abteilungs-Saeulen-Referenz muss existieren.
  for (const department of DEPARTMENTS) {
    if (!department.modulePath.trim()) problems.push(`Abteilung ${department.id} ohne Modulpfad.`);
    if (!department.mission.trim()) problems.push(`Abteilung ${department.id} ohne Mission.`);
    if (!department.integration.trim()) problems.push(`Abteilung ${department.id} ohne Integrationsbeschreibung.`);
    if (department.pillar && !registered.includes(department.pillar)) {
      problems.push(`Abteilung ${department.id} verweist auf unbekannte Saeule ${department.pillar}.`);
    }
  }
  for (const pillar of PILLARS) {
    if (listDepartmentsForPillar(pillar.id).length === 0) {
      problems.push(`Saeule ${pillar.id} hat keine zugeordnete Abteilung.`);
    }
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
