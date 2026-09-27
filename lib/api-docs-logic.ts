/**
 * Sprint 340 — API-Doku-Screen: reine, deterministische Logik, die die
 * eigenen Endpunkte EHRLICH erklaert.
 *
 * Datenfluss:
 *   Endpunkt-Katalog (Route, Methode, noetiger Scope, Auth, Limit)
 *   erzeugt Doku-Bloecke und Beispiele — Status-Codes inklusive der
 *   Fehlerfaelle, nicht nur Erfolgs-Poesie.
 *
 * Ehrlichkeits-Grenze: Jeder Endpunkt nennt seine Fehlerfaelle (401,
 *   429, ...). Undichte Authentifizierung wird als solche benannt:
 *   "optional" heisst wirklich optional, nie "eigentlich pflicht".
 */

import type { ApiScope } from "./api-keys-logic";

export type ApiEndpointDoc = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  route: string;
  summary: string;
  requiredScope: ApiScope;
  authRequired: boolean;
  rateLimitPerMinute: number | null;
  requestExample: Record<string, unknown> | null;
  errorCodes: number[];
};

/** Doku-Block je Endpunkt — immer inklusive Fehlerfaelle. */
export function formatEndpointBlock(doc: ApiEndpointDoc): string {
  const lines = [
    `${doc.method} ${doc.route}`,
    doc.summary,
    `Auth: ${doc.authRequired ? "API-Key noetig" : "keine Auth noetig"} | Scope: ${doc.requiredScope}`,
    doc.rateLimitPerMinute !== null
      ? `Rate-Limit: ${doc.rateLimitPerMinute}/Minute`
      : `Rate-Limit: unbegrenzt (bewusst)`,
  ];
  if (doc.requestExample) {
    lines.push(`Beispiel-Body: ${JSON.stringify(doc.requestExample)}`);
  }
  lines.push(`Fehler-Codes: ${doc.errorCodes.join(", ")}`);
  return lines.join("\n");
}

/** Katalog-Pruefung: Endpunkte ohne Fehler-Codes sind Doku-Luecken. */
export function findDocGaps(catalog: ApiEndpointDoc[]): string[] {
  const gaps: string[] = [];
  for (const doc of catalog) {
    if (doc.errorCodes.length === 0) {
      gaps.push(`${doc.method} ${doc.route}: keine Fehler-Codes dokumentiert — unehrlich.`);
    }
    if (doc.authRequired && doc.requiredScope === "read" && doc.method === "DELETE") {
      gaps.push(`${doc.method} ${doc.route}: DELETE nur mit read-Scope? — falsch dokumentiert.`);
    }
  }
  return gaps;
}

/** Schnellreferenz: alle Routen gruppiert nach Methode. */
export function quickReference(catalog: ApiEndpointDoc[]): Record<string, string[]> {
  const byMethod: Record<string, string[]> = {};
  for (const doc of catalog) {
    byMethod[doc.method] = [...(byMethod[doc.method] ?? []), doc.route];
  }
  return byMethod;
}

/** Begruessungstext mit ehrlichem Hinweis auf Rate-Limits. */
export function introText(catalog: ApiEndpointDoc[]): string {
  const limited = catalog.filter((c) => c.rateLimitPerMinute !== null).length;
  return `API-Doku: ${catalog.length} Endpunkte, ${limited} davon mit Rate-Limit. Fehlerfaelle sind je Endpunkt dokumentiert.`;
}
