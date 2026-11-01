/**
 * Sprint 351 — Saeule 1: Micro-SaaS-Fabrik (0-Euro-Budget).
 * Autonome Erstellung von Micro-Web-Tools: Template-Registry, Ideen-Score
 * und deterministischer Build-Plan. Reine Logik ohne IO — der Agenten-
 * Rotator (core/router) liefert spaeter die LLM-Unterstuetzung, die
 * Freigabe laeuft ueber die Draft-Engine (Admin-Ein-Klick-Prinzip).
 */

export type SaaSToolTemplateId =
  | "unit-converter"
  | "qr-generator"
  | "invoice-calc"
  | "password-check"
  | "countdown-timer"
  | "pdf-merger";

export type SaaSToolTemplate = {
  id: SaaSToolTemplateId;
  name: string;
  mission: string;
  features: readonly string[];
  keywords: readonly string[];
  buildHours: number;
};

export const SAAS_TEMPLATES: readonly SaaSToolTemplate[] = [
  { id: "unit-converter", name: "Einheiten-Rechner", mission: "Laengen/Gewichte/Temperaturen ohne Anmeldung umrechnen.", features: ["13 Einheitensysteme", "Deep-Link-Ergebnisse", "SEO-Landingpage"], keywords: ["umrechnen", "converter", "einheiten", "rechner"], buildHours: 4 },
  { id: "qr-generator", name: "QR-Code-Generator", mission: "QR-Codes fuer Router/Events/WLAN — gratis und ohne Tracking.", features: ["PNG + SVG Export", "WLAN/VCARD Modi", "Bulk-Export"], keywords: ["qr", "code", "generator", "scannen"], buildHours: 3 },
  { id: "invoice-calc", name: "Rechnungs-Rechner", mission: "Netto/Brutto/MwSt-Uebersicht fuer Freelancer in 2 Feldern.", features: ["MwSt-Saetze DE/AT/CH", "E-Mail-Teaser", "Kaufen-Button-Ready"], keywords: ["rechnung", "mwst", "brutto", "netto", "freiberufler"], buildHours: 3 },
  { id: "password-check", name: "Passwort-Check", mission: "Passwortstaerke und Leak-Hinweise ohne Uebertragung des Klartexts.", features: ["Lokale Pruefung", "Entropie-Score", "Tipps auf Deutsch"], keywords: ["passwort", "sicherheit", "check", "strong"], buildHours: 2 },
  { id: "countdown-timer", name: "Countdown-Timer", mission: "Teilbare Countdowns fuer Launches und Events.", features: ["Deep-Link-Countdowns", "Embed-Code", "OG-Preview"], keywords: ["countdown", "timer", "launch", "event"], buildHours: 2 },
  { id: "pdf-merger", name: "PDF-Zusammenfuegen", mission: "PDFs im Browser zusammenfuegen — keine Uploads, kein Server.", features: ["Client-seitig (PDF.js)", "Reihenfolge-Drag", "Null Datenabfluss"], keywords: ["pdf", "zusammenfuegen", "mergen", "split"], buildHours: 5 },
];

export type SaaSToolIdea = {
  title: string;
  slug: string;
  templateId: SaaSToolTemplateId;
  score: number;
};

const EVERGREEN_SIGNALS = ["kostenlos", "gratis", "online", "rechner", "generator", "check", "converter"] as const;
const SATURATION_SIGNALS = ["casino", "krypto-trading", "versicherungsvergleich", "datenhandel"] as const;

export function slugifySaaSTool(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "micro-tool";
}

export function pickSaaSTemplate(query: string): SaaSToolTemplate {
  const q = query.toLowerCase();
  let best = SAAS_TEMPLATES[0];
  let bestHits = 0;
  for (const template of SAAS_TEMPLATES) {
    const hits = template.keywords.filter((keyword) => q.includes(keyword)).length;
    if (hits > bestHits) {
      best = template;
      bestHits = hits;
    }
  }
  return best;
}

export function scoreSaaSToolIdea(title: string, mission: string): { score: number; reasons: string[] } {
  const haystack = `${title} ${mission}`.toLowerCase();
  const reasons: string[] = [];
  let score = 50;
  for (const signal of EVERGREEN_SIGNALS) {
    if (haystack.includes(signal)) {
      score += 8;
      reasons.push(`Evergreen-Signal: "${signal}"`);
    }
  }
  for (const saturation of SATURATION_SIGNALS) {
    if (haystack.includes(saturation)) {
      score -= 25;
      reasons.push(`Risiko-Signal (gesaettigt/risikobehaftet): "${saturation}"`);
    }
  }
  if (title.trim().length < 6) {
    score -= 10;
    reasons.push("Titel zu kurz fuer SEO");
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export type SaaSBuildPlan = {
  idea: SaaSToolIdea;
  template: SaaSToolTemplate;
  steps: readonly string[];
  estimatedHours: number;
};

export function planSaaSToolBuild(title: string, mission: string): SaaSBuildPlan {
  const template = pickSaaSTemplate(`${title} ${mission}`);
  const { score } = scoreSaaSToolIdea(title, mission);
  const slug = slugifySaaSTool(title);
  return {
    idea: { title: title.trim() || template.name, slug, templateId: template.id, score },
    template,
    steps: [
      `Spec erfassen: ${template.mission}`,
      "Scaffold: statischer One-Pager (HTML/CSS/Vanilla, kein Server noetig)",
      `Implementierung: ${template.features.join(", ")}`,
      "Self-Test: Lighthouse + manuelle Crosschecks (Green Rule)",
      "Publish: GitHub-Pages-Deploy (0 Euro) + Landingpage-Eintrag",
      "Draft-Engine: Freigabe durch den Regisseur vor Publikation",
    ],
    estimatedHours: template.buildHours,
  };
}
