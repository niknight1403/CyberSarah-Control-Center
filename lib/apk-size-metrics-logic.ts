/**
 * Sprint 348 — APK-Groessen- und Startzeit-Metriken:
 * Bewertet APK-Groesse gegen ein Budget, identifiziert grosse Assets
 * und empfiehlt Optimierungen. Erweitert startup-metrics-logic um
 * Groessen-Analyse.
 *
 * Ehrlichkeits-Grenze:
 *   Die Logik kann nur bewerten, was ihr uebergeben wird. Wenn Asset-Groessen
 *   nicht gemessen wurden, werden sie als "unbekannt" markiert und nicht
 *   auf 0 gesetzt. Empfehlungen sind heuristisch, keine Garantie.
 */

export type AssetBreakdown = {
  name: string;
  sizeBytes: number;
  category: "js-bundle" | "native-lib" | "image" | "font" | "other";
};

export type ApkSizeReport = {
  totalBytes: number;
  totalMB: number;
  budgetMB: number;
  withinBudget: boolean;
  breakdown: AssetBreakdown[];
  topOffenders: AssetBreakdown[];
  recommendations: string[];
  classification: "small" | "ok" | "large" | "unknown";
};

export type ApkSizeInput = {
  assets: AssetBreakdown[];
  budgetMB?: number;
};

const DEFAULT_BUDGET_MB = 25;
const LARGE_ASSET_THRESHOLD = 1_000_000; // 1 MB

export function analyzeApkSize(input: ApkSizeInput): ApkSizeReport {
  const budgetMB = input.budgetMB ?? DEFAULT_BUDGET_MB;
  const validAssets = input.assets.filter((a) => a.sizeBytes > 0);
  const totalBytes = validAssets.reduce((sum, a) => sum + a.sizeBytes, 0);
  const totalMB = totalBytes / (1024 * 1024);
  const withinBudget = totalMB <= budgetMB;

  const topOffenders = [...validAssets]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 5);

  const recommendations: string[] = [];

  if (validAssets.length === 0) {
    return {
      totalBytes: 0,
      totalMB: 0,
      budgetMB,
      withinBudget: false,
      breakdown: [],
      topOffenders: [],
      recommendations: ["Keine Asset-Groessen uebergeben. Messung erforderlich."],
      classification: "unknown",
    };
  }

  // Empfehlungen basierend auf grossen Assets
  const largeAssets = validAssets.filter((a) => a.sizeBytes >= LARGE_ASSET_THRESHOLD);
  if (largeAssets.length > 0) {
    recommendations.push(
      `${largeAssets.length} Asset(s) ueber 1 MB. Komprimierung oder Lazy-Loading pruefen.`,
    );
  }

  const images = validAssets.filter((a) => a.category === "image");
  const largeImages = images.filter((a) => a.sizeBytes >= 500_000);
  if (largeImages.length > 0) {
    recommendations.push(
      `${largeImages.length} grosse(s) Bild(er). WebP/AVIF-Konvertierung oder Vektor-Icons verwenden.`,
    );
  }

  const jsBundles = validAssets.filter((a) => a.category === "js-bundle");
  const totalJs = jsBundles.reduce((s, a) => s + a.sizeBytes, 0);
  if (totalJs > 5_000_000) {
    recommendations.push("JS-Bundle ueber 5 MB. Tree-Shaking und Code-Splitting intensivieren.");
  }

  const fonts = validAssets.filter((a) => a.category === "font");
  if (fonts.length > 4) {
    recommendations.push(`${fonts.length} Schriftarten. Nur benoetigte Gewichte einbinden.`);
  }

  if (!withinBudget) {
    recommendations.push(
      `APK uebersteigt Budget (${totalMB.toFixed(1)} MB / ${budgetMB} MB). Assets reduzieren.`,
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("APK-Groesse innerhalb des Budgets. Keine akuten Massnahmen noetig.");
  }

  let classification: ApkSizeReport["classification"] = "ok";
  if (totalMB === 0) classification = "unknown";
  else if (totalMB <= budgetMB * 0.5) classification = "small";
  else if (totalMB > budgetMB) classification = "large";

  return {
    totalBytes,
    totalMB,
    budgetMB,
    withinBudget,
    breakdown: validAssets,
    topOffenders,
    recommendations,
    classification,
  };
}

/**
 * Startzeit-Optimierungs-Empfehlungen basierend auf Phasen-Metriken.
 * Nutzt die StartupPhase-Struktur aus startup-metrics-logic.
 */
export type PhaseMetric = {
  name: string;
  durationMs: number;
};

export type StartupOptimization = {
  phase: string;
  recommendation: string;
  estimatedSavingMs: number;
};

export function recommendStartupOptimizations(phases: PhaseMetric[]): StartupOptimization[] {
  const optimizations: StartupOptimization[] = [];

  for (const phase of phases) {
    if (phase.durationMs <= 0) continue;

    if (phase.name.includes("bundle") && phase.durationMs > 1000) {
      optimizations.push({
        phase: phase.name,
        recommendation: "Bundle-Vorabruf (preload) oder Code-Splitting fuer kritischen Pfad.",
        estimatedSavingMs: Math.round(phase.durationMs * 0.3),
      });
    }

    if (phase.name.includes("trpc") && phase.durationMs > 500) {
      optimizations.push({
        phase: phase.name,
        recommendation: "tRPC-Handshake parallelisieren oder Verbindung wiederverwenden.",
        estimatedSavingMs: Math.round(phase.durationMs * 0.4),
      });
    }

    if (phase.name.includes("render") && phase.durationMs > 800) {
      optimizations.push({
        phase: phase.name,
        recommendation: "Erst-Render reduzieren: weniger Komponenten im initialen Render-Pfad.",
        estimatedSavingMs: Math.round(phase.durationMs * 0.25),
      });
    }
  }

  return optimizations;
}

/**
 * Gesamte Einsparungs-Schaetzung aller Optimierungen.
 */
export function totalEstimatedSavingMs(optimizations: StartupOptimization[]): number {
  return optimizations.reduce((sum, o) => sum + o.estimatedSavingMs, 0);
}
