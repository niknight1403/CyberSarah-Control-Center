import AsyncStorage from "@react-native-async-storage/async-storage";
import { appendUsageEntry, parsePersistedUsageEntries, serializeUsageEntries, USAGE_ENTRIES_STORAGE_KEY, type UsageEntry } from "@/lib/usage-budget-view-logic";

/**
 * Persistenter Speicher für Nutzungseinträge des Budgetfensters. Die
 * Einträge enthalten ausschließlich Zeitstempel und Kosten­einheiten —
 * niemals Secrets, Tokens oder Endpoints.
 */
export async function loadUsageEntries(): Promise<UsageEntry[]> {
  const raw = await AsyncStorage.getItem(USAGE_ENTRIES_STORAGE_KEY);
  return parsePersistedUsageEntries(raw);
}

export async function recordUsageEntry(entry: UsageEntry): Promise<UsageEntry[]> {
  const existing = await loadUsageEntries();
  const next = appendUsageEntry(existing, entry);
  await AsyncStorage.setItem(USAGE_ENTRIES_STORAGE_KEY, serializeUsageEntries(next));
  return next;
}

export async function clearUsageEntries(): Promise<void> {
  await AsyncStorage.removeItem(USAGE_ENTRIES_STORAGE_KEY);
}
