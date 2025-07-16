// routes/messages/index.ts
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware.js';
import { 
  MessageService,
  SendMessageData,
  MessageFilters,
  ConversationFilters
} from './messageService.js';
import { requireNonAdmin } from '../../middlewares/roleAuth.js';
const router = Router();

// =============================
// CONVERSATION ROUTES
// =============================

// Get user's conversations
router.get('/conversations',requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const filters: ConversationFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      archived: req.query.archived === 'true',
      blocked: req.query.blocked === 'true',
    };

    const result = await MessageService.getUserConversations(userId, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get conversations route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations'
    });
    return;
  }
});

// Get or create conversation for a job application
router.get('/job-application/:applicationId', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user!.id;

    const conversation = await MessageService.getOrCreateConversation(applicationId, userId);

    res.json({
      success: true,
      data: conversation
    });
    return;
  } catch (error) {
    console.error('Error in get/create conversation route:', error);
    if (error instanceof Error && (error.message === 'Job application not found' || error.message === 'Access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to get conversation'
      });
    }
    return;
  }
});

// Get conversation messages
router.get('/:conversationId/messages', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.id;
    const filters: MessageFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      before: req.query.before as string,
      after: req.query.after as string,
    };

    const result = await MessageService.getConversationMessages(conversationId, userId, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get messages route:', error);
    if (error instanceof Error && (error.message === 'Conversation not found or access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch messages'
      });
    }
    return;
  }
});

// Mark messages as read
router.patch('/:conversationId/read',requireNonAdmin,  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.id;

    const result = await MessageService.markMessagesAsRead(conversationId, userId);

    res.json({
      success: true,
      message: 'Messages marked as read',
      data: result
    });
    return;
  } catch (error) {
    console.error('Error in mark messages as read route:', error);
    if (error instanceof Error && (error.message === 'Conversation not found or access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to mark messages as read'
      });
    }
    return;
  }
});

// Block/unblock conversation
router.patch('/:conversationId/block', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.id;
    const { block } = req.body;

    if (typeof block !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Block status (true/false) is required'
      });
      return;
    }

    const updatedConversation = await MessageService.toggleBlockConversation(conversationId, userId, block);

    res.json({
      success: true,
      message: `Conversation ${block ? 'blocked' : 'unblocked'} successfully`,
      data: updatedConversation
    });
    return;
  } catch (error) {
    console.error('Error in block conversation route:', error);
    if (error instanceof Error && (error.message === 'Conversation not found or access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update conversation block status'
      });
    }
    return;
  }
});

// Archive/unarchive conversation
router.patch('/:conversationId/archive', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.id;
    const { archive } = req.body;

    if (typeof archive !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Archive status (true/false) is required'
      });
      return;
    }

    const updatedConversation = await MessageService.toggleArchiveConversation(conversationId, userId, archive);

    res.json({
      success: true,
      message: `Conversation ${archive ? 'archived' : 'unarchived'} successfully`,
      data: updatedConversation
    });
    return;
  } catch (error) {
    console.error('Error in archive conversation route:', error);
    if (error instanceof Error && (error.message === 'Conversation not found or access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update conversation archive status'
      });
    }
    return;
  }
});

// =============================
// MESSAGE ROUTES
// =============================

// Send a message
router.post('/:conversationId/messages', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.id;
    
    const messageData: SendMessageData = {
      conversationId,
      senderId: userId,
      content: req.body.content,
      messageType: req.body.messageType || 'text',
      fileName: req.body.fileName,
      fileSize: req.body.fileSize,
      mimeType: req.body.mimeType,
      replyToMessageId: req.body.replyToMessageId,
    };

    // Validate required fields
    if (!messageData.content || messageData.content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
      return;
    }

    if (messageData.content.length > 1000) {
      res.status(400).json({
        success: false,
        error: 'Message content cannot exceed 1000 characters'
      });
      return;
    }

    const message = await MessageService.sendMessage(messageData);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
    return;
  } catch (error) {
    console.error('Error in send message route:', error);
    if (error instanceof Error && (
      error.message === 'Conversation not found or is blocked' ||
      error.message === 'Access denied' ||
      error.message === 'Reply message not found'
    )) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message'
      });
    }
    return;
  }
});

// Edit a message
router.patch('/messages/:messageId', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user!.id;
    const { content } = req.body;

    // Validate required fields
    if (!content || content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
      return;
    }

    if (content.length > 1000) {
      res.status(400).json({
        success: false,
        error: 'Message content cannot exceed 1000 characters'
      });
      return;
    }

    const updatedMessage = await MessageService.editMessage(messageId, userId, content);

    res.json({
      success: true,
      message: 'Message updated successfully',
      data: updatedMessage
    });
    return;
  } catch (error) {
    console.error('Error in edit message route:', error);
    if (error instanceof Error && (
      error.message === 'Message not found or access denied' ||
      error.message === 'Only text messages can be edited' ||
      error.message === 'Message can only be edited within 15 minutes'
    )) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to edit message'
      });
    }
    return;
  }
});

// Delete a message
router.delete('/messages/:messageId', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user!.id;

    const deletedMessage = await MessageService.deleteMessage(messageId, userId);

    res.json({
      success: true,
      message: 'Message deleted successfully',
      data: deletedMessage
    });
    return;
  } catch (error) {
    console.error('Error in delete message route:', error);
    if (error instanceof Error && error.message === 'Message not found or access denied') {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete message'
      });
    }
    return;
  }
});

// =============================
// UTILITY ROUTES
// =============================

// Get conversation statistics (for dashboard)
router.get('/stats', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get total conversations and unread count
    const [totalConversations, archivedConversations] = await Promise.all([
      MessageService.getUserConversations(userId, { limit: 1 }),
      MessageService.getUserConversations(userId, { limit: 1, archived: true })
    ]);

    // Get unread conversations count
    const unreadConversations = await MessageService.getUserConversations(userId, { limit: 100 });
    const unreadCount = unreadConversations.data.reduce((sum, conv) => sum + conv.unreadCount, 0);

    res.json({
      success: true,
      data: {
        totalConversations: totalConversations.pagination.total,
        archivedConversations: archivedConversations.pagination.total,
        unreadMessages: unreadCount,
        activeConversations: totalConversations.pagination.total - archivedConversations.pagination.total
      }
    });
    return;
  } catch (error) {
    console.error('Error in get stats route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch message statistics'
    });
    return;
  }
});

export default router;