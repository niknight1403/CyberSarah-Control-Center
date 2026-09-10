import {
  parseFeatureFlagOverrides,
  resolveFeatureFlags,
  toClientFeatureFlags,
} from "../lib/feature-flag-logic";
import { protectedProcedure, router } from "./_core/trpc";

/**
 * Sprint 61 — Feature-Flags ueber tRPC: Client sieht nur Einschaltzustande.
 * Overrides kommen aus ENV FEATURE_FLAGS (siehe lib/feature-flag-logic.ts).
 */
export const featuresRouter = router({
  list: protectedProcedure.query(() => {
    const flags = resolveFeatureFlags(
      parseFeatureFlagOverrides(process.env.FEATURE_FLAGS ?? ""),
    );
    return toClientFeatureFlags(flags);
  }),
});
