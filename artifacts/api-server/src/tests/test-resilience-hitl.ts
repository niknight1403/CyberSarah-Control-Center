import { KeyRotatorEngine } from '../lib/rotatorEngine';
import { evaluateHITLRisk } from '../middleware/hitlGuard';
import {
  ToolRotatorEngine,
  classifyToolLimitError,
  RATE_LIMIT_COOLDOWN_MS,
} from '../lib/toolRotatorEngine';
import { ToolLimitResolverAgent } from '../agents/specialized/toolLimitResolverAgent';
import { taskExecutionPipeline } from '../pipeline/taskExecutionPipeline';
import { toolLimitErrorMiddleware, trpcToolLimitFormatter } from '../middleware/agentTaskMiddleware';
import type { AgentTask, AgentTaskContext } from '../agents/baseAgent';

// Helper für farbige Terminal-Outputs
let failureCount = 0;
const logPass = (msg: string) => console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
const logFail = (msg: string) => {
  failureCount += 1;
  console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
};
const logInfo = (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`);

async function runTestSuite() {
  console.log('====================================================');
  console.log(' CYBERSARAH RESILIENCE & HITL SECURITY TEST SUITE');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST 1: KEY ROTATION & 429 COOLDOWN HANDLING
  // ----------------------------------------------------
  logInfo('--- TEST 1: Key Rotator Engine & 429 Cooldown ---');

  // Setze Test-Keys in den Prozessumfang
  process.env.GROQ_API_KEYS = 'key_agent_1, key_agent_2';
  process.env.ADMIN_GROQ_KEY = 'key_admin_vip_lane';

  const testRotator = new KeyRotatorEngine();

  try {
    // 1.1 First Key retrieval
    const key1 = testRotator.getKey('groq', false);
    if (key1 === 'key_agent_1') {
      logPass('Agent Key 1 erfolgreich zugewiesen: ' + key1);
    } else {
      logFail('Unerwarteter Key zugewiesen: ' + key1);
    }

    // 1.2 Simuliere 429 Rate Limit auf Key 1
    logInfo('Simuliere HTTP 429 (Rate Limit) auf key_agent_1...');
    testRotator.reportRateLimit('groq', 'key_agent_1', 10000); // 10s Cooldown

    // 1.3 Zweiter Abruf muss automatisch key_agent_2 liefern
    const key2 = testRotator.getKey('groq', false);
    if (key2 === 'key_agent_2') {
      logPass('Rotator hat 429 erkannt und nahtlos auf key_agent_2 geschaltet!');
    } else {
      logFail('Failover auf key_agent_2 fehlgeschlagen. Erhalten: ' + key2);
    }

    // 1.4 Test Admin Lane (Darf niemals vom Cooldown betroffen sein)
    const adminKey = testRotator.getKey('groq', true);
    if (adminKey === 'key_admin_vip_lane') {
      logPass('Admin VIP Lane bypassed Agent-Pool und nutzt reservierten Key.');
    } else {
      logFail('Admin Lane fehlerhaft: ' + adminKey);
    }

    // 1.5 Simuliere Erschöpfung aller Agent-Keys
    logInfo('Simuliere 429 auf key_agent_2...');
    testRotator.reportRateLimit('groq', 'key_agent_2', 10000);

    try {
      testRotator.getKey('groq', false);
      logFail('Sollte Error werfen, wenn alle Agent-Keys im Cooldown sind.');
    } catch (err: any) {
      if (err.message.includes('ALL_KEYS_LIMIT_REACHED')) {
        logPass('Exhaustion Shield gefangen: Triggert jetzt automatischen Fallback zu Together AI / Ollama.');
      } else {
        logFail('Unerwarteter Fehler-Typ bei Key-Erschöpfung: ' + err.message);
      }
    }
  } catch (error: any) {
    logFail('Unerwarteter Fehler in Test 1: ' + error.message);
  }

  console.log('\n----------------------------------------------------');

  // ----------------------------------------------------
  // TEST 2: HUMAN-IN-THE-LOOP (HITL) GUARDRAILS
  // ----------------------------------------------------
  logInfo('--- TEST 2: Human-in-the-Loop (HITL) Safety Barriers ---');

  const testCases = [
    {
      action: 'Auszahlung / Ad-Spend',
      payload: { amount: 15.0 },
      expectedConfirm: false,
      desc: 'Transaktion unter 50,00 € -> Auto-Approve',
    },
    {
      action: 'Auszahlung / Ad-Spend',
      payload: { amount: 120.0 },
      expectedConfirm: true,
      desc: 'Transaktion über 50,00 € (120,00 €) -> HITL Stopp',
    },
    {
      action: 'Database Query',
      payload: { query: 'SELECT * FROM users WHERE active = true' },
      expectedConfirm: false,
      desc: 'Sichere Lese-Abfrage -> Auto-Approve',
    },
    {
      action: 'Database Query',
      payload: { query: 'DROP TABLE user_credentials;' },
      expectedConfirm: true,
      desc: 'Destruktives DROP TABLE SQL -> HITL Stopp',
    },
    {
      action: 'System Call',
      payload: { command: 'sudo reboot now' },
      expectedConfirm: true,
      desc: 'Kritischer Server-Reboot -> HITL Stopp',
    },
  ];

  for (const tc of testCases) {
    const result = evaluateHITLRisk(tc.action, tc.payload);

    if (result.requiresConfirmation === tc.expectedConfirm) {
      logPass(`${tc.desc} => Resultat: ${result.status}`);
    } else {
      logFail(
        `${tc.desc} => FEHLER! Erwartet: Confirmation=${tc.expectedConfirm}, Erhalten: Confirmation=${result.requiresConfirmation}`
      );
    }
  }

  console.log('\n----------------------------------------------------');

  // ----------------------------------------------------
  // TEST 3: TOOL ROTATOR ENGINE (Registry, Kaskade, VIP, Selbstheilung)
  // ----------------------------------------------------
  logInfo('--- TEST 3: Dynamic Tool & Key Rotator Engine ---');

  // Deterministische Kaskade: nur Groq (2 Keys) + Gemini (1 Key) konfiguriert,
  // danach bleibt der lokale Ollama-Tier-3-Fallback (garantiert unbegrenzt).
  const resetCascadeEnv = () => {
    process.env.GROQ_API_KEYS = 'groq_agent_1, groq_agent_2';
    process.env.ADMIN_GROQ_KEY = 'groq_admin_vip';
    process.env.GEMINI_API_KEYS = 'gemini_agent_1';
    for (const name of [
      'CEREBRAS_API_KEYS', 'CEREBRAS_API_KEY',
      'SAMBANOVA_API_KEYS', 'SAMBANOVA_API_KEY',
      'GITHUB_TOKENS', 'GITHUB_TOKEN',
      'OPENROUTER_API_KEYS', 'OPENROUTER_API_KEY',
      'HUGGINGFACE_TOKENS', 'HF_TOKEN',
      'CLOUDFLARE_API_TOKENS', 'CLOUDFLARE_API_TOKEN',
    ]) {
      delete process.env[name];
    }
  };

  try {
    // 3.0 Limit-Fehler-Klassifikation (429 / Quota / Token Limit)
    const classified429 = classifyToolLimitError(Object.assign(new Error('Too Many Requests — rate limit exceeded'), { status: 429 }));
    if (classified429 && classified429.kind === 'rate_limit') {
      logPass('Limit-Klassifikation: HTTP 429 korrekt als rate_limit erkannt.');
    } else {
      logFail('Limit-Klassifikation 429 fehlgeschlagen.');
    }
    const classifiedQuota = classifyToolLimitError(new Error('Insufficient quota: RESOURCE_EXHAUSTED'));
    if (classifiedQuota && classifiedQuota.kind === 'quota_exceeded') {
      logPass('Limit-Klassifikation: Quota Exceeded korrekt als quota_exceeded erkannt.');
    } else {
      logFail('Limit-Klassifikation Quota fehlgeschlagen.');
    }
    const classifiedToken = classifyToolLimitError(new Error('This model has a token limit of 4096'));
    if (classifiedToken && classifiedToken.kind === 'token_limit') {
      logPass('Limit-Klassifikation: Token Limit korrekt als token_limit erkannt.');
    } else {
      logFail('Limit-Klassifikation Token-Limit fehlgeschlagen.');
    }
    if (classifyToolLimitError(new Error('Validation failed: field missing')) === null) {
      logPass('Nicht-Limit-Fehler wird korrekt ignoriert (kein Fehl-Rotating).');
    } else {
      logFail('Nicht-Limit-Fehler wurde fälschlich als Limit klassifiziert.');
    }

    resetCascadeEnv();
    process.env.TAVILY_API_KEYS = 'tavily_agent_1, tavily_agent_2';
    const rotator = new ToolRotatorEngine();

    // 3.1 Tool-Fallback-Kette: Tavily -> DuckDuckGo -> Puppeteer
    const tool1 = rotator.selectTool('search');
    if (tool1.tool.name === 'tavily') {
      logPass('Search-Tool: bevorzugtes Tool (Tavily) ausgewählt.');
    } else {
      logFail('Search-Tool-Auswahl fehlgeschlagen: ' + tool1.tool.name);
    }

    // 3.2 Tool-Limit -> automatischer Wechsel auf DuckDuckGo
    rotator.reportToolLimit('search', 'tavily', 300);
    const tool2 = rotator.selectTool('search');
    if (tool2.tool.name === 'duckduckgo-scrape') {
      logPass('Tool-Limit erkannt: nahtlos auf DuckDuckGo-Scraping geschaltet!');
    } else {
      logFail('Tool-Fallback auf DuckDuckGo fehlgeschlagen. Erhalten: ' + tool2.tool.name);
    }

    // 3.3 Cooldown-Queue & Selbstheilung: STATUS: HEALTHY nach Ablauf
    const sweepEarly = rotator.sweepCooldowns(Date.now() + 100);
    if (sweepEarly.recoveredTools.length === 0) {
      logPass('Cooldown aktiv: Tavily bleibt während der Sperrzeit auf der Bank.');
    } else {
      logFail('Cooldown wurde zu früh freigegeben.');
    }
    const sweepLate = rotator.sweepCooldowns(Date.now() + 301);
    if (sweepLate.recoveredTools.includes('tavily')) {
      const tool3 = rotator.selectTool('search');
      if (tool3.tool.name === 'tavily') {
        logPass('Selbstheilung: Tavily nach Cooldown automatisch wieder STATUS: HEALTHY.');
      } else {
        logFail('Tavily sollte nach Selbstheilung wieder wählbar sein.');
      }
    } else {
      logFail('Automatische Cooldown-Freigabe (STATUS: HEALTHY) fehlgeschlagen.');
    }

    // 3.4 Multi-Tier Kaskade: Key-Rotation -> Provider-Wechsel -> Ollama
    const p1 = rotator.selectProvider();
    if (p1.provider.id === 'groq' && p1.apiKey === 'groq_agent_1') {
      logPass('Kaskade Tier 1: Groq mit erstem Agent-Key ausgewählt.');
    } else {
      logFail('Kaskaden-Start fehlgeschlagen: ' + p1.provider.id + ' / ' + p1.apiKey);
    }

    rotator.reportProviderLimit('groq', { key: 'groq_agent_1', cooldownMs: 300 });
    const p2 = rotator.selectProvider();
    if (p2.provider.id === 'groq' && p2.apiKey === 'groq_agent_2') {
      logPass('HTTP 429 auf Key 1: Round-Robin-Rotation auf groq_agent_2.');
    } else {
      logFail('Key-Rotation fehlgeschlagen: ' + p2.provider.id + ' / ' + p2.apiKey);
    }

    rotator.reportProviderLimit('groq', { key: 'groq_agent_2', cooldownMs: 300 });
    const p3 = rotator.selectProvider();
    if (p3.provider.id === 'gemini' && p3.apiKey === 'gemini_agent_1') {
      logPass('Beide Groq-Keys im Cooldown: Kaskade wechselt zu Gemini 2.5 (Tier 1).');
    } else {
      logFail('Provider-Wechsel zu Gemini fehlgeschlagen: ' + p3.provider.id);
    }

    rotator.reportProviderLimit('gemini', { key: 'gemini_agent_1', cooldownMs: 300 });
    const p4 = rotator.selectProvider();
    if (p4.provider.id === 'ollama' && p4.tier === 3) {
      logPass('Alle Cloud-Tiers erschöpft: lokaler Ollama-Fallback (Tier 3) greift — unbegrenzt.');
    } else {
      logFail('Tier-3-Ollama-Fallback fehlgeschlagen: ' + p4.provider.id);
    }

    // 3.5 VIP Admin Bypass: Admin-Lane trotz vollem Cooldown unberührt
    const adminAssignment = rotator.selectProvider({ isAdmin: true });
    if (adminAssignment.provider.id === 'groq' && adminAssignment.apiKey === 'groq_admin_vip') {
      logPass('VIP Admin Lane: reservierter Admin-Key trotz Cooldown gesichert (0% Limits).');
    } else {
      logFail('VIP Admin Lane fehlerhaft: ' + adminAssignment.provider.id + ' / ' + adminAssignment.apiKey);
    }

    // 3.6 60-Sekunden-Standard-Cooldown dokumentiert
    if (RATE_LIMIT_COOLDOWN_MS === 60_000) {
      logPass('Standard-Cooldown für Limit-Fehler: 60 Sekunden (Autonomous Cooldown Management).');
    } else {
      logFail('Standard-Cooldown weicht von 60s ab.');
    }
  } catch (error: any) {
    logFail('Unerwarteter Fehler in Test 3: ' + error.message);
  }

  console.log('\n----------------------------------------------------');

  // ----------------------------------------------------
  // TEST 4: TOOL LIMIT RESOLVER AGENT (Ende-zu-Ende)
  // ----------------------------------------------------
  logInfo('--- TEST 4: ToolLimitResolverAgent — Auto-Routing & Pipeline ---');

  resetCascadeEnv();

  try {
    // 4.1 Task scheitert auf Groq mit HTTP 429 -> Rotation zu Gemini,
    //     Re-Execute mit identischem Payload (kein Datenverlust).
    const payload = { prompt: 'Analysiere die Umsatzzahlen von Q3', limit: 512 };
    const receivedPayloads: Record<string, unknown>[] = [];
    const task: AgentTask = {
      id: 'task-e2e-429',
      type: 'llm.chat',
      action: 'chat completion',
      payload,
      requiresProvider: true,
      execute: async (context: AgentTaskContext) => {
        receivedPayloads.push({ ...payload });
        if (context.provider?.provider.id === 'groq') {
          throw Object.assign(
            new Error('HTTP 429 Too Many Requests: rate limit exceeded for groq'),
            { status: 429, provider: 'groq' }
          );
        }
        return { content: 'OK von ' + context.provider?.provider.id, model: context.provider?.model };
      },
    };

    const resolverAgent = new ToolLimitResolverAgent(new ToolRotatorEngine());
    const result = await resolverAgent.processTask(task);

    if (
      result.status === 'completed' &&
      result.attempts === 2 &&
      result.providerUsed === 'gemini'
    ) {
      logPass('429 auf Groq abgefangen: Task automatisch auf Gemini rotiert und erfolgreich (Versuch 2).');
    } else {
      logFail(
        `Auto-Rotation fehlgeschlagen: status=${result.status}, attempts=${result.attempts}, provider=${result.providerUsed}`
      );
    }
    if (receivedPayloads.length === 2 && receivedPayloads.every((p) => JSON.stringify(p) === JSON.stringify({ ...payload }))) {
      logPass('Re-Execute ohne Datenverlust: identisches Payload in beiden Versuchen.');
    } else {
      logFail('Payload wurde beim Re-Routing verändert oder unvollständig übergeben.');
    }

    // 4.2 Vollständige Erschöpfung -> lokaler Tier-3-Fallback -> exhausted
    const alwaysLimited: AgentTask = {
      id: 'task-exhaust',
      type: 'llm.chat',
      action: 'chat completion',
      payload: { prompt: 'Retry-Loop-Test' },
      requiresProvider: true,
      execute: async (context: AgentTaskContext) => {
        throw Object.assign(
          new Error('HTTP 429: rate limit exceeded for ' + context.provider?.provider.id),
          { status: 429, provider: context.provider?.provider.id }
        );
      },
    };
    const exhaustedResult = await resolverAgent.processTask(alwaysLimited);
    if (exhaustedResult.status === 'exhausted' && exhaustedResult.attempts >= 3) {
      logPass('Erschöpfungsschutz: alle Tiers inkl. Ollama limitiert -> sauberer Status exhausted.');
    } else {
      logFail(
        `Erschöpfungsverhalten fehlerhaft: status=${exhaustedResult.status}, attempts=${exhaustedResult.attempts}`
      );
    }

    // 4.3 VIP Admin Bypass im Agent: Admin-Task nutzt reservierte Lane
    const adminTask: AgentTask = {
      id: 'task-admin-vip',
      type: 'llm.chat',
      action: 'chat completion',
      payload: { prompt: 'Admin-Anfrage' },
      isAdmin: true,
      requiresProvider: true,
      execute: async (context: AgentTaskContext) => {
        if (!context.isAdminLane || context.provider?.apiKey !== 'groq_admin_vip') {
          throw Object.assign(new Error('VIP-Lane nicht genutzt'), { status: 500 });
        }
        return { content: 'admin-ok', via: context.provider?.provider.id };
      },
    };
    const adminResult = await resolverAgent.processTask(adminTask);
    if (adminResult.status === 'completed' && adminResult.providerUsed === 'groq') {
      logPass('Admin-Task lief vollständig über die reservierte VIP-Lane (isAdminLane=true).');
    } else {
      logFail('Admin-VIP-Lane wurde im Agent nicht genutzt: ' + adminResult.status);
    }

    // 4.4 Middleware-Funnel: 429 aus Express/tRPC wird klassifiziert
    const funnel = resolverAgent.handleMiddlewareException(
      Object.assign(new Error('HTTP 429 Too Many Requests'), { status: 429, provider: 'groq' }),
      { route: '/api/chat', method: 'POST' }
    );
    if (funnel.isLimit && funnel.limit.kind === 'rate_limit') {
      logPass('Middleware-Exception-Funnel: 429 aus Routen korrekt klassifiziert und gemeldet.');
    } else {
      logFail('Middleware-Funnel hat den 429 nicht als Limit erkannt.');
    }

    // 4.5 HITL: Limit-Behebung 100% autonom, Zahlung nur mit Freigabe
    const paidUpgradeAgent = new ToolLimitResolverAgent(new ToolRotatorEngine(), {
      proposePaidUpgrade: (reason) => ({ upgrade: 'premium-tier', reason }),
    });
    const paidResult = await paidUpgradeAgent.processTask({
      id: 'task-hitl-paid',
      type: 'billing.upgrade',
      action: 'Auszahlung / Ad-Spend',
      payload: { amount: 120.0 },
      execute: async () => ({ content: 'sollte nicht ausgeführt werden' }),
    });
    if (paidResult.status === 'operator_confirm_required' && paidResult.reason) {
      logPass('HITL-Integrität: bezahltes Upgrade erfordert OPERATOR_CONFIRM_REQUIRED (kein Auto-Execute).');
    } else {
      logFail('HITL-Gate fehlgeschlagen: ' + paidResult.status);
    }

    // 4.6 Zentrale Pipeline & Express/tRPC-Verdrahtung
    const pipelineResult = await taskExecutionPipeline.submit({
      id: 'task-pipeline',
      type: 'llm.chat',
      action: 'chat completion',
      payload: { prompt: 'Pipeline-Test' },
      requiresProvider: true,
      execute: async (context: AgentTaskContext) => ({
        content: 'pipeline-ok',
        via: context.provider?.provider.id,
        attempt: context.attempt,
      }),
    });
    if (pipelineResult.status === 'completed') {
      logPass('Zentrale Task-Execution-Pipeline: Agent-Task erfolgreich durchgereicht.');
    } else {
      logFail('Pipeline-Ausführung fehlgeschlagen: ' + pipelineResult.status);
    }

    // 4.7 Express-Fehler-Middleware: 429 -> strukturierter Retry-After
    const errorMiddleware = toolLimitErrorMiddleware();
    let responseStatus = 0;
    let responseRetryAfter = '';
    const fakeRes = {
      get statusCode() { return responseStatus; },
      set statusCode(v: number) { responseStatus = v; },
      setHeader: (_n: string, v: string) => { responseRetryAfter = v; },
      json: () => undefined,
    };
    let passedThrough = false;
    errorMiddleware(
      Object.assign(new Error('Too Many Requests'), { status: 429, provider: 'groq' }),
      { method: 'POST', originalUrl: '/api/chat' },
      fakeRes as never,
      () => { passedThrough = true; }
    );
    if (responseStatus === 429 && !passedThrough) {
      logPass(`Express-Fehler-Middleware antwortet 429 mit Retry-After=${responseRetryAfter}s.`);
    } else {
      logFail('Express-Fehler-Middleware hat den 429 nicht korrekt behandelt.');
    }

    // 4.8 Nicht-Limit-Fehler werden an Express next() durchgereicht
    responseStatus = 0;
    let forwarded = false;
    errorMiddleware(
      new Error('Internal validation error'),
      { method: 'POST', originalUrl: '/api/chat' },
      fakeRes as never,
      () => { forwarded = true; }
    );
    if (forwarded && responseStatus !== 429) {
      logPass('Nicht-Limit-Fehler werden korrekt an die nächste Express-Handler durchgereicht.');
    } else {
      logFail('Nicht-Limit-Fehler wurde fälschlich als Limit behandelt.');
    }

    // 4.9 tRPC-Error-Formatter: Limit-Fehler rotierbar formatiert
    const trpcShape = trpcToolLimitFormatter({
      error: Object.assign(new Error('Too Many Requests'), { status: 429, provider: 'groq' }),
      path: 'chat.send',
      shape: { code: -32001, message: 'upstream error', httpStatus: 500 },
    });
    if (
      trpcShape &&
      trpcShape.httpStatus === 429 &&
      trpcShape.data?.code === 'TOOL_LIMIT_REACHED' &&
      typeof trpcShape.data?.retryInSeconds === 'number'
    ) {
      logPass('tRPC-Error-Formatter: Limit-Fehler strukturiert (TOOL_LIMIT_REACHED + Retry-After).');
    } else {
      logFail('tRPC-Formatter liefert kein Limit-Shape: ' + JSON.stringify(trpcShape));
    }
  } catch (error: any) {
    logFail('Unerwarteter Fehler in Test 4: ' + error.message);
  }

  console.log('\n====================================================');
  console.log(' TEST SUITE ABGESCHLOSSEN');
  console.log('====================================================\n');

  if (failureCount === 0) {
    console.log('======================================================================');
    console.log(' [STATUS: GREEN] TOOL LIMIT RESOLVER AGENT & ROTATOR FULLY ONLINE');
    console.log(' - Zero-Limit Admin VIP Lane: SECURED');
    console.log(' - Multi-Provider Free Fallback Cascade: ACTIVE');
    console.log(' - Automated 429 Cooldown & Self-Healing: OPERATIONAL');
    console.log('======================================================================');
    process.exit(0);
  } else {
    console.error('======================================================================');
    console.error(` [STATUS: RED] ${failureCount} TEST(S) FEHLGESCHLAGEN — ROTATOR NICHT FREIGEGEBEN`);
    console.error('======================================================================');
    process.exit(1);
  }
}

runTestSuite().catch((error) => {
  console.error('Schwerer Ausnahmefehler in der Suite:', error);
  process.exit(1);
});
