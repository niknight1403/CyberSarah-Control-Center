/**
 * Sprint 222 — Loop-Engineering-Modul (rein, testbar): Kern-Domäne für
 * Umsatz-Schleifen als Entwürfe.
 *
 * Ehrlichkeits-Regeln des Moduls:
 *   - Jede Schleife ist ein ENTWURF bis zur expliziten Freigabe — kein
 *     automatischer Start, keine Umsatzversprechen.
 *   - Ungültige Eingaben werden abgelehnt und benannt, nicht korrigiert.
 *   - Fortschritt ist nur eine Beobachtung mit Begründung — keine Prognose.
 */

export type LoopStatus = "draft" | "running" | "measuring" | "completed" | "stalled" | "discarded";

export type LoopDraft = {
  id: string;
  name: string;
  /** z. B. "Content → Lead" */
  flow: string;
  hypothesis: string;
  experiment: string;
  /** Messgröße, z. B. "Newsletter-Anmeldungen" oder "EUR Umsatz". */
  metric: string;
  unit: string;
  targetValue: number;
  currentValue: number;
  status: LoopStatus;
  createdAt: number;
  updatedAt: number;
  /** Bisherige Messpunkte (chronologisch, ältester zuerst). */
  samples: LoopSample[];
};

export type LoopSample = {
  at: number;
  value: number;
  /** Ehrlicher Hinweis zum Messpunkt (z. B. "Manuell gezählt"). */
  note?: string;
};

export const LOOP_DISCLAIMER =
  "Alle Schleifen sind Entwürfe und Planungshilfen: keine Umsatzgarantie, keine automatische Ausführung — jeder Schritt braucht deine explizite Freigabe.";

/* ==================== Validierung ==================== */

export type LoopValidationResult = {
  valid: boolean;
  reason: string;
};

/** Maximale Längen bewusst knapp: mobile Erfassung, keine Roman-Felder. */
export const LOOP_FIELD_LIMITS = { name: 60, flow: 60, hypothesis: 300, experiment: 300, metric: 60, unit: 20 } as const;

/** Validiert einen neuen/aktualisierten Schleifen-Entwurf ehrlich (keine stillen Korrekturen). */
export function validateLoopDraft(draft: Partial<LoopDraft>): LoopValidationResult {
  const name = (draft.name ?? "").trim();
  if (name.length < 3 || name.length > LOOP_FIELD_LIMITS.name) {
    return { valid: false, reason: `Der Name muss 3–${LOOP_FIELD_LIMITS.name} Zeichen haben.` };
  }
  const flow = (draft.flow ?? "").trim();
  if (flow.length < 3 || flow.length > LOOP_FIELD_LIMITS.flow) {
    return { valid: false, reason: `Der Fluss muss 3-${LOOP_FIELD_LIMITS.flow} Zeichen haben (z. B. "Content - Lead").` };
  }
  const hypothesis = (draft.hypothesis ?? "").trim();
  if (hypothesis.length < 10 || hypothesis.length > LOOP_FIELD_LIMITS.hypothesis) {
    return { valid: false, reason: `Die Hypothese muss 10–${LOOP_FIELD_LIMITS.hypothesis} Zeichen haben — eine prüfbare Annahme, keine Behauptung.` };
  }
  const experiment = (draft.experiment ?? "").trim();
  if (experiment.length < 10 || experiment.length > LOOP_FIELD_LIMITS.experiment) {
    return { valid: false, reason: `Das Experiment muss 10–${LOOP_FIELD_LIMITS.experiment} Zeichen haben — was konkret getestet wird.` };
  }
  const metric = (draft.metric ?? "").trim();
  if (metric.length < 3 || metric.length > LOOP_FIELD_LIMITS.metric) {
    return { valid: false, reason: `Die Messgröße muss 3–${LOOP_FIELD_LIMITS.metric} Zeichen haben.` };
  }
  const unit = (draft.unit ?? "").trim();
  if (unit.length === 0 || unit.length > LOOP_FIELD_LIMITS.unit) {
    return { valid: false, reason: "Die Einheit fehlt oder ist zu lang (z. B. 'Anmeldungen' oder 'EUR')." };
  }
  const target = draft.targetValue;
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) {
    return { valid: false, reason: "Das Ziel muss eine positive Zahl sein — ohne Ziel kein messbarer Fortschritt." };
  }
  const current = draft.currentValue;
  if (typeof current !== "number" || !Number.isFinite(current) || current < 0) {
    return { valid: false, reason: "Der aktuelle Wert muss eine nicht-negative Zahl sein." };
  }
  return { valid: true, reason: "Entwurf strukturell plausibel." };
}

