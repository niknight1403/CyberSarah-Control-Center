import { EventEmitter } from "events";
import { logger } from "../lib/logger";

export type CircuitStatus = "geschlossen" | "offen" | "halb_offen";

export interface CircuitBreakerKonfig {
  fehlerSchwelle: number;
  erfolgsSchwelle: number;
  warteZeitMs: number;
  beobachtungsFensterMs: number;
}

export interface RateLimitKonfig {
  maxAnfragenProFenster: number;
  fensterMs: number;
  backoffBasisMs: number;
  maxBackoffMs: number;
}

interface AnfrageEintrag {
  zeitpunkt: number;
}

export class CircuitBreaker extends EventEmitter {
  private status: CircuitStatus = "geschlossen";
  private fehlerAnzahl = 0;
  private erfolgsAnzahl = 0;
  private letzterFehlerZeitpunkt: number | null = null;
  private readonly konfig: CircuitBreakerKonfig;
  private readonly serviceName: string;

  constructor(serviceName: string, konfig: Partial<CircuitBreakerKonfig> = {}) {
    super();
    this.serviceName = serviceName;
    this.konfig = {
      fehlerSchwelle: konfig.fehlerSchwelle ?? 5,
      erfolgsSchwelle: konfig.erfolgsSchwelle ?? 3,
      warteZeitMs: konfig.warteZeitMs ?? 30_000,
      beobachtungsFensterMs: konfig.beobachtungsFensterMs ?? 60_000,
    };
  }

  async ausfuehren<T>(fn: () => Promise<T>): Promise<T> {
    if (this.status === "offen") {
      const vergangeneZeit = Date.now() - (this.letzterFehlerZeitpunkt ?? 0);
      if (vergangeneZeit < this.konfig.warteZeitMs) {
        const verbleibendeWartezeitSek = Math.ceil((this.konfig.warteZeitMs - vergangeneZeit) / 1000);
        throw new CircuitBreakerOffenFehler(
          `Circuit Breaker für ${this.serviceName} ist OFFEN. Warte noch ${verbleibendeWartezeitSek}s.`,
        );
      }
      this.status = "halb_offen";
      this.erfolgsAnzahl = 0;
      logger.info({ service: this.serviceName }, "Circuit Breaker wechselt zu HALB_OFFEN");
    }

    try {
      const ergebnis = await fn();
      this.aufErfolg();
      return ergebnis;
    } catch (err) {
      this.aufFehler();
      throw err;
    }
  }

  private aufErfolg(): void {
    this.fehlerAnzahl = 0;
    if (this.status === "halb_offen") {
      this.erfolgsAnzahl++;
      if (this.erfolgsAnzahl >= this.konfig.erfolgsSchwelle) {
        this.status = "geschlossen";
        this.erfolgsAnzahl = 0;
        this.emit("geschlossen", this.serviceName);
        logger.info({ service: this.serviceName }, "Circuit Breaker geschlossen — Service erholt");
      }
    }
  }

  private aufFehler(): void {
    this.fehlerAnzahl++;
    this.letzterFehlerZeitpunkt = Date.now();

    if (this.status === "halb_offen" || this.fehlerAnzahl >= this.konfig.fehlerSchwelle) {
      this.status = "offen";
      this.emit("geoeffnet", this.serviceName, this.fehlerAnzahl);
      logger.warn(
        { service: this.serviceName, fehlerAnzahl: this.fehlerAnzahl },
        "Circuit Breaker GEÖFFNET — Service gesperrt",
      );
    }
  }

  holeStatus(): CircuitStatus {
    return this.status;
  }

  holeStatistiken(): { status: CircuitStatus; fehlerAnzahl: number; letzterFehler: Date | null } {
    return {
      status: this.status,
      fehlerAnzahl: this.fehlerAnzahl,
      letzterFehler: this.letzterFehlerZeitpunkt ? new Date(this.letzterFehlerZeitpunkt) : null,
    };
  }
}

export class CircuitBreakerOffenFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = "CircuitBreakerOffenFehler";
  }
}

