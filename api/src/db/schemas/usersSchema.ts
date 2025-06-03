import { pgTable, varchar, uuid, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

export const roleEnum = pgEnum('role', ['admin', 'individual', 'organization', 'healthcare']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  cognitoId: varchar('cognito_id', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: roleEnum('role').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const createUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const loginSchema = createInsertSchema(users).pick({
  email: true,
  role: true,
});
