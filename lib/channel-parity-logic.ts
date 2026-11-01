/**
 * Faehigkeitsparitaet 5/6 — Channel-Paritaet: reine, deterministische
 * Logik fuer Messaging-Kanaele des Agenten (Base44-Pendant: WhatsApp,
 * Telegram, iMessage, Slack, Phone).
 *
 * Datenfluss:
 *   Kanal-Definitionen (Name, Richtung ein-/ausgehend, gratis?) plus der
 *   Konfigurationszustand ergeben: Welcher Kanal kann senden/empfangen?
 *
 * Ehrlichkeits-Grenze: Ein Kanal ohne konfigurierte Anbindung wird als
 *   "nicht verbunden" gemeldet und NICHT als vorhanden gelistet. Gratis
 *   heisst hier bewusst: Telegram-Integration ist ohne bezahlte Dritt-
 *   API moeglich; WhatsApp Business / Phone brauchen technische Anbindungen,
 *   die ausserhalb der Gratis-Spitze liegen — das wird offen benannt.
 */

export type ChannelId = "telegram" | "whatsapp" | "imessage" | "slack" | "phone";

export type ChannelSpec = {
  id: ChannelId;
  label: string;
  direction: "rein" | "raus" | "beide";
  /** Kann der Kanal ohne bezahlte Drittanbieter-API betrieben werden? */
  freePossible: boolean;
  /** Ist die (kostenlose) Anbindung hier konkret konfiguriert? */
  connected: boolean;
};

export const DEFAULT_CHANNELS: ChannelSpec[] = [
  { id: "telegram", label: "Telegram", direction: "beide", freePossible: true, connected: false },
  { id: "whatsapp", label: "WhatsApp", direction: "beide", freePossible: false, connected: false },
  { id: "imessage", label: "iMessage", direction: "beide", freePossible: false, connected: false },
  { id: "slack", label: "Slack", direction: "beide", freePossible: true, connected: false },
  { id: "phone", label: "Telefon", direction: "raus", freePossible: false, connected: false },
];

export type SendDecision =
  | { ok: true; channel: ChannelSpec }
  | { ok: false; reason: "nicht verbunden" | "nur eingehend" | "nicht gratis moeglich" };

/** Senden je Kanal ehrlich entscheiden. */
export function decideSend(channels: ChannelSpec[], channel: ChannelId): SendDecision {
  const spec = channels.find((c) => c.id === channel);
  if (!spec) return { ok: false, reason: "nicht verbunden" };
  if (!spec.connected) return { ok: false, reason: "nicht verbunden" };
  if (spec.direction === "rein") return { ok: false, reason: "nur eingehend" };
  return { ok: true, channel: spec };
}

/** Kanal-Anbindung konfigurieren (hier: Telegram gratis via Bot-Token). */
export function connectChannel(channels: ChannelSpec[], channel: ChannelId): ChannelSpec[] {
  return channels.map((c) => (c.id === channel ? { ...c, connected: true } : c));
}

/** Ehrliche Kanal-Uebersicht: getrennt nach verbindbar JETZT und theoretisch. */
export function describeChannels(channels: ChannelSpec[]): string {
  const connected = channels.filter((c) => c.connected);
  const freeUnconnected = channels.filter((c) => !c.connected && c.freePossible);
  const paidOnly = channels.filter((c) => !c.connected && !c.freePossible);
  const lines: string[] = [];
  lines.push(
    connected.length > 0
      ? `Verbunden: ${connected.map((c) => c.label).join(", ")}.`
      : "Kein Kanal verbunden — Agent erreicht niemanden von sich aus.",
  );
  if (freeUnconnected.length > 0) {
    lines.push(`Gratis verbindbar: ${freeUnconnected.map((c) => c.label).join(", ")} (Konfiguration noetig).`);
  }
  if (paidOnly.length > 0) {
    lines.push(`Ohne bezahlte Drittanbieter nicht betreibbar: ${paidOnly.map((c) => c.label).join(", ")} — ehrlich ausgeschlossen.`);
  }
  return lines.join("\n");
}

/** Eingehende Nachricht: welchen verbundenen Kanal darf sie beanspruchen? */
export function canReceive(channels: ChannelSpec[], channel: ChannelId): boolean {
  const spec = channels.find((c) => c.id === channel);
  return spec !== undefined && spec.connected && (spec.direction === "beide" || spec.direction === "rein");
}
