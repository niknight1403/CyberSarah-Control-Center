/**
 * Sprint 107 — Geraetetest-Logik: strukturierte Bewertung der Pruefpunkte
 * aus docs/GERAETETEST_v2.0.md fuer den In-App-Diagnose-Screen.
 *
 * Reine Logik — die Aufrufschicht (Admin-Diagnose/Dashboard) uebergibt nur
 * Messwerte (Endpoint-URL, SecureStore-Status, Berechtigungen, Workspace-
 * Health), diese Datei bewertet und formuliert. Kein Netzwerkzugriff, keine
 * Secrets, tokenfreie Meldungen.
 */

export type DeviceTestState = "untested" | "pass" | "fail";

export type DeviceTestKind =
  | "install"
  | "endpoint"
  | "secureStore"
  | "workspace"
  | "provider"
  | "push"
  | "camera"
  | "microphone"
  | "offline"
  | "rbac";

export interface DeviceTestInput {
  kind: DeviceTestKind;
  state: DeviceTestState;
  /** Beobachtung des Pruefers (optional, wird unkritisch mitgeschrieben). */
  note?: string;
}

export interface DeviceTestCheckView {
  kind: DeviceTestKind;
  label: string;
  state: DeviceTestState;
  message: string;
  note?: string;
}

export interface DeviceTestReport {
  overall: DeviceTestState;
  checks: DeviceTestCheckView[];
  blockers: DeviceTestCheckView[];
  summary: string;
}

const DEFAULT_LABELS: Record<DeviceTestKind, string> = {
  install: "Installation & erster Start",
  endpoint: "Produktiver Endpoint",
  secureStore: "SecureStore & Anmeldung",
  workspace: "Workspace-Service",
  provider: "Master-Agent & Provider-Kette",
  push: "Push-Benachrichtigungen",
  camera: "Kamera",
  microphone: "Mikrofon",
  offline: "Offline-Verhalten",
  rbac: "Rollen & Telemetrie (RBAC)",
};

function messageFor(kind: DeviceTestKind, state: DeviceTestState): string {
  if (state === "pass") {
    switch (kind) {
      case "install":
        return "Installation und Start bestanden.";
      case "endpoint":
        return "App verbindet mit dem produktiven Endpoint.";
      case "secureStore":
        return "Session liegt in SecureStore und ueberlebt Neustart.";
      case "workspace":
        return "Workspace-Service verbunden, Persistenz gemeldet.";
      case "provider":
        return "Provider-Kette antwortet, Failover beobachtbar.";
      case "push":
        return "Benachrichtigungen kommen an.";
      case "camera":
        return "Kamera laeuft mit korrekter Berechtigung.";
      case "microphone":
        return "Mikrofon laeuft mit korrekter Berechtigung.";
      case "offline":
        return "Offline-Verhalten und Wiederanmeldung bestanden.";
      case "rbac":
        return "Standardnutzer sieht keine Admin-Telemetrie.";
    }
  }
  if (state === "fail") {
    switch (kind) {
      case "install":
        return "Installation oder Start fehlgeschlagen — Issue mit Geraet/Android-Version anlegen.";
      case "endpoint":
        return "App nutzt nicht den produktiven Endpoint — APP_BASE_URL im Build pruefen, kein 127.0.0.1.";
      case "secureStore":
        return "Session/Auth-Anzeichen fehlerhaft — SecureStore-Verwendung und Token-Handling pruefen.";
      case "workspace":
        return "Workspace-Service nicht wie erwartet — Health-Endpoint und SERVICE_ACCESS_TOKEN pruefen.";
      case "provider":
        return "Provider-Kette antwortet nicht — Keys, Cooldowns und Managed-Fallback pruefen.";
      case "push":
        return "Keine Benachrichtigungen — Berechtigungen und Push-Konfiguration pruefen.";
      case "camera":
        return "Kamera fehlerhaft — Berechtigungsanfrage und Manifest pruefen.";
      case "microphone":
        return "Mikrofon fehlerhaft — Berechtigungsanfrage und Manifest pruefen.";
      case "offline":
        return "Offline-Verhalten fehlerhaft — Spinner/Haengen pruefen, klaren Hinweis erwarten.";
      case "rbac":
        return "Rollen-Trennung fehlerhaft — Admin-Telemetrie darf Standardnutzern nicht angezeigt werden.";
    }
  }
  return "Noch nicht geprueft — Pruefpunkt aus docs/GERAETETEST_v2.0.md abarbeiten.";
}

/**
 * Bewertet einen Endpoint-Text: produktive Adressen gelten als Treffer,
 * localhost/Loopback ist ein Blocker (Remote-Modelserver duerven nicht
 * ueber 127.0.0.1 laufen).
 */
export function isProductiveEndpoint(endpoint: string): boolean {
  const normalized = endpoint.trim().toLowerCase();
  if (normalized.length === 0) return false;
  if (
    normalized.startsWith("http://") === false &&
    normalized.startsWith("https://") === false
  ) {
    return false;
  }
  if (
    normalized.includes("//127.0.0.1") ||
    normalized.includes("//localhost") ||
    normalized.includes("//[::1]")
  ) {
    return false;
  }
  return true;
}

/** Gesamtzustand prioritaetsbasiert: fail > untested > pass. */
export function evaluateDeviceTest(states: DeviceTestState[]): DeviceTestState {
  const relevant = states.filter((state) => state !== "untested");
  if (relevant.length === 0) return "untested";
  if (relevant.includes("fail")) return "fail";
  return "pass";
}

/** Baut aus Pruefwerten einen tokenfreien Geraetetest-Report. */
export function buildDeviceTestReport(inputs: DeviceTestInput[]): DeviceTestReport {
  const checks: DeviceTestCheckView[] = inputs.map((input) => ({
    kind: input.kind,
    label: DEFAULT_LABELS[input.kind],
    state: input.state,
    message: messageFor(input.kind, input.state),
    note: input.note,
  }));

  const overall = evaluateDeviceTest(checks.map((check) => check.state));
  const blockers = checks.filter((check) => check.state === "fail");
  const passed = checks.filter((check) => check.state === "pass").length;
  const untested = checks.filter((check) => check.state === "untested").length;

  const summary =
    overall === "untested"
      ? `Geraetetest nicht begonnen — ${untested} Pruefpunkte offen.`
      : overall === "fail"
        ? `Geraetetest mit Blockern — ${blockers.length} fehlgeschlagen, ${passed} bestanden.`
        : `Geraetetest bestanden — ${passed} Pruefpunkte gruen, ${untested} offen.`;

  return { overall, checks, blockers, summary };
}

/** Kompakte einzeilige Zusammenfassung fuer Sprint-Berichte/Issues. */
export function summarizeDeviceTestReport(report: DeviceTestReport): string {
  return `${report.overall === "pass" ? "PASS" : report.overall === "fail" ? "FAIL" : "OFFEN"} — ${report.summary}`;
}
