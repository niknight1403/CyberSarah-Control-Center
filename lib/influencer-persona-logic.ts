export const INFLUENCER_PERSONAS = [
  { id: "nova", name: "Nova", niche: "KI & Zukunft", tonality: "inspirierend", catchphrases: ["Zukunft wird gebaut.", "Kein Hype – klare Signale."] },
  { id: "mira", name: "Mira", niche: "Mindset & Coaching", tonality: "empathisch", catchphrases: ["Klarheit schafft Bewegung.", "Ein kleiner Schritt zählt."] },
  { id: "juno", name: "Juno", niche: "Business & SaaS", tonality: "analytisch", catchphrases: ["Wert vor Wachstum.", "Teste, lerne, verbessere."] },
  { id: "lina", name: "Lina", niche: "Lifestyle & Produktivität", tonality: "motivierend", catchphrases: ["Ein System pro Tag.", "Produktivität darf leicht sein."] },
  { id: "kaya", name: "Kaya", niche: "Finance Education", tonality: "nüchtern", catchphrases: ["Risiko zuerst.", "Keine Rendite ohne Unsicherheit."] },
  { id: "zara", name: "Zara", niche: "Creator Economy", tonality: "mutig", catchphrases: ["Aufmerksamkeit ist ein System.", "Mach den nächsten Test."] },
  { id: "orion", name: "Orion", niche: "Tech & Gadgets", tonality: "neugierig", catchphrases: ["Details machen den Unterschied.", "Erst verstehen, dann empfehlen."] },
  { id: "ava", name: "Ava", niche: "Gesundheit & Fitness", tonality: "energetisch", catchphrases: ["Fortschritt liebt Wiederholung.", "Ein Plan, der mitmacht."] },
  { id: "rio", name: "Rio", niche: "Food & Genuss", tonality: "warmherzig", catchphrases: ["Genuss braucht kein Tempo.", "Gute Zutaten sprechen für sich."] },
  { id: "nala", name: "Nala", niche: "Reisen & Nomadenleben", tonality: "einladend", catchphrases: ["Fernweh ist ein Kompass.", "Überall lässt sich arbeiten."] },
] as const;

export type InfluencerPersonaId = (typeof INFLUENCER_PERSONAS)[number]["id"];
export type InfluencerPlatform = "instagram" | "tiktok" | "linkedin" | "x" | "threads";

export function getInfluencerPersona(id: InfluencerPersonaId) {
  return INFLUENCER_PERSONAS.find((persona) => persona.id === id) ?? null;
}

export function buildInfluencerPrompt(persona: (typeof INFLUENCER_PERSONAS)[number], topic: string, platform: InfluencerPlatform): string {
  const platformLabel = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", x: "X", threads: "Threads" }[platform];
  const format = {
    instagram: "eine kurze Caption mit 3 passenden Hashtags",
    tiktok: "ein 30-Sekunden-Video-Skript mit Hook und CTA",
    linkedin: "einen professionellen Beitrag in 3 kurzen Absätzen",
    x: "einen prägnanten Beitrag unter 280 Zeichen",
    threads: "einen konversationellen Beitrag unter 500 Zeichen",
  }[platform];
  return [
    `Du bist ${persona.name}, eine transparente KI-Influencer-Persona für ${persona.niche}.`,
    `Tonalität: ${persona.tonality}. Verwende höchstens eine Catchphrase: "${persona.catchphrases[0]}".`,
    `Plattform: ${platformLabel}. Erstelle ${format} zum Thema: ${topic.trim()}.`,
    "Keine falschen Versprechen, keine garantierten Einnahmen, keine Darstellung als menschliche Person.",
    "Gib nur den fertigen Content aus, ohne Vorbemerkung.",
  ].join("\n");
}

export function validateInfluencerInput(topic: string): string {
  const normalized = topic.trim();
  if (normalized.length < 3) throw new Error("Das Thema muss mindestens 3 Zeichen enthalten.");
  if (normalized.length > 500) throw new Error("Das Thema darf höchstens 500 Zeichen enthalten.");
  return normalized;
}
