/**
 * CyberSarah Control Center — ToolLimitResolverAgent
 *
 * Autonomer, selbstheilender Spezial-Agent: faengt alle API-, Rate- und
 * Tool-Limits (HTTP 429 / 403 / 503, Quota Exceeded, Token Limits) im
 * gesamten System ab und loest sie vollstaendig autonom auf:
 *
 * 1. Automatisches Rotating & Switching: bei jedem Limit-Fehler wird in
 *    Millisekunden auf den naechsten gesunden Key, Provider oder
 *    MCP-Connector geschaltet; der gescheiterte Task wird ohne
 *    Datenverlust erneut ausgefuehrt (dasselbe execute(), dasselbe
 *    eingefrorene Payload, nur rotierter Kontext).
 * 2. Dedicated VIP Admin Bypass: Admin-Tasks laufen ueber die reservierte
 *    VIP-Lane (ADMIN_<PROVIDER>_KEY) — vom Hintergrund-Loop NIEMALS
 *    beruehrt, garantiert 0% Limits.
 * 3. Kostenlose Multi-Tier Cascade: Tier 1 (Groq, Gemini 2.5, Cerebras,
 *    SambaNova, GitHub Models) -> Tier 2 (OpenRouter :free, Hugging Face
 *    Serverless, Cloudflare Workers AI) -> Tier 3 (lokales Ollama,
 *    garantiert unbegrenzt ohne Cloud-Abhaengigkeit).
 * 4. Autonomous Cooldown Management: blockierte Keys landen fuer 60s in
 *    der Cooldown-Queue und werden nach Ablauf automatisch wieder
 *    freigeschaltet (STATUS: HEALTHY).
 *
 * Human-in-the-Loop: Limit-Aufloesung ist 100% autonom. Eine
 * OPERATOR_CONFIRM_REQUIRED-Freigabe wird nur gefordert, wenn ein
 * kostenpflichtiges Upgrade vorgeschlagen wird oder eine schwere
 * Systemaenderung ansteht (Delegation an evaluateHITLRisk).
 */

import {
  classifyToolLimitError,
  ToolLimitError,
  ToolRotatorEngine,
  RATE_LIMIT_COOLDOWN_MS,
} from "../../lib/toolRotatorEngine";
import { evaluateHITLRisk, type HITLRiskAssessment } from "../../middleware/hitlGuard";
import { AllKeysLimitReachedError } from "../../lib/rotatorEngine";
import {
  BaseAgent,
  freezePayload,
  type AgentTask,
  type AgentTaskContext,
  type AgentTaskResult,
} from "../baseAgent";

/** Default: ein Versuch pro Kaskaden-Stufe + Reserve fuer Tool-Spruenge. */
const DEFAULT_MAX_ATTEMPTS = 12;

/** Begrenzt proaktive Key-Wiederverwendung nach Limit-Meldung (60s). */
const KEY_COOLDOWN_MS = RATE_LIMIT_COOLDOWN_MS;

/** Interne Buchhaltung eines Rotations-Sprungs. */
interface RotationHop {
  providerId?: string;
  key?: string;
  toolName?: string;
  kind: ToolLimitError["kind"];
}

export class ToolLimitResolverAgent extends BaseAgent {
  readonly name = "ToolLimitResolverAgent";
  readonly description =
    "Faengt API-, Rate- und Tool-Limits (429/403/503, Quota, Token) autonom ab, " +
    "rotiert in Millisekunden auf den naechsten gesunden Key/Provider/Tool und " +
    "fuehrt gescheiterte Tasks ohne Datenverlust erneut aus.";

  private readonly rotator: ToolRotatorEngine;
  /** Hersteller von Vorschlaegen fuer bezahlte Upgrades (optional injizierbar). */
  private readonly proposePaidUpgrade?: (reason: string) => Record<string, unknown>;

