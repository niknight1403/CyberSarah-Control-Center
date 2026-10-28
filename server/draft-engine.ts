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
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "./db";
import { draftQueue, type DraftQueueRow, type InsertDraftQueueRow } from "../drizzle/schema";
import {
  DRAFT_KINDS,
  DRAFT_MAX_PENDING_BY_KIND,
  REVENUE_HUBS,
  revenueDraftHub,
  planDraftRun,
  validateDraftPayload,
  type DraftKind,
  type DraftPayloadByKind,
  type DraftRunPlan,
  type DraftStatus,
  type RevenueHub,
  type RevenueLoopDraftPayload,
} from "../lib/draft-engine-logic";
import { INFLUENCER_PERSONAS, buildInfluencerPrompt } from "../lib/influencer-persona-logic";
import { invokeLLM, type Message } from "./_core/llm";
import { openAiCompatibleChatUrl } from "../lib/managed-llm-fallback-logic";

async function callDraftChatEndpoint(
  url: string,
  model: string,
  messages: Message[],
  headers: Record<string, string> = {},
  apiKey?: string,
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 700 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("LLM lieferte keinen Text.");
  return content.trim();
}

/** Local-first, danach ausschliesslich konfigurierte kostenlose Cloud-Route. */
async function defaultDraftLlm(messages: Message[]): Promise<string> {
  // Gemini/OpenAI-kompatible Gateways brauchen mindestens eine echte User-
  // Nachricht. Reine System-Prompts funktionieren bei manchen Providern,
  // fuehren bei Gemini aber zu "contents is not specified".
  const routedMessages: Message[] = messages.some((message) => message.role !== "system")
    ? messages
    : [...messages, { role: "user", content: "Erstelle die angeforderte Ausgabe jetzt exakt im geforderten JSON-Format." }];
  const ollamaBase = (process.env.AI_OLLAMA_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
  try {
    return await callDraftChatEndpoint(
      openAiCompatibleChatUrl(ollamaBase),
      process.env.AI_OLLAMA_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b",
      routedMessages,
    );
  } catch {
    // Derselbe zentrale Router wie der KI-Chat: kostenlose Provider-Kette,
    // Health-/Quota-Rotation und Modell-Fallback. Kein zweiter URL-Pfad mehr,
    // der von der produktiven Router-Konfiguration abweichen kann.
    const result = await invokeLLM({ messages: routedMessages, maxTokens: 700 });
    const content = result.choices[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Zentraler LLM-Router lieferte keinen Text.");
    }
    return content.trim();
  }
}

/** Taeglich rotierende Themen-Samen — deterministisch, kein Zufall. */
export const CONTENT_TOPIC_SEEDS = [
  "KI-Agenten im Alltag: was heute schon funktioniert",
  "Wie kleine Teams mit Automatisierung Zeit gewinnen",
  "Ehrliche Einblicke in den Aufbau eines digitalen Produkts",
  "Produktivität ohne Burnout: Systeme statt Disziplin",
  "Geld verstehen: Risiken zuerst denken",
  "Creator-Wirtschaft: Aufmerksamkeit planbar machen",\n  "Community-Aufbau: aus Zuschauern aktive Teilnehmer machen",\n  "Short-Video-Hooks: Neugier ohne Clickbait erzeugen",\n  "Vertrauen durch transparente KI-Kommunikation aufbauen",\n  "Social SEO: Inhalte fuer Suche und Empfehlungen strukturieren",\n  "Content-Serien: Wiedererkennung und Bindung systematisch steigern",\n  "Audience Affinity: Themen enger an echte Zielgruppenprobleme koppeln",
] as const;

export const CONTENT_PLATFORMS = ["instagram", "tiktok", "linkedin", "x", "threads", "bluesky"] as const;

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

function isRetryableProviderLimit(reason: string): boolean {
  return /\b429\b|quota|rate.?limit|resource_exhausted|too many requests/i.test(reason);
}

export type DraftEngineDeps = {
  /** LLM-Aufruf — im Test injizierbar, produktiv invokeLLM. */
  llm?: (messages: Message[]) => Promise<string>;
  /** Injectierbare Zeit (Tests); produktiv Date.now(). */
  now?: () => number;
};

type PendingDraftCoverage = {
  counts: Record<DraftKind, number>;
  revenueHubs: Set<RevenueHub>;
};

/** Offene Entwuerfe plus Revenue-Hub-Abdeckung. Legacy-Loops zaehlen zu "loop". */
async function pendingDraftCoverage(): Promise<PendingDraftCoverage | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ kind: draftQueue.kind, payload: draftQueue.payload })
    .from(draftQueue)
    .where(eq(draftQueue.status, "pending"));
  const counts = { content: 0, "revenue-loop": 0, idea: 0 } as Record<DraftKind, number>;
  const revenueHubs = new Set<RevenueHub>();
  for (const row of rows) {
    const kind = row.kind as DraftKind;
    if (kind === "revenue-loop") revenueHubs.add(revenueDraftHub(row.payload));
    else counts[kind] += 1;
  }
  counts["revenue-loop"] = revenueHubs.size;
  return { counts, revenueHubs };
}

