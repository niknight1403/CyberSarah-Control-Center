import { describe, expect, it } from "vitest";

// 1. Auth / Session
import { resolveAuthGate } from "../lib/auth-gate-logic";
import {
  clearSessionTokens,
  loadSessionTokens,
  saveSessionTokens,
  type SecureSessionStore,
} from "../lib/secure-session-logic";
import { appRouter } from "../server/routers";

// 2. Billing / Quota
import { evaluateChatQuota } from "../lib/chat-quota-logic";
import {
  entitlementsForRole,
  entitlementsForTier,
  isTierUpgrade,
} from "../lib/subscription-tiers-logic";

// 3. Publishing Queue
import {
  PUBLISHING_STATUSES,
} from "../lib/publishing-queue-logic";

// 4. Kampagnen-Brücke
import {
  BRIDGE_MAX_PER_CYCLE,
  planCampaignBridges,
} from "../lib/campaign-bridge-logic";
import type { IdeaItem } from "../lib/idea-inbox-logic";

// 5. Draft Engine
import {
  DRAFT_KINDS,
  DRAFT_MAX_PENDING_PER_KIND,
  planDraftRun,
  validateDraftPayload,
  type ContentDraftPayload,
} from "../lib/draft-engine-logic";

describe("Sprint 374 — Kritische Pfade & Test-Lücken (Serie J)", () => {
  // -------------------------------------------------------------------------
  // 1. Auth / Session Critical Path
  // -------------------------------------------------------------------------
  describe("Auth / Session - Deterministische Phasen & Token-Verwaltung", () => {
    it("resolveAuthGate liefert 'loading' solange meResolved false ist", () => {
      const gate = resolveAuthGate({
        meResolved: false,
        user: null,
        onboardingStatus: "complete",
      });
      expect(gate).toBe("loading");
    });

    it("resolveAuthGate leitet nicht angemeldete Nutzer zum Login", () => {
      const gate = resolveAuthGate({
        meResolved: true,
        user: null,
        onboardingStatus: "complete",
      });
      expect(gate).toBe("login");
    });

    it("resolveAuthGate leitet angemeldete Nutzer mit unvollständigem Onboarding zum Onboarding", () => {
      const gate = resolveAuthGate({
        meResolved: true,
        user: { role: "user" },
        onboardingStatus: "incomplete",
      });
      expect(gate).toBe("onboarding");
    });

    it("resolveAuthGate leitet angemeldete Nutzer mit abgeschlossenem Onboarding in die App", () => {
      const gate = resolveAuthGate({
        meResolved: true,
        user: { role: "user" },
        onboardingStatus: "complete",
      });
      expect(gate).toBe("app");
    });

    it("saveSessionTokens, loadSessionTokens und clearSessionTokens verwalten Speicher deterministisch", async () => {
      const mockStorage = new Map<string, string>();
      const store: SecureSessionStore = {
        set: async (key, val) => {
          mockStorage.set(key, val);
        },
        get: async (key) => mockStorage.get(key) ?? null,
        remove: async (key) => {
          mockStorage.delete(key);
        },
      };

      await saveSessionTokens(
        {
          accessToken: "token_abc123",
          refreshToken: "refresh_xyz789",
          sessionId: "sess_456",
        },
        store,
      );

      const loaded = await loadSessionTokens(store);
      expect(loaded.accessToken).toBe("token_abc123");
      expect(loaded.refreshToken).toBe("refresh_xyz789");
      expect(loaded.sessionId).toBe("sess_456");

      await clearSessionTokens(store);
      const cleared = await loadSessionTokens(store);
      expect(cleared.accessToken).toBeNull();
      expect(cleared.refreshToken).toBeNull();
      expect(cleared.sessionId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Billing / Quota Critical Path
  // -------------------------------------------------------------------------
  describe("Billing / Quota - Tageslimit & Subscription-Entitlements", () => {
    it("evaluateChatQuota erlaubt Anfragen innerhalb der Tagesquote und sperrt bei Überschreitung", () => {
      const config = { dailyLimit: 10, role: "user" };
      const now = new Date();

      const okEval = evaluateChatQuota(config, 5, now);
      expect(okEval.allowed).toBe(true);
      expect(okEval.remaining).toBe(5);

      const blockedEval = evaluateChatQuota(config, 10, now);
      expect(blockedEval.allowed).toBe(false);
      expect(blockedEval.remaining).toBe(0);
      expect(blockedEval.reason).toContain("Tageslimit");
    });

    it("evaluateChatQuota gewährt Admin-Rollen unbegrenzte Nutzung ohne Quotenlimit", () => {
      const config = { dailyLimit: 10, role: "admin" };
      const now = new Date();
      const evalAdmin = evaluateChatQuota(config, 100, now);
      expect(evalAdmin.allowed).toBe(true);
      expect(evalAdmin.remaining).toBe(Infinity);
      expect(evalAdmin.quotaExempt).toBe(true);
    });

    it("entitlementsForTier & entitlementsForRole liefern deterministische Features je Tier", () => {
      const lite = entitlementsForTier("lite");
      const pro = entitlementsForTier("pro");
      const expert = entitlementsForTier("expert");

      expect(lite.length).toBeLessThan(pro.length);
      expect(pro.length).toBeLessThan(expert.length);

      const adminEntitlements = entitlementsForRole("admin", "lite");
      expect(adminEntitlements).toEqual(expert);

      expect(isTierUpgrade("lite", "pro")).toBe(true);
      expect(isTierUpgrade("pro", "lite")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Publishing Queue Critical Path
  // -------------------------------------------------------------------------
  describe("Publishing Queue - Status-Invarianten & Modus-Logik", () => {
    it("PUBLISHING_STATUSES definiert alle 5 gültigen Warteschlangen-Zustände", () => {
      expect(PUBLISHING_STATUSES).toContain("geplant");
      expect(PUBLISHING_STATUSES).toContain("sandbox_veroeffentlicht");
      expect(PUBLISHING_STATUSES).toContain("veroeffentlicht");
      expect(PUBLISHING_STATUSES).toContain("fehlgeschlagen");
      expect(PUBLISHING_STATUSES).toContain("abgebrochen");
      expect(PUBLISHING_STATUSES.length).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Kampagnen-Brücke Critical Path
  // -------------------------------------------------------------------------
  describe("Kampagnen-Brücke - Autonome Idee-zu-Kampagne-Planung", () => {
    it("planCampaignBridges wandelt offene Ideen deterministisch in Kampagnen-Briefs um", () => {
      const nowMs = Date.now();
      const mockIdeas: IdeaItem[] = [
        {
          id: "idea-1",
          title: "KI-Analyse für kleine Bäckereien",
          note: "Automatisierter Marketing-Feed für Lokales Gewerbe",
          source: "spontan",
          capturedAt: nowMs - 10000,
          updatedAt: nowMs - 10000,
          status: "inbox",
        },
        {
          id: "idea-2",
          title: "Sicherheits-Check für KMU",
          note: "Sicherheits-Schulungen für Remote-Mitarbeiter",
          source: "spontan",
          capturedAt: nowMs - 5000,
          updatedAt: nowMs - 5000,
          status: "inbox",
        },
      ];

      const plan = planCampaignBridges({
        ideas: mockIdeas,
        pendingContentCount: 0,
        bridgedIdeaIds: new Set(),
      });

      expect(plan.briefs.length).toBeGreaterThan(0);
      expect(plan.briefs.length).toBeLessThanOrEqual(BRIDGE_MAX_PER_CYCLE);
      expect(plan.briefs[0].ideaId).toBe("idea-1");
      expect(plan.briefs[0].personaId).toBeDefined();
      expect(plan.briefs[0].platform).toBeDefined();
    });

    it("planCampaignBridges stoppt die Erstellung, wenn das Pending-Limit erreicht ist", () => {
      const nowMs = Date.now();
      const mockIdeas: IdeaItem[] = [
        {
          id: "idea-1",
          title: "Test-Idee",
          note: "Zusammenfassung der Test-Idee",
          source: "spontan",
          capturedAt: nowMs,
          updatedAt: nowMs,
          status: "inbox",
        },
      ];

      const plan = planCampaignBridges({
        ideas: mockIdeas,
        pendingContentCount: DRAFT_MAX_PENDING_PER_KIND,
        bridgedIdeaIds: new Set(),
      });
      expect(plan.briefs.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. tRPC Router Critical Path
  // -------------------------------------------------------------------------
  describe("tRPC Router - Prozeduren-Struktur & Authentifizierung", () => {
    it("appRouter enthält alle definierten Sub-Router (system, dataHub, autonomousDev, campaignBridge, auth)", () => {
      const routerKeys = Object.keys(appRouter._def.procedures);
      expect(routerKeys.some((k) => k.startsWith("auth."))).toBe(true);
      expect(routerKeys.some((k) => k.startsWith("system."))).toBe(true);
      expect(routerKeys.some((k) => k.startsWith("dataHub."))).toBe(true);
      expect(routerKeys.some((k) => k.startsWith("autonomousDev."))).toBe(true);
      expect(routerKeys.some((k) => k.startsWith("campaignBridge."))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Draft Engine Critical Path
  // -------------------------------------------------------------------------
  describe("Draft Engine - Kapazitäts-Limits & Payload-Validierung", () => {
    it("DRAFT_KINDS definiert alle unterstützten Entwurfsarten mit Kapazitätsgrenzen", () => {
      expect(DRAFT_KINDS).toContain("content");
      expect(DRAFT_KINDS).toContain("revenue-loop");
      expect(DRAFT_KINDS).toContain("idea");
      expect(DRAFT_MAX_PENDING_PER_KIND).toBe(3);
    });

    it("validateDraftPayload prüft ContentDraftPayload valide", () => {
      const validPayload = {
        personaId: "sarah",
        platform: "linkedin",
        topic: "Titel und Thema für Content",
        content: "Ein aussagekräftiger Text mit allen Details für den Entwurf.",
      };

      const result = validateDraftPayload("content", validPayload);
      expect(result.valid).toBe(true);
      if (result.valid) {
        const payload = result.payload as ContentDraftPayload;
        expect(payload.personaId).toBe("sarah");
        expect(payload.platform).toBe("linkedin");
      }
    });

    it("validateDraftPayload weist ungültige oder unvollständige Payloads ab", () => {
      const invalidPayload = {
        personaId: "",
        content: "zu kurz",
      };

      const result = validateDraftPayload("content", invalidPayload);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeDefined();
      }
    });

    it("planDraftRun pausiert Arten, deren Pending-Kapazität erreicht ist", () => {
      const currentCounts = {
        content: DRAFT_MAX_PENDING_PER_KIND,
        "revenue-loop": 1,
        idea: 0,
      };

      const plans = planDraftRun(currentCounts);
      const contentPlan = plans.find((p) => p.kind === "content");
      const revPlan = plans.find((p) => p.kind === "revenue-loop");
      const ideaPlan = plans.find((p) => p.kind === "idea");

      expect(contentPlan?.slots).toBe(0);
      expect(contentPlan?.reason).toBe("limit");

      expect(revPlan?.slots).toBe(2);
      expect(revPlan?.reason).toBe("quota");

      expect(ideaPlan?.slots).toBe(3);
      expect(ideaPlan?.reason).toBe("quota");
    });
  });
});
