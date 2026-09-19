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
import { designRouter } from "./design/design-router";
import { monetizationRouter } from "./monetization-router";
import { crashReportingRouter, selfHealingRouter } from "./self-healing-router";
import { projectsRouter } from "./projects-router";
import { superAgentsRouter } from "./super-agents-router";
import { providerAdminRouter } from "./provider-admin-router";
import { autonomousDevRouter } from "./autonomous-dev-router";
import { keylessSearchRouter } from "./keyless-search";
import { secretsRouter } from "./secrets-router";
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
  design: designRouter,
  monetization: monetizationRouter,
  selfHealing: selfHealingRouter,
  crashReporting: crashReportingRouter,
  developmentChat: developmentChatRouter,
  account: accountRouter,
  billing: billingRouter,
  projects: projectsRouter,
  superAgents: superAgentsRouter,
  providerAdmin: providerAdminRouter,
  autonomousDev: autonomousDevRouter,
  keylessSearch: keylessSearchRouter,
  secrets: secretsRouter,
  auth: router({
    // Sicherheitsfix: niemals den rohen DB-Datensatz (inkl. passwordHash)
    // an den Client senden — nur die oeffentlichen Felder.
    me: publicProcedure.query((opts) => {
      const user = opts.ctx.user;
      if (!user) return null;
      const { id, openId, name, email, loginMethod, role, lastSignedIn } = user;
      return { id, openId, name, email, loginMethod, role, lastSignedIn };
    }),
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
