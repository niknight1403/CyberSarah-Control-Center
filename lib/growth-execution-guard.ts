/** Process-local non-reentrant execution gate; DB locks remain authoritative across replicas. */
export function makeGrowthExecutionGuard() {
  let running = false;
  return {
    acquire() {
      if (running) return false;
      running = true;
      return true;
    },
    release() { running = false; },
    isRunning() { return running; },
  };
}
