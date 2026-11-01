/**
 * HTTP-Client fuer die HubSpot CRM API v3.
 *
 * Eigenschaften, die fuer den Produktivbetrieb wichtig sind:
 *  - ein einziges Token, niemals im Client/UI sichtbar
 *  - Wiederholung bei 429 und 5xx mit Backoff (HubSpot drosselt hart)
 *  - harte Zeitgrenze pro Versuch, damit ein haengender Aufruf keinen
 *    Aufgaben-Slot blockiert
 *  - Fehler werden als HubspotApiError mit Statuscode zurueckgegeben
 */
import { HubspotApiError, HubspotConfigError } from "./types";

export interface HubspotClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Maximale Anzahl Versuche inklusive Erstversuch. */
  maxAttempts?: number;
  /** Zeitgrenze pro Versuch in Millisekunden. */
  timeoutMs?: number;
  /** Wartezeit vor dem ersten Wiederholungsversuch. */
  baseDelayMs?: number;
  /** Wartezeit-Funktion, in Tests austauschbar. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BASE_URL = "https://api.hubapi.com";
const TOKEN_PREFIX = "pat-";

export function assertValidToken(token: string): string {
  const value = String(token ?? "").trim();
  if (!value) {
    throw new HubspotConfigError(
      "HUBSPOT_ACCESS_TOKEN fehlt. Private App im HubSpot-Portal anlegen und Token in die .env eintragen.",
    );
  }
  if (!value.startsWith(TOKEN_PREFIX)) {
    throw new HubspotConfigError(
      `HUBSPOT_ACCESS_TOKEN hat kein gueltiges Format (erwartet Praefix "${TOKEN_PREFIX}").`,
    );
  }
  if (value.length < 20) {
    throw new HubspotConfigError("HUBSPOT_ACCESS_TOKEN ist zu kurz fuer ein Private-App-Token.");
  }
  return value;
}

function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(headerValue);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class HubspotClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HubspotClientOptions) {
    this.token = assertValidToken(options.token);
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 15_000);
    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
    this.sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** GET/POST gegen die CRM-API; wiederholt ausschliesslich 429 und 5xx. */
  async request<T>(
    path: string,
    init: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
  ): Promise<T> {
    const method = init.method ?? "GET";
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    let lastNetworkError: unknown = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: controller.signal,
        });
      } catch (error) {
        lastNetworkError = error;
        clearTimeout(timer);
        if (attempt === this.maxAttempts) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new HubspotApiError(`HubSpot-Aufruf fehlgeschlagen: ${reason}`, 0, "");
        }
        await this.sleep(Math.min(this.baseDelayMs * 2 ** (attempt - 1), 5_000));
        continue;
      }
      clearTimeout(timer);

      const text = await response.text();
      if (response.ok) {
        return (text ? JSON.parse(text) : {}) as T;
      }

      const apiError = new HubspotApiError(
        `HubSpot antwortete mit ${response.status} auf ${method} ${path}.`,
        response.status,
        text.slice(0, 500),
        parseRetryAfter(response.headers.get("retry-after")),
      );
      // Fachliche Fehler (400/401/403/404/409) sind nicht wiederholbar.
      if (!isRetryableStatus(response.status) || attempt === this.maxAttempts) throw apiError;
      await this.sleep(Math.min(this.baseDelayMs * 2 ** (attempt - 1), 5_000));
    }

    throw lastNetworkError instanceof HubspotApiError
      ? lastNetworkError
      : new HubspotApiError("HubSpot-Aufruf fehlgeschlagen.", 0, "");
  }
}
