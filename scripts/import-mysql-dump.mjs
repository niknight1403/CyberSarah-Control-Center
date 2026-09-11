#!/usr/bin/env node
/**
 * Hetzner-Exit Phase 3 — MySQL-Dump → Neon (PostgreSQL) Import.
 *
 * Liest einen mysqldump der Produktiv-DB (Tabellen users, billingSubscriptions,
 * chatMessages, modelRouterSettings), konvertiert die Datensaetze in das
 * Drizzle/PostgreSQL-Schema und schreibt sie per SQL-over-HTTPS in die
 * DATABASE_URL (Neon). Laeuft damit auch aus HTTPS-only-Umgebungen (Sandbox,
 * CI) ohne direkten TCP-5432-Zugriff.
 *
 * Nutzung:
 *   node scripts/import-mysql-dump.mjs <dump.sql> [--dry-run]
 *
 * Eigenschaften:
 *  - Idempotent: ON CONFLICT DO NOTHING, wiederholter Lauf ist sicher.
 *  - Spalten werden case-insensitive gemappt (snake_case und camelCase).
 *  - tinyint(1)-Werte 0/1 werden zu boolean, Rollen werden validiert.
 *  - Gegenpruefung: Zeilenzahl pro Tabelle Dump vs. DB am Ende.
 *
 * Handoff-Kommando auf dem VPS (erzeugt den Dump):
 *   siehe docs/HETZNER-EXIT.md, Phase 3.
 */

import { readFileSync } from "node:fs";
import { argv, env, exit } from "node:process";
import { neon } from "@neondatabase/serverless";

const args = argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dumpPath = args.find((a) => !a.startsWith("--"));
if (!dumpPath) {
  console.error("Verwendung: node scripts/import-mysql-dump.mjs <dump.sql> [--dry-run]");
  exit(1);
}

const databaseUrl = env.DATABASE_URL || "";
if (!/^postgresql:\/\//.test(databaseUrl)) {
  console.error("[import] DATABASE_URL muss ein postgresql://-String sein (Neon).");
  exit(1);
}

// -- Zielschema (Spalten je Tabelle, mit Typinfo fuer die Konvertierung) ----
const TARGET = {
  users: {
    cols: ["id", "openId", "name", "email", "loginMethod", "passwordHash",
           "stripeCustomerId", "role", "createdAt", "updatedAt", "lastSignedIn"],
    bools: [],
  },
  billingSubscriptions: {
    cols: ["id", "userId", "stripeCustomerId", "stripeSubscriptionId",
           "stripePriceId", "status", "cancelAtPeriodEnd", "currentPeriodEnd",
           "createdAt", "updatedAt"],
    bools: ["cancelAtPeriodEnd"],
  },
  chatMessages: {
    cols: ["id", "userOpenId", "sessionId", "role", "content", "provider", "createdAt"],
    bools: [],
  },
  modelRouterSettings: {
    cols: ["key", "value", "updatedAt"],
    bools: [],
    jsonb: ["value"],
  },
};

