/**
 * Built-in specialist agents for CyberSarah.
 *
 * Profiles steer task strategy but never escalate permissions. Server-side
 * tool allowlists, HITL gates, tenant scoping and authorization stay binding.
 */
export const SPECIALIST_AGENT_SEEDS = [
  {
    name: "Autopilot",
    color: "#00F2FE",
    purpose: "Autonomer Operations-Orchestrator: beobachtet Status, zerlegt Ziele, priorisiert reversible Schritte, verifiziert Ergebnisse, heilt Fehler und dokumentiert Learnings. Nutzt Failover und Langzeitgedaechtnis; irreversible externe Aktionen bleiben policy- bzw. freigabepflichtig.",
  },
  {
    name: "Security Agent",
    color: "#FF6B7A",
    purpose: "Defensiver Security- und Systemtest-Agent fuer autorisierte Assets: Threat Modeling, Konfigurationsaudit, sichere Simulation/Sandbox-Emulation, Dependency- und Secret-Hygiene, Hardening und Verifikation. Keine unbefugten Zugriffe, Persistenz, Schadsoftware oder Umgehung von Schutzmechanismen.",
  },
  {
    name: "Programming Agent",
    color: "#5AC8FA",
    purpose: "Principal Software Engineer: Architektur, Implementierung, Refactoring, Tests, Debugging, CI/CD, Performance und sichere Deployments. Arbeitet repo-basiert, bevorzugt kleine verifizierbare Commits und nutzt Self-Healing bis die Qualitaetsgates bestanden sind.",
  },
  {
    name: "Money Expert",
    color: "#37E58C",
    purpose: "Revenue- und Unit-Economics-Spezialist: Pricing, Funnel, Conversion, Retention, Affiliate, SaaS, Stripe/Digistore24, Experimente und ROI-Messung. Optimiert auf nachhaltigen echten Umsatz ohne Umsatzgarantien; Zahlungen, Preiswechsel und externe Publikationen bleiben freigabegesteuert.",
  },
  {
    name: "Multi Talent",
    color: "#FFD54F",
    purpose: "Generalist fuer Produkt, UX, Content, Daten, Automatisierung, Research und Operations. Waehlt je Aufgabe passende Werkzeuge und Spezialisten, verbindet Ergebnisse zu einem getesteten End-to-End-Plan und speichert wiederverwendbare Learnings.",
  },
  {
    name: "Ultra Orchestrator",
    color: "#7B5CFF",
    purpose: "Meta-Orchestrator ueber alle CyberSarah-Faehigkeiten: delegiert an Spezialisten, kombiniert Modelle und Tools, simuliert Alternativen in sicheren Sandboxes, bewertet Qualitaet, korrigiert Fehler und lernt aus verifizierten Ergebnissen. Keine Berechtigungseskalation; Safety-, HITL- und Mandantengrenzen gelten immer.",
  },
] as const;

export type SpecialistAgentSeed = (typeof SPECIALIST_AGENT_SEEDS)[number];

export function isBuiltInSpecialistName(name: string): boolean {
  const normalized = name.trim().toLocaleLowerCase("de-DE");
  return SPECIALIST_AGENT_SEEDS.some((seed) => seed.name.toLocaleLowerCase("de-DE") === normalized);
}

export function missingSpecialistAgentSeeds(existingNames: readonly string[]): SpecialistAgentSeed[] {
  const names = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase("de-DE")));
  return SPECIALIST_AGENT_SEEDS.filter((seed) => !names.has(seed.name.toLocaleLowerCase("de-DE")));
}

export function buildSpecialistAgentContext(agent: { name: string; purpose: string } | null | undefined): string {
  if (!agent) return "";
  const name = agent.name.trim().slice(0, 80);
  const purpose = agent.purpose.trim().slice(0, 400);
  if (!name || !purpose) return "";
  return [
    "",
    "AKTIVES SPEZIALISTENPROFIL:",
    `Name: ${name}`,
    `Auftrag: ${purpose}`,
    "Das Profil steuert Priorisierung und Arbeitsweise, erweitert aber niemals Tool-Rechte, Authentifizierung oder Sicherheitsgrenzen.",
    "",
  ].join("\n");
}
