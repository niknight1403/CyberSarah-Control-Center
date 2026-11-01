/**
 * Sprint 364 — Bot-Villa: geteilte Spezialisten-Struktur fuer Projekt-
 * Superagenten (rein, deterministisch, seiteneffektfrei).
 *
 * Konzept (ehrlich statt marketing):
 *   Eine Villa je Projekt = ein Kern-Team aus CORE_TEAM_SIZE gleichzeitig
 *   aktiven Live-Workern + ein definierter Pool von bis zu
 *   MAX_VILLA_WORKERS (5000) fachspezifischen Worker-DEFINITIONEN, die
 *   nach Bedarf gespawnt werden. Es laufen nie 5000 LLMs gleichzeitig —
 *   gleichzeitige Aktivitaet ist auf LIVE_WORKER_CAP begrenzt (Kosten-
 *   und Stabilitaetsdeckel). 5000 ist die Kapazitaetsgrenze des Pools,
 *   nicht eine Zusicherung paralleler Ausfuehrung.
 *
 * Datenfluss:
 *   Projektart -> Gewichtung der Spezialitaeten -> Kern-Team + Pool-
 *   Verteilung. planWorkerSpawn waehlt fuer eine Aufgabe die passenden
 *   Pool-Worker aus; validiert bleiben alle Invarianten von
 *   validateVillaBlueprint.
 */

export const MAX_VILLA_WORKERS = 5000;
export const CORE_TEAM_SIZE = 8;
export const LIVE_WORKER_CAP = 24;
export const MAX_SPAWN_BATCH = 8;

export type WorkerTier = "kern" | "pool";

export type Specialty = {
  id: string;
  label: string;
  tasks: string[];
};

/** Fachkatalog der Villa: 14 Spezialitaeten, deterministische Reihenfolge. */
export const SPECIALTY_CATALOG: Specialty[] = [
  { id: "architektur", label: "Systemarchitektur", tasks: ["struktur", "planung", "review"] },
  { id: "frontend", label: "Frontend & UI", tasks: ["ui", "ux", "komponente", "style"] },
  { id: "backend", label: "Backend & API", tasks: ["api", "server", "endpoint", "service"] },
  { id: "qa", label: "Qualitaet & Tests", tasks: ["test", "abdeckung", "regression"] },
  { id: "security", label: "Sicherheit", tasks: ["audit", "guard", "token", "leak"] },
  { id: "performance", label: "Performance", tasks: ["latenz", "caching", "budget", "speed"] },
  { id: "devops", label: "DevOps & Deployment", tasks: ["ci", "deploy", "pipeline", "migration"] },
  { id: "data", label: "Daten & Analytics", tasks: ["schema", "migration", "report", "sql"] },
  { id: "content", label: "Content & Texte", tasks: ["copy", "doku", "changelog", "post"] },
  { id: "growth", label: "Growth & Marketing", tasks: ["kampagne", "reichweite", "funnel", "cta"] },
  { id: "design", label: "Design & Brand", tasks: ["farbe", "layout", "brand", "icon"] },
  { id: "research", label: "Recherche & Trends", tasks: ["recherche", "benchmark", "trend"] },
  { id: "support", label: "Support & Onboarding", tasks: ["faq", "onboarding", "hilfe"] },
  { id: "automation", label: "Automatisierung", tasks: ["workflow", "cron", "trigger", "scheduler"] },
];

export type ProjectKind = "web-app" | "mobile-app" | "saas" | "content" | "automation" | "forschung";

/** Prioritaet der Spezialitaeten je Projektart (Kern-Team-Reihenfolge). */
const KIND_PRIORITIES: Record<ProjectKind, string[]> = {
  "web-app": ["frontend", "backend", "architektur", "qa", "design", "performance", "security", "devops"],
  "mobile-app": ["frontend", "design", "performance", "backend", "qa", "security", "automation", "support"],
  saas: ["architektur", "backend", "growth", "data", "qa", "security", "devops", "content"],
  content: ["content", "growth", "design", "research", "frontend", "support", "automation", "data"],
  automation: ["automation", "architektur", "backend", "devops", "qa", "security", "data", "support"],
  forschung: ["research", "architektur", "data", "content", "qa", "security", "automation", "performance"],
};

export type VillaWorker = {
  id: string;
  specialty: string;
  tier: WorkerTier;
  taskFocus: string[];
};

export type VillaBlueprint = {
  projectKind: ProjectKind;
  coreTeam: VillaWorker[];
  pool: VillaWorker[];
  poolCapacity: number;
  liveWorkerCap: number;
};

function workerId(specialty: string, index: number, tier: WorkerTier): string {
  return `${tier}-${specialty}-${String(index).padStart(4, "0")}`;
}

/**
 * Baut die Villa fuer eine Projektart: Kern-Team (CORE_TEAM_SIZE, live)
 * und ein Pool von Worker-Definitionen bis maximal MAX_VILLA_WORKERS.
 * Die Pool-Verteilung ist proportional zur Kern-Prioritaet und bleibt
 * unter der Kapazitaet — Rest-Kapazitaet wird als "unbeschaeftigt"
 * nicht vorgetaeuscht, sondern gar nicht erst vergeben.
 */
