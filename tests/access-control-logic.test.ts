import { describe, expect, it } from "vitest";

import {
  applyAdminQuotaOverride,
  canAccess,
  enforceServerAccess,
  requiredTierFor,
  resolveAccessTier,
  ROLE_TIER_LABELS,
  ROLE_TIER_RANK,
  TIER_QUOTA_CAPS,
  TIER_FEATURES,
} from "../lib/access-control-logic";

describe("rbac access control", () => {
  it("maps subscription tiers onto role tiers, with admin/owner as elite", () => {
    expect(resolveAccessTier({ subscriptionTier: null })).toBe("free");
    expect(resolveAccessTier({ subscriptionTier: "lite" })).toBe("free");
    expect(resolveAccessTier({ subscriptionTier: "pro" })).toBe("pro");
    expect(resolveAccessTier({ subscriptionTier: "expert" })).toBe("developer-max");
    expect(resolveAccessTier({ subscriptionTier: "pro", isAdmin: true })).toBe("elite");
    expect(resolveAccessTier({ subscriptionTier: "lite", isOwner: true })).toBe("elite");
  });

  it("gates features per tier with meaningful required-tier messages", () => {
    expect(canAccess("agent.autopilot", "free").allowed).toBe(true);
    expect(canAccess("mcp.tools", "pro").allowed).toBe(false);
    expect(canAccess("mcp.tools", "developer-max").allowed).toBe(true);
    expect(canAccess("admin.dashboard", "developer-max").allowed).toBe(false);
    expect(canAccess("admin.dashboard", "elite").allowed).toBe(true);

    const denied = canAccess("model.flagship", "pro");
    expect(denied.reason).toContain("developer-max");
    expect(requiredTierFor("admin.quota-override")).toBe("elite");
    expect(ROLE_TIER_RANK[requiredTierFor("agent.autopilot")]).toBe(0);
  });

  it("applies the elite/admin override only when the flag is set", () => {
    expect(canAccess("admin.dashboard", "pro", { isAdmin: true }).allowed).toBe(true);
    expect(canAccess("admin.dashboard", "pro", { isAdmin: false }).allowed).toBe(false);
    expect(canAccess("admin.dashboard", "pro").allowed).toBe(false);
  });

  it("keeps tier feature sets monotonic by rank", () => {
    const tiers = ["free", "pro", "developer-max", "elite"] as const;
    for (let index = 1; index < tiers.length; index += 1) {
      const lower = TIER_FEATURES[tiers[index - 1]];
      const higher = TIER_FEATURES[tiers[index]];
      for (const feature of lower) {
        expect(higher).toContain(feature);
      }
    }
    expect(ROLE_TIER_LABELS["developer-max"]).toBe("Developer Max");
  });

  it("escalates quota caps monotonically across tiers", () => {
    expect(TIER_QUOTA_CAPS.free.maxTokensPerDay).toBeLessThan(TIER_QUOTA_CAPS.pro.maxTokensPerDay);
    expect(TIER_QUOTA_CAPS.pro.maxTokensPerDay).toBeLessThan(TIER_QUOTA_CAPS["developer-max"].maxTokensPerDay);
    expect(TIER_QUOTA_CAPS.free.maxCustomProviderKeys).toBe(0);
    expect(TIER_QUOTA_CAPS.elite.requestsPerMinute).toBeGreaterThan(TIER_QUOTA_CAPS["developer-max"].requestsPerMinute);
  });

  it("lets admin quota overrides raise caps but never lower them", () => {
    const base = TIER_QUOTA_CAPS.pro;
    const raised = applyAdminQuotaOverride(base, { maxTokensPerDay: 1_000_000, maxMcpConnectors: 4 }, { isAdmin: true });
    expect(raised.maxTokensPerDay).toBe(1_000_000);
    expect(raised.maxMcpConnectors).toBe(4);
    expect(raised.maxCustomProviderKeys).toBe(base.maxCustomProviderKeys);

    const lowered = applyAdminQuotaOverride(base, { maxTokensPerDay: 1 }, { isAdmin: true });
    expect(lowered.maxTokensPerDay).toBe(base.maxTokensPerDay);

    const ignored = applyAdminQuotaOverride(base, { maxTokensPerDay: 1_000_000 }, { isAdmin: false });
    expect(ignored).toBe(base);
  });

  it("enforces access server-side from role, owner flag and subscription tier", () => {
    const member = enforceServerAccess({ feature: "github.integration", role: "member", subscriptionTier: "pro" });
    expect(member.allowed).toBe(true);

    const restricted = enforceServerAccess({ feature: "admin.dashboard", role: "member", subscriptionTier: "expert" });
    expect(restricted.allowed).toBe(false);

    const admin = enforceServerAccess({ feature: "admin.dashboard", role: "admin", subscriptionTier: "lite" });
    expect(admin.allowed).toBe(true);
    expect(admin.tier).toBe("elite");

    const owner = enforceServerAccess({ feature: "admin.quota-override", role: "member", isOwner: true });
    expect(owner.allowed).toBe(true);
  });
});
