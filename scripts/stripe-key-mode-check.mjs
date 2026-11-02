/**
 * Read-only Modus-Pruefung fuer Stripe-Schluessel.
 *
 * Listet pro Secret-Namen nur LIVE / TEST / INVALID / NOT_CONFIGURED.
 * Es wird nichts erstellt, nichts belastet und kein Schluessel ausgegeben.
 * Aufruf: node scripts/stripe-key-mode-check.mjs STRIPE_SECRET_KEY STRIPE_SECRET_KEY_2
 */
const names = process.argv.slice(2);
if (names.length === 0) {
  console.log("Aufruf: node scripts/stripe-key-mode-check.mjs <SECRET_NAME> [...]");
  process.exit(2);
}
let exitCode = 0;
for (const name of names) {
  const key = (process.env[name] ?? "").trim();
  if (!key) {
    console.log(`${name}: NOT_CONFIGURED`);
    continue;
  }
  try {
    const res = await fetch("https://api.stripe.com/v1/customers?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.log(`${name}: INVALID (HTTP ${res.status})`);
      exitCode = 1;
      continue;
    }
    const body = await res.json();
    const mode = body.livemode === true ? "LIVE" : "TEST";
    console.log(`${name}: ${mode}`);
  } catch (error) {
    console.log(`${name}: CONNECTION_ERROR (${error?.message ?? "unbekannt"})`);
    exitCode = 1;
  }
}
process.exit(exitCode);
