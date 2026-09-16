import { drizzle } from "drizzle-orm/node-postgres";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  modelRouterSettings,
  billingSubscriptions,
  chatMessages,
  InsertChatMessage,
  InsertUser,
  users,
  InsertAgentLearning,
  agentLearnings,
  agentMemoryConsolidations,
  InsertAgentMemoryConsolidation,
  projects,
  InsertProject,
  superAgents,
  InsertSuperAgentRow,
} from "../drizzle/schema";

import { ENV } from "./_core/env";
import { buildSessionOverview, sanitizeSessionId } from "../lib/chat-session-logic";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "niko.oeben@gmail.com")
  .trim()
  .toLowerCase();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isAdministratorEmail(email: string | null | undefined) {
  return Boolean(email && normalizeEmail(email) === ADMIN_EMAIL);
}

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function checkDatabaseHealth() {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.warn(
      "[Database] Readiness probe failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return false;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (isAdministratorEmail(user.email) || user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    } else if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return result[0];
}

export async function createLocalUser(input: {
  openId: string;
  email: string;
  name?: string;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const email = normalizeEmail(input.email);
  if (await getUserByEmail(email))
    throw new Error("Für diese E-Mail-Adresse existiert bereits ein Konto.");
  await db.insert(users).values({
    openId: input.openId,
    email,
    name: input.name?.trim() || null,
    passwordHash: input.passwordHash,
    loginMethod: "password",
    role: isAdministratorEmail(email) ? "admin" : "user",
    lastSignedIn: new Date(),
  });
  const user = await getUserByOpenId(input.openId);
  if (!user) throw new Error("Das neue Konto konnte nicht geladen werden.");
  return user;
}

export async function touchUserSession(openId: string) {
  const db = await getDb();
  if (!db) return;
  const user = await getUserByOpenId(openId);
  if (!user) return;
  await db
    .update(users)
    .set({
      lastSignedIn: new Date(),
      ...(isAdministratorEmail(user.email) ? { role: "admin" as const } : {}),
    })
    .where(eq(users.id, user.id));
}

export async function setStripeCustomerId(
  userId: number,
  stripeCustomerId: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  await db.update(users).set({ stripeCustomerId }).where(eq(users.id, userId));
}

export async function getUserByStripeCustomerId(stripeCustomerId: string) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const result = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return result[0];
}

export async function upsertBillingSubscription(input: {
  userId: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  await db
    .insert(billingSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: billingSubscriptions.stripeSubscriptionId,
      set: {
        stripeCustomerId: input.stripeCustomerId,
        stripePriceId: input.stripePriceId ?? null,
        status: input.status,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
      },
    });
}

export async function getBillingSubscriptionForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const result = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId))
    .limit(1);
  return result[0];
}

// ---------------------------------------------------------------------------
// Sprint 71 — Modell-Router-Persistenz (bevorzugte Reihenfolge, Statuswerte)
// ---------------------------------------------------------------------------

export async function getModelRouterSetting<T>(key: string): Promise<T | null> {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const result = await db
    .select()
    .from(modelRouterSettings)
    .where(eq(modelRouterSettings.key, key))
    .limit(1);
  return (result[0]?.value as T | undefined) ?? null;
}

export async function setModelRouterSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  await db
    .insert(modelRouterSettings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: modelRouterSettings.key,
      set: { value: value as never },
    });
}

export async function ensureAdminAccount(input: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  if (existing) {
    await db
      .update(users)
      .set({
        name: input.name,
        email,
        passwordHash: input.passwordHash,
        loginMethod: "password",
        role: "admin",
        lastSignedIn: new Date(),
      })
      .where(eq(users.id, existing.id));
  } else {
    await db.insert(users).values({
      openId: `local_admin_${crypto.randomUUID()}`,
      email,
      name: input.name,
      passwordHash: input.passwordHash,
      loginMethod: "password",
      role: "admin",
      lastSignedIn: new Date(),
    });
  }
  const saved = await getUserByEmail(email);
  if (!saved)
    throw new Error("Das Admin-Konto konnte nicht verifiziert werden.");
  return saved;
}


