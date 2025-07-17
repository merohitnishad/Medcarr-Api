// services/messageService.ts
import { db } from "../../db/index.js";
import { conversations, messages } from "../../db/schemas/messageSchema.js";
import { jobApplications } from "../../db/schemas/jobApplicationSchema.js";
import { users } from "../../db/schemas/usersSchema.js";
import { eq, and, desc, count, asc, or, isNull, gt, lt, ne, inArray } from "drizzle-orm";
import { NotificationService } from "../notification/notificationService.js";

export interface CreateConversationData {
  jobApplicationId: string;
  jobPosterId: string;
  healthcareUserId: string;
}

export interface SendMessageData {
  conversationId: string;
  senderId: string;
  content: string;
  messageType?: 'text' | 'image' | 'file';
  fileName?: string;
  fileSize?: string;
  mimeType?: string;
  replyToMessageId?: string;
}

export interface MessageFilters {
  page?: number;
  limit?: number;
  before?: string; // Message ID for pagination
  after?: string;  // Message ID for pagination
}

export interface ConversationFilters {
  page?: number;
  limit?: number;
  archived?: boolean;
  blocked?: boolean;
}

export class MessageService {
  // Create a new conversation (automatically created when first message is sent)
  static async createConversation(data: CreateConversationData) {
    return await db.transaction(async (tx) => {
      // Check if conversation already exists
      const existingConversation = await tx.query.conversations.findFirst({
        where: eq(conversations.jobApplicationId, data.jobApplicationId)
      });

      if (existingConversation) {
        return existingConversation;
      }

      // Verify job application exists and get details
      const jobApplication = await tx.query.jobApplications.findFirst({
        where: eq(jobApplications.id, data.jobApplicationId),
        with: {
          jobPost: {
            with: {
              user: { columns: { id: true } }
            }
          },
          healthcareUser: { columns: { id: true } }
        }
      });

      if (!jobApplication) {
        throw new Error('Job application not found');
      }

      // Verify user permissions
      const isJobPoster = jobApplication.jobPost.userId === data.jobPosterId;
      const isHealthcareWorker = jobApplication.healthcareUserId === data.healthcareUserId;

      if (!isJobPoster || !isHealthcareWorker) {
        throw new Error('Invalid participants for this conversation');
      }

      // Create conversation
      const [conversation] = await tx
        .insert(conversations)
        .values({
          jobApplicationId: data.jobApplicationId,
          jobPosterId: data.jobPosterId,
          healthcareUserId: data.healthcareUserId,
        })
        .returning();

      return conversation;
    });
  }

  // Send a message
  static async sendMessage(data: SendMessageData) {
    return await db.transaction(async (tx) => {
      // Get conversation and verify access
      const conversation = await tx.query.conversations.findFirst({
        where: and(
          eq(conversations.id, data.conversationId),
          eq(conversations.isActive, true),
          eq(conversations.isBlocked, false)
        ),
        with: {
          jobApplication: {
            with: {
              jobPost: {
                columns: { id: true, title: true }
              }
            }
          }
        }
      });

      if (!conversation) {
        throw new Error('Conversation not found or is blocked');
      }

      // Verify sender is part of the conversation
      if (data.senderId !== conversation.jobPosterId && data.senderId !== conversation.healthcareUserId) {
        throw new Error('Access denied');
      }

      // Verify reply message exists if replying
      if (data.replyToMessageId) {
        const replyMessage = await tx.query.messages.findFirst({
          where: and(
            eq(messages.id, data.replyToMessageId),
            eq(messages.conversationId, data.conversationId),
            eq(messages.isDeleted, false)
          )
        });

        if (!replyMessage) {
          throw new Error('Reply message not found');
        }
      }

      // Create message
      const [message] = await tx
        .insert(messages)
        .values({
          conversationId: data.conversationId,
          senderId: data.senderId,
          content: data.content,
          messageType: data.messageType || 'text',
          fileName: data.fileName,
          fileSize: data.fileSize,
          mimeType: data.mimeType,
          replyToMessageId: data.replyToMessageId,
          status: 'sent',
        })
        .returning();

      // Update conversation with last message info
      await tx
        .update(conversations)
        .set({
          lastMessageAt: new Date(),
          lastMessageId: message.id,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, data.conversationId));

      // Get sender details for notification
      const sender = await tx.query.users.findFirst({
        where: eq(users.id, data.senderId),
        columns: { id: true, name: true }
      });

      // Determine recipient
      const recipientId = data.senderId === conversation.jobPosterId 
        ? conversation.healthcareUserId 
        : conversation.jobPosterId;

      // Create notification for recipient
      await NotificationService.createFromTemplate(
        'NEW_MESSAGE_RECEIVED',
        recipientId,
        {
          senderName: sender?.name || 'Someone',
          jobTitle: conversation.jobApplication.jobPost.title,
          messagePreview: data.content.length > 50 ? data.content.substring(0, 50) + '...' : data.content,
          conversationId: data.conversationId, // ADD THIS LINE
        },
        {
          jobPostId: conversation.jobApplication.jobPost.id,
          jobApplicationId: conversation.jobApplicationId,
          relatedUserId: data.senderId,
          sendEmail: false, // Usually don't send email for every message
          metadata: {
            conversationId: data.conversationId,
            messageId: message.id,
            messageType: data.messageType
          }
        }
      );

      return message;
    });
  }

