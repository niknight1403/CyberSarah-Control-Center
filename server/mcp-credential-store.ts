/**
 * Sprint 4 — Persistenz des Credential Vaults.
 *
 * Duenne Drizzle-Schicht ueber `mcp_credentials`. Verschluesselung passiert
 * im Service; hier wird ausschliesslich der bereits verschluesselte String
 * gespeichert. Ein Eintrag je Server (Unique-Index), Rotation ueberschreibt.
 */
import { desc, eq } from "drizzle-orm";

import { mcpCredentials, type InsertMcpCredentialRow, type McpCredentialRow } from "../drizzle/schema";
import { getDb } from "./db";

export type CredentialStore = {
  list(): Promise<McpCredentialRow[]>;
  findByServer(serverKey: string): Promise<McpCredentialRow | null>;
  upsert(row: InsertMcpCredentialRow): Promise<McpCredentialRow>;
  remove(serverKey: string): Promise<boolean>;
  recordUse(serverKey: string, usedAt: Date, error: string | null): Promise<void>;
};

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar — Credential Vault nicht lesbar.");
  return db;
}

export const drizzleCredentialStore: CredentialStore = {
  async list() {
    const db = await requireDb();
    return db.select().from(mcpCredentials).orderBy(desc(mcpCredentials.updatedAt));
  },

  async findByServer(serverKey) {
    const db = await requireDb();
    const [row] = await db.select().from(mcpCredentials).where(eq(mcpCredentials.serverKey, serverKey)).limit(1);
    return row ?? null;
  },

  async upsert(row) {
    const db = await requireDb();
    const [saved] = await db
      .insert(mcpCredentials)
      .values(row)
      .onConflictDoUpdate({
        target: [mcpCredentials.serverKey],
        set: {
          kind: row.kind,
          encryptedPayload: row.encryptedPayload,
          maskedPreview: row.maskedPreview,
          tokenUrl: row.tokenUrl ?? null,
          scopes: row.scopes ?? [],
          lastError: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  },

  async remove(serverKey) {
    const db = await requireDb();
    const deleted = await db.delete(mcpCredentials).where(eq(mcpCredentials.serverKey, serverKey)).returning();
    return deleted.length > 0;
  },

  async recordUse(serverKey, usedAt, error) {
    const db = await requireDb();
    await db
      .update(mcpCredentials)
      .set({ lastUsedAt: usedAt, lastError: error ? error.slice(0, 300) : null })
      .where(eq(mcpCredentials.serverKey, serverKey));
  },
};
