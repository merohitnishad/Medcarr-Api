// services/notificationService.ts
import { db } from "../../db/index.js";
import {
  notifications,
  NOTIFICATION_TEMPLATES,
  NotificationTemplate,
} from "../../db/schemas/notificationSchema.js";
import { users } from "../../db/schemas/usersSchema.js";
import { eq, and, desc, count, asc, or } from "drizzle-orm";
import nodemailer from "nodemailer";
import { getSocketManager } from "../message/socketServer.js";

export interface CreateNotificationData {
  userId: string;
  type: string;
  title?: string;
  message?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  jobPostId?: string;
  jobApplicationId?: string;
  relatedUserId?: string;
  metadata?: any;
  actionUrl?: string;
  actionLabel?: string;
  scheduledFor?: Date;
  expiresAt?: Date;
  sendEmail?: boolean;
  messageCount?: number;
  disputeId?: string; // For message notifications, to track count of messages
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
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  static async testEmailConnection() {
    try {
      await this.emailTransporter.verify();
      console.log("Email transporter is ready");
      return true;
    } catch (error) {
      console.error("Email transporter verification failed:", error);
      return false;
    }
  }

  private static validateEmailConfig() {
    const config = {
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      from: process.env.EMAIL_FROM
    };
    
    console.log("Email config:", {
      host: config.host,
      port: config.port,
      user: config.user ? '***' : 'missing',
      pass: config.pass ? '***' : 'missing',
      from: config.from
    });
    
    return config.host && config.port && config.user && config.pass;
  }

  // Create a notification
  static async createNotification(data: CreateNotificationData, tx?: any) {
    const dbInstance = tx || db;

    const executeQuery = async (queryFn: any) => {
      if (tx) {
        return await queryFn(tx);
      } else {
        return await db.transaction(queryFn);
      }
    };
    return await executeQuery(async (transaction: any) => {
      // Use template if type matches
      const template =
        NOTIFICATION_TEMPLATES[data.type.toUpperCase().replace(" ", "_")];

      const notificationData = {
        userId: data.userId,
        type: data.type as any,
        title: data.title || template?.title || "Notification",
        message:
          data.message || template?.message || "You have a new notification",
        priority: data.priority || template?.priority || "normal",
        jobPostId: data.jobPostId,
        jobApplicationId: data.jobApplicationId,
        relatedUserId: data.relatedUserId,
        disputeId: data.disputeId,
        metadata: data.metadata,
        actionUrl: data.actionUrl || template?.actionUrl,
        actionLabel: data.actionLabel || template?.actionLabel,
        scheduledFor: data.scheduledFor,
        expiresAt: data.expiresAt,
      };

      // Create notification
      const [notification] = await transaction
      .insert(notifications)
      .values(notificationData)
      .returning();
      
      // Send email if requested
      if (data.sendEmail !== false && notification.id) {
        if (!this.validateEmailConfig()) {
          console.error("Email configuration is incomplete");
          return notification;
        }
        
        try {
          await this.sendEmailNotification(notification.id, transaction);
        } catch (emailError) {
          console.error("Email sending failed:", emailError);
        }
      }

      // NEW: Emit real-time notification if user is online
      const socketManager = global.socketManager;
      if (socketManager && socketManager.isUserOnline(data.userId)) {
        // Get full notification data with relations for the socket event
        const fullNotification = await transaction.query.notifications.findFirst({ // Use transaction instead of tx
          where: eq(notifications.id, notification.id),
          with: {
            relatedUser: {
              columns: { id: true, name: true, email: true },
            },
            jobPost: {
              columns: { id: true, title: true, type: true },
            },
            jobApplication: {
              columns: { id: true, status: true },
            },
          },
        });
      

        if (fullNotification) {
          socketManager.sendNotificationToUser(data.userId, fullNotification);

          // Also send updated unread count
          const unreadCount = await this.getUnreadCount(data.userId);
          socketManager.sendNotificationCountUpdate(data.userId, unreadCount);
        } else {
          console.log("Full notification not found");
        }
      }

      return notification;
    });
  }

