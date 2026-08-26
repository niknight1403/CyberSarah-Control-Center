export type ReleaseStatus = "started" | "passed" | "failed" | "cancelled";

const statusCopy: Record<ReleaseStatus, { title: string; bodyPrefix: string }> = {
  started: { title: "Release gestartet", bodyPrefix: "Der Release-Workflow läuft." },
  passed: { title: "Release bereit", bodyPrefix: "Build und Prüfungen wurden erfolgreich abgeschlossen." },
  failed: { title: "Release fehlgeschlagen", bodyPrefix: "Mindestens eine Release-Prüfung benötigt Aufmerksamkeit." },
  cancelled: { title: "Release abgebrochen", bodyPrefix: "Der Release-Workflow wurde beendet." },
};

export function createReleaseNotification(status: ReleaseStatus, detail?: string) {
  const copy = statusCopy[status];
  const suffix = detail?.trim() ? ` ${detail.trim().slice(0, 180)}` : "";
  return { title: `CyberSarah: ${copy.title}`, body: `${copy.bodyPrefix}${suffix}`, data: { kind: "release", status } };
}

export function isTerminalReleaseStatus(status: ReleaseStatus) {
  return status === "passed" || status === "failed" || status === "cancelled";
}
