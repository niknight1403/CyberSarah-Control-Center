/**
 * Erstgespraech-Anfrage auf der oeffentlichen AI-Influenza-Verkaufsseite.
 *
 * Regeln, die dieser Baustein durchsetzt:
 * - Kontaktgrundlage ist `customer-requested`: Die anfragende Person bittet
 *   selbst um ein Gespraech. Es gibt keine gekaufte Adresse und keinen
 *   automatischen Werbeversand.
 * - Ohne ausdrueckliche Einwilligung wird nichts gespeichert.
 * - Ein Honeypot-Feld erkennt Bots; solche Anfragen werden serverseitig
 *   stillschweigend verworfen (kein Fehler, keine Daten).
 *
 * Die Datei ist absichtlich rein (keine Datenbank, keine Uhr): alles
 * Zeitabhaengige reicht der Aufrufer herein.
 */
import {
  aiInfluenzaLeadNodeKey,
  evaluateAiInfluenzaContactPolicy,
  scoreAiInfluenzaLead,
  type AiInfluenzaContactBasis,
  type AiInfluenzaLeadSignals,
} from "./ai-influenza-lead-logic";
import { AI_INFLUENZA_PACKAGES, type AiInfluenzaPackageId } from "./ai-influenza-team-logic";

/** Oeffentliche Herkunftsangabe: die eigene Verkaufsseite, keine Fremdquelle. */
/** Weiterverwendet aus der Lead-Pipeline: ein Knoten je Unternehmensdomain. */
export { aiInfluenzaLeadNodeKey as aiInfluenzaIntroLeadNodeKey };

export const AI_INFLUENZA_INTRO_SOURCE_URL = "https://app.cybersarah-ki.com/ai-influenza";

export const AI_INFLUENZA_INTRO_PACKAGE_CHOICES = ["starter", "growth", "business", "elite", "unsure"] as const;
export type AiInfluenzaIntroPackageChoice = (typeof AI_INFLUENZA_INTRO_PACKAGE_CHOICES)[number];

export const AI_INFLUENZA_INTRO_WINDOWS = ["diese-woche", "naechste-woche", "flexibel"] as const;
export type AiInfluenzaIntroWindow = (typeof AI_INFLUENZA_INTRO_WINDOWS)[number];

export const AI_INFLUENZA_INTRO_LIMITS = {
  name: { min: 2, max: 120 },
  email: { max: 254 },
  company: { max: 220 },
  domain: { max: 255 },
  goal: { max: 1200 },
  honeypot: { max: 200 },
} as const;

export const AI_INFLUENZA_INTRO_WINDOW_LABELS: Record<AiInfluenzaIntroWindow, string> = {
  "diese-woche": "Diese Woche",
  "naechste-woche": "Naechste Woche",
  flexibel: "Flexibel",
};

export const AI_INFLUENZA_INTRO_PACKAGE_LABELS: Record<AiInfluenzaIntroPackageChoice, string> = {
  starter: "Starter",
  growth: "Growth",
  business: "Business",
  elite: "Elite",
  unsure: "Noch unklar",
};

export type AiInfluenzaIntroRequest = {
  name: string;
  email: string;
  emailDomain: string;
  company: string;
  domain: string;
  packageId: AiInfluenzaIntroPackageChoice;
  preferredWindow: AiInfluenzaIntroWindow;
  goal: string;
  consentGiven: true;
  source: typeof AI_INFLUENZA_INTRO_SOURCE_URL;
  contactBasis: Extract<AiInfluenzaContactBasis, "customer-requested">;
};

export type AiInfluenzaIntroParseResult =
  | {
      ok: true;
      value: AiInfluenzaIntroRequest;
      leadNodeKey: string;
      signals: AiInfluenzaLeadSignals;
      scoring: { score: number; tier: string };
      metadata: Record<string, unknown>;
      policy: { mayPrepare: boolean; maySend: boolean; reason: string };
    }
  | { ok: false; spam: boolean; errors: string[] };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Kurzer, stabiler Fingerabdruck (djb2) fuer Dedupe-Schluessel ohne PII im Klartext. */
export function shortHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function normalizeIntroDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

export function emailDomainOf(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  return at >= 0 ? normalized.slice(at + 1) : "";
}

function parsePackageChoice(value: unknown): AiInfluenzaIntroPackageChoice {
  const normalized = text(value).toLowerCase();
  return (AI_INFLUENZA_INTRO_PACKAGE_CHOICES as readonly string[]).includes(normalized)
    ? (normalized as AiInfluenzaIntroPackageChoice)
    : "unsure";
}

function parseWindow(value: unknown): AiInfluenzaIntroWindow {
  const normalized = text(value).toLowerCase();
  return (AI_INFLUENZA_INTRO_WINDOWS as readonly string[]).includes(normalized)
    ? (normalized as AiInfluenzaIntroWindow)
    : "flexibel";
}

