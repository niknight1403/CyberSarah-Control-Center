import { beforeEach, describe, expect, it, vi } from "vitest";

const snapshotMock = vi.fn();
const dbMock = vi.fn();

vi.mock("../server/revenue-autopilot", () => ({
  collectRevenueAutopilotSnapshot: () => snapshotMock(),
}));

vi.mock("../server/db", () => ({
  getDb: () => dbMock(),
}));

const { runRevenueLoopIteration } = await import("../server/revenue-loop-orchestrator");

const NOW = Date.UTC(2026, 10, 2, 5, 40, 0);

function measured() {
  return {
    landingViews: 1200,
    signups: 90,
    checkoutStarts: 30,
    upgrades: 12,
    stripeCheckoutStarted: 30,
    stripeCheckoutCompleted: 21,
    stripeCheckoutSuccessRate: 70,
    invoiceSuccessRate: 96,
    invoiceAttempts: 25,
    mrrEur: 2500,
    activeSubscriptions: 30,
    affiliateClicks: 0,
    affiliateConversions: 0,
    crossSellRecommended: 4,
    crossSellConverted: 1,
    validatedExpansionOpportunities: 1,
    haraOpenProposals: 0,
  };
}

describe("runRevenueLoopIteration", () => {
  beforeEach(() => {
    snapshotMock.mockReset();
    dbMock.mockReset();
    dbMock.mockResolvedValue(null); // keine Datenbank im Test
  });

  it("liefert ein Update ohne Datenbank, ohne etwas zu speichern", async () => {
    snapshotMock.mockResolvedValue(measured());
    const result = await runRevenueLoopIteration({ now: NOW });
    expect(result.ok).toBe(true);
    expect(result.persisted).toBe(false);
    expect(result.runKey).toBeNull();
    expect(result.summary.length).toBe(5);
    expect(result.digest.revenue.mrrEur).toBe(2500);
    expect(result.digest.network.available).toBe(false);
  });

  it("meldet fehlende Quellen als Blocker statt zu raten", async () => {
    snapshotMock.mockResolvedValue({
      ...measured(),
      mrrEur: null,
      landingViews: null,
      signups: null,
      upgrades: null,
    });
    const result = await runRevenueLoopIteration({ now: NOW });
    expect(result.digest.revenue.mrrEur).toBeNull();
    expect(result.digest.blockers.join(" ")).toContain("MRR");
    expect(result.digest.reach.available).toBe(false);
  });

  it("lässt B2B-Aktionen nie ohne Freigabe nach außen wirken", async () => {
    snapshotMock.mockResolvedValue(measured());
    const result = await runRevenueLoopIteration({ now: NOW });
    for (const action of result.digest.actions) {
      if (action.area === "network") expect(action.requiresApproval).toBe(true);
    }
  });

  it("hält einen ersten Lauf ohne Vormessung nicht für messbar", async () => {
    snapshotMock.mockResolvedValue(measured());
    const result = await runRevenueLoopIteration({ now: NOW, persist: false });
    expect(result.outcome).toBeNull();
    expect(result.persisted).toBe(false);
  });
});
