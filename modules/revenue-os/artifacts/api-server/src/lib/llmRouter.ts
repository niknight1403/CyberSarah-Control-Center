/**
 * llmRouter — Autonomer Multi-Provider-Router für KOSTENLOSE LLM-Kapazität
 *
 * Priorität (Sprint 64): komplett kostenlose Anbieter zuerst, bezahlte Fallbacks zuletzt.
 * Der RoutingChanger-Agent überwacht die Gesundheit und wechselt autonom:
 *   1. Groq (Free Tier, sehr schnell)
 *   2. Google Gemini (Free Tier, hohe Kontexte)
 *   3. OpenRouter (:free Modelle)
 *   4. Cerebras (Free Tier)
 *   5. HuggingFace Inference (Free)
 *   6. Mistral (Free Tier)
 *   7. Ollama / LM Studio (lokal, kostenlos, unbegrenzt)
 *   8. OpenAI (Fallback, kostenpflichtig)
 */
import { logger } from "./logger";

export interface LLMProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  modell: string;
  envKeys: string[];
  kostenlos: boolean;
  prioritaet: number;
}

export interface ProviderZustand {
  id: string;
  name: string;
  modell: string;
  kostenlos: boolean;
  konfiguriert: boolean;
  verfuegbar: boolean;
  fehlerHintereinander: number;
  letztePruefung: string | null;
  letzteFehlermeldung: string | null;
  letzteErfolgMeldung: string | null;
  bedienteAnfragen: number;
}

export interface LLMRouteErgebnis {
  text: string;
  providerId: string;
  modell: string;
  kostenpflichtig: boolean;
  versuchteProvider: string[];
}

// ── Provider-Registry (OpenAI-kompatible /chat/completions-APIs) ────────────
const PROVIDER: LLMProviderDef[] = [
  {
    id: "groq",
    name: "Groq (Free Tier)",
    baseUrl: "https://api.groq.com/openai/v1",
    modell: "llama-3.3-70b-versatile",
    envKeys: ["GROQ_API_KEY", "GROQCLOUD_API_KEY"],
    kostenlos: true,
    prioritaet: 1,
  },
  {
    id: "gemini",
    name: "Google Gemini (Free Tier)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    modell: "gemini-2.0-flash",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    kostenlos: true,
    prioritaet: 2,
  },
  {
    id: "openrouter",
    name: "OpenRouter (:free Modelle)",
    baseUrl: "https://openrouter.ai/api/v1",
    modell: "meta-llama/llama-3.3-70b-instruct:free",
    envKeys: ["OPENROUTER_API_KEY"],
    kostenlos: true,
    prioritaet: 3,
  },
  {
    id: "cerebras",
    name: "Cerebras (Free Tier)",
    baseUrl: "https://api.cerebras.ai/v1",
    modell: "llama-3.3-70b",
    envKeys: ["CEREBRAS_API_KEY"],
    kostenlos: true,
    prioritaet: 4,
  },
  {
    id: "huggingface",
    name: "HuggingFace Inference (Free)",
    baseUrl: "https://router.huggingface.co/v1",
    modell: "meta-llama/Llama-3.3-70B-Instruct",
    envKeys: ["HF_TOKEN", "HUGGINGFACE_API_KEY"],
    kostenlos: true,
    prioritaet: 5,
  },
  {
    id: "mistral",
    name: "Mistral (Free Tier)",
    baseUrl: "https://api.mistral.ai/v1",
    modell: "mistral-small-latest",
    envKeys: ["MISTRAL_API_KEY"],
    kostenlos: true,
    prioritaet: 6,
  },
  {
    id: "ollama",
    name: "Ollama (lokal, unbegrenzt)",
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    modell: process.env.OLLAMA_MODELL ?? "llama3.3",
    envKeys: ["OLLAMA_API_KEY"],
    kostenlos: true,
    prioritaet: 7,
  },
  {
    id: "openai",
    name: "OpenAI (Fallback, kostenpflichtig)",
    baseUrl: "https://api.openai.com/v1",
    modell: "gpt-4o-mini",
    envKeys: ["OPENAI_API_KEY", "OPENAI_BACKUP_KEY"],
    kostenlos: false,
    prioritaet: 8,
  },
];

const MAX_FEHLER = 3;
const MAX_FEHLER_SEKUNDEN = 900; // 15 Minuten Pause nach wiederholtem Fehlschlagen

const zustaende = new Map<string, ProviderZustand>();
let aktiverProviderId: string | null = null;

