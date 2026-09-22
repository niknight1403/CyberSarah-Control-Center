/**
 * Google Gemini Client
 * - Echte API-Anbindung mit REST-Aufrufen
 * - Automatischer Fallback auf OpenAI wenn Gemini-Key fehlt/ungültig
 * - Key-Rotation über API Manager Agent
 */
import { logger } from "./logger";

const GEMINI_KEY = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_GEMINI_KEY"];
const GEMINI_BACKUP_KEY = process.env["GEMINI_BACKUP_KEY"];
const GEMINI_MODEL = process.env["GEMINI_MODEL"] ?? "gemini-2.0-flash";

// Alle verfügbaren Keys
const GEMINI_KEYS: string[] = [];
if (GEMINI_KEY) GEMINI_KEYS.push(GEMINI_KEY);
if (GEMINI_BACKUP_KEY && GEMINI_BACKUP_KEY !== GEMINI_KEY) GEMINI_KEYS.push(GEMINI_BACKUP_KEY);

// ─── Key-Validierung: Akzeptiere gängige Google API Key Formate ──────────────
// Gültig: "AIzaSy..." (klassisch) oder "AQ..." (neues Google AI Studio Format)
const GUELTIGE_KEYS = GEMINI_KEYS.filter(k => {
  if (k.length < 10) {
    logger.warn({ keyPrefix: k.substring(0, 8) }, "⚠️ Gemini Key zu kurz — wird ignoriert");
    return false;
  }
  if (!k.startsWith("AIzaSy") && !k.startsWith("AQ.")) {
    logger.warn(
      { keyPrefix: k.substring(0, 12) + "..." },
      "⚠️ Gemini Key-Format unüblich — wird trotzdem getestet"
    );
  }
  return true;
});

let aktiverKeyIndex = 0;

export const geminiVerfuegbar = GUELTIGE_KEYS.length > 0;

if (GUELTIGE_KEYS.length > 0) {
  logger.info({ model: GEMINI_MODEL, keysAnzahl: GUELTIGE_KEYS.length }, "✅ Gemini-Client aktiv");
} else {
  logger.warn("⚠️ Kein gültiger GEMINI_API_KEY — Gemini deaktiviert, Fallback zu OpenAI");
}

export interface GeminiAntwort {
  text: string;
  modell: string;
  tokens?: number;
}

function holeAktiverKey(): string | undefined {
  return GUELTIGE_KEYS[aktiverKeyIndex];
}

function rotiereGeminiKey(): string | undefined {
  if (GUELTIGE_KEYS.length <= 1) return undefined;
  aktiverKeyIndex = (aktiverKeyIndex + 1) % GUELTIGE_KEYS.length;
  const neuerKey = GUELTIGE_KEYS[aktiverKeyIndex]!;
  logger.info({ keyPrefix: neuerKey.substring(0, 12) }, "🔄 Gemini Key-Rotation — neuer Key aktiv");
  return neuerKey;
}

export async function geminiGeneriere(
  prompt: string,
  systemPrompt?: string
): Promise<GeminiAntwort> {
  if (GUELTIGE_KEYS.length === 0) {
    // Fallback zu OpenAI
    const { openai, openaiVerfuegbar } = await import("./openaiClient");
    if (!openaiVerfuegbar) throw new Error("Weder Gemini noch OpenAI verfügbar");

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
    });

    return {
      text: res.choices[0]?.message?.content ?? "",
      modell: "gpt-4o-mini (Fallback)",
      tokens: res.usage?.total_tokens,
    };
  }

  // Echte Gemini-API-Anbindung mit Retry/Rotation
  let letzterFehler: Error | null = null;

  for (let versuch = 0; versuch < GUELTIGE_KEYS.length; versuch++) {
    const apiKey = holeAktiverKey();
    if (!apiKey) break;

    const body = {
      contents: [
        ...(systemPrompt
          ? [{ role: "user" as const, parts: [{ text: systemPrompt }] },
             { role: "model" as const, parts: [{ text: "Verstanden." }] }]
          : []),
        { role: "user" as const, parts: [{ text: prompt }] },
      ],
      generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json() as {
          candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
          usageMetadata?: { totalTokenCount: number };
        };

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return {
          text,
          modell: GEMINI_MODEL,
          tokens: data.usageMetadata?.totalTokenCount,
        };
      }

      if (res.status === 429 || res.status === 403) {
        logger.warn(
          { status: res.status, keyPrefix: apiKey.substring(0, 12) },
          "Gemini API Limit/Fehler — Key-Rotation"
        );
        const rotated = rotiereGeminiKey();
        if (!rotated) break;
        continue;
      }

      const fehlerText = await res.text();
      throw new Error(`Gemini API Fehler ${res.status}: ${fehlerText}`);
    } catch (err) {
      letzterFehler = err instanceof Error ? err : new Error(String(err));

      // Bei Netzwerkfehlern rotieren
      if (letzterFehler.message.includes("fetch") || letzterFehler.message.includes("ECONNREFUSED")) {
        const rotated = rotiereGeminiKey();
        if (!rotated) break;
        continue;
      }
      throw letzterFehler;
    }
  }

  // Alle Keys fehlgeschlagen — Fallback zu OpenAI
  logger.warn("⚠️ Alle Gemini-Keys fehlgeschlagen — Fallback zu OpenAI");
  const { openai, openaiVerfuegbar } = await import("./openaiClient");
  if (!openaiVerfuegbar) {
    throw new Error(`Weder Gemini noch OpenAI verfügbar: ${letzterFehler?.message ?? "Keine Keys"}`);
  }

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      { role: "user", content: prompt },
    ],
    max_tokens: 2000,
  });

  return {
    text: res.choices[0]?.message?.content ?? "",
    modell: "gpt-4o-mini (Gemini-Fallback)",
    tokens: res.usage?.total_tokens,
  };
}

export async function pruefeGeminiVerbindung(): Promise<boolean> {
  if (GUELTIGE_KEYS.length === 0) return false;
  try {
    await geminiGeneriere("Antworte mit: OK");
    return true;
  } catch {
    return false;
  }
}

// ─── Gemini Status ───────────────────────────────────────────────────────────

export function holeGeminiStatus(): {
  verfuegbar: boolean;
  keysAnzahl: number;
  modell: string;
  aktiverKeyIndex: number;
} {
  return {
    verfuegbar: geminiVerfuegbar,
    keysAnzahl: GUELTIGE_KEYS.length,
    modell: GEMINI_MODEL,
    aktiverKeyIndex,
  };
}
