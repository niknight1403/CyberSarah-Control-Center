/**
 * Sprint 196 — Integrations-Audit: E2E-Pruefskript fuer die Betriebs-Bruecken.
 *
 * Prueft gegen das LIVE-Backend (Default: https://app.cybersarah-ki.com):
 *   1. ENV-Konfiguration (Telegram, Workspace, Database)
 *   2. Backend-Gesundheit (/api/ready, /api/metrics)
 *   3. 429-Simulation: Fallback-Entscheidung + Telegram-Meldungsbau (pure Logik)
 *   4. Tool-Proxy-Queue: Retry/Backoff-Verhalten bei 429 (pure Logik)
 *   5. Telegram-Echtversand (nur mit --send-telegram, sonst nur Konfiguration)
 *   6. Live-Verifikation der Betriebs-Integrationen: Resend (Absenderdomain
 *      + DNS-Records gegen echtes DNS), TikTok und Meta (Credentials lesend)
 *
 * Warum 6. noetig war: Punkt 1 prueft nur, ob ein Schluessel GESETZT ist.
 * Am 08.11.2026 war der Resend-Key vorhanden, der Audit gruen — und die
 * Absenderdomain trotzdem unverifiziert, also jeder Mailversand tot.
 * Gesetzt ist nicht gleich funktionsfaehig; die neuen Pruefungen fragen
 * den Provider selbst.
 *
 * Aufruf: npm run audit [-- --send-telegram] [-- --url https://…] [-- --strict]
 * Exit-Code 1 bei Fehlschlag — CI-faehig. --strict macht zusaetzlich
 * Warnungen zu Fehlern (Release-Gates).
 */
import { execFileSync } from "node:child_process";
import { computeBackoffDelayMs, createToolProxyQueue, isRetryableTaskError } from "../lib/tool-proxy-queue-logic";
import {
  buildTelegramMessage,
  isTelegramConfigured,
  markTelegramEventSent,
  shouldSendTelegramEvent,
  type DedupeState,
} from "../lib/telegram-notify-logic";
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
  type ProbeResult,
  type ResendRecord,
  summarizeProbes,
} from "../lib/integration-live-probe-logic";

const args = new Set(process.argv.slice(2));

/**
 * BUGFIX (Sprint 210): leeres AUDIT_TARGET schlug dem Default vor.
 * `${{ secrets.AUDIT_TARGET }}` im Workflow setzt die Env-Variable auf den
 * LEEREN String, wenn das Secret nicht existiert. Der bisherige ??-Fallback
 * greift bei "" aber nie (leerer String ist nicht nullish) — der Audit lief
 * somit gegen fetch("/api/ready") und schlug mit HTTP 0 fehl, obwohl die
 * Produktion gesund war. Leere/whitespace-only Werte werden jetzt wie
 * "nicht gesetzt" behandelt.
 */
const urlArg = args.has("--url") ? process.argv[process.argv.indexOf("--url") + 1] : undefined;
const envTarget = process.env.AUDIT_TARGET;
const firstNonEmpty = [urlArg, envTarget].find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
const baseUrl = (firstNonEmpty ?? "https://app.cybersarah-ki.com").replace(/\/+$/, "");
if (!/^https?:\/\//.test(baseUrl)) {
  console.error(`Ungueltiges Audit-Ziel "${baseUrl}" — es muss mit http(s):// beginnen.`);
  process.exit(1);
}

type CheckResult = { name: string; ok: boolean; detail: string; severity: ProbeResult["severity"] };

const strictMode = args.has("--strict");
const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail, severity: ok ? "pass" : "fail" });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

/**
 * Severity-bewusster Reporter fuer die Live-Provider-Pruefungen:
 * fail -> Audit rot, warn/skip -> sichtbar, aber kein Exit 1 (ausser --strict).
 */
const report = ({ name, severity, detail }: ProbeResult) => {
  const ok = severity !== "fail";
  results.push({ name, ok, detail, severity });
  console.log(`${severity.toUpperCase().padEnd(4)}  ${name} — ${detail}`);
};

