/**
 * Sprint 347 — Lokale Push-Benachrichtigungen (ohne FCM):
 * Schedule und Verwaltung von lokalen Erinnerungen auf dem Geraet.
 *
 * Ehrlichkeits-Grenze:
 *   Lokale Notifications funktionieren NUR auf dem Geraet, auf dem sie
 *   erstellt wurden. Keine Cross-Device-Synchronisation, kein Server-Push.
 *   Ohne erteilte Berechtigung werden keine Notifications geplant —
 *   die Logik meldet das ehrlich, anstatt still zu scheitern.
 *   FCM (Firebase Cloud Messaging) wird bewusst NICHT verwendet;
 *   das ist eine bewusste Entscheidung, keine fehlende Funktion.
 */

export type NotificationPermission = "granted" | "denied" | "undetermined";

export type NotificationCategory =
  | "chat-reply"
  | "task-reminder"
  | "quota-warning"
  | "deploy-status"
  | "system-alert";

export type ScheduledNotification = {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  /** Geplante Ausloesung als Unix-Timestamp (ms). */
  triggerAtMs: number;
  /** Wiedergabe-Intervall in ms, oder null fuer Einmal-Nachricht. */
  repeatIntervalMs: number | null;
};

export type ScheduleInput = {
  category: NotificationCategory;
  title: string;
  body: string;
  /** Verzoegerung in ms ab jetzt. */
  delayMs: number;
  repeatIntervalMs?: number | null;
  permission: NotificationPermission;
};

const CATEGORY_DEFAULTS: Record<NotificationCategory, { title: string; body: string }> = {
  "chat-reply": { title: "Neue Antwort", body: "Eine neue Chat-Antwort ist eingetroffen." },
  "task-reminder": { title: "Aufgabenerinnerung", body: "Du hast eine ausstehende Aufgabe." },
  "quota-warning": { title: "Nutzungslimit", body: "Du naeherst dich deinem Kontingent." },
  "deploy-status": { title: "Deploy-Status", body: "Ein Deploy wurde abgeschlossen." },
  "system-alert": { title: "Systemhinweis", body: "Ein Systemereignis wurde erkannt." },
};

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `local-notif-${Date.now()}-${idCounter}`;
}

/**
 * Plant eine lokale Notification, wenn die Berechtigung erteilt wurde.
 * Gibt null zurueck, wenn die Berechtigung fehlt — ehrlich, nicht still.
 */
export function scheduleLocalNotification(input: ScheduleInput): ScheduledNotification | null {
  if (input.permission !== "granted") {
    return null;
  }

  if (input.delayMs < 0) {
    return null;
  }

  const defaults = CATEGORY_DEFAULTS[input.category];
  const triggerAt = Date.now() + input.delayMs;

  return {
    id: generateId(),
    title: input.title || defaults.title,
    body: input.body || defaults.body,
    category: input.category,
    triggerAtMs: triggerAt,
    repeatIntervalMs: input.repeatIntervalMs ?? null,
  };
}

/**
 * Filtert geplante Notifications: nur zukuenftige behalten, abgelaufene entfernen.
 */
export function filterPendingNotifications(
  notifications: ScheduledNotification[],
  nowMs: number,
): ScheduledNotification[] {
  return notifications.filter((n) => {
    if (n.repeatIntervalMs !== null) {
      // Wiederauftretende Notifications bleiben immer (naechste Ausloesung wird berechnet)
      return true;
    }
    return n.triggerAtMs > nowMs;
  });
}

/**
 * Berechnet die naechste Ausloesung einer wiederkehrenden Notification.
 */
export function nextTriggerTime(notification: ScheduledNotification, nowMs: number): number {
  if (notification.repeatIntervalMs === null) {
    return notification.triggerAtMs;
  }
  const elapsed = nowMs - notification.triggerAtMs;
  if (elapsed <= 0) return notification.triggerAtMs;
  const intervalsPassed = Math.floor(elapsed / notification.repeatIntervalMs);
  return notification.triggerAtMs + (intervalsPassed + 1) * notification.repeatIntervalMs;
}

/**
 * Erzeugt eine ehrliche Statusmeldung ueber die Faehigkeiten und Grenzen.
 */
export function getLocalNotificationStatus(permission: NotificationPermission): {
  available: boolean;
  message: string;
  limitation: string;
} {
  if (permission === "granted") {
    return {
      available: true,
      message: "Lokale Erinnerungen aktiviert.",
      limitation: "Erinnerungen funktionieren nur auf diesem Geraet. Keine Server-Push, kein FCM.",
    };
  }
  if (permission === "denied") {
    return {
      available: false,
      message: "Benachrichtigungsberechtigung wurde abgelehnt.",
      limitation: "Ohne Berechtigung koennen keine lokalen Erinnerungen geplant werden.",
    };
  }
  return {
    available: false,
    message: "Benachrichtigungsberechtigung noch nicht angefragt.",
    limitation: "Ohne Berechtigung koennen keine lokalen Erinnerungen geplant werden.",
  };
}
