/**
 * Sprint 152 — Root-Cause-Fix: Rate-Limiting traf faelschlich ALLE Nutzer
 * gemeinsam statt pro Person.
 *
 * server/_core/index.ts pruefte bisher `process.env.TRUST_PROXY === "true"`,
 * render.yaml setzt TRUST_PROXY jedoch auf "1". Da "1" !== "true", blieb
 * Express' "trust proxy" in Produktion IMMER deaktiviert. Ohne trust proxy
 * liefert `req.ip` hinter Render's Load Balancer fuer JEDEN Client dieselbe
 * interne Proxy-Adresse — der IP-basierte Rate-Limiter (server/_core/
 * security.ts) fasste dadurch de facto ALLE Nutzer der App in einen
 * gemeinsamen Zaehler-Bucket. Intensives Monitoring/Health-Polling eines
 * einzelnen Vorgangs konnte so den Rate-Limit-Zaehler fuer ALLE anderen
 * Nutzer gleichzeitig ausschoepfen (429 "Zu viele Anfragen"). Der tRPC-
 * Client kann diese 429-Antwort (kein tRPC-Envelope) nicht deserialisieren
 * und zeigt "Unable to transform response from server".
 *
 * Diese Funktion akzeptiert die gaengigen Wahrheitswert-Schreibweisen fuer
 * Umgebungsvariablen ("1", "true", "yes", Gross-/Kleinschreibung egal),
 * damit render.yaml (TRUST_PROXY="1") und lokale .env-Dateien (TRUST_PROXY=
 * true) gleichermassen funktionieren.
 */
export function isTruthyEnvFlag(value: string | undefined | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
