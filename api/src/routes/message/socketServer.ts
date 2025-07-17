// server/socketServer.ts
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { MessageService } from '../message/messageService.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
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

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.userId = decoded.user_id;
        socket.userRole = decoded.role;
        
        next();
      } catch (error) {
        next(new Error('Invalid authentication token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.userId} connected with socket ${socket.id}`);
      
      this.handleUserConnection(socket);
      this.setupSocketEvents(socket);
    });
  }

  private handleUserConnection(socket: AuthenticatedSocket) {
    const userId = socket.userId!;
    
    // Add user to online users
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);
    
    this.onlineUsers.set(userId, {
      userId,
      socketId: socket.id,
      name: '', // You might want to fetch this from database
      lastSeen: new Date()
    });

    // Join user to their personal room
    socket.join(`user:${userId}`);
    
    // Notify about user going online
    socket.broadcast.emit('user:online', { userId, timestamp: new Date() });
    
    // Send online users list to the connected user
    this.sendOnlineUsers(socket);
  }

  private setupSocketEvents(socket: AuthenticatedSocket) {
    // Join conversation room
    socket.on('conversation:join', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`User ${socket.userId} joined conversation ${conversationId}`);
    });

    // Leave conversation room
    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`User ${socket.userId} left conversation ${conversationId}`);
    });

    // Handle new message
    socket.on('message:send', async (data: {
      conversationId: string;
      content: string;
      messageType?: 'text' | 'image' | 'file';
      replyToMessageId?: string;
    }) => {
      try {
        const messageData = {
          conversationId: data.conversationId,
          senderId: socket.userId!,
          content: data.content,
          messageType: data.messageType || 'text',
          replyToMessageId: data.replyToMessageId,
        };

        // Save message to database
        const message = await MessageService.sendMessage(messageData);
        
        // Emit to all users in the conversation room
        this.io.to(`conversation:${data.conversationId}`).emit('message:new', {
          message,
          conversationId: data.conversationId
        });

        // Also emit to specific users (in case they're not in the room)
        this.notifyConversationParticipants(data.conversationId, 'message:new', {
          message,
          conversationId: data.conversationId
        });

      } catch (error) {
        socket.emit('message:error', { 
          error: error instanceof Error ? error.message : 'Failed to send message' 
        });
      }
    });

    // Handle typing indicators
    socket.on('typing:start', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
        userId: socket.userId,
        conversationId: data.conversationId
      });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
        userId: socket.userId,
        conversationId: data.conversationId
      });
    });

    // Handle message read status
    socket.on('messages:read', async (data: { conversationId: string }) => {
      try {
        await MessageService.markMessagesAsRead(data.conversationId, socket.userId!);
        
        // Notify other participants that messages were read
        socket.to(`conversation:${data.conversationId}`).emit('messages:read', {
          conversationId: data.conversationId,
          readBy: socket.userId,
          timestamp: new Date()
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to mark messages as read' });
      }
    });

    // Handle message editing
    socket.on('message:edit', async (data: { messageId: string; content: string }) => {
      try {
        const updatedMessage = await MessageService.editMessage(data.messageId, socket.userId!, data.content);
        
        // Get conversation ID from message
        const conversationId = updatedMessage.conversationId;
        
        this.io.to(`conversation:${conversationId}`).emit('message:edited', {
          message: updatedMessage,
          conversationId
        });
      } catch (error) {
        socket.emit('message:error', { 
          error: error instanceof Error ? error.message : 'Failed to edit message' 
        });
      }
    });

    // Handle message deletion
    socket.on('message:delete', async (data: { messageId: string }) => {
      try {
        const deletedMessage = await MessageService.deleteMessage(data.messageId, socket.userId!);
        
        const conversationId = deletedMessage.conversationId;
        
        this.io.to(`conversation:${conversationId}`).emit('message:deleted', {
          messageId: data.messageId,
          conversationId
        });
      } catch (error) {
        socket.emit('message:error', { 
          error: error instanceof Error ? error.message : 'Failed to delete message' 
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      this.handleUserDisconnection(socket);
    });
  }

  private handleUserDisconnection(socket: AuthenticatedSocket) {
    const userId = socket.userId!;
    console.log(`User ${userId} disconnected from socket ${socket.id}`);
    
    // Remove socket from user's socket set
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      
      // If no more sockets for this user, mark as offline
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
        this.onlineUsers.delete(userId);
        
        // Notify about user going offline
        socket.broadcast.emit('user:offline', { 
          userId, 
          lastSeen: new Date() 
        });
      }
    }
  }

  private sendOnlineUsers(socket: AuthenticatedSocket) {
    const onlineUsersList = Array.from(this.onlineUsers.values())
      .filter(user => user.userId !== socket.userId);
    
    socket.emit('users:online', onlineUsersList);
  }

  private async notifyConversationParticipants(conversationId: string, event: string, data: any) {
    // You might want to get conversation participants from database
    // and send notifications to their personal rooms
    // This is a backup mechanism in case they're not in the conversation room
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
}

export default SocketManager;