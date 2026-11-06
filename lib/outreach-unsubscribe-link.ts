/**
 * Abmelde-Link fuer Outreach-Mails.
 *
 * Der Link muss den Empfaenger eindeutig treffen. Eine Adresse allein reicht
 * nicht: Lead-Knoten werden ueber die Domain gefuehrt, mehrere Interessenten
 * koennen also auf demselben Knoten liegen. Deshalb traegt der Link primaer den
 * Knotenschluessel und nur als Rueckfallebene die Adresse.
 */

export type UnsubscribeTarget = {
  leadNodeKey?: string | null;
  email?: string | null;
};

export function buildUnsubscribeUrl(base: string, target: UnsubscribeTarget): string {
  const cleanBase = (base ?? "").trim();
  if (!cleanBase) return "";
  const params: string[] = [];
  const nodeKey = (target.leadNodeKey ?? "").trim();
  const email = (target.email ?? "").trim().toLowerCase();
  if (nodeKey) params.push(`lead=${encodeURIComponent(nodeKey)}`);
  if (email) params.push(`email=${encodeURIComponent(email)}`);
  if (params.length === 0) return "";
  return `${cleanBase}${cleanBase.includes("?") ? "&" : "?"}${params.join("&")}`;
}
