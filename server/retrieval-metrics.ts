/**
 * Sprint 113 — Rolling Retrieval-Metriken (Prozess-lokal): misst die
 * Trefferquote der Top-3-Learning-Injektion (Sprint 94). Nach jedem Turn mit
 * injizierten Learnings wird die naechste Nutzer-Nachricht derselben Session
 * gegen die injizierten Keywords geprueft — wiederverwendetes Wissen zaehlt
 * als Treffer. Bewusst prozess-lokal und begrenzt: Metriken sind
 * Betriebsstatistik, keine Nutzerdaten; ein Server-Neustart setzt den
 * Rollingspeicher ehrlich zurueck (dokumentiert im Sprint-Bericht).
 */
import { aggregateRetrievalMetrics, measureRetrievalHits, type RetrievalSample } from "../lib/agent-memory-consolidation-logic";

type InjectionRecord = {
  keywords: string[][]; // Keywords je injiziertem Learning
  recordedAt: number;
};

const MAX_SAMPLES = 500;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // Injektionen aelter als 24 h gelten als verfallen.

const pendingInjections = new Map<string, InjectionRecord>();
let samples: RetrievalSample[] = [];

/** Turn mit injizierten Learnings registrieren (vor der Antwort des Agenten). */
export function recordLearningInjection(sessionId: string, injectedKeywords: string[][]): void {
  if (!sessionId || injectedKeywords.length === 0) return;
  pendingInjections.set(sessionId, {
    keywords: injectedKeywords.map((keywords) => keywords.slice(0, 8)),
    recordedAt: Date.now(),
  });
}

/**
 * Naechste Nutzer-Nachricht einer Session gegen die letzte Injektion messen.
 * Liefert die gemessene Stichprobe (oder null, wenn keine Injektion offen war).
 */
export function measureRetrievalOnUserMessage(sessionId: string, message: string): RetrievalSample | null {
  const record = pendingInjections.get(sessionId);
  if (!record) return null;
  pendingInjections.delete(sessionId);
  if (Date.now() - record.recordedAt > MAX_AGE_MS) return null;
  const sample: RetrievalSample = {
    injected: record.keywords.length,
    hits: measureRetrievalHits(record.keywords, message),
  };
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES);
  return sample;
}

/** Aktuelle Rolling-Metriken (Trefferquote, durchschnittliche Injektionen). */
export function getRetrievalMetrics() {
  return aggregateRetrievalMetrics(samples);
}

/** Metriken fuer Tests/CLI zuruecksetzen. */
export function resetRetrievalMetricsForTesting(): void {
  pendingInjections.clear();
  samples = [];
}
