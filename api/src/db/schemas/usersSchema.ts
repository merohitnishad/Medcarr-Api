import { relations } from 'drizzle-orm';
import { pgTable, varchar, uuid, timestamp, boolean, pgEnum, text, integer, index } from 'drizzle-orm/pg-core';
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
  profileVerified: boolean('profile_verified').default(false).notNull(),
  profileCompleted: boolean('profile_completed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Individual Profile Table
export const individualProfiles = pgTable('individual_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  postcode: varchar('postcode', { length: 20 }).notNull(),
  address: text('address').notNull(),
  aboutYou: text('about_you'),
  careNeeds: text('care_needs'),
  languages: text('languages').array(),
  specialNote: text('special_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
}, (table) => ({
  userIdIdx: index('individual_profiles_user_id_idx').on(table.userId),
}));

// Organization Profile Table
export const organizationProfiles = pgTable('organization_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  organizationName: varchar('organization_name', { length: 255 }).notNull(),
  organizationType: varchar('organization_type', { length: 100 }).notNull(),
  postcode: varchar('postcode', { length: 20 }).notNull(),
  address: text('address').notNull(),
  overview: text('overview'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
}, (table) => ({
  userIdIdx: index('organization_profiles_user_id_idx').on(table.userId),
}));

// Healthcare Profile Table
export const healthcareProfiles = pgTable('healthcare_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  image: varchar('image_url', { length: 500 }),
  postcode: varchar('postcode', { length: 20 }).notNull(),
  address: text('address').notNull(),
  professionalSummary: text('professional_summary'),
  preferredTime: text('preferred_time').array(),
  experience: integer('experience'),
  specialities: text('specialities').array(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
}, (table) => ({
  userIdIdx: index('healthcare_profiles_user_id_idx').on(table.userId),
}));

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  individualProfile: one(individualProfiles, {
    fields: [users.id],
    references: [individualProfiles.userId],
  }),
  organizationProfile: one(organizationProfiles, {
    fields: [users.id],
    references: [organizationProfiles.userId],
  }),
  healthcareProfile: one(healthcareProfiles, {
    fields: [users.id],
    references: [healthcareProfiles.userId],
  }),
}));

export const individualProfilesRelations = relations(individualProfiles, ({ one }) => ({
  user: one(users, {
    fields: [individualProfiles.userId],
    references: [users.id],
  }),
}));

export const organizationProfilesRelations = relations(organizationProfiles, ({ one }) => ({
  user: one(users, {
    fields: [organizationProfiles.userId],
    references: [users.id],
  }),
}));

export const healthcareProfilesRelations = relations(healthcareProfiles, ({ one }) => ({
  user: one(users, {
    fields: [healthcareProfiles.userId],
    references: [users.id],
  }),
}));

export const createUserSchema = createInsertSchema(users).omit({
  id: true,
  cognitoId: true,
  name: true,
  role: true,
  isActive: true,
  isDeleted: true,
});

export const createIndividualProfileSchema = createInsertSchema(individualProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});

export const createOrganizationProfileSchema = createInsertSchema(organizationProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});

export const createHealthcareProfileSchema = createInsertSchema(healthcareProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});