export class RateLimiter {
  private anfragen: Map<string, AnfrageEintrag[]> = new Map();
  private warteschlange: Map<string, Array<() => void>> = new Map();
  private backoffTimers: Map<string, number> = new Map();
  private readonly konfig: RateLimitKonfig;

  constructor(konfig: Partial<RateLimitKonfig> = {}) {
    this.konfig = {
      maxAnfragenProFenster: konfig.maxAnfragenProFenster ?? 60,
      fensterMs: konfig.fensterMs ?? 60_000,
      backoffBasisMs: konfig.backoffBasisMs ?? 1_000,
      maxBackoffMs: konfig.maxBackoffMs ?? 300_000,
    };
  }

  async warte(serviceKey: string): Promise<void> {
    const backoffBis = this.backoffTimers.get(serviceKey);
    if (backoffBis && Date.now() < backoffBis) {
      const warteZeit = backoffBis - Date.now();
      logger.info({ serviceKey, warteZeitMs: warteZeit }, "Rate-Limit aktiv — warte");
      await new Promise<void>(resolve => setTimeout(resolve, warteZeit));
    }

    const jetzt = Date.now();
    const grenze = jetzt - this.konfig.fensterMs;
    const anfragen = (this.anfragen.get(serviceKey) ?? []).filter(a => a.zeitpunkt > grenze);

    if (anfragen.length >= this.konfig.maxAnfragenProFenster) {
      const aelteste = anfragen[0];
      const warteZeit = aelteste ? aelteste.zeitpunkt + this.konfig.fensterMs - jetzt : this.konfig.fensterMs;
      logger.warn({ serviceKey, warteZeitMs: warteZeit }, "Rate-Limit erreicht — Anfrage verzögert");
      await new Promise<void>(resolve => setTimeout(resolve, warteZeit));
      return this.warte(serviceKey);
    }

    anfragen.push({ zeitpunkt: jetzt });
    this.anfragen.set(serviceKey, anfragen);
  }

  setzeBackoff(serviceKey: string, versuch: number, httpStatus?: number): void {
    let warteZeitMs: number;

    if (httpStatus === 429) {
      warteZeitMs = Math.min(this.konfig.backoffBasisMs * Math.pow(2, versuch), this.konfig.maxBackoffMs);
      logger.warn({ serviceKey, warteZeitMs, versuch }, "HTTP 429 — Exponentieller Backoff aktiviert");
    } else {
      warteZeitMs = Math.min(this.konfig.backoffBasisMs * Math.pow(2, versuch - 1), this.konfig.maxBackoffMs);
    }

    this.backoffTimers.set(serviceKey, Date.now() + warteZeitMs);
  }

  setzeRateLimitHeader(serviceKey: string, headers: Record<string, string>): void {
    const retryAfter = headers["retry-after"] ?? headers["Retry-After"];
    if (retryAfter) {
      const sekunden = parseInt(retryAfter, 10);
      if (!isNaN(sekunden)) {
        this.backoffTimers.set(serviceKey, Date.now() + sekunden * 1000);
        logger.info({ serviceKey, sekunden }, "Retry-After Header gesetzt");
      }
    }

    const verbleibend = headers["x-ratelimit-remaining"] ?? headers["X-RateLimit-Remaining"];
    if (verbleibend && parseInt(verbleibend, 10) === 0) {
      const reset = headers["x-ratelimit-reset"] ?? headers["X-RateLimit-Reset"];
      if (reset) {
        const resetZeit = parseInt(reset, 10) * 1000;
        this.backoffTimers.set(serviceKey, resetZeit);
      }
    }
  }

  holeStatistiken(serviceKey: string): { anfragenImFenster: number; backoffAktivBis: Date | null } {
    const jetzt = Date.now();
    const grenze = jetzt - this.konfig.fensterMs;
    const anfragen = (this.anfragen.get(serviceKey) ?? []).filter(a => a.zeitpunkt > grenze);
    const backoffBis = this.backoffTimers.get(serviceKey);

    return {
      anfragenImFenster: anfragen.length,
      backoffAktivBis: backoffBis && backoffBis > jetzt ? new Date(backoffBis) : null,
    };
  }
}
