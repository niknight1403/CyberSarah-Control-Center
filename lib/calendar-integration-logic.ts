/**
 * Sprint 335 — Kalender-Integration: reine, deterministische Logik zum
 * Lesen und Erstellen von Terminen, Provider-abstrahiert.
 *
 * Datenfluss:
 *   Normale Termin-Daten (Provider-unabhaengig) werden validiert und
 *   in Provider-Payloads uebersetzt; Abfragen filtern Zeitfenster.
 *
 * Ehrlichkeits-Grenze: Provider-Fehler werden NICHT als "kein Termin"
 * ausgegeben — Lesefehler bleiben Fehler. Ein Termin ohne Endezeit ist
 * ungueltig, nicht "irgendwann".
 */

export type NormalizedEvent = {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
  location: string | null;
  attendees: string[];
};

export type ProviderName = "google" | "outlook" | "ical";

/** Termin-Validierung: Start vor Ende, Titel und ID Pflicht. */
export function validateEvent(event: NormalizedEvent): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!event.id.trim()) issues.push("ID fehlt");
  if (!event.title.trim()) issues.push("Titel fehlt");
  if (event.endsAt <= event.startsAt) issues.push("Ende liegt nicht nach Start");
  return { ok: issues.length === 0, issues };
}

/** Termine im Zeitfenster (inklusive Rander), chronologisch. */
export function eventsInWindow(events: NormalizedEvent[], from: number, to: number): NormalizedEvent[] {
  return events
    .filter((e) => e.startsAt >= from && e.startsAt <= to)
    .sort((a, b) => a.startsAt - b.startsAt);
}

/** Ueberschneidungspruefung fuer eigene Kalender (ehrliche Konflikt-Meldung). */
export function findConflicts(existing: NormalizedEvent[], candidate: NormalizedEvent): NormalizedEvent[] {
  return existing.filter(
    (e) => candidate.startsAt < e.endsAt && e.startsAt < candidate.endsAt,
  );
}

/** Provider-Payload: gleiche Daten, je Provider geformt. */
export function toProviderPayload(event: NormalizedEvent, provider: ProviderName): Record<string, unknown> {
  const base = { id: event.id, summary: event.title };
  switch (provider) {
    case "google":
      return {
        ...base,
        start: { dateTime: new Date(event.startsAt).toISOString() },
        end: { dateTime: new Date(event.endsAt).toISOString() },
        location: event.location ?? undefined,
        attendees: event.attendees.map((email) => ({ email })),
      };
    case "outlook":
      return {
        ...base,
        start: { dateTime: new Date(event.startsAt).toISOString(), timeZone: "UTC" },
        end: { dateTime: new Date(event.endsAt).toISOString(), timeZone: "UTC" },
        location: { displayName: event.location ?? "" },
      };
    case "ical":
      return {
        ...base,
        dtSTART: new Date(event.startsAt).toISOString(),
        DTEND: new Date(event.endsAt).toISOString(),
        LOCATION: event.location ?? "",
      };
  }
}

/** Lese-Fehler ehrlich weiterreichen: "Fehler" != "leer". */
export type ReadResult = { ok: true; events: NormalizedEvent[] } | { ok: false; error: string };

export function describeReadResult(result: ReadResult): string {
  if (result.ok) {
    return result.events.length === 0
      ? "Kein Termin im Fenster."
      : `${result.events.length} Termin(e) gelesen.`;
  }
  return `Kalender-Lesen FEHLGESCHLAGEN: ${result.error}`;
}
