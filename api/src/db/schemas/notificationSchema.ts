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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./usersSchema";
import { jobPosts } from "./jobSchema";
import { jobApplications } from "./jobApplicationSchema";

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
]);

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "low",
  "normal", 
  "high",
  "urgent"
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
    
    // Related entities (optional)
    jobPostId: uuid("job_post_id").references(() => jobPosts.id, { onDelete: "set null" }),
    jobApplicationId: uuid("job_application_id").references(() => jobApplications.id, { onDelete: "set null" }),
    relatedUserId: uuid("related_user_id").references(() => users.id, { onDelete: "set null" }), // The other user involved
    
    // Additional data (JSON for flexibility)
    metadata: json("metadata"), // Any additional data needed
    
    // Actions
    actionUrl: varchar("action_url", { length: 500 }), // URL to navigate when clicked
    actionLabel: varchar("action_label", { length: 100 }), // Button text
    
    // Status
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at"),
    isEmailSent: boolean("is_email_sent").default(false).notNull(),
    emailSentAt: timestamp("email_sent_at"),
    
    // Scheduling (for future notifications)
    scheduledFor: timestamp("scheduled_for"), // When to show this notification
    expiresAt: timestamp("expires_at"), // When notification becomes irrelevant
    
    isActive: boolean("is_active").default(true).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("notifications_user_id_idx").on(table.userId),
    typeIdx: index("notifications_type_idx").on(table.type),
    isReadIdx: index("notifications_is_read_idx").on(table.isRead),
    priorityIdx: index("notifications_priority_idx").on(table.priority),
    createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
    scheduledForIdx: index("notifications_scheduled_for_idx").on(table.scheduledFor),
    jobPostIdIdx: index("notifications_job_post_id_idx").on(table.jobPostId),
    jobApplicationIdIdx: index("notifications_job_application_id_idx").on(table.jobApplicationId),
  })
);

// Relations for notifications (DON'T override existing relations)
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "userNotifications"
  }),
  relatedUser: one(users, {
    fields: [notifications.relatedUserId],
    references: [users.id],
    relationName: "relatedUserNotifications"
  }),
  jobPost: one(jobPosts, {
    fields: [notifications.jobPostId],
    references: [jobPosts.id],
  }),
  jobApplication: one(jobApplications, {
    fields: [notifications.jobApplicationId],
    references: [jobApplications.id],
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
  priority: 'low' | 'normal' | 'high' | 'urgent';
  actionUrl?: string;
  actionLabel?: string;
  emailTemplate?: string;
}

// Pre-defined notification templates
export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  JOB_APPLICATION_RECEIVED: {
    type: 'job_application',
    title: 'New Job Application',
    message: 'You have received a new application for your job post "{jobTitle}"',
    priority: 'normal',
    actionUrl: '/jobs/{jobPostId}/applications',
    actionLabel: 'View Application'
  },
  APPLICATION_ACCEPTED: {
    type: 'application_accepted',
    title: 'Application Accepted!',
    message: 'Your application for "{jobTitle}" has been accepted',
    priority: 'high',
    actionUrl: '/my-applications/{applicationId}',
    actionLabel: 'View Details'
  },
  APPLICATION_REJECTED: {
    type: 'application_rejected',
    title: 'Application Update',
    message: 'Your application for "{jobTitle}" was not selected',
    priority: 'normal',
    actionUrl: '/my-applications/{applicationId}',
    actionLabel: 'View Details'
  },
  APPLICATION_CANCELLED: {
    type: 'application_cancelled',
    title: 'Application Cancelled',
    message: 'Application for "{jobTitle}" has been cancelled',
    priority: 'high',
    actionUrl: '/my-applications/{applicationId}',
    actionLabel: 'View Details'
  },
  JOB_STARTED: {
    type: 'job_started',
    title: 'Job Started',
    message: 'Healthcare worker has checked in for "{jobTitle}"',
    priority: 'normal',
    actionUrl: '/jobs/{jobPostId}',
    actionLabel: 'View Job'
  },
  JOB_COMPLETED: {
    type: 'job_completed',
    title: 'Job Completed',
    message: 'Job "{jobTitle}" has been marked as completed',
    priority: 'normal',
    actionUrl: '/jobs/{jobPostId}',
    actionLabel: 'View Job'
  },
  REPORT_SUBMITTED: {
    type: 'report_submitted',
    title: 'Report Submitted',
    message: 'A report has been submitted regarding job "{jobTitle}"',
    priority: 'urgent',
    actionUrl: '/admin/reports/{applicationId}',
    actionLabel: 'Review Report'
  }
};