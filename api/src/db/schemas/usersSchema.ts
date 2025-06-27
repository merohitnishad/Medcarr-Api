import { relations } from 'drizzle-orm';
import { pgTable, varchar, uuid, timestamp, boolean, pgEnum, text, integer, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { careNeeds, languages, specialities } from './utilsSchema';

export const roleEnum = pgEnum('role', ['admin', 'individual', 'organization', 'healthcare']);
export const genderEnum = pgEnum("gender", ["male", "female"]);

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
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  aboutYou: text('about_you'),
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
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
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
  dateOfBirth: timestamp('date_of_birth').notNull(),
  gender: genderEnum('gender').notNull(),
  professionalTitle: varchar('professional_title', { length: 255 }).notNull(),
  image: varchar('image_url', { length: 500 }),
  nationality: varchar('nationality', { length: 100 }).notNull(), // added nationality
  postcode: varchar('postcode', { length: 20 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
  address: text('address').notNull(),
  professionalSummary: text('professional_summary').notNull(),
  preferredTime: text('preferred_time').array(),
  experience: integer('experience'),
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