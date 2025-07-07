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

// Enums for job application
export const applicationStatusEnum = pgEnum("application_status", [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
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
    respondedAt: timestamp("responded_at"), // When job poster responded
    responseMessage: text("response_message"), // Message from job poster
    
    // Cancellation data
    cancelledAt: timestamp("cancelled_at"),
    cancellationReason: cancellationReasonEnum("cancellation_reason"),
    cancellationMessage: text("cancellation_message"),
    cancelledBy: uuid("cancelled_by").references(() => users.id), // Who cancelled (healthcare or job poster)
    
    // Check-in/Check-out data
    checkedInAt: timestamp("checked_in_at"),
    checkedOutAt: timestamp("checked_out_at"),
    checkinLocation: text("checkin_location"), // GPS coordinates or address
    checkoutLocation: text("checkout_location"),
    
    // Completion data
    completedAt: timestamp("completed_at"),
    completedBy: uuid("completed_by").references(() => users.id), // Job poster marks as complete
    completionNotes: text("completion_notes"),
    
    // Report data
    reportedAt: timestamp("reported_at"),
    reportReason: text("report_reason"),
    reportMessage: text("report_message"),
    reportedBy: uuid("reported_by").references(() => users.id),
    
    isActive: boolean("is_active").default(true).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

// Relations for job applications (DON'T override existing relations)
export const jobApplicationsRelations = relations(jobApplications, ({ one }) => ({
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