/**
 * Sprint 54 — persistierte Entwicklungsauftrags-Chat-Historie.
 * Alle inhaltlichen Regeln (Rollen, Kappung) liegen in
 * lib/chat-history-logic.ts; hier nur der Datenbankzugriff.
 */
export async function insertChatMessage(input: InsertChatMessage) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Chat-Historie nicht speicherbar.");
  const [saved] = await db.insert(chatMessages).values(input).returning();
  return saved;
}

/** Speichert einen kompletten Turn (User-Frage + Antwort) atomar. */
export async function insertChatTurn({
  userOpenId,
  userContent,
  assistantContent,
  provider,
  sessionId,
}: {
  userOpenId: string;
  userContent: string;
  assistantContent: string;
  provider: string | null;
  sessionId?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Chat-Historie nicht speicherbar.");
  const resolvedSessionId = sanitizeSessionId(sessionId);
  const [savedUser, savedAssistant] = await db
    .insert(chatMessages)
    .values([
      { userOpenId, sessionId: resolvedSessionId, role: "user", content: userContent, provider },
      { userOpenId, sessionId: resolvedSessionId, role: "assistant", content: assistantContent, provider },
    ])
    .returning();
  return { userMessage: savedUser, assistantMessage: savedAssistant };
}

/** Neueste Nachrichten eines Nutzers (DESC — Anzeige/Prompt drehen selbst). */
export async function listChatMessages(
  userOpenId: string,
  limit = 100,
  sessionId?: string | null,
) {
  const db = await getDb();
  if (!db) return [];
  const resolvedSessionId = sessionId === undefined ? undefined : sanitizeSessionId(sessionId);
  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      resolvedSessionId === undefined
        ? eq(chatMessages.userOpenId, userOpenId)
        : and(
            eq(chatMessages.userOpenId, userOpenId),
            eq(chatMessages.sessionId, resolvedSessionId),
          ),
    )
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(Math.max(1, Math.min(500, limit)));
  return rows;
}

/** Exakte Zeilenzahlen aller Projekttabellen (Sprint 60) — Basis fuer das
 * Backup-Manifest. Bewusst count(*) je Tabelle statt pg_stat-Approximationen:
 * Ein Manifest muss ohne ANALYZE korrekt sein. Tabellennamen stammen aus
 * information_schema (kein Identifier-Injection-Risiko durch Nutzereingaben). */
export async function tableRowCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const result: Record<string, number> = {};
  for (const row of rows.rows ?? []) {
    const tableName = String(row.table_name);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) continue;
    const counted = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${tableName}"`));
    result[tableName] = Number(counted.rows?.[0]?.n) || 0;
  }
  return result;
}

/** Vollstaendiger Zeilen-Dump aller Projekttabellen (Sprint 120) —
 * Backup-Selbstbedienung. Gleiches sicheres Muster wie tableRowCounts:
 * Identifier kommen ausschliesslich aus information_schema und werden per
 * Regex gegen Injection geprueft; Zeilen-Grenze schuetzt vor Missbrauch. */
export async function dumpProjectTables(maxRowsPerTable = 50_000): Promise<Record<string, unknown[]>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const result: Record<string, unknown[]> = {};
  for (const row of rows.rows ?? []) {
    const tableName = String(row.table_name);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) continue;
    const limit = Math.max(1, Math.min(50_000, maxRowsPerTable));
    const dumped = await db.execute(sql.raw(`SELECT * FROM "${tableName}" LIMIT ${limit}`));
    result[tableName] = (dumped.rows ?? []).map((record) => {
      const normalized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
        if (value instanceof Date) {
          normalized[key] = value.toISOString();
        } else if (value === null || value === undefined) {
          normalized[key] = null;
        } else if (typeof value === "object" && value !== null && "data" in (value as Record<string, unknown>) && Array.isArray((value as Record<string, unknown>).data)) {
          normalized[key] = { base64: Buffer.from((value as { data: number[] }).data).toString("base64") };
        } else {
          normalized[key] = value;
        }
      }
      return normalized;
    });
  }
  return result;
}

