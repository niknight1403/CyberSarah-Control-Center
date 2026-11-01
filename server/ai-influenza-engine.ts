/**
 * Sprint 3 — AI Influenza Agenten-Engine (Live-Ausführung).
 *
 * Verantwortung:
 *  - Agenten-Registry idempotent anlegen (8 Rollen).
 *  - Aufgaben idempotent einreihen (Doppel-Enqueue wird verhindert).
 *  - Aufgaben atomar claimen (UPDATE ... WHERE status='queued'), damit bei
 *    parallelen Aufrufen keine Doppelausführung entsteht.
 *  - Ausführung über den vorhandenen LLM-Router (Ollama-First, Cloud-Fallback).
 *  - Ergebnis, Ereignisse, Zähler und Fehler ehrlich persistieren.
 *
 * Bewusste Grenzen (Sprint 3): Es gibt noch KEINE externen Aktionen
 * (Versand, Veröffentlichung, Zahlung). Freigabepflichtige Aufgabentypen
 * enden auf 'freigabe_offen' und warten auf einen Menschen.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "./db";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** getDb() kann ohne konfigurierte Datenbank null liefern — hier hart abbrechen. */
async function requireDb(): Promise<AppDb> {
  const db: AppDb | null = await getDb();
  if (!db) throw new Error("Datenbank nicht verfügbar (DATABASE_URL fehlt)");
  return db;
}
import { invokeLLM } from "./_core/llm";
import {
  aiAgenten,
  aiAufgaben,
  aiAufgabenEreignisse,
  type AiAufgabeRow,
} from "../drizzle/schema";
import {
  AI_AGENTEN,
  AUFGABE_TYPEN,
  agentFuerAufgabe,
  baueIdempotenzKey,
  darfAufgabeWechseln,
  findAufgabeTyp,
  planeLlmVersuche,
  statusNachAusfuehrung,
  waehleNaechsteAufgabe,
  type AufgabeStatus,
} from "../lib/ai-influenza-orchestrator-logic";

type LlmAntwort = { text: string; quelle: "ollama" | "cloud"; modell: string };

