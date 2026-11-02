import Redis from "ioredis";

export interface AgentStepState {
  taskId: string;
  agentId: string;
  stepNumber: number;
  stepName: string;
  payload: Record<string, unknown>;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  timestamp: number;
}
export class AgentCheckpointEngine {
  private readonly redis: Redis;
  private readonly streamKey = "cybersarah:agent:events";
  constructor(redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379") {
    this.redis = new Redis(redisUrl, {maxRetriesPerRequest: 2});
  }
  private stateKey(id: string) { return `cybersarah:agent:state:${id}`; }
  private lockKey(id: string) { return `cybersarah:agent:recovery:${id}`; }
  async saveCheckpoint(state: AgentStepState): Promise<string> {
    if (!state.taskId || !state.agentId || !Number.isSafeInteger(state.stepNumber) || state.stepNumber < 0) throw new Error("Invalid checkpoint");
    if (Buffer.byteLength(JSON.stringify(state)) > 65536) throw new Error("Checkpoint too large");
    const result = await this.redis.multi()
      .xadd(this.streamKey, "*", "taskId", state.taskId, "agentId", state.agentId, "stepNumber", String(state.stepNumber), "status", state.status, "timestamp", String(state.timestamp), "payload", JSON.stringify(state))
      .set(this.stateKey(state.taskId), JSON.stringify(state))
      .exec();
    if (!result || result.some(([err]) => err)) throw new Error("Atomic checkpoint transaction failed");
    return String(result[0][1]);
  }
  async getLastCheckpoint(taskId: string): Promise<AgentStepState | null> {
    const raw = await this.redis.get(this.stateKey(taskId));
    return raw ? JSON.parse(raw) as AgentStepState : null;
  }
  async monitorAndSelfHeal(taskId: string, maxStaleMs = 30000, resumeCallback: (state: AgentStepState) => Promise<void>): Promise<boolean> {
    const current = await this.getLastCheckpoint(taskId);
    if (!current || current.status !== "IN_PROGRESS" || Date.now() - current.timestamp <= maxStaleMs) return false;
    const token = `${process.pid}:${Date.now()}:${Math.random()}`;
    const acquired = await this.redis.set(this.lockKey(taskId), token, "PX", 60000, "NX");
    if (acquired !== "OK") return false;
    try {
      const latest = await this.getLastCheckpoint(taskId);
      if (!latest || latest.status !== "IN_PROGRESS" || latest.timestamp !== current.timestamp) return false;
      // Do not mark the step completed before the callback succeeds.
      await resumeCallback({...latest});
      return true;
    } finally {
      await this.redis.eval(
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        1, this.lockKey(taskId), token
      );
    }
  }
  async close(): Promise<void> { await this.redis.quit(); }
}
