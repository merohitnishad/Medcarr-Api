import { relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  uuid,
  timestamp,
  boolean,
  pgEnum,
  text,
  integer,
  index,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { careNeeds, languages, specialities } from "./utilsSchema";
import { reviewHelpfulVotes, reviews } from "./reviewSchema";
import { jobPosts } from "./jobSchema";
import { jobApplications } from "./jobApplicationSchema";
import { notifications } from "./notificationSchema";
import { conversations, messages } from "./messageSchema";
import { disputes } from "./disputeSchema";

export const roleEnum = pgEnum("role", [
  "admin",
  "individual",
  "organization",
  "healthcare",
]);
export const genderEnum = pgEnum("gender", ["male", "female"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  cognitoId: varchar("cognito_id", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: roleEnum("role").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  profileVerified: boolean("profile_verified").default(false).notNull(),
  profileCompleted: boolean("profile_completed").default(false).notNull(),
  dbsVerified: boolean("dbs_verified").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Individual Profile Table
export const individualProfiles = pgTable(
  "individual_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    postcode: varchar("postcode", { length: 20 }).notNull(),
    address: text("address").notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    aboutYou: text("about_you"),
    specialNote: text("special_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (table) => ({
    userIdIdx: index("individual_profiles_user_id_idx").on(table.userId),
  }),
);

// Organization Profile Table
export const organizationProfiles = pgTable(
  "organization_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    organizationName: varchar("organization_name", { length: 255 }).notNull(),
    organizationType: varchar("organization_type", { length: 100 }).notNull(),
    organizationRegistrationNumber: varchar(
      "organization_registration_number",
      { length: 50 },
    )
      .notNull()
      .default("TEMP_REG_NUMBER"), // Add this line
    postcode: varchar("postcode", { length: 20 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    address: text("address").notNull(),
    overview: text("overview"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (table) => ({
    userIdIdx: index("organization_profiles_user_id_idx").on(table.userId),
  }),
);

export const dbsVerificationStatusEnum = pgEnum("dbs_verification_status", [
  "pending",
  "verified",
  "rejected",
]);

// Healthcare Profile Table
export const healthcareProfiles = pgTable(
  "healthcare_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    gender: genderEnum("gender").notNull(),
    professionalTitle: varchar("professional_title", { length: 255 }).notNull(),
    image: varchar("image_url", { length: 500 }),

    dbsFileUrl: varchar("dbs_file_url", { length: 500 }),
    // S3 key for the DBS file (nullable)
    dbsFileKey: varchar("dbs_file_key", { length: 500 }),
    dbsVerificationStatus: dbsVerificationStatusEnum(
      "dbs_verification_status",
    ).default("pending"),
    dbsVerificationDate: timestamp("dbs_verification_date", {
      withTimezone: true,
    }),
    dbsNumber: varchar("dbs_number", { length: 255 }),
    dbsExpiryDate: date("dbs_expiry_date"),
    dbsVerificationNotes: text("dbs_verification_notes"),

    nationality: varchar("nationality", { length: 100 }).notNull(), // added nationality
    postcode: varchar("postcode", { length: 20 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    address: text("address").notNull(),
    professionalSummary: text("professional_summary").notNull(),
    preferredTime: text("preferred_time").array(),
    experience: integer("experience"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (table) => ({
    userIdIdx: index("healthcare_profiles_user_id_idx").on(table.userId),
  }),
);

// Bank Account Details Table (separate for GDPR compliance)
export const healthcareBankDetails = pgTable(
  "healthcare_bank_details",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    healthcareProfileId: uuid("healthcare_profile_id")
      .notNull()
      .references(() => healthcareProfiles.id, { onDelete: "cascade" })
      .unique(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    sortCode: varchar("sort_code", { length: 8 }).notNull(), // UK sort code format: XX-XX-XX
    accountNumber: varchar("account_number", { length: 8 }).notNull(), // UK account number: 8 digits
    bankName: varchar("bank_name", { length: 255 }),
    isVerified: boolean("is_verified").default(false).notNull(),
    encryptionKeyId: varchar("encryption_key_id", { length: 255 }), // For additional encryption if needed
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
  },
  (table) => ({
    healthcareProfileIdIdx: index("healthcare_bank_details_profile_id_idx").on(
      table.healthcareProfileId,
    ),
  }),
);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
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

  jobPosts: many(jobPosts),

  healthcareApplications: many(jobApplications, {
    relationName: "healthcareApplications",
  }),
  cancelledApplications: many(jobApplications, {
    relationName: "cancelledApplications",
  }),
  completedApplications: many(jobApplications, {
    relationName: "completedApplications",
  }),
  userNotifications: many(notifications, {
    relationName: "userNotifications",
  }),
  relatedUserNotifications: many(notifications, {
    relationName: "relatedUserNotifications",
  }),
  jobPosterConversations: many(conversations, {
    relationName: "jobPosterConversations",
  }),
  healthcareConversations: many(conversations, {
    relationName: "healthcareConversations",
  }),
  blockedConversations: many(conversations, {
    relationName: "blockedConversations",
  }),
  sentMessages: many(messages, {
    relationName: "sentMessages",
  }),
  deletedMessages: many(messages, {
    relationName: "deletedMessages",
  }),
  reportedByDisputes: many(disputes, {
    relationName: "reportedByDisputes",
  }),
  reportedAgainstDisputes: many(disputes, {
    relationName: "reportedAgainstDisputes",
  }),
  assignedDisputes: many(disputes, {
    relationName: "assignedDisputes",
  }),
}));

// Junction tables (many-to-many)
export const healthcareProfileSpecialities = pgTable(
  "healthcare_profile_specialities",
  {
    healthcareProfileId: uuid("healthcare_profile_id")
      .notNull()
      .references(() => healthcareProfiles.id, { onDelete: "cascade" }),
    specialityId: uuid("speciality_id")
      .notNull()
      .references(() => specialities.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: index().on(table.healthcareProfileId, table.specialityId), // composite primary key
  }),
);

export const healthcareProfileLanguages = pgTable(
  "healthcare_profile_languages",
  {
    healthcareProfileId: uuid("healthcare_profile_id")
      .notNull()
      .references(() => healthcareProfiles.id, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: index().on(table.healthcareProfileId, table.languageId),
  }),
);

export const individualProfileCareNeeds = pgTable(
  "individual_profile_care_needs",
  {
    individualProfileId: uuid("individual_profile_id")
      .notNull()
      .references(() => individualProfiles.id, { onDelete: "cascade" }),
    careNeedId: uuid("care_need_id")
      .notNull()
      .references(() => careNeeds.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: index().on(table.individualProfileId, table.careNeedId),
  }),
);

export const individualProfileLanguages = pgTable(
  "individual_profile_languages",
  {
    individualProfileId: uuid("individual_profile_id")
      .notNull()
      .references(() => individualProfiles.id, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: index().on(table.individualProfileId, table.languageId),
  }),
);

// Relations - this is what makes your query pattern work
export const individualProfilesRelations = relations(
  individualProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [individualProfiles.userId],
      references: [users.id],
    }),
    // These allow you to use "with" in your queries
    careNeedsRelation: many(individualProfileCareNeeds),
    languagesRelation: many(individualProfileLanguages),
  }),
);

export const healthcareProfilesRelations = relations(
  healthcareProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [healthcareProfiles.userId],
      references: [users.id],
    }),
    specialitiesRelation: many(healthcareProfileSpecialities),
    languagesRelation: many(healthcareProfileLanguages),

    bankDetails: one(healthcareBankDetails, {
      fields: [healthcareProfiles.id],
      references: [healthcareBankDetails.healthcareProfileId],
    }),
    reviews: many(reviews),
  }),
);

