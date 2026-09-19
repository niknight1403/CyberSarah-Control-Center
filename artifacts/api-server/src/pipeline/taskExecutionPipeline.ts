/**
 * CyberSarah Control Center — Zentrale Task-Execution-Pipeline
 *
 * Alle Agenten-Tasks (aus Express-Routen, tRPC-Prozeduren, Middleware-
 * Exception-Funnel und Cron-Queue) laufen durch genau diese Pipeline:
 *
 *   submit(task)
 *     -> HITL-Gate (evaluateHITLRisk): bezahlte Upgrades / schwere
 *        Systemaenderungen -> OPERATOR_CONFIRM_REQUIRED, sonst autonom
 *     -> ToolLimitResolverAgent.processTask: Limit-Fehler (429/403/503,
 *        Quota, Token) werden autonom rotiert und der Task ohne
 *        Datenverlust erneut ausgefuehrt.
 *
 * Middleware/Routen binden sich ueber `taskExecutionPipeline` (Singleton)
 * bzw. `agentTaskMiddleware` (siehe middleware/agentTaskMiddleware.ts) an.
 */

import { ToolLimitResolverAgent } from "../agents/specialized/toolLimitResolverAgent";
import type { BaseAgent, AgentTask, AgentTaskResult } from "../agents/baseAgent";
import { ToolRotatorEngine } from "../lib/toolRotatorEngine";

export interface TaskSubmissionMeta {
  /** Urspruenglicher Kanal (z. B. "express:POST /api/chat", "trpc:chat.send"). */
  source?: string;
  /** Korrelations-ID fuer Log-Zuordnung. */
  correlationId?: string;
}

class TaskExecutionPipeline {
  private readonly resolver: ToolLimitResolverAgent;
  private readonly registeredAgents = new Map<string, BaseAgent>();

  constructor(resolver: ToolLimitResolverAgent) {
    this.resolver = resolver;
    this.registerAgent(resolver);
  }

  /** Registriert einen Agenten; Resolver-Tasks laufen immer ueber ihn selbst. */
  registerAgent(agent: BaseAgent): void {
    this.registeredAgents.set(agent.name, agent);
  }

  /** Einstiegspunkt fuer ALLE eingehenden Agenten-Tasks. */
  async submit(task: AgentTask, meta: TaskSubmissionMeta = {}): Promise<AgentTaskResult> {
    const source = meta.source ?? "pipeline";
    const correlation = meta.correlationId ?? task.id;
    console.log(`[pipeline] Task ${task.id} (${task.type}) via ${source} [${correlation}] — Ausfuehrung.`);
    const result = await this.resolver.processTask(task);
    console.log(`[pipeline] Task ${task.id} beendet: ${result.status} nach ${result.attempts} Versuch(en).`);
    return result;
  }

  /** Funnel fuer Middleware-Exceptions aus allen Express/tRPC-Routen. */
  captureMiddlewareException(
    error: unknown,
    meta: { route?: string; method?: string } = {}
  ): ReturnType<ToolLimitResolverAgent["handleMiddlewareException"]> {
    return this.resolver.handleMiddlewareException(error, meta);
  }

  getResolver(): ToolLimitResolverAgent {
    return this.resolver;
  }

  getRegisteredAgents(): BaseAgent[] {
    return [...this.registeredAgents.values()];
  }
}

/** Prozess-weites Singleton — die zentrale Verdrahtungsstelle. */
export const toolRotatorEngine = new ToolRotatorEngine();
export const toolLimitResolverAgent = new ToolLimitResolverAgent(toolRotatorEngine);
export const taskExecutionPipeline = new TaskExecutionPipeline(toolLimitResolverAgent);
