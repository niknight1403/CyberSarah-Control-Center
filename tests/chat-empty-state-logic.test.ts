/**
 * Sprint 297 — Tests fuer Chat-Leerer-Zustand (Starter-Prompts).
 */
import { describe, it, expect } from "vitest";
import {
  STARTER_PROMPTS,
  getAllStarterPrompts,
  getStarterPromptsForContext,
  isStarterPromptAvailable,
  getDisabledPromptHint,
  normalizeStarterPromptId,
} from "@/lib/chat-empty-state-logic";

describe("Sprint 297 — Chat Empty State Logic", () => {
  describe("STARTER_PROMPTS", () => {
    it("has at least 4 starter prompts", () => {
      expect(STARTER_PROMPTS.length).toBeGreaterThanOrEqual(4);
    });
    it("every prompt has non-empty title and subtitle", () => {
      for (const p of STARTER_PROMPTS) {
        expect(p.title.length).toBeGreaterThan(0);
        expect(p.subtitle.length).toBeGreaterThan(0);
      }
    });
    it("every prompt has a unique id", () => {
      const ids = STARTER_PROMPTS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
    it("some prompts require a repo", () => {
      const repoRequired = STARTER_PROMPTS.filter((p) => p.requiresRepo);
      expect(repoRequired.length).toBeGreaterThan(0);
    });
    it("some prompts do not require a repo", () => {
      const noRepo = STARTER_PROMPTS.filter((p) => !p.requiresRepo);
      expect(noRepo.length).toBeGreaterThan(0);
    });
  });

  describe("getAllStarterPrompts", () => {
    it("returns a copy of all prompts", () => {
      const all = getAllStarterPrompts();
      expect(all.length).toBe(STARTER_PROMPTS.length);
      // Ensure it's a copy
      all.push({
        id: "extra",
        title: "Extra",
        subtitle: "Extra",
        icon: "doc.text.fill",
        requiresRepo: false,
      });
      expect(STARTER_PROMPTS.length).not.toBe(all.length);
    });
  });

  describe("getStarterPromptsForContext", () => {
    it("returns all prompts enabled when repo is connected", () => {
      const result = getStarterPromptsForContext(true);
      expect(result.length).toBe(STARTER_PROMPTS.length);
      for (const item of result) {
        expect(item.enabled).toBe(true);
      }
    });
    it("marks repo-dependent prompts as disabled when no repo", () => {
      const result = getStarterPromptsForContext(false);
      const disabled = result.filter((r) => !r.enabled);
      expect(disabled.length).toBeGreaterThan(0);
      for (const item of disabled) {
        expect(item.prompt.requiresRepo).toBe(true);
      }
    });
    it("keeps non-repo prompts enabled when no repo", () => {
      const result = getStarterPromptsForContext(false);
      const enabled = result.filter((r) => r.enabled);
      for (const item of enabled) {
        expect(item.prompt.requiresRepo).toBe(false);
      }
    });
  });

  describe("isStarterPromptAvailable", () => {
    it("returns true for non-repo prompt regardless of repo state", () => {
      const prompt = STARTER_PROMPTS.find((p) => !p.requiresRepo)!;
      expect(isStarterPromptAvailable(prompt, false)).toBe(true);
      expect(isStarterPromptAvailable(prompt, true)).toBe(true);
    });
    it("returns false for repo prompt when no repo", () => {
      const prompt = STARTER_PROMPTS.find((p) => p.requiresRepo)!;
      expect(isStarterPromptAvailable(prompt, false)).toBe(false);
    });
    it("returns true for repo prompt when repo connected", () => {
      const prompt = STARTER_PROMPTS.find((p) => p.requiresRepo)!;
      expect(isStarterPromptAvailable(prompt, true)).toBe(true);
    });
  });

  describe("getDisabledPromptHint", () => {
    it("returns hint text for repo-dependent prompt", () => {
      const prompt = STARTER_PROMPTS.find((p) => p.requiresRepo)!;
      const hint = getDisabledPromptHint(prompt);
      expect(hint).toContain("Repository");
      expect(hint.length).toBeGreaterThan(10);
    });
    it("returns empty string for non-repo prompt", () => {
      const prompt = STARTER_PROMPTS.find((p) => !p.requiresRepo)!;
      const hint = getDisabledPromptHint(prompt);
      expect(hint).toBe("");
    });
  });

  describe("normalizeStarterPromptId", () => {
    it("finds prompt by valid id", () => {
      const p = normalizeStarterPromptId("explain-project");
      expect(p).toBeDefined();
      expect(p!.title).toBe("Erkläre mein Projekt");
    });
    it("returns undefined for invalid id", () => {
      expect(normalizeStarterPromptId("nope")).toBeUndefined();
    });
    it("returns undefined for non-string", () => {
      expect(normalizeStarterPromptId(42)).toBeUndefined();
      expect(normalizeStarterPromptId(null)).toBeUndefined();
    });
  });
});