/** Erzeugt einen normalisierten Entwurf oder wirft die ehrliche Begründung. */
export function createLoopDraft(input: Partial<LoopDraft>, now = Date.now): LoopDraft {
  const validation = validateLoopDraft(input);
  if (!validation.valid) throw new Error(validation.reason);
  const timestamp = now();
  return {
    id: (input.id ?? "").trim() || `loop-${timestamp.toString(36)}`,
    name: input.name!.trim(),
    flow: input.flow!.trim(),
    hypothesis: input.hypothesis!.trim(),
    experiment: input.experiment!.trim(),
    metric: input.metric!.trim(),
    unit: input.unit!.trim(),
    targetValue: input.targetValue!,
    currentValue: input.currentValue ?? 0,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    samples: [],
  };
}

/* ==================== Anzeige-Hilfen ==================== */

export function loopStatusLabel(status: LoopStatus): string {
  const labels: Record<LoopStatus, string> = {
    draft: "Entwurf",
    running: "Läuft",
    measuring: "Messung",
    completed: "Abgeschlossen",
    stalled: "Steckengeblieben",
    discarded: "Verworfen",
  };
  return labels[status];
}

/** Fortschritt in Prozent, geklemmt auf 0–100, nie gerundet beschönigt. */
export function loopProgressPercent(loop: LoopDraft): number {
  if (loop.targetValue <= 0) return 0;
  const raw = (loop.currentValue / loop.targetValue) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

/* ==================== Fortschritts-Auswertung (Sprint 223) ==================== */

export type LoopProgressVerdict = {
  classification: "on-track" | "behind" | "stalled" | "unknown";
  reason: string;
  /** Anteil am Ziel in Prozent (0–100), geklemmt — nur bei belastbaren Zahlen. */
  percent: number;
};

/**
 * Bewertet den Fortschritt einer Schleife ehrlich:
 *   - Ohne Messpunkte (samples/currentValue unverändert) ist alles "unknown".
 *   - Der Trend folgt den letzten Messpunkten, nicht der Stimmung.
 *   - Gestoppte/verworfene Schleifen werden nicht bewertet, sondern benannt.
 */
export function evaluateLoopProgress(loop: LoopDraft): LoopProgressVerdict {
  if (loop.status === "discarded") {
    return { classification: "unknown", reason: `Schleife ist verworfen — keine Bewertung mehr nötig.`, percent: 0 };
  }
  if (loop.status === "completed") {
    return { classification: "on-track", reason: `Ziel erreicht (${loop.currentValue} von ${loop.targetValue} ${loop.unit}).`, percent: 100 };
  }
  if (loop.status === "stalled") {
    return { classification: "stalled", reason: `Schleife ist als steckengeblieben markiert — erst Ursache klären, dann weitermachen.`, percent: loopProgressPercent(loop) };
  }
  if (loop.samples.length === 0 && loop.currentValue === 0) {
    return { classification: "unknown", reason: "Noch keine Messpunkte erfasst — Fortschritt ist unbekannt, nicht null.", percent: 0 };
  }
  const percent = loopProgressPercent(loop);
  if (percent >= 100) {
    return { classification: "on-track", reason: `Zielwert erreicht (${loop.currentValue} von ${loop.targetValue} ${loop.unit}) — Abschluss erfordert deine Bestätigung.`, percent };
  }
  if (loop.samples.length < 2) {
    return { classification: "unknown", reason: `Erst ${loop.samples.length} Messpunkt${loop.samples.length === 1 ? "" : "e"} — ein Trend braucht mindestens zwei.`, percent };
  }
  const last = loop.samples[loop.samples.length - 1]!.value;
  const previous = loop.samples[loop.samples.length - 2]!.value;
  const rising = last > previous;
  if (percent >= 50) {
    return { classification: "on-track", reason: `${percent} % des Ziels, letzte Messung ${rising ? "steigend" : "nicht steigend"} (${previous} → ${last} ${loop.unit}).`, percent };
  }
  if (!rising) {
    return { classification: "behind", reason: `Nur ${percent} % des Ziels und letzte Messung nicht steigend (${previous} → ${last} ${loop.unit}) — Experiment überdenken.`, percent };
  }
  return { classification: "behind", reason: `${percent} % des Ziels, aber letzte Messung steigt (${previous} → ${last} ${loop.unit}).`, percent };
}

/* ==================== Nächster-Schritt-Empfehlung (Sprint 224) ==================== */

export type LoopNextStep = {
  action: "approve-start" | "record-sample" | "review-hypothesis" | "mark-stalled" | "approve-completion" | "discard" | "none";
  title: string;
  reason: string;
  /** true, wenn der Schritt eine explizite Nutzer-Freigabe braucht. */
  requiresApproval: boolean;
};

/**
 * Deterministische Empfehlung des nächsten Schritts aus Status und Bewertung.
 * Keine Empfehlung erfüllt sich selbst: alles mit requiresApproval bleibt
 * hängend, bis der Nutzer bestätigt.
 */
export function recommendNextStep(loop: LoopDraft): LoopNextStep {
  const verdict = evaluateLoopProgress(loop);
  switch (loop.status) {
    case "draft":
      return {
        action: "approve-start",
        title: "Experiment starten",
        reason: `Der Entwurf ist plausibel, aber nichts läuft ohne deine Freigabe. Beim Start verpflichtest du dich auf: ${loop.experiment}`,
        requiresApproval: true,
      };
    case "running":
      if (loop.samples.length === 0) {
        return {
          action: "record-sample",
          title: "Ersten Messpunkt erfassen",
          reason: `Ohne mindestens einen Messpunkt für ${loop.metric} bleibt der Fortschritt unbekannt.`,
          requiresApproval: false,
        };
      }
      if (verdict.classification === "on-track" && verdict.percent >= 100) {
        return {
          action: "approve-completion",
          title: "Abschluss prüfen",
          reason: `Zielwert erreicht (${loop.currentValue} von ${loop.targetValue} ${loop.unit}). Der Abschluss braucht deine Bestätigung — keine Schleife schließt sich selbst.`,
          requiresApproval: true,
        };
      }
      if (verdict.classification === "behind" && verdict.percent < 25 && loop.samples.length >= 3) {
        return {
          action: "review-hypothesis",
          title: "Hypothese überdenken",
          reason: `Nur ${verdict.percent} % des Ziels nach ${loop.samples.length} Messpunkten — die Annahme selbst ist der erste Verdächtige.`,
          requiresApproval: false,
        };
      }
      return {
        action: "record-sample",
        title: "Nächsten Messpunkt erfassen",
        reason: `${verdict.percent} % des Ziels. Regelmäßige Messpunkte (${loop.metric}) machen den Trend sichtbar.`,
        requiresApproval: false,
      };
    case "measuring":
      return {
        action: "record-sample",
        title: "Messung abschließen",
        reason: "Die Messung läuft — Ergebnis erfassen, dann bewerten statt raten.",
        requiresApproval: false,
      };
    case "stalled":
      return {
        action: "review-hypothesis",
        title: "Blockade auflösen",
        reason: "Steckengeblieben: Erst klären, ob die Annahme falsch ist oder nur die Umsetzung hakt.",
        requiresApproval: false,
      };
    case "completed":
      return { action: "none", title: "Abgeschlossen", reason: "Ziel erreicht und bestätigt — aus dieser Schleife lernen, dann weiter.", requiresApproval: false };
    case "discarded":
      return { action: "none", title: "Verworfen", reason: "Diese Schleife wird nicht weiterverfolgt.", requiresApproval: false };
  }
}

/* ==================== Experiment-Planer (Sprint 225) ==================== */

export type ExperimentPlan = {
  durationDays: number;
  /** Empfohlene Messpunkte (Plan-Intervall, keine Pflicht). */
  sampleIntervalDays: number;
  expectedSamples: number;
  caveats: string[];
  /** Bewusst fehlende Größenordnung: Das Modul verspricht keinen Umsatz. */
  promisedRevenue: false;
}

export const EXPERIMENT_LIMITS = { minDays: 7, maxDays: 90, minSamples: 3, minTarget: 1 } as const;

/**
 * Plant das Messfenster eines Experiments mit Plausibilitäts-Grenzen.
 * Zu kurze Fenster oder Mini-Ziele werden abgelehnt — ein "Experiment" über
 * zwei Tage mit Ziel 1 ist keine Messung, sondern eine Behauptung.
 */
export function planExperiment(loop: LoopDraft, durationDays: number): ExperimentPlan {
  const caveats: string[] = [];
  if (!Number.isFinite(durationDays) || durationDays < EXPERIMENT_LIMITS.minDays) {
    throw new Error(`Ein Experiment braucht mindestens ${EXPERIMENT_LIMITS.minDays} Tage — kürzere Fenster messen nur Rauschen.`);
  }
  if (durationDays > EXPERIMENT_LIMITS.maxDays) {
    caveats.push(`Auf ${durationDays} Tage geklemmt: Experimente über ${EXPERIMENT_LIMITS.maxDays} Tage veralten schneller, als sie messen.`);
    durationDays = EXPERIMENT_LIMITS.maxDays;
  }
  if (loop.targetValue < 3) {
    caveats.push("Sehr kleines Ziel: Ein einzelner Datenpunkt kann das Ergebnis bereits bestimmen — größere Stichproben sind belastbarer.");
  }
  const sampleIntervalDays = Math.max(1, Math.floor(durationDays / 4));
  const expectedSamples = Math.floor(durationDays / sampleIntervalDays);
  if (expectedSamples < EXPERIMENT_LIMITS.minSamples) {
    caveats.push(`Nur ${expectedSamples} Messpunkte geplant — Trends brauchen mindestens ${EXPERIMENT_LIMITS.minSamples}.`);
  }
  if (loop.status !== "draft") {
    caveats.push("Die Schleife läuft bereits — der Plan beschreibt das Restfenster, kein neues Experiment.");
  }
  return {
    durationDays,
    sampleIntervalDays,
    expectedSamples,
    caveats: caveats.length === 0 ? ["Fenster plausibel — Verlaufs-Trends bleiben Beobachtungen, keine Prognosen."] : caveats,
    promisedRevenue: false,
  };
}

/* ==================== Prompt-Parsing (Sprint 226) ==================== */

export type LoopPromptAction = "list" | "status" | "create" | "sample" | "advance" | "discard";

export type LoopPromptCommand = {
  actions: LoopPromptAction[];
  /** Ziel-Schleife per Name-Anteil (case-insensitive) — null wenn uneindeutig offen. */
  nameQuery: string | null;
  /** Neuer Entwurf (nur bei create mit Feldern). */
  draft: Partial<LoopDraft> | null;
  /** Neuer Messwert (nur bei sample). */
  sampleValue: number | null;
};

/**
 * Parst deutsche Loop-Engineering-Aufträge. Verneinte Aktionen
 * ("nicht starten", "keine Änderung") werden als reine Statusanfragen
 * interpretiert — das Modul ändert nie ohne Freigabe.
 */
export function parseLoopPrompt(prompt: string): LoopPromptCommand {
  const trimmed = prompt.trim();
  if (!trimmed) return { actions: ["list"], nameQuery: null, draft: null, sampleValue: null };

  const actions: LoopPromptAction[] = [];
  if (/\b(erstell|leg.*an|neu(?:er|e)?\s*(?:schleife|loop)|anleg)/i.test(trimmed)) actions.push("create");
  if (/\b(mess(?:punkt|wert)|sample|aktualisier)\b/i.test(trimmed) || /messpunkt erfassen/i.test(trimmed)) actions.push("sample");
  if (/\b(weiter|nächster schritt|start|starten|freigeb|abschließ|abschluss)/i.test(trimmed)) actions.push("advance");
  if (/\b(verwirf|verwerf|löschen|beenden)/i.test(trimmed)) actions.push("discard");
  if (/\b(status|stand|wie läuft|fortschritt)/i.test(trimmed)) actions.push("status");
  if (/\b(liste|übersicht|alle|zeig)/i.test(trimmed)) actions.push("list");
  if (actions.length === 0) actions.push("status");

  const negated = /(nicht|kein\w*)\s+(start|starten|freigeb|löschen|verwerf|ändern|abschließ)/i.test(trimmed);
  if (negated) {
    // Nur darstellen, nichts anstoßen.
    return { actions: ["status"], nameQuery: extractNameQuery(trimmed), draft: null, sampleValue: null };
  }

  const draft = actions.includes("create") ? extractDraft(trimmed) : null;
  const sampleValue = extractSampleValue(trimmed);
  return { actions, nameQuery: extractNameQuery(trimmed), draft, sampleValue };
}

function extractNameQuery(prompt: string): string | null {
  const quoted = prompt.match(/['"\u201e\u201c]([^'"\u201e\u201c]+)['"\u201e\u201c]/);
  if (quoted?.[1]) return quoted[1].trim();
  const verbMatch = prompt.match(/\b(?:starte|start|verwirf|verwerf|lösche|status(?:\s+von)?)\s+([\w\- /]+)/i);
  if (verbMatch?.[1]) return verbMatch[1].trim();
  const forMatch = prompt.match(/\b(?:für|von)\s+(?:die\s+)?(?:Schleife\s+)?([\w\- /]+?)(?:\s+(?:mit|über|in|und)|$)/i);
  return forMatch?.[1]?.trim() || null;
}

function extractDraft(prompt: string): Partial<LoopDraft> {
  const field = (label: RegExp) => {
    const match = prompt.match(label);
    return match?.[1]?.trim();
  };
  const draft: Partial<LoopDraft> = {};
  const name = field(/Name:\s*([^;\n]+)/i);
  const flow = field(/Fluss:\s*([^;\n]+)/i) ?? field(/Flow:\s*([^;\n]+)/i);
  const hypothesis = field(/Hypothese:\s*([^;\n]+)/i);
  const experiment = field(/Experiment:\s*([^;\n]+)/i);
  const metric = field(/Messgröße:\s*([^;\n]+)/i) ?? field(/Metrik:\s*([^;\n]+)/i);
  const unit = field(/Einheit:\s*([^;\n]+)/i);
  const target = field(/Ziel:\s*(\d+(?:[.,]\d+)?)/i);
  if (name) draft.name = name;
  if (flow) draft.flow = flow;
  if (hypothesis) draft.hypothesis = hypothesis;
  if (experiment) draft.experiment = experiment;
  if (metric) draft.metric = metric;
  if (unit) draft.unit = unit;
  if (target !== undefined) draft.targetValue = Number(target.replace(",", "."));
  return draft;
}

function extractSampleValue(prompt: string): number | null {
  const match = prompt.match(/(?:messpunkt|messwert|wert|stand)\s*(?:von|bei)?\s*(\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/* ==================== Ehrliches Prompt-Ergebnis (Sprint 227) ==================== */

export type LoopResult = {
  headline: string;
  lines: string[];
  disclaimer: string;
};

/**
 * Baut die ehrliche Antwort auf ein Loop-Kommando. Fehlende/uneindeutige
 * Ziele werden benannt; Änderungen werden nur als Freigabe-Anfrage
 * formuliert — ausgeführt wird außerhalb (und nur nach Bestätigung).
 */
export function buildLoopResult(command: LoopPromptCommand, loops: LoopDraft[], nextId = 0): LoopResult {
  const lines: string[] = [];
  const disclaimer = LOOP_DISCLAIMER;

  if (command.actions.includes("create")) {
    if (!command.draft) {
      lines.push("Kein Entwurf erkannt — nenne Felder mit Name:, Fluss:, Hypothese:, Experiment:, Messgröße:, Einheit: und Ziel:.");
    } else {
      const validation = validateLoopDraft(command.draft);
      if (validation.valid) {
        lines.push(`Entwurf "${command.draft.name}" ist plausibel und bereit zur Freigabe — es startet nichts von selbst.`);
      } else {
        lines.push(`Entwurf abgelehnt: ${validation.reason}`);
      }
    }
  }

  if (command.actions.includes("list") || (loops.length > 0 && command.actions.length === 0)) {
    if (loops.length === 0) {
      lines.push("Noch keine Schleifen vorhanden — der leere Zustand ist echt, kein Fehler.");
    } else {
      lines.push(`${loops.length} Schleife(n): ${loops.map((loop) => `"${loop.name}" (${loopStatusLabel(loop.status)}, ${loopProgressPercent(loop)} %)`).join(", ")}.`);
    }
  }

  const targets = command.nameQuery ? findLoopsByName(loops, command.nameQuery) : [];
  if (command.nameQuery && targets.length === 0 && !command.actions.includes("list")) {
    lines.push(`Keine Schleife passt zu "${command.nameQuery}" — bitte den Namen prüfen.`);
  }
  if (targets.length > 1) {
    lines.push(`Uneindeutig: ${targets.length} Schleifen passen zu "${command.nameQuery}" (${targets.map((loop) => loop.name).join(", ")}) — bitte genauer benennen.`);
  }

  for (const loop of targets.slice(0, 1)) {
    const verdict = evaluateLoopProgress(loop);
    const step = recommendNextStep(loop);
    lines.push(`"${loop.name}": ${loopStatusLabel(loop.status)}, ${verdict.percent} % des Ziels (${loop.currentValue} von ${loop.targetValue} ${loop.unit}).`);
    lines.push(`Bewertung: ${verdict.reason}`);
    lines.push(`Nächster Schritt: ${step.title}${step.requiresApproval ? " — erfordert deine Freigabe" : ""}. ${step.reason}`);
  }

  if (command.actions.includes("sample")) {
    if (command.sampleValue === null) {
      lines.push("Kein Messwert erkannt — bitte Zahl nennen (z. B. „Messpunkt 40\").");
    } else if (targets.length !== 1) {
      lines.push(`Messwert ${command.sampleValue} wurde noch nicht zugeordnet — erst die Schleife eindeutig benennen.`);
    } else {
      lines.push(`Messwert ${command.sampleValue} für "${targets[0]!.name}" vorgemerkt — die Zuordnung braucht deine Bestätigung.`);
    }
  }

  if (command.actions.includes("advance") && targets.length === 1) {
    lines.push(`Freigabe-Anfrage für "${targets[0]!.name}" vorbereitet — ausgeführt wird erst nach deiner Bestätigung.`);
  }
  if (command.actions.includes("discard") && targets.length === 1) {
    lines.push(`Verwerfen von "${targets[0]!.name}" vorbereitet — auch das braucht deine Bestätigung.`);
  }

  if (lines.length === 0) lines.push("Alles im Plan — für Details: „Zeig alle Schleifen\" oder „Status von <Name>\".");
  const headline = command.actions.includes("create") ? "Neuer Schleifen-Entwurf" : targets.length === 1 ? `Schleife: ${targets[0]!.name}` : "Loop-Engineering";
  void nextId;
  return { headline, lines, disclaimer };
}

/** Findet Schleifen per Namens-Anteil (case-insensitive), nie per ID-Raten. */
export function findLoopsByName(loops: LoopDraft[], query: string): LoopDraft[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return loops.filter((loop) => loop.name.toLowerCase().includes(needle));
}