function holeZustand(def: LLMProviderDef): ProviderZustand {
  let z = zustaende.get(def.id);
  if (!z) {
    z = {
      id: def.id,
      name: def.name,
      modell: def.modell,
      kostenlos: def.kostenlos,
      konfiguriert: holeKey(def) !== undefined || def.id === "ollama",
      verfuegbar: false,
      fehlerHintereinander: 0,
      letztePruefung: null,
      letzteFehlermeldung: null,
      letzteErfolgMeldung: null,
      bedienteAnfragen: 0,
    };
    zustaende.set(def.id, z);
  }
  return z;
}

function holeKey(def: LLMProviderDef): string | undefined {
  for (const env of def.envKeys) {
    const wert = process.env[env];
    if (wert && wert.trim().length > 0) return wert.trim();
  }
  return undefined;
}

function istPausiert(z: ProviderZustand): boolean {
  return z.fehlerHintereinander >= MAX_FEHLER && z.letztePruefung !== null
    ? (Date.now() - new Date(z.letztePruefung).getTime()) < MAX_FEHLER_SEKUNDEN * 1000
    : false;
}

/** Provider in Routing-Reihenfolge: kostenlos zuerst, pausierte zuletzt. */
export function providerReihenfolge(): LLMProviderDef[] {
  return [...PROVIDER].sort((a, b) => {
    const pa = holeZustand(a);
    const pb = holeZustand(b);
    const bonusA = istPausiert(pa) ? 100 : 0;
    const bonusB = istPausiert(pb) ? 100 : 0;
    if (a.kostenlos !== b.kostenlos) return a.kostenlos ? -1 : 1;
    return a.prioritaet + bonusA - (b.prioritaet + bonusB);
  });
}

export interface RouteLLMOptionen {
  systemPrompt?: string;
  prompt: string;
  maxTokens?: number;
  temperatur?: number;
  nurKostenlos?: boolean;
  zeitlimitMs?: number;
}

/**
 * Zentrale Routing-Funktion: probiert die Provider in autonomer Reihenfolge,
 * wechselt bei Fehler/429/Timeout automatisch weiter und meldet den Treffer.
 */
export async function routeLLM(optionen: RouteLLMOptionen): Promise<LLMRouteErgebnis> {
  const versuchte: string[] = [];
  const reihenfolge = providerReihenfolge();

  for (const def of reihenfolge) {
    const z = holeZustand(def);
    if (optionen.nurKostenlos && !def.kostenlos) continue;
    if (def.id !== "ollama" && !z.konfiguriert) continue;
    if (istPausiert(z)) continue;

    versuchte.push(def.id);
    const key = holeKey(def) ?? "ollama";
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), optionen.zeitlimitMs ?? 20_000);
      const r = await fetch(`${def.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: def.modell,
          max_tokens: optionen.maxTokens ?? 800,
          temperature: optionen.temperatur ?? 0.7,
          messages: [
            ...(optionen.systemPrompt
              ? [{ role: "system", content: optionen.systemPrompt }]
              : []),
            { role: "user", content: optionen.prompt },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      }
      const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Leere Antwort");

      z.verfuegbar = true;
      z.fehlerHintereinander = 0;
      z.letztePruefung = new Date().toISOString();
      z.letzteErfolgMeldung = `OK via ${def.modell}`;
      z.bedienteAnfragen += 1;
      aktiverProviderId = def.id;
      logger.info({ provider: def.id, modell: def.modell }, "LLM-Route erfolgreich (autonom gewählt)");
      return {
        text,
        providerId: def.id,
        modell: def.modell,
        kostenpflichtig: !def.kostenlos,
        versuchteProvider: versuchte,
      };
    } catch (err) {
      z.verfuegbar = false;
      z.fehlerHintereinander += 1;
      z.letztePruefung = new Date().toISOString();
      z.letzteFehlermeldung = err instanceof Error ? err.message : String(err);
      logger.warn(
        { provider: def.id, fehler: z.letzteFehlermeldung, versuch: z.fehlerHintereinander },
        "LLM-Provider fehlgeschlagen — Router wechselt autonom weiter",
      );
    }
  }

  throw new Error(
    `Kein LLM-Provider erreichbar (versucht: ${versuchte.join(", ") || "keiner konfiguriert"})`,
  );
}

export function holeAktivenProvider(): ProviderZustand | null {
  return aktiverProviderId ? zustaende.get(aktiverProviderId) ?? null : null;
}

/** Gesundheits-Snapshot aller Provider für den Health-Check und den Changer-Agent. */
export function holeProviderSnapshot(): ProviderZustand[] {
  for (const def of PROVIDER) holeZustand(def);
  return [...zustaende.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function anzahlKostenloseVerfuegbar(): number {
  return holeProviderSnapshot().filter((z) => z.kostenlos && z.konfiguriert && z.verfuegbar).length;
}
