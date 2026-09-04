import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { billingSubscriptions, InsertUser, users } from "../drizzle/schema";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "niko.oeben@gmail.com").trim().toLowerCase();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isAdministratorEmail(email: string | null | undefined) {
  return Boolean(email && normalizeEmail(email) === ADMIN_EMAIL);
}

import { ENV } from "./_core/env";

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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
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

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const result = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return result[0];
}

export async function createLocalUser(input: { openId: string; email: string; name?: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const email = normalizeEmail(input.email);
  if (await getUserByEmail(email)) throw new Error("Für diese E-Mail-Adresse existiert bereits ein Konto.");
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
  await db.update(users).set({
    lastSignedIn: new Date(),
    ...(isAdministratorEmail(user.email) ? { role: "admin" as const } : {}),
  }).where(eq(users.id, user.id));
}

export async function setStripeCustomerId(userId: number, stripeCustomerId: string) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  await db.update(users).set({ stripeCustomerId }).where(eq(users.id, userId));
}

export async function getUserByStripeCustomerId(stripeCustomerId: string) {
  const db = await getDb();
  if (!db) throw new Error("Die Kontodatenbank ist nicht verfügbar.");
  const result = await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId)).limit(1);
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
  await db.insert(billingSubscriptions).values(input).onDuplicateKeyUpdate({
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
  const result = await db.select().from(billingSubscriptions).where(eq(billingSubscriptions.userId, userId)).limit(1);
  return result[0];
}

export { ADMIN_EMAIL, isAdministratorEmail };
