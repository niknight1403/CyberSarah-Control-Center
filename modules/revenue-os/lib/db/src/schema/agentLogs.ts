import { pgTable, serial, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { agentsTable } from "./agents";

export const agentLogsTable = pgTable("agent_logs", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agentsTable.id),
  agentName: varchar("agent_name", { length: 255 }).notNull(),
  aktion: varchar("aktion", { length: 255 }).notNull(),
  status: varchar("status", { length: 64 }).notNull(),
  nachricht: text("nachricht").notNull(),
  metadaten: text("metadaten"),
  dauer: integer("dauer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentLogSchema = createInsertSchema(agentLogsTable).omit({ id: true, createdAt: true });
export type InsertAgentLog = z.infer<typeof insertAgentLogSchema>;
export type AgentLog = typeof agentLogsTable.$inferSelect;