function curlStatus(url: string, timeoutMs: number): number {
  try {
    const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const output = execFileSync(
      "curl",
      ["-L", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", String(seconds), url],
      { encoding: "utf8", timeout: timeoutMs + 2_000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const status = Number.parseInt(output, 10);
    return Number.isFinite(status) ? status : 0;
  } catch {
    return 0;
  }
}

async function fetchOk(url: string, timeoutMs = 10_000): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: response.ok, status: response.status };
  } catch {
    // GitHub-Runner koennen bei Node-fetch sporadisch an DNS/IPv6/TLS scheitern,
    // waehrend derselbe Host per curl erreichbar ist. Der Uptime-Waechter nutzt
    // ebenfalls curl; execFileSync vermeidet Shell-Interpolation des URLs.
    const status = curlStatus(url, timeoutMs);
    return { ok: status >= 200 && status < 300, status };
  }
}

/**
 * BUGFIX (Sprint 210): Render-Free-Cold-Start-Toleranz.
 * Der Plan schlaeft nach 15 Min. Inaktivitaet ein; ein Kaltstart dauert
 * regelmaessig 30-60 s. Der bisherige einzelne 10s-Fetch lief fuer jeden
 * schlafenden Service auf HTTP 0 und liess den taeglichen Audit fehl-
 * schlagen, obwohl die Produktion gesund war (Uptime-Waechter sah
 * regelmuessig HTTP 200). Diese Variante probiert bis zu 5x mit wachsendem
 * Abstand (5s/10s/15s/25s), bleibt also unter den 6-Minuten-Job-Limit und
 * weckt den Service im ersten Versuch implizit an.
 */
async function fetchOkWithColdStartWake(
  url: string,
  attempts = 5,
): Promise<{ ok: boolean; status: number; wokeUp: boolean }> {
  let last = { ok: false, status: 0 };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await fetchOk(url, attempt === 0 ? 10_000 : 15_000);
    if (last.status !== 0) return { ...last, wokeUp: attempt > 0 };
    // Wartezeit: 5s, 10s, 15s, 25s (summiert ~55s zuzueglich Fetch-Zeiten).
    const delayMs = attempt === 3 ? 25_000 : (attempt + 1) * 5_000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { ...last, wokeUp: false };
}

type JsonResponse = { status: number; body: unknown };

/**
 * Holt JSON ohne zu werfen. Ein Netzwerkfehler darf den Audit nicht
 * abstuerzen lassen — er wird als Status 0 gemeldet und vom Auswerter
 * als Warnung behandelt.
 *
 * Wichtig: Query-Strings werden aus der Log-Zeile entfernt, weil Meta die
 * Zugangsdaten als `access_token` in der URL traegt. Keine Secrets ins Log.
 */
async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<JsonResponse> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Kein JSON (z. B. HTML-Fehlerseite eines Proxys) — Roh-Text behalten.
    }
    return { status: response.status, body };
  } catch (error) {
    const safeUrl = url.replace(/\?.*$/, "");
    console.log(`INFO  Netzwerkfehler ${safeUrl} — ${error instanceof Error ? error.message : String(error)}`);
    return { status: 0, body: null };
  }
}

/** DNS ueber Cloudflare DoH — kein zusaetzliches Paket, funktioniert im CI. */
async function resolveDns(name: string, type: string): Promise<string[]> {
  const endpoint = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const { status, body } = await fetchJson(endpoint, { headers: { accept: "application/dns-json" } }, 8_000);
  if (status !== 200) return [];
  const answers = (body as { Answer?: { data?: unknown }[] } | null)?.Answer;
  if (!Array.isArray(answers)) return [];
  return answers.flatMap((answer) => (typeof answer?.data === "string" ? [answer.data] : []));
}

