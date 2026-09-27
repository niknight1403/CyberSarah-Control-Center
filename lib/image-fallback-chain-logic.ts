/**
 * Sprint 308 — Bild-Generierung: reine, deterministische Logik fuer die
 * Fallback-Kette (FLUX -> Gradient) mit ehrlicher Ergebniskennzeichnung.
 *
 * Datenfluss:
 *   Pro Szene wird die Kette durchlaufen; jeder Versuch wird als
 *   Attempt protokolliert. Das Ergebnis traegt IMMER eine Quelle
 *   ("generated" oder "gradient-fallback") — die UI darf niemals ein
 *   Gradient als generiertes Bild ausgeben.
 *
 * Ehrlichkeits-Grenze: Ein fehlgeschlagener FLUX-Versuch wird mit
 *   Grund protokolliert; nach dem Budget greift der Gradient — bewusst
 *   als Fallback markiert, nicht verschwiegen.
 */

export type ImageProviderId = "flux";

export const IMAGE_FALLBACK = {
  providers: ["flux"] as const,
  maxAttemptsPerProvider: 2,
} as const;

export type ImageAttempt = {
  provider: ImageProviderId;
  success: boolean;
  reason?: string;
};

export type SceneImageResult =
  | { source: "generated"; provider: ImageProviderId; url: string }
  | { source: "gradient-fallback"; reason: string; gradientKey: string };

/** Nach einem Versuch: ist das Provider-Budget noch nicht erschoepft? */
export function attemptBudgetLeft(attempts: ImageAttempt[]): boolean {
  return attempts.length < IMAGE_FALLBACK.maxAttemptsPerProvider;
}

/** Waehlt das ehrliche Ergebnis nach den Versuchen. */
export function resolveSceneImage(
  attempts: ImageAttempt[],
  gradientKey: string,
  generatedUrl: string | null,
): SceneImageResult {
  const last = attempts[attempts.length - 1];
  if (generatedUrl && last?.success) {
    return { source: "generated", provider: last.provider, url: generatedUrl };
  }
  const reason =
    attempts.length === 0
      ? "Kein Generierungsversuch moeglich (Key/Budget fehlt)."
      : `FLUX nach ${attempts.length} Versuch(en) nicht verfuegbar: ${attempts[attempts.length - 1].reason ?? "unbekannter Fehler"}.`;
  return { source: "gradient-fallback", reason, gradientKey };
}

/** UI-Kennzeichnung: Gradient wird NIE als echtes Bild deklariert. */
export function formatResultLabel(result: SceneImageResult): string {
  if (result.source === "generated") {
    return `FLUX-Bild (Modell-generiert)`;
  }
  return `Ersatz-Gradient (kein echtes Bild) — ${result.reason}`;
}

/** Vollstaendige, geordnete Kette der Versuche fuer die Ergebnis-Ansicht. */
export function formatAttemptLog(attempts: ImageAttempt[]): string[] {
  return attempts.map((a, i) =>
    a.success
      ? `Versuch ${i + 1} (${a.provider}): erfolgreich`
      : `Versuch ${i + 1} (${a.provider}): fehlgeschlagen${a.reason ? ` — ${a.reason}` : ""}`,
  );
}

/** Ehrliche Statistik ueber alle Szenen einer Pipeline. */
export function summarizeImageSources(
  results: SceneImageResult[],
): { generated: number; gradientFallback: number; honest: boolean } {
  const generated = results.filter((r) => r.source === "generated").length;
  const gradientFallback = results.filter((r) => r.source === "gradient-fallback").length;
  return {
    generated,
    gradientFallback,
    // Ehrlich nur, wenn jede Quelle ihr wahres Label traegt.
    honest: generated + gradientFallback === results.length,
  };
}