const CONTENT_KEYWORDS = ["content", "video", "social", "beitrag", "beitraege", "reichweite", "marketing", "ads", "kampagne", "newsletter", "seo", "reel"];
const PAIN_KEYWORDS = ["manuell", "zeit", "aufwand", "allein", "skalier", "prozess", "chaos", "nebenbei", "keine zeit"];

function countHits(haystack: string, needles: readonly string[]): number {
  return needles.reduce((hits, needle) => (haystack.includes(needle) ? hits + 1 : hits), 0);
}

/**
 * Signale fuer die Lead-Bewertung. Eine Selbstauskunft ist Absicht, kein Zufall:
 * Engagement startet deshalb hoch, Budget und Bedarf kommen aus Paketwahl und Text.
 */
export function deriveIntroRequestSignals(input: {
  packageId: AiInfluenzaIntroPackageChoice;
  goal: string;
  domain: string;
}): AiInfluenzaLeadSignals {
  const budgetByPackage: Record<AiInfluenzaIntroPackageChoice, number> = {
    starter: 55,
    growth: 70,
    business: 85,
    elite: 90,
    unsure: 45,
  };
  const goal = input.goal.toLowerCase();
  return {
    engagement: 95,
    budgetSignal: budgetByPackage[input.packageId],
    contentNeed: Math.min(100, 50 + countHits(goal, CONTENT_KEYWORDS) * 6),
    automationPain: Math.min(100, 55 + countHits(goal, PAIN_KEYWORDS) * 7),
    strategicFit: input.domain ? 75 : 60,
  };
}

/**
 * Prueft und normalisiert eine Anfrage. Rueckgabe ist bewusst ein Ergebnisobjekt,
 * damit der Server Bots still verwerfen kann, ohne dem Client zu verraten, warum.
 */
export function parseAiInfluenzaIntroRequest(raw: unknown): AiInfluenzaIntroParseResult {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Honeypot: ein Mensch laesst das Feld leer.
  if (text(input.website).length > 0) {
    return { ok: false, spam: true, errors: ["Anfrage wurde verworfen."] };
  }

  const errors: string[] = [];
  const name = text(input.name);
  const email = text(input.email).toLowerCase();
  const company = text(input.company);
  const goal = text(input.goal);
  const consent = input.consent === true;
  const emailDomain = emailDomainOf(email);
  const rawDomain = text(input.domain);
  const domain = rawDomain ? normalizeIntroDomain(rawDomain) : emailDomain;

  if (name.length < AI_INFLUENZA_INTRO_LIMITS.name.min || name.length > AI_INFLUENZA_INTRO_LIMITS.name.max) {
    errors.push(`Name muss zwischen ${AI_INFLUENZA_INTRO_LIMITS.name.min} und ${AI_INFLUENZA_INTRO_LIMITS.name.max} Zeichen lang sein.`);
  }
  if (email.length > AI_INFLUENZA_INTRO_LIMITS.email.max || !EMAIL_PATTERN.test(email)) {
    errors.push("Gueltige E-Mail-Adresse erforderlich.");
  }
  if (company.length > AI_INFLUENZA_INTRO_LIMITS.company.max) {
    errors.push(`Unternehmen darf hoechstens ${AI_INFLUENZA_INTRO_LIMITS.company.max} Zeichen lang sein.`);
  }
  if (rawDomain.length > AI_INFLUENZA_INTRO_LIMITS.domain.max) {
    errors.push(`Domain darf hoechstens ${AI_INFLUENZA_INTRO_LIMITS.domain.max} Zeichen lang sein.`);
  } else if (rawDomain && !HOST_PATTERN.test(domain)) {
    errors.push("Domain muss wie example.com aussehen (ohne Pfad).");
  }
  if (goal.length > AI_INFLUENZA_INTRO_LIMITS.goal.max) {
    errors.push(`Ziel darf hoechstens ${AI_INFLUENZA_INTRO_LIMITS.goal.max} Zeichen lang sein.`);
  }
  if (!consent) {
    errors.push("Ohne Einwilligung darf die Anfrage nicht gespeichert werden.");
  }

  if (errors.length > 0) {
    return { ok: false, spam: false, errors };
  }

  const packageId = parsePackageChoice(input.packageId);
  const preferredWindow = parseWindow(input.preferredWindow);
  const value: AiInfluenzaIntroRequest = {
    name,
    email,
    emailDomain,
    company: company || `Anfrage von ${name}`,
    domain,
    packageId,
    preferredWindow,
    goal,
    consentGiven: true,
    source: AI_INFLUENZA_INTRO_SOURCE_URL,
    contactBasis: "customer-requested",
  };

  const signals = deriveIntroRequestSignals({ packageId, goal, domain });
  const scoring = scoreAiInfluenzaLead(signals);
  const policy = evaluateAiInfluenzaContactPolicy({
    basis: value.contactBasis,
    publicSourceUrl: AI_INFLUENZA_INTRO_SOURCE_URL,
    optedOut: false,
  });

  const metadata: Record<string, unknown> = {
    businessUnit: "ai-influenza-team",
    source: "sales-page-intro-request",
    publicSourceUrl: AI_INFLUENZA_INTRO_SOURCE_URL,
    contactBasis: value.contactBasis,
    contactPolicy: policy.reason,
    externalSendApproved: false,
    leadScore: scoring.score,
    leadTier: scoring.tier,
    introRequest: {
      name: value.name,
      email: value.email,
      company: value.company,
      domain: value.domain,
      packageId: value.packageId,
      preferredWindow: value.preferredWindow,
      goal: value.goal,
    },
  };

  return {
    ok: true,
    value,
    leadNodeKey: safeLeadNodeKey(domain, email),
    signals,
    scoring,
    metadata,
    policy,
  };
}