/** Sitzungsuebersicht eines Nutzers (Sprint 57) — Logik in lib/chat-session-logic.ts. */
export async function listChatSessions(userOpenId: string, limit = 500) {
  const messages = await listChatMessages(userOpenId, limit);
  const ascending = [...messages].reverse();
  return buildSessionOverview(ascending);
}

export { ADMIN_EMAIL, isAdministratorEmail };

export async function getUserIdForStripeCustomerId(stripeCustomerId: string): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const result = await db
    .select({ userId: billingSubscriptions.userId })
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return result[0]?.userId ?? null;
}

export async function setBillingSubscriptionStatus(stripeSubscriptionId: string, status: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  await db
    .update(billingSubscriptions)
    .set({ status })
    .where(eq(billingSubscriptions.stripeSubscriptionId, stripeSubscriptionId));
}


/**
 * Sprint 94 — Langzeit-Gedächtnis des Agenten (Datenbankzugriff).
 * Reine Regeln (Verdichtung, Ranking) liegen in lib/agent-memory-logic.ts.
 */
export async function insertAgentLearningRecord(input: InsertAgentLearning) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Learning nicht speicherbar.");
  const [saved] = await db.insert(agentLearnings).values(input).returning();
  return saved;
}

/** Letzte Learnings eines Nutzers (Neueste zuerst, gekappt). */
export async function listRecentAgentLearnings(userOpenId: string, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Learnings nicht lesbar.");
  return db
    .select()
    .from(agentLearnings)
    .where(eq(agentLearnings.userOpenId, userOpenId))
    .orderBy(desc(agentLearnings.createdAt), desc(agentLearnings.id))
    .limit(Math.max(1, Math.min(limit, 200)));
}


/* ============================================================
 * Sprint 113 — Memory-Konsolidierung (Datenbankzugriff).
 * Reine Regeln liegen in lib/agent-memory-consolidation-logic.ts.
 * ============================================================ */

/** Gesamten Learning-Bestand fuer die Konsolidierung laden (Neueste zuerst). */
export async function listAllAgentLearningsForConsolidation(limit = 5000) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Konsolidierung nicht moeglich.");
  return db
    .select()
    .from(agentLearnings)
    .orderBy(desc(agentLearnings.createdAt), desc(agentLearnings.id))
    .limit(Math.max(1, Math.min(limit, 20_000)));
}

/** Letzten Konsolidierungslauf liefern (oder null, wenn noch keiner lief). */
export async function getLastMemoryConsolidation() {
  const db = await getDb();
  if (!db) return null;
  const [last] = await db
    .select()
    .from(agentMemoryConsolidations)
    .orderBy(desc(agentMemoryConsolidations.createdAt), desc(agentMemoryConsolidations.id))
    .limit(1);
  return last ?? null;
}

/** Konsolidierungslauf protokollieren. */
export async function insertMemoryConsolidationRecord(input: InsertAgentMemoryConsolidation) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Lauf nicht protokollierbar.");
  const [saved] = await db.insert(agentMemoryConsolidations).values(input).returning();
  return saved;
}

/**
 * Konsolidierungslauf auf die Learnings anwenden: Traeger-Keywords
 * aktualisieren, wegfallende Learnings loeschen. Einzelne Statements
 * pro Plan-Eintrag — idempotent (bereits entfernte IDs schaden nicht).
 */
