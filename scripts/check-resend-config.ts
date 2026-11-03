/**
 * Prueft die Resend-Konfiguration, ohne eine Mail zu senden.
 *
 * Aufruf:  npx tsx scripts/check-resend-config.ts [absender@domain.tld]
 *
 * Gibt aus, welche Variablen gesetzt sind (nie die Werte), ob der Absender
 * plausibel ist und — wenn ein Schluessel vorhanden ist — welche Domains im
 * Resend-Konto verifiziert sind und ob die Absenderdomain dabei ist.
 *
 * Exitcode 1 heisst: so wuerde kein Versand funktionieren.
 */
import { resolveResendConfig } from "../lib/email-logic";

function maskPresence(value: string | null): string {
  if (!value) return "nicht gesetzt";
  return `gesetzt (${value.length} Zeichen)`;
}

async function listDomains(apiKey: string): Promise<{ name: string; status: string }[] | null> {
  const response = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) return null;
  if (!response.ok) {
    console.log(`  Resend /domains antwortet HTTP ${response.status} — Schluessel pruefen (Rechte: domains:read).`);
    return null;
  }
  const payload = (await response.json()) as { data?: { name?: string; status?: string }[] };
  return (payload.data ?? [])
    .filter((row) => Boolean(row.name))
    .map((row) => ({ name: String(row.name), status: String(row.status ?? "unbekannt") }));
}

async function main(): Promise<void> {
  const argFrom = process.argv[2]?.trim();
  const env = argFrom ? { ...process.env, RESEND_FROM_EMAIL: argFrom } : process.env;
  const config = resolveResendConfig(env as Record<string, string | undefined>);

  console.log("Resend-Konfiguration");
  console.log(`  RESEND_API_KEY:          ${maskPresence(config.apiKey)}`);
  console.log(`  Absenderadresse:         ${config.from ?? "nicht gesetzt"}`);
  console.log(`  Herkunft des Absenders:  ${config.fromSource ?? "—"}`);
  console.log(`  Versandbereit laut Code: ${config.configured ? "ja" : "nein"}`);

  if (config.issues.length > 0) {
    console.log("\nBefunde:");
    for (const issue of config.issues) console.log(`  · ${issue}`);
  }

  if (!config.apiKey) {
    console.log("\nNaechster Schritt: RESEND_API_KEY in Render setzen (Environment → Secret), dann erneut pruefen.");
    process.exit(1);
  }

  console.log("\nDomains im Resend-Konto:");
  const domains = await listDomains(config.apiKey);
  if (!domains) {
    console.log("  konnten nicht gelesen werden.");
    process.exit(1);
  }
  if (domains.length === 0) console.log("  keine Domain hinterlegt — Resend versendet dann nur an die eigene Kontoadresse.");

  const senderDomain = config.from?.split("@")[1]?.toLowerCase() ?? null;
  let senderVerified = false;
  for (const domain of domains) {
    const verified = domain.status.toLowerCase() === "verified";
    if (senderDomain && domain.name.toLowerCase() === senderDomain && verified) senderVerified = true;
    console.log(`  ${domain.name.padEnd(32)} ${domain.status}`);
  }

  if (!senderDomain) {
    process.exit(1);
  }
  if (!senderVerified) {
    console.log(
      `\nFAIL: Die Absenderdomain "${senderDomain}" ist im Resend-Konto nicht verifiziert. ` +
        "Resend lehnt den Versand sonst mit 403 ab. DNS-Eintraege (SPF/DKIM) im Resend-Dashboard eintragen.",
    );
    process.exit(1);
  }

  console.log(`\nOK: "${senderDomain}" ist verifiziert, ${config.from} ist als Absender verwendbar.`);
}

main().catch((error) => {
  console.error(`FAIL: ${(error as Error).message}`);
  process.exit(1);
});
