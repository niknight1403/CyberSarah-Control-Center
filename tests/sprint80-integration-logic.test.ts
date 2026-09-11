import { describe, expect, it } from "vitest";

import {
  buildCheckoutSessionRequest,
  describeMeteredPeriod,
  aggregateMeteredPeriod,
  mapCheckoutEventToEffect,
  recordMeteredUsage,
} from "../lib/stripe-metering-logic";
import {
  buildGithubOAuthUrl,
  buildPullRequestPayload,
  isPlausibleGithubToken,
  maskGithubToken,
  processGithubWebhook,
  suggestBranchName,
  validateBranchName,
  validateOAuthCallback,
} from "../lib/github-integration-logic";

describe("github integration logic", () => {
  it("builds a protected oauth url and validates the callback state", () => {
    const url = buildGithubOAuthUrl({
      clientId: "Iv1abc123XYZ",
      redirectUri: "https://app.cybersarah-ki.com/github/callback",
      state: "sicherer-state-123",
    });
    expect(url).toContain("https://github.com/login/oauth/authorize");
    expect(url).toContain("state=sicherer-state-123");
    expect(url).toContain("scope=repo");

    expect(() =>
      buildGithubOAuthUrl({ clientId: "kurz", redirectUri: "https://x.example.com", state: "12345678" }),
    ).toThrow("Client-ID");
    expect(() =>
      buildGithubOAuthUrl({ clientId: "Iv1abc123XYZ", redirectUri: "http://x.example.com", state: "12345678" }),
    ).toThrow("HTTPS");

    const good = validateOAuthCallback({ code: "abc", state: "12345678" }, "12345678");
    expect(good.ok).toBe(true);
    const csrf = validateOAuthCallback({ code: "abc", state: "anders" }, "12345678");
    expect(csrf.ok).toBe(false);
    if (!csrf.ok) expect(csrf.reason).toContain("State");
    const denied = validateOAuthCallback({ error: "access_denied" }, "12345678");
    expect(denied.ok).toBe(false);
  });

  it("masks tokens and checks plausibility without exposing secrets", () => {
    const token = "ghp_" + "A".repeat(36);
    expect(maskGithubToken(token)).toBe("ghp_AAA…AAAA");
    expect(maskGithubToken("kurz")).toBe("…(zu kurz)");
    expect(isPlausibleGithubToken(token)).toBe(true);
    expect(isPlausibleGithubToken("ghp_zukurz")).toBe(false);
    expect(isPlausibleGithubToken("leaked-total-fake-token")).toBe(false);
  });

  it("derives valid kebab-case branch names", () => {
    expect(suggestBranchName("main", "Diff Viewer für den Chat")).toBe("feature/main/diff-viewer-fuer-den-chat");
    expect(validateBranchName(suggestBranchName("develop", "Sprint 80")).ok).toBe(true);
    expect(validateBranchName("-bad//name").ok).toBe(false);
    expect(validateBranchName("").ok).toBe(false);
    expect(validateBranchName("a".repeat(121)).ok).toBe(false);
    expect(validateBranchName("guter/name-1").ok).toBe(true);
  });

  it("builds validated pull request payloads with file lists", () => {
    const payload = buildPullRequestPayload({
      title: "Sprint 80: Stripe-Metering",
      head: "feature/main/sprint-80",
      body: "Führt Metering ein.",
      filesChanged: ["lib/b.ts", "lib/a.ts"],
    });
    expect(payload.base).toBe("main");
    expect(payload.body).toContain("lib/a.ts");
    expect(payload.body).toContain("lib/b.ts");
    expect(() => buildPullRequestPayload({ title: "x", head: "ok-branch" })).toThrow("Titel");
    expect(() =>
      buildPullRequestPayload({ title: "Gültig", head: "schlechter branch" }),
    ).toThrow("Branch-Name");
  });

  it("normalizes webhook events without throwing on odd payloads", () => {
    const push = processGithubWebhook("push", { ref: "refs/heads/main", commits: [{}, {}], sender: { login: "nik" } });
    expect(push.kind === "push" && push.branch === "main" && push.commits === 2 && push.sender === "nik").toBe(true);

    const opened = processGithubWebhook("pull_request", {
      action: "opened",
      number: 7,
      pull_request: { title: "Neu", head: { ref: "feat" }, base: { ref: "main" } },
    });
    expect(opened.kind === "pr-opened" && opened.number === 7 && opened.base === "main").toBe(true);

    const merged = processGithubWebhook("pull_request", {
      action: "closed",
      number: 7,
      pull_request: { title: "Neu", merged: true, merge_commit_sha: "abc123" },
    });
    expect(merged.kind === "pr-merged" && merged.mergeCommit === "abc123").toBe(true);

    const ignored = processGithubWebhook("pull_request", { action: "assigned" });
    expect(ignored.kind === "ignored").toBe(true);
    expect(processGithubWebhook("star", null).kind).toBe("ignored");
  });
});