export async function applyConsolidationPlanWrites(plan: {
  merges: { keepId: number; mergedIds: number[]; mergedKeywords: string }[];
  invalidations: { id: number; reason: string }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Plan nicht anwendbar.");
  let keywordUpdates = 0;
  let deletions = 0;
  for (const merge of plan.merges) {
    const result = await db
      .update(agentLearnings)
      .set({ keywords: merge.mergedKeywords })
      .where(eq(agentLearnings.id, merge.keepId));
    keywordUpdates += 1;
    for (const id of merge.mergedIds) {
      await db.delete(agentLearnings).where(eq(agentLearnings.id, id));
      deletions += 1;
    }
  }
  for (const invalidation of plan.invalidations) {
    await db.delete(agentLearnings).where(eq(agentLearnings.id, invalidation.id));
    deletions += 1;
  }
  return { keywordUpdates, deletions };
}


/* ============================================================
 * Sprint 132 — Projekte-Gedaechtnis (Datenbankzugriff).
 * Reine Validierung/Seed-Daten liegen in lib/projects-logic.ts.
 * ============================================================ */

/** Alle Projekte eines Nutzers, neueste Aktivitaet zuerst. */
export async function listProjectsForUser(userOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Projekte nicht lesbar.");
  return db
    .select()
    .from(projects)
    .where(eq(projects.userOpenId, userOpenId))
    .orderBy(desc(projects.lastActivityAt), desc(projects.id));
}

export async function insertProjectRecord(input: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Projekt nicht speicherbar.");
  const [saved] = await db.insert(projects).values(input).returning();
  return saved;
}

/** Mehrere Projekte in einem Zug anlegen (Erststart-Seed). */
export async function insertProjectRecords(inputs: InsertProject[]) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Projekte nicht speicherbar.");
  if (inputs.length === 0) return [];
  return db.insert(projects).values(inputs).returning();
}

export async function updateProjectRecord(
  id: number,
  userOpenId: string,
  changes: Partial<Pick<InsertProject, "name" | "description" | "repositoryUrl" | "status">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Projekt nicht aktualisierbar.");
  const [saved] = await db
    .update(projects)
    .set({ ...changes, lastActivityAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userOpenId, userOpenId)))
    .returning();
  return saved;
}

export async function deleteProjectRecord(id: number, userOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Projekt nicht loeschbar.");
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userOpenId, userOpenId)));
}

/* ============================================================
 * Sprint 137 — Mehrere Superagenten (Datenbankzugriff).
 * Reine Validierung/Seed-Daten liegen in lib/super-agents-logic.ts.
 * Chatverlauf-Isolation je Agent nutzt die bestehende sessionId-Spalte
 * von chatMessages (siehe listChatMessages/insertChatTurn oben).
 * ============================================================ */

/** Alle Superagenten eines Nutzers, zuletzt aktiv zuerst. */
export async function listSuperAgentsForUser(userOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Superagenten nicht lesbar.");
  return db
    .select()
    .from(superAgents)
    .where(eq(superAgents.userOpenId, userOpenId))
    .orderBy(desc(superAgents.lastActiveAt), desc(superAgents.id));
}

export async function insertSuperAgentRecord(input: InsertSuperAgentRow) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Superagent nicht speicherbar.");
  const [saved] = await db.insert(superAgents).values(input).returning();
  return saved;
}

/** Mehrere Superagenten in einem Zug anlegen (Erststart-Seed des Default-Agenten). */
export async function insertSuperAgentRecords(inputs: InsertSuperAgentRow[]) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Superagenten nicht speicherbar.");
  if (inputs.length === 0) return [];
  return db.insert(superAgents).values(inputs).returning();
}

export async function updateSuperAgentRecord(
  id: number,
  userOpenId: string,
  changes: Partial<Pick<InsertSuperAgentRow, "name" | "purpose" | "color" | "status">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Superagent nicht aktualisierbar.");
  const [saved] = await db
    .update(superAgents)
    .set(changes)
    .where(and(eq(superAgents.id, id), eq(superAgents.userOpenId, userOpenId)))
    .returning();
  return saved;
}

/** Setzt einen Agenten als zuletzt verwendet (fuer "Zuletzt verwendete Agenten"). */
export async function touchSuperAgentLastActive(id: number, userOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Superagent nicht aktualisierbar.");
  const [saved] = await db
    .update(superAgents)
    .set({ lastActiveAt: new Date() })
    .where(and(eq(superAgents.id, id), eq(superAgents.userOpenId, userOpenId)))
    .returning();
  return saved;
}

/** Loescht einen Superagenten dauerhaft. Der Chatverlauf (chatMessages der
 * verknuepften sessionId) bleibt bewusst erhalten — er kann so bei Bedarf
 * einem neuen Agenten erneut zugeordnet werden statt verloren zu gehen. */
export async function deleteSuperAgentRecord(id: number, userOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Superagent nicht loeschbar.");
  await db.delete(superAgents).where(and(eq(superAgents.id, id), eq(superAgents.userOpenId, userOpenId)));
}
