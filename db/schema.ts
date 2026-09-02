import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull(),
  data: text('data').notNull(),
});
export const snapshots = sqliteTable('snapshots', {
  revision: integer('revision').primaryKey(),
  version: text('version').notNull(),
  date: text('date').notNull(),
  data: text('data').notNull(),
});