  // Create notification using template
  static async createFromTemplate(
    templateKey: string,
    userId: string,
    replacements: Record<string, string> = {},
    additionalData: Partial<CreateNotificationData> = {},
    tx?: any // Add this parameter
  ) {
    const template = NOTIFICATION_TEMPLATES[templateKey];
    if (!template) {
      throw new Error(`Notification template ${templateKey} not found`);
    }

    // Special handling for message notifications
    if (
      template.type === "new_message_received" &&
      additionalData.metadata?.conversationId
    ) {
      return await this.handleMessageNotification(
        template,
        userId,
        replacements,
        additionalData
      );
    }

    // Regular notification creation for non-message types
    let title = template.title;
    let message = template.message;
    let actionUrl = template.actionUrl;

    Object.entries(replacements).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      title = title.replace(new RegExp(placeholder, "g"), value);
      message = message.replace(new RegExp(placeholder, "g"), value);
      if (actionUrl) {
        actionUrl = actionUrl.replace(new RegExp(placeholder, "g"), value);
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
    }, tx);
  }

  // NEW METHOD - Handle message notification creation/update
  private static async handleMessageNotification(
    template: NotificationTemplate,
    userId: string,
    replacements: Record<string, string>,
    additionalData: Partial<CreateNotificationData>
  ) {
    const conversationId = additionalData.metadata?.conversationId;
    const jobPostId = additionalData.jobPostId;
    const senderId = additionalData.relatedUserId; // The person sending the message

    // CHANGE 2: Check if recipient is online and active in conversation
    const socketManager = global.socketManager;
    const isRecipientOnline = socketManager?.isUserOnline(userId);
    const isRecipientInConversation = socketManager?.isUserInConversation(
      userId,
      conversationId
    );

    // CHANGE 3: If user is online and in the conversation, don't create/update notification
    if (isRecipientOnline && isRecipientInConversation) {
      return null; // Don't create notification
    }

    // Build where conditions dynamically
    const whereConditions = [
      eq(notifications.userId, userId),
      eq(notifications.type, "new_message_received"),
      eq(notifications.isRead, false),
      eq(notifications.isActive, true),
      eq(notifications.isDeleted, false),
    ];

    if (jobPostId) {
      whereConditions.push(eq(notifications.jobPostId, jobPostId));
    }

    // Look for existing unread message notification for this conversation
    const existingNotification = await db.query.notifications.findFirst({
      where: and(...whereConditions),
      orderBy: [desc(notifications.createdAt)],
    });

    // Check if existing notification matches this conversation
    const existingMetadata = existingNotification?.metadata as any;
    const matchingNotification =
      existingMetadata?.conversationId === conversationId
        ? existingNotification
        : null;

    if (matchingNotification) {
      // CHANGE 4: Add time check - don't update if last update was very recent (< 30 seconds)
      const lastUpdated = new Date(matchingNotification.updatedAt).getTime();
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdated;

      // If updated within last 30 seconds, don't update again
      if (timeSinceLastUpdate < 30000) {
        return matchingNotification;
      }

      // Update existing notification
      const currentMetadata = (matchingNotification.metadata as any) || {};
      const newCount = (matchingNotification.messageCount || 1) + 1;
      const senderName = replacements.senderName || "Someone";
      const messagePreview = replacements.messagePreview || "";

      const [updatedNotification] = await db
        .update(notifications)
        .set({
          title:
            newCount > 1
              ? `New messages from ${senderName}`
              : `New message from ${senderName}`,
          message: newCount > 1 ? `Latest: ${messagePreview}` : messagePreview,
          messageCount: newCount,
          updatedAt: new Date(),
          metadata: {
            ...currentMetadata,
            conversationId,
            latestMessagePreview: messagePreview,
            latestSenderName: senderName,
          },
        })
        .where(eq(notifications.id, matchingNotification.id))
        .returning();

      // CHANGE 5: Only send socket update if user is online but NOT in conversation
      if (socketManager && isRecipientOnline && !isRecipientInConversation) {
        const fullNotification = await db.query.notifications.findFirst({
          where: eq(notifications.id, updatedNotification.id),
          with: {
            relatedUser: { columns: { id: true, name: true, email: true } },
            jobPost: { columns: { id: true, title: true, type: true } },
            jobApplication: { columns: { id: true, status: true } },
          },
        });

        if (fullNotification) {
          socketManager.sendNotificationToUser(userId, fullNotification);
          const unreadCount = await this.getUnreadCount(userId);
          socketManager.sendNotificationCountUpdate(userId, unreadCount);
        }
      }

      return updatedNotification;
    } else {
      // Create new notification only if user is not actively in conversation
      let title = template.title;
      let message = template.message;
      let actionUrl = template.actionUrl;

      Object.entries(replacements).forEach(([key, value]) => {
        const placeholder = `{${key}}`;
        title = title.replace(new RegExp(placeholder, "g"), value);
        message = message.replace(new RegExp(placeholder, "g"), value);
        if (actionUrl) {
          actionUrl = actionUrl.replace(new RegExp(placeholder, "g"), value);
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
        messageCount: 1,
        ...additionalData,
      });
    }
  }

  // Get user notifications with pagination
  static async getUserNotifications(
    userId: string,
    filters: NotificationFilters = {}
  ) {
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
          },
        },
        jobPost: {
          columns: {
            id: true,
            title: true,
            type: true,
          },
        },
        jobApplication: {
          columns: {
            id: true,
            status: true,
          },
        },
        dispute: {
          columns: {
            id: true,
            disputeNumber: true,
            status: true,
            title: true,
          },
        },
      },
      orderBy: [desc(notifications.createdAt)],
      limit,
      offset,
    });

    return {
      data: results,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
        hasNext: page < Math.ceil(totalCount.count / limit),
        hasPrev: page > 1,
      },
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
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        )
      )
      .returning();

    if (!updatedNotification) {
      throw new Error("Notification not found or access denied");
    }

    // NEW: Use global socketManager instead of getSocketManager()
    const socketManager = global.socketManager;
    if (socketManager && socketManager.isUserOnline(userId)) {
      socketManager.sendNotificationReadEvent(userId, notificationId);

      // Send updated unread count
      const unreadCount = await this.getUnreadCount(userId);
      socketManager.sendNotificationCountUpdate(userId, unreadCount);
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
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false))
      )
      .returning();

    // NEW: Use global socketManager instead of getSocketManager()
    const socketManager = global.socketManager;
    if (socketManager && socketManager.isUserOnline(userId)) {
      // Send count update (should be 0 now)
      socketManager.sendNotificationCountUpdate(userId, 0);
    }

    return updatedNotifications;
  }

  // Get unread notification count
  static async getUnreadCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
          eq(notifications.isActive, true),
          eq(notifications.isDeleted, false)
        )
      );

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
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        )
      )
      .returning();

    if (!deletedNotification) {
      throw new Error("Notification not found or access denied");
    }

    return deletedNotification;
  }

  // Send email notification
  static async sendEmailNotification(notificationId: string, tx?: any) {
    try {
      let notification;
      
      if (tx) {
        // When using transaction, use the transaction's query method
        notification = await tx.query.notifications.findFirst({
          where: eq(notifications.id, notificationId),
          with: {
            user: {
              columns: {
                email: true,
                name: true,
              },
            },
          },
        });
      } else {
        // When not using transaction, use db directly
        notification = await db.query.notifications.findFirst({
          where: eq(notifications.id, notificationId),
          with: {
            user: {
              columns: {
                email: true,
                name: true,
              },
            },
          },
        });
      }
  
      if (!notification || !notification.user?.email) {
        console.log("No notification or email found for:", notificationId);
        return false;
      }
    
      const emailHtml = this.generateEmailTemplate(notification);
  
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_FROM || "noreply@careconnect.com",
        to: notification.user.email,
        subject: notification.title,
        html: emailHtml,
      });
    
      // Mark email as sent - use appropriate db instance
      if (tx) {
        await tx
          .update(notifications)
          .set({
            isEmailSent: true,
            emailSentAt: new Date(),
          })
          .where(eq(notifications.id, notificationId));
      } else {
        await db
          .update(notifications)
          .set({
            isEmailSent: true,
            emailSentAt: new Date(),
          })
          .where(eq(notifications.id, notificationId));
      }
  
      return true;
    } catch (error) {
      console.error("Error sending email notification:", error);
      throw error;
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
          <div class="content ${
            notification.priority === "high" ||
            notification.priority === "urgent"
              ? `priority-${notification.priority}`
              : ""
          }">
            <h2>${notification.title}</h2>
            <p>${notification.message}</p>
            ${
              notification.actionUrl
                ? `<a href="${process.env.FRONTEND_URL}${
                    notification.actionUrl
                  }" class="button">${
                    notification.actionLabel || "View Details"
                  }</a>`
                : ""
            }
            <p><small>Received: ${new Date(
              notification.createdAt
            ).toLocaleString()}</small></p>
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
    notificationData: Omit<CreateNotificationData, "userId">
  ) {
    const notifications = userIds.map((userId) => ({
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
      .where(
        and(eq(notifications.isRead, true), eq(notifications.isDeleted, false))
      )
      .returning();

    return deletedNotifications.length;
  }

  static async getDisputeNotifications(
    disputeId: string,
    userRole: string,
    userId?: string
  ) {
    const conditions = [
      eq(notifications.disputeId, disputeId),
      eq(notifications.isDeleted, false),
    ];

    // If not admin, only show notifications for the specific user
    if (userRole !== "admin" && userId) {
      conditions.push(eq(notifications.userId, userId));
    }

    return await db.query.notifications.findMany({
      where: and(...conditions),
      with: {
        user: {
          columns: { id: true, name: true, role: true },
        },
        relatedUser: {
          columns: { id: true, name: true, role: true },
        },
        dispute: {
          columns: { id: true, disputeNumber: true, status: true, title: true },
        },
      },
      orderBy: [desc(notifications.createdAt)],
    });
  }
}
