export type RetryOutcome = {
  shouldRetry: boolean;
  nextAttemptAtMs: number | null;
  attemptNumber: number;
  delayMs: number | null;
  reason: string;
};

export type RetryPolicy = {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
};

export type RetryableAction = {
  id: string;
  attempts: number;
  lastAttemptAtMs: number | null;
  conflict: boolean;
};

/**
 * Berechnet den nächsten Wiederholungszeitpunkt einer Offline-Aktion mit
 * deterministischem Exponential-Backoff: `baseDelayMs * 2^(attempt - 1)`,
 * gedeckelt auf `maxDelayMs`. Konfliktierende Aktionen werden niemals
 * wiederholt, sondern blockiert, bis sie manuell entschieden wurden. Nach
 * Erreichen der Maximalversuche wird die Aktion final abgelehnt.
 */
export function nextRetry(action: RetryableAction, policy: RetryPolicy, nowMs: number): RetryOutcome {
  if (!Number.isFinite(policy.baseDelayMs) || policy.baseDelayMs <= 0) {
    throw new Error("Die Basisverzögerung muss positiv sein.");
  }
  if (!Number.isFinite(policy.maxDelayMs) || policy.maxDelayMs < policy.baseDelayMs) {
    throw new Error("Die maximale Verzögerung darf nicht kleiner als die Basisverzögerung sein.");
  }
  if (!Number.isFinite(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new Error("Mindestens ein Versuch muss erlaubt sein.");
  }

  if (action.conflict) {
    return {
      shouldRetry: false,
      nextAttemptAtMs: null,
      attemptNumber: action.attempts,
      delayMs: null,
      reason: "Die Aktion steht im Konflikt und muss manuell entschieden werden.",
    };
  }

  const attempts = Number.isFinite(action.attempts) ? Math.max(0, Math.floor(action.attempts)) : 0;

  if (attempts >= policy.maxAttempts) {
    return {
      shouldRetry: false,
      nextAttemptAtMs: null,
      attemptNumber: attempts,
      delayMs: null,
      reason: `Maximalversuche (${policy.maxAttempts}) erreicht. Die Aktion wird endgültig abgelehnt.`,
    };
  }

  const exponent = Math.min(30, attempts);
  const rawDelay = policy.baseDelayMs * 2 ** exponent;
  const delayMs = Math.min(policy.maxDelayMs, rawDelay);
  const anchor = action.lastAttemptAtMs !== null && Number.isFinite(action.lastAttemptAtMs)
    ? action.lastAttemptAtMs
    : nowMs;
  const nextAttemptAtMs = Math.max(nowMs, anchor + delayMs);

  return {
    shouldRetry: true,
    nextAttemptAtMs,
    attemptNumber: attempts + 1,
    delayMs,
    reason: `Wiederholung in ${delayMs} ms (Versuch ${attempts + 1} von ${policy.maxAttempts}).`,
  };
}

export type QueueRetryPlan = {
  scheduled: { id: string; nextAttemptAtMs: number }[];
  blocked: { id: string; reason: string }[];
  exhausted: { id: string; reason: string }[];
};

/**
 * Plant die Wiederholung einer kompletten Offline-Warteschlange und trennt
 * dabei planbare, blockierte (Konflikt) und endgültig abgelehnte Aktionen.
 */
export function planQueueRetries(actions: RetryableAction[], policy: RetryPolicy, nowMs: number): QueueRetryPlan {
  const plan: QueueRetryPlan = { scheduled: [], blocked: [], exhausted: [] };
  for (const action of actions) {
    const outcome = nextRetry(action, policy, nowMs);
    if (outcome.shouldRetry && outcome.nextAttemptAtMs !== null) {
      plan.scheduled.push({ id: action.id, nextAttemptAtMs: outcome.nextAttemptAtMs });
    } else if (action.conflict) {
      plan.blocked.push({ id: action.id, reason: outcome.reason });
    } else {
      plan.exhausted.push({ id: action.id, reason: outcome.reason });
    }
  }
  plan.scheduled.sort((a, b) => a.nextAttemptAtMs - b.nextAttemptAtMs);
  return plan;
}
