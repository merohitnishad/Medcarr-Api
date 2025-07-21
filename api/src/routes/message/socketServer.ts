// server/socketServer.ts
import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { db } from "../../db/index.js";
import { users } from "../../db/schemas/usersSchema.js";
import { eq } from "drizzle-orm";
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
      }
    );
  });
};

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  cognitoSub?: string;
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

  private getSocketIdByUserId(userId: string): string | undefined {
    return this.userSocketMap.get(userId);
  }

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
    // Cognito authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        // Get token from handshake
        let token = socket.handshake.auth.token;

        // Also check headers as fallback
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

        // Verify Cognito JWT token
        const decoded = await verifyCognitoToken(token);

        // Extract user info from Cognito token
        const cognitoSub = decoded.sub;
        const email = decoded.email;
        const cognitoUsername = decoded["cognito:username"] || decoded.username;

        // Get user from database
        const dbUser = await db
          .select()
          .from(users)
          .where(eq(users.cognitoId, cognitoSub))
          .limit(1);

        if (dbUser.length === 0) {
          console.error(
            "Socket auth failed: User not found in database for cognitoId:",
            cognitoSub
          );
          return next(new Error("User not found in database"));
        }

        const user = dbUser[0];

        // Attach user info to socket
        socket.userId = user.id;
        socket.userRole = user.role;
        socket.cognitoSub = cognitoSub;

        next();
      } catch (error) {
        console.error("Socket authentication failed:", error);
        if (error instanceof Error) {
          next(new Error(`Authentication failed: ${error.message}`));
        } else {
          next(new Error("Authentication failed"));
        }
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
      // Get user details from database
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
      const deliveryResult = await MessageService.markMessagesAsDelivered(
        userId
      );

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

      // Join user to their personal room
      socket.join(`user:${userId}`);


      // Notify ALL users about this user coming online
      this.io.emit("user:online", { userId, timestamp: new Date() });

      // IMPORTANT: Emit delivery updates for EACH conversation separately
      if (
        deliveryResult.conversationIds &&
        deliveryResult.conversationIds.length > 0
      ) {
        deliveryResult.conversationIds.forEach((conversationId) => {
          // Emit to the specific conversation room with conversationId
          this.io
            .to(`conversation:${conversationId}`)
            .emit("messages:delivered", {
              userId,
              conversationId, // Include the conversationId
              timestamp: new Date(),
            });
        });
      }
      // Send complete online users list to the newly connected user
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

        // Auto-mark messages as read when user joins the conversation
        const readResult = await MessageService.markMessagesAsRead(
          conversationId,
          socket.userId!
        );

        if (readResult.messageIds.length > 0) {
          // Notify other participants that messages were read
          socket.to(`conversation:${conversationId}`).emit("messages:read", {
            conversationId,
            readBy: socket.userId,
            timestamp: readResult.readTimestamp,
            messageIds: readResult.messageIds,
          });
        }
      } catch (error) {
        console.error("Error handling conversation join:", error);
      }
    });

    // Leave conversation room
    socket.on("conversation:leave", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Handle new message
    socket.on("message:send", async (data) => {
      try {
        // Send the message
        const message = await MessageService.sendMessage({
          ...data,
          senderId: socket.userId,
        });
          
        // Emit new message to conversation participants
        this.io.to(`conversation:${data.conversationId}`).emit("message:new", {
          message,
          conversationId: data.conversationId,
        });

        // GET RECIPIENT USER ID
        const conversation = await MessageService.getConversationById(
          data.conversationId
        );
        const recipientId =
          socket.userId === conversation.jobPosterId
            ? conversation.healthcareUserId
            : conversation.jobPosterId;

        // CHECK IF RECIPIENT IS ONLINE
        const recipientSocketId = this.getSocketIdByUserId(recipientId);
        const isRecipientOnline = this.isUserOnline(recipientId);


        if (recipientSocketId) {
          // FETCH AND SEND UPDATED CONVERSATION LIST TO RECIPIENT
          const updatedConversations =
            await MessageService.getUserConversations(recipientId, {
              limit: 20,
            });

          this.io.to(recipientSocketId).emit("conversations:updated", {
            conversations: updatedConversations.data,
          });
        }

        if (isRecipientOnline) {
            // AUTO-MARK MESSAGE AS DELIVERED if recipient is online
            
            try {
              const deliveryResult = await MessageService.markMessagesAsDelivered(recipientId);
              
              if (deliveryResult.conversationIds && 
                Array.isArray(deliveryResult.conversationIds) && 
                deliveryResult.conversationIds.includes(data.conversationId as string)) {
              // Emit delivery event to the conversation
              const deliveryEventData = {
                userId: recipientId,
                conversationId: data.conversationId,
                timestamp: new Date(),
              };
              
              this.io.to(`conversation:${data.conversationId}`).emit("messages:delivered", deliveryEventData);
            }
            } catch (deliveryError) {
              console.error(`❌ Error auto-marking as delivered:`, deliveryError);
            }
            
            // FETCH AND SEND UPDATED CONVERSATION LIST TO RECIPIENT
            const updatedConversations = await MessageService.getUserConversations(recipientId, {
              limit: 20,
            });
      
            this.io.to(recipientSocketId as string).emit("conversations:updated", {
              conversations: updatedConversations.data,
            });
          } else {
            console.log(`📴 Recipient ${recipientId} is offline - message will be delivered when they come online`);
          }
      } catch (error) {
        console.error("Error sending message:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        socket.emit("error", { message: errorMessage });
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
          socket.userId!
        );

        // Notify other participants that messages were read
        socket.to(`conversation:${data.conversationId}`).emit("messages:read", {
          conversationId: data.conversationId,
          readBy: socket.userId,
          messageIds: result.messageIds, // Add this
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
            data.content
          );

          // Get conversation ID from message
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
      }
    );

    // Handle message deletion
    socket.on("message:delete", async (data: { messageId: string }) => {
      try {
        const deletedMessage = await MessageService.deleteMessage(
          data.messageId,
          socket.userId!
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
      this.handleUserDisconnection(socket);
    });

    // Handle errors
    socket.on("error", (error) => {
      console.error(`❌ Socket error for user ${socket.userId}:`, error);
    });
  }

  private handleUserDisconnection(socket: AuthenticatedSocket) {
    const userId = socket.userId!;

    // Remove socket from user's socket set
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);

      // If this was the primary socket, update it
      if (this.userSocketMap.get(userId) === socket.id) {
        if (userSocketSet.size > 0) {
          // Set another socket as primary
          const newPrimarySocket = Array.from(userSocketSet)[0];
          this.userSocketMap.set(userId, newPrimarySocket);
        } else {
          // No more sockets, remove from map
          this.userSocketMap.delete(userId);
        }
      }

      // If no more sockets for this user, mark as offline
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
        this.onlineUsers.delete(userId);

        // Notify ALL users about this user going offline
        this.io.emit("user:offline", {
          userId,
          lastSeen: new Date(),
        });
      }
    }
  }

  private sendOnlineUsers(socket: AuthenticatedSocket) {
    const onlineUsersList = Array.from(this.onlineUsers.values()).filter(
      (user) => user.userId !== socket.userId
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

  // NEW: Send notification to specific user
  public sendNotificationToUser(userId: string, notification: any) {
    this.io.to(`user:${userId}`).emit("notification:new", {
      notification,
    });
  }

  // NEW: Send notification read event
  public sendNotificationReadEvent(userId: string, notificationId: string) {
    this.io.to(`user:${userId}`).emit("notification:read", {
      notificationId,
      userId,
    });
  }

  // NEW: Send notification count update
  public sendNotificationCountUpdate(userId: string, unreadCount: number) {
    this.io.to(`user:${userId}`).emit("notification:count-updated", {
      userId,
      unreadCount,
    });
  }
}

let socketManager: SocketManager | null = null;

export const initializeSocketManager = (httpServer: HTTPServer) => {
  socketManager = new SocketManager(httpServer);
  return socketManager;
};

export const getSocketManager = (): SocketManager | null => {
  return socketManager;
};

export default SocketManager;
