/**
 * Holt die Domainliste des Mailanbieters und bewertet die Absenderadresse.
 *
 * Ergebnis wird kurz zwischengespeichert: Readiness wird haeufig abgefragt, die
 * Domainliste aendert sich hoechstens beim Einrichten. Ein Fehler beim Abruf
 * wird nicht als "nicht verifiziert" verkauft, sondern als "ungeprueft".
 */
import { resolveResendConfig } from "../lib/email-logic";
import { evaluateEmailDomain, type EmailDomainCheck, type ProviderDomain } from "../lib/email-domain-logic";

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; value: EmailDomainCheck } | null = null;

async function fetchDomains(apiKey: string): Promise<ProviderDomain[] | null> {
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: Array<{ name?: string; status?: string }> };
    return (payload.data ?? [])
      .filter((entry): entry is { name: string; status: string } =>
        typeof entry?.name === "string" && typeof entry?.status === "string",
      )
      .map((entry) => ({ name: entry.name, status: entry.status }));
  } catch {
    return null;
  }
}

export async function checkEmailDomain(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): Promise<EmailDomainCheck> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;

  const config = resolveResendConfig(env);
  const apiKey = (env.RESEND_API_KEY ?? "").trim();
  const domains = config.configured && apiKey ? await fetchDomains(apiKey) : null;
  const value = evaluateEmailDomain({ fromAddress: config.from ?? null, domains });
  if (!config.configured && domains === null) {
    // Ohne Schluessel gibt es nichts abzufragen; das ist kein "ungeprueft".
    const unconfigured: EmailDomainCheck = {
      ...value,
      status: "unconfigured",
      hint: value.hint ?? "Mailversand ist nicht konfiguriert (RESEND_API_KEY / RESEND_FROM_EMAIL fehlen).",
    };
    cache = { at: now, value: unconfigured };
    return unconfigured;
  }
  cache = { at: now, value };
  return value;
}

/** Nur fuer Tests: Zwischenspeicher leeren. */
export function resetEmailDomainCache(): void {
  cache = null;
}
