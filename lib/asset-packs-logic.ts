/**
 * Sprint 279 — Asset-Packs (Outfit- & Sets-Packs) — reine Logik.
 *
 * Outfit-Packs steuern das Erscheinungsbild der Figur, Sets-Packs die
 * Bühne/Umwelt der Szenenbilder. Beide wirken an genau zwei Stellen:
 * 1. FLUX-Prompt-Modifikatoren (echte Bilder), 2. deterministische
 * Gradient-Rückfall-Farben (kein Bild verfügbar).
 *
 * Ehrlichkeit: Ein Pack garantiert kein FLUX-Bild — fällt der Provider aus,
 * greifen die Pack-Farben im Farbverlauf-Rückfall. Keine Marketing-Fassade.
 */

export const ASSET_PACK_KINDS = ["outfit", "sets"] as const;
export type AssetPackKind = (typeof ASSET_PACK_KINDS)[number];

export const ASSET_PACK_LIMITS = {
  maxPacksPerUser: 12,
  maxNameLength: 48,
  minNameLength: 3,
  maxModifiers: 5,
  minModifierLength: 3,
  maxModifierLength: 80,
  maxPromptCharsTotal: 900,
} as const;

/** Farbwerte im 6-stelligen Hex-Format ohne #, deterministisch nutzbar für Gradient-Fallbacks. */
const HEX_COLOR = /^[0-9a-fA-F]{6}$/;

export type AssetPack = {
  id: string;
  kind: AssetPackKind;
  name: string;
  promptModifiers: string[];
  /** Rückfall-Farben für den Gradient-Bühnen-Fallback (Hex, ohne #). */
  fallbackColors: [string, string];
  active: boolean;
  createdAt: number;
};

export type AssetPackInput = {
  kind: AssetPackKind;
  name: string;
  promptModifiers: string[];
  fallbackColors: [string, string];
};

