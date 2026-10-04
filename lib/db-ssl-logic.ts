/**
 * Sprint 112 — Postgres-SSL-Konfiguration ohne Warnung.
 *
 * node-postgres parst `sslmode` aus dem Connection-String selbst nur, wenn
 * kein explizites `ssl`-Objekt uebergeben wird — und behandelt dabei die
 * Modi 'prefer', 'require' und 'verify-ca' als Alias fuer 'verify-full'
 * (mit einer SECURITY-WARNING-Zeile pro Verbindung). Dieses Modul macht
 * genau diese Aufloesung explizit: gleiche Sicherheitsstufe
 * (Server-Zertifikat wird verifiziert), aber ohne die Laufzeit-Warnung,
 * weil pg dann keine eigene sslmode-Aufloesung mehr vornimmt.
 *
 * Lokale Verbindungen (kein sslmode-Parameter, z. B. lokales Postgres ohne
 * TLS) bleiben unverändert ohne SSL-Zwang.
 */

export type PgSslConfig = false | { rejectUnauthorized: boolean };

/** Liest den sslmode-Query-Parameter aus einer Postgres-Connection-URL. */
export function extractSslMode(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    return url.searchParams.get("sslmode");
  } catch {
    // Kein gueltiges URL-Format (z. B. Kurzschreibweise) — kein sslmode ableitbar.
    return null;
  }
}

/**
 * Leitet die explizite pg-SSL-Konfiguration aus dem sslmode-Parameter ab.
 * 'disable' → kein TLS. 'prefer' | 'require' | 'verify-ca' | 'verify-full' →
 * TLS mit Zertifikatspruefung (deckt sich mit pg's bisherigem Verhalten).
 * Kein sslmode-Parameter → keine TLS-Erzwingung (lokale Entwicklung).
 */
export function resolvePgSslConfig(connectionString: string): PgSslConfig {
  const mode = extractSslMode(connectionString);
  if (!mode) return false;
  if (mode === "disable") return false;
  return { rejectUnauthorized: true };
}

/**
 * Ersetzt Alias-SSL-Modes ('prefer', 'require', 'verify-ca') durch
 * 'verify-full' in einer PostgreSQL-Connection-String.
 */
export function normalizeAliasSslModes(connectionString: string): string {
  // Parse URL; if fails, return original.
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get("sslmode");
    if (!mode) return connectionString;
    if (mode === "prefer" || mode === "require" || mode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
    return connectionString;
  } catch {
    // If not a URL, return original.
    return connectionString;
  }
}
