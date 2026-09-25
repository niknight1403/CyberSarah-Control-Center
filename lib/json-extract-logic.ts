/**
 * Sprint 350 — Generisches JSON-Extraktions-Utility. Urspruenglich Teil der
 * Designer-Logik (Sprint 133), vom Designer-Tab-Entfernen betraef: Der
 * Optimizer-Loop (server/orchestrator) parst damit LLM-Antworten.
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = (raw ?? "").trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Validiert ein generiertes SVG: entfernt Code-Fences, prueft Grundform,
 * blockiert aktive Inhalte (script/foreignObject/external href) und
 * Groessenlimits. Gibt das bereinigte SVG oder null zurueck (rein).
 */