describe("stripe metering logic", () => {
  const baseEntry = { atMs: 1_000, model: "gpt-flagship", tokens: 2_500, costPer1kCents: 2_000 };

  it("maps checkout sessions to activation effects only when complete", () => {
    const effect = mapCheckoutEventToEffect("checkout.session.completed", {
      id: "cs_test_1",
      status: "complete",
      customer_email: "kunde@example.com",
      customer: { id: "cus_123" },
      metadata: { tier: "pro" },
    });
    expect(effect.effect).toBe("activate-subscription");
    if (effect.effect === "activate-subscription") {
      expect(effect.tier).toBe("pro");
      expect(effect.customerId).toBe("cus_123");
      expect(effect.email).toBe("kunde@example.com");
    }

    expect(mapCheckoutEventToEffect("checkout.session.expired", { id: "x", status: "expired" }).effect).toBe("none");
    expect(
      mapCheckoutEventToEffect("checkout.session.completed", { id: "x", status: "open", metadata: { tier: "pro" } }).effect,
    ).toBe("none");
    expect(
      mapCheckoutEventToEffect("checkout.session.completed", { id: "x", status: "complete", metadata: { tier: "hacker" } })
        .effect,
    ).toBe("none");
    expect(mapCheckoutEventToEffect("unknown.event", null).effect).toBe("none");
  });

  it("records, filters and aggregates metered usage per model", () => {
    const ledger = recordMeteredUsage([], baseEntry);
    const withMore = recordMeteredUsage(ledger, { ...baseEntry, atMs: 90_000, model: "mini", tokens: 1_000, costPer1kCents: 100 });
    expect(withMore).toHaveLength(2);
    expect(recordMeteredUsage(withMore, { ...baseEntry, tokens: 0 })).toHaveLength(2);

    const summary = aggregateMeteredPeriod(withMore, 0, 100_000);
    expect(summary.entries).toBe(2);
    expect(summary.totalTokens).toBe(3_500);
    expect(summary.tokensByModel["gpt-flagship"]).toBe(2_500);
    expect(summary.totalCostCents).toBe(5_100);

    const partial = aggregateMeteredPeriod(withMore, 50_000, 100_000);
    expect(partial.entries).toBe(1);
    expect(partial.totalTokens).toBe(1_000);
  });

  it("describes metered periods compactly", () => {
    const summary = aggregateMeteredPeriod([baseEntry], 0, 10_000);
    const line = describeMeteredPeriod(summary, "September");
    expect(line).toContain("September");
    expect(line).toContain("2500 Tokens");
    expect(line).toContain("gpt-flagship: 2.5k");
    expect(line).toContain("50.00 EUR");
  });

  it("builds validated checkout session requests", () => {
    const request = buildCheckoutSessionRequest({
      tier: "expert",
      priceId: "price_abc123",
      successUrl: "https://app.cybersarah-ki.com/success",
      cancelUrl: "https://app.cybersarah-ki.com/cancel",
      customerEmail: "kunde@example.com",
    });
    expect(request.mode).toBe("subscription");
    expect(request.metadata.tier).toBe("expert");
    expect(request.lineItems[0].price).toBe("price_abc123");

    expect(() =>
      buildCheckoutSessionRequest({ tier: "pro", priceId: "falsch", successUrl: "https://a.de", cancelUrl: "https://b.de" }),
    ).toThrow("Price-ID");
    expect(() =>
      buildCheckoutSessionRequest({ tier: "pro", priceId: "price_x", successUrl: "http://a.de", cancelUrl: "https://b.de" }),
    ).toThrow("HTTPS");
    expect(() =>
      buildCheckoutSessionRequest({
        tier: "pro",
        priceId: "price_x",
        successUrl: "https://a.de",
        cancelUrl: "https://b.de",
        customerEmail: "keine-mail",
      }),
    ).toThrow("E-Mail");
  });
});
