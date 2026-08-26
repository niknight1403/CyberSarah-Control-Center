export type DevelopmentGuidanceAction = "settings" | "health" | "repository" | "reviewChanges" | "quality" | "agent";

export type DevelopmentGuidanceStep = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  action: DevelopmentGuidanceAction;
  tone: "accent" | "warning" | "ready";
};

export type DevelopmentGuidanceInput = {
  hasWorkspaceService: boolean;
  hasRepository: boolean;
  changedFileCount: number;
  hasConflictRisk: boolean;
  serviceHealthy: boolean;
  ciState: "idle" | "loading" | "ready" | "error";
  ciFailed: number;
  branch: string;
  lastGitAction: "idle" | "saving" | "committing" | "committed" | "pushing" | "pushed" | "error";
};

export function getDevelopmentGuidance(input: DevelopmentGuidanceInput): { primary: DevelopmentGuidanceStep; secondary: DevelopmentGuidanceStep[]; completion?: string } {
  const healthStep: DevelopmentGuidanceStep = { id: "health", eyebrow: "SICHERHEIT & VERBINDUNG", title: "Workspace-Service prüfen", description: "Prüfe die sichere Verbindung zum Workspace-Service, bevor du Repository-Aktionen ausführst.", actionLabel: "Verbindung prüfen", action: "health", tone: "accent" };
  const repositoryStep: DevelopmentGuidanceStep = { id: "repository", eyebrow: "PROJEKTKONTEXT", title: "Repository und Branch laden", description: "Lade Branches und Commits, damit alle nachfolgenden Schritte auf dem aktuellen Projektstand beruhen.", actionLabel: "Repository aktualisieren", action: "repository", tone: "accent" };
  const agentStep: DevelopmentGuidanceStep = { id: "agent", eyebrow: "WEITERENTWICKLUNG", title: "Nächste Verbesserung planen", description: "Beschreibe den gewünschten Fortschritt. Der Agent erzeugt einen überprüfbaren, niemals automatisch angewendeten Vorschlag.", actionLabel: "Agent öffnen", action: "agent", tone: "accent" };

  if (!input.hasWorkspaceService) {
    return { primary: { id: "settings", eyebrow: "ERSTER SCHRITT", title: "Workspace-Service verbinden", description: "Hinterlege die HTTPS-Adresse und den Zugriffstoken deines Workspace-Service. Erst danach stehen Git, Vorschau und der Entwicklungsagent sicher zur Verfügung.", actionLabel: "Verbindung einrichten", action: "settings", tone: "warning" }, secondary: [agentStep] };
  }
  if (!input.serviceHealthy) return { primary: healthStep, secondary: [repositoryStep, agentStep] };
  if (!input.hasRepository) return { primary: { ...repositoryStep, title: "Repository verbinden", description: "Verbinde ein GitHub-Repository, um Dateien, Branches, Qualitätsprüfungen und Pull Requests im Entwicklungsbereich zu steuern.", actionLabel: "Repository einrichten", action: "settings", tone: "warning" }, secondary: [healthStep, agentStep] };
  if (input.hasConflictRisk) return { primary: { id: "conflict", eyebrow: "VOR DEM COMMIT", title: "Möglichen Remote-Konflikt prüfen", description: `Der Branch ${input.branch} hat neue Remote-Commits, während lokale Entwürfe bestehen. Prüfe zuerst die Diff-Vorschau.`, actionLabel: "Änderungen prüfen", action: "reviewChanges", tone: "warning" }, secondary: [repositoryStep, agentStep] };
  if (input.changedFileCount > 0) return { primary: { id: "changes", eyebrow: "ENTWURF BEREIT", title: `${input.changedFileCount} Änderung(en) gezielt prüfen`, description: "Sieh die zeilenbasierte Synchronisierungsvorschau durch und erstelle erst danach bewusst einen Commit.", actionLabel: "Änderungen prüfen", action: "reviewChanges", tone: "accent" }, secondary: [repositoryStep, agentStep] };
  if (input.ciState === "error" || input.ciFailed > 0) return { primary: { id: "ci", eyebrow: "BUILD-QUALITÄT", title: "CI-Fehler priorisieren", description: "Lade die Qualitätsdetails und prüfe fehlgeschlagene Check-Runs, bevor du weitere Änderungen veröffentlichst.", actionLabel: "CI-Status aktualisieren", action: "quality", tone: "warning" }, secondary: [agentStep, repositoryStep] };
  return { primary: agentStep, secondary: [healthStep, repositoryStep], completion: input.lastGitAction === "pushed" ? "Branch wurde erfolgreich veröffentlicht" : undefined };
}