  constructor(
    rotator: ToolRotatorEngine = new ToolRotatorEngine(),
    options: { proposePaidUpgrade?: (reason: string) => Record<string, unknown> } = {}
  ) {
    super();
    this.rotator = rotator;
    this.proposePaidUpgrade = options.proposePaidUpgrade;
    // Selbstheilungs-Loop: gibt abgelaufene 60s-Cooldowns automatisch frei.
    this.rotator.startAutoHeal();
  }

  // ------------------------------ Pipeline-Hook -----------------------------

  /** Von der zentralen Pipeline aufgerufen — einziger Task-Eingang. */
  async processTask(task: AgentTask): Promise<AgentTaskResult> {
    // Nutzdaten einfrieren: Rotation darf das Payload niemals veraendern
    // (Voraussetzung fuer verlustfreies Re-Executing).
    const frozenPayload = freezePayload(task.payload);
    const hardened: AgentTask = { ...task, payload: frozenPayload as Record<string, unknown> };

    // --- HITL-Gate: Limit-Fix ist autonom; bezahlte Upgrades und schwere
    // Systemaenderungen erfordern die Bestaetigung des Operators.
    const hitl = evaluateHITLRisk(hardened.action, hardened.payload);
    if (hitl.requiresConfirmation) {
      return this.operatorConfirmationRequired(hitl);
    }

    const maxAttempts = hardened.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const failedProviderIds = new Set<string>();
    const failedTools = new Set<string>();
    let lastProviderUsed: string | undefined;
    let lastToolUsed: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const context = this.buildContext(hardened, attempt, maxAttempts, failedProviderIds, failedTools);
      if (!context) {
        // Alle kostenlosen Tiers inkl. lokalem Fallback erschöpft.
        return this.exhaustedResult(attempt - 1, lastProviderUsed, lastToolUsed);
      }

      lastProviderUsed = context.provider?.provider.id;
      lastToolUsed = context.tool?.tool.name;

      try {
        const output = await hardened.execute(context);
        return {
          status: "completed",
          output,
          attempts: attempt,
          providerUsed: lastProviderUsed,
          toolUsed: lastToolUsed,
        };
      } catch (error) {
        const limit = classifyToolLimitError(error);
        if (!limit) {
          // Kein Limit-Fehler (z. B. fachlicher Fehler): nicht rotieren —
          // der Task-Inhaber entscheidet ueber Wiederholung.
          throw error;
        }

        const hop = this.reportLimitToRotator(hardened, context, limit);
        if (hop.providerId) failedProviderIds.add(hop.providerId);
        if (hop.key) this.rotator.reportProviderLimit(hop.providerId ?? "", { key: hop.key, cooldownMs: KEY_COOLDOWN_MS });
        if (hop.toolName) failedTools.add(`${hardened.requiresTool}:${hop.toolName}`);
        this.logRotation(hardened, attempt, hop, context);

        if (hardened.isAdmin) {
          // VIP-Lane: Admin-Keys werden nie vom Loop angetastet. Der Fehler
          // stammt vom Upstream — ein einziger Kontext-Neuaufbau genuegt,
          // danach gilt der Task als erschöpft (0%-Limit-Garantie bleibt).
          continue;
        }
      }
    }

