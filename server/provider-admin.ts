/**
 * Sprint 154 — Serverseitiger Provider-Admin-Manager.
 *
 * Zustaendig fuer:
 *  - Verschluesselte Key-Ablage (AES-256-GCM aus provider-admin-logic) in der
 *    bestehenden KV-Tabelle (modelRouterSettings) — kein Schema-Migration
 *    noetig, identisches Muster wie der Orchestrator-State-Store.
 *  - In-Memory-Laufzeitcache der entschluesselten Admin-Keys (Chat-Runtime
 *    liest synchron), synchronisiert bei Boot und nach jeder Mutation.
 *  - Explizite Admin-Health-Checks je Provider gegen offizielle, kostenlose
 *    Modell-/Account-Endpunkte (kein Chat-Token-Verbrauch, kein Key im
 *    Klartext in Logs).
 *  - Active/Standby-Rotation mit Health-Check-Gate.
 *  - Persistierte Enable-/Disable-Menge + Ablaufmetadaten + Audit-Events.
 *
 * Sicherheitsregeln: Keys kommen ausschliesslich aus ENV oder autorisierter
 * Admin-Hinterlegung. Es werden nie Voll-Keys geloggt, zurueckgegeben oder
 * an das Frontend uebertragen — nur maskierte Fingerprints und Diagnosen.
 */

import * as db from "./db";
import {
  AUTONOMOUS_ROTATION_MIN_INTERVAL_MS,
  buildAuditEvent,
  classifyProviderFailure,
  decryptSecret,
  decideRotation,
  encryptSecret,
  expiryWarningLevel,
  maskApiKey,
  missingKeyGuidance,
  DIAGNOSIS_LABELS,
  EXPIRY_WARNING_LABELS,
  providerAdminMeta,
  PROVIDER_ADMIN_META,
  nextPoolIndex,
  parseKeyPool,
  parseSecretManagerConfig,
  secretIntegrityHash,
  shouldTriggerAutonomousRotation,
  webhookSecretMatches,
  type ExpiryWarningLevel,
  type ProviderAdminId,
  type ProviderAuditEvent,
  type ProviderKeyDiagnosis,
  type ProviderMatrixRow,
} from "../lib/provider-admin-logic";

// ---------------------------------------------------------------------------
// KV-Store (persistiert ueber die generische Settings-Tabelle)
// ---------------------------------------------------------------------------

const KV_KEYS = {
  /** { providerId: { active: encrypted, previous?: encrypted, graceUntil?: string, integrity: hash } } */
  keyStore: "providerAdmin.keys.v1",
  /** { providerId: { standby: encrypted, stagedAt: string, expiresAt?: string | null } } */
  standby: "providerAdmin.standby.v1",
  /** { providerId: { expiresAt: string | null } } */
  expiry: "providerAdmin.expiry.v1",
  /** string[] von ProviderAdminId */
  disabled: "providerAdmin.disabled.v1",
  /** { providerId: { diagnosis, safeMessage, checkedAt, ok } } */
  lastCheck: "providerAdmin.lastCheck.v1",
  /** ProviderAuditEvent[] (max. 100) */
  events: "providerAdmin.events.v1",
  /** { providerId: number } — aktiver Key-Pool-Index (ENV-Pool) */
  poolIndex: "providerAdmin.poolIndex.v1",
  /** { providerId: string } — letzte autonome Rotation (Drossel) */
  autoRotationAt: "providerAdmin.autoRotationAt.v1",
} as const;

type PoolIndexMap = Partial<Record<ProviderAdminId, number>>;
type AutoRotationAtMap = Partial<Record<ProviderAdminId, string>>;

const HEALTH_CHECK_TIMEOUT_MS = 8_000;
const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h
const MAX_AUDIT_EVENTS = 100;
const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000; // Uebergangsfenster fuer den alten Key

type EncryptedKeyRecord = {
  active: string;
  previous?: string;
  graceUntil?: string;
  integrity: string;
};

type StandbyRecord = {
  standby: string;
  stagedAt: string;
  expiresAt: string | null;
};

type LastCheckRecord = {
  ok: boolean;
  diagnosis: ProviderKeyDiagnosis;
  safeMessage: string;
  checkedAt: string;
};

