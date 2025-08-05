// schemas/jobApplicationSchema.ts - Clean rewrite
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  index,
  text,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { jobPosts } from "./jobSchema";
import { users } from "./usersSchema";
import { conversations } from "./messageSchema";
import { preferences } from "./utilsSchema";

// Enums for job application
export const applicationStatusEnum = pgEnum("application_status", [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "not-available",
  "closed",
  "completed"
]);

export const cancellationReasonEnum = pgEnum("cancellation_reason", [
  "personal_emergency",
  "health_issues", 
  "schedule_conflict",
  "family_emergency",
  "transportation_issues",
  "other"
]);

// Job Applications Table
export const jobApplications = pgTable(
  "job_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobPostId: uuid("job_post_id")
      .notNull()
      .references(() => jobPosts.id, { onDelete: "cascade" }),
    healthcareUserId: uuid("healthcare_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: applicationStatusEnum("status").default("pending").notNull(),
    applicationMessage: text("application_message"), // Optional message from healthcare worker
    
    // Acceptance/Rejection data
    respondedAt: timestamp("responded_at", { withTimezone: true }), // When job poster responded
    responseMessage: text("response_message"), // Message from job poster
    
    // Cancellation data
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: cancellationReasonEnum("cancellation_reason"),
    cancellationMessage: text("cancellation_message"),
    cancelledBy: uuid("cancelled_by").references(() => users.id), // Who cancelled (healthcare or job poster)
    
    // Check-in/Check-out data
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    checkinLocation: text("checkin_location"), // GPS coordinates or address
    checkoutLocation: text("checkout_location"),
    
    // Completion data
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id), // Job poster marks as complete
    completionNotes: text("completion_notes"),
    
    // Report data
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    reportReason: text("report_reason"),
    reportMessage: text("report_message"),
    reportedBy: uuid("reported_by").references(() => users.id),
    
    isActive: boolean("is_active").default(true).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    jobPostIdIdx: index("job_applications_job_post_id_idx").on(table.jobPostId),
    healthcareUserIdIdx: index("job_applications_healthcare_user_id_idx").on(table.healthcareUserId),
    statusIdx: index("job_applications_status_idx").on(table.status),
    createdAtIdx: index("job_applications_created_at_idx").on(table.createdAt),
    // Unique constraint to prevent duplicate applications
    uniqueJobApplication: index("unique_job_application").on(
      table.jobPostId,
      table.healthcareUserId
    ),
  })
);

// New Junction Table for Job Application Preferences
export const jobApplicationPreferences = pgTable(
  "job_application_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobApplicationId: uuid("job_application_id")
      .notNull()
      .references(() => jobApplications.id, { onDelete: "cascade" }),
    preferenceId: uuid("preference_id")
      .notNull()
      .references(() => preferences.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    jobApplicationIdIdx: index("job_application_preferences_application_id_idx").on(
      table.jobApplicationId
    ),
    preferenceIdIdx: index("job_application_preferences_preference_id_idx").on(
      table.preferenceId
    ),
    // Unique constraint to prevent duplicate entries
    uniqueJobApplicationPreference: index("unique_job_application_preference").on(
      table.jobApplicationId,
      table.preferenceId
    ),
  })
);


// Relations for job applications (DON'T override existing relations)
export const jobApplicationsRelations = relations(jobApplications, ({ one, many }) => ({
  jobPost: one(jobPosts, {
    fields: [jobApplications.jobPostId],
    references: [jobPosts.id],
  }),
  healthcareUser: one(users, {
    fields: [jobApplications.healthcareUserId],
    references: [users.id],
    relationName: "healthcareApplications"
  }),
  cancelledByUser: one(users, {
    fields: [jobApplications.cancelledBy],
    references: [users.id],
    relationName: "cancelledApplications"
  }),
  completedByUser: one(users, {
    fields: [jobApplications.completedBy],
    references: [users.id],
    relationName: "completedApplications"
  }),
  reportedByUser: one(users, {
    fields: [jobApplications.reportedBy],
    references: [users.id],
    relationName: "reportedApplications"
  }),
  conversation: one(conversations, {
    fields: [jobApplications.id],
    references: [conversations.jobApplicationId],
  }),
  preferencesRelation: many(jobApplicationPreferences),

}));

// New relation for the junction table
export const jobApplicationPreferencesRelations = relations(jobApplicationPreferences, ({ one }) => ({
  jobApplication: one(jobApplications, {
    fields: [jobApplicationPreferences.jobApplicationId],
    references: [jobApplications.id],
  }),
  preference: one(preferences, {
    fields: [jobApplicationPreferences.preferenceId],
    references: [preferences.id],
  }),
}));


// Zod Schemas for validation
export const createJobApplicationSchema = createInsertSchema(jobApplications).omit({
  id: true,
  status: true,
  respondedAt: true,
  responseMessage: true,
  cancelledAt: true,
  cancellationReason: true,
  cancellationMessage: true,
  cancelledBy: true,
  checkedInAt: true,
  checkedOutAt: true,
  checkinLocation: true,
  checkoutLocation: true,
  completedAt: true,
  completedBy: true,
  completionNotes: true,
  reportedAt: true,
  reportReason: true,
  reportMessage: true,
  reportedBy: true,
  isActive: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
});

export const createJobApplicationPreferenceSchema = createInsertSchema(
  jobApplicationPreferences
).omit({
  id: true,
  createdAt: true,
});

export const updateApplicationStatusSchema = createInsertSchema(jobApplications).pick({
  status: true,
  responseMessage: true,
});

export const cancelApplicationSchema = createInsertSchema(jobApplications).pick({
  cancellationReason: true,
  cancellationMessage: true,
});

export const checkinSchema = createInsertSchema(jobApplications).pick({
  checkinLocation: true,
});

export const checkoutSchema = createInsertSchema(jobApplications).pick({
  checkoutLocation: true,
});

export const completeJobSchema = createInsertSchema(jobApplications).pick({
  completionNotes: true,
});

export const reportSchema = createInsertSchema(jobApplications).pick({
  reportReason: true,
  reportMessage: true,
});