// -- MySQL-Snak_case → camelCase, case-insensitive --------------------------
const CANON = new Map();
for (const [table, { cols }] of Object.entries(TARGET)) {
  for (const c of cols) {
    CANON.set(`${table}:${c.toLowerCase()}`, c);
    CANON.set(`${table}:${c.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()}`, c);
  }
}
const canonCol = (table, raw) =>
  CANON.get(`${table}:${raw.replace(/`/g, "").toLowerCase()}`) || null;

// -- Dump parsen -------------------------------------------------------------
function stripNoise(sql) {
  return sql
    .replace(/\/\*![0-9]{5}[^*]*(\*+([^/*][^*]*\*+)*)*\//g, "") // /*!...*/ conditional comments
    .replace(/^--.*$/gm, "")
    .replace(/^\/\*.*\*\/$/gm, "");
}

function parseValues(str, pos) {
  // Liest eine (...) Werteliste ab pos, gibt { values, end } zurueck.
  const values = [];
  let i = pos;
  const n = str.length;
  const skipWs = () => { while (i < n && /\s/.test(str[i])) i++; };
  skipWs();
  if (str[i] !== "(") throw new Error(`Werteeliste erwartet an Position ${i}`);
  i++;
  for (;;) {
    skipWs();
    if (str[i] === ")") { i++; break; }
    if (str[i] === "'") {
      // String mit MySQL-Escapes
      let v = "";
      i++;
      for (;;) {
        const c = str[i];
        if (c === "\\") {
          const e = str[i + 1];
          const map = { "0": "\0", n: "\n", r: "\r", t: "\t", b: "\b", Z: "\x1a" };
          v += map[e] !== undefined ? map[e] : e;
          i += 2;
        } else if (c === "'") {
          if (str[i + 1] === "'") { v += "'"; i += 2; }
          else { i++; break; }
        } else if (c === undefined) throw new Error("Nicht terminierter String im Dump");
        else { v += c; i++; }
      }
      values.push(v);
    } else if (/^-?\d/.test(str.slice(i, i + 2))) {
      const m = /^-?\d+(\.\d+)?([eE][-+]?\d+)?/.exec(str.slice(i));
      values.push(m[0]);
      i += m[0].length;
    } else if (str.startsWith("0x", i)) {
      const m = /^0x[0-9a-fA-F]*/.exec(str.slice(i));
      values.push(Buffer.from(m[0].slice(2), "hex").toString("utf8"));
      i += m[0].length;
    } else if (str.startsWith("NULL", i)) {
      values.push(null);
      i += 4;
    } else {
      throw new Error(`Unerwartetes Token an Position ${i}: ${str.slice(i, i + 20)}`);
    }
    // naechster Wert oder Ende der Klammer
    skipWs();
    if (str[i] === ",") { i++; continue; }
    if (str[i] === ")") { i++; break; }
    throw new Error(`', ' oder ')' erwartet an Position ${i}`);
  }
  return { values, end: i };
}

function parseDump(sqlRaw) {
  const sql = stripNoise(sqlRaw);
  const rows = { users: [], billingSubscriptions: [], chatMessages: [], modelRouterSettings: [] };
  const colOrder = {};
  const insertRe = /INSERT\s+INTO\s+`?(\w+)`?\s*(\([^)]*\))?\s*VALUES\s*/gi;
  let m;
  while ((m = insertRe.exec(sql)) !== null) {
    const table = m[1];
    if (!TARGET[table]) continue;
    if (m[2] && !colOrder[table]) {
      colOrder[table] = m[2]
        .replace(/[()`]/g, "")
        .split(",")
        .map((c) => canonCol(table, c.trim()))
        .filter(Boolean);
    }
    let pos = m.index + m[0].length;
    for (;;) {
      const { values, end } = parseValues(sql, pos);
      const cols = colOrder[table] || TARGET[table].cols;
      const rec = {};
      cols.forEach((c, idx) => { rec[c] = values[idx] !== undefined ? values[idx] : null; });
      rows[table].push(rec);
      pos = end;
      while (pos < sql.length && /\s/.test(sql[pos])) pos++;
      if (sql[pos] === ",") { pos++; continue; }
      if (sql[pos] === ";") { pos++; break; }
      break;
    }
    insertRe.lastIndex = pos;
  }
  return { rows, colOrder };
}

