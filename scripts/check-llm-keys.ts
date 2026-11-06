/**
 * Preflight fuer alle Media- und Text-Schluessel.
 *
 * Aufruf:  npx tsx scripts/check-llm-keys.ts
 *
 * Warum es das gibt: Ein 401 faellt sonst erst mitten in einem bezahlten
 * Content-Paket auf. Dieses Skript probiert jeden konfigurierten Schluessel mit
 * einer echten Minimalanfrage und ordnet das Ergebnis ein (gueltig, Kontingent,
 * ungueltig, Modell fehlt). Es sendet keine Kundendaten und erzeugt keine
 * Kosten in nennenswerter Hoehe (max_tokens = 1 bzw. ein TTS-Fragment).
 *
 * Exitcode 1, sobald ein *konfigurierter* Schluessel ungueltig ist oder kein
 * einziger Media-Schluessel nutzbar ist.
 */
import { classifyMediaFailure, mediaKeyId } from "../lib/media-key-quarantine-logic";
import { resolveImageKeys, resolveVoiceTargets } from "../lib/ai-influenza-voice-logic";

type ProbeResult = {
  label: string;
  source: string;
  keyId: string;
  status: number | null;
  verdict: string;
  detail: string;
};

async function probe(label: string, source: string, apiKey: string, request: () => Promise<Response>): Promise<ProbeResult> {
  try {
    const response = await request();
    const failure = classifyMediaFailure(response.status);
    let verdict: string;
    if (response.status >= 200 && response.status < 300) verdict = "gueltig";
    else if (failure === "invalid_key") verdict = "UNGÜLTIG (401/402/403)";
    else if (failure === "quota") verdict = "Kontingent erschöpft (429)";
    else if (failure === "bad_request") verdict = "Modell/Endpoint abweichend (400/404)";
    else if (failure === "transient") verdict = `vorübergehend (${response.status})`;
    else verdict = `unbekannt (${response.status})`;
    const body = response.ok ? "" : (await response.text()).slice(0, 120).replace(/\s+/g, " ");
    return { label, source, keyId: mediaKeyId(apiKey), status: response.status, verdict, detail: body };
  } catch (error) {
    return {
      label,
      source,
      keyId: mediaKeyId(apiKey),
      status: null,
      verdict: "Netzwerkfehler",
      detail: error instanceof Error ? error.message.slice(0, 120) : String(error),
    };
  }
}

async function main(): Promise<void> {
  const results: ProbeResult[] = [];
  const env = process.env;

  const groq = env.GROQ_API_KEY?.trim();
  if (groq) {
    results.push(
      await probe("Groq Text", "groq", groq, () =>
        fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${groq}`, "content-type": "application/json" },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
          signal: AbortSignal.timeout(20_000),
        }),
      ),
    );
  }

  const openrouter = env.OPENROUTER_API_KEY?.trim();
  if (openrouter) {
    results.push(
      await probe("OpenRouter Text", "openrouter", openrouter, () =>
        fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${openrouter}`, "content-type": "application/json" },
          body: JSON.stringify({ model: "meta-llama/llama-3.1-8b-instruct", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
          signal: AbortSignal.timeout(20_000),
        }),
      ),
    );
  }

  const voiceTargets = resolveVoiceTargets(env);
  for (const target of voiceTargets) {
    results.push(
      await probe(`TTS ${target.provider}`, target.provider, target.apiKey, () =>
        fetch(
          target.provider === "gemini"
            ? `https://generativelanguage.googleapis.com/v1beta/models/${target.model}:generateContent?key=${target.apiKey}`
            : "https://api.openai.com/v1/models",
          {
            method: target.provider === "gemini" ? "POST" : "GET",
            headers: { "content-type": "application/json" },
            body:
              target.provider === "gemini"
                ? JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
                : undefined,
            signal: AbortSignal.timeout(20_000),
          },
        ),
      ),
    );
  }

  for (const key of resolveImageKeys(env)) {
    results.push(
      await probe("Bildmotiv Gemini", "gemini-image", key, () =>
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ instances: [{ prompt: "ping" }], parameters: { sampleCount: 1 } }),
          signal: AbortSignal.timeout(20_000),
        }),
      ),
    );
  }

  if (results.length === 0) {
    console.error("FAIL: Kein einziger Schluessel konfiguriert. Ohne Schluessel keine Lieferung.");
    process.exit(1);
  }

  console.log("Schluessel-Preflight");
  for (const result of results) {
    console.log(`  ${result.label.padEnd(18)} ${result.keyId}  ${result.verdict}${result.detail ? ` — ${result.detail}` : ""}`);
  }

  const invalid = results.filter((result) => result.status === 401 || result.status === 402 || result.status === 403);
  const mediaUsable = results.filter(
    (result) => (result.label.startsWith("TTS") || result.label.startsWith("Bildmotiv")) && result.status !== null && result.status >= 200 && result.status < 300,
  );

  if (invalid.length > 0) {
    console.error(`\nFAIL: ${invalid.length} Schluessel ungueltig (${invalid.map((entry) => `${entry.label}/${entry.keyId}`).join(", ")}).`);
    console.error("Diese Schluessel sofort in Render/GitHub ersetzen — sie kosten in jeder Pipeline nur Zeit.");
  }
  if (mediaUsable.length === 0) {
    console.error("\nFAIL: Kein Media-Schluessel liefert. Vertonung und Bildmotive sind nicht lieferbar.");
  }
  const failed = invalid.length > 0 || mediaUsable.length === 0;
  console.log(failed ? "\nErgebnis: nicht lieferbar." : "\nErgebnis: lieferbar.");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`Preflight abgebrochen: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
