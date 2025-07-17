// services/notificationService.ts
import { conversations } from "../../db/schemas/messageSchema.js";
import { db } from "../../db/index.js";
import { notifications, NOTIFICATION_TEMPLATES, NotificationTemplate } from "../../db/schemas/notificationSchema.js";
import { users } from "../../db/schemas/usersSchema.js";
import { eq, and, desc, count, asc, or, gt } from "drizzle-orm";
import nodemailer from 'nodemailer';
import { messages } from "../../db/schemas/messageSchema.js";

export interface CreateNotificationData {
  userId: string;
  type: string;
  title?: string;
  message?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  jobPostId?: string;
  jobApplicationId?: string;
  relatedUserId?: string;
  metadata?: any;
  actionUrl?: string;
  actionLabel?: string;
  scheduledFor?: Date;
  expiresAt?: Date;
  sendEmail?: boolean;
}

export interface NotificationFilters {
  page?: number;
  limit?: number;
  isRead?: boolean;
  type?: string;
  priority?: string;
}

export class NotificationService {
  // Email configuration (configure as per your email service)
  private static emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Create a notification
  static async createNotification(data: CreateNotificationData) {
    return await db.transaction(async (tx) => {
      // Use template if type matches
      const template = NOTIFICATION_TEMPLATES[data.type.toUpperCase().replace(' ', '_')];
      
      const notificationData = {
        userId: data.userId,
        type: data.type as any,
        title: data.title || template?.title || 'Notification',
        message: data.message || template?.message || 'You have a new notification',
        priority: data.priority || template?.priority || 'normal',
        jobPostId: data.jobPostId,
        jobApplicationId: data.jobApplicationId,
        relatedUserId: data.relatedUserId,
        metadata: data.metadata,
        actionUrl: data.actionUrl || template?.actionUrl,
        actionLabel: data.actionLabel || template?.actionLabel,
        scheduledFor: data.scheduledFor,
        expiresAt: data.expiresAt,
      };

      // Create notification
      const [notification] = await tx
        .insert(notifications)
        .values(notificationData)
        .returning();

      // Send email if requested
      if (data.sendEmail !== false) {
        await this.sendEmailNotification(notification.id);
      }

      return notification;
    });
  }

