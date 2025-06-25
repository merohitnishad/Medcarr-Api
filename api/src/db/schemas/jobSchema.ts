import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  index,
  text,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { careNeeds, languages, preferences } from "./utilsSchema"; // Import from your existing files
import {
  users,
  individualProfiles,
  organizationProfiles,
  healthcareProfiles,
} from "./usersSchema";

// Enums for job post
export const jobTypeEnum = pgEnum("job_type", ["oneDay", "weekly"]);
export const paymentTypeEnum = pgEnum("payment_type", ["hourly", "fixed"]);
export const genderEnum = pgEnum("gender", ["male", "female"]);
export const caregiverGenderEnum = pgEnum("caregiver_gender", [
  "male",
  "female",
]);
export const jobStatus = pgEnum("job_status", [
  "open",
  "closed",
  "approved",
  "completed",
  "cancelled",
]);

// Job Posts Table
export const jobPosts = pgTable(
  "job_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    age: integer("age").notNull(),
    status: jobStatus("status").default("open").notNull(),
    relationship: varchar("relationship", { length: 100 }),
    gender: genderEnum("gender").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    postcode: varchar("postcode", { length: 20 }).notNull(),
    address: text("address").notNull(),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    shiftLength: integer("shift_length").notNull(), // in hours
    overview: text("overview").notNull(),
    caregiverGender: caregiverGenderEnum("caregiver_gender").notNull(),
    type: jobTypeEnum("type").notNull(),
    startWeek: timestamp("start_week"),
    endWeek: timestamp("end_week"),
    recurringWeekday: text("recurring_weekday").array(), // ['monday', 'tuesday', etc.]
    paymentType: paymentTypeEnum("payment_type").notNull(),
    paymentCost: integer("payment_cost").notNull(), // in cents to avoid decimal issues
    isActive: boolean("is_active").default(true).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("job_posts_user_id_idx").on(table.userId),
    postcodeIdx: index("job_posts_postcode_idx").on(table.postcode),
    typeIdx: index("job_posts_type_idx").on(table.type),
    startTimeIdx: index("job_posts_start_time_idx").on(table.startTime),
  })
);

// Junction Tables for Many-to-Many relationships
export const jobPostCareNeeds = pgTable(
  "job_post_care_needs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobPostId: uuid("job_post_id")
      .notNull()
      .references(() => jobPosts.id, { onDelete: "cascade" }),
    careNeedId: uuid("care_need_id")
      .notNull()
      .references(() => careNeeds.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    jobPostIdIdx: index("job_post_care_needs_job_post_id_idx").on(
      table.jobPostId
    ),
    careNeedIdIdx: index("job_post_care_needs_care_need_id_idx").on(
      table.careNeedId
    ),
    // Unique constraint to prevent duplicate entries
    uniqueJobPostCareNeed: index("unique_job_post_care_need").on(
      table.jobPostId,
      table.careNeedId
    ),
  })
);

export const jobPostLanguages = pgTable(
  "job_post_languages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobPostId: uuid("job_post_id")
      .notNull()
      .references(() => jobPosts.id, { onDelete: "cascade" }),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    jobPostIdIdx: index("job_post_languages_job_post_id_idx").on(
      table.jobPostId
    ),
    languageIdIdx: index("job_post_languages_language_id_idx").on(
      table.languageId
    ),
    // Unique constraint to prevent duplicate entries
    uniqueJobPostLanguage: index("unique_job_post_language").on(
      table.jobPostId,
      table.languageId
    ),
  })
);

export const jobPostPreferences = pgTable(
  "job_post_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobPostId: uuid("job_post_id")
      .notNull()
      .references(() => jobPosts.id, { onDelete: "cascade" }),
    preferenceId: uuid("preference_id")
      .notNull()
      .references(() => preferences.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    jobPostIdIdx: index("job_post_preferences_job_post_id_idx").on(
      table.jobPostId
    ),
    preferenceIdIdx: index("job_post_preferences_preference_id_idx").on(
      table.preferenceId
    ),
    // Unique constraint to prevent duplicate entries
    uniqueJobPostPreference: index("unique_job_post_preference").on(
      table.jobPostId,
      table.preferenceId
    ),
  })
);

// Relations
export const jobPostsRelations = relations(jobPosts, ({ one, many }) => ({
  user: one(users, {
    fields: [jobPosts.userId],
    references: [users.id],
  }),
  careNeedsRelation: many(jobPostCareNeeds),
  languagesRelation: many(jobPostLanguages),
  preferencesRelation: many(jobPostPreferences),
}));

export const jobPostCareNeedsRelations = relations(jobPostCareNeeds, ({ one }) => ({
    jobPost: one(jobPosts, {
      fields: [jobPostCareNeeds.jobPostId],
      references: [jobPosts.id],
    }),
    careNeed: one(careNeeds, {
      fields: [jobPostCareNeeds.careNeedId],
      references: [careNeeds.id],
    }),
  }));
  
  export const jobPostLanguagesRelations = relations(jobPostLanguages, ({ one }) => ({
    jobPost: one(jobPosts, {
      fields: [jobPostLanguages.jobPostId],
      references: [jobPosts.id],
    }),
    language: one(languages, {
      fields: [jobPostLanguages.languageId],
      references: [languages.id],
    }),
  }));
  
  export const jobPostPreferencesRelations = relations(jobPostPreferences, ({ one }) => ({
    jobPost: one(jobPosts, {
      fields: [jobPostPreferences.jobPostId],
      references: [jobPosts.id],
    }),
    preference: one(preferences, {
      fields: [jobPostPreferences.preferenceId],
      references: [preferences.id],
    }),
  }));

// Update existing relations to include job posts
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
}));

export const careNeedsRelations = relations(careNeeds, ({ many }) => ({
  jobPostCareNeeds: many(jobPostCareNeeds),
}));

export const languagesRelations = relations(languages, ({ many }) => ({
  jobPostLanguages: many(jobPostLanguages),
}));

export const preferencesRelations = relations(preferences, ({ many }) => ({
  jobPostPreferences: many(jobPostPreferences),
}));

// Zod Schemas for validation
export const createJobPostSchema = createInsertSchema(jobPosts).omit({
  id: true,
  isActive: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
});

export const createJobPostCareNeedSchema = createInsertSchema(
  jobPostCareNeeds
).omit({
  id: true,
  createdAt: true,
});

export const createJobPostLanguageSchema = createInsertSchema(
  jobPostLanguages
).omit({
  id: true,
  createdAt: true,
});

export const createJobPostPreferenceSchema = createInsertSchema(
  jobPostPreferences
).omit({
  id: true,
  createdAt: true,
});
