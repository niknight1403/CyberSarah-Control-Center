/**
 * Sprint 367 — Gedächtnis-Konsolidierung v2: Wichtiges bleibt, Vermengtes ordnen
 *
 * Konsolidiert und strukturiert das Langzeit- und Kurzzeitgedächtnis des Agenten.
 * Kategorisiert ungeordnete Einträge, löst Konflikte zugunsten bestätigter/neuerer Fakten
 * und räumt flüchtige Zwischendaten ehrlich auf, ohne Kern-Präferenzen zu verlieren.
 */

export type MemoryCategory =
  | "UserPreference"
  | "ProjectRules"
  | "SystemArchitecture"
  | "EphemeralTaskState"
  | "Uncategorized";

export type ImportanceLevel = "high" | "medium" | "low" | "ephemeral";

export type MemoryItemV2 = {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: ImportanceLevel;
  isConfirmed: boolean; // Vom Nutzer explizit bestätigt -> darf nie automatisch gelöscht werden
  createdAt: string;
  lastVerifiedAt?: string;
  tags?: string[];
};

export type ConsolidationReport = {
  itemsRetained: number;
  itemsPruned: number;
  conflictsResolved: number;
  categories: Record<MemoryCategory, number>;
  prunedIds: string[];
  conflictLogs: string[];
};

/**
 * Erstellt eine automatische Kategorie-Zuordnung basierend auf Inhalts-Heuristiken.
 */
export function categorizeMemoryItem(
  content: string,
  existingCategory?: MemoryCategory
): MemoryCategory {
  if (existingCategory && existingCategory !== "Uncategorized") {
    return existingCategory;
  }

  const textLower = content.toLowerCase();

  // 1. Prüfe zuerst flüchtige Zustände (hohe Spezifität für Prozessfragen)
  if (
    textLower.includes("temporär") ||
    textLower.includes("fortschritt") ||
    textLower.includes("schritt") ||
    textLower.includes("zwischenstand") ||
    textLower.includes("warten auf")
  ) {
    return "EphemeralTaskState";
  }

  // 2. Nutzer-Präferenzen
  if (
    textLower.includes("ich mag") ||
    textLower.includes("präferenz") ||
    textLower.includes("bevorzug") ||
    textLower.includes("sprache:") ||
    textLower.includes("stil:")
  ) {
    return "UserPreference";
  }

  // 3. Projekt-Regeln
  if (
    textLower.includes("regel") ||
    textLower.includes("muss") ||
    textLower.includes("niemals") ||
    textLower.includes("immer") ||
    textLower.includes("changelog") ||
    textLower.includes("sprint")
  ) {
    return "ProjectRules";
  }

  // 4. System-Architektur
  if (
    textLower.includes("backend") ||
    textLower.includes("database") ||
    textLower.includes("db") ||
    textLower.includes("postgres") ||
    textLower.includes("sql") ||
    textLower.includes("api") ||
    textLower.includes("architektur") ||
    textLower.includes("server")
  ) {
    return "SystemArchitecture";
  }

  return "Uncategorized";
}

/**
 * Führt die Konsolidierung v2 durch: Duplikate bereinigen, Konflikte auflösen, Kategorien ordnen.
 */
export function consolidateMemoriesV2(
  rawItems: MemoryItemV2[],
  options: { maxEphemeralAgeDays?: number; nowIso?: string } = {}
): { consolidatedItems: MemoryItemV2[]; report: ConsolidationReport } {
  const nowIso = options.nowIso || new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const maxEphemeralAgeDays = options.maxEphemeralAgeDays ?? 7;

  const prunedIds: string[] = [];
  const conflictLogs: string[] = [];
  let conflictsResolved = 0;

  // 1. Kategorisieren & Wichtigkeit schärfen
  const categorized = rawItems.map((item) => {
    const category = categorizeMemoryItem(item.content, item.category);
    let importance = item.importance;

    if (item.isConfirmed) {
      importance = "high";
    } else if (category === "UserPreference" || category === "ProjectRules") {
      importance = importance === "ephemeral" ? "medium" : importance;
    } else if (category === "EphemeralTaskState") {
      importance = "ephemeral";
    }

    return { ...item, category, importance };
  });

  // 2. Duplikate und widersprüchliche Einträge zusammenführen
  const itemMap = new Map<string, MemoryItemV2>();

  for (const item of categorized) {
    // Altersprüfung für flüchtige Zustände
    if (item.importance === "ephemeral" && !item.isConfirmed) {
      const ageDays = Math.floor(
        (nowMs - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (ageDays >= maxEphemeralAgeDays) {
        prunedIds.push(item.id);
        continue;
      }
    }

    // Ähnlichkeitsschlüssel für Duplikaterkennung
    const normKey = item.content.toLowerCase().trim().replace(/\s+/g, " ");
    const existing = itemMap.get(normKey);

    if (existing) {
      conflictsResolved++;
      // Behalte den höherrangigen/bestätigten oder neueren Eintrag
      if (item.isConfirmed && !existing.isConfirmed) {
        conflictLogs.push(`Ersetze unbestätigten Eintrag '${existing.id}' durch Nutzer-bestätigten Eintrag '${item.id}'.`);
        prunedIds.push(existing.id);
        itemMap.set(normKey, item);
      } else if (!item.isConfirmed && existing.isConfirmed) {
        prunedIds.push(item.id);
      } else {
        // Beide gleichrangig: nimm den neueren
        const existingTime = new Date(existing.createdAt).getTime();
        const itemTime = new Date(item.createdAt).getTime();
        if (itemTime > existingTime) {
          conflictLogs.push(`Aktualisiere älteren Duplikat-Eintrag '${existing.id}' mit neuerem '${item.id}'.`);
          prunedIds.push(existing.id);
          itemMap.set(normKey, item);
        } else {
          prunedIds.push(item.id);
        }
      }
    } else {
      itemMap.set(normKey, item);
    }
  }

  const consolidatedItems = Array.from(itemMap.values());

  const categoryCounts: Record<MemoryCategory, number> = {
    UserPreference: 0,
    ProjectRules: 0,
    SystemArchitecture: 0,
    EphemeralTaskState: 0,
    Uncategorized: 0,
  };

  for (const item of consolidatedItems) {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  }

  const report: ConsolidationReport = {
    itemsRetained: consolidatedItems.length,
    itemsPruned: prunedIds.length,
    conflictsResolved,
    categories: categoryCounts,
    prunedIds,
    conflictLogs,
  };

  return { consolidatedItems, report };
}
