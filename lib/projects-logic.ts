/**
 * Projekte-Gedächtnis (rein, testbar) — Sprint 132.
 *
 * Validierung, Normalisierung und Seed-Daten für die persistente
 * Projekt-Übersicht ("Gedächtnis"-Tab + Dashboard-Kachel). Die eigentliche
 * DB-Anbindung liegt in server/db.ts — dieses Modul bleibt frei von
 * Seiteneffekten und ist ohne Datenbank testbar.
 */

export const PROJECT_STATUSES = ["idee", "in-arbeit", "pausiert", "live", "archiviert"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectInput = {
  name: string;
  description?: string;
  repositoryUrl?: string;
  status?: ProjectStatus;
};

export type NormalizedProjectInput = {
  name: string;
  description: string;
  repositoryUrl: string;
  status: ProjectStatus;
};

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

/** Deutsche Anzeige-Labels für die Status-Chips in der UI. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  idee: "Idee",
  "in-arbeit": "In Arbeit",
  pausiert: "Pausiert",
  live: "Live",
  archiviert: "Archiviert",
};

/** Validiert + normalisiert eine Projekt-Eingabe. Wirft bei fehlendem Namen. */
export function normalizeProjectInput(input: ProjectInput): NormalizedProjectInput {
  const name = (input.name ?? "").trim().slice(0, 160);
  if (name.length === 0) throw new Error("Projektname darf nicht leer sein.");
  const status = input.status && isProjectStatus(input.status) ? input.status : "in-arbeit";
  return {
    name,
    description: (input.description ?? "").trim().slice(0, 2000),
    repositoryUrl: (input.repositoryUrl ?? "").trim().slice(0, 300),
    status,
  };
}

export type ProjectPatch = Partial<ProjectInput>;
export type NormalizedProjectPatch = Partial<NormalizedProjectInput>;

/** Wie normalizeProjectInput, aber fuer Teil-Updates: nur uebergebene Felder
 * werden normalisiert, ein leerer Name in einem Patch wird abgelehnt (leeres
 * Objekt heisst hingegen "nichts aendern"). */
export function normalizeProjectPatch(patch: ProjectPatch): NormalizedProjectPatch {
  const result: NormalizedProjectPatch = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 160);
    if (name.length === 0) throw new Error("Projektname darf nicht leer sein.");
    result.name = name;
  }
  if (patch.description !== undefined) result.description = patch.description.trim().slice(0, 2000);
  if (patch.repositoryUrl !== undefined) result.repositoryUrl = patch.repositoryUrl.trim().slice(0, 300);
  if (patch.status !== undefined) {
    if (!isProjectStatus(patch.status)) throw new Error("Ungültiger Projekt-Status.");
    result.status = patch.status;
  }
  return result;
}

/**
 * Standard-Projekte, mit denen die Liste beim allerersten Aufruf eines
 * Nutzers befüllt wird (nur wenn noch kein Projekt existiert) — die
 * Vorhaben, die bereits aktiv im Chat/Workspace bearbeitet wurden, sollen
 * nicht erneut manuell angelegt werden müssen.
 */
export function defaultSeedProjects(): NormalizedProjectInput[] {
  return [
    {
      name: "CyberSarah Control Center",
      description: "Expo/React-Native-App mit FastAPI-Backend, Cyber-Neon-UI und autonomem GitHub-Workflow.",
      repositoryUrl: "https://github.com/niknight1403/CyberSarah-Control-Center",
      status: "in-arbeit",
    },
    {
      name: "CyberSarah Revenue OS",
      description: "Revenue- & Trading-Orchestrator (Stripe, Binance) hinter dem Daten-Hub der App.",
      repositoryUrl: "https://github.com/niknight1403/cybersarah-revenue-os",
      status: "in-arbeit",
    },
  ];
}

/** Sortiert nach letzter Aktivität, neueste zuerst — stabil für Gleichstand per Name. */
export function sortProjectsByActivity<T extends { lastActivityAt: string | Date; name: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const delta = new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    return delta !== 0 ? delta : a.name.localeCompare(b.name);
  });
}
