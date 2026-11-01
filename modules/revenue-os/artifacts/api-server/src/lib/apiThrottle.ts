/**
 * ═══════════════════════════════════════════════════════════════════════
 * CyberSarah API Throttle & Rate Limiter
 * ──────────────────────────────────────────────────────────────────────
 * - Queue-basierte API-Anfragen-Steuerung
 * - Exponential Backoff bei 429/Too Many Requests
 * - Token-Bucket Rate Limiting pro Provider
 * - Verhindert API-Limit-Überschreitungen
 * ═══════════════════════════════════════════════════════════════════════
 */
import pino from "pino";

const logger = pino({ name: "api-throttle", level: process.env["LOG_LEVEL"] ?? "info" });

// Provider-Konfigurationen mit Limits
interface ProviderConfig {
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  concurrentMax: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    name: "OpenAI",
    requestsPerMinute: 500,    // Tier 5: 10.000 RPM
    requestsPerDay: 100000,
    concurrentMax: 50,
    backoffBaseMs: 1000,
    backoffMaxMs: 60000,
  },
  gemini: {
    name: "Gemini",
    requestsPerMinute: 60,     // Free: 60 RPM
    requestsPerDay: 1500,
    concurrentMax: 10,
    backoffBaseMs: 2000,
    backoffMaxMs: 120000,
  },
  stripe: {
    name: "Stripe",
    requestsPerMinute: 100,
    requestsPerDay: 50000,
    concurrentMax: 25,
    backoffBaseMs: 500,
    backoffMaxMs: 30000,
  },
  openrouter: {
    name: "OpenRouter",
    requestsPerMinute: 200,
    requestsPerDay: 10000,
    concurrentMax: 20,
    backoffBaseMs: 1000,
    backoffMaxMs: 60000,
  },
};

interface QueueItem {
  provider: string;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (err: any) => void;
  retries: number;
  maxRetries: number;
}

class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(maxTokens: number, refillIntervalMs: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = maxTokens / refillIntervalMs;
    this.lastRefill = Date.now();
  }

  async consume(count: number = 1): Promise<void> {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return;
    }
    // Wait until enough tokens are available
    const waitMs = Math.ceil((count - this.tokens) / this.refillRate);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - count);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

class ApiThrottleManager {
  private queues: Map<string, QueueItem[]> = new Map();
  private processing: Map<string, boolean> = new Map();
  private buckets: Map<string, TokenBucket> = new Map();
  private concurrentCount: Map<string, number> = new Map();
  private dailyCount: Map<string, number> = new Map();
  private lastDailyReset: number = Date.now();

  constructor() {
    // Daily counter reset every 24h
    setInterval(() => {
      this.dailyCount.clear();
      this.lastDailyReset = Date.now();
      logger.info("📊 API-Tageszähler zurückgesetzt");
    }, 24 * 60 * 60 * 1000);

    logger.info("🚦 API-Throttle-Manager initialisiert");
  }

  getProvider(name: string): ProviderConfig {
    return PROVIDERS[name] ?? { name, requestsPerMinute: 60, requestsPerDay: 5000, concurrentMax: 10, backoffBaseMs: 1000, backoffMaxMs: 60000 };
  }

  private getBucket(provider: string): TokenBucket {
    if (!this.buckets.has(provider)) {
      const config = this.getProvider(provider);
      // Refill over 1 minute
      this.buckets.set(provider, new TokenBucket(config.requestsPerMinute, 60000));
    }
    return this.buckets.get(provider)!;
  }

  private checkDailyLimit(provider: string): boolean {
    const config = this.getProvider(provider);
    const count = this.dailyCount.get(provider) ?? 0;
    return count < config.requestsPerDay;
  }

  /**
   * Führt eine API-Anfrage mit Throttling, Queue und Backoff aus
   */
  async schedule<T>(provider: string, fn: () => Promise<T>, options?: {
    maxRetries?: number;
    priority?: number;
  }): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;

    return new Promise<T>((resolve, reject) => {
      if (!this.queues.has(provider)) {
        this.queues.set(provider, []);
      }

      const item: QueueItem = {
        provider,
        execute: fn,
        resolve,
        reject,
        retries: 0,
        maxRetries,
      };

      this.queues.get(provider)!.push(item);
      this.processQueue(provider);
    });
  }

  private async processQueue(provider: string): Promise<void> {
    if (this.processing.get(provider)) return;
    this.processing.set(provider, true);

    const config = this.getProvider(provider);
    const queue = this.queues.get(provider) ?? [];

    while (queue.length > 0) {
      // Check daily limit
      if (!this.checkDailyLimit(provider)) {
        logger.warn({ provider }, `⚠️ Tageslimit für ${provider} erreicht — warte 1h`);
        await new Promise(resolve => setTimeout(resolve, 3600000));
        continue;
      }

      // Check concurrency
      const concurrent = this.concurrentCount.get(provider) ?? 0;
      if (concurrent >= config.concurrentMax) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }

      // Consume token
      const bucket = this.getBucket(provider);
      await bucket.consume(1);

      const item = queue.shift()!;
      this.concurrentCount.set(provider, concurrent + 1);
      this.dailyCount.set(provider, (this.dailyCount.get(provider) ?? 0) + 1);

      // Execute with backoff
      this.executeWithBackoff(item).finally(() => {
        const c = this.concurrentCount.get(provider) ?? 1;
        this.concurrentCount.set(provider, Math.max(0, c - 1));
      });
    }

    this.processing.set(provider, false);
  }

  private async executeWithBackoff(item: QueueItem): Promise<void> {
    const config = this.getProvider(item.provider);

    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (err: any) {
      const status = err?.status || err?.statusCode || err?.response?.status;

      // 429 = Too Many Requests → Backoff
      if (status === 429 && item.retries < item.maxRetries) {
        item.retries++;
        const delay = Math.min(
          config.backoffBaseMs * Math.pow(2, item.retries - 1),
          config.backoffMaxMs
        );
        logger.warn({
          provider: item.provider,
          retry: item.retries,
          maxRetries: item.maxRetries,
          delayMs: delay,
        }, `⏳ 429-Rate-Limit — Backoff ${delay}ms (Versuch ${item.retries}/${item.maxRetries})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Re-queue for retry
        this.queues.get(item.provider)!.unshift(item);
        this.processQueue(item.provider);
        return;
      }

      // 500/503 → Retry with backoff
      if ((status === 500 || status === 503) && item.retries < item.maxRetries) {
        item.retries++;
        const delay = config.backoffBaseMs * Math.pow(2, item.retries - 1);
        logger.warn({
          provider: item.provider,
          status,
          retry: item.retries,
          delayMs: delay,
        }, `⚠️ Server-Fehler ${status} — Backoff ${delay}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));
        this.queues.get(item.provider)!.unshift(item);
        this.processQueue(item.provider);
        return;
      }

      // Auth/other errors → reject immediately
      item.reject(err);
    }
  }

  /**
   * Liefert Statistiken fürs Dashboard
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [provider, config] of Object.entries(PROVIDERS)) {
      const queue = this.queues.get(provider) ?? [];
      stats[provider] = {
        konfiguration: config,
        queueLength: queue.length,
        concurrent: this.concurrentCount.get(provider) ?? 0,
        heute: this.dailyCount.get(provider) ?? 0,
        dailyLimit: config.requestsPerDay,
      };
    }
    return stats;
  }
}

// Singleton
const throttleManager = new ApiThrottleManager();
export { throttleManager, ApiThrottleManager, PROVIDERS };
export default throttleManager;
