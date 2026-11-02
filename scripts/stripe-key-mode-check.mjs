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
    // Praefix ist eindeutiger als ein fehlendes livemode-Feld: restricted Keys
    // liefern livemode nicht immer mit, dann sah die alte Fassung faelschlich TEST.
    const prefix = ["sk_test_", "rk_test_", "sk_live_", "rk_live_"].find((p) => key.startsWith(p)) ?? "unbekannt";
    const livemode = typeof body.livemode === "boolean" ? body.livemode : null;
    const mode = livemode === null ? (prefix.endsWith("_live_") ? "LIVE" : prefix.endsWith("_test_") ? "TEST" : "UNBEKANNT") : livemode ? "LIVE" : "TEST";
    console.log(`${name}: ${mode} (praefix=${prefix}, livemode=${String(livemode)})`);
  } catch (error) {
    console.log(`${name}: CONNECTION_ERROR (${error?.message ?? "unbekannt"})`);
    exitCode = 1;
  }
}
process.exit(exitCode);
