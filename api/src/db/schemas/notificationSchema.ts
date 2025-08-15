// schemas/notificationSchema.ts - Clean rewrite
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  index,
  text,
  pgEnum,
  json,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./usersSchema";
import { jobPosts } from "./jobSchema";
import { jobApplications } from "./jobApplicationSchema";
import { disputes } from "./disputeSchema";

// Enums for notifications
export const notificationTypeEnum = pgEnum("notification_type", [
  "job_application", // New application received
  "application_accepted", // Application was accepted
  "application_rejected", // Application was rejected
  "application_cancelled", // Application was cancelled
  "job_started", // Healthcare worker checked in
  "job_completed", // Job was marked as complete
  "job_cancelled_by_poster", // Job poster cancelled
  "job_cancelled_by_healthcare", // Healthcare worker cancelled
  "payment_processed", // Payment related
  "report_submitted", // Report was submitted
  "system_announcement", // General system notifications
  "new_message_received", // ADD THIS LINE - New message received
  "review_received", // New review received
  "dispute_created", // New dispute was created
  "dispute_status_updated", // Dispute status changed
  "dispute_resolved", // Dispute was resolved
  "dispute_assigned",
]);

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

// Notifications Table
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    priority: notificationPriorityEnum("priority").default("normal").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),

    messageCount: integer("message_count").default(1),

    // Related entities (optional)
    jobPostId: uuid("job_post_id").references(() => jobPosts.id, {
      onDelete: "set null",
    }),
    jobApplicationId: uuid("job_application_id").references(
      () => jobApplications.id,
      { onDelete: "set null" }
    ),
    relatedUserId: uuid("related_user_id").references(() => users.id, {
      onDelete: "set null",
    }), // The other user involved

    disputeId: uuid("dispute_id").references(() => disputes.id, { onDelete: "set null" }), // ADD THIS LINE


    // Additional data (JSON for flexibility)
    metadata: json("metadata"), // Any additional data needed

    // Actions
    actionUrl: varchar("action_url", { length: 500 }), // URL to navigate when clicked
    actionLabel: varchar("action_label", { length: 100 }), // Button text

    // Status
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    isEmailSent: boolean("is_email_sent").default(false).notNull(),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),

    // Scheduling (for future notifications)
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }), // When to show this notification
    expiresAt: timestamp("expires_at", { withTimezone: true }), // When notification becomes irrelevant

    isActive: boolean("is_active").default(true).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("notifications_user_id_idx").on(table.userId),
    typeIdx: index("notifications_type_idx").on(table.type),
    isReadIdx: index("notifications_is_read_idx").on(table.isRead),
    priorityIdx: index("notifications_priority_idx").on(table.priority),
    createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
    scheduledForIdx: index("notifications_scheduled_for_idx").on(
      table.scheduledFor
    ),
    jobPostIdIdx: index("notifications_job_post_id_idx").on(table.jobPostId),
    jobApplicationIdIdx: index("notifications_job_application_id_idx").on(
      table.jobApplicationId
    ),
  })
);

// Relations for notifications (DON'T override existing relations)
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "userNotifications",
  }),
  relatedUser: one(users, {
    fields: [notifications.relatedUserId],
    references: [users.id],
    relationName: "relatedUserNotifications",
  }),
  jobPost: one(jobPosts, {
    fields: [notifications.jobPostId],
    references: [jobPosts.id],
  }),
  jobApplication: one(jobApplications, {
    fields: [notifications.jobApplicationId],
    references: [jobApplications.id],
  }),
  dispute: one(disputes, { // ADD THIS RELATION
    fields: [notifications.disputeId],
    references: [disputes.id],
  }),

}));

// Zod Schemas for validation
export const createNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  isRead: true,
  readAt: true,
  isEmailSent: true,
  emailSentAt: true,
  isActive: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
});

export const markAsReadSchema = createInsertSchema(notifications).pick({
  isRead: true,
});

// Notification Templates Interface
export interface NotificationTemplate {
  type: string;
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "urgent";
  actionUrl?: string;
  actionLabel?: string;
  emailTemplate?: string;
}

