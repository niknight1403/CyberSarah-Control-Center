/**
 * Sprint 305 — Audio-Pipeline: reine, deterministische Logik fuer die
 * Stimmenauswahl pro Projekt (Edge-TTS-Stimmen mit Vorschau).
 *
 * Datenfluss:
 *   Der Projekt-Kontext (Sprache, Praeferenz) plus der Stimmen-Katalog
 *   ergeben eine Auswahl; die Vorschau baut nur deterministische
 *   Metadaten (Cache-Key, Dateiname) — kein Netz aufruf hier.
 *
 * Ehrlichkeits-Grenze: Die Vorschau ist nur so gut wie der echte
 *   TTS-Call; hier entsteht nur die Anfrage-Beschreibung. Fehler beim
 *   Synthetisieren werden nicht vorweggenommen.
 */

import { TTS_VOICES, TTS_LIMITS } from "./tts-logic";

export type VoiceGender = "female" | "male";

export type VoiceInfo = {
  id: (typeof TTS_VOICES)[number];
  displayName: string;
  gender: VoiceGender;
  locale: string;
  description: string;
};

/** Katalog der verfuegbaren Edge-TTS-Stimmen (DE, da Projekt-Sprache Deutsch). */
export const VOICE_CATALOG: readonly VoiceInfo[] = [
  {
    id: "de-DE-KatjaNeural",
    displayName: "Katja",
    gender: "female",
    locale: "de-DE",
    description: "Warm, klare Alltagsstimme",
  },
  {
    id: "de-DE-AmalaNeural",
    displayName: "Amala",
    gender: "female",
    locale: "de-DE",
    description: "Jugendlich, freundlich",
  },
  {
    id: "de-DE-ConradNeural",
    displayName: "Conrad",
    gender: "male",
    locale: "de-DE",
    description: "Ruhig, sachlich",
  },
  {
    id: "de-DE-FlorianApollNeural",
    displayName: "Florian",
    gender: "male",
    locale: "de-DE",
    description: "Klar, gut fuer Praesentationen",
  },
];

export type VoicePreference = {
  preferredGender?: VoiceGender;
  preferredVoiceId?: string;
};

/** Filtert den Katalog nach Praeferenz (Id vor Geschlecht vor Default). */
export function selectVoice(preference: VoicePreference): VoiceInfo {
  if (preference.preferredVoiceId) {
    const byId = VOICE_CATALOG.find((v) => v.id === preference.preferredVoiceId);
    if (byId) return byId;
  }
  if (preference.preferredGender) {
    const byGender = VOICE_CATALOG.find((v) => v.gender === preference.preferredGender);
    if (byGender) return byGender;
  }
  return VOICE_CATALOG[0];
}

/** Vorschau-Text validieren: Laenge begrenzen, leer = unbrauchbar. */
export function validatePreviewText(text: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "Leerer Vorschau-Text." };
  if (trimmed.length > TTS_LIMITS.text.max) {
    return { ok: false, reason: `Vorschau-Text zu lang (${trimmed.length}/${TTS_LIMITS.text.max}).` };
  }
  return { ok: true };
}

/** Deterministischer Cache-/Dateiname fuer eine Vorschau (Stimme + Text-Fingerprint). */
export function buildPreviewCacheKey(voiceId: string, text: string): string {
  let hash = 0;
  for (const ch of text.trim()) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return `tts-preview:${voiceId}:${hash.toString(36)}`;
}

/** UI-Zeile je Stimme: "Katja (weiblich) — Warm, klare Alltagsstimme". */
export function formatVoiceLabel(voice: VoiceInfo): string {
  const gender = voice.gender === "female" ? "weiblich" : "maennlich";
  return `${voice.displayName} (${gender}) — ${voice.description}`;
}
