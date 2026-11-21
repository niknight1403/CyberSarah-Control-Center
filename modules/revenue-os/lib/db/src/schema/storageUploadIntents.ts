import { pgTable, serial, varchar, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

/**
 * Durable server-to-server upload intents. The principal is a service identity,
 * service principals may have no user owner; browser/session uploads bind to a
 * verified user ID and, when selected, a verified tenant membership.
 */
export const storageUploadIntentsTable = pgTable("storage_upload_intents", {
  id: serial("id").primaryKey(),
  objectPath: varchar("object_path", { length: 512 }).notNull(),
  principal: varchar("principal", { length: 128 }).notNull(),
  ownerUserId: integer("owner_user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  declaredContentType: varchar("declared_content_type", { length: 80 }).notNull(),
  declaredSize: integer("declared_size").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("storage_upload_intents_object_path_idx").on(table.objectPath),
  index("storage_upload_intents_expiry_idx").on(table.status, table.expiresAt),
]);

export type StorageUploadIntent = typeof storageUploadIntentsTable.$inferSelect;
