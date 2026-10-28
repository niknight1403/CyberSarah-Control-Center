import { adminProcedure, router } from "./_core/trpc";
import { revenueAutopilotOverview } from "./revenue-autopilot";
import { runControlCenterAutopilot } from "./control-center-autopilot";

export const controlCenterAutopilotRouter = router({
  overview: adminProcedure.query(revenueAutopilotOverview),
  runNow: adminProcedure.mutation(runControlCenterAutopilot),
});