// Junction table relations
export const individualProfileCareNeedsRelations = relations(
  individualProfileCareNeeds,
  ({ one }) => ({
    individualProfile: one(individualProfiles, {
      fields: [individualProfileCareNeeds.individualProfileId],
      references: [individualProfiles.id],
    }),
    careNeed: one(careNeeds, {
      fields: [individualProfileCareNeeds.careNeedId],
      references: [careNeeds.id],
    }),
  }),
);

export const individualProfileLanguagesRelations = relations(
  individualProfileLanguages,
  ({ one }) => ({
    individualProfile: one(individualProfiles, {
      fields: [individualProfileLanguages.individualProfileId],
      references: [individualProfiles.id],
    }),
    language: one(languages, {
      fields: [individualProfileLanguages.languageId],
      references: [languages.id],
    }),
  }),
);

export const healthcareProfileSpecialitiesRelations = relations(
  healthcareProfileSpecialities,
  ({ one }) => ({
    healthcareProfile: one(healthcareProfiles, {
      fields: [healthcareProfileSpecialities.healthcareProfileId],
      references: [healthcareProfiles.id],
    }),
    speciality: one(specialities, {
      fields: [healthcareProfileSpecialities.specialityId],
      references: [specialities.id],
    }),
  }),
);

export const healthcareProfileLanguagesRelations = relations(
  healthcareProfileLanguages,
  ({ one }) => ({
    healthcareProfile: one(healthcareProfiles, {
      fields: [healthcareProfileLanguages.healthcareProfileId],
      references: [healthcareProfiles.id],
    }),
    language: one(languages, {
      fields: [healthcareProfileLanguages.languageId],
      references: [languages.id],
    }),
  }),
);

export const healthcareBankDetailsRelations = relations(
  healthcareBankDetails,
  ({ one }) => ({
    healthcareProfile: one(healthcareProfiles, {
      fields: [healthcareBankDetails.healthcareProfileId],
      references: [healthcareProfiles.id],
    }),
  }),
);

export const createUserSchema = createInsertSchema(users).omit({
  id: true,
  cognitoId: true,
  name: true,
  role: true,
  isActive: true,
  isDeleted: true,
});

export const createIndividualProfileSchema = createInsertSchema(
  individualProfiles,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});

export const createOrganizationProfileSchema = createInsertSchema(
  organizationProfiles,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});

export const createHealthcareProfileSchema = createInsertSchema(
  healthcareProfiles,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
});
