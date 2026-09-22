import { AppState, AppStateStatus, Platform } from 'react-native';

// ─── Background-Task Manager ──────────────────────────────────────
// Verwaltet periodische Syncs und Bereinigung im Hintergrund.
// Nutzt AppState-Transitionen für minimale Battery-Impact.

type BackgroundTask = {
  id: string;
  name: string;
  interval: number;
  lastRun: number;
  task: () => Promise<void>;
};

class BackgroundTaskManager {
  private tasks: Map<string, BackgroundTask> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private appState: AppStateStatus = 'active';

  constructor() {
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    this.appState = nextState;
    if (nextState === 'active' && !this.isRunning) {
      this.start();
    } else if (nextState === 'background' && this.isRunning) {
      this.stop();
    }
  };

  registerTask(id: string, name: string, intervalMs: number, task: () => Promise<void>): void {
    this.tasks.set(id, {
      id,
      name,
      interval: intervalMs,
      lastRun: 0,
      task,
    });
  }

  unregisterTask(id: string): void {
    this.tasks.delete(id);
  }

  start(): void {
    if (this.isRunning || this.appState !== 'active') return;
    this.isRunning = true;

    // Prüfe alle 60 Sekunden auf fällige Tasks
    this.intervalId = setInterval(() => {
      this.processTasks();
    }, 60000);

    // Sofort einmal ausführen
    this.processTasks();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  private async processTasks(): Promise<void> {
    const now = Date.now();
    const promises: Array<Promise<void>> = [];

    this.tasks.forEach((task) => {
      if (now - task.lastRun >= task.interval) {
        task.lastRun = now;
        promises.push(
          task.task().catch((err: Error) => {
            console.warn(`[BackgroundTask] ${task.name}: ${err.message}`);
          }),
        );
      }
    });

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }
}

export const backgroundTaskManager = new BackgroundTaskManager();
export default backgroundTaskManager;
