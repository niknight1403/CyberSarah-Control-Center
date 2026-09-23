/**
 * Sprint 201 — Geraete-Anbindung des Speicher-Managers (I/O-Schicht).
 *
 * Scannt und loescht im APP-EIGENEN Speicher: die Expo-Datei-Verzeichnisse
 * (documentDirectory + cacheDirectory) und die WebStorage-Eintraege, die
 * die App selbst schreibt (localStorage-Schluessel mit "cybersarah"- oder
 * "expo"-Praefix). Kein Zugriff auf fremde App-Daten, kein System-Speicher.
 *
 * Ehrlichkeits-Regeln:
 *   - expo-file-system nicht verfuegbar (Web ohne Implementierung) →
 *     status "partial" mit Angabe, WARUM nichts gescannt wurde — nie
 *     stillschweigend ein leeres "OK".
 *   - Geschaetzte Groessen werden als geschaetzt markiert.
 * Alle Entscheidungen (Plan, Sicherheit, Sortierung) trifft die reine Logik
 * in lib/storage-manager-logic.ts — dieses Modul liest und loescht nur.
 */

import { Platform } from "react-native";
import { isProtectedPath, type StorageEntry } from "@/lib/storage-manager-logic";

export type StorageScan = {
  status: "ok" | "partial";
  entries: StorageEntry[];
  /** Hinweise zu nicht scannbaren Bereichen (ehrlich, sichtbar in der UI). */
  notes: string[];
};

/** Interface fuer Tests: FS-Zugriffe koennen ohne expo-file-system injiziert werden. */
export type FileSystemAdapter = {
  documentDirectory: string | null;
  cacheDirectory: string | null;
  readDirectoryAsync(dirUri: string): Promise<string[]>;
  getInfoAsync(fileUri: string): Promise<{ exists: boolean; size?: number; modificationTime?: number; isDirectory?: boolean } | null>;
  deleteAsync(fileUri: string): Promise<void>;
};

const MAX_SCAN_DEPTH = 6;
const MAX_ENTRIES = 2_000;
const MS_PER_DAY = 86_400_000;

/** Only app-owned keys; auth/session material is deliberately excluded. */
export function isAppStorageKey(key: string): boolean {
  return /^(?:cybersarah[.-]|expo[.-])/i.test(key) && !isProtectedPath(`webstorage/${key}`) &&
    !/(?:auth|token|secret|password|credential|session|api[_-]?key)/i.test(key);
}

function estimateWebStorageBytes(): StorageEntry[] {
  if (typeof globalThis.localStorage === "undefined") return [];
  const entries: StorageEntry[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !isAppStorageKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    entries.push({ path: `webstorage/${key}`, sizeBytes: value.length * 2, modifiedAt: Date.now() });
  }
  return entries;
}

export function createExpoFileSystemAdapter(): FileSystemAdapter | null {
  // expo-file-system/legacy wird dynamisch importiert, damit Web-Bundles ohne
  // native Module nicht an fehlenden Exporten scheitern.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("expo-file-system/legacy") as typeof import("expo-file-system/legacy");
    return {
      documentDirectory: fs.documentDirectory ?? null,
      cacheDirectory: fs.cacheDirectory ?? null,
      readDirectoryAsync: (dirUri) => fs.readDirectoryAsync(dirUri),
      getInfoAsync: async (fileUri) => {
        const info = await fs.getInfoAsync(fileUri);
        return "exists" in info ? info : null;
      },
      deleteAsync: (fileUri) => fs.deleteAsync(fileUri, { idempotent: true }),
    };
  } catch {
    return null;
  }
}

async function scanDirectory(adapter: FileSystemAdapter, dirUri: string, prefix: string, depth: number, entries: StorageEntry[], notes: string[]): Promise<void> {
  if (depth > MAX_SCAN_DEPTH || entries.length >= MAX_ENTRIES) return;
  let names: string[];
  try {
    names = await adapter.readDirectoryAsync(dirUri);
  } catch (error) {
    notes.push(`Nicht lesbar: ${prefix || "/"} (${error instanceof Error ? error.message : "unbekannter Fehler"})`);
    return;
  }
  for (const name of names) {
    if (entries.length >= MAX_ENTRIES) return;
    const childUri = `${dirUri.replace(/\/+$/, "")}/${name}`;
    const childPath = prefix ? `${prefix}/${name}` : name;
    try {
      const info = await adapter.getInfoAsync(childUri);
      if (!info?.exists) continue;
      if (info.isDirectory) {
        await scanDirectory(adapter, childUri, childPath, depth + 1, entries, notes);
        continue;
      }
      entries.push({
        path: childPath,
        sizeBytes: Number.isFinite(info.size) ? Number(info.size) : 0,
        modifiedAt: info.modificationTime && info.modificationTime > 0 ? info.modificationTime * 1000 : Date.now(),
      });
    } catch {
      notes.push(`Eintrag übersprungen: ${childPath}`);
    }
  }
}

