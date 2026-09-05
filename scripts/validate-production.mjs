import "dotenv/config";
import mysql from "mysql2/promise";

const failures = [];
const required = [
  "APP_BASE_URL",
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_MODE",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
];

for (const name of required) {
  if (!process.env[name]?.trim()) failures.push(`${name} fehlt`);
}

const appBaseUrl = process.env.APP_BASE_URL?.trim() ?? "";
if (appBaseUrl && !appBaseUrl.startsWith("https://")) failures.push("APP_BASE_URL muss HTTPS verwenden");
if ((process.env.JWT_SECRET?.length ?? 0) < 32) failures.push("JWT_SECRET muss mindestens 32 Zeichen lang sein");
const stripeMode = process.env.STRIPE_MODE?.trim();
const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
if (stripeMode === "live" && !stripeKey.startsWith("sk_live_")) failures.push("STRIPE_SECRET_KEY passt nicht zu STRIPE_MODE=live");
if (stripeMode === "test" && !stripeKey.startsWith("sk_test_")) failures.push("STRIPE_SECRET_KEY passt nicht zu STRIPE_MODE=test");
if (stripeMode !== "live" && stripeMode !== "test") failures.push("STRIPE_MODE muss live oder test sein");
if (process.env.STRIPE_PRICE_ID && !process.env.STRIPE_PRICE_ID.startsWith("price_")) failures.push("STRIPE_PRICE_ID ist ungültig");
if (process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) failures.push("STRIPE_WEBHOOK_SECRET ist ungültig");

if (failures.length > 0) {
  console.error("ENV-PRÜFUNG FEHLGESCHLAGEN:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

try {
  const response = await fetch(`${appBaseUrl.replace(/\/$/, "")}/api/health`, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body?.ok !== true) throw new Error("Antwort enthält nicht ok=true");
  console.log("OK: Health-Endpoint erreichbar");
} catch (error) {
  console.error(`FEHLER: Health-Endpoint nicht erreichbar (${error instanceof Error ? error.message : "unbekannt"})`);
  process.exitCode = 1;
}

try {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  await connection.query("SELECT 1 AS healthy");
  await connection.end();
  console.log("OK: MySQL-Datenbankverbindung und SELECT 1 erfolgreich");
} catch (error) {
  console.error(`FEHLER: Datenbankverbindung fehlgeschlagen (${error instanceof Error ? error.message : "unbekannt"})`);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Produktions-Validator erfolgreich abgeschlossen");
