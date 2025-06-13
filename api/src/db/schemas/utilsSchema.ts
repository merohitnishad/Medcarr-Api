import { pgTable, uuid, varchar, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { healthcareProfiles, individualProfiles, users } from './usersSchema';

// Simple utility tables
export const specialities = pgTable('specialities', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const careNeeds = pgTable('care_needs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const languages = pgTable('languages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Junction tables (many-to-many)
export const healthcareProfileSpecialities = pgTable('healthcare_profile_specialities', {
  healthcareProfileId: uuid('healthcare_profile_id').notNull().references(() => healthcareProfiles.id, { onDelete: 'cascade' }),
  specialityId: uuid('speciality_id').notNull().references(() => specialities.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: index().on(table.healthcareProfileId, table.specialityId), // composite primary key
}));

export const healthcareProfileLanguages = pgTable('healthcare_profile_languages', {
  healthcareProfileId: uuid('healthcare_profile_id').notNull().references(() => healthcareProfiles.id, { onDelete: 'cascade' }),
  languageId: uuid('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: index().on(table.healthcareProfileId, table.languageId),
}));

export const individualProfileCareNeeds = pgTable('individual_profile_care_needs', {
  individualProfileId: uuid('individual_profile_id').notNull().references(() => individualProfiles.id, { onDelete: 'cascade' }),
  careNeedId: uuid('care_need_id').notNull().references(() => careNeeds.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: index().on(table.individualProfileId, table.careNeedId),
}));

export const individualProfileLanguages = pgTable('individual_profile_languages', {
  individualProfileId: uuid('individual_profile_id').notNull().references(() => individualProfiles.id, { onDelete: 'cascade' }),
  languageId: uuid('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: index().on(table.individualProfileId, table.languageId),
}));

// Relations - this is what makes your query pattern work
export const individualProfilesRelations = relations(individualProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [individualProfiles.userId],
    references: [users.id],
  }),
  // These allow you to use "with" in your queries
  careNeedsRelation: many(individualProfileCareNeeds),
  languagesRelation: many(individualProfileLanguages),
}));

export const healthcareProfilesRelations = relations(healthcareProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [healthcareProfiles.userId],
    references: [users.id],
  }),
  specialitiesRelation: many(healthcareProfileSpecialities),
  languagesRelation: many(healthcareProfileLanguages),
}));

// Junction table relations
export const individualProfileCareNeedsRelations = relations(individualProfileCareNeeds, ({ one }) => ({
  individualProfile: one(individualProfiles, {
    fields: [individualProfileCareNeeds.individualProfileId],
    references: [individualProfiles.id],
  }),
  careNeed: one(careNeeds, {
    fields: [individualProfileCareNeeds.careNeedId],
    references: [careNeeds.id],
  }),
}));

export const individualProfileLanguagesRelations = relations(individualProfileLanguages, ({ one }) => ({
  individualProfile: one(individualProfiles, {
    fields: [individualProfileLanguages.individualProfileId],
    references: [individualProfiles.id],
  }),
  language: one(languages, {
    fields: [individualProfileLanguages.languageId],
    references: [languages.id],
  }),
}));

export const healthcareProfileSpecialitiesRelations = relations(healthcareProfileSpecialities, ({ one }) => ({
  healthcareProfile: one(healthcareProfiles, {
    fields: [healthcareProfileSpecialities.healthcareProfileId],
    references: [healthcareProfiles.id],
  }),
  speciality: one(specialities, {
    fields: [healthcareProfileSpecialities.specialityId],
    references: [specialities.id],
  }),
}));

export const healthcareProfileLanguagesRelations = relations(healthcareProfileLanguages, ({ one }) => ({
  healthcareProfile: one(healthcareProfiles, {
    fields: [healthcareProfileLanguages.healthcareProfileId],
    references: [healthcareProfiles.id],
  }),
  language: one(languages, {
    fields: [healthcareProfileLanguages.languageId],
    references: [languages.id],
  }),
}));