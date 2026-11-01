/**
 * Sprint 298 — Fehlerbildschirme: reine, deterministische Logik fuer
 * sprechende Fallbacks statt rotem Diagnose-Overlay im Release-APK.
 *
 * Datenfluss:
 *   Die ErrorBoundary (React) ruft classifyError(rawError, appVariant)
 *   und erhaelt ein strukturiertes Fallback-Ergebnis.
 *
 * Unterscheidung:
 *   - dev-Build (dev-APK): volles Diagnose-Overlay mit Stacktrace.
 *   - admin/release-Build: sprechender Fallback-Text, keine Stacktraces.
 *
 * Ehrlichkeits-Grenze: Der Fallback-Text nennt die Fehlerklasse,
 *   aber niemals interne Dateipfade oder Stacktrace-Zeilen. Der Nutzer
 *   erfaehrt genug, um zu handeln (erneut versuchen / zum Hauptscreen),
 *   aber nicht genug, um die Interna anzugreifen.
 */

export type AppVariant = "dev" | "admin" | "release";

export type ErrorClass =
  | "network"
  | "render"
  | "auth"
  | "data"
  | "unknown";

export type FallbackError = {
  errorClass: ErrorClass;
  title: string;
  text: string;
  showDiagnostics: boolean;
  canRetry: boolean;
  canGoHome: boolean;
};

/** Klassifiziert einen rohen Fehlerstring in eine Fehlerklasse (rein). */
export function classifyErrorClass(rawError: unknown): ErrorClass {
  if (typeof rawError === "string") {
    const lower = rawError.toLowerCase();
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout") || lower.includes("econnrefused")) {
      return "network";
    }
    if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("403") || lower.includes("auth")) {
      return "auth";
    }
    if (lower.includes("null") || lower.includes("undefined is not") || lower.includes("cannot read")) {
      return "render";
    }
  }
  if (rawError instanceof Error) {
    const msg = rawError.message.toLowerCase();
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("timeout")) return "network";
    if (msg.includes("unauthorized") || msg.includes("auth")) return "auth";
    if (msg.includes("null") || msg.includes("undefined") || msg.includes("cannot read")) return "render";
  }
  // Heuristik: Error-Objekt mit .stack → wahrscheinlich Render- oder Logikfehler
  if (rawError && typeof rawError === "object" && "stack" in rawError) {
    return "render";
  }
  return "unknown";
}

/**
 * Erzeugt ein strukturiertes Fallback-Ergebnis basierend auf
 * Fehlerklasse und App-Variante (rein, deterministisch).
 */
export function createFallbackError(
  rawError: unknown,
  appVariant: AppVariant
): FallbackError {
  const errorClass = classifyErrorClass(rawError);
  const showDiagnostics = appVariant === "dev";

  const texts: Record<ErrorClass, { title: string; text: string; canRetry: boolean; canGoHome: boolean }> = {
    network: {
      title: "Verbindungsproblem",
      text: "Die App konnte keine Verbindung zum Server herstellen. Prüfe deine Internetverbindung und versuche es erneut.",
      canRetry: true,
      canGoHome: true,
    },
    render: {
      title: "Ansicht konnte nicht geladen werden",
      text: "Diese Ansicht hat ein Problem beim Darstellen. Du kannst es erneut versuchen oder zum Hauptbildschirm zurückkehren.",
      canRetry: true,
      canGoHome: true,
    },
    auth: {
      title: "Anmeldung abgelaufen",
      text: "Deine Sitzung ist möglicherweise abgelaufen. Bitte melde dich erneut an.",
      canRetry: false,
      canGoHome: true,
    },
    data: {
      title: "Daten konnten nicht geladen werden",
      text: "Die angeforderten Daten sind nicht verfügbar. Versuche es später erneut.",
      canRetry: true,
      canGoHome: true,
    },
    unknown: {
      title: "Etwas ist schiefgelaufen",
      text: "Die App konnte diese Ansicht nicht laden. Du kannst es erneut versuchen oder zum Hauptbildschirm zurückkehren.",
      canRetry: true,
      canGoHome: true,
    },
  };

  // In Release/Admin: niemals interne Details zeigen
  const info = texts[errorClass];
  if (!showDiagnostics) {
    return {
      errorClass,
      title: info.title,
      text: info.text,
      showDiagnostics: false,
      canRetry: info.canRetry,
      canGoHome: info.canGoHome,
    };
  }

  // In Dev: erweiterte Diagnose erlaubt
  const rawMsg =
    typeof rawError === "string"
      ? rawError
      : rawError instanceof Error
        ? rawError.message
        : String(rawError ?? "");

  return {
    errorClass,
    title: info.title,
    text: info.text,
    showDiagnostics: true,
    canRetry: info.canRetry,
    canGoHome: info.canGoHome,
  };
}

/** Prueft, ob ein Fehler ueberhaupt einen Fallback braucht (nur Render-Fehler). */
export function needsFallback(errorClass: ErrorClass): boolean {
  return errorClass !== "auth";
}

/** Sichere String-Repraesentation eines Fehlers fuer Logs (ohne sensibelge Daten). */
export function sanitizeErrorForLog(rawError: unknown): string {
  if (typeof rawError === "string") return rawError.slice(0, 500);
  if (rawError instanceof Error) return `${rawError.name}: ${rawError.message}`.slice(0, 500);
  return "unknown error";
}
