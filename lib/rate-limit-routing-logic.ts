/**
 * Sprint 159 — Root-Cause-Fix: "Unable to transform response from server".
 *
 * server/_core/security.ts lehnte ein Rate-Limit-Ueberschreiten bisher mit
 * rohem Express-JSON ab (`res.status(429).json({ error: "..." })`). Dieser
 * Body hat NICHT die tRPC-Batch-Envelope-Form, die der Client erwartet —
 * @trpc/client versucht trotzdem, die Antwort per superjson zu transformieren,
 * scheitert und zeigt den kryptischen Fehler "Unable to transform response
 * from server" statt einer verstaendlichen Meldung.
 *
 * Diese reine Hilfsfunktion entscheidet, ob ein Request-Pfad die tRPC-Route
 * trifft — nur dann wird das Rate-Limit NICHT direkt in Express abgelehnt,
 * sondern als `res.locals`-Flag an den tRPC-Handler weitergereicht (siehe
 * server/_core/trpc.ts: rateLimitGuard), der es korrekt als TRPCError
 * formatiert und der Client eine lesbare deutsche Fehlermeldung bekommt.
 */
export function isTrpcRequestPath(path: string | undefined | null): boolean {
  if (!path) return false;
  return path.startsWith("/api/trpc");
}
