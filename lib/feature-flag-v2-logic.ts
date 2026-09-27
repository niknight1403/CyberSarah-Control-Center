/**
 * Sprint 356 — Feature-Flags: zentrale Flags mit Nutzer-Anteil & Segmentierung.
 *
 * Prozentuales Rollout (0..100%), deterministische Bucket-Zuordnung je Nutzer,
 * zielgerichtete Segmentierungsregeln (Rollen, E-Mail-Domains, Positiv-/Negativlisten)
 * und individuelle Nutzer-Overrides.
 */

export interface FlagTargeting {
  allowedUserIds?: string[];
  blockedUserIds?: string[];
  allowedRoles?: string[];
  allowedEmailDomains?: string[];
}

export interface AdvancedFeatureFlag {
  key: string;
  name: string;
  description: string;
  category: "ui" | "beta" | "ops" | "billing" | "agent";
  enabled: boolean;
  percentageRollout: number; // 0..100
  targeting?: FlagTargeting;
  overrides?: Record<string, boolean>; // userId -> explicit boolean
  updatedAt: number;
  updatedBy: string;
}

export interface UserContext {
  userId: string;
  email?: string;
  role?: string;
}

export type EvaluationReason =
  | "disabled"
  | "override_enabled"
  | "override_disabled"
  | "blocked_user"
  | "allowed_user"
  | "role_match"
  | "domain_match"
  | "percentage_rollout_in"
  | "percentage_rollout_out";

export interface FlagEvaluationResult {
  flagKey: string;
  enabled: boolean;
  reason: EvaluationReason;
  bucketValue?: number; // 0..99
}

export interface AudienceReachStats {
  flagKey: string;
  totalUsersSampled: number;
  enabledUsersCount: number;
  reachPercentage: number;
  reasonsBreakdown: Record<EvaluationReason, number>;
}

/**
 * Berechnet eine deterministische Bucket-Zahl (0..99) für ein Nutzer- und Flag-Schlüssel-Paar.
 * Verwendet einen FNV-1a ähnlichen Hash für gleichmäßige Verteilung.
 */
export function calculateUserBucket(userId: string, flagKey: string): number {
  const str = `${flagKey}:${userId}`;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash) % 100;
}

/**
 * Evaluiert ein Feature-Flag für einen gegebenen Nutzerkontext.
 */
export function evaluateFeatureFlag(
  flag: AdvancedFeatureFlag,
  context?: UserContext | null
): FlagEvaluationResult {
  // 1. Wenn Flag generell deaktiviert ist -> disabled
  if (!flag.enabled) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: "disabled",
    };
  }

  // Ohne Nutzerkontext gilt nur das Prozentual-Rollout / General Toggle
  if (!context || !context.userId) {
    if (flag.percentageRollout >= 100) {
      return { flagKey: flag.key, enabled: true, reason: "percentage_rollout_in" };
    }
    if (flag.percentageRollout <= 0) {
      return { flagKey: flag.key, enabled: false, reason: "percentage_rollout_out" };
    }
    return { flagKey: flag.key, enabled: false, reason: "disabled" };
  }

  const { userId, email, role } = context;

  // 2. Einzelne Nutzer-Overrides haben höchste Priorität
  if (flag.overrides && flag.overrides[userId] !== undefined) {
    const overrideVal = flag.overrides[userId];
    return {
      flagKey: flag.key,
      enabled: overrideVal,
      reason: overrideVal ? "override_enabled" : "override_disabled",
    };
  }

  const targeting = flag.targeting;

  // 3. Explicit Blocked List
  if (targeting?.blockedUserIds && targeting.blockedUserIds.includes(userId)) {
    return {
      flagKey: flag.key,
      enabled: false,
      reason: "blocked_user",
    };
  }

  // 4. Explicit Allowed List
  if (targeting?.allowedUserIds && targeting.allowedUserIds.includes(userId)) {
    return {
      flagKey: flag.key,
      enabled: true,
      reason: "allowed_user",
    };
  }

  // 5. Allowed Roles
  if (role && targeting?.allowedRoles && targeting.allowedRoles.includes(role)) {
    return {
      flagKey: flag.key,
      enabled: true,
      reason: "role_match",
    };
  }

  // 6. Allowed Email Domains
  if (email && targeting?.allowedEmailDomains && targeting.allowedEmailDomains.length > 0) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && targeting.allowedEmailDomains.some((d) => d.toLowerCase() === domain)) {
      return {
        flagKey: flag.key,
        enabled: true,
        reason: "domain_match",
      };
    }
  }

  // 7. Deterministisches prozentuales Rollout
  const bucket = calculateUserBucket(userId, flag.key);
  const isInRollout = bucket < flag.percentageRollout;

  return {
    flagKey: flag.key,
    enabled: isInRollout,
    reason: isInRollout ? "percentage_rollout_in" : "percentage_rollout_out",
    bucketValue: bucket,
  };
}

/** Aktualisiert den prozentualen Rollout-Wert eines Flags. */
export function updateFlagRollout(
  flag: AdvancedFeatureFlag,
  percentage: number,
  updatedBy: string,
  nowMs: number = Date.now()
): AdvancedFeatureFlag {
  const sanitizedPct = Math.max(0, Math.min(100, Math.round(percentage)));
  return {
    ...flag,
    percentageRollout: sanitizedPct,
    updatedAt: nowMs,
    updatedBy,
  };
}

/** Setzt oder entfernt einen spezifischen Nutzer-Override. */
export function setUserOverride(
  flag: AdvancedFeatureFlag,
  userId: string,
  enabled: boolean | null,
  updatedBy: string,
  nowMs: number = Date.now()
): AdvancedFeatureFlag {
  const newOverrides = { ...(flag.overrides || {}) };
  if (enabled === null) {
    delete newOverrides[userId];
  } else {
    newOverrides[userId] = enabled;
  }

  return {
    ...flag,
    overrides: newOverrides,
    updatedAt: nowMs,
    updatedBy,
  };
}

/** Misst die Relevanz / Reichweite eines Flags für eine Stichprobe von Nutzern. */
export function calculateAudienceReach(
  flag: AdvancedFeatureFlag,
  userSample: UserContext[]
): AudienceReachStats {
  if (userSample.length === 0) {
    return {
      flagKey: flag.key,
      totalUsersSampled: 0,
      enabledUsersCount: 0,
      reachPercentage: 0,
      reasonsBreakdown: {
        disabled: 0,
        override_enabled: 0,
        override_disabled: 0,
        blocked_user: 0,
        allowed_user: 0,
        role_match: 0,
        domain_match: 0,
        percentage_rollout_in: 0,
        percentage_rollout_out: 0,
      },
    };
  }

  let enabledCount = 0;
  const breakdown: Record<EvaluationReason, number> = {
    disabled: 0,
    override_enabled: 0,
    override_disabled: 0,
    blocked_user: 0,
    allowed_user: 0,
    role_match: 0,
    domain_match: 0,
    percentage_rollout_in: 0,
    percentage_rollout_out: 0,
  };

  for (const user of userSample) {
    const res = evaluateFeatureFlag(flag, user);
    if (res.enabled) enabledCount++;
    breakdown[res.reason] = (breakdown[res.reason] || 0) + 1;
  }

  const reachPercentage = Math.round((enabledCount / userSample.length) * 100);

  return {
    flagKey: flag.key,
    totalUsersSampled: userSample.length,
    enabledUsersCount: enabledCount,
    reachPercentage,
    reasonsBreakdown: breakdown,
  };
}
