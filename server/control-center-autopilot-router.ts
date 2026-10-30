import { adminProcedure, router } from "./_core/trpc";
import { revenueAutopilotOverview } from "./revenue-autopilot";
import { runControlCenterAutopilot } from "./control-center-autopilot";
import { growthPulseOverview, runGrowthPulse } from "./always-on-growth";

export const controlCenterAutopilotRouter = router({
  overview: adminProcedure.query(revenueAutopilotOverview),
  growthOverview: adminProcedure.query(() => growthPulseOverview()),
  growthRunNow: adminProcedure.mutation(() => runGrowthPulse()),
  runNow: adminProcedure.mutation(() => runControlCenterAutopilot()),
});
