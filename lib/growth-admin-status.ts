import type { GrowthQualityReport } from "./growth-data-quality";
import type { GrowthRunState } from "./growth-runtime-state";
export function growthAdminStatus(
  quality: GrowthQualityReport,
  runtime: GrowthRunState & { stale: boolean; elapsedMinutes: number | null },
  enabled: boolean,
) {
  if (!enabled) return { label: "Pausiert", severity: "muted" as const,
    detail: "Growth Pulse ist abgeschaltet. Keine neuen Growth-Entwuerfe." };
  if (quality.status === "blocked") return { label: "Messfehler", severity: "error" as const,
    detail: quality.errors[0] ?? "Eingabedaten bitte pruefen." };
  if (runtime.consecutiveFailures > 0) return { label: "Lauffehler", severity: "error" as const,
    detail: runtime.lastReason ?? "Letzten Growth-Lauf pruefen." };
  if (!runtime.completedAt) return { label: "Noch kein Lauf", severity: "warning" as const,
    detail: "Automatische Ausfuehrung bisher nicht nachgewiesen." };
  if (runtime.stale) return { label: "Signal veraltet", severity: "warning" as const,
    detail: "Letzten Cron-/Serverlauf pruefen, keine 24/7-Verfuegbarkeit unterstellen." };
  if (quality.status === "review") return { label: "Daten pruefen", severity: "warning" as const,
    detail: quality.warnings[0] ?? "Kanalmetriken sind nicht vergleichbar." };
  return { label: "Analyse aktiv", severity: "ok" as const,
    detail: "Letzter Growth-Lauf abgeschlossen; Aussagen zu Umsatzgewinnen erfordern separate Belege." };
}
