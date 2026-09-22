import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const systemConfigTable = pgTable("system_config", {
  id: serial("id").primaryKey(),
  schluessel: text("schluessel").notNull().unique(),
  wert: text("wert"),
  aktiviert: boolean("aktiviert").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});
