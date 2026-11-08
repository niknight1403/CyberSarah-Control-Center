/**
 * Live-Integrations-Health: ein Service, den sowohl der Audit-CLI
 * (`scripts/integration-audit.ts`) als auch der tRPC-Router
 * (`server/integration-health-router.ts`) nutzen.
 *
 * Warum ein gemeinsamer Service statt zweier Implementierungen:
 * Ein CLI-Skript, das anders prueft als die API, ist schlimmer als kein
 * Skript — es entsteht die Frage, welchem Ergebnis man glaubt. Die
 * Auswertungsregeln liegen deshalb in `lib/integration-live-probe-logic.ts`
 * (rein, ohne Netz) und die Netz-Durchfuehrung hier. Beide Aufrufer
 * bekommen identische Befunde.
 *
 * Grenzen: ausschliesslich lesend. Kein Mailversand, kein Posting, keine
 * Budgetaenderung. Ergebnisse werden 5 Minuten gecacht, damit ein
 * Dashboard-Reload keine Provider-Quota verbrennt.
 */
import {
  evaluateDnsAlignment,
  evaluateMetaAppProbe,
  evaluateMetaTokenProbe,
  evaluateResendDomains,
  evaluateTikTokClientProbe,
  evaluateTikTokTokenProbe,
  extractResendRecords,
  isUsableCredential,
  looksLikeResendKey,
  computeProbeOverall,
  summarizeProbes,
  type LiveProbeProvider,
  type ProbeResult,
  type ProbeSummary,
  type ResendRecord,
} from "../../lib/integration-live-probe-logic";

export type ProviderProbeResult = ProbeResult & { provider: LiveProbeProvider };

export type LiveProbeReport = {
  checkedAt: string;
  durationMs: number;
  domain: string;
  results: ProviderProbeResult[];
  summary: ProbeSummary;
  overall: "pass" | "warn" | "fail";
  fromCache: boolean;
};

export type LiveProbeOptions = {
  /** ENV-Quelle; im Test injizierbar, damit keine echten Keys gebraucht werden. */
  env?: Record<string, string | undefined>;
  /** fetch-Implementierung; im Test durch einen Fake ersetzt. */
  fetchImpl?: typeof fetch;
  /** Absenderdomain fuer den Resend-Abgleich (Default cybersarah-ki.com). */
  domain?: string;
  timeoutMs?: number;
  /** Diagnose-Ausgabe (Netzwerkfehler), im Server standardmaessig still. */
  logger?: (message: string) => void;
};

export const DEFAULT_RESEND_DOMAIN = "cybersarah-ki.com";
export const DEFAULT_PROBE_TTL_MS = 5 * 60_000;

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const TIKTOK_BASE = "https://open.tiktokapis.com/v2";
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

type JsonResponse = { status: number; body: unknown; headers: Record<string, string> };

/**
 * Holt JSON ohne zu werfen: ein Netzwerkfehler wird als Status 0 gemeldet
 * und von der Auswertung als Warnung behandelt. Query-Strings werden aus
 * der Log-Zeile entfernt, weil Meta das `access_token` in der URL traegt.
 */
async function fetchJson(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  fetchImpl: typeof fetch,
  timeoutMs: number,
  logger?: (message: string) => void,
): Promise<JsonResponse> {
  try {
    const response = await fetchImpl(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Kein JSON (z. B. HTML-Fehlerseite eines Proxys) — Roh-Text behalten.
    }
    return { status: response.status, body, headers: Object.fromEntries(response.headers.entries()) };
  } catch (error) {
    const safeUrl = url.replace(/\?.*$/, "");
    logger?.(`Netzwerkfehler ${safeUrl} — ${error instanceof Error ? error.message : String(error)}`);
    return { status: 0, body: null, headers: {} };
  }
}

