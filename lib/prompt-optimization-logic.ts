/**
 * Prompt-Optimierung (rein, deterministisch): bereinigt und verdichtet
 * Eingabe-Prompts für das Chat-Entwicklungsfenster — ohne semantische
 * Verdrehung, dafür messbare, auflistbare Änderungen.
 */

export type PromptOptimizationResult = {
  optimized: string;
  changes: string[];
  removedChars: number;
};

const FILLER_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(kannst du|könntest du|bitte|vielleicht|mir|mal|doch|halt|einfach)\b/gi, label: "Füllwörter entfernt" },
  { pattern: /\b(hey|hallo|hi)\b[!,.]?\s*/gi, label: "Begrüßung entfernt" },
];

export function optimizePrompt(text: string): PromptOptimizationResult {
  const changes: string[] = [];
  let working = text;

  for (const { pattern, label } of FILLER_PATTERNS) {
    const before = working;
    working = working.replace(pattern, " ");
    if (working !== before && !changes.includes(label)) changes.push(label);
  }

  if (/[ \t]+$/m.test(working)) {
    working = working.split("\n").map((line) => line.replace(/[ \t]+$/, "")).join("\n");
    changes.push("Leerzeichen am Zeilenende entfernt");
  }
  if (working !== working.replace(/[ \t]{2,}/g, " ")) {
    working = working.replace(/[ \t]{2,}/g, " ");
    changes.push("Mehrfache Leerzeichen zusammengefasst");
  }
  if (/\n{3,}/.test(working)) {
    working = working.replace(/\n{3,}/g, "\n\n");
    changes.push("Mehrfache Leerzeilen verdichtet");
  }
  const trimmed = working.trim();
  if (trimmed !== working) changes.push("Anfang und Ende beschnitten");
  working = trimmed;

  return {
    optimized: working,
    changes,
    removedChars: Math.max(text.length - working.length, 0),
  };
}

export type SystemContextSnapshot = {
  provider: string;
  modelClass: string;
  designTheme: string;
  colorScheme: "light" | "dark";
  iterationCount: number;
  maxIterations: number;
  lastLoopState: string;
};

/** Kompakte Kontext-Zeile für den System-Kontext-Inspektor. */
export function describeSystemContext(snapshot: SystemContextSnapshot): string {
  return (
    `Provider ${snapshot.provider} · ${snapshot.modelClass} · Design ${snapshot.designTheme} (${snapshot.colorScheme}) · ` +
    `Iteration ${snapshot.iterationCount}/${snapshot.maxIterations} · Loop ${snapshot.lastLoopState}`
  );
}