type KeyStoreMap = Partial<Record<ProviderAdminId, EncryptedKeyRecord>>;
type StandbyMap = Partial<Record<ProviderAdminId, StandbyRecord>>;
type ExpiryMap = Partial<Record<ProviderAdminId, { expiresAt: string | null }>>;
type LastCheckMap = Partial<Record<ProviderAdminId, LastCheckRecord>>;

function encryptionSecret(): string {
  const secret = (process.env.PROVIDER_KEY_ENCRYPTION_SECRET ?? process.env.JWT_SECRET ?? "").trim();
  if (!secret) {
    throw new Error(
      "Kein Server-Secret für die Key-Verschlüsselung verfügbar. Setze JWT_SECRET oder PROVIDER_KEY_ENCRYPTION_SECRET in der Serverumgebung — Key-Hinterlegung bleibt solange deaktiviert.",
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// In-Memory-Laufzeitcache (Chat liest synchron)
// ---------------------------------------------------------------------------

const runtimeKeyCache = new Map<ProviderAdminId, string>();

async function readKv<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await db.getModelRouterSetting<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeKv(key: string, value: unknown): Promise<void> {
  await db.setModelRouterSetting(key, value);
}

async function refreshRuntimeCache(): Promise<void> {
  const store = await readKv<KeyStoreMap>(KV_KEYS.keyStore, {});
  runtimeKeyCache.clear();
  for (const [providerId, record] of Object.entries(store) as [ProviderAdminId, EncryptedKeyRecord][]) {
    try {
      runtimeKeyCache.set(providerId, decryptSecret(record.active, encryptionSecret()));
    } catch {
      // Beschädigter Datensatz: Key wird nicht in die Runtime geladen; ENV gilt weiter.
      console.warn(`[provider-admin] Verschlüsselter Key für ${providerId} konnte nicht geladen werden — ENV-Fallback bleibt aktiv.`);
    }
  }
}

/** Boot-Init (wird in server/_core/index.ts aufgerufen; Best-Effort). */
export async function initProviderAdmin(): Promise<void> {
  await refreshRuntimeCache().catch(() => undefined);
}

/**
 * Laufzeit-Key-Aufloesung fuer die Chat-Runtime: Admin-Hinterlegter Key
 * (verschluesselt gespeichert) hat Vorrang vor ENV, ENV bleibt Fallback.
 * Rein synchron — der Cache wird bei Boot und nach jeder Mutation aktualisiert.
 */
export function getRuntimeApiKey(provider: string): string | undefined {
  const cached = runtimeKeyCache.get(provider as ProviderAdminId);
  return cached?.trim() || undefined;
}

export function isProviderDisabledRuntime(provider: string): boolean {
  // Synchroner Cache siehe disabledCache; hier nur lesender Zugriff.
  return disabledCache.has(provider as ProviderAdminId);
}

const disabledCache = new Set<ProviderAdminId>();

async function refreshDisabledCache(): Promise<void> {
  const disabled = await readKv<ProviderAdminId[]>(KV_KEYS.disabled, []);
  disabledCache.clear();
  for (const id of disabled) disabledCache.add(id);
}

// ---------------------------------------------------------------------------
// ENV-Zugriff (Server-seitig)
// ---------------------------------------------------------------------------

/** ENV-Key-Pool (kommagetrennt) — nur im Server-Speicher, nie geloggt. */
function envPoolFor(meta: { envKeys: readonly string[] }): string[] {
  for (const name of meta.envKeys) {
    const pool = parseKeyPool(process.env[name]);
    if (pool.length > 0) return pool;
  }
  return [];
}

async function fetchRenderEnvValues(config: { token: string; serviceRef: string }): Promise<Record<string, string> | null> {
  try {
    const ref = config.serviceRef;
    const serviceId = ref.startsWith("srv-") ? ref : await (async () => {
      const listResponse = await fetch(`https://api.render.com/v1/services?name=${encodeURIComponent(ref)}`, {
        headers: { accept: "application/json", authorization: `Bearer ${config.token}` },
      });
      if (!listResponse.ok) return null;
      const list = (await listResponse.json()) as { service?: { id?: string } }[];
      return list[0]?.service?.id ?? null;
    })();
    if (!serviceId) return null;
    const response = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
      headers: { accept: "application/json", authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) return null;
    const entries = (await response.json()) as { envVar?: { key?: string; value?: string } }[];
    const result: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.envVar?.key && typeof entry.envVar.value === "string") result[entry.envVar.key] = entry.envVar.value;
    }
    return result;
  } catch {
    return null;
  }
}

function envKeyFor(meta: { envKeys: readonly string[] }): string | undefined {
  for (const name of meta.envKeys) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Health-Check (Phase 3) — offizielle, kostenlose Endpunkte
// ---------------------------------------------------------------------------

async function executeHealthCheck(provider: ProviderAdminId, keyOverride?: string): Promise<LastCheckRecord> {
  const meta = providerAdminMeta(provider);
  const checkedAt = new Date().toISOString();

  if (meta.local || !meta.healthCheck) {
    return { ok: true, diagnosis: "configured", safeMessage: meta.local ? "Lokaler Provider — Status über lokalen Endpunkt ermittelbar." : "Eigener Endpoint — Health-Check über die Chat-Runtime (SSRF-Schutz: nur konfigurierter Base-URL).", checkedAt };
  }

  const apiKey = keyOverride?.trim() || envKeyFor(meta);
  if (!apiKey) {
    const { envVar } = missingKeyGuidance(meta);
    return { ok: false, diagnosis: "missing_key", safeMessage: `Key fehlt — Konfigurationsvariable: ${envVar}.`, checkedAt };
  }

  const { url, auth, provider: probeKind } = meta.healthCheck;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const requestUrl = auth === "query-key" ? `${url}?key=${encodeURIComponent(apiKey)}` : url;
    const headers: Record<string, string> = { accept: "application/json" };
    if (auth === "bearer") headers.authorization = `Bearer ${apiKey}`;
    if (auth === "x-api-key") {
      headers["x-api-key"] = apiKey;
      if (probeKind === "anthropic") headers["anthropic-version"] = "2023-06-01";
    }

    const response = await fetch(requestUrl, { headers, signal: controller.signal });
    if (response.ok) {
      return { ok: true, diagnosis: "healthy", safeMessage: `Health-Check erfolgreich (HTTP ${response.status}).`, checkedAt };
    }
    const bodyText = await response.text().catch(() => null);
    const { diagnosis, safeMessage } = classifyProviderFailure({ status: response.status, bodyText });
    return { ok: false, diagnosis, safeMessage, checkedAt };
  } catch (error) {
    const { diagnosis, safeMessage } = classifyProviderFailure({ errorText: error instanceof Error ? error.message : String(error) });
    return { ok: false, diagnosis, safeMessage, checkedAt };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Admin-Operationen (Phase 3/4/5/6/8)
// ---------------------------------------------------------------------------

async function appendAuditEvent(event: ProviderAuditEvent): Promise<void> {
  const events = await readKv<ProviderAuditEvent[]>(KV_KEYS.events, []);
  const next = [event, ...events].slice(0, MAX_AUDIT_EVENTS);
  await writeKv(KV_KEYS.events, next);
}

export async function getProviderMatrix(): Promise<ProviderMatrixRow[]> {
  const [keyStore, standby, expiry, disabled, lastCheck] = await Promise.all([
    readKv<KeyStoreMap>(KV_KEYS.keyStore, {}),
    readKv<StandbyMap>(KV_KEYS.standby, {}),
    readKv<ExpiryMap>(KV_KEYS.expiry, {}),
    readKv<ProviderAdminId[]>(KV_KEYS.disabled, []),
    readKv<LastCheckMap>(KV_KEYS.lastCheck, {}),
  ]);
  const disabledSet = new Set(disabled);

  return PROVIDER_ADMIN_META.map((meta, index) => {
    const storedKey = keyStore[meta.id];
    const envKey = envKeyFor(meta);
    const hasKey = Boolean(storedKey?.active || envKey);
    const expiresAt = expiry[meta.id]?.expiresAt ?? null;
    const check = lastCheck[meta.id];
    const warning: ExpiryWarningLevel = expiryWarningLevel(expiresAt);
    const rawKey = storedKey?.active ? decryptSilently(storedKey.active) : envKey ?? null;

    const diagnosis: ProviderKeyDiagnosis = disabledSet.has(meta.id)
      ? "disabled"
      : check?.ok
        ? "healthy"
        : check
          ? check.diagnosis
          : hasKey
            ? "configured"
            : "missing_key";

    return {
      id: meta.id,
      label: meta.label,
      model: meta.defaultModelEnv ? process.env[meta.defaultModelEnv]?.trim() || null : null,
      envVar: meta.envKeys[0] ?? null,
      local: meta.local,
      keySource: storedKey?.active ? "admin_store" : envKey ? "env" : "none",
      maskedKey: rawKey ? maskApiKey(rawKey) : null,
      diagnosis,
      diagnosisLabel: DIAGNOSIS_LABELS[diagnosis],
      lastCheckedAt: check?.checkedAt ?? null,
      lastSafeError: check && !check.ok ? check.safeMessage : null,
      expiresAt,
      expiryWarning: warning,
      expiryLabel: EXPIRY_WARNING_LABELS[warning],
      disabled: disabledSet.has(meta.id),
      nextCheckAt: check ? new Date(Date.parse(check.checkedAt) + DEFAULT_CHECK_INTERVAL_MS).toISOString() : null,
      standbyStaged: Boolean(standby[meta.id]),
      fallbackRank: hasKey && !disabledSet.has(meta.id) ? index + 1 : null,
      requests24h: null,
      failures24h: null,
      avgLatencyMs: null,
    };
  });
}

function decryptSilently(payload: string): string | null {
  try {
    return decryptSecret(payload, encryptionSecret());
  } catch {
    return null;
  }
}

export async function runHealthCheck(provider: ProviderAdminId): Promise<LastCheckRecord> {
  const meta = providerAdminMeta(provider);
  if (!meta.healthCheck && !meta.local) {
    const record: LastCheckRecord = { ok: true, diagnosis: "configured", safeMessage: `${meta.label} — kein direkter Health-Check-Endpunkt (SSRF-Schutz: nur konfigurierter Base-URL).`, checkedAt: new Date().toISOString() };
    return record;
  }
  const result = await executeHealthCheck(provider);
  const lastCheck = await readKv<LastCheckMap>(KV_KEYS.lastCheck, {});
  lastCheck[provider] = result;
  await writeKv(KV_KEYS.lastCheck, lastCheck);
  await appendAuditEvent(buildAuditEvent({
    kind: "health_check_run",
    provider,
    detail: `${meta.label}: ${result.ok ? "erfolgreich" : result.safeMessage}`,
  }));
  // Sprint 155: Bei Key-Fehlern (ungueltig/abgelaufen/widerrufen/Rate-Limit/
  // Quota) feuert die autonome Rotations-Pipeline still im Hintergrund.
  if (!result.ok && shouldTriggerAutonomousRotation(result.diagnosis)) {
    void autonomousKeyRecovery(provider).catch(() => undefined);
  }
  return result;
}

export async function runHealthCheckAll(): Promise<Record<string, LastCheckRecord>> {
  const results: Record<string, LastCheckRecord> = {};
  for (const meta of PROVIDER_ADMIN_META) {
    // Sequentiell und bewusst gedrosselt: keine aggressive Check-Schleife.
    results[meta.id] = await runHealthCheck(meta.id);
  }
  return results;
}

export async function setProviderDisabled(provider: ProviderAdminId, disabled: boolean): Promise<void> {
  const meta = providerAdminMeta(provider);
  const list = await readKv<ProviderAdminId[]>(KV_KEYS.disabled, []);
  const next = disabled ? Array.from(new Set([...list, provider])) : list.filter((id) => id !== provider);
  await writeKv(KV_KEYS.disabled, next);
  await refreshDisabledCache();
  await appendAuditEvent(buildAuditEvent({
    kind: disabled ? "provider_disabled" : "provider_enabled",
    provider,
    detail: `${meta.label} ${disabled ? "deaktiviert" : "reaktiviert"} — Routing ${
      disabled ? "überspringt den Provider" : "nimmt den Provider wieder auf"
    }.`,
  }));
}

/**
 * Standby-Key hinterlegen (Phase 5): verschlüsselt speichern, NICHT aktivieren,
 * aktiven Key unberührt lassen. Kein Voll-Key in Logs oder Rückgabe.
 */
export async function stageStandbyKey(input: {
  provider: ProviderAdminId;
  apiKey: string;
  expiresAt?: string | null;
}): Promise<{ stagedAt: string; maskedKey: string; guidance: string }> {
  const meta = providerAdminMeta(input.provider);
  const trimmed = input.apiKey.trim();
  if (!trimmed || trimmed.length < 8) {
    throw new Error("Der hinterlegte Key ist zu kurz oder leer — Hinterlegung abgelehnt.");
  }
  const secret = encryptionSecret();
  const standby: StandbyMap = await readKv<StandbyMap>(KV_KEYS.standby, {});
  const stagedAt = new Date().toISOString();
  standby[input.provider] = {
    standby: encryptSecret(trimmed, secret),
    stagedAt,
    expiresAt: input.expiresAt?.trim() || null,
  };
  await writeKv(KV_KEYS.standby, standby);

  // Ablaufdatum uebernehmen (gilt fuer den Provider-Status).
  const expiry: ExpiryMap = await readKv<ExpiryMap>(KV_KEYS.expiry, {});
  expiry[input.provider] = { expiresAt: input.expiresAt?.trim() || null };
  await writeKv(KV_KEYS.expiry, expiry);

  await appendAuditEvent(buildAuditEvent({
    kind: "key_staged",
    provider: input.provider,
    detail: `${meta.label}: neuer Standby-Key hinterlegt (${maskApiKey(trimmed)}), noch nicht aktiv.`,
  }));

  return {
    stagedAt,
    maskedKey: maskApiKey(trimmed),
    guidance: "Standby-Key verschlüsselt hinterlegt. Starte jetzt die Rotation: Er wird zuerst per Health-Check geprüft und erst nach Erfolg aktiviert.",
  };
}

/**
 * Rotation ausfuehren (Phase 5): Health-Check gegen den Standby-Key; nur bei
 * Erfolg Promotion. Misserfolg laesst den aktiven Key unveraendert.
 */
export async function rotateProviderKey(provider: ProviderAdminId): Promise<{
  promoted: boolean;
  safeMessage: string;
  maskedKey: string | null;
}> {
  const meta = providerAdminMeta(provider);
  await appendAuditEvent(buildAuditEvent({ kind: "rotation_started", provider, detail: `${meta.label}: Rotation gestartet.` }));

  const standbyMap = await readKv<StandbyMap>(KV_KEYS.standby, {});
  const standbyRecord = standbyMap[provider];
  if (!standbyRecord) {
    return { promoted: false, safeMessage: "Kein Standby-Key hinterlegt — bitte zuerst einen neuen Key sicher hinterlegen.", maskedKey: null };
  }
  const secret = encryptionSecret();
  let standbyKey: string;
  try {
    standbyKey = decryptSecret(standbyRecord.standby, secret);
  } catch {
    await appendAuditEvent(buildAuditEvent({ kind: "rotation_failed", provider, detail: `${meta.label}: Standby-Key konnte nicht entschlüsselt werden — aktiver Key bleibt aktiv.` }));
    return { promoted: false, safeMessage: "Standby-Key konnte nicht entschlüsselt werden (Datensatz beschädigt). Der aktive Key bleibt unverändert.", maskedKey: null };
  }

  // Health-Check NUR gegen den Standby-Key — der aktive Key wird nicht angefasst.
  const check = await executeHealthCheck(provider, standbyKey);
  const decision = decideRotation({ ok: check.ok, diagnosis: check.diagnosis });

  if (decision.action === "keep_active") {
    await appendAuditEvent(buildAuditEvent({ kind: "rotation_failed", provider, detail: `${meta.label}: ${decision.reason}` }));
    return { promoted: false, safeMessage: decision.reason, maskedKey: maskApiKey(standbyKey) };
  }

  // Promotion: alten aktiven Key ins Uebergangsfenster, Standby wird aktiv.
  const keyStore = await readKv<KeyStoreMap>(KV_KEYS.keyStore, {});
  const current = keyStore[provider];
  const integrityHash = secretIntegrityHash(standbyKey);
  keyStore[provider] = {
    active: encryptSecret(standbyKey, secret),
    previous: current?.active,
    graceUntil: new Date(Date.now() + ROTATION_GRACE_MS).toISOString(),
    integrity: integrityHash,
  };
  await writeKv(KV_KEYS.keyStore, keyStore);

  delete standbyMap[provider];
  await writeKv(KV_KEYS.standby, standbyMap);

  const lastCheck = await readKv<LastCheckMap>(KV_KEYS.lastCheck, {});
  lastCheck[provider] = check;
  await writeKv(KV_KEYS.lastCheck, lastCheck);

  await refreshRuntimeCache();

  await appendAuditEvent(buildAuditEvent({
    kind: "rotation_succeeded",
    provider,
    detail: `${meta.label}: Rotation erfolgreich — neuer Key aktiv (${maskApiKey(standbyKey)}), alter Key im ${Math.round(ROTATION_GRACE_MS / 3600000)}-h-Übergangsfenster.`,
  }));

  return {
    promoted: true,
    safeMessage: "Rotation erfolgreich: Der neue Key ist aktiv, der alte läuft im Übergangsfenster aus. Auf Render-Umgebungen kannst du den ENV-Key zusätzlich aktualisieren (optional, für Konsistenz nach Neustart ohne KV-Store).",
    maskedKey: maskApiKey(standbyKey),
  };
}

export async function listAuditEvents(): Promise<ProviderAuditEvent[]> {
  return readKv<ProviderAuditEvent[]>(KV_KEYS.events, []);
}


// ---------------------------------------------------------------------------
// Autonome Key-Recovery (Sprint 155)
// ---------------------------------------------------------------------------

const RECOVERY_CANDIDATE_KINDS = ["env_pool", "secret_manager"] as const;

/**
 * Autonome Rotations-Pipeline (Spec Phase 3): Markiert den gescheiterten
 * Key, zieht still Kandidaten (ENV-Pool -> Secret-Manager-Refetch) und
 * aktiviert den ersten Kandidaten, der den leisen Health-Check besteht.
 * Bei Misserfolg bleibt alles unveraendert; die Chat-Runtime faellt auf
 * den naechsten Provider zurueck (Failover-Loop).
 *
 * Nie im Spiel: erfundene Keys, Client-Bundles, Logs mit Voll-Keys.
 */
export async function autonomousKeyRecovery(provider: ProviderAdminId): Promise<{
  recovered: boolean;
  safeMessage: string;
  source: (typeof RECOVERY_CANDIDATE_KINDS)[number] | "none";
}> {
  const meta = providerAdminMeta(provider);

  // Drossel: maximal eine autonome Rotation je Intervall und Provider.
  const autoRotationAt = await readKv<AutoRotationAtMap>(KV_KEYS.autoRotationAt, {});
  const lastAt = autoRotationAt[provider] ? Date.parse(autoRotationAt[provider]!) : 0;
  if (Date.now() - lastAt < AUTONOMOUS_ROTATION_MIN_INTERVAL_MS) {
    return { recovered: false, safeMessage: "Autonome Rotation kürzlich ausgeführt — Drosselung aktiv.", source: "none" };
  }
  autoRotationAt[provider] = new Date().toISOString();
  await writeKv(KV_KEYS.autoRotationAt, autoRotationAt);

  const pool = envPoolFor(meta);
  const poolIndexMap = await readKv<PoolIndexMap>(KV_KEYS.poolIndex, {});
  const currentPoolIndex = poolIndexMap[provider] ?? 0;

  // Kandidat 1: naechster Key aus dem ENV-Pool (Ring).
  const candidates: { source: (typeof RECOVERY_CANDIDATE_KINDS)[number]; key: string }[] = [];
  if (pool.length > 1) {
    const nextIndex = nextPoolIndex(currentPoolIndex, pool.length);
    candidates.push({ source: "env_pool", key: pool[nextIndex] });
    poolIndexMap[provider] = nextIndex;
    await writeKv(KV_KEYS.poolIndex, poolIndexMap);
  }

  // Kandidat 2: autorisierter Secret-Manager (Render-ENV-Refetch). Ohne
  // Konfiguration wird ehrlich gemeldet — keine Beschaffung aus unautorisierten
  // Quellen, keine erfundenen Keys.
  const secretConfig = parseSecretManagerConfig(process.env as Record<string, string | undefined>);
  if (secretConfig?.type === "render") {
    const values = await fetchRenderEnvValues({ token: secretConfig.token, serviceRef: secretConfig.serviceRef });
    const fetchedKey = values ? (meta.envKeys.map((name) => values[name]).find((value) => value?.trim()) ?? null) : null;
    if (fetchedKey?.trim() && !candidates.some((candidate) => candidate.key === fetchedKey.trim())) {
      candidates.push({ source: "secret_manager", key: fetchedKey.trim() });
    }
  } else if (!secretConfig && !meta.local) {
    await appendAuditEvent(buildAuditEvent({
      kind: "rotation_failed",
      provider,
      detail: `${meta.label}: keine autorisierte Secret-Manager-Konfiguration (SECRET_MANAGER_TYPE/SECRET_MANAGER_API_TOKEN fehlen) — autonome Beschaffung deaktiviert, aktiver Key bleibt unverändert.`,
    }));
  }

  if (candidates.length === 0) {
    return {
      recovered: false,
      safeMessage: `Kein Reserve-Key verfügbar: ENV-Key-Pool für ${meta.label} hat ${
        pool.length > 1 ? "" : "nur "
      }${pool.length} Key(s)${
        secretConfig ? "" : " und kein autorisierter Secret-Manager ist konfiguriert"
      }. Bitte einen neuen Key sicher hinterlegen (Admin-Bereich oder ${meta.envKeys[0] ?? "ENV"}) — der aktive Key bleibt unverändert.`,
      source: "none",
    };
  }

  for (const candidate of candidates) {
    const check = await executeHealthCheck(provider, candidate.key);
    if (check.ok) {
      runtimeKeyCache.set(provider, candidate.key);
      const lastCheck = await readKv<LastCheckMap>(KV_KEYS.lastCheck, {});
      lastCheck[provider] = check;
      await writeKv(KV_KEYS.lastCheck, lastCheck);
      await appendAuditEvent(buildAuditEvent({
        kind: "rotation_succeeded",
        provider,
        detail: `${meta.label}: autonome Rotation erfolgreich — neuer Key aktiv (${maskApiKey(candidate.key)}, Quelle: ${candidate.source === "env_pool" ? "ENV-Key-Pool" : "Secret-Manager"}).`,
      }));
      return { recovered: true, safeMessage: `Autonome Rotation erfolgreich: ${meta.label} läuft wieder mit einem geprüften Key (${candidate.source === "env_pool" ? "ENV-Key-Pool" : "Secret-Manager-Refetch"}).`, source: candidate.source };
    }
  }

  await appendAuditEvent(buildAuditEvent({
    kind: "rotation_failed",
    provider,
    detail: `${meta.label}: autonome Rotation fehlgeschlagen — alle Reserve-Kandidaten (${candidates.map((c) => c.source).join(", ")}) haben den Health-Check nicht bestanden. Aktiver Key bleibt unverändert; Chat wechselt auf Fallback-Provider.`,
  }));
  return {
    recovered: false,
    safeMessage: `Autonome Rotation für ${meta.label} fehlgeschlagen — kein Reserve-Kandidat gültig. Die Anfrage läuft über den Fallback-Provider weiter.`,
    source: "none",
  };
}

/** Rotations-Webhook (autorisiert durch PROVIDER_ROTATION_WEBHOOK_SECRET). */
export async function handleRotationWebhook(input: {
  provider: ProviderAdminId;
  apiKey: string;
  expiresAt?: string | null;
  providedSecret: string | undefined;
}): Promise<{ ok: boolean; status: number; maskedKey: string | null; safeMessage: string }> {
  const expected = (process.env.PROVIDER_ROTATION_WEBHOOK_SECRET ?? "").trim();
  if (!expected) {
    return { ok: false, status: 503, maskedKey: null, safeMessage: "Rotations-Webhook ist nicht konfiguriert (PROVIDER_ROTATION_WEBHOOK_SECRET fehlt) — Aktion abgelehnt." };
  }
  if (!webhookSecretMatches(input.providedSecret, expected)) {
    return { ok: false, status: 401, maskedKey: null, safeMessage: "Webhook-Authentifizierung fehlgeschlagen." };
  }
  try {
    const staged = await stageStandbyKey({ provider: input.provider, apiKey: input.apiKey, expiresAt: input.expiresAt ?? null });
    const rotation = await rotateProviderKey(input.provider);
    return { ok: rotation.promoted, status: rotation.promoted ? 200 : 422, maskedKey: rotation.maskedKey ?? staged.maskedKey, safeMessage: rotation.safeMessage };
  } catch (error) {
    return { ok: false, status: 400, maskedKey: null, safeMessage: error instanceof Error ? error.message.slice(0, 200) : "Ungültige Webhook-Nutzlast." };
  }
}
