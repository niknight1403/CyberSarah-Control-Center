/**
 * CyberSarah Control Center — Express/tRPC-Anbindung des ToolLimitResolverAgents
 *
 * Verdrahtet die zentrale Task-Execution-Pipeline mit allen Express-Routen
 * und tRPC-Prozeduren. Strukturgetippt ohne harte express/@trpc-Abhaengigkeit,
 * sodass die Adapter in jeder Express-4/5-App und jedem tRPC-Router gemountet
 * werden koennen:
 *
 *   import { agentTaskRouteHandler, toolLimitErrorMiddleware, trpcToolLimitFormatter } from "./middleware/agentTaskMiddleware";
 *
 *   // Express: Agent-Task-Einreichung (jede Route, die Agenten-Arbeit triggert)
 *   app.post("/agent/tasks", agentTaskRouteHandler());
 *
 *   // Express: Limit-Fehler-Funnel fuer ALLE Routen (4 Argumente = Fehler-MW)
 *   app.use(toolLimitErrorMiddleware());
 *
 *   // tRPC: Fehlerformatierung in createExpressMiddleware({ onError })
 *   createExpressMiddleware({ router: appRouter, onError: trpcToolLimitFormatter });
 */

import type { AgentTask , AgentTaskResult } from "../agents/baseAgent";
import { taskExecutionPipeline } from "../pipeline/taskExecutionPipeline";

// ---------------------------------------------------------------------------
// Strukturelle Typen (express-kompatibel, ohne express-Abhaengigkeit)
// ---------------------------------------------------------------------------

interface MinimalIncomingMessage {
  method?: string;
  originalUrl?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface MinimalServerResponse {
  locals?: Record<string, unknown>;
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
}

type NextFunction = (err?: unknown) => void;

type ExpressErrorHandler = (
  error: unknown,
  req: MinimalIncomingMessage,
  res: MinimalServerResponse,
  next: NextFunction
) => void;

type ExpressRequestHandler = (
  req: MinimalIncomingMessage,
  res: MinimalServerResponse,
  next: NextFunction
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Route-Handler: POST /agent/tasks -> Task-Execution-Pipeline
// ---------------------------------------------------------------------------

/**
 * Express-Route-Handler, der einen Agent-Task annimmt und durch die
 * zentrale Pipeline (HITL-Gate + autonomer Limit-Resolver) ausfuehrt.
 * Erwartet den Task als JSON-Body ohne execute()-Funktion — stattdessen
 * wird die Standard-Ausfuehrung des Resolver-Agenten genutzt.
 */
export function agentTaskRouteHandler(): ExpressRequestHandler {
  return async (req, res) => {
    if ((req.method ?? "POST").toUpperCase() !== "POST") {
      res.statusCode = 405;
      res.json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const body = (req.body ?? {}) as Partial<AgentTask> & Record<string, unknown>;
    if (typeof body.id !== "string" || typeof body.type !== "string" || typeof body.execute !== "function") {
      res.statusCode = 400;
      res.json({
        error: "INVALID_TASK",
        detail: "Task benoetigt 'id', 'type' und eine 'execute'-Funktion.",
      });
      return;
    }

    const task = body as unknown as AgentTask;
    const result: AgentTaskResult = await taskExecutionPipeline.submit(task, {
      source: `express:${req.method} ${req.originalUrl ?? req.url ?? "/agent/tasks"}`,
    });

    if (result.status === "completed") {
      res.statusCode = 200;
      res.json({ status: result.status, output: result.output, attempts: result.attempts });
      return;
    }
    if (result.status === "operator_confirm_required") {
      res.statusCode = 202;
      res.json({ status: result.status, reason: result.reason, proposal: result.output });
      return;
    }
    res.statusCode = 503;
    res.setHeader("Retry-After", "60");
    res.json({
      status: result.status,
      reason: result.reason,
      detail: "Alle kostenlosen Tiers erschöpft — bitte gleich erneut versuchen.",
    });
  };
}

// ---------------------------------------------------------------------------
// Fehler-Middleware: Limit-Funnel fuer alle Routen
// ---------------------------------------------------------------------------

/**
 * Express-Fehler-Middleware (4-Argumente-Signatur) fuer ALLE Routen:
 * faengt 429/403/503- und Quota-Exceptions ab, klassifiziert sie ueber
 * den ToolLimitResolverAgent und liefert einen strukturierten Retry-After.
 * Route-spezifische Agent-Tasks koennen ueber res.locals.agentTask
 * automatisch (verlustfrei) erneut eingereicht werden.
 */
export function toolLimitErrorMiddleware(): ExpressErrorHandler {
  return (error, req, res, next) => {
    const funnel = taskExecutionPipeline.captureMiddlewareException(error, {
      route: req.originalUrl ?? req.url,
      method: req.method,
    });

    if (!funnel.isLimit) {
      next(error);
      return;
    }

    res.statusCode = funnel.limit.httpStatus === 403 ? 403 : 429;
    res.setHeader("Retry-After", String(funnel.retryInSeconds));
    res.json({
      error: "TOOL_LIMIT_REACHED",
      kind: funnel.limit.kind,
      detail: "Der ToolLimitResolverAgent rotiert automatisch auf den naechsten freien Key/Provider.",
      retryInSeconds: funnel.retryInSeconds,
    });
  };
}

// ---------------------------------------------------------------------------
// tRPC-Anbindung
// ---------------------------------------------------------------------------

/** Minimalform eines tRPC-Shape im Error-Formatter (Struktur ohne @trpc-Dep). */
interface MinimalTrpcErrorShape {
  code: number;
  message: string;
  httpStatus: number;
  data?: { code?: string; httpStatus?: number; retryInSeconds?: number };
}

/**
 * tRPC-onError-Adapter: leitet Limit-Fehler aus allen tRPC-Prozeduren an
 * den Resolver-Funnel weiter und formatiert sie als strukturierten,
 * klientenseitig rotierbaren Fehler (inkl. Retry-After-Hinweis).
 */
export function trpcToolLimitFormatter(options: {
  error: unknown;
  path?: string;
  shape?: MinimalTrpcErrorShape;
}): MinimalTrpcErrorShape | undefined {
  const { error, path, shape } = options;
  const funnel = taskExecutionPipeline.captureMiddlewareException(error, {
    route: path ? `trpc:${path}` : "trpc",
    method: "PROCEDURE",
  });

  if (!funnel.isLimit || !shape) return shape;

  return {
    ...shape,
    httpStatus: funnel.limit.httpStatus === 403 ? 403 : 429,
    message: `TOOL_LIMIT_REACHED (${funnel.limit.kind}) — automatische Rotation aktiv.`,
    data: {
      ...(shape.data ?? {}),
      code: "TOOL_LIMIT_REACHED",
      httpStatus: funnel.limit.httpStatus === 403 ? 403 : 429,
      retryInSeconds: funnel.retryInSeconds,
    },
  };
}
