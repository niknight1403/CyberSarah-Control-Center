/**
 * Migrationen und Datenbankverbindung: reine Logik (ohne I/O), damit die
 * kniffligen Teile testbar sind.
 *
 * Zwei Fehlerquellen, die den Deploy blockiert haben:
 *
 * 1. TLS. `pg` ab 8.16 behandelt `sslmode=require` wie `verify-full`. Hängt die
 *    Datenbank an einer IP (hier die Oracle-VM), passt kein Zertifikat und die
 *    Verbindung bricht mit ERR_TLS_CERT_ALTNAME_INVALID ab. Deshalb wird der
 *    sslmode aus der URL entfernt und TLS explizit konfiguriert (verschlüsselt,
 *    ohne CA-Prüfung) — bewusste Entscheidung, dokumentiert statt versteckt.
 *
 * 2. Journal-Drift. `drizzle-kit migrate` vergleicht Hashes in
 *    `drizzle.__drizzle_migrations` mit den Dateien. Wurde das Schema per
 *    Push/Hand angelegt, fehlen die Hash-Zeilen, und migrate versucht alles
 *    erneut ("relation already exists"). Der Abgleich trägt fehlende Hashes
 *    nach, ohne Tabellen anzufassen.
 */
import { createHash } from "node:crypto";

export interface ConnectionParts {
  /** URL ohne sslmode-Parameter, direkt an pg weiterreichbar. */
  connectionString: string;
  /** Ursprünglich angeforderter Modus, zur Protokollierung. */
  requestedSslMode: string | null;
  /** TLS ohne CA-Prüfung nötig? (IP-Ziel oder sslmode=require) */
  relaxedVerification: boolean;
}

const SSL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

/**
 * Zerlegt die Verbindungs-URL in eine pg-taugliche URL plus TLS-Entscheidung.
 * `verify-full`/`verify-ca` bleiben streng: dort wird bewusst nicht entschärft.
 */
export function splitSslMode(raw: string): ConnectionParts {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new Error("DATABASE_URL fehlt.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("DATABASE_URL ist keine gültige URL.");
  }
  const requested = parsed.searchParams.get("sslmode");
  const strict = requested === "verify-full" || requested === "verify-ca";
  let relaxed = requested === "require" || requested === "prefer";
  for (const param of SSL_PARAMS) parsed.searchParams.delete(param);

  // Ziel ist eine nackte IP? Dann kann kein Hostname-Zertifikat passen.
  const host = parsed.hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) relaxed = true;

  return {
    connectionString: parsed.toString(),
    requestedSslMode: requested,
    relaxedVerification: relaxed && !strict,
  };
}

/** pg-Optionen zu einer URL: TLS nur, wenn nicht lokal. */
export function sslOptionsFor(parts: ConnectionParts): { rejectUnauthorized: false } | undefined {
  const isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(new URL(parts.connectionString).hostname);
  if (isLocal) return undefined;
  return { rejectUnauthorized: false };
}

/** Hash einer Migrationsdatei, so wie drizzle ihn im Journal ablegt. */
export function migrationHash(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

export interface ReconciliationPlan {
  /** Einträge, deren Hash fehlt und die nachgetragen werden. */
  toStamp: Array<{ tag: string; hash: string; createdAt: number }>;
  /** Bereits vorhandene Hashes. */
  alreadyApplied: string[];
  /** Einträge ohne lesbare SQL-Datei — werden nicht gestempelt, sondern gemeldet. */
  unreadable: string[];
}

/**
 * Welche Journal-Einträge fehlen in der Datenbank? Nur lesend geplant; das
 * Schreiben entscheidet der Aufrufer (`--apply`).
 */
export function planJournalReconciliation(
  entries: readonly JournalEntry[],
  appliedHashes: readonly string[],
  readSql: (tag: string) => string | null,
): ReconciliationPlan {
  const applied = new Set(appliedHashes.filter((hash): hash is string => typeof hash === "string" && hash.length > 0));
  const toStamp: ReconciliationPlan["toStamp"] = [];
  const alreadyApplied: string[] = [];
  const unreadable: string[] = [];

  for (const entry of [...entries].sort((a, b) => a.idx - b.idx)) {
    const sql = readSql(entry.tag);
    if (sql === null) {
      unreadable.push(entry.tag);
      continue;
    }
    const hash = migrationHash(sql);
    if (applied.has(hash)) {
      alreadyApplied.push(entry.tag);
      continue;
    }
    toStamp.push({ tag: entry.tag, hash, createdAt: entry.when });
    applied.add(hash);
  }

  return { toStamp, alreadyApplied, unreadable };
}

/** SQL-Datei in einzelne Anweisungen zerlegen (drizzle-Trenner). */
export function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.length > 0);
}
