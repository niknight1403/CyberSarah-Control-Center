/**
 * Sprint 11 — Autonome Aufloesung ungeklaerter Veroeffentlichungen.
 *
 * Problem: Ein Job mit Status "versand_ungeklaert" wartete bisher *nur* auf
 * einen Menschen. Ohne Pruefung bleibt er fuer immer offen — nach 24 Stunden
 * als "KRITISCH" markiert, ohne dass irgendetwas passiert.
 *
 * Loesung: eine rein deterministische Entscheidungslogik, die aus einer
 * echten, schreibgeschuetzten Plattformpruefung eine Entscheidung ableitet:
 *
 *   found        -> "confirm"  (Beitrag existiert, externe ID uebernehmen)
 *   not_found    -> "wait"     (Frist laeuft noch)
 *                -> "close"    (Frist abgelaufen: ohne Neuversand schliessen)
 *   unverifiable -> "escalate" (Mensch bleibt zustaendig, nie blind raten)
 *
 * Harte Regel: es wird hier NIE etwas gesendet. Diese Logik entscheidet nur
 * ueber den Buchhaltungszustand eines bereits abgeschickten Jobs.
 */

import { validManualReviewReceipt } from "./publishing-review-logic";

/** Nach dieser Frist darf ein "nicht gefunden" den Vorgang schliessen. */
export const UNCERTAIN_AUTO_CLOSE_HOURS = 72;

/**
 * Eine Pruefung direkt nach dem Absenden ist wertlos: Provider brauchen
 * Sekunden bis Minuten, bis ein Beitrag in der Timeline auftaucht.
 */
export const UNCERTAIN_MIN_VERIFICATION_AGE_MINUTES = 10;

/** Hoechstalter einer Pruefung, danach gilt sie nicht mehr als Nachweis. */
export const VERIFICATION_MAX_AGE_HOURS = 6;

export type PublishingVerification =
  | { outcome: "found"; externalId: string; detail: string; checkedAtMs: number }
  | { outcome: "not_found"; detail: string; checkedAtMs: number }
  | { outcome: "unverifiable"; detail: string; checkedAtMs: number };

export type UncertainResolutionAction = "confirm" | "close" | "wait" | "escalate";

export type UncertainResolutionDecision = {
  jobId: number;
  platform: string;
  action: UncertainResolutionAction;
  /** Klartextgrund, immer sichtbar fuer den Menschen. */
  reason: string;
  /** Nur bei "confirm"/"close": die Pruefgrundlage, die gespeichert wird. */
  evidence: string | null;
  /** Nur bei "confirm": die verifizierte externe Beitrags-ID. */
  externalId: string | null;
};

/**
 * Ermittelt den Text, gegen den eine Plattformpruefung abgleichen darf.
 *
 * Aeltere Jobs (vor Sprint 11) haben keinen gespeicherten Sendetext am Job.
 * Dann ist der freigegebene Quell-Entwurf die einzige belastbare Grundlage —
 * er ist der Text, der gesendet werden SOLLTE. Fehlt auch der, wird nicht
 * geraten: `source: "none"` fuehrt ehrlich zum Menschen.
 */
export function resolveVerificationText(input: {
  contentOverride?: string | null;
  draftContent?: string | null;
}): { text: string; source: "override" | "draft" | "none" } {
  const override = (input.contentOverride ?? "").trim();
  if (override.length >= 10) return { text: override, source: "override" };
  const draft = (input.draftContent ?? "").trim();
  if (draft.length >= 10) return { text: draft, source: "draft" };
  return { text: "", source: "none" };
}

export type UncertainResolutionInput = {
  jobId: number;
  platform: string;
  /** Zeitpunkt des letzten Versands (updatedAt des Jobs). */
  updatedAtMs: number;
  verification: PublishingVerification | null;
  nowMs: number;
  autoCloseHours?: number;
  minVerificationAgeMinutes?: number;
};

