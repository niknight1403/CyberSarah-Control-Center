/**
 * Sprint 295 — Tests fuer Onboarding v2 (gefuehrter erster Lauf).
 */
import { describe, it, expect } from "vitest";
import {
  ONBOARDING_V2_STEPS,
  ONBOARDING_V2_STORAGE_KEY,
  clampV2StepIndex,
  getOnboardingV2StepState,
  normalizeOnboardingV2Completion,
  canAdvanceV2Step,
  canCompleteV2,
  shouldSkipV2IfV1Complete,
} from "@/lib/onboarding-v2-logic";

describe("Sprint 295 — Onboarding v2 Logic", () => {
  describe("ONBOARDING_V2_STEPS", () => {
    it("has exactly 3 steps in correct order", () => {
      expect(ONBOARDING_V2_STEPS.length).toBe(3);
      expect(ONBOARDING_V2_STEPS[0].id).toBe("expectations");
      expect(ONBOARDING_V2_STEPS[1].id).toBe("setup");
      expect(ONBOARDING_V2_STEPS[2].id).toBe("ready");
    });
    it("each step has an honestLimit", () => {
      for (const step of ONBOARDING_V2_STEPS) {
        expect(step.honestLimit).toBeTruthy();
        expect(step.honestLimit.length).toBeGreaterThan(10);
      }
    });
  });

  describe("clampV2StepIndex", () => {
    it("clamps negative to 0", () => {
      expect(clampV2StepIndex(-1, 3)).toBe(0);
    });
    it("clamps overflow to last index", () => {
      expect(clampV2StepIndex(5, 3)).toBe(2);
    });
    it("passes valid index through", () => {
      expect(clampV2StepIndex(1, 3)).toBe(1);
    });
    it("handles NaN", () => {
      expect(clampV2StepIndex(NaN, 3)).toBe(0);
    });
    it("handles zero total", () => {
      expect(clampV2StepIndex(0, 0)).toBe(0);
    });
  });

  describe("getOnboardingV2StepState", () => {
    it("returns correct state for first step", () => {
      const state = getOnboardingV2StepState(0);
      expect(state.stepNumber).toBe(1);
      expect(state.totalSteps).toBe(3);
      expect(state.progress).toBe(0);
      expect(state.isFirst).toBe(true);
      expect(state.isLast).toBe(false);
      expect(state.nextLabel).toBe("Weiter");
      expect(state.honorLimitVisible).toBe(true);
    });

    it("returns correct state for middle step", () => {
      const state = getOnboardingV2StepState(1);
      expect(state.stepNumber).toBe(2);
      expect(state.progress).toBe(0.5);
      expect(state.isFirst).toBe(false);
      expect(state.isLast).toBe(false);
      expect(state.nextLabel).toBe("Weiter");
    });

    it("returns correct state for last step", () => {
      const state = getOnboardingV2StepState(2);
      expect(state.stepNumber).toBe(3);
      expect(state.progress).toBe(1);
      expect(state.isLast).toBe(true);
      expect(state.nextLabel).toBe("Los geht's");
    });
  });

  describe("normalizeOnboardingV2Completion", () => {
    it("accepts 'true' string", () => {
      expect(normalizeOnboardingV2Completion("true")).toBe(true);
    });
    it("accepts boolean true", () => {
      expect(normalizeOnboardingV2Completion(true)).toBe(true);
    });
    it("rejects false and other values", () => {
      expect(normalizeOnboardingV2Completion("false")).toBe(false);
      expect(normalizeOnboardingV2Completion(null)).toBe(false);
      expect(normalizeOnboardingV2Completion(undefined)).toBe(false);
      expect(normalizeOnboardingV2Completion(0)).toBe(false);
    });
  });

  describe("canAdvanceV2Step", () => {
    it("can advance from step 0 with 3 total", () => {
      expect(canAdvanceV2Step(0, 3)).toBe(true);
    });
    it("cannot advance from last step", () => {
      expect(canAdvanceV2Step(2, 3)).toBe(false);
    });
  });

  describe("canCompleteV2", () => {
    it("cannot complete on first step", () => {
      expect(canCompleteV2(0, 3)).toBe(false);
    });
    it("can complete on last step", () => {
      expect(canCompleteV2(2, 3)).toBe(true);
    });
  });

  describe("shouldSkipV2IfV1Complete", () => {
    it("returns true when v1 is complete", () => {
      expect(shouldSkipV2IfV1Complete(true)).toBe(true);
    });
    it("returns false when v1 is not complete", () => {
      expect(shouldSkipV2IfV1Complete(false)).toBe(false);
    });
  });

  describe("ONBOARDING_V2_STORAGE_KEY", () => {
    it("is a non-empty string", () => {
      expect(ONBOARDING_V2_STORAGE_KEY.length).toBeGreaterThan(0);
    });
  });
});