/** Zaehlt offene Entwuerfe pro Art; Revenue-Loops nach abgedeckten Hubs. */
export async function countPendingDraftsByKind(): Promise<Record<DraftKind, number> | null> {
  return (await pendingDraftCoverage())?.counts ?? null;
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
    buildInfluencerPrompt(persona, topic, platform),
    "Der Content muss den KI-Charakter transparent halten und darf keine erfundenen persoenlichen Erlebnisse enthalten.",
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

const REVENUE_HUB_BRIEFS: Record<RevenueHub, string> = {
  hara: "HARA: formuliere eine konkrete, pruefbare Revenue-Chance oder Kampagnen-Hypothese. Keine erfundenen Live-Zahlen.",
  saas: "SaaS: entwirf eine Produkt-, Abo-, Funnel- oder Retention-Verbesserung mit messbarer Kennzahl.",
  loop: "Loop Engineering: entwirf ein Cross-Sell-, Expansion- oder Feedback-Loop-Experiment mit klaren Stufen.",
  trading: "Micro Trading: entwirf ausschliesslich eine Marktbeobachtungs-/Analyse-Hypothese. Keine Orderausfuehrung und keine Renditegarantie.",
};

async function generateRevenueLoopDraft(
  llm: (messages: Message[]) => Promise<string>,
  nowMs: number,
  slotOffset: number,
  hubOverride?: RevenueHub,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const hub = hubOverride ?? REVENUE_HUBS[slotOffset % REVENUE_HUBS.length]!;
  const prompt = [
    "Du bist der Revenue-OS-Analyst des CyberSarah Control Centers.",
    REVENUE_HUB_BRIEFS[hub],
    "Vollstaendig ehrlich: keine erfundenen Zahlen, keine garantierten Einnahmen.",
    "Der Entwurf bleibt bis zur Freigabe rein planerisch.",
    "Antworte NUR mit einem JSON-Objekt: {\"hub\": \"" + hub + "\", \"name\": \"<Kurzname>\", \"hypothesis\": \"<1-2 Saetze Hypothese>\", \"stages\": [\"<Stufe 1>\", \"<Stufe 2>\", \"<Stufe 3>\"], \"experiment\": \"<konkreter Test, mindestens 10 Zeichen>\", \"metric\": \"<Erfolgsmetrik>\", \"unit\": \"<Einheit>\", \"targetValue\": <positive Zahl>, \"currentValue\": 0}",
  ].join("\n");
  const text = await llm([{ role: "system", content: prompt }]);
  const parsed = parseLlmJson(text);
  if (!parsed) return { ok: false, reason: "Revenue-Loop-LLM lieferte kein auswertbares JSON." };
  const validated = validateDraftPayload("revenue-loop", parsed);
  if (!validated.valid) return { ok: false, reason: validated.reason };
  const loop = validated.payload as RevenueLoopDraftPayload;
  if (!loop.experiment || !loop.unit || typeof loop.targetValue !== "number") {
    return { ok: false, reason: "Revenue-Loop-LLM lieferte keinen ausfuehrbaren Experiment-/Zielplan." };
  }
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
  const llm = deps.llm ?? defaultDraftLlm;

  const result: DraftEngineRunResult = { plan: [], generated: {}, skipped: [] };
  let coverage: PendingDraftCoverage | null = null;
  try {
    coverage = await pendingDraftCoverage();
  } catch (error) {
    result.skipped.push({ kind: "idea", reason: `DB nicht lesbar: ${error instanceof Error ? error.message : "unbekannt"}` });
    return result;
  }
  if (coverage === null) {
    result.skipped.push({ kind: "idea", reason: "Datenbank nicht konfiguriert — Lauf abgebrochen." });
    return result;
  }

  result.plan = planDraftRun(coverage.counts, DRAFT_MAX_PENDING_BY_KIND);
  let providerDeferred = false;
  for (const entry of result.plan) {
    if (entry.slots <= 0) continue;
    let okCount = 0;
    const missingRevenueHubs = entry.kind === "revenue-loop"
      ? REVENUE_HUBS.filter((hub) => !coverage!.revenueHubs.has(hub))
      : [];
    const perRunLimit = entry.kind === "content" ? INFLUENCER_PERSONAS.length * 2 : entry.kind === "idea" ? 4 : missingRevenueHubs.length;
    const slots = entry.kind === "revenue-loop"
      ? Math.min(entry.slots, missingRevenueHubs.length)
      : Math.min(entry.slots, perRunLimit);
    for (let slot = 0; slot < slots; slot++) {
      try {
        const outcome =
          entry.kind === "content"
            ? await generateContentDraft(llm, nowMs, slot)
            : entry.kind === "revenue-loop"
              ? await generateRevenueLoopDraft(llm, nowMs, slot, missingRevenueHubs[slot])
              : await generateIdeaDraft(llm, nowMs, slot);
        if (outcome.ok) okCount++;
        else {
          result.skipped.push({ kind: entry.kind, reason: outcome.reason });
          if (isRetryableProviderLimit(outcome.reason)) {
            providerDeferred = true;
            break;
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unbekannter Fehler";
        result.skipped.push({ kind: entry.kind, reason });
        if (isRetryableProviderLimit(reason)) {
          providerDeferred = true;
          break;
        }
      }
    }
    if (okCount > 0) result.generated[entry.kind] = okCount;
    if (providerDeferred) break;
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
