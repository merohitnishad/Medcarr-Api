// schemas/disputeSchema.ts
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
import { users } from "./usersSchema";
import { jobPosts } from "./jobSchema";

// Enums for dispute
export const disputeStatusEnum = pgEnum("dispute_status", [
  "open",
  "in_review",
  "resolved",
  "dismissed",
]);

export const disputeTypeEnum = pgEnum("dispute_type", [
  "no_show",
  "shift delay",
  "unprofessional_behavior",
  "safety_concern",
  "payment_issue",
  "breach_of_agreement",
  "poor_communication",
  "other",
]);

// Main Disputes Table
export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    disputeNumber: varchar("dispute_number", { length: 20 }).notNull().unique(), // Auto-generated: DSP-YYYYMMDD-XXXX

    // Job and user references
    jobPostId: uuid("job_post_id")
      .notNull()
      .references(() => jobPosts.id, { onDelete: "cascade" }),
    reportedBy: uuid("reported_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportedAgainst: uuid("reported_against")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Dispute details
    disputeType: disputeTypeEnum("dispute_type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),

    // Status and timestamps
    status: disputeStatusEnum("status").default("open").notNull(),

    // Admin handling
    assignedToAdmin: uuid("assigned_to_admin").references(() => users.id),
    adminNotes: text("admin_notes"),
    resolutionDescription: text("resolution_description"),

    // Timestamps
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    // Meta
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
    jobPostIdIdx: index("disputes_job_post_id_idx").on(table.jobPostId),
    reportedByIdx: index("disputes_reported_by_idx").on(table.reportedBy),
    reportedAgainstIdx: index("disputes_reported_against_idx").on(
      table.reportedAgainst,
    ),
    statusIdx: index("disputes_status_idx").on(table.status),
    disputeNumberIdx: index("disputes_dispute_number_idx").on(
      table.disputeNumber,
    ),
    createdAtIdx: index("disputes_created_at_idx").on(table.createdAt),
  }),
);

// Supporting Documents Table
export const disputeDocuments = pgTable(
  "dispute_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => disputes.id, { onDelete: "cascade" }),

    // S3 file details
    fileName: varchar("file_name", { length: 255 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
    s3Key: varchar("s3_key", { length: 500 }).notNull(),
    s3Url: varchar("s3_url", { length: 1000 }).notNull(),
    fileSize: varchar("file_size", { length: 50 }).notNull(), // Store as string like "2.5MB"
    contentType: varchar("content_type", { length: 100 }).notNull(),

    // Upload tracking
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    // Meta
    isActive: boolean("is_active").default(true).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    disputeIdIdx: index("dispute_documents_dispute_id_idx").on(table.disputeId),
    uploadedByIdx: index("dispute_documents_uploaded_by_idx").on(
      table.uploadedBy,
    ),
    s3KeyIdx: index("dispute_documents_s3_key_idx").on(table.s3Key),
  }),
);

// Relations
export const disputesRelations = relations(disputes, ({ one, many }) => ({
  jobPost: one(jobPosts, {
    fields: [disputes.jobPostId],
    references: [jobPosts.id],
  }),
  reportedByUser: one(users, {
    fields: [disputes.reportedBy],
    references: [users.id],
    relationName: "reportedByDisputes",
  }),
  reportedAgainstUser: one(users, {
    fields: [disputes.reportedAgainst],
    references: [users.id],
    relationName: "reportedAgainstDisputes",
  }),
  assignedAdmin: one(users, {
    fields: [disputes.assignedToAdmin],
    references: [users.id],
    relationName: "assignedDisputes",
  }),
  documents: many(disputeDocuments),
}));

export const disputeDocumentsRelations = relations(
  disputeDocuments,
  ({ one }) => ({
    dispute: one(disputes, {
      fields: [disputeDocuments.disputeId],
      references: [disputes.id],
    }),
    uploadedByUser: one(users, {
      fields: [disputeDocuments.uploadedBy],
      references: [users.id],
    }),
  }),
);

// Zod Schemas for validation
export const createDisputeSchema = createInsertSchema(disputes).omit({
  id: true,
  disputeNumber: true,
  status: true,
  assignedToAdmin: true,
  adminNotes: true,
  resolutionDescription: true,
  reportedAt: true,
  reviewStartedAt: true,
  resolvedAt: true,
  isActive: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDisputeStatusSchema = createInsertSchema(disputes).pick({
  status: true,
  adminNotes: true,
  resolutionDescription: true,
  assignedToAdmin: true,
});

export const createDisputeDocumentSchema = createInsertSchema(
  disputeDocuments,
).omit({
  id: true,
  uploadedAt: true,
  isActive: true,
  isDeleted: true,
  createdAt: true,
});
