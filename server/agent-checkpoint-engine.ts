import { randomUUID } from "node:crypto";
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
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(state.taskId) || !/^[a-zA-Z0-9_-]{1,120}$/.test(state.agentId) || !Number.isSafeInteger(state.stepNumber) || state.stepNumber < 0 || !Number.isSafeInteger(state.timestamp) || state.timestamp <= 0) throw new Error("Invalid checkpoint");
    if (Buffer.byteLength(JSON.stringify(state)) > 65536) throw new Error("Checkpoint too large");
    const script = `
      local previous = redis.call("GET", KEYS[1])
      if previous then
        local ok, parsed = pcall(cjson.decode, previous)
        if not ok then return redis.error_reply("CORRUPT_CHECKPOINT") end
        if tonumber(parsed.stepNumber) > tonumber(ARGV[1]) then return redis.error_reply("STALE_CHECKPOINT") end
        if tonumber(parsed.stepNumber) == tonumber(ARGV[1]) and tonumber(parsed.timestamp) >= tonumber(ARGV[2]) then
          return redis.error_reply("STALE_CHECKPOINT")
        end
      end
      local eventId = redis.call("XADD", KEYS[2], "*", "taskId", ARGV[3], "agentId", ARGV[4], "stepNumber", ARGV[1], "status", ARGV[5], "timestamp", ARGV[2])
      redis.call("SET", KEYS[1], ARGV[6])
      return eventId
    `;
    const result = await this.redis.eval(script, 2, this.stateKey(state.taskId), this.streamKey,
      String(state.stepNumber), String(state.timestamp), state.taskId, state.agentId, state.status, JSON.stringify(state));
    return String(result);
  }
  async getLastCheckpoint(taskId: string): Promise<AgentStepState | null> {
    const raw = await this.redis.get(this.stateKey(taskId));
    return raw ? JSON.parse(raw) as AgentStepState : null;
  }
  async monitorAndSelfHeal(taskId: string, maxStaleMs = 30000, resumeCallback: (state: AgentStepState) => Promise<void>): Promise<boolean> {
    const current = await this.getLastCheckpoint(taskId);
    if (!current || current.status !== "IN_PROGRESS" || Date.now() - current.timestamp <= maxStaleMs) return false;
    const token = randomUUID();
    const acquired = await this.redis.set(this.lockKey(taskId), token, "PX", 60000, "NX");
    if (acquired !== "OK") return false;
    let leaseLost = false;
    const heartbeat = setInterval(() => {
      void this.redis.eval(
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end',
        1, this.lockKey(taskId), token, "60000"
      ).then((renewed) => { if (renewed !== 1) leaseLost = true; }).catch(() => { leaseLost = true; });
    }, 15000);
    heartbeat.unref();
    try {
      const latest = await this.getLastCheckpoint(taskId);
      if (!latest || latest.status !== "IN_PROGRESS" || latest.timestamp !== current.timestamp) return false;
      // Do not mark the step completed before the callback succeeds.
      await resumeCallback({...latest});
      if (leaseLost) throw new Error("Recovery lease lost during callback");
      return true;
    } finally {
      clearInterval(heartbeat);
      await this.redis.eval(
        'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
        1, this.lockKey(taskId), token
      );
    }
  }
  async close(): Promise<void> { await this.redis.quit(); }
}
