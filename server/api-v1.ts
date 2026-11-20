/**
 * Oeffentliche v1-API — Registrierungspunkt.
 *
 * Die Handler-Logik liegt seit Sprint 214 in `server/api-v1-handlers.ts`, weil
 * sie dort mit explizitem I/O-Seam testbar ist (vorher 0 % Coverage auf einer
 * Datei, die Guthaben reserviert und erstattet). Dieses Modul bleibt der
 * stabile Einstiegspunkt: `registerApiV1Routes` fuer `server/_core/index.ts`
 * und `ensureTemplateAgents` fuer den Login-Pfad in `server/_core/sdk.ts`.
 */
import { createApiV1Handlers, defaultApiV1Deps } from "./api-v1-handlers";

export {
  createApiV1Handlers,
  defaultApiV1Deps,
  registerApiV1Routes,
  type ApiUser,
  type ApiV1Deps,
  type CreditPack,
  type TemplateSeedResult,
} from "./api-v1-handlers";

/**
 * Legt fehlende Vorlagen-Agenten an (idempotent ueber den Namen).
 * Wird auch beim ersten Login aufgerufen, damit kein leeres Dashboard erscheint.
 */
export async function ensureTemplateAgents(openId: string): Promise<{
  available: boolean;
  created: string[];
  alreadyPresent: string[];
}> {
  return createApiV1Handlers(defaultApiV1Deps).ensureTemplateAgents(openId);
}