export type AssetPackValidation =
  | { ok: true; pack: AssetPack }
  | { ok: false; error: string; retryHint: string | null };

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** Erzeugt eine kurze, kollisionsarme ID ohne externe Abhängigkeit. */
export function createAssetPackId(seed: string): string {
  let hash = 2166136261;
  const input = `${seed}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `pack_${hash.toString(36)}`;
}

/** Validiert und normalisiert Nutzereingaben — keine Kapitel, die leere Modifikatoren erlauben würden. */
export function validateAssetPackInput(input: {
  kind?: unknown;
  name?: unknown;
  promptModifiers?: unknown;
  fallbackColors?: unknown;
}): AssetPackValidation {
  if (typeof input.kind !== "string" || !ASSET_PACK_KINDS.includes(input.kind as AssetPackKind)) {
    return {
      ok: false,
      error: `Pack-Art muss "outfit" oder "sets" sein (erhalten: "${String(input.kind)}").`,
      retryHint: "Art im Formular korrekt auswählen.",
    };
  }
  if (typeof input.name !== "string" || input.name.trim().length < ASSET_PACK_LIMITS.minNameLength || input.name.trim().length > ASSET_PACK_LIMITS.maxNameLength) {
    return {
      ok: false,
      error: `Name muss ${ASSET_PACK_LIMITS.minNameLength}–${ASSET_PACK_LIMITS.maxNameLength} Zeichen haben.`,
      retryHint: "Aussagekräftiger Kurztitel, z. B. 'Business-Look'.",
    };
  }
  if (!Array.isArray(input.promptModifiers) || input.promptModifiers.length === 0) {
    return {
      ok: false,
      error: "Mindestens ein Prompt-Modifikator ist nötig — ein Pack ohne Beschreibung wirkt nicht.",
      retryHint: "z. B. ['elegantes dunkles Kostüm', 'goldene Akzente'].",
    };
  }
  if (input.promptModifiers.length > ASSET_PACK_LIMITS.maxModifiers) {
    return {
      ok: false,
      error: `Maximal ${ASSET_PACK_LIMITS.maxModifiers} Modifikatoren pro Pack.`,
      retryHint: "Weniger, dafür präzisere Modifikatoren.",
    };
  }
  const modifiers: string[] = [];
  for (const raw of input.promptModifiers) {
    if (typeof raw !== "string") {
      return { ok: false, error: "Modifikatoren müssen Text sein.", retryHint: null };
    }
    const trimmed = raw.trim();
    if (trimmed.length < ASSET_PACK_LIMITS.minModifierLength || trimmed.length > ASSET_PACK_LIMITS.maxModifierLength) {
      return {
        ok: false,
        error: `Modifikator braucht ${ASSET_PACK_LIMITS.minModifierLength}–${ASSET_PACK_LIMITS.maxModifierLength} Zeichen.`,
        retryHint: "Kurze, konkrete visuelle Beschreibung.",
      };
    }
    if (!modifiers.includes(trimmed)) modifiers.push(trimmed);
  }
  if (input.promptModifiers.length === 0) {
    return { ok: false, error: "Keine verwertbaren Modifikatoren nach Bereinigung.", retryHint: null };
  }
  const colors = input.fallbackColors;
  if (
    !Array.isArray(colors) ||
    colors.length !== 2 ||
    !isHexColor(colors[0]) ||
    !isHexColor(colors[1])
  ) {
    return {
      ok: false,
      error: "Rückfall-Farben müssen zwei 6-stellige Hex-Werte sein (ohne #), z. B. ['1e293b','7c3aed'].",
      retryHint: "Hex-Farbpaar für den Gradient-Fallback angeben.",
    };
  }
  return {
    ok: true,
    pack: {
      id: createAssetPackId(input.name as string),
      kind: input.kind as AssetPackKind,
      name: (input.name as string).trim(),
      promptModifiers: modifiers,
      fallbackColors: [colors[0].toLowerCase(), colors[1].toLowerCase()],
      active: true,
      createdAt: Date.now(),
    },
  };
}

/** Deterministische Auswahl: genau ein aktives Outfit- und ein aktives Sets-Pack. */
export function pickActivePacks(packs: AssetPack[]): {
  outfit: AssetPack | null;
  sets: AssetPack | null;
} {
  const active = (kind: AssetPackKind) =>
    packs.filter((p) => p.active && p.kind === kind).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
  return { outfit: active("outfit"), sets: active("sets") };
}

/**
 * Sprint 281-Kern: setzt Pack-Modifikatoren deterministisch an den
 * Szenen-Visual-Prompt. Cap: 900 Zeichen gesamt — härtere Kürzung
 * schweigt nicht, sondern kürzt die Modifikatoren (Modifikatoren
 * verlieren nie gegen den Basis-Prompt).
 */
export function composeSceneImagePrompt(
  baseVisualPrompt: string,
  packs: { outfit: AssetPack | null; sets: AssetPack | null },
): string {
  const parts: string[] = [];
  if (packs.outfit) parts.push(`Outfit: ${packs.outfit.promptModifiers.join(", ")}`);
  if (packs.sets) parts.push(`Set: ${packs.sets.promptModifiers.join(", ")}`);
  if (parts.length === 0) return baseVisualPrompt;
  const suffix = ` ${parts.join(". ")}.`;
  const budget = Math.max(0, ASSET_PACK_LIMITS.maxPromptCharsTotal - baseVisualPrompt.length);
  if (suffix.length <= budget) return `${baseVisualPrompt}${suffix}`;
  const reduced = suffix.slice(0, budget).replace(/\s+[^\s]+\s*$/, "") + ".";
  return `${baseVisualPrompt} ${reduced.trim()}`;
}

/**
 * Gradient-Rückfallfarbe eines Packs pro Szene: deterministisch rotierend
 * über beide Pack-Farben, damit Szenen unterscheidbar bleiben, ohne Zufall.
 */
export function packGradientForScene(
  packs: { outfit: AssetPack | null; sets: AssetPack | null },
  sceneIndex: number,
): { from: string; to: string } {
  const dominant = packs.sets ?? packs.outfit;
  if (!dominant) return { from: "1e293b", to: "7c3aed" };
  const rotate = (a: string, b: string, index: number) => (index % 2 === 0 ? { from: a, to: b } : { from: b, to: a });
  const first = packs.outfit;
  // Szene gerade: Sets-Farben, ungerade: Outfit-Farben — beide Packs bleiben sichtbar.
  const source = sceneIndex % 2 === 0 ? dominant : (first ?? dominant);
  return rotate(source.fallbackColors[0], source.fallbackColors[1], sceneIndex);
}

/** Speicherformat: rohe Pack-Liste parsen — kaputte Einträge werden ehrlich verworfen. */
export function parseStoredPacks(raw: unknown): AssetPack[] {
  if (!Array.isArray(raw)) return [];
  const packs: AssetPack[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string") continue;
    if (typeof candidate.kind !== "string" || !ASSET_PACK_KINDS.includes(candidate.kind as AssetPackKind)) continue;
    if (!Array.isArray(candidate.promptModifiers)) continue;
    if (!Array.isArray(candidate.fallbackColors) || candidate.fallbackColors.length !== 2) continue;
    if (!isHexColor(candidate.fallbackColors[0]) || !isHexColor(candidate.fallbackColors[1])) continue;
    packs.push({
      id: candidate.id,
      kind: candidate.kind as AssetPackKind,
      name: candidate.name,
      promptModifiers: candidate.promptModifiers.filter((m): m is string => typeof m === "string" && m.trim().length > 0),
      fallbackColors: [candidate.fallbackColors[0] as string, candidate.fallbackColors[1] as string],
      active: candidate.active === true,
      createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : 0,
    });
  }
  return packs;
}

/** Ehrliche Statistik fürs Rendering-Ergebnis: welche Packs haben gewirkt? */
export function describePacksInNote(packs: { outfit: AssetPack | null; sets: AssetPack | null }): string {
  const used: string[] = [];
  if (packs.outfit) used.push(`Outfit-Pack "${packs.outfit.name}"`);
  if (packs.sets) used.push(`Sets-Pack "${packs.sets.name}"`);
  return used.length > 0 ? `Packs: ${used.join(", ")}` : "keine Packs";
}

/**
 * Deterministische Signatur der aktiven Packs für den Video-Cache-Key:
 * Andere Packs = anderes Video = anderer Cache. Verhindert, dass ein
 * gecachtes Video mit den falschen Packs ausgeliefert wird.
 */
export function packsSignature(packs: { outfit: AssetPack | null; sets: AssetPack | null }): string {
  const part = (pack: AssetPack | null) =>
    pack === null ? "-" : `${pack.id}:${pack.promptModifiers.join("+")}`;
  return `${part(packs.outfit)}|${part(packs.sets)}`;
}
