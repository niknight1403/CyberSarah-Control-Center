import { describe, it, expect } from "vitest";
import {
  calculateUserBucket,
  evaluateFeatureFlag,
  updateFlagRollout,
  setUserOverride,
  calculateAudienceReach,
  AdvancedFeatureFlag,
  UserContext,
} from "../lib/feature-flag-v2-logic";

describe("Sprint 356 - Feature-Flags mit Nutzer-Anteil & Segmentierung", () => {
  const baseFlag: AdvancedFeatureFlag = {
    key: "beta_ai_copilot",
    name: "Beta AI Copilot",
    description: "Fortgeschrittener Agenten-Assistent im Control Center",
    category: "beta",
    enabled: true,
    percentageRollout: 50,
    updatedAt: Date.now(),
    updatedBy: "admin@cybersarah.de",
  };

  it("calculates deterministic user buckets in range 0..99", () => {
    const bucket1 = calculateUserBucket("user-123", "beta_ai_copilot");
    const bucket2 = calculateUserBucket("user-123", "beta_ai_copilot");
    const bucket3 = calculateUserBucket("user-456", "beta_ai_copilot");

    expect(bucket1).toBeGreaterThanOrEqual(0);
    expect(bucket1).toBeLessThan(100);
    expect(bucket1).toBe(bucket2); // deterministic
    expect(typeof bucket3).toBe("number");
  });

  it("evaluates percentage rollout correctly and deterministically", () => {
    const flag25: AdvancedFeatureFlag = { ...baseFlag, percentageRollout: 25 };

    const sampleUsers: UserContext[] = Array.from({ length: 100 }, (_, i) => ({
      userId: `user-id-${i}`,
    }));

    let enabledCount = 0;
    for (const user of sampleUsers) {
      const res = evaluateFeatureFlag(flag25, user);
      if (res.enabled) {
        expect(res.reason).toBe("percentage_rollout_in");
        expect(res.bucketValue!).toBeLessThan(25);
        enabledCount++;
      } else {
        expect(res.reason).toBe("percentage_rollout_out");
        expect(res.bucketValue!).toBeGreaterThanOrEqual(25);
      }
    }

    // Should be roughly around 25%
    expect(enabledCount).toBeGreaterThan(10);
    expect(enabledCount).toBeLessThan(40);
  });

  it("respects user overrides above all rules", () => {
    const flagWithOverrides = setUserOverride(baseFlag, "user-blocked", false, "admin");
    const flagWithOverrides2 = setUserOverride(flagWithOverrides, "user-allowed", true, "admin");

    const resBlocked = evaluateFeatureFlag(flagWithOverrides2, { userId: "user-blocked" });
    expect(resBlocked.enabled).toBe(false);
    expect(resBlocked.reason).toBe("override_disabled");

    const resAllowed = evaluateFeatureFlag(flagWithOverrides2, { userId: "user-allowed" });
    expect(resAllowed.enabled).toBe(true);
    expect(resAllowed.reason).toBe("override_enabled");
  });

  it("evaluates targeting rules (blocked list, allowed list, roles, email domains)", () => {
    const targetedFlag: AdvancedFeatureFlag = {
      ...baseFlag,
      percentageRollout: 0, // 0% default rollout
      targeting: {
        blockedUserIds: ["bad-user"],
        allowedUserIds: ["special-user"],
        allowedRoles: ["admin", "beta_tester"],
        allowedEmailDomains: ["cybersarah.de"],
      },
    };

    expect(evaluateFeatureFlag(targetedFlag, { userId: "bad-user" }).reason).toBe("blocked_user");
    expect(evaluateFeatureFlag(targetedFlag, { userId: "special-user" }).reason).toBe("allowed_user");
    expect(evaluateFeatureFlag(targetedFlag, { userId: "other-user", role: "admin" }).reason).toBe("role_match");
    expect(evaluateFeatureFlag(targetedFlag, { userId: "other-user", email: "niko@cybersarah.de" }).reason).toBe("domain_match");
    expect(evaluateFeatureFlag(targetedFlag, { userId: "random-user", email: "user@gmail.com" }).reason).toBe("percentage_rollout_out");
  });

  it("updates rollout percentage and calculates audience reach", () => {
    const updated = updateFlagRollout(baseFlag, 30, "admin");
    expect(updated.percentageRollout).toBe(30);

    const users: UserContext[] = Array.from({ length: 50 }, (_, i) => ({
      userId: `test-usr-${i}`,
    }));

    const reach = calculateAudienceReach(updated, users);
    expect(reach.totalUsersSampled).toBe(50);
    expect(reach.reachPercentage).toBeGreaterThanOrEqual(0);
    expect(reach.reachPercentage).toBeLessThanOrEqual(100);
  });
});
