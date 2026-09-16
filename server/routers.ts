import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { accountRouter } from "./account-router";
import { billingRouter } from "./billing-router";
import { systemRouter } from "./_core/systemRouter";
import { developmentChatRouter } from "./development-chat";
import { opsRouter } from "./ops-router";
import { featuresRouter } from "./features-router";
import { appStatusRouter } from "./app-status-router";
import { adminRouter } from "./admin-router";
import { dataHubRouter } from "./data-hub";
import { memoryRouter } from "./memory-router";
import { meteringRouter } from "./metering-router";
import { mcpRouter } from "./mcp-router";
import { orchestratorRouter } from "./orchestrator-router";
import { monetizationRouter } from "./monetization-router";
import { crashReportingRouter, selfHealingRouter } from "./self-healing-router";
import { projectsRouter } from "./projects-router";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  ops: opsRouter,
  features: featuresRouter,
  appStatus: appStatusRouter,
  admin: adminRouter,
  dataHub: dataHubRouter,
  memory: memoryRouter,
  metering: meteringRouter,
  mcp: mcpRouter,
  orchestrator: orchestratorRouter,
  monetization: monetizationRouter,
  selfHealing: selfHealingRouter,
  crashReporting: crashReportingRouter,
  developmentChat: developmentChatRouter,
  account: accountRouter,
  billing: billingRouter,
  projects: projectsRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
