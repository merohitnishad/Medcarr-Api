// server/socketServer.ts - Optimized version
import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { db } from "../../db/index.js";
import { users } from "../../db/schemas/usersSchema.js";
import { eq, and } from "drizzle-orm";
import { MessageService } from "../message/messageService.js";

// AWS Cognito configuration
const COGNITO_REGION = process.env.COGNITO_REGION || "eu-west-2";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_JWKS_URI = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

// JWKS client for Cognito public keys
const client = jwksClient({
  jwksUri: COGNITO_JWKS_URI,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

// Promisified version of Cognito token verification
const verifyCognitoToken = (token: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    const getKey = (header: any, callback: any) => {
      client.getSigningKey(header.kid, (err, key) => {
        if (err) {
          callback(err);
        } else {
          const signingKey = key?.getPublicKey();
          callback(null, signingKey);
        }
      });
    };

    jwt.verify(
      token,
      getKey,
      {
        audience: process.env.COGNITO_CLIENT_ID,
        issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
        algorithms: ["RS256"],
      },
      (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      },
    );
  });
};

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  cognitoSub?: string;
  currentConversation?: string;
}

interface OnlineUser {
  userId: string;
  socketId: string;
  name: string;
  lastSeen: Date;
}

class SocketManager {
  private io: SocketIOServer;
  private onlineUsers: Map<string, OnlineUser> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private userSocketMap: Map<string, string> = new Map(); // userId -> primary socketId

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        let token = socket.handshake.auth.token;

