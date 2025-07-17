// routes/notifications/index.ts - Common notification routes for all users
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware.js';
import { requireNonAdmin } from '../../middlewares/roleAuth.js';
import { NotificationService, NotificationFilters } from '../notification/notificationService.js';

const router = Router();

// Get user notifications
router.get('/', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const filters: NotificationFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      isRead: req.query.isRead ? req.query.isRead === 'true' : undefined,
      type: req.query.type as string,
      priority: req.query.priority as string,
    };

    const result = await NotificationService.getUserNotifications(userId, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get notifications route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
    return;
  }
});

// Get unread notification count
router.get('/unread-count', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await NotificationService.getUnreadCount(userId);

    res.json({
      success: true,
      data: { count }
    });
    return;
  } catch (error) {
    console.error('Error in get unread count route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count'
    });
    return;
  }
});

// Mark notification as read
router.patch('/:notificationId/read', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user!.id;

    const updatedNotification = await NotificationService.markAsRead(notificationId, userId);

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: updatedNotification
    });
    return;
  } catch (error) {
    console.error('Error in mark as read route:', error);
    if (error instanceof Error && error.message === 'Notification not found or access denied') {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read'
      });
    }
    return;
  }
});

// Mark all notifications as read
router.patch('/mark-all-read', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const updatedNotifications = await NotificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: `${updatedNotifications.length} notifications marked as read`,
      data: { count: updatedNotifications.length }
    });
    return;
  } catch (error) {
    console.error('Error in mark all as read route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read'
    });
    return;
  }
});

// Delete notification
router.delete('/:notificationId', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user!.id;

    const deletedNotification = await NotificationService.deleteNotification(notificationId, userId);

    res.json({
      success: true,
      message: 'Notification deleted successfully',
      data: deletedNotification
    });
    return;
  } catch (error) {
    console.error('Error in delete notification route:', error);
    if (error instanceof Error && error.message === 'Notification not found or access denied') {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete notification'
      });
    }
    return;
  }
});

// Get notification types and priorities (for filtering)
router.get('/options', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notificationTypes = [
      'job_application',
      'application_accepted',
      'application_rejected',
      'application_cancelled',
      'job_started',
      'job_completed',
      'job_cancelled_by_poster',
      'job_cancelled_by_healthcare',
      'payment_processed',
      'report_submitted',
      'system_announcement'
    ];

    const priorities = ['low', 'normal', 'high', 'urgent'];

    res.json({
      success: true,
      data: {
        types: notificationTypes,
        priorities: priorities
      }
    });
    return;
  } catch (error) {
    console.error('Error in get notification options route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification options'
    });
    return;
  }
});

export default router;