/** Freemail-Anbieter: eine Domain ist dort keine Firma, sondern eine Privatperson. */
export const FREEMAIL_DOMAINS: readonly string[] = [
  "aol.com","freenet.de","gmail.com","gmx.at","gmx.ch","gmx.de","gmx.net","googlemail.com",
  "hotmail.com","hotmail.de","icloud.com","live.de","mail.de","outlook.com","outlook.de",
  "posteo.de","proton.me","protonmail.com","t-online.de","web.de","yahoo.com","yahoo.de",
];

export function isFreemailDomain(domain: string): boolean {
  return FREEMAIL_DOMAINS.includes(normalizeIntroDomain(domain));
}

function safeLeadNodeKey(domain: string, email: string): string {
  if (isFreemailDomain(domain)) {
    // Privatperson: eigener Schluessel je Adresse statt eines Sammelknotens beim Anbieter.
    return `ai-influenza-intro:${shortHash(email)}`;
  }
  try {
    return aiInfluenzaLeadNodeKey(domain);
  } catch {
    // Freemail-Adresse ohne Unternehmensdomain: eigener Schluessel, damit die
    // Anfrage nicht mit anderen Privatpersonen desselben Anbieters verschmilzt.
    return `ai-influenza-intro:${shortHash(email)}`;
  }
}

/** Ein Tag = eine Anfrage je Adresse. Verhindert Doppelklicks, nicht echte Anliegen. */
export function introRequestDedupeKey(email: string, isoDay: string): string {
  const day = isoDay.slice(0, 10);
  return `ai-influenza-intro:${day}:${shortHash(email.trim().toLowerCase())}`;
}

/** Ehrliche Rueckmeldung an die anfragende Person; identisch in UI und Tests. */
export function introRequestConfirmationText(value: Pick<AiInfluenzaIntroRequest, "preferredWindow">): string {
  const window = AI_INFLUENZA_INTRO_WINDOW_LABELS[value.preferredWindow];
  return [
    "Anfrage gespeichert. Wir melden uns per E-Mail zur Terminabstimmung",
    `(Wunsch: ${window}).`,
    "Es gibt keinen automatischen Werbeversand und keine Weitergabe an Dritte.",
  ].join(" ");
}

export type AiInfluenzaIntroRequestSummaryInput = {
  packageId?: string | null;
  preferredWindow?: string | null;
  receivedAt?: string | null;
  handled?: boolean | null;
};

/** Kleine Kennzahlen fuer die Admin-Ansicht: offen, erledigt, Verteilung. */
export function summarizeIntroRequests(requests: readonly AiInfluenzaIntroRequestSummaryInput[]) {
  const byPackage: Record<string, number> = {
    starter: 0,
    growth: 0,
    business: 0,
    elite: 0,
    unsure: 0,
  };
  const byWindow: Record<string, number> = {
    "diese-woche": 0,
    "naechste-woche": 0,
    flexibel: 0,
  };
  let handled = 0;
  let open = 0;
  let newest: string | null = null;

  for (const request of requests) {
    const packageId = typeof request.packageId === "string" ? request.packageId : "unsure";
    byPackage[packageId] = (byPackage[packageId] ?? 0) + 1;
    const window = typeof request.preferredWindow === "string" ? request.preferredWindow : "flexibel";
    byWindow[window] = (byWindow[window] ?? 0) + 1;
    if (request.handled === true) handled += 1;
    else open += 1;
    const receivedAt = typeof request.receivedAt === "string" ? request.receivedAt : null;
    if (receivedAt && (!newest || receivedAt > newest)) newest = receivedAt;
  }

  return { total: requests.length, open, handled, byPackage, byWindow, newest };
}

/** Paketpreis fuer die Lead-Bewertung; `unsure` hat bewusst keinen Wert. */
export function introRequestEstimatedValueCents(packageId: AiInfluenzaIntroPackageChoice): number | undefined {
  if (packageId === "unsure") return undefined;
  return AI_INFLUENZA_PACKAGES[packageId as AiInfluenzaPackageId]?.monthlyPriceCents;
}
