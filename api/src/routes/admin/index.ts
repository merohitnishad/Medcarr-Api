// routes/admin/index.ts
import { Router, Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/authMiddleware.js";
import { requireAdminRole } from "../../middlewares/roleAuth.js";
import { AdminService, UpdateDisputeStatusData } from "./adminService.js";
import { DisputeFilters, DisputeService } from "../dispute/disputeService.js";

const router = Router();

// ==================== DASHBOARD & STATS ====================

// Get admin dashboard statistics
router.get(
  "/dashboard/stats",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user!.id;

      const stats = await AdminService.getDashboardStats(adminId);

      res.json({
        success: true,
        data: stats,
      });
      return;
    } catch (error) {
      console.error("Error in dashboard stats route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch dashboard statistics",
      });
      return;
    }
  }
);

// Get user role distribution
router.get(
  "/dashboard/user-distribution",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user!.id;

      const distribution = await AdminService.getUserRoleDistribution(adminId);

      res.json({
        success: true,
        data: distribution,
      });
      return;
    } catch (error) {
      console.error("Error in user distribution route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch user distribution",
      });
      return;
    }
  }
);

// Get recent activity
router.get(
  "/dashboard/recent-activity",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user!.id;
      const { limit = 10 } = req.query;

      const activity = await AdminService.getRecentActivity(
        adminId,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: activity,
      });
      return;
    } catch (error) {
      console.error("Error in recent activity route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch recent activity",
      });
      return;
    }
  }
);

// ==================== USER REQUESTS ====================

// Get user verification requests
router.get(
  "/user-requests",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { page = 1, limit = 20, role = "all", search = "" } = req.query;

      const result = await AdminService.getUserRequests({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        role: role as string,
        searchTerm: search as string,
      });

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in user requests route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch user requests",
      });
      return;
    }
  }
);

// Verify user DBS
router.post(
  "/user-requests/:userId/verify-dbs",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const adminId = req.user!.id;

      const updatedUser = await AdminService.verifyUserDBS(adminId, userId);
      const sanitizedUser = AdminService.sanitizeAdminData(updatedUser);

      res.json({
        success: true,
        message: "User DBS verified successfully",
        data: sanitizedUser,
      });
      return;
    } catch (error) {
      console.error("Error in verify DBS route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else if (error instanceof Error && error.message === "User not found") {
        res.status(404).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to verify DBS",
        });
      }
      return;
    }
  }
);

// Verify user profile
router.post(
  "/user-requests/:userId/verify-profile",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const adminId = req.user!.id;

      const updatedUser = await AdminService.verifyUserProfile(adminId, userId);
      const sanitizedUser = AdminService.sanitizeAdminData(updatedUser);

      res.json({
        success: true,
        message: "User profile verified successfully",
        data: sanitizedUser,
      });
      return;
    } catch (error) {
      console.error("Error in verify profile route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else if (error instanceof Error && error.message === "User not found") {
        res.status(404).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to verify profile",
        });
      }
      return;
    }
  }
);

// ==================== USERS MANAGEMENT ====================

// Get individuals with job details
router.get(
  "/users/individuals",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { page = 1, limit = 20, search = "" } = req.query;

      const result = await AdminService.getIndividuals({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        searchTerm: search as string,
      });

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in get individuals route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch individuals",
      });
      return;
    }
  }
);

// Get organizations with job details
router.get(
  "/users/organizations",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { page = 1, limit = 20, search = "" } = req.query;

      const result = await AdminService.getOrganizations({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        searchTerm: search as string,
      });

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in get organizations route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch organizations",
      });
      return;
    }
  }
);

// Get healthcare providers with job applications
router.get(
  "/users/healthcare",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { page = 1, limit = 20, search = "" } = req.query;

      const result = await AdminService.getHealthcareProviders({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        searchTerm: search as string,
      });

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in get healthcare providers route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch healthcare providers",
      });
      return;
    }
  }
);

// ==================== NEW JOB MANAGEMENT ROUTES ====================

// Get all jobs with applicants (admin overview)
router.get(
  "/jobs/all",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user!.id;
      const { page = 1, limit = 20, status = "all", search = "" } = req.query;

      const result = await AdminService.getAllJobsWithApplicants(adminId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        status: status as string,
        searchTerm: search as string,
      });

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in get all jobs route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to fetch jobs",
        });
      }
      return;
    }
  }
);

// Get jobs for specific job poster
router.get(
  "/jobs/job-poster/:userId",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const adminId = req.user!.id;
      const { page = 1, limit = 20, status = "all" } = req.query;

      const result = await AdminService.getJobsForJobPoster(adminId, userId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        status: status as string,
      });

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in get jobs for job poster route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch jobs for user",
        });
      }
      return;
    }
  }
);

// Get applied jobs for specific healthcare provider
router.get(
  "/jobs/healthcare/:userId/applications",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const adminId = req.user!.id;
      const { page = 1, limit = 20, status = "all" } = req.query;

      const result = await AdminService.getAppliedJobsForHealthcare(
        adminId,
        userId,
        {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          status: status as string,
        }
      );

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in get applied jobs for healthcare route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch applications",
        });
      }
      return;
    }
  }
);