/** Ruft einen lokalen Ollama-Knoten OpenAI-kompatibel auf (0 Cent). */
async function rufeOllama(baseUrl: string, modell: string, system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OLLAMA_API_KEY?.trim() || "ollama"}`,
      },
      body: JSON.stringify({
        model: modell,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Ollama lieferte eine leere Antwort");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Ollama zuerst, Cloud-Kette nur als Fallback (Standing Instruction Ollama-First). */
async function erzeugeText(system: string, user: string): Promise<LlmAntwort> {
  const plan = planeLlmVersuche({
    ollamaBaseUrl: process.env.AI_OLLAMA_BASE_URL ?? process.env.OLLAMA_BASE_URL,
    ollamaModell: process.env.OLLAMA_MODEL,
    nurLokal: process.env.AI_INFLUENZA_NUR_LOKAL === "true",
  });
  const fehler: string[] = [];
  for (const schritt of plan) {
    try {
      if (schritt.quelle === "ollama") {
        const text = await rufeOllama(schritt.baseUrl!, schritt.modell!, system, user);
        return { text, quelle: "ollama", modell: schritt.modell! };
      }
      const llm = await invokeLLM({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const text = extrahiereText(llm).trim();
      if (!text) throw new Error("Cloud-LLM lieferte eine leere Antwort");
      return { text, quelle: "cloud", modell: "managed-kette" };
    } catch (err) {
      fehler.push(`${schritt.quelle}: ${err instanceof Error ? err.message.slice(0, 160) : "Fehler"}`);
    }
  }
  throw new Error(`Alle LLM-Quellen fehlgeschlagen (${fehler.join(" | ")})`);
}

/** Prompt-Rahmen je Aufgabentyp (deutsch, geschäftsorientiert, ohne Floskeln). */
const PROMPT_RAHMEN: Record<string, string> = {
  angebot_entwurf:
    "Du bist Vertrieb im KI-Marketing-Team. Erstelle einen konkreten Angebotsentwurf auf Deutsch: Leistungsumfang, Nutzenargumente entlang der genannten Kundensituation, Preis, Laufzeit und ein klarer nächster Schritt. Keine erfundenen Referenzen, keine Umsatzgarantien.",
  lead_recherche:
    "Du unterstützt bei der Lead-Recherche. Beschreibe, welche öffentlich verfügbaren Signale den genannten Zielkunden qualifizieren (Bedarf, Budget-Hinweise, Ansprechpartner-Rollen) und welche DSGVO-konforme Kontaktaufnahme zulässig wäre. Erfinde keine Namen oder Kontaktdaten.",
  marktanalyse:
    "Du bist Marktanalyst. Analysiere die genannte Nische auf Deutsch: Kundenprobleme, Wettbewerbslage, realistische Preisbereitschaft, drei konkrete Positionierungsansätze. Kennzeichne Annahmen klar als Annahmen.",
  kunden_report:
    "Du bist Customer Success. Erstelle einen kurzen Fortschrittsbericht auf Deutsch: aktueller Stand, erledigte Schritte, nächste Schritte, Risiken. Nur Fakten aus der Eingabe, nichts dazuerfinden.",
  content_erstellen:
    "Du bist Content-Produzent. Erstelle für die genannte Zielgruppe drei Social-Media-Beiträge auf Deutsch mit starkem Hook, konkretem Nutzen und Call-to-Action. Keine erfundenen Statistiken.",
  video_skript:
    "Du bist Video-Autor. Erstelle ein Skript für ein 30-Sekunden-Kurzvideo auf Deutsch: Hook, Problem, Lösung, CTA. Szenen knapp beschreiben, Untertitel-freundlich formulieren.",
  profit_analyse:
    "Du bist Profit-Optimizer. Analysiere auf Deutsch: Umsatz, Kosten, Deckungsbeitrag, drei konkrete Optimierungshebel. Rechne nur mit den gelieferten Zahlen und benenne fehlende Daten klar.",
  preis_vorschlag:
    "Du bist Pricing-Analyst. Unterbreite auf Deutsch einen begründeten Preisvorschlag samt Begründung, Risiken und Testempfehlung. Änderungen an Bestandskunden bedürfen ausdrücklich der Freigabe durch einen Menschen.",
  orchestrierung:
    "Du bist CEO-Orchestrator. Priorisiere die genannten offenen Aufgaben strikt nach Umsatzwirkung (Revenue First) und begründe die Reihenfolge in drei Sätzen. Nenne, was bewusst zurückgestellt wird.",
};

const SYSTEM_PROMPT =
  "Du bist Teil eines KI-Marketing-Teams. Antworte ausschließlich auf Deutsch, präzise, ohne Floskeln. Erfinde niemals Zahlen, Kunden, Referenzen oder Zitate. Wenn Daten fehlen, benenne die Lücke ausdrücklich.";

/** Legt die acht Agenten an bzw. aktualisiert Name/Rolle (idempotent). */
export async function ensureAgenten(): Promise<{ angelegt: number; gesamt: number }> {
  const db = await requireDb();
  let angelegt = 0;
  for (const agent of AI_AGENTEN) {
    const existing = await db.select({ id: aiAgenten.id }).from(aiAgenten).where(eq(aiAgenten.typ, agent.typ)).limit(1);
    if (existing.length > 0) {
      await db.update(aiAgenten).set({ name: agent.name, rolle: agent.rolle }).where(eq(aiAgenten.typ, agent.typ));
    } else {
      await db.insert(aiAgenten).values({ typ: agent.typ, name: agent.name, rolle: agent.rolle });
      angelegt += 1;
    }
  }
  const gesamt = await db.select({ anzahl: sql<number>`count(*)::int` }).from(aiAgenten);
  return { angelegt, gesamt: gesamt[0]?.anzahl ?? 0 };
}

export interface AufgabeAnlegenInput {
  aufgabeTyp: string;
  eingabe?: Record<string, unknown>;
  titel?: string;
  erstelltVon?: string;
}

/** Reiht eine Aufgabe idempotent ein (Doppel-Enqueue liefert die bestehende Zeile). */
export async function legeAufgabeAn(input: AufgabeAnlegenInput): Promise<{
  angelegt: boolean;
  aufgabe: AiAufgabeRow;
}> {
  const typ = findAufgabeTyp(input.aufgabeTyp);
  if (!typ) throw new Error(`Unbekannter Aufgabentyp: ${input.aufgabeTyp}`);
  const agentTyp = agentFuerAufgabe(input.aufgabeTyp);
  if (!agentTyp) throw new Error(`Kein Agent für Aufgabentyp ${input.aufgabeTyp}`);
  const eingabe = input.eingabe ?? {};
  const key = baueIdempotenzKey(input.aufgabeTyp, eingabe);

  const db = await requireDb();
  const vorhanden = await db.select().from(aiAufgaben).where(eq(aiAufgaben.idempotenzKey, key)).limit(1);
  if (vorhanden.length > 0) return { angelegt: false, aufgabe: vorhanden[0] };

  const inserted = await db
    .insert(aiAufgaben)
    .values({
      agentTyp,
      aufgabeTyp: input.aufgabeTyp,
      titel: input.titel?.trim() || typ.titel,
      eingabe,
      prioritaet: typ.prioritaet,
      erfordertFreigabe: typ.freigabePflichtig,
      idempotenzKey: key,
      erstelltVon: input.erstelltVon?.trim() || "admin",
    })
    .returning();
  const aufgabe = inserted[0];
  await db.insert(aiAufgabenEreignisse).values({
    aufgabeId: aufgabe.id,
    zuStatus: "queued",
    agentTyp,
    nachricht: `Eingereiht (Priorität ${typ.prioritaet}${typ.freigabePflichtig ? ", freigabepflichtig" : ""})`,
  });
  return { angelegt: true, aufgabe };
}

function extrahiereText(result: unknown): string {
  const anyResult = result as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const content = anyResult?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

/** Führt genau eine Aufgabe aus (atomarer Claim, LLM, Persistenz). */
export async function fuehreAufgabeAus(aufgabeId: number): Promise<{
  ausgefuehrt: boolean;
  status?: AufgabeStatus;
  ergebnis?: string;
  grund?: string;
}> {
  const db = await requireDb();
  const gestartet = Date.now();

  // Atomarer Claim: genau ein Ausführer gewinnt, alle anderen sehen 0 Zeilen.
  const claimed = await db
    .update(aiAufgaben)
    .set({ status: "running", versuche: sql`${aiAufgaben.versuche} + 1`, gestartetAm: new Date() })
    .where(and(eq(aiAufgaben.id, aufgabeId), eq(aiAufgaben.status, "queued")))
    .returning();
  const aufgabe = claimed[0];
  if (!aufgabe) return { ausgefuehrt: false, grund: "nicht_queued" };

  const rahmen = PROMPT_RAHMEN[aufgabe.aufgabeTyp] ?? "Erfülle die folgende Aufgabe präzise auf Deutsch.";
  const nutzEingabe = JSON.stringify(aufgabe.eingabe ?? {}, null, 2);

  let status: AufgabeStatus;
  let ergebnis: string | null = null;
  let fehler: string | null = null;
  let llmQuelle = "unbekannt";
  try {
    const antwort = await erzeugeText(
      SYSTEM_PROMPT,
      `${rahmen}\n\nAufgabe: ${aufgabe.titel}\nEingabe (JSON):\n${nutzEingabe}`,
    );
    ergebnis = antwort.text;
    llmQuelle = `${antwort.quelle}:${antwort.modell}`;
    status = statusNachAusfuehrung(aufgabe.aufgabeTyp);
  } catch (err) {
    fehler = err instanceof Error ? err.message.slice(0, 800) : "Unbekannter Fehler";
    status = "fehlgeschlagen";
  }

  const beendetAm = new Date();
  await db
    .update(aiAufgaben)
    .set({
      status,
      ergebnis,
      fehler,
      beendetAm,
      dauerMs: Date.now() - gestartet,
    })
    .where(eq(aiAufgaben.id, aufgabeId));

  await db.insert(aiAufgabenEreignisse).values({
    aufgabeId,
    vonStatus: "running",
    zuStatus: status,
    agentTyp: aufgabe.agentTyp,
    nachricht: fehler ? `Fehlgeschlagen: ${fehler}` : `Ausgeführt via ${llmQuelle} (${Date.now() - gestartet} ms)`,
  });

  await db
    .update(aiAgenten)
    .set(
      status === "fehlgeschlagen"
        ? { fehlerAnzahl: sql`${aiAgenten.fehlerAnzahl} + 1`, letzteAktivitaet: beendetAm }
        : { ausgefuehrtAufgaben: sql`${aiAgenten.ausgefuehrtAufgaben} + 1`, letzteAktivitaet: beendetAm },
    )
    .where(eq(aiAgenten.typ, aufgabe.agentTyp));

  return { ausgefuehrt: true, status, ergebnis: ergebnis ?? undefined, grund: fehler ?? undefined };
}

/** Arbeitet bis zu `limit` Aufgaben aus der Queue ab (Revenue First). */
export async function arbeiteQueueAb(limit = 1): Promise<{
  ausgefuehrt: Array<{ id: number; status?: AufgabeStatus }>;
  offen: number;
}> {
  const db = await requireDb();
  const ausgefuehrt: Array<{ id: number; status?: AufgabeStatus }> = [];
  for (let i = 0; i < Math.max(1, Math.min(limit, 10)); i += 1) {
    const rows = await db.select().from(aiAufgaben).where(eq(aiAufgaben.status, "queued"));
    const naechste = waehleNaechsteAufgabe(
      rows.map((row) => ({
        id: row.id,
        aufgabeTyp: row.aufgabeTyp,
        status: row.status as AufgabeStatus,
        prioritaet: row.prioritaet,
        versuche: row.versuche,
        maxVersuche: row.maxVersuche,
        erstelltAmMs: row.createdAt ? new Date(row.createdAt).getTime() : 0,
      })),
    );
    if (!naechste) break;
    const result = await fuehreAufgabeAus(naechste.id);
    if (result.ausgefuehrt) ausgefuehrt.push({ id: naechste.id, status: result.status });
  }
  const offen = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(aiAufgaben)
    .where(eq(aiAufgaben.status, "queued"));
  return { ausgefuehrt, offen: offen[0]?.anzahl ?? 0 };
}

/** Menschliche Freigabe eines Entwurfs (nur aus freigabe_offen). */
export async function gibAufgabeFrei(aufgabeId: number, freigeber: string): Promise<{ freigegeben: boolean; grund?: string }> {
  const db = await requireDb();
  const rows = await db.select().from(aiAufgaben).where(eq(aiAufgaben.id, aufgabeId)).limit(1);
  const aufgabe = rows[0];
  if (!aufgabe) return { freigegeben: false, grund: "nicht_gefunden" };
  if (!darfAufgabeWechseln(aufgabe.status as AufgabeStatus, "erledigt")) {
    return { freigegeben: false, grund: `status_${aufgabe.status}` };
  }
  const von = aufgabe.status as AufgabeStatus;
  await db
    .update(aiAufgaben)
    .set({ status: "erledigt", freigegebenVon: freigeber, freigegebenAm: new Date(), beendetAm: new Date() })
    .where(eq(aiAufgaben.id, aufgabeId));
  await db.insert(aiAufgabenEreignisse).values({
    aufgabeId,
    vonStatus: von,
    zuStatus: "erledigt",
    agentTyp: aufgabe.agentTyp,
    nachricht: `Freigegeben von ${freigeber}`,
  });
  return { freigegeben: true };
}

/** Dashboard-Übersicht: Agenten, Aufgaben je Status, letzte Aufgaben. */
export async function ladeUebersicht(): Promise<{
  agenten: Array<{ typ: string; name: string; modus: string; aktiv: boolean; ausgefuehrtAufgaben: number; fehlerAnzahl: number; letzteAktivitaet: Date | null }>;
  status: Record<string, number>;
  letzte: Array<{ id: number; titel: string; agentTyp: string; status: string; prioritaet: number; createdAt: Date | null }>;
}> {
  const db = await requireDb();
  const agenten = await db
    .select({
      typ: aiAgenten.typ,
      name: aiAgenten.name,
      modus: aiAgenten.modus,
      aktiv: aiAgenten.aktiv,
      ausgefuehrtAufgaben: aiAgenten.ausgefuehrtAufgaben,
      fehlerAnzahl: aiAgenten.fehlerAnzahl,
      letzteAktivitaet: aiAgenten.letzteAktivitaet,
    })
    .from(aiAgenten)
    .orderBy(aiAgenten.id);
  const statusRows = await db
    .select({ status: aiAufgaben.status, anzahl: sql<number>`count(*)::int` })
    .from(aiAufgaben)
    .groupBy(aiAufgaben.status);
  const letzte = await db
    .select({
      id: aiAufgaben.id,
      titel: aiAufgaben.titel,
      agentTyp: aiAufgaben.agentTyp,
      status: aiAufgaben.status,
      prioritaet: aiAufgaben.prioritaet,
      createdAt: aiAufgaben.createdAt,
    })
    .from(aiAufgaben)
    .orderBy(desc(aiAufgaben.id))
    .limit(10);
  const status: Record<string, number> = {};
  for (const row of statusRows) status[row.status] = row.anzahl;
  return { agenten, status, letzte };
}

/** Aufgabentypen für UI/Doku (stabil sortiert). */
export function listeAufgabeTypen() {
  return AUFGABE_TYPEN.map((t) => ({ id: t.id, agentTyp: t.agentTyp, titel: t.titel, freigabePflichtig: t.freigabePflichtig, prioritaet: t.prioritaet }));
}
