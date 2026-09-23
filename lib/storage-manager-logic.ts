/**
 * Sprint 201 — Speicher-Manager-Logik (rein, deterministisch testbar).
 *
 * Der interne Speicher-Manager (app/storage-manager.tsx) sortiert und
 * raeumt per Prompt den App-eigenen Speicher auf und schlaegt Optimie-
 * rungen vor. Diese Bibliothek entscheidet rein und ohne I/O:
 *   - Klassifikation: Dateipfad → Speicherkategorie (Cache, Logs, ...)
 *   - Aggregation, Formatierung und Sortierung von Speichereintraegen
 *   - Aufraeum-Plan mit Sicherheitsregeln (was automatisch, was nur mit
 *     ausdruecklicher Bestaetigung geloescht werden darf)
 *   - Optimierungs-Vorschlaege (groesste/staelteste/doppelte Eintraege)
 *   - Prompt-Parsing (natuerliche Sprache → Befehl), deutsch
 * Die Geraete-Anbindung (Scan/Delete) liegt in lib/storage-manager-device.ts.
 */

export type StorageCategory = "cache" | "logs" | "backups" | "documents" | "media" | "other";

export type StorageEntry = {
  /** Anzeige-/Loeschpfad (relativ, z. B. "logs/agent.log"). */
  path: string;
  sizeBytes: number;
  /** Letzte Aenderung in ms seit Epoch. */
  modifiedAt: number;
};

/* ==================== Klassifikation ==================== */

const MEDIA_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "mp3", "wav", "m4a", "aac"]);
const DOCUMENT_EXTENSIONS = new Set(["txt", "json", "md", "pdf", "csv", "xml", "html", "yml", "yaml", "tsv"]);

export function classifyStorageEntry(path: string): StorageCategory {
  const normalized = path.toLowerCase();
  const segments = normalized.split("/");
  // Backups duerfen auch unter cache/ niemals als gefahrlos gelten.
  if (segments.some((segment) => segment.includes("backup"))) return "backups";
  for (const segment of segments) {
    if (segment.includes("cache")) return "cache";
    if (segment === "logs" || segment.startsWith("log-")) return "logs";
  }
  if (normalized.endsWith(".log") || normalized.includes("/logs/")) return "logs";
  const extension = normalized.includes(".") ? normalized.split(".").pop() ?? "" : "";
  if (MEDIA_EXTENSIONS.has(extension)) return "media";
  if (DOCUMENT_EXTENSIONS.has(extension)) return "documents";
  return "other";
}

/* ==================== Aggregation & Formatierung ==================== */

export type CategoryAggregate = { category: StorageCategory; count: number; sizeBytes: number };

export function aggregateByCategory(entries: StorageEntry[]): CategoryAggregate[] {
  const map = new Map<StorageCategory, CategoryAggregate>();
  for (const entry of entries) {
    const category = classifyStorageEntry(entry.path);
    const current = map.get(category) ?? { category, count: 0, sizeBytes: 0 };
    current.count += 1;
    current.sizeBytes += entry.sizeBytes;
    map.set(category, current);
  }
  return [...map.values()].sort((a, b) => b.sizeBytes - a.sizeBytes);
}

export function totalSizeBytes(entries: StorageEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
}