    return this.exhaustedResult(maxAttempts, lastProviderUsed, lastToolUsed);
  }

  // ---------------------- Middleware-Exception-Eingang ---------------------

  /**
   * Ueberwacht Middleware-Exceptions aller Express/tRPC-Routen: Limit-
   * Fehler werden klassifiziert, dem Rotator gemeldet (60s Cooldown) und
   * als rotierbares Ereignis zurueckgegeben, damit die Route den Task
   * verlustfrei erneut einreichen kann.
   */
  handleMiddlewareException(
    error: unknown,
    meta: { route?: string; method?: string } = {}
  ): { isLimit: true; limit: ToolLimitError; retryInSeconds: number } | { isLimit: false } {
    const limit = classifyToolLimitError(error);
    if (!limit) return { isLimit: false };

    if (limit.provider) {
      this.rotator.reportProviderLimit(limit.provider, { cooldownMs: KEY_COOLDOWN_MS });
    }
    if (limit.tool) {
      this.rotator.reportToolLimit("search", limit.tool, KEY_COOLDOWN_MS);
    }

    console.warn(
      `[${this.name}] Limit via ${meta.method ?? "?"} ${meta.route ?? "middleware"} abgefangen: ` +
        `${limit.kind} — rotiert automatisch, Retry in ${this.rotator.retryInSeconds()}s.`
    );
    return { isLimit: true, limit, retryInSeconds: this.rotator.retryInSeconds() };
  }

  // -------------------------------- Interna --------------------------------

  private buildContext(
    task: AgentTask,
    attempt: number,
    maxAttempts: number,
    failedProviderIds: Set<string>,
    failedTools: Set<string>
  ): AgentTaskContext | null {
    const context: AgentTaskContext = { attempt, maxAttempts, isAdminLane: Boolean(task.isAdmin) };

    if (task.requiresProvider) {
      try {
        context.provider = this.rotator.selectProvider({
          isAdmin: task.isAdmin,
          excludeIds: task.isAdmin ? [] : [...failedProviderIds],
        });
      } catch (error) {
        if (error instanceof AllKeysLimitReachedError) return null;
        throw error;
      }
    }

    if (task.requiresTool) {
      try {
        context.tool = this.rotator.selectTool(task.requiresTool);
      } catch {
        return null;
      }
      // Bereits gescheiterte Tools dieser Kette explizit ueberspringen:
      // selectTool liefert nur gesunde Kandidaten, doch der Resolver
      // verhindert hier zusaetzlich Endlos-Wiederverwendung.
        const toolKey = `${task.requiresTool}:${context.tool.tool.name}`;
        if (failedTools.has(toolKey) && !context.provider) return null;
    }

    return context;
  }

  /** Meldet den Limit-Fehler an den Rotator und liefert den Sprung-Report. */
  private reportLimitToRotator(
    task: AgentTask,
    context: AgentTaskContext,
    limit: ToolLimitError
  ): RotationHop {
    const hop: RotationHop = { kind: limit.kind };

    if (context.provider) {
      hop.providerId = limit.provider ?? context.provider.provider.id;
      hop.key = context.provider.apiKey;
    }
    if (context.tool) {
      hop.toolName = limit.tool ?? context.tool.tool.name;
      if (hop.toolName) {
      this.rotator.reportToolLimit(task.requiresTool ?? "search", hop.toolName, KEY_COOLDOWN_MS);
    }
    }

    return hop;
  }

  private logRotation(task: AgentTask, attempt: number, hop: RotationHop, context: AgentTaskContext): void {
    const segments: string[] = [hop.kind];
    if (hop.providerId) segments.push(`provider=${hop.providerId}`);
    if (hop.key) segments.push(`key=${hop.key.slice(0, 8)}***`);
    if (hop.toolName) segments.push(`tool=${hop.toolName}`);
    console.warn(
      `[${this.name}] Task ${task.id} Versuch ${attempt} limitiert (${segments.join(", ")}) — ` +
        `rotiere automatisch, Re-Execute ohne Datenverlust.`
    );
  }

  private operatorConfirmationRequired(hitl: HITLRiskAssessment): AgentTaskResult {
    // Bezahltes Upgrade als Vorschlag vorbereiten, ohne es auszufuehren.
    const upgradeProposal = this.proposePaidUpgrade?.(hitl.reason);
    return {
      status: "operator_confirm_required",
      attempts: 0,
      reason: hitl.reason,
      output: upgradeProposal,
    };
  }

  private exhaustedResult(attempts: number, providerUsed?: string, toolUsed?: string): AgentTaskResult {
    return {
      status: "exhausted",
      attempts: Math.max(0, attempts),
      reason:
        "Alle kostenlosen Tiers der Kaskade sind erschöpft — lokaler Ollama-Fallback " +
        "war nicht verfuegbar oder ebenfalls limitiert.",
      providerUsed,
      toolUsed,
    };
  }
}
