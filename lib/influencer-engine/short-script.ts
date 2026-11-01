export type ShortScriptInput = {
  topic: string;
  audience: string;
  platform: "instagram" | "tiktok" | "facebook";
  proofPoint?: string;
  callToAction?: string;
};

export type ShortScriptBlueprint = {
  durationSeconds: number;
  hook: string;
  beats: string[];
  cta: string;
  onScreenText: string[];
};

const clean = (value: string, fallback: string) => value.trim().replace(/\s+/g, " ") || fallback;

export function buildShortScriptBlueprint(input: ShortScriptInput): ShortScriptBlueprint {
  const topic = clean(input.topic, "Wellness-Tipp");
  const audience = clean(input.audience, "gesundheitsbewusste Erwachsene");
  const proof = input.proofPoint ? clean(input.proofPoint, "") : "";
  const cta = clean(input.callToAction ?? "", "Speichere den Beitrag und prüfe die Quellen in der Beschreibung.");
  const hook = `Stopp: Wenn du dich für ${topic} interessierst, prüfe zuerst diesen Punkt.`;
  const beats = [
    `Problem: Viele ${audience} sehen zu ${topic} widersprüchliche Kurz-Tipps.`,
    `Einordnung: Trenne persönliche Erfahrung, plausible Erklärung und belastbare Evidenz.`,
    proof ? `Beleg: ${proof}` : "Beleg: Nenne Quelle, Datum und Grenzen statt Heilsversprechen.",
  ];
  return {
    durationSeconds: input.platform === "tiktok" ? 20 : 24,
    hook,
    beats,
    cta,
    onScreenText: [topic, "Quelle prüfen", "Keine Heilsversprechen"],
  };
}
