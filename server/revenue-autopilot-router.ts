import { adminProcedure, router } from "./_core/trpc";
import { revenueAutopilotOverview, runRevenueAutopilot } from "./revenue-autopilot";

export const revenueAutopilotRouter = router({
  overview: adminProcedure.query(revenueAutopilotOverview),
  runNow: adminProcedure.mutation(() => runRevenueAutopilot(3)),
});