// Get reviews for specific healthcare provider
router.get(
  "/reviews/healthcare/:userId",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const adminId = req.user!.id;
      const { page = 1, limit = 20, includePrivate = "true" } = req.query;

      const result = await AdminService.getReviewsForHealthcare(
        adminId,
        userId,
        {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          includePrivate: includePrivate === "true",
        }
      );

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in get reviews for healthcare route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to fetch reviews",
        });
      }
      return;
    }
  }
);
// ==================== DISPUTES MANAGEMENT ====================

// Get all disputes
router.get(
  "/dispute/all",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filters: DisputeFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as string,
        disputeType: req.query.disputeType as string,
      };

      const result = await DisputeService.getAllDisputes(filters);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
      return;
    } catch (error) {
      console.error("Error in get all disputes route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch disputes",
      });
      return;
    }
  }
);

// Update dispute status (admin only)
router.patch(
  "/dispute/:disputeId/status",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { disputeId } = req.params;
      const adminId = req.user!.id;
      const statusData: UpdateDisputeStatusData = req.body;

      // Validate required fields
      if (
        !statusData.status ||
        !["in_review", "resolved", "dismissed"].includes(statusData.status)
      ) {
        res.status(400).json({
          success: false,
          error: "Valid status (in_review, resolved, or dismissed) is required",
        });
        return;
      }

      // Validate resolution description for resolved/dismissed statuses
      if (
        (statusData.status === "resolved" ||
          statusData.status === "dismissed") &&
        !statusData.resolutionDescription
      ) {
        res.status(400).json({
          success: false,
          error:
            "Resolution description is required for resolved or dismissed disputes",
        });
        return;
      }

      const updatedDispute = await DisputeService.updateDisputeStatus(
        disputeId,
        adminId,
        statusData
      );

      res.json({
        success: true,
        message: `Dispute status updated to ${statusData.status} successfully`,
        data: updatedDispute,
      });
      return;
    } catch (error) {
      console.error("Error in update dispute status route:", error);
      if (
        error instanceof Error &&
        (error.message === "Dispute not found" ||
          error.message.includes("Access denied"))
      ) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update dispute status",
        });
      }
      return;
    }
  }
);

// Get dispute statistics (admin only)
router.get(
  "/dispute/stats",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await DisputeService.getDisputeStats();

      res.json({
        success: true,
        data: stats,
      });
      return;
    } catch (error) {
      console.error("Error in get dispute stats route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch dispute statistics",
      });
      return;
    }
  }
);

// Get specific dispute details (admin view with full access)
router.get(
  "/dispute/:disputeId",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { disputeId } = req.params;
      const adminId = req.user!.id;

      const dispute = await DisputeService.getDispute(
        disputeId,
        adminId,
        "admin"
      );

      res.json({
        success: true,
        data: dispute,
      });
      return;
    } catch (error) {
      console.error("Error in get dispute admin route:", error);
      if (error instanceof Error && error.message === "Dispute not found") {
        res.status(404).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Failed to fetch dispute",
        });
      }
      return;
    }
  }
);

// ==================== NOTIFICATIONS ====================

// Get admin notifications
router.get(
  "/notifications",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user!.id;
      const { page = 1, limit = 50, isRead, type = "all" } = req.query;

      const readFilter = isRead !== undefined ? isRead === "true" : undefined;

      const result = await AdminService.getAdminNotifications(adminId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        isRead: readFilter,
        type: type as string,
      });

      res.json({
        success: true,
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in get admin notifications route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch notifications",
        });
      }
      return;
    }
  }
);

// Mark notification as read
router.patch(
  "/notifications/:notificationId/read",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { notificationId } = req.params;
      const adminId = req.user!.id;

      const success = await AdminService.markNotificationAsRead(
        adminId,
        notificationId
      );

      if (!success) {
        res.status(404).json({
          success: false,
          error: "Notification not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "Notification marked as read",
      });
      return;
    } catch (error) {
      console.error("Error in mark notification as read route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to mark notification as read",
        });
      }
      return;
    }
  }
);

// Mark all notifications as read
router.patch(
  "/notifications/read-all",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user!.id;

      const updatedCount = await AdminService.markAllNotificationsAsRead(
        adminId
      );

      res.json({
        success: true,
        message: `${updatedCount} notifications marked as read`,
        data: { updatedCount },
      });
      return;
    } catch (error) {
      console.error("Error in mark all notifications as read route:", error);
      if (error instanceof Error && error.message.includes("Access denied")) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to mark all notifications as read",
        });
      }
      return;
    }
  }
);

// ==================== ADMIN PROFILE ====================

// Get admin profile info
router.get(
  "/profile",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const adminId = req.user!.id;

      const adminInfo = await AdminService.getAdminInfo(adminId);

      if (!adminInfo) {
        res.status(404).json({
          success: false,
          error: "Admin profile not found",
        });
        return;
      }

      const sanitizedAdmin = AdminService.sanitizeAdminData(adminInfo);

      res.json({
        success: true,
        data: sanitizedAdmin,
      });
      return;
    } catch (error) {
      console.error("Error in get admin profile route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch admin profile",
      });
      return;
    }
  }
);

export default router;