  // Get conversation messages with pagination
  static async getConversationMessages(
    conversationId: string, 
    userId: string, 
    filters: MessageFilters = {}
  ) {
    const { page = 1, limit = 50, before, after } = filters;
    const offset = (page - 1) * limit;

    // Verify user has access to conversation
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        or(
          eq(conversations.jobPosterId, userId),
          eq(conversations.healthcareUserId, userId)
        )
      )
    });

    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    const conditions = [
      eq(messages.conversationId, conversationId),
      eq(messages.isDeleted, false),
    ];

    // Add cursor-based pagination if before/after is provided
    if (before) {
      // Get messages before this message ID (older messages)
      const beforeMessage = await db.query.messages.findFirst({
        where: eq(messages.id, before),
        columns: { createdAt: true }
      });
      if (beforeMessage) {
        conditions.push(lt(messages.createdAt, beforeMessage.createdAt));
      }
    }

    if (after) {
      // Get messages after this message ID (newer messages)
      const afterMessage = await db.query.messages.findFirst({
        where: eq(messages.id, after),
        columns: { createdAt: true }
      });
      if (afterMessage) {
        conditions.push(gt(messages.createdAt, afterMessage.createdAt));
      }
    }

    const [totalCount] = await db
      .select({ count: count() })
      .from(messages)
      .where(and(...conditions));

    const results = await db.query.messages.findMany({
      where: and(...conditions),
      with: {
        sender: {
          columns: {
            id: true,
            name: true,
          }
        },
        replyToMessage: {
          columns: {
            id: true,
            content: true,
            messageType: true,
            createdAt: true,
          },
          with: {
            sender: {
              columns: { id: true, name: true }
            }
          }
        }
      },
      orderBy: [desc(messages.createdAt)], // Most recent first
      limit,
      offset: before || after ? 0 : offset, // Don't use offset with cursor pagination
    });

    return {
      data: results.reverse(), // Reverse to show oldest first in chat
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
        hasNext: page < Math.ceil(totalCount.count / limit),
        hasPrev: page > 1
      }
    };
  }

  // Get user's conversations
  static async getUserConversations(userId: string, filters: ConversationFilters = {}) {
    const { page = 1, limit = 20, archived = false, blocked = false } = filters;
    const offset = (page - 1) * limit;

    const conditions = [
      or(
        eq(conversations.jobPosterId, userId),
        eq(conversations.healthcareUserId, userId)
      ),
      eq(conversations.isActive, true),
      eq(conversations.isArchived, archived),
      eq(conversations.isBlocked, blocked),
    ];

    const [totalCount] = await db
      .select({ count: count() })
      .from(conversations)
      .where(and(...conditions));

    const results = await db.query.conversations.findMany({
      where: and(...conditions),
      with: {
        jobApplication: {
          with: {
            jobPost: {
              columns: {
                id: true,
                title: true,
                type: true,
                jobDate: true,
              }
            }
          }
        },
        jobPoster: {
          columns: {
            id: true,
            name: true,
          }
        },
        healthcareUser: {
          columns: {
            id: true,
            name: true,
          }
        },
        lastMessage: {
          columns: {
            id: true,
            content: true,
            messageType: true,
            createdAt: true,
          },
          with: {
            sender: {
              columns: { id: true, name: true }
            }
          }
        }
      },
      orderBy: [desc(conversations.lastMessageAt)],
      limit,
      offset
    });

    // Add unread count for each conversation
    const conversationsWithUnreadCount = await Promise.all(
      results.map(async (conversation) => {
        const lastReadAt = userId === conversation.jobPosterId 
          ? conversation.jobPosterLastReadAt 
          : conversation.healthcareLastReadAt;

        const unreadConditions = [
          eq(messages.conversationId, conversation.id),
          eq(messages.isDeleted, false),
        ];

        if (lastReadAt) {
          unreadConditions.push(gt(messages.createdAt, lastReadAt));
        }

        // Don't count own messages as unread
        unreadConditions.push(ne(messages.senderId, userId));

        const [unreadCount] = await db
          .select({ count: count() })
          .from(messages)
          .where(and(...unreadConditions));

        return {
          ...conversation,
          unreadCount: unreadCount.count,
          otherParticipant: userId === conversation.jobPosterId 
            ? conversation.healthcareUser 
            : conversation.jobPoster
        };
      })
    );

    return {
      data: conversationsWithUnreadCount,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
        hasNext: page < Math.ceil(totalCount.count / limit),
        hasPrev: page > 1
      }
    };
  }

  // Mark messages as read
  static async markMessagesAsRead(conversationId: string, userId: string) {
    return await db.transaction(async (tx) => {
      // Verify user has access to conversation
      const conversation = await tx.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          or(
            eq(conversations.jobPosterId, userId),
            eq(conversations.healthcareUserId, userId)
          )
        )
      });
  
      if (!conversation) {
        throw new Error('Conversation not found or access denied');
      }
  
      // Update conversation's last read timestamp
      const updateData = userId === conversation.jobPosterId
        ? { jobPosterLastReadAt: new Date() }
        : { healthcareLastReadAt: new Date() };
  
      await tx
        .update(conversations)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));
  
      // Get messages to be marked as read
      const messagesToRead = await tx.query.messages.findMany({
        where: and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, userId), // Don't mark own messages
          or(
            eq(messages.status, 'sent'),
            eq(messages.status, 'delivered')
          ),
          eq(messages.isDeleted, false)
        ),
        columns: { id: true }
      });
  
      const messageIds = messagesToRead.map(msg => msg.id);
  
      if (messageIds.length > 0) {
        // Mark messages as read
        await tx
          .update(messages)
          .set({
            status: 'read',
            readAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(messages.conversationId, conversationId),
            ne(messages.senderId, userId),
            or(
              eq(messages.status, 'sent'),
              eq(messages.status, 'delivered')
            )
          ));
      }
  
      return { success: true, messageIds };
    });
  }

  // Mark messages as delivered
