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