// -- Konvertierung je Spalte ---------------------------------------------------
function convert(table, rec) {
  const out = { ...rec };
  for (const b of TARGET[table].bools) {
    if (out[b] !== null && out[b] !== undefined) {
      out[b] = out[b] === "1" || out[b] === "true" || out[b] === 1 || out[b] === true;
    }
  }
  if (table === "users" && out.role !== null) {
    out.role = String(out.role).toLowerCase() === "admin" ? "admin" : "user";
  }
  if (table === "chatMessages" && out.role !== null && out.role !== undefined) {
    out.role = String(out.role); // 'user' | 'assistant' | 'system' — Rohwert
  }
  // NOT-NULL-Spalten, die in aelteren MySQL-Schemata fehlen koennen: Defaults setzen.
  const now = new Date().toISOString();
  const defaults = {
    users: { role: "user", createdAt: now, updatedAt: now, lastSignedIn: now },
    billingSubscriptions: { createdAt: now, updatedAt: now },
    chatMessages: { role: "user", createdAt: now },
    modelRouterSettings: { updatedAt: now },
  };
  for (const [k, v] of Object.entries(defaults[table] || {})) {
    if (out[k] === null || out[k] === undefined) out[k] = v;
  }
  return out;
}

// -- Import --------------------------------------------------------------------
const sql = neon(databaseUrl);

async function counts() {
  const r = await sql.query(
    `SELECT 'users' t, count(*)::int n FROM users
     UNION ALL SELECT 'billingSubscriptions', count(*)::int FROM "billingSubscriptions"
     UNION ALL SELECT 'chatMessages', count(*)::int FROM "chatMessages"
     UNION ALL SELECT 'modelRouterSettings', count(*)::int FROM "modelRouterSettings"`
  );
  return Object.fromEntries(r.map((x) => [x.t, x.n]));
}

async function importTable(table, records) {
  if (!records.length) { console.log(`[import] ${table}: 0 Datensaetze — uebersprungen.`); return 0; }
  const cols = TARGET[table].cols.filter((c) => records.some((r) => c in r));
  const jsonb = new Set(TARGET[table].jsonb || []);
  const BATCH = 50;
  let inserted = 0;
  for (let off = 0; off < records.length; off += BATCH) {
    const batch = records.slice(off, off + BATCH);
    const params = [];
    const tuples = batch.map((rec) => {
      const vals = cols.map((c) => {
        const v = rec[c] === undefined ? null : rec[c];
        params.push(v);
        return `$${params.length}`;
      });
      return `(${vals.join(",")})`;
    });
    const casts = jsonb.has("value") && cols.includes("value")
      ? `, value = EXCLUDED.value` : "";
    const text =
      `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES ${tuples.join(",")} ` +
      `ON CONFLICT DO NOTHING`;
    await sql.query(text, params);
  }
  console.log(`[import] ${table}: ${records.length} Datensaetze verarbeitet (verbindliche Zahl folgt aus der Gegenpruefung).`);
  return records.length;
}

// -- Main ----------------------------------------------------------------------
console.log(`[import] Lese ${dumpPath} …`);
const dump = readFileSync(dumpPath, "utf8");
const { rows, colOrder } = parseDump(dump);
const expected = Object.fromEntries(Object.entries(rows).map(([t, r]) => [t, r.length]));
console.log("[import] Dump-Analyse:", JSON.stringify(expected),
  colOrder.users ? `Spaltenreihenfolge aus Dump: users=${colOrder.users.join(",")}` : "");

if (DRY_RUN) {
  console.log("[import] DRY-RUN — keine Schreiboperationen.");
  exit(0);
}

const before = await counts();
console.log("[import] Neon vorher:", JSON.stringify(before));
let total = 0;
for (const table of Object.keys(TARGET)) {
  total += await importTable(table, rows[table].map((r) => convert(table, r)));
}
const after = await counts();
console.log("[import] Neon nachher:", JSON.stringify(after));

let ok = true;
for (const [t, n] of Object.entries(expected)) {
  const imported = (after[t] ?? 0) - (before[t] ?? 0);
  const match = imported + (before[t] ?? 0) >= n; // Idempotenz: Ziel >= Erwartung
  console.log(`[import] ${t}: erwartet ${n}, neu importiert ${imported}, gesamt ${after[t]}.`);
  if (!match && n > 0) ok = false;
}
console.log(ok
  ? "[import] Gegenpruefung bestanden — Migration abgeschlossen."
  : "[import] WARNUNG: Zeilenzahlen weichen ab — bitte Logs pruefen.");
exit(ok ? 0 : 2);
