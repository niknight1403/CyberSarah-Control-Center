/**
 * Sprint 373 — Server-Seite der Ideen→Influencer-Kampagnen-Bruecke.
 *
 * Nimmt die vom Client (reine Logik, lib/campaign-bridge-logic.ts) geplanten
 * Kampagnen-Briefs an, erzeugt pro Brief mit dem Free-Tier-LLM-Pool der
 * Draft-Engine echten Persona-Content und legt ihn als pending-Entwurf in
 * die Freigabe-Queue. Kein Platzhalter, keine Simulation: Schlägt der
 * LLM-Aufruf fehl oder liefert er unbrauchbares JSON, wird der Brief
 * ehrlich mit Grund uebersprungen — nie ein Fake-Entwurf.
 *
 * Grenzen (wie die Draft-Engine, Sprint 346):
 *   - Budget: offene content-Entwuerfe <= DRAFT_MAX_PENDING_PER_KIND.
 *   - Veröffentlichung passiert nur nach menschlicher Freigabe (HITL).
 *   - Wirft NIE nach aussen — Ergebnisse sind per-Brief ok/skip.
 */
import { invokeLLM, type Message } from "./_core/llm";
import { countPendingDraftsByKind, insertPendingDraft, parseLlmJson } from "./draft-engine";
import { DRAFT_MAX_PENDING_PER_KIND, validateDraftPayload, type ContentDraftPayload } from "../lib/draft-engine-logic";
import { getInfluencerPersona } from "../lib/influencer-persona-logic";
import { BRIDGE_MAX_BRIEFS_PER_CALL } from "../lib/campaign-bridge-logic";
import { z } from "zod";

export const campaignBriefSchema = z.object({
  ideaId: z.string().min(1).max(100),
  ideaTitle: z.string().min(1).max(200),
  personaId: z.string().min(1).max(40),
  platform: z.enum(["instagram", "tiktok", "linkedin", "x", "threads", "bluesky"]),
  goal: z.enum(["aufmerksamkeit", "wachstum", "umsatz"]),
  topic: z.string().min(3).max(500),
  draftTitle: z.string().min(1).max(200),
});

export type CampaignBriefInput = z.infer<typeof campaignBriefSchema>;

export type BriefOutcome = { ideaId: string; ok: true } | { ideaId: string; ok: false; reason: string };

export type BridgeRunResult = {
  queued: number;
  skipped: number;
  outcomes: BriefOutcome[];
  /** Ehrlicher Budget-Hinweis, wenn die Freigabe-Queue voll war. */
  note: string | null;
};

export type BridgeDeps = {
  /** LLM-Aufruf — im Test injizierbar, produktiv invokeLLM (Free-Tier zuerst). */
  llm?: (messages: Message[]) => Promise<string>;
};

/** Maximale Zeichen fuer generierten Kampagnen-Content — niemand braucht 10k-Zeichen-Posts. */
const MAX_CONTENT_CHARS = 4_000;