export function buildVillaBlueprint(
  projectKind: ProjectKind,
  options: { poolSize?: number } = {}
): VillaBlueprint {
  const priorities = KIND_PRIORITIES[projectKind];
  const coreTeam: VillaWorker[] = priorities.slice(0, CORE_TEAM_SIZE).map((specialty, index) => ({
    id: workerId(specialty, index, "kern"),
    specialty,
    tier: "kern" as WorkerTier,
    taskFocus: SPECIALTY_CATALOG.find((entry) => entry.id === specialty)?.tasks ?? [],
  }));

  const requestedPool = Math.min(Math.max(options.poolSize ?? MAX_VILLA_WORKERS, 0), MAX_VILLA_WORKERS - CORE_TEAM_SIZE);
  const pool: VillaWorker[] = [];
  const weights = priorities.map((specialty, rank) => CORE_TEAM_SIZE - rank);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const specialties = priorities.slice(0, CORE_TEAM_SIZE);
  const perSpecialty = specialties.map((specialty, index) => ({
    specialty,
    count: Math.floor((requestedPool * weights[index]) / weightSum),
  }));
  for (const entry of perSpecialty) {
    for (let index = 0; index < entry.count; index += 1) {
      pool.push({
        id: workerId(entry.specialty, index, "pool"),
        specialty: entry.specialty,
        tier: "pool",
        taskFocus: SPECIALTY_CATALOG.find((catalog) => catalog.id === entry.specialty)?.tasks ?? [],
      });
    }
  }

  return {
    projectKind,
    coreTeam,
    pool,
    poolCapacity: MAX_VILLA_WORKERS,
    liveWorkerCap: LIVE_WORKER_CAP,
  };
}

/** Invarianten einer Villa (fuer Tests und Laufzeit-Selbstpruefung). */
export function validateVillaBlueprint(blueprint: VillaBlueprint): string[] {
  const errors: string[] = [];
  if (blueprint.coreTeam.length !== CORE_TEAM_SIZE) {
    errors.push(`Kern-Team muss genau ${CORE_TEAM_SIZE} Worker umfassen.`);
  }
  if (blueprint.coreTeam.some((worker) => worker.tier !== "kern")) {
    errors.push("Kern-Team darf nur Tier 'kern' enthalten.");
  }
  if (blueprint.pool.some((worker) => worker.tier !== "pool")) {
    errors.push("Pool darf nur Tier 'pool' enthalten.");
  }
  if (blueprint.coreTeam.length + blueprint.pool.length > MAX_VILLA_WORKERS) {
    errors.push(`Villa ueberschreitet die Kapazitaet von ${MAX_VILLA_WORKERS} Workern.`);
  }
  const ids = new Set([...blueprint.coreTeam, ...blueprint.pool].map((worker) => worker.id));
  if (ids.size !== blueprint.coreTeam.length + blueprint.pool.length) {
    errors.push("Worker-IDs sind nicht eindeutig.");
  }
  const validSpecialties = new Set(SPECIALTY_CATALOG.map((entry) => entry.id));
  for (const worker of [...blueprint.coreTeam, ...blueprint.pool]) {
    if (!validSpecialties.has(worker.specialty)) {
      errors.push(`Unbekannte Spezialitaet: ${worker.specialty}`);
    }
  }
  return errors;
}

export type SpawnPlan = {
  task: string;
  workers: VillaWorker[];
  liveWorkerCap: number;
  note: string;
};

/**
 * Spawn-on-Demand: waehlt fuer eine Aufgabe passende Pool-Worker aus,
 * maximal MAX_SPAWN_BATCH gleichzeitig — gedeckelt durch LIVE_WORKER_CAP.
 * Keine passenden Worker -> ehrliche Rueckgabe mit leerer Liste.
 */
export function planWorkerSpawn(blueprint: VillaBlueprint, task: string, count = MAX_SPAWN_BATCH): SpawnPlan {
  const normalized = task.toLowerCase().trim();
  const limit = Math.min(Math.max(count, 1), MAX_SPAWN_BATCH, LIVE_WORKER_CAP);
  const matching = blueprint.pool.filter(
    (worker) =>
      normalized.includes(worker.specialty) ||
      worker.taskFocus.some((focus) => normalized.includes(focus.split(" ")[0]))
  );
  const workers = matching.slice(0, limit);
  return {
    task: normalized,
    workers,
    liveWorkerCap: blueprint.liveWorkerCap,
    note: workers.length
      ? `${workers.length} Pool-Worker fuer "${normalized}" — Spawn-on-Demand, max. ${blueprint.liveWorkerCap} gleichzeitig aktiv.`
      : `Kein Pool-Worker passt zu "${normalized}" — Kern-Team pruefen statt auf Treffer zu hoffen.`,
  };
}
