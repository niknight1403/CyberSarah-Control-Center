/**
 * Quota-Diagnose (schreibgeschützt) — Neon-503-Ursachenanalyse.
 *
 * Kontext: /api/ready liefert HTTP 503 (database:false), Render-Logs zeigen
 * "Your account or project has exceeded the quota". Dieser Modus klärt,
 * WELCHES Limit ueberschritten ist (Storage vs. Compute-Stunden vs. Auth),
 * ohne selbst zu schreiben: nur Verbindungs- und Lese-Tests plus Großen-
 * Bericht. Wichtig: Verbindungsfehler werden mit VOLLER Meldung ausgegeben
 * (ohne Credentials — nur Fehlercode/-text), sonst bleibt die Ursache raten.
 */
import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('DATABASE_URL fehlt — Diagnose nicht moeglich.');
  process.exit(1);
}

// Host (ohne Credentials) fuer Kontext in der Ausgabe
const host = (() => {
  try { return new URL(url).hostname; } catch { return '(unlesbar)'; }
})();
console.log('Ziel-Host:', host);

const db = new Pool({
  connectionString: url,
  max: 1,
  connectionTimeoutMillis: 8000,
});

// 1) Kann ueberhaupt eine Verbindung aufgebaut werden?
let verbunden = false;
try {
  await db.query('SELECT 1');
  verbunden = true;
  console.log('1) VERBINDUNG: ok (SELECT 1 erfolgreich)');
} catch (error) {
  console.log('1) VERBINDUNG: FEHLER');
  console.log('   code:', error.code ?? '(kein Code)');
  console.log('   meldung:', String(error.message).slice(0, 400));
  await db.end().catch(() => {});
  process.exitCode = 2; // Verbindungslevel (Compute-Suspend, Auth, Netz) — kein Storage-Cleanup hilft hier
}

// 2) Lese-Test: Datenbankgroesse + groesste Tabellen (nur Lesezugriff)
if (verbunden) try {
  const size = await db.query(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS db_groesse,
            pg_database_size(current_database()) AS db_bytes`
  );
  console.log('2) DB-GROESSE:', size.rows[0].db_groesse, `(${size.rows[0].db_bytes} Bytes)`);
} catch (error) {
  console.log('2) DB-GROESSE: FEHLER —', String(error.message).slice(0, 400));
  console.log('   code:', error.code ?? '(kein Code)');
}

if (verbunden) try {
  const tables = await db.query(
    `SELECT relname AS tabelle,
            pg_size_pretty(pg_total_relation_size(relid)) AS groesse,
            pg_total_relation_size(relid) AS bytes,
            n_live_tup AS zeilen
       FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 15`
  );
  console.log('3) GROESSTE TABELLEN:');
  for (const t of tables.rows) {
    console.log(`   ${t.tabelle.padEnd(32)} ${String(t.groesse).padEnd(10)} ${t.zeilen} Zeilen`);
  }
} catch (error) {
  console.log('3) TABELLEN-REPORT: FEHLER —', String(error.message).slice(0, 400));
}

if (verbunden) // 3) Schreib-Test in einer sofort wieder verworfenen Transaktion
//    (ROLLBACK — es bleibt kein Zustand zurueck, aber die Quota-Antwort
//    des Servers wird sichtbar, genau wie bei echten App-Schreibvorgaengen.)
try {
  await db.query('BEGIN');
  await db.query("CREATE TEMP TABLE _quota_probe (x int)");
  await db.query('INSERT INTO _quota_probe VALUES (1)');
  await db.query('ROLLBACK');
  console.log('4) SCHREIB-TEST (temp, mit ROLLBACK): ok');
} catch (error) {
  console.log('4) SCHREIB-TEST: FEHLER —', String(error.message).slice(0, 400));
  console.log('   code:', error.code ?? '(kein Code)');
}

if (verbunden) await db.end().catch(() => {});
console.log('Quota-Diagnose abgeschlossen.');