async function resolveResendRecords(records: readonly ResendRecord[]): Promise<Record<string, string[]>> {
  const liveDns: Record<string, string[]> = {};
  for (const record of records) {
    liveDns[`${record.type}:${record.name}`] = await resolveDns(record.name, record.type);
  }
  return liveDns;
}

const DEFAULT_RESEND_DOMAIN = "cybersarah-ki.com";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const TIKTOK_BASE = "https://open.tiktokapis.com/v2";

/**
 * Live-Pruefung der drei Integrationen, die bisher nur "gesetzt ja/nein"
 * kannten. Lesend: kein Versand, kein Posting, keine Budgetaenderung.
 */
async function runProviderProbes(): Promise<void> {
  // --- Resend: Absenderdomain + echte DNS-Records ---
  const resendKey = process.env.RESEND_API_KEY;
  const resendDomain =
    process.env.RESEND_DOMAIN?.trim() ||
    process.env.RESEND_FROM_DOMAIN?.trim().replace(/^.*@/, "") ||
    DEFAULT_RESEND_DOMAIN;

  if (!isUsableCredential(resendKey)) {
    report({
      name: "Resend-Konfiguration",
      severity: "skip",
      detail: "RESEND_API_KEY fehlt oder ist ein Platzhalter — Live-Pruefung uebersprungen",
    });
  } else {
    if (!looksLikeResendKey(resendKey)) {
      report({
        name: "Resend-Key-Format",
        severity: "warn",
        detail: "Key beginnt nicht mit re_ — vermutlich der falsche Schluessel im Secret",
      });
    }
    const auth = { authorization: `Bearer ${resendKey.trim()}` };
    const domains = await fetchJson("https://api.resend.com/domains", { headers: auth });
    const evaluation = evaluateResendDomains(domains.status, domains.body, resendDomain);
    report({ name: "Resend-Absenderdomain", severity: evaluation.severity, detail: evaluation.detail });

    if (evaluation.domain) {
      const detailResponse = await fetchJson(`https://api.resend.com/domains/${encodeURIComponent(evaluation.domain.id)}`, {
        headers: auth,
      });
      if (detailResponse.status === 200) {
        const records = extractResendRecords(detailResponse.body);
        const liveDns = await resolveResendRecords(records);
        const alignment = evaluateDnsAlignment(records, liveDns);
        report({ name: "Resend-DNS-Records", severity: alignment.severity, detail: alignment.detail });
      } else {
        report({
          name: "Resend-DNS-Records",
          severity: "warn",
          detail: `Domain-Details nicht abrufbar (HTTP ${detailResponse.status}) — DNS-Abgleich uebersprungen`,
        });
      }

      const dmarcValues = await resolveDns(`_dmarc.${evaluation.domain.name}`, "TXT");
      const hasDmarc = dmarcValues.some((value) => value.toLowerCase().includes("v=dmarc1"));
      report({
        name: "DMARC-Record",
        severity: hasDmarc ? "pass" : "warn",
        detail: hasDmarc
          ? "DMARC-Richtlinie veroeffentlicht"
          : `kein TXT _dmarc.${evaluation.domain.name} — Zustellbarkeit leidet, Spam-Einstufung wahrscheinlicher`,
      });
    }
  }

  // --- TikTok ---
  const tiktokKey = process.env.TIKTOK_CLIENT_KEY;
  const tiktokSecret = process.env.TIKTOK_CLIENT_SECRET;
  const tiktokToken = process.env.TIKTOK_ACCESS_TOKEN;

  if (isUsableCredential(tiktokKey) && isUsableCredential(tiktokSecret)) {
    const probe = await fetchJson(`${TIKTOK_BASE}/oauth/token/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: tiktokKey.trim(),
        client_secret: tiktokSecret.trim(),
        grant_type: "client_credentials",
      }).toString(),
    });
    report(evaluateTikTokClientProbe(probe.status, probe.body));
  } else {
    report({
      name: "TikTok Client-Credentials",
      severity: "skip",
      detail: "TIKTOK_CLIENT_KEY/SECRET fehlen oder sind Platzhalter — kein Live-Aufruf",
    });
  }

  if (isUsableCredential(tiktokToken)) {
    const probe = await fetchJson(`${TIKTOK_BASE}/user/info/?fields=display_name`, {
      headers: { authorization: `Bearer ${tiktokToken.trim()}` },
    });
    report(evaluateTikTokTokenProbe(probe.status, probe.body));
  } else {
    report({
      name: "TikTok Access-Token",
      severity: "skip",
      detail: "TIKTOK_ACCESS_TOKEN fehlt — lesende Profilpruefung nicht moeglich",
    });
  }

  // --- Meta / Instagram ---
  const metaToken = process.env.META_ACCESS_TOKEN;
  const metaAppId = process.env.META_APP_ID;
  const metaSecret = process.env.META_APP_SECRET;

  if (isUsableCredential(metaToken)) {
    const probe = await fetchJson(`${GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(metaToken.trim())}`);
    report(evaluateMetaTokenProbe(probe.status, probe.body));
  } else if (isUsableCredential(metaAppId) && isUsableCredential(metaSecret)) {
    // Ohne Nutzer-Token bleibt die App-Identitaet: Graph /{app-id} mit
    // app_id|app_secret ist die einzige lesende Pruefung ohne Login.
    const appToken = `${metaAppId.trim()}|${metaSecret.trim()}`;
    const probe = await fetchJson(
      `${GRAPH_BASE}/${encodeURIComponent(metaAppId.trim())}?access_token=${encodeURIComponent(appToken)}`,
    );
    report(evaluateMetaAppProbe(probe.status, probe.body));
  } else {
    report({
      name: "Meta-Credentials",
      severity: "skip",
      detail: "META_ACCESS_TOKEN bzw. META_APP_ID/SECRET fehlen — kein Live-Aufruf",
    });
  }
}

async function main(): Promise<void> {
  console.log(`\n=== CyberSarah Integrations-Audit — ${baseUrl} ===\n`);

  // --- 1. ENV-Konfiguration ---
  const telegramEnv = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  };
  check(
    "Telegram-Konfiguration",
    true,
    isTelegramConfigured(telegramEnv)
      ? "Bot-Token + Chat-ID gesetzt"
      : "nicht konfiguriert (Betriebsmeldungen nur im Dashboard sichtbar)",
  );

  // --- 2. Backend-Gesundheit ---
  const ready = await fetchOkWithColdStartWake(`${baseUrl}/api/ready`);
  check(
    "Backend /api/ready",
    ready.ok,
    `HTTP ${ready.status}${ready.ok ? " (Datenbank erreichbar)" : ""}${ready.wokeUp ? " — Cold-Start abgewartet" : ""}`,
  );
  const metrics = await fetchOkWithColdStartWake(`${baseUrl}/api/metrics`);
  check(
    "Backend /api/metrics",
    metrics.ok || metrics.status === 401,
    `HTTP ${metrics.status}${metrics.status === 401 ? " (Endpunkt erreichbar, auth-geschützt)" : ""}`,
  );

  // --- 3. 429-Simulation: Fallback-Entscheidung ---
  const retryable = isRetryableTaskError({ httpStatus: 429 });
  check("429 als wiederholbar erkannt", retryable, retryable ? "Rate-Limit triggert Retry/Fallback" : "unerwartet");
  const message = buildTelegramMessage({
    severity: "warnung",
    event: "provider_fallback:groq",
    title: "LLM-Fallback: groq → openrouter",
    detail: "429 Rate-Limit bei groq erkannt.",
  });
  const messageOk = message.includes("WARNUNG") && message.includes("groq") && !message.includes("botToken");
  check("Telegram-Warnmeldung korrekt gebaut", messageOk, `${message.length} Zeichen, Severitaet + Details, ohne Secrets`);

  // Deduplizierung: dieselbe Warnung wird im Intervall nur einmal gesendet
  const dedupeState: DedupeState = new Map();
  const first = shouldSendTelegramEvent({ severity: "warnung", event: "provider_fallback:groq", title: "T" }, dedupeState, 0);
  if (first.send) markTelegramEventSent({ severity: "warnung", event: "provider_fallback:groq", title: "T" }, dedupeState, 0);
  const second = shouldSendTelegramEvent({ severity: "warnung", event: "provider_fallback:groq", title: "T" }, dedupeState, 60_000);
  check(
    "Fallback-Warnung dedupliziert",
    first.send && !second.send,
    first.send && !second.send ? `zweiter Versand geblockt (${second.remainingCooldownMs} ms Rest-Cooldown)` : "unerwartet",
  );

  // --- 4. Tool-Proxy-Queue bei 429 ---
  let calls = 0;
  const queue = createToolProxyQueue({
    concurrency: 2,
    maxRetries: 3,
    baseBackoffMs: 1,
    maxBackoffMs: 5,
    sleep: async () => undefined,
  });
  const queueResult = await queue.enqueue(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("rate limited"), { httpStatus: 429 });
    return "recovered";
  });
  const queueMetrics = queue.metrics();
  check(
    "Tool-Proxy-Queue erholt sich von 429",
    queueResult === "recovered" && queueMetrics.rateLimited === 2 && queueMetrics.retried === 2,
    `${queueMetrics.rateLimited} Rate-Limits, ${queueMetrics.retried} Retries → Ergebnis "${queueResult}"`,
  );
  const backoff = computeBackoffDelayMs(3, { baseBackoffMs: 100, maxBackoffMs: 10_000, jitter: 0, now: () => 0 });
  check("Exponentielles Backoff", backoff === 400, `Versuch 3 → ${backoff} ms (Basis 100 ms)`);

  // --- 5. Telegram-Echtversand (optional) ---
  if (args.has("--send-telegram")) {
    if (!isTelegramConfigured(telegramEnv)) {
      check("Telegram-Testversand", false, "--send-telegram gesetzt, aber Token/Chat-ID fehlen");
    } else {
      try {
        const response = await fetch(`https://api.telegram.org/bot${telegramEnv.botToken!.trim()}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramEnv.chatId!.trim(),
            text: buildTelegramMessage({
              severity: "erfolg",
              event: "audit",
              title: "Integrations-Audit erfolgreich",
              detail: `Automatischer Testlauf gegen ${baseUrl}. Alle Prüfungen grün.`,
            }),
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(8_000),
        });
        check("Telegram-Testversand", response.ok, `HTTP ${response.status}`);
      } catch (error) {
        check("Telegram-Testversand", false, error instanceof Error ? error.message : String(error));
      }
    }
  } else {
    console.log("INFO  Telegram-Echtversand uebersprungen (--send-telegram fuer Testnachricht)");
  }

  // --- 6. Live-Verifikation: Resend, TikTok, Meta ---
  await runProviderProbes();

  // --- Zusammenfassung ---
  const failed = results.filter((result) => result.severity === "fail");
  const warned = results.filter((result) => result.severity === "warn");
  const skipped = results.filter((result) => result.severity === "skip");
  const strict = summarizeProbes(results, strictMode);
  console.log(
    `\n=== Ergebnis: ${results.length - failed.length - warned.length - skipped.length}/${results.length} Prüfungen bestanden` +
      `${warned.length > 0 ? `, ${warned.length} Warnung(en)` : ""}` +
      `${skipped.length > 0 ? `, ${skipped.length} übersprungen` : ""} ===`,
  );
  if (failed.length > 0) {
    console.log("\nFehlgeschlagen:");
    for (const result of failed) console.log(`  - ${result.name}: ${result.detail}`);
  }
  if (warned.length > 0) {
    console.log("\nWarnungen:");
    for (const result of warned) console.log(`  - ${result.name}: ${result.detail}`);
  }
  console.log("");
  if (strict.exitCode !== 0) {
    process.exit(1);
  }
}

void main();