static async markMessagesAsDelivered(userId: string) {
  return await db.transaction(async (tx) => {
    // Find all conversations where user is a participant
    const userConversations = await tx.query.conversations.findMany({
      where: or(
        eq(conversations.jobPosterId, userId),
        eq(conversations.healthcareUserId, userId)
      ),
      columns: { id: true }
    });

    const conversationIds = userConversations.map(conv => conv.id);

    if (conversationIds.length === 0) return { conversationIds: [] };

    // Get messages that need to be marked as delivered
    const messagesToUpdate = await tx.query.messages.findMany({
      where: and(
        inArray(messages.conversationId, conversationIds),
        ne(messages.senderId, userId), // Don't mark own messages
        eq(messages.status, 'sent'),
        eq(messages.isDeleted, false)
      ),
      columns: { id: true, conversationId: true }
    });

    const messageIds = messagesToUpdate.map(msg => msg.id);
    const affectedConversations = [...new Set(messagesToUpdate.map(msg => msg.conversationId))];

    // Mark messages as delivered
    if (messageIds.length > 0) {
      await tx
        .update(messages)
        .set({
          status: 'delivered',
          updatedAt: new Date(),
        })
        .where(inArray(messages.id, messageIds));
    }

    return { 
      conversationIds: affectedConversations,
      messageIds: messageIds
    };
  });
}

  // Get or create conversation for a job application
  static async getOrCreateConversation(
    jobApplicationId: string,
    userId: string
  ) {
    // Get job application details
    const jobApplication = await db.query.jobApplications.findFirst({
      where: eq(jobApplications.id, jobApplicationId),
      with: {
        jobPost: {
          with: {
            user: { columns: { id: true } }
          }
        },
        healthcareUser: { columns: { id: true } }
      }
    });

    if (!jobApplication) {
      throw new Error('Job application not found');
    }

    // Verify user is part of this application
    const isJobPoster = jobApplication.jobPost.userId === userId;
    const isHealthcareWorker = jobApplication.healthcareUserId === userId;

    if (!isJobPoster && !isHealthcareWorker) {
      throw new Error('Access denied');
    }

    // Check if conversation already exists
    const existingConversation = await db.query.conversations.findFirst({
      where: eq(conversations.jobApplicationId, jobApplicationId),
      with: {
        jobApplication: {
          with: {
            jobPost: {
              columns: { id: true, title: true }
            }
          }
        },
        jobPoster: {
          columns: { id: true, name: true }
        },
        healthcareUser: {
          columns: { id: true, name: true }
        }
      }
    });

    if (existingConversation) {
      return {
        ...existingConversation,
        otherParticipant: userId === existingConversation.jobPosterId 
          ? existingConversation.healthcareUser 
          : existingConversation.jobPoster
      };
    }

    // Create new conversation
    const conversationData: CreateConversationData = {
      jobApplicationId,
      jobPosterId: jobApplication.jobPost.userId,
      healthcareUserId: jobApplication.healthcareUserId,
    };

    const newConversation = await this.createConversation(conversationData);

    // Return with additional details
    return await db.query.conversations.findFirst({
      where: eq(conversations.id, newConversation.id),
      with: {
        jobApplication: {
          with: {
            jobPost: {
              columns: { id: true, title: true }
            }
          }
        },
        jobPoster: {
          columns: { id: true, name: true }
        },
        healthcareUser: {
          columns: { id: true, name: true }
        }
      }
    });
  }

  // Block/unblock conversation
  static async toggleBlockConversation(
    conversationId: string,
    userId: string,
    block: boolean
  ) {
    return await db.transaction(async (tx) => {
      // Verify user has access to conversation
      const conversation = await tx.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          or(
            eq(conversations.jobPosterId, userId),
            eq(conversations.healthcareUserId, userId)
          )
        )
      });

      if (!conversation) {
        throw new Error('Conversation not found or access denied');
      }

      const updateData = block 
        ? { isBlocked: true, blockedBy: userId, blockedAt: new Date() }
        : { isBlocked: false, blockedBy: null, blockedAt: null };

      const [updatedConversation] = await tx
        .update(conversations)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId))
        .returning();

      return updatedConversation;
    });
  }

  // Archive/unarchive conversation
  static async toggleArchiveConversation(
    conversationId: string,
    userId: string,
    archive: boolean
  ) {
    // Verify user has access to conversation
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationId),
        or(
          eq(conversations.jobPosterId, userId),
          eq(conversations.healthcareUserId, userId)
        )
      )
    });

    if (!conversation) {
      throw new Error('Conversation not found or access denied');
    }

    const [updatedConversation] = await db
      .update(conversations)
      .set({
        isArchived: archive,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))
      .returning();

    return updatedConversation;
  }

  // Delete message (soft delete)
  static async deleteMessage(messageId: string, userId: string) {
    const message = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, messageId),
        eq(messages.senderId, userId), // Only sender can delete
        eq(messages.isDeleted, false)
      )
    });

    if (!message) {
      throw new Error('Message not found or access denied');
    }

    const [updatedMessage] = await db
      .update(messages)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    return updatedMessage;
  }

  // Edit message (only within 15 minutes and only text messages)
  static async editMessage(messageId: string, userId: string, newContent: string) {
    const message = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, messageId),
        eq(messages.senderId, userId),
        eq(messages.isDeleted, false)
      )
    });

    if (!message) {
      throw new Error('Message not found or access denied');
    }

    if (message.messageType !== 'text') {
      throw new Error('Only text messages can be edited');
    }

    // Check if message is within edit time limit (15 minutes)
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const editTimeLimit = 15 * 60 * 1000; // 15 minutes in milliseconds

    if (messageAge > editTimeLimit) {
      throw new Error('Message can only be edited within 15 minutes');
    }

    const [updatedMessage] = await db
      .update(messages)
      .set({
        content: newContent,
        editedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    return updatedMessage;
  }
}