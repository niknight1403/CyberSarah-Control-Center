/**
 * Sprint 280 — Asset-Pack-Persistenz & Verwaltung (Outfit/Sets).
 *
 * Speicherung: KV-Store pro Nutzer (schlank, keine neue Tabelle, RLS bleibt
 * beim Nutzer-Scope). Ehrlich: kein Versionsverlauf, kein Undo — Packs sind
 * leichtgewichtige Konfiguration, keine Buchhaltung.
 */

import * as db from "./db";
import {
  ASSET_PACK_LIMITS,
  parseStoredPacks,
  pickActivePacks,
  validateAssetPackInput,
  type AssetPack,
  type AssetPackKind,
} from "../lib/asset-packs-logic";

function assetPacksKey(openId: string): string {
  return `assetpacks.user.${openId}`;
}

/** Alle Packs eines Nutzers (geparst, kaputte Einträge verworfen). */
export async function listAssetPacksForUser(openId: string): Promise<AssetPack[]> {
  const raw = await db.getModelRouterSetting<unknown>(assetPacksKey(openId));
  return parseStoredPacks(raw);
}

export async function saveAssetPacksForUser(openId: string, packs: AssetPack[]): Promise<void> {
  await db.setModelRouterSetting(assetPacksKey(openId), packs);
}

/** Aktive Packs (Outfit + Sets) eines Nutzers für die Render-Pipeline. */
export async function activePacksForUser(openId: string): Promise<{
  outfit: AssetPack | null;
  sets: AssetPack | null;
}> {
  return pickActivePacks(await listAssetPacksForUser(openId));
}

export type AssetPackMutationResult =
  | { ok: true; packs: AssetPack[] }
  | { ok: false; error: string; retryHint: string | null };

/** Pack anlegen — Grenzen werden ehrlich erzwungen, nicht still gekappt. */
export async function createAssetPack(
  openId: string,
  input: { kind?: unknown; name?: unknown; promptModifiers?: unknown; fallbackColors?: unknown },
): Promise<AssetPackMutationResult> {
  const existing = await listAssetPacksForUser(openId);
  if (existing.length >= ASSET_PACK_LIMITS.maxPacksPerUser) {
    return {
      ok: false,
      error: `Maximal ${ASSET_PACK_LIMITS.maxPacksPerUser} Packs pro Konto.`,
      retryHint: "Alte Packs löschen, dann neu anlegen.",
    };
  }
  const validation = validateAssetPackInput(input);
  if (!validation.ok) return validation;
  // Aktivieren eines Packs deaktiviert ältere aktive Packs derselben Art —
  // deterministisch: genau ein aktives Outfit- und Sets-Pack pro Render.
  const next = existing.map((p) =>
    p.active && p.kind === (input.kind as AssetPackKind) ? { ...p, active: false } : p,
  );
  next.push(validation.pack);
  await saveAssetPacksForUser(openId, next);
  return { ok: true, packs: next };
}

/** Pack aktivieren (deaktiviert Geschwister derselben Art) oder deaktivieren. */
export async function setAssetPackActive(
  openId: string,
  packId: string,
  active: boolean,
): Promise<AssetPackMutationResult> {
  const existing = await listAssetPacksForUser(openId);
  const target = existing.find((p) => p.id === packId);
  if (!target) return { ok: false, error: "Pack nicht gefunden.", retryHint: null };
  const next = existing.map((p) => {
    if (p.id === packId) return { ...p, active };
    if (active && p.kind === target.kind) return { ...p, active: false };
    return p;
  });
  await saveAssetPacksForUser(openId, next);
  return { ok: true, packs: next };
}

/** Pack löschen — endgültig, aber für dieselbe Eingabe reproduzierbar neu anlegbar. */
export async function deleteAssetPack(openId: string, packId: string): Promise<AssetPackMutationResult> {
  const existing = await listAssetPacksForUser(openId);
  const next = existing.filter((p) => p.id !== packId);
  if (next.length === existing.length) return { ok: false, error: "Pack nicht gefunden.", retryHint: null };
  await saveAssetPacksForUser(openId, next);
  return { ok: true, packs: next };
}
