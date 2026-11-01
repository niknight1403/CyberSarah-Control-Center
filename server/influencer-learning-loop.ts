import { refreshInfluencerLearning } from "./growth-network-service";

const DEFAULT_INTERVAL_MS = 15 * 60_000;
const MIN_INTERVAL_MS = 5 * 60_000;

type LearningLoopState = {
  running: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  personasLearned: number;
  experimentsQueued: number;
};

const state: LearningLoopState = {
  running: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastError: null,
  personasLearned: 0,
  experimentsQueued: 0,
};

let timer: ReturnType<typeof setInterval> | null = null;

function intervalMs(): number {
  const configured = Number.parseInt(process.env.INFLUENCER_LEARNING_INTERVAL_MS ?? "", 10);
  return Number.isFinite(configured) ? Math.max(MIN_INTERVAL_MS, configured) : DEFAULT_INTERVAL_MS;
}

export function influencerLearningEnabled(): boolean {
  return !/^(0|false|off|disabled)$/i.test((process.env.INFLUENCER_LEARNING_AUTOPILOT ?? "on").trim());
}

export async function runInfluencerLearningTick(): Promise<LearningLoopState> {
  if (state.running) return { ...state };
  state.running = true;
  state.lastStartedAt = new Date().toISOString();
  try {
    const result = await refreshInfluencerLearning();
    state.personasLearned = result.evolutions.length;
    state.experimentsQueued = result.plan.queue.length;
    state.lastCompletedAt = new Date().toISOString();
    state.lastError = null;
    if (state.personasLearned > 0) {
      console.info(
        `[Influencer-Learning] ${state.personasLearned} Personas gelernt, ${state.experimentsQueued} Experimente priorisiert.`,
      );
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    console.warn("[Influencer-Learning] Lernlauf fehlgeschlagen:", state.lastError);
  } finally {
    state.running = false;
  }
  return { ...state };
}

export function startInfluencerLearningLoop(): void {
  if (timer || !influencerLearningEnabled()) return;
  const interval = intervalMs();
  setTimeout(() => void runInfluencerLearningTick(), 30_000);
  timer = setInterval(() => void runInfluencerLearningTick(), interval);
  console.info(`[Influencer-Learning] Always-on Loop aktiv (Intervall ${Math.round(interval / 60_000)} min).`);
}

export function getInfluencerLearningLoopStatus(): LearningLoopState & { enabled: boolean; intervalMs: number } {
  return { ...state, enabled: influencerLearningEnabled(), intervalMs: intervalMs() };
}
