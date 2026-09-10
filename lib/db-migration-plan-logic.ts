/**
 * Sprint 55 — Hetzner-Exit Phase 3: Deterministische MySQL→PostgreSQL-Migrationsplanung.
 *
 * Wandelt mysqldump-Fragmente (CREATE TABLE + INSERT) der Produktiv-DB
 * "cybersarah" in PostgreSQL-kompatible SQL-Texte um und liefert einen
 * pruefbaren Migrationsplan (Tabellen, Zeilenzaehlungen, Warnungen).
 * Reine Logik ohne IO — Skript-Wrapper (scripts/mysql-to-pg.mjs) bleibt duenn.
 */

export interface MigrationWarning {
  table: string | null;
  message: string;
}

export interface MigrationPlan {
  tables: Array<{ name: string; createStatement: string }>;
  insertStatements: string[];
  expectedRowCounts: Record<string, number>;
  warnings: MigrationWarning[];
}

/** Entfernt SQL-Kommentare und Leerzeilen, normalisiert Zeilenenden. */
export function normalizeDump(input: string): string {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--") && line.trim() !== "")
    .join("\n");
}

/** MySQL-Typ → PostgreSQL-Typ (unverzichtbare Abbildung der Produktiv-DB-Schemata). */
export function convertType(mysqlType: string, tableName: string, columnName: string): {
  pgType: string;
  warning: MigrationWarning | null;
} {
  const type = mysqlType.trim().replace(/\s+/g, " ");
  const upper = type.toUpperCase();

  if (upper.startsWith("TINYINT(1)")) {
    return { pgType: "BOOLEAN", warning: null };
  }
  if (upper.startsWith("TINYINT")) {
    return { pgType: "SMALLINT", warning: null };
  }
  if (upper.startsWith("BIGINT")) {
    return { pgType: "BIGINT", warning: null };
  }
  if (upper.startsWith("INT") || upper.startsWith("INTEGER")) {
    return { pgType: "BIGINT", warning: null };
  }
  if (upper.startsWith("VARCHAR(")) {
    return { pgType: type, warning: null };
  }
  if (upper.startsWith("DATETIME") || upper.startsWith("TIMESTAMP")) {
    return { pgType: "TIMESTAMP", warning: null };
  }
  if (upper.startsWith("TEXT") || upper.startsWith("LONGTEXT") || upper.startsWith("MEDIUMTEXT")) {
    return { pgType: "TEXT", warning: null };
  }
  if (upper.startsWith("ENUM(")) {
    const allowed = (type.match(/'[^']*'/g) ?? []).join(", ");
    return {
      pgType: "TEXT",
      warning: {
        table: tableName,
        message: `Spalte "${columnName}" ist ein ENUM (${allowed}) — in PostgreSQL als TEXT + CHECK-Constraint migriert; Constraint manuell ergaenzen.`,
      },
    };
  }
  if (upper.startsWith("JSON")) {
    return { pgType: "JSONB", warning: null };
  }
  return {
    pgType: "TEXT",
    warning: {
      table: tableName,
      message: `Unbekannter MySQL-Typ "${type}" an Spalte "${columnName}" — konservativ als TEXT migriert, Typ nachpruefen.`,
    },
  };
}

/** ENUM-Spalten bekommen automatisch eine CHECK-Constraint-Empfehlung. */
export function buildEnumCheck(tableName: string, columnName: string, mysqlType: string): string | null {
  if (!/^ENUM\s*\(/i.test(mysqlType.trim())) return null;
  const values = (mysqlType.match(/'[^']*'/g) ?? []).join(", ");
  return `ALTER TABLE "${tableName}" ADD CONSTRAINT "${tableName}_${columnName}_enum" CHECK ("${columnName}" IN (${values}));`;
}

/** Backticks → doppelte Anfuehrungszeichen, MySQL-Escapes → PostgreSQL-Escapes. */
export function convertQuoting(sql: string): string {
  return String(sql ?? "")
    .replace(/`([^`]*)`/g, '"$1"')
    .replace(/\\'/g, "''")
    .replace(/\\"/g, '"');
}


/** Spaltet die Werte eines VALUES-Tupels respektvoll gegenueber Strings und Escapes. */
export function splitTupleValues(tupleBody: string): string[] {
  const values: string[] = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < String(tupleBody ?? "").length; i++) {
    const char = tupleBody[i];
    if (inString) {
      if (char === "'" && tupleBody[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      if (char === "'") inString = false;
      current += char;
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") values.push(current.trim());
  return values;
}

/** Konvertiert die Werte eines INSERT-Tupels anhand der Spaltentypen (BOOLEAN: 1/0 → TRUE/FALSE). */
export function convertTupleValues(
  tupleBody: string,
  columns: ConvertedColumn[],
): { body: string; booleanCount: number } {
  const values = splitTupleValues(tupleBody);
  let booleanCount = 0;
  const converted = values.map((value, index) => {
    const column = columns[index];
    if (!column || column.pgType !== "BOOLEAN") return value;
    if (value === "1") {
      booleanCount++;
      return "TRUE";
    }
    if (value === "0") {
      booleanCount++;
      return "FALSE";
    }
    return value;
  });
  return { body: converted.join(", "), booleanCount };
}

// ===================================================================
/** Normalisiert numerische Defaults (0/1) auf einer BOOLEAN-Spalte nach TRUE/FALSE. */
export function normalizeBooleanDefaults(rest: string): string {
  return String(rest ?? "")
    .replace(/DEFAULT\s+1\b/gi, "DEFAULT TRUE")
    .replace(/DEFAULT\s+0\b/gi, "DEFAULT FALSE");
}

/** Entfernt MySQL-spezifische CREATE-TABLE-Anhaenge (ENGINE, CHARSET, COLLATE, AUTO_INCREMENT-Zaehler). (ENGINE, CHARSET, COLLATE, AUTO_INCREMENT-Zaehler). */
export function stripMysqlSuffixes(sql: string): string {
  return String(sql ?? "")
    .replace(/[,\s]+AUTO_INCREMENT=\d+/gi, "")
    .replace(/\)\s*ENGINE\s*=\s*[^\s;]+/gi, ")")
    .replace(/\)\s*DEFAULT\s+CHARSET\s*=\s*[^\s;]+/gi, ")")
    .replace(/\)\s*COLLATE\s*=\s*[^\s;]+/gi, ")");
}

/** AUTO_INCREMENT-Zeilen werden zu GENERATED BY DEFAULT AS IDENTITY. */
export function convertAutoIncrement(line: string, tableName: string): {
  line: string;
  identity: boolean;
} {
  const trimmed = line.trim();
  if (!/^`?id`?\s+BIGINT\s+NOT\s+NULL\s+AUTO_INCREMENT,?$/i.test(trimmed)) {
    return { line, identity: false };
  }
  return {
    line: `"id" BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL`,
    identity: true,
  };
}

/** Findet CREATE-TABLE-Bloecke (nur Struktur, FOREIGN KEY/KEY-Zeilen werden separat behandelt). */
export function extractCreateStatements(dump: string): string[] {
  const normalized = normalizeDump(dump);
  const statements: string[] = [];
  const pattern = /CREATE\s+TABLE\s+`([^`]+)`\s*\(([\s\S]*?)\)\s*(?:ENGINE[^;]*)?;/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    statements.push(match[0]);
  }
  return statements;
}

/** Findet INSERT-Statements inklusive Tabellenname. */
export function extractInsertStatements(dump: string): Array<{ table: string; statement: string }> {
  const normalized = normalizeDump(dump);
  const statements: Array<{ table: string; statement: string }> = [];
  const pattern = /INSERT\s+INTO\s+`([^`]+)`\s+VALUES[\s\S]*?;\s*(?=INSERT|CREATE|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    statements.push({ table: match[1], statement: match[0].trim() });
  }
  return statements;
}

/** Konvertiert ein einzelnes CREATE-TABLE-Statement nach PostgreSQL. */
export interface ConvertedColumn {
  name: string;
  pgType: string;
}

export function convertCreateTable(statement: string): {
  pgStatement: string;
  tableName: string;
  warnings: MigrationWarning[];
  enumChecks: string[];
  columns: ConvertedColumn[];
} {
  const nameMatch = statement.match(/CREATE\s+TABLE\s+`([^`]+)`/i);
  const tableName = nameMatch ? nameMatch[1] : "unbekannt";
  const warnings: MigrationWarning[] = [];
  const enumChecks: string[] = [];
  const columns: ConvertedColumn[] = [];

  const bodyMatch = statement.match(/\(([\s\S]*)\)\s*(?:ENGINE|$)/i);
  if (!bodyMatch) {
    warnings.push({ table: tableName, message: "CREATE-TABLE-Statement ohne Rumpf erkannt — unverändert uebernommen." });
    return { pgStatement: convertQuoting(statement), tableName, warnings, enumChecks, columns: [] };
  }

  const lines = bodyMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== "(")
    .map((line) => (line.endsWith(",") ? line.slice(0, -1).trim() : line));

  const kept: string[] = [];
  for (const line of lines) {
    if (/^(PRIMARY\s+KEY|UNIQUE\s+KEY|KEY|CONSTRAINT|FOREIGN\s+KEY|INDEX)\b/i.test(line)) {
      if (/^FOREIGN\s+KEY/i.test(line)) {
        warnings.push({
          table: tableName,
          message: `FOREIGN KEY "${line.replace(/`/g, '"')}" nicht automatisch uebernommen — Constraint nach dem Import manuell anlegen.`,
        });
      }
      continue;
    }
    const columnMatch = line.match(/^`([^`]+)`\s+([^\s]+(?:\([^)]*\))?)(.*)$/);
    if (!columnMatch) {
      kept.push(convertQuoting(line));
      continue;
    }
    const [, columnName, rawType, restRaw] = columnMatch;
    let rest = restRaw ?? "";
    let mysqlType = rawType;
    if (rest.startsWith("(")) {
      mysqlType = `${rawType}${rest.slice(0, rest.indexOf(")") + 1)}`;
      rest = rest.slice(rest.indexOf(")") + 1);
    }
    const { pgType, warning } = convertType(mysqlType, tableName, columnName);
    if (warning) warnings.push(warning);
    columns.push({ name: columnName, pgType });
    const check = buildEnumCheck(tableName, columnName, mysqlType);
    if (check) enumChecks.push(check);

    const normalizedRest = rest
      .replace(/\s+UNSIGNED/gi, "")
      .replace(/\s+CHARACTER\s+SET\s+\w+/gi, "")
      .replace(/\s+COLLATE\s+\w+/gi, "")
      .trim();

    // PostgreSQL akzeptiert keine numerischen Defaults auf BOOLEAN-Spalten.
    const booleanRest = pgType === "BOOLEAN" ? normalizeBooleanDefaults(normalizedRest) : normalizedRest;

    if (/AUTO_INCREMENT$/i.test(normalizedRest)) {
      const identity = pgType === "BIGINT" || pgType === "SMALLINT";
      if (identity) {
        kept.push(`  "${columnName}" ${pgType} GENERATED BY DEFAULT AS IDENTITY NOT NULL`);
      } else {
        kept.push(`  "${columnName}" ${pgType} NOT NULL`);
        warnings.push({
          table: tableName,
          message: `AUTO_INCREMENT auf Nicht-Integer-Spalte "${columnName}" — Identitaet manuell pruefen.`,
        });
      }
      continue;
    }
    kept.push(`  "${columnName}" ${pgType}${booleanRest ? ` ${booleanRest}` : ""}`);
  }

  const primaryKey = lines.find((line) => /^PRIMARY\s+KEY/i.test(line));
  const pkColumn = primaryKey
    ? primaryKey.match(/`([^`]+)`/g)?.map((part) => part.replace(/`/g, '"')).join(", ")
    : null;

  const pkLine = pkColumn ? [`  PRIMARY KEY (${pkColumn})`] : [];
  const allLines = [...kept, ...pkLine];
  const body = allLines.map((line, index) => (index < allLines.length - 1 ? `${line},` : line)).join("\n");

  const pgStatement = `CREATE TABLE "${tableName}" (\n${body}\n);`;
  return { pgStatement, tableName, warnings, enumChecks, columns };
}

/** Baut den vollstaendigen Migrationsplan aus einem Dump-Text. */
export function planMigration(dump: string): MigrationPlan {
  const warnings: MigrationWarning[] = [];
  const tables: Array<{ name: string; createStatement: string }> = [];
  const expectedRowCounts: Record<string, number> = {};

  const columnsByTable = new Map<string, ConvertedColumn[]>();
  for (const statement of extractCreateStatements(dump)) {
    const converted = convertCreateTable(statement);
    columnsByTable.set(converted.tableName, converted.columns);
    tables.push({ name: converted.tableName, createStatement: converted.pgStatement });
    warnings.push(...converted.warnings);
    for (const check of converted.enumChecks) {
      tables.push({ name: `${converted.tableName}_enum_check`, createStatement: check });
    }
  }

  const inserts = extractInsertStatements(dump).map(({ table, statement }) => {
    expectedRowCounts[table] = (expectedRowCounts[table] ?? 0) + 1;
    const quoted = convertQuoting(statement);
    const columns = columnsByTable.get(table);
    if (!columns || columns.length === 0) return quoted;
    const tupleMatch = quoted.match(/VALUES\s*\(([\s\S]*)\)\s*;?\s*$/i);
    if (!tupleMatch) return quoted;
    const { body } = convertTupleValues(tupleMatch[1], columns);
    return quoted.replace(/VALUES\s*\([\s\S]*\)\s*;?\s*$/i, `VALUES (${body});`);
  });

  return { tables, insertStatements: inserts, expectedRowCounts, warnings };
}
