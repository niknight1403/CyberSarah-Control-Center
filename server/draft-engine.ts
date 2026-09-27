/**
 * Sprint 346 — Autonome Draft-Engine (Server-Seite).
 *
 * Erzeugt taeglich Entwuerfe fuer Content (Influencer-Personas),
 * Revenue-Loops und Ideen-Inbox — ABER: alles landet nur mit Status
 * "pending" in der Freigabe-Queue. Veroeffentlichen, aktivieren oder
 * einpflegen passiert erst nach menschlicher Freigabe (HITL).
 *
 * Ehrlichkeit: faellt der LLM-Aufruf aus oder liefert er unvollstaendige
 * Ergebnisse, wird die Art uebersprungen und im Lauf-Bericht vermerkt —
 * keine Fake-Entwuerfe, keine stillen Fehler.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "./db";
import { draftQueue, type DraftQueueRow, type InsertDraftQueueRow } from "../drizzle/schema";
import {
  DRAFT_KINDS,
  DRAFT_MAX_PENDING_PER_KIND,
  planDraftRun,
  validateDraftPayload,
  type DraftKind,
  type DraftPayloadByKind,
  type DraftRunPlan,
  type DraftStatus,
} from "../lib/draft-engine-logic";
import { INFLUENCER_PERSONAS } from "../lib/influencer-persona-logic";
import { invokeLLM, type Message } from "./_core/llm";

/** Taeglich rotierende Themen-Samen — deterministisch, kein Zufall. */
const CONTENT_TOPIC_SEEDS = [
  "KI-Agenten im Alltag: was heute schon funktioniert",
  "Wie kleine Teams mit Automatisierung Zeit gewinnen",
  "Ehrliche Einblicke in den Aufbau eines digitalen Produkts",
  "Produktivität ohne Burnout: Systeme statt Disziplin",
  "Geld verstehen: Risiken zuerst denken",
  "Creator-Wirtschaft: Aufmerksamkeit planbar machen",
] as const;

const CONTENT_PLATFORMS = ["instagram", "tiktok", "linkedin", "x", "threads", "bluesky"] as const;

function seedIndexForDay(nowMs: number, offset: number): number {
  return Math.floor(nowMs / 86_400_000 + offset) % CONTENT_TOPIC_SEEDS.length;
}

export function parseLlmJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

export type DraftEngineRunResult = {
  plan: DraftRunPlan[];
  generated: Partial<Record<DraftKind, number>>;
  skipped: { kind: DraftKind; reason: string }[];
};

export type DraftEngineDeps = {
  /** LLM-Aufruf — im Test injizierbar, produktiv invokeLLM. */
  llm?: (messages: Message[]) => Promise<string>;
  /** Injectierbare Zeit (Tests); produktiv Date.now(). */
  now?: () => number;
};

/** Zaehlt offene Entwuerfe pro Art (Null bei fehlender DB — ehrlich). */
export async function countPendingDraftsByKind(): Promise<Record<DraftKind, number> | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ kind: draftQueue.kind, open: sql<number>`count(*)::int` })
    .from(draftQueue)
    .where(eq(draftQueue.status, "pending"))
    .groupBy(draftQueue.kind);
  const counts = { content: 0, "revenue-loop": 0, idea: 0 } as Record<DraftKind, number>;
  for (const row of rows) counts[row.kind as DraftKind] = row.open;
  return counts;
}

export async function insertPendingDraft(kind: DraftKind, title: string, payload: DraftPayloadByKind[DraftKind], createdBy: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Entwurf nicht speicherbar.");
  const row: InsertDraftQueueRow = { kind, title, payload, status: "pending", createdBy };
  await db.insert(draftQueue).values(row);
}

async function generateContentDraft(llm: (messages: Message[]) => Promise<string>, nowMs: number, slotOffset: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const persona = INFLUENCER_PERSONAS[(Math.floor(nowMs / 86_400_000) + slotOffset) % INFLUENCER_PERSONAS.length];
  const platform = CONTENT_PLATFORMS[slotOffset % CONTENT_PLATFORMS.length];
  const topic = CONTENT_TOPIC_SEEDS[seedIndexForDay(nowMs, slotOffset)];
  const prompt = [
    `Du bist ${persona.name}, eine transparente KI-Influencer-Persona fuer ${persona.niche} (Tonalitaet: ${persona.tonality}).`,
    `Erstelle Content fuer ${platform} zum Thema: ${topic}.`,
    "Keine falschen Versprechen, keine garantierten Einnahmen, keine Darstellung als menschliche Person.",
    'Antworte NUR mit einem JSON-Objekt: {"personaId": "' + persona.id + '", "platform": "' + platform + '", "topic": "<Thema>", "content": "<fertiger Content>"}',
  ].join("\n");
  const text = await llm([{ role: "system", content: prompt }]);
  const parsed = parseLlmJson(text);
  if (!parsed) return { ok: false, reason: "Content-LLM lieferte kein auswertbares JSON." };
  const validated = validateDraftPayload("content", parsed);
  if (!validated.valid) return { ok: false, reason: validated.reason };
  await insertPendingDraft("content", validated.title, validated.payload, "draft-engine");
  return { ok: true };
}