        if (!token) {
          const authHeader = socket.handshake.headers.authorization;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
          }
        }

        if (!token) {
          console.error("Socket auth failed: No token provided");
          return next(new Error("Authentication token required"));
        }

        const decoded = await verifyCognitoToken(token);
        const cognitoSub = decoded.sub;

        const dbUser = await db
          .select()
          .from(users)
          .where(eq(users.cognitoId, cognitoSub))
          .limit(1);

        if (dbUser.length === 0) {
          console.error(
            "Socket auth failed: User not found in database for cognitoId:",
            cognitoSub,
          );
          return next(new Error("User not found in database"));
        }

        const user = dbUser[0];
        socket.userId = user.id;
        socket.userRole = user.role;
        socket.cognitoSub = cognitoSub;

        next();
      } catch (error) {
        console.error("Socket authentication failed:", error);
        next(
          new Error(
            `Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          ),
        );
      }
    });
  }

  private setupEventHandlers() {
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      this.handleUserConnection(socket);
      this.setupSocketEvents(socket);
    });
  }

  private async handleUserConnection(socket: AuthenticatedSocket) {
    const userId = socket.userId!;

    try {
      const dbUser = await db
        .select({
          id: users.id,
          name: users.name,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const userName = dbUser[0]?.name || dbUser[0]?.role || "Unknown User";

      // Mark messages as delivered when user comes online
      const deliveryResult =
        await MessageService.markMessagesAsDelivered(userId);

      // Add user to online users
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);
      this.userSocketMap.set(userId, socket.id);

      this.onlineUsers.set(userId, {
        userId,
        socketId: socket.id,
        name: userName,
        lastSeen: new Date(),
      });

      socket.join(`user:${userId}`);

      // Notify all users about this user coming online
      this.io.emit("user:online", { userId, timestamp: new Date() });

      // Emit delivery updates for each conversation
      if (deliveryResult.conversationIds?.length > 0) {
        deliveryResult.conversationIds.forEach((conversationId) => {
          this.io
            .to(`conversation:${conversationId}`)
            .emit("messages:delivered", {
              userId,
              conversationId,
              timestamp: new Date(),
            });
        });
      }

      this.sendOnlineUsers(socket);
    } catch (error) {
      console.error("Error handling user connection:", error);
    }
  }

  private setupSocketEvents(socket: AuthenticatedSocket) {
    // Join conversation room
    socket.on("conversation:join", async (conversationId: string) => {
      try {
        socket.join(`conversation:${conversationId}`);
        socket.currentConversation = conversationId;

        this.emitUserJoinedConversation(socket.userId!, conversationId);

        // Auto-mark messages as read
        const readResult = await MessageService.markMessagesAsRead(
          conversationId,
          socket.userId!,
        );

        if (readResult.messageIds.length > 0) {
          socket.to(`conversation:${conversationId}`).emit("messages:read", {
            conversationId,
            readBy: socket.userId,
            timestamp: readResult.readTimestamp,
            messageIds: readResult.messageIds,
          });
        }

        // Mark message notifications as read
        await this.markMessageNotificationsAsRead(
          socket.userId!,
          conversationId,
        );

        this.emitUserActiveInConversation(socket.userId!, conversationId);
      } catch (error) {
        console.error("Error handling conversation join:", error);
      }
    });

    // Leave conversation room
    socket.on("conversation:leave", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      socket.currentConversation = undefined;
      this.emitUserLeftConversation(socket.userId!, conversationId);
    });

    // Handle new message
    socket.on("message:send", async (data) => {
      try {
        const message = await MessageService.sendMessage({
          ...data,
          senderId: socket.userId,
        });

        this.io.to(`conversation:${data.conversationId}`).emit("message:new", {
          message,
          conversationId: data.conversationId,
        });

        await this.handleMessageDeliveryAndNotification(
          data.conversationId,
          socket.userId!,
        );
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", {
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    });

    // Handle typing indicators
    socket.on("typing:start", (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit("typing:start", {
        userId: socket.userId,
        conversationId: data.conversationId,
      });
    });

    socket.on("typing:stop", (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit("typing:stop", {
        userId: socket.userId,
        conversationId: data.conversationId,
      });
    });

    // Handle message read status
    socket.on("messages:read", async (data: { conversationId: string }) => {
      try {
        const result = await MessageService.markMessagesAsRead(
          data.conversationId,
          socket.userId!,
        );

        socket.to(`conversation:${data.conversationId}`).emit("messages:read", {
          conversationId: data.conversationId,
          readBy: socket.userId,
          messageIds: result.messageIds,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error("Error marking messages as read:", error);
        socket.emit("error", { message: "Failed to mark messages as read" });
      }
    });

    // Handle message editing
    socket.on(
      "message:edit",
      async (data: { messageId: string; content: string }) => {
        try {
          const updatedMessage = await MessageService.editMessage(
            data.messageId,
            socket.userId!,
            data.content,
          );
          const conversationId = updatedMessage.conversationId;

          this.io.to(`conversation:${conversationId}`).emit("message:edited", {
            message: updatedMessage,
            conversationId,
          });
        } catch (error) {
          console.error("Error editing message:", error);
          socket.emit("message:error", {
            error:
              error instanceof Error ? error.message : "Failed to edit message",
          });
        }
      },
    );

    // Handle message deletion
    socket.on("message:delete", async (data: { messageId: string }) => {
      try {
        const deletedMessage = await MessageService.deleteMessage(
          data.messageId,
          socket.userId!,
        );
        const conversationId = deletedMessage.conversationId;

        this.io.to(`conversation:${conversationId}`).emit("message:deleted", {
          messageId: data.messageId,
          conversationId,
        });
      } catch (error) {
        console.error("Error deleting message:", error);
        socket.emit("message:error", {
          error:
            error instanceof Error ? error.message : "Failed to delete message",
        });
      }
    });

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      if (socket.currentConversation) {
        this.emitUserLeftConversation(
          socket.userId!,
          socket.currentConversation,
        );
      }
      this.handleUserDisconnection(socket);
    });

    socket.on("error", (error) => {
      console.error(`❌ Socket error for user ${socket.userId}:`, error);
    });
  }

  // Helper methods to reduce repetition
  private emitUserJoinedConversation(userId: string, conversationId: string) {
    this.io
      .to(`conversation:${conversationId}`)
      .emit("user:joined-conversation", {
        userId,
        conversationId,
        timestamp: new Date(),
      });
  }

  private emitUserLeftConversation(userId: string, conversationId: string) {
    this.io
      .to(`conversation:${conversationId}`)
      .emit("user:left-conversation", {
        userId,
        conversationId,
        timestamp: new Date(),
      });
  }

  private emitUserActiveInConversation(userId: string, conversationId: string) {
    this.io
      .to(`conversation:${conversationId}`)
      .emit("user:active-in-conversation", {
        userId,
        conversationId,
        timestamp: new Date(),
      });
  }

  private async handleMessageDeliveryAndNotification(
    conversationId: string,
    senderId: string,
  ) {
    try {
      const conversation =
        await MessageService.getConversationById(conversationId);
      const recipientId =
        senderId === conversation.jobPosterId
          ? conversation.healthcareUserId
          : conversation.jobPosterId;

      const recipientSocketId = this.userSocketMap.get(recipientId);
      const isRecipientOnline = this.isUserOnline(recipientId);

      // Update conversation list for recipient if they have a socket
      if (recipientSocketId) {
        const updatedConversations = await MessageService.getUserConversations(
          recipientId,
          { limit: 20 },
        );
        this.io.to(recipientSocketId).emit("conversations:updated", {
          conversations: updatedConversations.data,
        });
      }

      // Auto-mark as delivered if recipient is online
      if (isRecipientOnline) {
        try {
          const deliveryResult =
            await MessageService.markMessagesAsDelivered(recipientId);

          if (deliveryResult.conversationIds?.includes(conversationId)) {
            this.io
              .to(`conversation:${conversationId}`)
              .emit("messages:delivered", {
                userId: recipientId,
                conversationId,
                timestamp: new Date(),
              });
          }
        } catch (deliveryError) {
          console.error(`❌ Error auto-marking as delivered:`, deliveryError);
        }
      } else {
        console.log(
          `📴 Recipient ${recipientId} is offline - message will be delivered when they come online`,
        );
      }
    } catch (error) {
      console.error("Error handling message delivery and notification:", error);
    }
  }

  private async markMessageNotificationsAsRead(
    userId: string,
    conversationId: string,
  ) {
    try {
      const [{ NotificationService }, { notifications }] = await Promise.all([
        import("../notification/notificationService.js"),
        import("../../db/schemas/notificationSchema.js"),
      ]);

      const notificationsList = await db.query.notifications.findMany({
        where: and(
          eq(notifications.userId, userId),
          eq(notifications.type, "new_message_received"),
          eq(notifications.isRead, false),
          eq(notifications.isActive, true),
          eq(notifications.isDeleted, false),
        ),
      });

      const conversationNotifications = notificationsList.filter((notif) => {
        const metadata = notif.metadata as any;
        return metadata?.conversationId === conversationId;
      });

      for (const notification of conversationNotifications) {
        await NotificationService.markAsRead(notification.id, userId);
      }
    } catch (error) {
      console.error("Error marking message notifications as read:", error);
    }
  }

  private handleUserDisconnection(socket: AuthenticatedSocket) {
    const userId = socket.userId!;
    const userSocketSet = this.userSockets.get(userId);

    if (userSocketSet) {
      userSocketSet.delete(socket.id);

      // Update primary socket if needed
      if (this.userSocketMap.get(userId) === socket.id) {
        if (userSocketSet.size > 0) {
          const newPrimarySocket = Array.from(userSocketSet)[0];
          this.userSocketMap.set(userId, newPrimarySocket);
        } else {
          this.userSocketMap.delete(userId);
        }
      }

      // Mark user as offline if no more sockets
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
        this.onlineUsers.delete(userId);
        this.io.emit("user:offline", { userId, lastSeen: new Date() });
      }
    }
  }

  private sendOnlineUsers(socket: AuthenticatedSocket) {
    const onlineUsersList = Array.from(this.onlineUsers.values()).filter(
      (user) => user.userId !== socket.userId,
    );
    socket.emit("users:online", onlineUsersList);
  }

  // Public methods for external use
  public getOnlineUsers(): OnlineUser[] {
    return Array.from(this.onlineUsers.values());
  }

  public isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  public sendToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  public sendToConversation(conversationId: string, event: string, data: any) {
    this.io.to(`conversation:${conversationId}`).emit(event, data);
  }

  public sendNotificationToUser(userId: string, notification: any) {
    this.io.to(`user:${userId}`).emit("notification:new", { notification });
  }

  public sendNotificationReadEvent(userId: string, notificationId: string) {
    this.io
      .to(`user:${userId}`)
      .emit("notification:read", { notificationId, userId });
  }

  public sendNotificationCountUpdate(userId: string, unreadCount: number) {
    this.io
      .to(`user:${userId}`)
      .emit("notification:count-updated", { userId, unreadCount });
  }

  public isUserInConversation(userId: string, conversationId: string): boolean {
    const userSocketSet = this.userSockets.get(userId);
    if (!userSocketSet) return false;

    for (const socketId of userSocketSet) {
      const socket = this.io.sockets.sockets.get(
        socketId,
      ) as AuthenticatedSocket;
      if (socket && socket.currentConversation === conversationId) {
        return true;
      }
    }
    return false;
  }
}

let socketManager: SocketManager | null = null;

export const initializeSocketManager = (httpServer: HTTPServer) => {
  socketManager = new SocketManager(httpServer);
  (global as any).socketManager = socketManager;
  return socketManager;
};

export const getSocketManager = (): SocketManager | null => {
  return socketManager;
};

export default SocketManager;
