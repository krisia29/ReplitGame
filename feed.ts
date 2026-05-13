import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const feedItemsTable = pgTable("feed_items", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  carName: text("car_name"),
  points: integer("points"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFeedItemSchema = createInsertSchema(feedItemsTable).omit({ id: true, createdAt: true });
export type InsertFeedItem = z.infer<typeof insertFeedItemSchema>;
export type FeedItem = typeof feedItemsTable.$inferSelect;