  // Create notification using template
  static async createFromTemplate(
    templateKey: string,
    userId: string,
    replacements: Record<string, string> = {},
    additionalData: Partial<CreateNotificationData> = {}
  ) {
    const template = NOTIFICATION_TEMPLATES[templateKey];
    if (!template) {
      throw new Error(`Notification template ${templateKey} not found`);
    }

    // Replace placeholders in title and message
    let title = template.title;
    let message = template.message;
    let actionUrl = template.actionUrl;

    Object.entries(replacements).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      title = title.replace(new RegExp(placeholder, 'g'), value);
      message = message.replace(new RegExp(placeholder, 'g'), value);
      if (actionUrl) {
        actionUrl = actionUrl.replace(new RegExp(placeholder, 'g'), value);
      }
    });

    return await this.createNotification({
      userId,
      type: template.type,
      title,
      message,
      priority: template.priority,
      actionUrl,
      actionLabel: template.actionLabel,
      ...additionalData,
    });
  }

  // Get user notifications with pagination
  static async getUserNotifications(userId: string, filters: NotificationFilters = {}) {
    const { page = 1, limit = 20, isRead, type, priority } = filters;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(notifications.userId, userId),
      eq(notifications.isActive, true),
      eq(notifications.isDeleted, false),
    ];

    if (isRead !== undefined) {
      conditions.push(eq(notifications.isRead, isRead));
    }

    if (type) {
      conditions.push(eq(notifications.type, type as any));
    }

    if (priority) {
      conditions.push(eq(notifications.priority, priority as any));
    }

    // Count total notifications
    const [totalCount] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(...conditions));

    // Get notifications with relations
    const results = await db.query.notifications.findMany({
      where: and(...conditions),
      with: {
        relatedUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          }
        },
        jobPost: {
          columns: {
            id: true,
            title: true,
            type: true,
          }
        },
        jobApplication: {
          columns: {
            id: true,
            status: true,
          }
        }
      },
      orderBy: [desc(notifications.createdAt)],
      limit,
      offset
    });

    return {
      data: results,
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

  // Mark notification as read
  static async markAsRead(notificationId: string, userId: string) {
    const [updatedNotification] = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      ))
      .returning();

    if (!updatedNotification) {
      throw new Error('Notification not found or access denied');
    }

    return updatedNotification;
  }

  // Mark all notifications as read for a user
  static async markAllAsRead(userId: string) {
    const updatedNotifications = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ))
      .returning();

    return updatedNotifications;
  }

  // Get unread notification count
  static async getUnreadCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        eq(notifications.isActive, true),
        eq(notifications.isDeleted, false)
      ));

    return result.count;
  }

  // Delete notification
  static async deleteNotification(notificationId: string, userId: string) {
    const [deletedNotification] = await db
      .update(notifications)
      .set({
        isDeleted: true,
        updatedAt: new Date(),
      })
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      ))
      .returning();

    if (!deletedNotification) {
      throw new Error('Notification not found or access denied');
    }

    return deletedNotification;
  }

  // Send email notification
  static async sendEmailNotification(notificationId: string) {
    try {
      const notification = await db.query.notifications.findFirst({
        where: eq(notifications.id, notificationId),
        with: {
          user: {
            columns: {
              email: true,
              name: true,
            }
          }
        }
      });

      if (!notification || !notification.user?.email) {
        return false;
      }

      const emailHtml = this.generateEmailTemplate(notification);

      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@careconnect.com',
        to: notification.user.email,
        subject: notification.title,
        html: emailHtml,
      });

      // Mark email as sent
      await db
        .update(notifications)
        .set({
          isEmailSent: true,
          emailSentAt: new Date(),
        })
        .where(eq(notifications.id, notificationId));

      return true;
    } catch (error) {
      console.error('Error sending email notification:', error);
      return false;
    }
  }

  // Generate email template
  private static generateEmailTemplate(notification: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .button { 
            display: inline-block; 
            padding: 10px 20px; 
            background-color: #007bff; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 10px 0;
          }
          .priority-high { border-left: 4px solid #dc3545; }
          .priority-urgent { border-left: 4px solid #fd7e14; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CareConnect Notification</h1>
          </div>
          <div class="content ${notification.priority === 'high' || notification.priority === 'urgent' ? `priority-${notification.priority}` : ''}">
            <h2>${notification.title}</h2>
            <p>${notification.message}</p>
            ${notification.actionUrl ? `<a href="${process.env.FRONTEND_URL}${notification.actionUrl}" class="button">${notification.actionLabel || 'View Details'}</a>` : ''}
            <p><small>Received: ${new Date(notification.createdAt).toLocaleString()}</small></p>
          </div>
          <div class="footer">
            <p>This is an automated message from CareConnect. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Bulk notifications for multiple users
  static async createBulkNotifications(
    userIds: string[],
    notificationData: Omit<CreateNotificationData, 'userId'>
  ) {
    const notifications = userIds.map(userId => ({
      userId,
      ...notificationData,
    }));

    const results = [];
    for (const notif of notifications) {
      const result = await this.createNotification(notif);
      results.push(result);
    }

    return results;
  }

  // Clean up old notifications (can be called via cron job)
  static async cleanupOldNotifications(daysOld: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const deletedNotifications = await db
      .update(notifications)
      .set({
        isDeleted: true,
        updatedAt: new Date(),
      })
      .where(and(
        eq(notifications.isRead, true),
        eq(notifications.isDeleted, false)
      ))
      .returning();

    return deletedNotifications.length;
  }

  // Handle message notifications - create or update conversation notification
  static async handleMessageNotification(
    conversationId: string,
    senderId: string,
    recipientId: string,
    senderName: string,
    jobTitle: string,
    jobPostId: string,
    jobApplicationId: string
  ) {
    return await db.transaction(async (tx) => {
      // Check if there's already an unread conversation notification for this user and conversation
      const existingNotification = await tx.query.notifications.findFirst({
        where: and(
          eq(notifications.userId, recipientId),
          eq(notifications.type, 'conversation_unread_messages'),
          eq(notifications.isRead, false),
          eq(notifications.isActive, true),
          eq(notifications.isDeleted, false),
          eq(notifications.metadata, JSON.stringify({ conversationId }))
        )
      });

      // Count unread messages from sender in this conversation
      const unreadCount = await this.getUnreadMessageCount(conversationId, recipientId, senderId);

      if (existingNotification) {
        // Update existing notification with new count and timestamp
        const [updatedNotification] = await tx
          .update(notifications)
          .set({
            title: 'Unread Messages',
            message: `You have ${unreadCount} unread message(s) from ${senderName} about "${jobTitle}"`,
            updatedAt: new Date(),
            createdAt: new Date(), // Update timestamp to move to top
          })
          .where(eq(notifications.id, existingNotification.id))
          .returning();

        return updatedNotification;
      } else {
        // Create new notification
        const notificationData = {
          userId: recipientId,
          type: 'conversation_unread_messages' as any,
          title: 'Unread Messages',
          message: `You have ${unreadCount} unread message(s) from ${senderName} about "${jobTitle}"`,
          priority: 'normal' as any,
          jobPostId,
          jobApplicationId,
          relatedUserId: senderId,
          actionUrl: `/messages/${conversationId}`,
          actionLabel: 'View Messages',
          metadata: { conversationId, unreadCount },
        };

        const [notification] = await tx
          .insert(notifications)
          .values(notificationData)
          .returning();

        return notification;
      }
    });
  }

  // Helper method to count unread messages
  private static async getUnreadMessageCount(
    conversationId: string, 
    recipientId: string, 
    senderId: string
  ): Promise<number> {
    // Get the conversation to check last read timestamp
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId)
    });

    if (!conversation) return 0;

    const lastReadAt = recipientId === conversation.jobPosterId 
      ? conversation.jobPosterLastReadAt 
      : conversation.healthcareLastReadAt;

    const conditions = [
      eq(messages.conversationId, conversationId),
      eq(messages.senderId, senderId), // Only count messages from the sender
      eq(messages.isDeleted, false),
    ];

    if (lastReadAt) {
      conditions.push(gt(messages.createdAt, lastReadAt));
    }

    const [result] = await db
      .select({ count: count() })
      .from(messages)
      .where(and(...conditions));

    return result.count;
  }

  // Mark conversation notification as read when user opens conversation
  static async markConversationNotificationAsRead(conversationId: string, userId: string) {
    const [updatedNotification] = await db
      .update(notifications)
      .set({
        isRead: true,
        readAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'conversation_unread_messages'),
        eq(notifications.isRead, false),
        eq(notifications.metadata, JSON.stringify({ conversationId }))
      ))
      .returning();

    return updatedNotification;
  }

}