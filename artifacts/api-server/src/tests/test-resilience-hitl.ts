import { KeyRotatorEngine } from '../lib/rotatorEngine';
import { evaluateHITLRisk } from '../middleware/hitlGuard';

// Helper für farbige Terminal-Outputs
const logPass = (msg: string) => console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
const logFail = (msg: string) => console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
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

  console.log('\n====================================================');
  console.log(' TEST SUITE ABGESCHLOSSEN');
  console.log('====================================================');
}

runTestSuite().catch(console.error);
