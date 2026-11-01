import { logger } from "../lib/logger";
import { AuthHandler, type ApiCredentials } from "./AuthHandler";
import { RateLimiter, CircuitBreaker, CircuitBreakerOffenFehler } from "./RateLimiter";

export interface ServiceKonfig {
  name: string;
  baseUrl: string;
  credentials: ApiCredentials;
  rateLimitKonfig?: {
    maxAnfragenProFenster?: number;
    fensterMs?: number;
  };
  circuitBreakerKonfig?: {
    fehlerSchwelle?: number;
    warteZeitMs?: number;
  };
  standardHeaders?: Record<string, string>;
  timeout?: number;
}

export interface AnfrageOptionen {
  endpoint: string;
  methode?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  koerper?: unknown;
  abfrageParameter?: Record<string, string | number | boolean>;
  extraHeaders?: Record<string, string>;
  versuch?: number;
}

export interface NormalisierteAntwort<T = unknown> {
  erfolg: boolean;
  daten: T | null;
  fehler: string | null;
  statusCode: number;
  service: string;
  endpoint: string;
  dauer: number;
  zeitstempel: string;
  meta: {
    versuch: number;
    rateLimitVerbleibend: number | null;
    requestId: string | null;
  };
}

function erstelleRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class APIService {
  private authHandler: AuthHandler;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private konfig: ServiceKonfig;
  private readonly maxVersuche = 3;

  constructor(konfig: ServiceKonfig) {
    this.konfig = konfig;
    this.authHandler = AuthHandler.holeInstanz();
    this.rateLimiter = new RateLimiter({
      maxAnfragenProFenster: konfig.rateLimitKonfig?.maxAnfragenProFenster ?? 60,
      fensterMs: konfig.rateLimitKonfig?.fensterMs ?? 60_000,
    });
    this.circuitBreaker = new CircuitBreaker(konfig.name, {
      fehlerSchwelle: konfig.circuitBreakerKonfig?.fehlerSchwelle ?? 5,
      warteZeitMs: konfig.circuitBreakerKonfig?.warteZeitMs ?? 30_000,
    });
  }

  async anfrage<T = unknown>(optionen: AnfrageOptionen): Promise<NormalisierteAntwort<T>> {
    const startzeit = Date.now();
    const requestId = erstelleRequestId();
    const versuch = optionen.versuch ?? 0;

    logger.info(
      { service: this.konfig.name, endpoint: optionen.endpoint, methode: optionen.methode ?? "GET", requestId },
      "API-Anfrage gestartet",
    );

    try {
      await this.rateLimiter.warte(this.konfig.name);

      const antwort = await this.circuitBreaker.ausfuehren(() =>
        this.fuehreAnfrageAus<T>(optionen, requestId),
      );

      const dauer = Date.now() - startzeit;
      logger.info(
        { service: this.konfig.name, endpoint: optionen.endpoint, statusCode: antwort.statusCode, dauer, requestId },
        "API-Anfrage erfolgreich",
      );
      return antwort;
    } catch (err) {
      const dauer = Date.now() - startzeit;

      if (err instanceof CircuitBreakerOffenFehler) {
        return this.fehlerAntwort<T>(optionen, 503, err.message, versuch, dauer);
      }

      const httpStatus = err instanceof HTTPFehler ? err.status : 0;

      if (httpStatus === 429 && versuch < this.maxVersuche) {
        this.rateLimiter.setzeBackoff(this.konfig.name, versuch + 1, 429);
        logger.warn({ service: this.konfig.name, versuch: versuch + 1 }, "Rate-Limit — Wiederhole Anfrage");
        return this.anfrage<T>({ ...optionen, versuch: versuch + 1 });
      }

      if ((httpStatus >= 500 || httpStatus === 0) && versuch < this.maxVersuche) {
        const warteZeit = Math.pow(2, versuch) * 1000;
        await new Promise<void>(resolve => setTimeout(resolve, warteZeit));
        logger.warn({ service: this.konfig.name, versuch: versuch + 1, warteZeit }, "Server-Fehler — Wiederhole");
        return this.anfrage<T>({ ...optionen, versuch: versuch + 1 });
      }

      const fehlerMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error({ service: this.konfig.name, endpoint: optionen.endpoint, fehler: fehlerMsg, dauer }, "API-Fehler");
      return this.fehlerAntwort<T>(optionen, httpStatus, fehlerMsg, versuch, dauer);
    }
  }

  private async fuehreAnfrageAus<T>(
    optionen: AnfrageOptionen,
    requestId: string,
  ): Promise<NormalisierteAntwort<T>> {
    const startzeit = Date.now();
    const gueltigeCredentials = await this.authHandler.holeGueltigeCredentials(
      this.konfig.name,
      this.konfig.credentials,
    );
    const authHeaders = this.authHandler.erstelleAuthHeader(gueltigeCredentials);

    const url = new URL(`${this.konfig.baseUrl}${optionen.endpoint}`);
    if (optionen.abfrageParameter) {
      for (const [key, val] of Object.entries(optionen.abfrageParameter)) {
        url.searchParams.set(key, String(val));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Request-ID": requestId,
      ...this.konfig.standardHeaders,
      ...authHeaders as Record<string, string>,
      ...optionen.extraHeaders,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.konfig.timeout ?? 30_000);

    let httpAntwort: Response;
    try {
      httpAntwort = await fetch(url.toString(), {
        method: optionen.methode ?? "GET",
        headers,
        body: optionen.koerper ? JSON.stringify(optionen.koerper) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const rateLimitHeaders: Record<string, string> = {};
    httpAntwort.headers.forEach((val, key) => { rateLimitHeaders[key] = val; });
    this.rateLimiter.setzeRateLimitHeader(this.konfig.name, rateLimitHeaders);

    if (!httpAntwort.ok) {
      throw new HTTPFehler(httpAntwort.status, `HTTP ${httpAntwort.status}: ${httpAntwort.statusText}`);
    }

    const daten = (await httpAntwort.json()) as T;
    const dauer = Date.now() - startzeit;

    const rateLimitVerbleibend =
      rateLimitHeaders["x-ratelimit-remaining"] !== undefined
        ? parseInt(rateLimitHeaders["x-ratelimit-remaining"]!, 10)
        : null;

    return {
      erfolg: true,
      daten,
      fehler: null,
      statusCode: httpAntwort.status,
      service: this.konfig.name,
      endpoint: optionen.endpoint,
      dauer,
      zeitstempel: new Date().toISOString(),
      meta: { versuch: optionen.versuch ?? 0, rateLimitVerbleibend, requestId },
    };
  }

  private fehlerAntwort<T>(
    optionen: AnfrageOptionen,
    statusCode: number,
    fehler: string,
    versuch: number,
    dauer: number,
  ): NormalisierteAntwort<T> {
    return {
      erfolg: false,
      daten: null,
      fehler,
      statusCode,
      service: this.konfig.name,
      endpoint: optionen.endpoint,
      dauer,
      zeitstempel: new Date().toISOString(),
      meta: { versuch, rateLimitVerbleibend: null, requestId: null },
    };
  }

  holeCircuitBreakerStatus() {
    return this.circuitBreaker.holeStatistiken();
  }

  holeRateLimitStatistiken() {
    return this.rateLimiter.holeStatistiken(this.konfig.name);
  }
}

class HTTPFehler extends Error {
  status: number;
  constructor(status: number, nachricht: string) {
    super(nachricht);
    this.name = "HTTPFehler";
    this.status = status;
  }
}

// ─── Vorgefertigte Service-Instanzen ───────────────────────────────────────

export function erstelleStripeService(): APIService {
  return new APIService({
    name: "stripe",
    baseUrl: "https://api.stripe.com/v1",
    credentials: {
      typ: "bearer",
      token: process.env["STRIPE_SECRET_KEY"] ?? "",
    },
    rateLimitKonfig: { maxAnfragenProFenster: 100, fensterMs: 1000 },
    circuitBreakerKonfig: { fehlerSchwelle: 5, warteZeitMs: 30_000 },
    standardHeaders: { "Stripe-Version": "2025-01-27.acacia" },
    timeout: 15_000,
  });
}

export function erstelleSocialMediaService(
  plattform: "instagram" | "tiktok" | "youtube",
): APIService {
  const PLATTFORM_KONFIG = {
    instagram: {
      baseUrl: "https://graph.instagram.com/v21.0",
      tokenKey: "INSTAGRAM_ACCESS_TOKEN",
      rateLimit: { maxAnfragenProFenster: 200, fensterMs: 3600_000 },
    },
    tiktok: {
      baseUrl: "https://open.tiktokapis.com/v2",
      tokenKey: "TIKTOK_ACCESS_TOKEN",
      rateLimit: { maxAnfragenProFenster: 100, fensterMs: 60_000 },
    },
    youtube: {
      baseUrl: "https://www.googleapis.com/youtube/v3",
      tokenKey: "YOUTUBE_API_KEY",
      rateLimit: { maxAnfragenProFenster: 10000, fensterMs: 86400_000 },
    },
  };

  const konfig = PLATTFORM_KONFIG[plattform];
  return new APIService({
    name: plattform,
    baseUrl: konfig.baseUrl,
    credentials: {
      typ: "bearer",
      token: process.env[konfig.tokenKey] ?? "",
    },
    rateLimitKonfig: konfig.rateLimit,
    circuitBreakerKonfig: { fehlerSchwelle: 3, warteZeitMs: 60_000 },
    timeout: 20_000,
  });
}
