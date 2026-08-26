export type PushPermission = "granted" | "denied" | "undetermined";

export type PushStatusInput = {
  supported: boolean;
  permission: PushPermission;
  token: string | null;
  reason?: "web" | "permission-denied" | "project-id-missing" | "registration-failed";
};

export function getPushStatusMessage(result: PushStatusInput): string {
  if (!result.supported) return "Push-Benachrichtigungen sind im Web nicht verfügbar.";
  if (result.token) return "Push-Benachrichtigungen aktiviert.";
  if (result.reason === "project-id-missing") return "Berechtigung erteilt; für die Token-Registrierung fehlt noch die Expo-Projekt-ID.";
  if (result.reason === "permission-denied") return "Benachrichtigungsberechtigung wurde nicht erteilt.";
  return "Push-Registrierung konnte nicht abgeschlossen werden.";
}
