/**
 * CyberSarah Control Center — Key Rotator Engine
 *
 * Verwaltet Provider-API-Key-Pools mit automatischem 429-Cooldown-Failover:
 * - Agent-Keys pro Provider aus `${PROVIDER}_API_KEYS` (komma-separiert)
 * - Admin-VIP-Lane aus `ADMIN_${PROVIDER}_KEY` (nie vom Cooldown betroffen)
 * - Round-Robin mit Ueberspringen kuehlender Keys nach HTTP 429
 * - Bei Erschoepfung des gesamten Agent-Pools: ALL_KEYS_LIMIT_REACHED-Trigger
 *   fuer den automatischen Fallback (Together AI / Ollama)
 */

export class AllKeysLimitReachedError extends Error {
  public readonly provider: string;
  public readonly retryInSeconds: number;

  constructor(provider: string, retryInSeconds: number) {
    super(
      `ALL_KEYS_LIMIT_REACHED: Alle ${provider}-Agent-Keys sind im 429-Cooldown. ` +
        `Automatischer Fallback zu Together AI / Ollama wird getriggert. ` +
        `Naechster Key voraussichtlich in ${retryInSeconds}s verfuegbar.`
    );
    this.name = "AllKeysLimitReachedError";
    this.provider = provider;
    this.retryInSeconds = retryInSeconds;
  }
}

interface ProviderPool {
  agentKeys: string[];
  adminKey?: string;
}

export class KeyRotatorEngine {
  /** provider -> key -> Cooldown-Ende (Epoch-ms) */
  private readonly cooldowns = new Map<string, Map<string, number>>();
  /** provider -> naechster Round-Robin-Index */
  private readonly cursor = new Map<string, number>();

  private resolvePool(provider: string): ProviderPool {
    const normalized = provider.trim().toUpperCase();
    const raw = process.env[`${normalized}_API_KEYS`] ?? "";
    const agentKeys = raw
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    const adminKey = (process.env[`ADMIN_${normalized}_KEY`] ?? "").trim() || undefined;
    return { agentKeys, adminKey };
  }

  /**
   * Liefert den naechsten freien Key fuer den Provider.
   * `isAdmin: true` nutzt die reservierte VIP-Lane und ist NIEMALS
   * vom Agent-Pool-Cooldown betroffen.
   */
  getKey(provider: string, isAdmin: boolean = false): string {
    const pool = this.resolvePool(provider);

    if (isAdmin) {
      if (!pool.adminKey) {
        throw new Error(
          `ADMIN_KEY_MISSING: Fuer ${provider} ist kein Admin-Key (ADMIN_${provider.trim().toUpperCase()}_KEY) konfiguriert.`
        );
      }
      return pool.adminKey;
    }

    if (pool.agentKeys.length === 0) {
      throw new Error(
        `KEY_POOL_EMPTY: Fuer ${provider} sind keine Agent-Keys (${provider.trim().toUpperCase()}_API_KEYS) konfiguriert.`
      );
    }

    const cooled = this.cooldowns.get(provider) ?? new Map<string, number>();
    const now = Date.now();
    const start = this.cursor.get(provider) ?? 0;

    for (let offset = 0; offset < pool.agentKeys.length; offset += 1) {
      const index = (start + offset) % pool.agentKeys.length;
      const key = pool.agentKeys[index];
      const cooldownUntil = cooled.get(key);

      if (cooldownUntil !== undefined && cooldownUntil > now) {
        continue; // 429-Cooldown: naechsten Key probieren
      }

      this.cursor.set(provider, (index + 1) % pool.agentKeys.length);
      return key;
    }

    // Alle Agent-Keys im Cooldown -> strukturierten Trigger werfen,
    // den der Fallback-Orchestrator (Together AI / Ollama) abfaengt.
    const nextAvailableAt = pool.agentKeys.reduce((earliest, key) => {
      const until = cooled.get(key);
      return until !== undefined && until < earliest ? until : earliest;
    }, Number.POSITIVE_INFINITY);
    const retryInSeconds = Number.isFinite(nextAvailableAt)
      ? Math.max(1, Math.ceil((nextAvailableAt - now) / 1000))
      : 1;

    throw new AllKeysLimitReachedError(provider, retryInSeconds);
  }

  /**
   * Meldet eine HTTP-429-Ablehnung fuer einen konkreten Key und setzt
   * ihn fuer `cooldownMs` Millisekunden auf die Bank.
   */
  reportRateLimit(provider: string, key: string, cooldownMs: number): void {
    if (!key) return;
    const duration = Math.max(0, cooldownMs);
    const cooled = this.cooldowns.get(provider) ?? new Map<string, number>();
    cooled.set(key, Date.now() + duration);
    this.cooldowns.set(provider, cooled);
  }

  /** Prueft, ob ein konkreter Key aktuell im Cooldown ist (Diagnose/Tests). */
  isCoolingDown(provider: string, key: string): boolean {
    const until = this.cooldowns.get(provider)?.get(key);
    return until !== undefined && until > Date.now();
  }
}
