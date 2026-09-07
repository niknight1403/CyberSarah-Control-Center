/**
 * Sprint 49 — Deterministische Darstellungslogik für den Premium-Chatbereich.
 * Rein, testbar und frei von React-Native-Abhängigkeiten.
 */

export type TimestampedChatMessage = {
  role: "user" | "agent";
  timestampMs?: number;
};

const TIME_DIVIDER_GAP_MS = 10 * 60 * 1000; // 10 Minuten

/** Zeitstempel als HH:MM (deutsche 24h-Konvention). */
export function formatChatClock(timestampMs: number): string {
  const date = new Date(timestampMs);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** Tagesabschnitts-Label: Heute / Gestern / Wochentag, TT. MMMM. */
export function formatChatDay(timestampMs: number, nowMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date(nowMs);
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayDelta === 0) return "Heute";
  if (dayDelta === 1) return "Gestern";
  const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  return `${weekdays[date.getDay()]}, ${date.getDate()}. ${months[date.getMonth()]}`;
}

/**
 * Zeit unter einer Nachricht zeigen, wenn die Nachricht frisch ist oder
 * der Abstand zur vorherigen Nachricht groß genug ist.
 */
export function shouldShowTimestamp(previous: TimestampedChatMessage | null, current: TimestampedChatMessage): boolean {
  if (current.timestampMs == null) return false;
  if (!previous) return true;
  if (previous.timestampMs == null) return true;
  return current.timestampMs - previous.timestampMs >= TIME_DIVIDER_GAP_MS;
}

/** Tages-Trenner zeigen, wenn eine neue Nachricht an einem neuen Tag beginnt. */
export function shouldShowDayDivider(previous: TimestampedChatMessage | null, current: TimestampedChatMessage): boolean {
  if (current.timestampMs == null) return false;
  if (!previous || previous.timestampMs == null) return true;
  return new Date(previous.timestampMs).toDateString() !== new Date(current.timestampMs).toDateString();
}

/** Anzeige-Label je Rolle. */
export function senderLabelForRole(role: "user" | "agent"): string {
  return role === "user" ? "Du" : "Sarah · KI-Operations";
}

/** Avatar-Kürzel je Rolle. */
export function avatarInitialsForRole(role: "user" | "agent"): string {
  return role === "user" ? "HN" : "CS";
}
