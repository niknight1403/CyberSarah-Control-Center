/**
 * AI-Grafik-Designer-Agent (Serverseite).
 *
 * Nutzt den zentralen LLM-Provider-Router (server/_core/llm.ts — Managed-
 * Pool mit allen konfigurierten Cloud-/Lokal-Providern) um App-Grafiken zu
 * entwerfen: Icons, Logos, Splash-Screens, Banner, Illustrationen (SVG)
 * und Design-Tokens (JSON). Ergebnisse werden validiert (designer-logic)
 * und dauerhaft in der DB abgelegt (KV ueber modelRouterSettings — kein
 * Schema-Migration noetig, gleiches Muster wie der Orchestrator-Ledger).
 */

import { randomUUID } from "crypto";
import { getModelRouterSetting, setModelRouterSetting } from "../db";
import { invokeLLM, type InvokeResult, type Message } from "../_core/llm";
import {
  DESIGN_ASSET_TYPE_META,
  buildDesignPrompt,
  designAssetFileName,
  validateDesignAsset,
  type DesignAssetType,
} from "../../lib/designer-logic";

const INDEX_KEY = "design.assetIndex";

/** Extrahiert die Textantwort aus einem InvokeResult (string- oder Part-Form). */
function extractInvokeResultContent(result: InvokeResult): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part && "text" in part && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
const ASSET_KEY_PREFIX = "design.asset.";
const MAX_INDEX_ENTRIES = 100;

export interface DesignAssetRecord {
  id: string;
  type: DesignAssetType;
  name: string;
  fileName: string;
  prompt: string;
  content: string;
  format: "svg" | "json";
  model: string | null;
  createdAt: string;
}

interface AssetIndexEntry {
  id: string;
  type: DesignAssetType;
  name: string;
  fileName: string;
  format: "svg" | "json";
  createdAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Generiert ein Design-Asset autonom: LLM → Validierung → Persistenz. */
export async function generateDesignAsset(input: {
  type: DesignAssetType;
  description: string;
  brandName?: string;
}): Promise<DesignAssetRecord> {
  const prompt = buildDesignPrompt({
    type: input.type,
    description: input.description,
    brandName: input.brandName,
  });

  const messages: Message[] = [
    { role: "system", content: prompt },
    { role: "user", content: input.description?.trim() || "Entwirf das Asset nach den Design-Regeln." },
  ];

  const result = await invokeLLM({ messages, maxTokens: 4_000 });
  const rawContent = extractInvokeResultContent(result);

  const validated = validateDesignAsset(input.type, rawContent);
  if (!validated.ok) {
    throw new Error(
      `Der Designer-Entwurf war unbrauchbar (${validated.error}). Beschreibung praezisieren und erneut versuchen.`,
    );
  }

  const id = randomUUID();
  const name = (input.description ?? "").trim().slice(0, 60) || DESIGN_ASSET_TYPE_META[input.type].label;
  const record: DesignAssetRecord = {
    id,
    type: input.type,
    name,
    fileName: designAssetFileName(input.type, name, id),
    prompt: input.description ?? "",
    content: validated.content,
    format: DESIGN_ASSET_TYPE_META[input.type].format,
    model: result.model ?? null,
    createdAt: nowIso(),
  };

  await persistAsset(record);
  return record;
}

/** Persistiert ein Asset + Index-Eintrag (KV, neueste zuerst, begrenzt). */
async function persistAsset(record: DesignAssetRecord): Promise<void> {
  await setModelRouterSetting(`${ASSET_KEY_PREFIX}${record.id}`, record);
  const index = ((await getModelRouterSetting<AssetIndexEntry[]>(INDEX_KEY)) ?? []) as AssetIndexEntry[];
  const entry: AssetIndexEntry = {
    id: record.id,
    type: record.type,
    name: record.name,
    fileName: record.fileName,
    format: record.format,
    createdAt: record.createdAt,
  };
  const next = [entry, ...index.filter((e) => e && e.id !== record.id)].slice(0, MAX_INDEX_ENTRIES);
  await setModelRouterSetting(INDEX_KEY, next);
}

/** Galerie: Assets (neueste zuerst), optional ohne Inhalts-Payload. */
export async function listDesignAssets(options?: { includeContent?: boolean; limit?: number }): Promise<DesignAssetRecord[]> {
  const index = ((await getModelRouterSetting<AssetIndexEntry[]>(INDEX_KEY)) ?? []) as AssetIndexEntry[];
  const limit = Math.max(1, Math.min(options?.limit ?? 50, MAX_INDEX_ENTRIES));
  const entries = index.slice(0, limit);
  const assets: DesignAssetRecord[] = [];
  for (const entry of entries) {
    const record = await getModelRouterSetting<DesignAssetRecord>(`${ASSET_KEY_PREFIX}${entry.id}`);
    if (!record) continue; // Index-Eintrag ohne Payload — still uebergehen.
    assets.push(options?.includeContent ? record : { ...record, content: "" });
  }
  return assets;
}

/** Loescht ein Asset (Index + Payload) — Idempotent. */
export async function deleteDesignAsset(id: string): Promise<boolean> {
  const record = await getModelRouterSetting<DesignAssetRecord>(`${ASSET_KEY_PREFIX}${id}`);
  if (!record) return false;
  const index = ((await getModelRouterSetting<AssetIndexEntry[]>(INDEX_KEY)) ?? []) as AssetIndexEntry[];
  await setModelRouterSetting(INDEX_KEY, index.filter((e) => e.id !== id));
  await setModelRouterSetting(`${ASSET_KEY_PREFIX}${id}`, null);
  return true;
}
