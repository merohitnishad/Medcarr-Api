// schemas/messageSchema.ts
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
  import { jobApplications } from "./jobApplicationSchema";
  
  // Enums for messages
  export const messageStatusEnum = pgEnum("message_status", [
    "sent",
    "delivered", 
    "read"
  ]);
  
  export const messageTypeEnum = pgEnum("message_type", [
    "text",
    "image",
    "file"
  ]);
  
  // Conversations Table - represents a chat between job poster and healthcare worker
  export const conversations = pgTable(
    "conversations",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      jobApplicationId: uuid("job_application_id")
        .notNull()
        .references(() => jobApplications.id, { onDelete: "cascade" })
        .unique(), // One conversation per application
      jobPosterId: uuid("job_poster_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      healthcareUserId: uuid("healthcare_user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      
      // Metadata
      lastMessageAt: timestamp("last_message_at"),
      lastMessageId: uuid("last_message_id"),
      
      // Read status tracking
      jobPosterLastReadAt: timestamp("job_poster_last_read_at"),
      healthcareLastReadAt: timestamp("healthcare_last_read_at"),
      
      // Conversation settings
      isActive: boolean("is_active").default(true).notNull(),
      isArchived: boolean("is_archived").default(false).notNull(),
      isBlocked: boolean("is_blocked").default(false).notNull(),
      blockedBy: uuid("blocked_by").references(() => users.id),
      blockedAt: timestamp("blocked_at"),
      
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
      jobApplicationIdIdx: index("conversations_job_application_id_idx").on(table.jobApplicationId),
      jobPosterIdIdx: index("conversations_job_poster_id_idx").on(table.jobPosterId),
      healthcareUserIdIdx: index("conversations_healthcare_user_id_idx").on(table.healthcareUserId),
      lastMessageAtIdx: index("conversations_last_message_at_idx").on(table.lastMessageAt),
      isActiveIdx: index("conversations_is_active_idx").on(table.isActive),
    })
  );
  
  // Messages Table
  export const messages = pgTable(
    "messages",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, { onDelete: "cascade" }),
      senderId: uuid("sender_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      
      // Message content
      messageType: messageTypeEnum("message_type").default("text").notNull(),
      content: text("content").notNull(), // Text content or file path/URL
      fileName: varchar("file_name", { length: 255 }), // Original filename for files
      fileSize: varchar("file_size", { length: 50 }), // File size in bytes
      mimeType: varchar("mime_type", { length: 100 }), // File MIME type
      
      // Message metadata
      status: messageStatusEnum("status").default("sent").notNull(),
      readAt: timestamp("read_at"),
      editedAt: timestamp("edited_at"),
      
      // Reply functionality
      replyToMessageId: uuid("reply_to_message_id").references((): any => messages.id),
      
      // Soft delete
      isDeleted: boolean("is_deleted").default(false).notNull(),
      deletedAt: timestamp("deleted_at"),
      deletedBy: uuid("deleted_by").references(() => users.id),
      
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
      conversationIdIdx: index("messages_conversation_id_idx").on(table.conversationId),
      senderIdIdx: index("messages_sender_id_idx").on(table.senderId),
      createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
      statusIdx: index("messages_status_idx").on(table.status),
      replyToMessageIdIdx: index("messages_reply_to_message_id_idx").on(table.replyToMessageId),
    })
  );
  
  // Relations
  export const conversationsRelations = relations(conversations, ({ one, many }) => ({
    jobApplication: one(jobApplications, {
      fields: [conversations.jobApplicationId],
      references: [jobApplications.id],
    }),
    jobPoster: one(users, {
      fields: [conversations.jobPosterId],
      references: [users.id],
      relationName: "jobPosterConversations"
    }),
    healthcareUser: one(users, {
      fields: [conversations.healthcareUserId],
      references: [users.id],
      relationName: "healthcareConversations"
    }),
    blockedByUser: one(users, {
      fields: [conversations.blockedBy],
      references: [users.id],
      relationName: "blockedConversations"
    }),
    lastMessage: one(messages, {
      fields: [conversations.lastMessageId],
      references: [messages.id],
      relationName: "lastMessageRelation"
    }),
    messages: many(messages),
  }));
  
  export const messagesRelations = relations(messages, ({ one }) => ({
    conversation: one(conversations, {
      fields: [messages.conversationId],
      references: [conversations.id],
    }),
    sender: one(users, {
      fields: [messages.senderId],
      references: [users.id],
      relationName: "sentMessages"
    }),
    replyToMessage: one(messages, {
      fields: [messages.replyToMessageId],
      references: [messages.id],
      relationName: "messageReplies"
    }),
    deletedByUser: one(users, {
      fields: [messages.deletedBy],
      references: [users.id],
      relationName: "deletedMessages"
    }),
  }));
  
  // Note: Don't override existing jobApplicationsRelations
  // The conversation relation should be added to your existing jobApplicationsRelations in jobApplicationSchema.ts
  
  // Zod Schemas for validation
  export const createConversationSchema = createInsertSchema(conversations).omit({
    id: true,
    lastMessageAt: true,
    lastMessageId: true,
    jobPosterLastReadAt: true,
    healthcareLastReadAt: true,
    isActive: true,
    isArchived: true,
    isBlocked: true,
    blockedBy: true,
    blockedAt: true,
    createdAt: true,
    updatedAt: true,
  });
  
  export const createMessageSchema = createInsertSchema(messages).omit({
    id: true,
    status: true,
    readAt: true,
    editedAt: true,
    isDeleted: true,
    deletedAt: true,
    deletedBy: true,
    createdAt: true,
    updatedAt: true,
  });
  
  export const updateMessageSchema = createInsertSchema(messages).pick({
    content: true,
  });
  
  export const blockConversationSchema = createInsertSchema(conversations).pick({
    isBlocked: true,
  });
  
  export const archiveConversationSchema = createInsertSchema(conversations).pick({
    isArchived: true,
  });