// Pre-defined notification templates
export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  JOB_APPLICATION_RECEIVED: {
    type: "job_application",
    title: "New Job Application",
    message:
      'You have received a new application for your job post "{jobTitle}"',
    priority: "normal",
    actionUrl: "/posted-jobs/view-applicants/{jobPostId}",
    actionLabel: "View Application",
  },
  APPLICATION_ACCEPTED: {
    type: "application_accepted",
    title: "Application Accepted!",
    message: 'Your application for "{jobTitle}" has been accepted',
    priority: "high",
    actionUrl: "/my-applications/{applicationId}",
    actionLabel: "View Details",
  },
  APPLICATION_REJECTED: {
    type: "application_rejected",
    title: "Application Update",
    message: 'Your application for "{jobTitle}" was not selected',
    priority: "normal",
    actionUrl: "/my-applications/{applicationId}",
    actionLabel: "View Details",
  },
  APPLICATION_CANCELLED: {
    type: "application_cancelled",
    title: "Application Cancelled",
    message: 'Application for "{jobTitle}" has been cancelled',
    priority: "high",
    actionUrl: "/my-applications/{applicationId}",
    actionLabel: "View Details",
  },
  JOB_STARTED: {
    type: "job_started",
    title: "Job Started",
    message: 'Healthcare worker has checked in for "{jobTitle}"',
    priority: "normal",
    actionUrl: "/jobs/{jobPostId}",
    actionLabel: "View Job",
  },
  JOB_COMPLETED: {
    type: "job_completed",
    title: "Job Completed",
    message: 'Job "{jobTitle}" has been marked as completed',
    priority: "normal",
    actionUrl: "/my-applications/{applicationId}",
    actionLabel: "View Details",
  },
  REPORT_SUBMITTED: {
    type: "report_submitted",
    title: "Report Submitted",
    message: 'A report has been submitted regarding job "{jobTitle}"',
    priority: "urgent",
    actionUrl: "/admin/reports/{applicationId}",
    actionLabel: "Review Report",
  },
  NEW_MESSAGE_RECEIVED: {
    type: "new_message_received",
    title: "New message from {senderName}", // Will be updated dynamically for multiple messages
    message: "{messagePreview}", // Will be updated dynamically for multiple messages
    priority: "normal",
    actionUrl: "/messages/{conversationId}",
    actionLabel: "View Message",
  },
  REVIEW_RECEIVED: {
    type: "review_received",
    title: "New Review Received",
    message: 'You received a {rating}-star review for job "{jobTitle}"',
    priority: "normal",
    actionUrl: "/profile",
    actionLabel: "View Review",
  },
  // NEW DISPUTE NOTIFICATION TEMPLATES:
  DISPUTE_CREATED: {
    type: 'dispute_created',
    title: 'New Dispute Created',
    message: 'A new dispute #{disputeNumber} has been filed regarding job "{jobTitle}"',
    priority: 'high',
    actionUrl: '/admin/disputes/{disputeId}',
    actionLabel: 'Review Dispute'
  },
  DISPUTE_STATUS_UPDATED: {
    type: 'dispute_status_updated',
    title: 'Dispute Status Updated',
    message: 'Dispute #{disputeNumber} status has been updated to {newStatus}',
    priority: 'normal',
    actionUrl: '/disputes/{disputeId}',
    actionLabel: 'View Dispute'
  },
  DISPUTE_RESOLVED: {
    type: 'dispute_resolved',
    title: 'Dispute Resolved',
    message: 'Dispute #{disputeNumber} regarding "{jobTitle}" has been resolved',
    priority: 'normal',
    actionUrl: '/disputes/{disputeId}',
    actionLabel: 'View Resolution'
  },
  DISPUTE_ASSIGNED: {
    type: 'dispute_assigned',
    title: 'Dispute Assigned',
    message: 'Dispute #{disputeNumber} has been assigned to you for review',
    priority: 'high',
    actionUrl: '/admin/disputes/{disputeId}',
    actionLabel: 'Review Dispute'
  },
  PROFILE_COMPLETED: {
    type: 'system_announcement',
    title: 'New Profile Completed',
    message: '{userName} has completed their {userRole} profile',
    priority: 'normal',
    actionUrl: '/admin/users/{relatedUserId}',
    actionLabel: 'View Profile'
  },  
};