async function generateRevenueLoopDraft(llm: (messages: Message[]) => Promise<string>, nowMs: number, slotOffset: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const prompt = [
    "Du bist der Revenue-OS-Analyst des CyberSarah Control Centers.",
    "Entwirf EINE konkrete, testbare Einnahme-Hypothese fuer ein KI-Produkt (App, Template, Micro-Service oder digitales Produkt).",
    "Vollstaendig ehrlich: keine erfundenen Zahlen, keine garantierten Einnahmen.",
    "Antworte NUR mit einem JSON-Objekt: {\"name\": \"<Kurzname>\", \"hypothesis\": \"<1-2 Saetze Hypothese>\", \"stages\": [\"<Stufe 1>\", \"<Stufe 2>\", \"<Stufe 3>\"], \"metric\": \"<Erfolgsmetrik>\"}",
  ].join("\n");
  const text = await llm([{ role: "system", content: prompt }]);
  const parsed = parseLlmJson(text);
  if (!parsed) return { ok: false, reason: "Revenue-Loop-LLM lieferte kein auswertbares JSON." };
  const validated = validateDraftPayload("revenue-loop", parsed);
  if (!validated.valid) return { ok: false, reason: validated.reason };
  await insertPendingDraft("revenue-loop", validated.title, validated.payload, "draft-engine");
  return { ok: true };
}

async function generateIdeaDraft(llm: (messages: Message[]) => Promise<string>, nowMs: number, slotOffset: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const prompt = [
    "Du bist der Ideen-Scout des CyberSarah Control Centers (KI-Assistent-App mit Chat, Superagenten, Revenue-OS und Ideen-Inbox).",
    "Schlage EINE konkrete Produkt- oder Feature-Idee vor, die in unter 2 Wochen umsetzbar waere.",
    "Antworte NUR mit einem JSON-Objekt: {\"note\": \"<Idee in einem Satz>\", \"rationale\": \"<Warum diese Idee jetzt: 1-2 Saetze>\"}",
  ].join("\n");
  const text = await llm([{ role: "system", content: prompt }]);
  const parsed = parseLlmJson(text);
  if (!parsed) return { ok: false, reason: "Ideen-LLM lieferte kein auswertbares JSON." };
  const validated = validateDraftPayload("idea", parsed);
  if (!validated.valid) return { ok: false, reason: validated.reason };
  await insertPendingDraft("idea", validated.title, validated.payload, "draft-engine");
  return { ok: true };
}

/**
 * Ein Lauf der Engine: plant nach offenen Quoten, erzeugt bis zu den
 * Slots pro Art neue pending-Entwuerfe. Wirft NIE (Cron-sicher) —
 * Fehler landen als skipped-Eintraege im Bericht.
 */
export async function runDraftEngine(deps: DraftEngineDeps = {}): Promise<DraftEngineRunResult> {
  const nowMs = (deps.now ?? Date.now)();
  const llm = deps.llm ?? (async (messages: Message[]) => {
    const result = await invokeLLM({ model: "gpt-4o-mini", maxTokens: 700, messages });
    const content = result.choices[0]?.message?.content;
    return typeof content === "string" ? content : "";
  });

  const result: DraftEngineRunResult = { plan: [], generated: {}, skipped: [] };
  let pending: Record<DraftKind, number> | null = null;
  try {
    pending = await countPendingDraftsByKind();
  } catch (error) {
    result.skipped.push({ kind: "idea", reason: `DB nicht lesbar: ${error instanceof Error ? error.message : "unbekannt"}` });
    return result;
  }
  if (pending === null) {
    result.skipped.push({ kind: "idea", reason: "Datenbank nicht konfiguriert — Lauf abgebrochen." });
    return result;
  }

  result.plan = planDraftRun(pending, DRAFT_MAX_PENDING_PER_KIND);
  for (const entry of result.plan) {
    if (entry.slots <= 0) continue;
    let okCount = 0;
    for (let slot = 0; slot < entry.slots; slot++) {
      try {
        const outcome =
          entry.kind === "content"
            ? await generateContentDraft(llm, nowMs, slot)
            : entry.kind === "revenue-loop"
              ? await generateRevenueLoopDraft(llm, nowMs, slot)
              : await generateIdeaDraft(llm, nowMs, slot);
        if (outcome.ok) okCount++;
        else result.skipped.push({ kind: entry.kind, reason: outcome.reason });
      } catch (error) {
        result.skipped.push({ kind: entry.kind, reason: error instanceof Error ? error.message : "unbekannter Fehler" });
      }
    }
    if (okCount > 0) result.generated[entry.kind] = okCount;
  }
  return result;
}

/** Liste der Queue (pending + entschieden), neueste zuerst, begrenzt. */
export async function listDraftQueue(limit = 50): Promise<DraftQueueRow[]> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Freigabe-Queue nicht lesbar.");
  return db.select().from(draftQueue).orderBy(desc(draftQueue.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
}

/** Menschliche Entscheidung nachtragen — nur ueber den Router aufrufbar. */
export async function decideDraft(id: number, action: "approve" | "reject", decidedBy: string): Promise<DraftQueueRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Entscheidung nicht speicherbar.");
  const status: DraftStatus = action === "approve" ? "approved" : "rejected";
  const [row] = await db
    .update(draftQueue)
    .set({ status, decidedAt: new Date(), decidedBy })
    .where(and(eq(draftQueue.id, id), eq(draftQueue.status, "pending")))
    .returning();
  return row ?? null;
}