/** DNS ueber Cloudflare DoH — kein zusaetzliches Paket, laeuft auch im CI. */
async function resolveDns(
  name: string,
  type: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string[]> {
  const endpoint = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const { status, body } = await fetchJson(
    endpoint,
    { headers: { accept: "application/dns-json" } },
    fetchImpl,
    Math.min(timeoutMs, 8_000),
  );
  if (status !== 200) return [];
  const answers = (body as { Answer?: { data?: unknown }[] } | null)?.Answer;
  if (!Array.isArray(answers)) return [];
  return answers.flatMap((answer) => (typeof answer?.data === "string" ? [answer.data] : []));
}

async function resolveResendRecords(
  records: readonly ResendRecord[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Record<string, string[]>> {
  const liveDns: Record<string, string[]> = {};
  for (const record of records) {
    liveDns[`${record.type}:${record.name}`] = await resolveDns(record.name, record.type, fetchImpl, timeoutMs);
  }
  return liveDns;
}

function withProvider(result: ProbeResult, provider: LiveProbeProvider): ProviderProbeResult {
  return { ...result, provider };
}

/**
 * Fuehrt alle Live-Pruefungen aus. Reihenfolge ist stabil (Resend, TikTok,
 * Meta), damit UI und Audit-Log vergleichbar bleiben.
 */
export async function collectLiveProbes(options: LiveProbeOptions = {}): Promise<LiveProbeReport> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const logger = options.logger;
  const startedAt = Date.now();
  const results: ProviderProbeResult[] = [];

  // --- Resend: Absenderdomain + echte DNS-Records ---
  const resendKey = env.RESEND_API_KEY;
  const domain =
    options.domain?.trim() ||
    env.RESEND_DOMAIN?.trim() ||
    env.RESEND_FROM_DOMAIN?.trim().replace(/^.*@/, "") ||
    DEFAULT_RESEND_DOMAIN;

  if (!isUsableCredential(resendKey)) {
    results.push(
      withProvider(
        {
          name: "Resend-Konfiguration",
          severity: "skip",
          detail: "RESEND_API_KEY fehlt oder ist ein Platzhalter — Live-Pruefung uebersprungen",
        },
        "resend",
      ),
    );
  } else {
    if (!looksLikeResendKey(resendKey)) {
      results.push(
        withProvider(
          {
            name: "Resend-Key-Format",
            severity: "warn",
            detail: "Key beginnt nicht mit re_ — vermutlich der falsche Schluessel im Secret",
          },
          "resend",
        ),
      );
    }

    const auth = { authorization: `Bearer ${resendKey.trim()}` };
    const domains = await fetchJson("https://api.resend.com/domains", { headers: auth }, fetchImpl, timeoutMs, logger);
    const evaluation = evaluateResendDomains(domains.status, domains.body, domain);
    results.push(withProvider({ name: "Resend-Absenderdomain", severity: evaluation.severity, detail: evaluation.detail }, "resend"));

    if (evaluation.domain) {
      const detailResponse = await fetchJson(
        `https://api.resend.com/domains/${encodeURIComponent(evaluation.domain.id)}`,
        { headers: auth },
        fetchImpl,
        timeoutMs,
        logger,
      );
      if (detailResponse.status === 200) {
        const records = extractResendRecords(detailResponse.body);
        const liveDns = await resolveResendRecords(records, fetchImpl, timeoutMs);
        const alignment = evaluateDnsAlignment(records, liveDns);
        results.push(withProvider({ name: "Resend-DNS-Records", severity: alignment.severity, detail: alignment.detail }, "resend"));
      } else {
        results.push(
          withProvider(
            {
              name: "Resend-DNS-Records",
              severity: "warn",
              detail: `Domain-Details nicht abrufbar (HTTP ${detailResponse.status}) — DNS-Abgleich uebersprungen`,
            },
            "resend",
          ),
        );
      }

      const dmarcValues = await resolveDns(`_dmarc.${evaluation.domain.name}`, "TXT", fetchImpl, timeoutMs);
      const hasDmarc = dmarcValues.some((value) => value.toLowerCase().includes("v=dmarc1"));
      results.push(
        withProvider(
          {
            name: "DMARC-Record",
            severity: hasDmarc ? "pass" : "warn",
            detail: hasDmarc
              ? "DMARC-Richtlinie veroeffentlicht"
              : `kein TXT _dmarc.${evaluation.domain.name} — Zustellbarkeit leidet, Spam-Einstufung wahrscheinlicher`,
          },
          "resend",
        ),
      );
    }
  }

  // --- TikTok ---
  const tiktokKey = env.TIKTOK_CLIENT_KEY;
  const tiktokSecret = env.TIKTOK_CLIENT_SECRET;
  const tiktokToken = env.TIKTOK_ACCESS_TOKEN;

  if (isUsableCredential(tiktokKey) && isUsableCredential(tiktokSecret)) {
    const probe = await fetchJson(
      `${TIKTOK_BASE}/oauth/token/`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: tiktokKey.trim(),
          client_secret: tiktokSecret.trim(),
          grant_type: "client_credentials",
        }).toString(),
      },
      fetchImpl,
      timeoutMs,
      logger,
    );
    results.push(withProvider(evaluateTikTokClientProbe(probe.status, probe.body), "tiktok"));
  } else {
    results.push(
      withProvider(
        {
          name: "TikTok Client-Credentials",
          severity: "skip",
          detail: "TIKTOK_CLIENT_KEY/SECRET fehlen oder sind Platzhalter — kein Live-Aufruf",
        },
        "tiktok",
      ),
    );
  }

  if (isUsableCredential(tiktokToken)) {
    const probe = await fetchJson(
      `${TIKTOK_BASE}/user/info/?fields=display_name`,
      { headers: { authorization: `Bearer ${tiktokToken.trim()}` } },
      fetchImpl,
      timeoutMs,
      logger,
    );
    results.push(withProvider(evaluateTikTokTokenProbe(probe.status, probe.body), "tiktok"));
  } else {
    results.push(
      withProvider(
        {
          name: "TikTok Access-Token",
          severity: "skip",
          detail: "TIKTOK_ACCESS_TOKEN fehlt — lesende Profilpruefung nicht moeglich",
        },
        "tiktok",
      ),
    );
  }

  // --- Meta / Instagram ---
  const metaToken = env.META_ACCESS_TOKEN;
  const metaAppId = env.META_APP_ID;
  const metaSecret = env.META_APP_SECRET;

  if (isUsableCredential(metaToken)) {
    const probe = await fetchJson(
      `${GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(metaToken.trim())}`,
      {},
      fetchImpl,
      timeoutMs,
      logger,
    );
    results.push(withProvider(evaluateMetaTokenProbe(probe.status, probe.body), "meta"));
  } else if (isUsableCredential(metaAppId) && isUsableCredential(metaSecret)) {
    // Ohne Nutzer-Token bleibt die App-Identitaet: Graph /{app-id} mit
    // app_id|app_secret ist die einzige lesende Pruefung ohne Login.
    const appToken = `${metaAppId.trim()}|${metaSecret.trim()}`;
    const probe = await fetchJson(
      `${GRAPH_BASE}/${encodeURIComponent(metaAppId.trim())}?access_token=${encodeURIComponent(appToken)}`,
      {},
      fetchImpl,
      timeoutMs,
      logger,
    );
    results.push(withProvider(evaluateMetaAppProbe(probe.status, probe.body), "meta"));
  } else {
    results.push(
      withProvider(
        {
          name: "Meta-Credentials",
          severity: "skip",
          detail: "META_ACCESS_TOKEN bzw. META_APP_ID/SECRET fehlen — kein Live-Aufruf",
        },
        "meta",
      ),
    );
  }

  const summary = summarizeProbes(results);
  const overall = computeProbeOverall(results);

  return {
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    domain,
    results,
    summary,
    overall,
    fromCache: false,
  };
}

// ---------------------------------------------------------------------------
// Cache (prozesslokal)
// ---------------------------------------------------------------------------

type CacheEntry = { report: LiveProbeReport; expiresAt: number };
let cache: CacheEntry | null = null;

/** Setzt den Cache zurueck; `force` erzwingt damit einen frischen Live-Lauf. */
export function resetLiveProbeCache(): void {
  cache = null;
}

/**
 * Wie `collectLiveProbes`, aber mit TTL-Cache. Der Cache ist bewusst
 * prozesslokal: zwei Render-Instanzen duerfen unterschiedlich alt sein,
 * aber keine Anfrage darf die Provider-Quota sprengen.
 */
export async function getLiveProbes(
  options: LiveProbeOptions & { maxAgeMs?: number; force?: boolean } = {},
): Promise<LiveProbeReport> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_PROBE_TTL_MS;
  const now = Date.now();
  if (!options.force && cache && cache.expiresAt > now) {
    return { ...cache.report, fromCache: true };
  }
  const report = await collectLiveProbes(options);
  cache = { report, expiresAt: now + Math.max(0, maxAgeMs) };
  return report;
}