function hoursBetween(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / 3_600_000;
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} Minuten`;
  return `${Math.round(hours * 10) / 10} Stunden`;
}

/**
 * Entscheidet, was mit einem ungeklaerten Job passiert.
 * Reihenfolge der Pruefungen ist Absicht: ohne echte Pruefung wird nie
 * geschlossen, und eine veraltete Pruefung wird nie als Nachweis benutzt.
 */
export function decideUncertainResolution(input: UncertainResolutionInput): UncertainResolutionDecision {
  const autoCloseHours = input.autoCloseHours ?? UNCERTAIN_AUTO_CLOSE_HOURS;
  const minVerificationMinutes = input.minVerificationAgeMinutes ?? UNCERTAIN_MIN_VERIFICATION_AGE_MINUTES;
  const base = { jobId: input.jobId, platform: input.platform, externalId: null as string | null };
  const openHours = hoursBetween(input.updatedAtMs, input.nowMs);

  if (!input.verification) {
    return {
      ...base, action: "escalate", evidence: null,
      reason: `Keine Plattformpruefung vorhanden (${formatAge(openHours)} offen) — Mensch muss pruefen.`,
    };
  }

  // Mindestwartezeit bezieht sich auf den VERSAND, nicht auf die Pruefung:
  // direkt nach dem Absenden ist ein "nicht gefunden" bedeutungslos, weil der
  // Provider Zeit braucht. Eine frische Pruefung eines alten Vorgangs ist
  // dagegen genau das, was wir wollen.
  const openMinutes = openHours * 60;
  if (openMinutes < minVerificationMinutes) {
    return {
      ...base, action: "wait", evidence: null,
      reason: `Beitrag ist seit ${formatAge(openHours)} raus — Provider braucht Zeit, bis er sichtbar ist.`,
    };
  }
  if (input.verification.checkedAtMs < input.updatedAtMs) {
    return {
      ...base, action: "wait", evidence: null,
      reason: "Die Pruefung ist aelter als der letzte Versand — sie beweist nichts, bitte erneut pruefen.",
    };
  }
  if (input.verification.checkedAtMs < input.nowMs - VERIFICATION_MAX_AGE_HOURS * 3_600_000) {
    return {
      ...base, action: "wait", evidence: null,
      reason: `Pruefung ist aelter als ${VERIFICATION_MAX_AGE_HOURS} Stunden — Nachweis abgelaufen, bitte erneut pruefen.`,
    };
  }

  if (input.verification.outcome === "unverifiable") {
    return {
      ...base, action: "escalate", evidence: null,
      reason: `Plattformpruefung nicht moeglich: ${input.verification.detail}`,
    };
  }

  if (input.verification.outcome === "found") {
    if (!validManualReviewReceipt(input.verification.externalId)) {
      return {
        ...base, action: "escalate", evidence: null,
        reason: `Fund ohne verwertbare Beitrags-ID — Nachweis unbrauchbar: ${input.verification.detail}`,
      };
    }
    return {
      ...base,
      action: "confirm",
      externalId: input.verification.externalId,
      evidence: `Automatische Plattformpruefung: Beitrag gefunden (ID ${input.verification.externalId}). ${input.verification.detail}`
        .slice(0, 1200),
      reason: "Beitrag auf der Plattform nachgewiesen — Veroeffentlichung wird bestaetigt.",
    };
  }

  // not_found
  if (openHours >= autoCloseHours) {
    return {
      ...base,
      action: "close",
      evidence: `Automatische Plattformpruefung: kein passender Beitrag gefunden, ${formatAge(openHours)} nach dem Versand. Kein Neuversand ausgeloest. ${input.verification.detail}`
        .slice(0, 1200),
      reason: `Frist von ${autoCloseHours} Stunden ohne Fund abgelaufen — ohne Neuversand geschlossen.`,
    };
  }

  return {
    ...base, action: "wait", evidence: null,
    reason: `Nicht gefunden; Frist laeuft noch (${Math.max(0, Math.round((autoCloseHours - openHours) * 10) / 10)} Stunden offen).`,
  };
}

export type UncertainResolutionSummary = {
  confirm: number;
  close: number;
  wait: number;
  escalate: number;
  total: number;
};

export function summarizeUncertainResolutions(decisions: readonly UncertainResolutionDecision[]): UncertainResolutionSummary {
  const summary: UncertainResolutionSummary = { confirm: 0, close: 0, wait: 0, escalate: 0, total: decisions.length };
  for (const decision of decisions) summary[decision.action] += 1;
  return summary;
}

/**
 * Textabgleich fuer die Plattformpruefung: vergleicht den gesendeten Text mit
 * den zuletzt gesehenen Beitraegen. Kurze Texte werden nie zugeordnet — ein
 * falscher Treffer waere schlimmer als "nicht gefunden".
 */
export const MIN_MATCH_TEXT_LENGTH = 24;

export function normalizeForMatch(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
}

export type PlatformPost = { externalId: string; text: string; createdAtMs?: number };

/** Liefert den passenden Beitrag oder null. Kein Teilstring-Raten bei kurzen Texten. */
export function matchPostByText(posts: readonly PlatformPost[], sentText: string): PlatformPost | null {
  const sent = normalizeForMatch(sentText);
  if (sent.length < MIN_MATCH_TEXT_LENGTH) return null;
  const sentHead = sent.slice(0, 120);
  for (const post of posts) {
    if (!post || !validManualReviewReceipt(String(post.externalId))) continue;
    const candidate = normalizeForMatch(post.text);
    if (candidate.length < MIN_MATCH_TEXT_LENGTH) continue;
    if (candidate === sent) return post;
    const head = candidate.slice(0, 120);
    if (head === sentHead) return post;
    if (candidate.includes(sentHead) || sent.includes(head)) return post;
  }
  return null;
}
