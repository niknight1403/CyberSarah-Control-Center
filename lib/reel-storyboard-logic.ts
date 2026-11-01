/**
 * Sprint 32: a deliberately reviewable 27-second Reel storyboard.
 * Generates text instructions only — not audio, video, publication or
 * unverified claims about a Stripe product.
 */
export type ReelStoryboardScene = {
  startSeconds: number;
  endSeconds: number;
  voiceover: string;
  subtitles: string;
  visual: string;
};

export type ReelStoryboardResult =
  | { ok: true; scenes: ReelStoryboardScene[]; durationSeconds: number; content: string }
  | { ok: false; reason: string };

const MAX_REEL_SECONDS = 30;
const MAX_WORDS_PER_SECOND = 3;
const MAX_SUBTITLE_CHARS_PER_SECOND = 22;

/** Reject incomplete, overlapping, too-fast and too-long scripted scenes. */
export function validateReelStoryboard(scenes: ReelStoryboardScene[]): { ok: true; durationSeconds: number } | { ok: false; reason: string } {
  if (scenes.length < 3 || scenes.length > 8)
    return { ok: false, reason: "Ein Reel benötigt 3–8 überprüfbare Szenen." };
  let cursor = 0;
  for (const [index, scene] of scenes.entries()) {
    if (!Number.isInteger(scene.startSeconds) || !Number.isInteger(scene.endSeconds) ||
        scene.startSeconds !== cursor || scene.endSeconds <= cursor ||
        scene.endSeconds > MAX_REEL_SECONDS) {
      return { ok: false, reason: `Szenenzeitraum ${index + 1} ist lückenhaft, überlappend oder zu lang.` };
    }
    const duration = scene.endSeconds - scene.startSeconds;
    for (const field of ["voiceover", "subtitles", "visual"] as const) {
      const value = scene[field];
      if (typeof value !== "string" || !value.trim() || /[\r\n]/.test(value) || value.length > 300)
        return { ok: false, reason: `Szenenfeld ${field} in Szene ${index + 1} fehlt oder ist ungültig.` };
    }
    const words = scene.voiceover.trim().split(/\s+/).length;
    if (words > duration * MAX_WORDS_PER_SECOND)
      return { ok: false, reason: `Voiceover in Szene ${index + 1} ist für die Zeit zu lang.` };
    if (scene.subtitles.length > duration * MAX_SUBTITLE_CHARS_PER_SECOND)
      return { ok: false, reason: `Untertitel in Szene ${index + 1} sind nicht lesbar in der vorgegebenen Zeit.` };
    cursor = scene.endSeconds;
  }
  return { ok: true, durationSeconds: cursor };
}

function seconds(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildReviewableProductReel(productName: string): ReelStoryboardResult {
  const name = productName.replace(/\s+/g, " ").trim();
  if (!name || name.length > 200)
    return { ok: false, reason: "Produktname für den Reel-Entwurf fehlt oder ist zu lang." };

  const scenes: ReelStoryboardScene[] = [
    {
      startSeconds: 0, endSeconds: 3,
      voiceover: "Was steckt hinter diesem Angebot?",
      subtitles: "Was steckt hinter diesem Angebot?",
      visual: `Ruhiger Einstieg, Produktname eingeblendet: ${name}`,
    },
    {
      startSeconds: 3, endSeconds: 11,
      voiceover: "Für wen könnte dieses Produkt interessant sein? Wir prüfen die wichtigsten Eckdaten.",
      subtitles: "Zielgruppe und Eckdaten prüfen",
      visual: "Neutrale Produktübersicht; keine unbestätigten Wirkungs- oder Ergebnisversprechen",
    },
    {
      startSeconds: 11, endSeconds: 21,
      voiceover: "Leistungsumfang, Verfügbarkeit und Preis müssen anhand der Originalquelle bestätigt werden.",
      subtitles: "Nur bestätigte Fakten verwenden",
      visual: "Prüfkarten für Leistungsumfang, Verfügbarkeit, Währung, Steuern und Rechte",
    },
    {
      startSeconds: 21, endSeconds: 27,
      voiceover: "Mehr erfahren, sobald Rechte und Checkout überprüft sind.",
      subtitles: "CTA erst nach Prüfung freigeben",
      visual: "Neutrale Abschlusskarte; keine ungeprüfte Kauf-URL oder Rabattversprechen",
    },
  ];
  const result = validateReelStoryboard(scenes);
  if (!result.ok) return result;
  const content = [
    `Dauer: ${result.durationSeconds} Sekunden. Redaktioneller Entwurf, kein gerendertes Video oder Audio.`,
    ...scenes.map(scene =>
      `${seconds(scene.startSeconds)}–${seconds(scene.endSeconds)} s | Sprechertext: ${scene.voiceover} | Untertitel: ${scene.subtitles} | Bild: ${scene.visual}`,
    ),
    "Abnahme: Produktfakten, Medienrechte, Affiliate-Hinweis und Checkout-Link vor Rendering/Veröffentlichung manuell prüfen.",
  ].join("\n");
  return { ok: true, scenes, durationSeconds: result.durationSeconds, content };
}