async function generateBriefContent(llm: (messages: Message[]) => Promise<string>, brief: CampaignBriefInput): Promise<{ ok: true; content: string } | { ok: false; reason: string }> {
  const persona = getInfluencerPersona(brief.personaId as Parameters<typeof getInfluencerPersona>[0]);
  if (!persona) return { ok: false, reason: `Unbekannte Persona: ${brief.personaId}` };
  const platformLabel: Record<CampaignBriefInput["platform"], string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    x: "X",
    threads: "Threads",
    bluesky: "Bluesky",
  };
  const goalLabel: Record<CampaignBriefInput["goal"], string> = {
    aufmerksamkeit: "Aufmerksamkeit",
    wachstum: "Wachstum",
    umsatz: "Umsatz (ehrlich, ohne Kaufdruck)",
  };
  const prompt = [
    `Du bist ${persona.name}, eine transparente KI-Influencer-Persona für ${persona.niche} (Tonalität: ${persona.tonality}).`,
    `Erstelle Content für ${platformLabel[brief.platform]} zum Thema: ${brief.topic}.`,
    `Kampagnenziel: ${goalLabel[brief.goal]}. Verwende höchstens eine Catchphrase: "${persona.catchphrases[0]}".`,
    "Keine falschen Versprechen, keine garantierten Einnahmen, keine Darstellung als menschliche Person.",
    `Antworte NUR mit einem JSON-Objekt: {"personaId": "${persona.id}", "platform": "${brief.platform}", "topic": "${brief.topic.replace(/"/g, "'")}", "content": "<fertiger Content>"}`,
  ].join("\n");
  const text = await llm([{ role: "system", content: prompt }]);
  const parsed = parseLlmJson(text);
  if (!parsed) return { ok: false, reason: "Content-LLM lieferte kein auswertbares JSON." };
  const validated = validateDraftPayload("content", parsed);
  if (!validated.valid) return { ok: false, reason: validated.reason };
  const payload = validated.payload as ContentDraftPayload;
  if (payload.content.length > MAX_CONTENT_CHARS) return { ok: false, reason: "Content überschreitet die Längen-Obergrenze." };
  return { ok: true, content: payload.content };
}

/**
 * Verarbeitet bis zu BRIDGE_MAX_BRIEFS_PER_CALL Briefs nacheinander (sequenziell,
 * bewusst kein Parallel-Feuerwerk). Offene content-Quoten werden einmal pro
 * Lauf gelesen und respektiert — ist die Queue voll, werden alle uebrig
 * gebliebenen Briefs ehrlich mit Budget-Grund uebersprungen.
 */
export async function queueCampaignBriefs(briefs: CampaignBriefInput[], deps: BridgeDeps = {}): Promise<BridgeRunResult> {
  const capped = briefs.slice(0, BRIDGE_MAX_BRIEFS_PER_CALL);
  const llm =
    deps.llm ??
    (async (messages: Message[]) => {
      const result = await invokeLLM({ model: "gpt-4o-mini", maxTokens: 700, messages });
      const content = result.choices[0]?.message?.content;
      return typeof content === "string" ? content : "";
    });

  let pendingContent = 0;
  try {
    const pending = await countPendingDraftsByKind();
    if (pending === null) {
      return { queued: 0, skipped: capped.length, outcomes: capped.map((b) => ({ ideaId: b.ideaId, ok: false, reason: "Datenbank nicht konfiguriert — Brief nicht speicherbar." })), note: "DB nicht verfügbar." };
    }
    pendingContent = pending.content ?? 0;
  } catch (error) {
    return { queued: 0, skipped: capped.length, outcomes: capped.map((b) => ({ ideaId: b.ideaId, ok: false, reason: `DB nicht lesbar: ${error instanceof Error ? error.message : "unbekannt"}` })), note: "DB nicht lesbar." };
  }

  const outcomes: BriefOutcome[] = [];
  let queued = 0;
  let budgetNote: string | null = null;
  for (const brief of capped) {
    if (pendingContent + queued >= DRAFT_MAX_PENDING_PER_KIND) {
      outcomes.push({ ideaId: brief.ideaId, ok: false, reason: "Budget: zu viele offene Content-Entwürfe — bitte zuerst freigeben." });
      budgetNote = "Freigabe-Queue für Content ist voll — Brücke pausiert bis Freigaben erfolgen.";
      continue;
    }
    try {
      const generated = await generateBriefContent(llm, brief);
      if (!generated.ok) {
        outcomes.push({ ideaId: brief.ideaId, ok: false, reason: generated.reason });
        continue;
      }
      await insertPendingDraft("content", brief.draftTitle, { personaId: brief.personaId, platform: brief.platform, topic: brief.topic, content: generated.content }, "campaign-bridge");
      outcomes.push({ ideaId: brief.ideaId, ok: true });
      queued += 1;
    } catch (error) {
      outcomes.push({ ideaId: brief.ideaId, ok: false, reason: error instanceof Error ? error.message : "unbekannter Fehler" });
    }
  }

  return { queued, skipped: capped.length - queued, outcomes, note: budgetNote };
}
