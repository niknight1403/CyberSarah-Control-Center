import { adminProcedure, router } from "./_core/trpc";
import { revenueAutopilotOverview } from "./revenue-autopilot";
import { runControlCenterAutopilot } from "./control-center-autopilot";
import { growthPulseOverview, runGrowthPulse, growthRuntimeStatus } from "./always-on-growth";

export const controlCenterAutopilotRouter = router({
  overview: adminProcedure.query(revenueAutopilotOverview),
  growthOverview: adminProcedure.query(() => growthPulseOverview()),
  growthRuntimeStatus: adminProcedure.query(() => growthRuntimeStatus()),
  growthRunNow: adminProcedure.mutation(() => runGrowthPulse()),
  runNow: adminProcedure.mutation(() => runControlCenterAutopilot()),
});
