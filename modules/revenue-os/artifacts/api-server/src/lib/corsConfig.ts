import type { CorsOptions } from "cors";
import { logger } from "./logger";

/**
 * Builds the set of browser origins that are allowed to make credentialed
 * cross-origin requests to this API.
 *
 * We deliberately do NOT reflect an arbitrary `Origin` header back (i.e. no
 * `origin: true`). This app is single-operator, so the allowlist only needs
 * to cover the operator's own domain(s):
 * - Every domain in `ALLOWED_ORIGINS` (comma-separated, e.g.
 *   "https://app.cybersarah.ai,https://cybersarah.vercel.app").
 * - `PUBLIC_APP_URL` (single primary domain, convenience for the common
 *   one-frontend-one-backend deployment).
 * - `localhost`/`127.0.0.1` on any port, for local shell/tooling access.
 */
function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  const allowedOrigins = process.env["ALLOWED_ORIGINS"];
  if (allowedOrigins) {
    for (const origin of allowedOrigins.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  const publicAppUrl = process.env["PUBLIC_APP_URL"];
  if (publicAppUrl) {
    origins.add(publicAppUrl.replace(/\/$/, ""));
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins();
const localhostOriginPattern = /^(https?:|capacitor:|file:)\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.has(origin) || localhostOriginPattern.test(origin);
}

export const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    // Requests without an Origin header (curl, server-to-server calls,
    // Stripe webhooks, native/Expo clients) are not subject to browser CORS
    // enforcement and are not the vector this control protects against.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    logger.warn({ origin }, "CORS: Ursprung nicht erlaubt, Anfrage blockiert");
    callback(new Error("Nicht erlaubter CORS-Ursprung"));
  },
};
