import { adminProcedure, router } from "./_core/trpc";
import { getCapabilityCatalog, summarizeCapabilityCatalog } from "../lib/capability-catalog";

/** Admin-only inventory. Never returns secret values or marks env presence as live health. */
export const capabilityCatalogRouter = router({
  list: adminProcedure.query(() => {
    const capabilities = getCapabilityCatalog();
    return {
      generatedAt: new Date().toISOString(),
      summary: summarizeCapabilityCatalog(capabilities),
      capabilities,
      semantics: {
        configuration: "Environment configuration only; not proof of successful provider authentication.",
        health: "not_checked until a provider-specific live probe has completed.",
        secretValuesExposed: false,
      },
    };
  }),
});