/** Scannt den App-eigenen Speicher (Expo-Verzeichnisse + WebStorage). */
export async function scanDeviceStorage(adapter: FileSystemAdapter | null): Promise<StorageScan> {
  const notes: string[] = [];
  const entries: StorageEntry[] = [];

  const webStorage = estimateWebStorageBytes();
  entries.push(...webStorage);
  if (webStorage.length > 0) notes.push(`${webStorage.length} WebStorage-Einträge (geschätzte Größe) einbezogen.`);

  if (!adapter) {
    notes.push(Platform.OS === "web" ? "Dateisystem-Zugriff auf dieser Plattform nicht verfügbar." : "Dateisystem-Adapter konnte nicht initialisiert werden.");
    return { status: "partial", entries, notes };
  }

  for (const [rootUri, label] of [
    [adapter.documentDirectory, "document"],
    [adapter.cacheDirectory, "cache"],
  ] as Array<[string | null, string]>) {
    if (!rootUri) {
      notes.push(`${label}-Verzeichnis nicht verfügbar.`);
      continue;
    }
    await scanDirectory(adapter, rootUri, label, 0, entries, notes);
  }

  if (entries.length >= MAX_ENTRIES) notes.push(`Scan bei ${MAX_ENTRIES} Einträgen begrenzt.`);
  return { status: entries.length > 0 ? "ok" : "partial", entries, notes };
}

export type CleanupExecutionResult = {
  deleted: string[];
  failed: Array<{ path: string; reason: string }>;
  reclaimedBytes: number;
};

/**
 * Fuehrt einen freigegebenen Aufraeum-Plan aus. Der Aufrufer (Hook/UI)
 * verantwortet die Bestaetigung — dieses Modul loescht ausschliesslich
 * die uebergebenen (vom Nutzer bestaetigten) Pfade.
 */
export async function applyCleanupEntries(
  adapter: FileSystemAdapter | null,
  entries: Array<{ path: string; sizeBytes: number }>,
): Promise<CleanupExecutionResult> {
  const deleted: string[] = [];
  const failed: Array<{ path: string; reason: string }> = [];
  let reclaimedBytes = 0;

  for (const entry of entries) {
    if (isProtectedPath(entry.path)) {
      failed.push({ path: entry.path, reason: "Geschützter oder ungültiger Pfad" });
      continue;
    }
    if (entry.path.startsWith("webstorage/")) {
      const key = entry.path.slice("webstorage/".length);
      try {
        if (!isAppStorageKey(key) || typeof globalThis.localStorage === "undefined" || globalThis.localStorage.getItem(key) === null) {
          failed.push({ path: entry.path, reason: "WebStorage-Eintrag nicht verfügbar oder nicht freigegeben" });
          continue;
        }
        globalThis.localStorage.removeItem(key);
        deleted.push(entry.path);
        reclaimedBytes += entry.sizeBytes;
      } catch (error) {
        failed.push({ path: entry.path, reason: error instanceof Error ? error.message : "Löschen fehlgeschlagen" });
      }
      continue;
    }
    if (!adapter) {
      failed.push({ path: entry.path, reason: "Dateisystem nicht verfügbar" });
      continue;
    }
    const root = entry.path.startsWith("cache/") ? adapter.cacheDirectory : adapter.documentDirectory;
    if (!root) {
      failed.push({ path: entry.path, reason: "Zielverzeichnis nicht verfügbar" });
      continue;
    }
    const relative = entry.path.split("/").slice(1).map(encodeURIComponent).join("/");
    const fileUri = `${root.replace(/\/+$/, "")}/${relative}`;
    try {
      const info = await adapter.getInfoAsync(fileUri);
      if (!info?.exists || info.isDirectory) {
        failed.push({ path: entry.path, reason: "Datei nicht mehr vorhanden oder Verzeichnis" });
        continue;
      }
      await adapter.deleteAsync(fileUri);
      deleted.push(entry.path);
      reclaimedBytes += entry.sizeBytes;
    } catch (error) {
      failed.push({ path: entry.path, reason: error instanceof Error ? error.message : "Löschen fehlgeschlagen" });
    }
  }

  return { deleted, failed, reclaimedBytes };
}

/** Convenience: frischer Expo-Adapter (oder null, wenn nicht verfuegbar). */
export function resolveFileSystemAdapter(): FileSystemAdapter | null {
  return createExpoFileSystemAdapter();
}

/** Alter in Tagen fuer Anzeige-Zwecke. */
export function ageInDays(modifiedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - modifiedAt) / MS_PER_DAY));
}