/** Formatiert Bytes ehrlich auf Deutsch (SI-Einheiten, Komma). */
export function formatBytesGerman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${rounded.replace(".", ",")} ${units[unitIndex]}`;
}

/* ==================== Sortierung ==================== */

export type StorageSortKey = "size-desc" | "date-desc" | "date-asc" | "name-asc" | "category";

export function sortStorageEntries(entries: StorageEntry[], sort: StorageSortKey): StorageEntry[] {
  const copy = [...entries];
  switch (sort) {
    case "size-desc":
      return copy.sort((a, b) => b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path));
    case "date-desc":
      return copy.sort((a, b) => b.modifiedAt - a.modifiedAt || a.path.localeCompare(b.path));
    case "date-asc":
      return copy.sort((a, b) => a.modifiedAt - b.modifiedAt || a.path.localeCompare(b.path));
    case "name-asc":
      return copy.sort((a, b) => a.path.localeCompare(b.path));
    case "category":
      return copy.sort(
        (a, b) =>
          classifyStorageEntry(a.path).localeCompare(classifyStorageEntry(b.path)) ||
          b.sizeBytes - a.sizeBytes ||
          a.path.localeCompare(b.path),
      );
  }
}

/* ==================== Aufraeum-Plan mit Sicherheitsregeln ==================== */

export type CleanupPlanItem = {
  path: string;
  sizeBytes: number;
  category: StorageCategory;
  /**
   * true = gefahrlos automatisch loeschbar (Cache; veraltete Logs).
   * false = nur mit ausdruecklicher Bestaetigung (Backups, Dokumente, Medien).
   */
  requiresConfirmation: boolean;
  reason: string;
};

export type CleanupPlan = {
  items: CleanupPlanItem[];
  reclaimableBytes: number;
  automaticBytes: number;
  confirmationBytes: number;
};

export type CleanupOptions = {
  now: number;
  /** Logs aelter als X Tage gelten als veraltet (Default 14). */
  logMaxAgeDays?: number;
  /** Wenn false, bleiben Backups komplett unberuehrt (Default). */
  includeBackups?: boolean;
  /** Explizit angeforderte Kategorien (leer = Cache + veraltete Logs). */
  categories?: StorageCategory[];
};

const MS_PER_DAY = 86_400_000;

/** Sicherheits-Netz: Systemrelevante Pfade duerfen NIE im Plan landen. */
export function isProtectedPath(path: string): boolean {
  // Nur relative, kanonische Pfade aus einem Scan sind zulaessig.
  if (!path || path.startsWith("/") || path.includes("\\") || /[\x00-\x1f?#]/.test(path)) return true;
  const segments = path.toLowerCase().split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return true;
  if (!["cache", "document", "webstorage"].includes(segments[0])) return true;
  if (segments.length < 2 || (segments[0] === "webstorage" && segments.length !== 2)) return true;
  return segments.some((segment) =>
    segment === "sqlite" || segment === "indexeddb" || segment === "websql" ||
    segment.startsWith("__expo") || segment.includes("localdata") ||
    segment.endsWith(".db") || segment.endsWith(".sqlite") ||
    segment === "app_session_token" || segment === "manus-runtime-user-info"
  );
}

export function buildCleanupPlan(entries: StorageEntry[], options: CleanupOptions): CleanupPlan {
  const logMaxAgeDays = options.logMaxAgeDays ?? 14;
  const logCutoff = options.now - logMaxAgeDays * MS_PER_DAY;
  const requested = new Set(options.categories ?? []);
  const items: CleanupPlanItem[] = [];

  for (const entry of entries) {
    if (isProtectedPath(entry.path)) continue;
    const category = classifyStorageEntry(entry.path);
    const requestedMatch = requested.size === 0 || requested.has(category);
    if (!requestedMatch) continue;

    if (category === "cache") {
      items.push({ path: entry.path, sizeBytes: entry.sizeBytes, category, requiresConfirmation: false, reason: "Zwischenspeicher" });
      continue;
    }
    if (category === "logs" && entry.modifiedAt < logCutoff) {
      items.push({
        path: entry.path,
        sizeBytes: entry.sizeBytes,
        category,
        requiresConfirmation: false,
        reason: `Log älter als ${logMaxAgeDays} Tage`,
      });
      continue;
    }
    // Backups, Dokumente, Medien und "other" nur mit Bestaetigung —
    // und Backups nur, wenn sie ausdruecklich eingeschlossen wurden.
    if (category === "backups") {
      // includeBackups-Flag oder ausdrueckliche Kategorie-Anforderung im
      // Prompt ("Raeum die Backups auf") — immer nur mit Bestaetigung.
      if (options.includeBackups || requested.has("backups")) {
        items.push({ path: entry.path, sizeBytes: entry.sizeBytes, category, requiresConfirmation: true, reason: "Backup — Bestätigung nötig" });
      }
      continue;
    }
    if (requested.size > 0 && (category === "documents" || category === "media" || category === "other")) {
      items.push({ path: entry.path, sizeBytes: entry.sizeBytes, category, requiresConfirmation: true, reason: "Eigene Datei — Bestätigung nötig" });
    }
  }

  items.sort(
    (a, b) =>
      Number(a.requiresConfirmation) - Number(b.requiresConfirmation) || b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path),
  );
  const automaticBytes = items.filter((item) => !item.requiresConfirmation).reduce((sum, item) => sum + item.sizeBytes, 0);
  const confirmationBytes = items.filter((item) => item.requiresConfirmation).reduce((sum, item) => sum + item.sizeBytes, 0);
  return { items, reclaimableBytes: automaticBytes + confirmationBytes, automaticBytes, confirmationBytes };
}

/** Verhindert, dass Aufrufer Pfade ausserhalb des angezeigten Plans freigeben. */
export function selectCleanupTargets(
  entries: StorageEntry[], plan: CleanupPlan | null, safePaths: string[], confirmedPaths: string[],
): StorageEntry[] {
  if (!plan) return [];
  const safe = new Set(safePaths);
  const confirmed = new Set(confirmedPaths);
  const allowed = new Set(plan.items.filter((item) =>
    !isProtectedPath(item.path) && (item.requiresConfirmation ? confirmed.has(item.path) : safe.has(item.path) || confirmed.has(item.path)),
  ).map((item) => item.path));
  return entries.filter((entry) => allowed.has(entry.path));
}

/* ==================== Optimierungs-Vorschlaege ==================== */

export type StorageSuggestion = {
  kind: "largest" | "stale" | "duplicate" | "category-share";
  title: string;
  detail: string;
  reclaimableBytes?: number;
};

export type SuggestionOptions = {
  now: number;
  topN?: number;
  staleDays?: number;
};

export function buildStorageSuggestions(entries: StorageEntry[], options: SuggestionOptions): StorageSuggestion[] {
  const topN = options.topN ?? 5;
  const staleDays = options.staleDays ?? 30;
  const staleCutoff = options.now - staleDays * MS_PER_DAY;
  const suggestions: StorageSuggestion[] = [];

  const largest = sortStorageEntries(entries, "size-desc").slice(0, topN);
  for (const entry of largest) {
    suggestions.push({
      kind: "largest",
      title: `Größter Eintrag: ${entry.path}`,
      detail: `${formatBytesGerman(entry.sizeBytes)} — ${classifyStorageEntry(entry.path)}. Prüfe, ob die Datei noch gebraucht wird.`,
      reclaimableBytes: entry.sizeBytes,
    });
  }

  const stale = entries.filter((entry) => entry.modifiedAt < staleCutoff && !isProtectedPath(entry.path));
  if (stale.length > 0) {
    const staleBytes = totalSizeBytes(stale);
    suggestions.push({
      kind: "stale",
      title: `${stale.length} Einträge seit über ${staleDays} Tagen ungenutzt`,
      detail: `Zusammen ${formatBytesGerman(staleBytes)}. Der Aufräum-Befehl entfernt veraltete Logs automatisch; für alles Weitere gibt es einen Bestätigungs-Plan.`,
      reclaimableBytes: staleBytes,
    });
  }

  const duplicates = new Map<string, StorageEntry[]>();
  for (const entry of entries) {
    const key = `${entry.path.split("/").pop()}|${entry.sizeBytes}`;
    const bucket = duplicates.get(key) ?? [];
    bucket.push(entry);
    duplicates.set(key, bucket);
  }
  for (const [key, bucket] of duplicates) {
    if (bucket.length > 1) {
      const name = key.split("|")[0];
      const reclaimable = totalSizeBytes(bucket.slice(1));
      suggestions.push({
        kind: "duplicate",
        title: `Duplikat-Kandidat: ${name}`,
        detail: `${bucket.length} identische Kopien (${formatBytesGerman(bucket[0].sizeBytes)} je Datei) — ca. ${formatBytesGerman(reclaimable)} durch Löschen der Mehrfachkopien gewinnbar.`,
        reclaimableBytes: reclaimable,
      });
    }
  }

  const aggregates = aggregateByCategory(entries);
  const total = totalSizeBytes(entries);
  if (total > 0) {
    const heaviest = aggregates[0];
    const share = heaviest.sizeBytes / total;
    if (share >= 0.4) {
      suggestions.push({
        kind: "category-share",
        title: `${heaviest.category} dominiert den Speicher (${Math.round(share * 100)} %)`,
        detail: `${formatBytesGerman(heaviest.sizeBytes)} von ${formatBytesGerman(total)} in ${heaviest.count} Einträgen. Kategorie-Scan nach Bedarf verfeinern.`,
      });
    }
  }

  return suggestions;
}

/* ==================== Prompt-Parsing (deutsch) ==================== */

export type StoragePromptAction = "analyze" | "clean" | "sort" | "suggest";

export type StoragePromptCommand = {
  actions: StoragePromptAction[];
  categories: StorageCategory[];
  logMaxAgeDays?: number;
  sortKey: StorageSortKey;
  /** Wahr, wenn der Prompt explizit Backups einschließen will. */
  includeBackups: boolean;
};

const ACTION_KEYWORDS: Array<{ action: StoragePromptAction; pattern: RegExp }> = [
  { action: "clean", pattern: /aufräum|räum|lösch|freigeb|platz (?:machen|schaffen)|leere?r?|bereinig/i },
  { action: "sort", pattern: /sortier|ordn|struktur|auflist/i },
  { action: "suggest", pattern: /vorschl(?:ä|ae)g|vorschlag|optimier|empfehl|tipp|idee|wie kann ich|spare/i },
  { action: "analyze", pattern: /analy|übersicht|status|scan|zeig|wie viel|beleg|größe|verbrauch/i },
];

const CATEGORY_KEYWORDS: Array<{ category: StorageCategory; pattern: RegExp }> = [
  { category: "cache", pattern: /cache|zwischenspeicher/i },
  { category: "logs", pattern: /logs?|protokoll/i },
  { category: "backups", pattern: /backups?|sicherung/i },
  { category: "media", pattern: /bild(?:er)?|fotos?|videos?|musik|medien/i },
  { category: "documents", pattern: /dokumente?|dateien|unterlagen/i },
];

export function parseStoragePrompt(prompt: string): StoragePromptCommand {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return { actions: ["analyze"], categories: [], sortKey: "size-desc", includeBackups: false };
  }

  const actions: StoragePromptAction[] = [];
  for (const { action, pattern } of ACTION_KEYWORDS) {
    if (pattern.test(trimmed) && !actions.includes(action)) actions.push(action);
  }
  // Ein verneinter Loeschwunsch darf niemals einen Aufraeum-Plan erzeugen.
  if (/(?:nicht|nichts|nie|ohne(?:\s+zu)?)\s+(?:löschen|loeschen|aufräumen|aufraeumen|bereinigen)/i.test(trimmed) ||
      /(?:keine|keinerlei)\s+.{0,45}?(?:löschen|loeschen|aufräumen|aufraeumen)/i.test(trimmed) ||
      /nur\s+(?:analysieren|anzeigen|ansehen|scannen)/i.test(trimmed)) {
    const cleanIndex = actions.indexOf("clean");
    if (cleanIndex >= 0) actions.splice(cleanIndex, 1);
  }
  if (actions.length === 0) actions.push("analyze");

  const categories: StorageCategory[] = [];
  for (const { category, pattern } of CATEGORY_KEYWORDS) {
    if (pattern.test(trimmed) && !categories.includes(category)) categories.push(category);
  }

  // Bewusst ohne \b-Grenzen: "ä" ist fuer ASCII-\b kein Wortzeichen,
  // daher wuerde \b vor "älter" nie anschlagen.
  const ageMatch = trimmed.match(/(?:älter|alter)\s+(?:als\s+)?(\d+)\s*(?:tage|tag|days|day)/i);
  const logMaxAgeDays = ageMatch ? Math.max(1, Math.min(365, Number(ageMatch[1]))) : undefined;

  const sortKey: StorageSortKey = /datum|älteste|neueste|chronolog/i.test(trimmed)
    ? /neueste/i.test(trimmed)
      ? "date-desc"
      : "date-asc"
    : /name|alphabet/i.test(trimmed)
      ? "name-asc"
      : /kategorie/i.test(trimmed)
        ? "category"
        : "size-desc";

  return { actions, categories, logMaxAgeDays, sortKey, includeBackups: /backups?|sicherung/i.test(trimmed) };
}

/* ==================== Ehrliches Prompt-Ergebnis ==================== */

export type PromptResult = {
  headline: string;
  lines: string[];
  /** Aufraeum-Plan, wenn der Prompt eine Bereinigung will (sonst undefined). */
  plan?: CleanupPlan;
};

export function buildPromptResult(
  command: StoragePromptCommand,
  entries: StorageEntry[],
  options: { now: number; sortKey?: StorageSortKey },
): PromptResult {
  const lines: string[] = [];
  const total = totalSizeBytes(entries);
  const aggregates = aggregateByCategory(entries);
  const sortKey = options.sortKey ?? command.sortKey;

  if (command.actions.includes("analyze") || command.actions.includes("clean")) {
    lines.push(`${entries.length} Einträge, insgesamt ${formatBytesGerman(total)} belegt.`);
    if (aggregates.length === 0) {
      lines.push("Keine belegbaren Einträge gefunden — der App-Speicher ist aufgeräumt.");
    }
    for (const aggregate of aggregates) {
      lines.push(`${aggregate.category}: ${aggregate.count} Einträge, ${formatBytesGerman(aggregate.sizeBytes)}`);
    }
  }

  if (command.actions.includes("sort")) {
    const sorted = sortStorageEntries(entries, sortKey);
    lines.push(`Sortierung (${sortKey}):`);
    for (const entry of sorted.slice(0, 15)) {
      lines.push(`• ${entry.path} — ${formatBytesGerman(entry.sizeBytes)}`);
    }
    if (sorted.length > 15) lines.push(`… und ${sorted.length - 15} weitere.`);
  }

  let plan: CleanupPlan | undefined;
  if (command.actions.includes("clean")) {
    plan = buildCleanupPlan(entries, {
      now: options.now,
      logMaxAgeDays: command.logMaxAgeDays,
      includeBackups: command.includeBackups,
      categories: command.categories,
    });
    if (plan.items.length === 0) {
      lines.push("Aufzuräumen gibt es nichts: keine gefahrlosen Ziele, keine freigebbaren Dateien im Plan.");
    } else {
      lines.push(
        `Aufräum-Plan: ${formatBytesGerman(plan.automaticBytes)} gefahrlos automatisch, ${formatBytesGerman(plan.confirmationBytes)} nur mit Bestätigung.`,
      );
    }
  }

  if (command.actions.includes("suggest")) {
    const suggestions = buildStorageSuggestions(entries, { now: options.now });
    if (suggestions.length === 0) {
      lines.push("Keine Optimierungs-Vorschläge: keine auffälligen Größen-, Alters- oder Duplikatmuster.");
    } else {
      lines.push("Optimierungs-Vorschläge:");
      for (const suggestion of suggestions) lines.push(`→ ${suggestion.title} (${suggestion.detail})`);
    }
  }

  const headline = command.actions.includes("clean")
    ? "Aufräumen vorbereitet"
    : command.actions.includes("suggest")
      ? "Optimierungs-Vorschläge"
      : "Speicher-Analyse";
  return { headline, lines, plan };
}
