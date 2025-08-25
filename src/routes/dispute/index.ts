// routes/dispute/index.ts - Dispute management routes
import { Router, Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/authMiddleware.js";
import {
  requireAdminRole,
  requireNonAdmin,
} from "../../middlewares/roleAuth.js";
import {
  DisputeService,
  CreateDisputeData,
  UpdateDisputeStatusData,
  DisputeFilters,
  DisputeDocumentUpload,
} from "./disputeService.js";

const router = Router();

// =============================
// USER ROUTES (Healthcare & Job Posters)
// =============================

// Create a new dispute
router.post(
  "/create",
  requireNonAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const disputeData: CreateDisputeData = {
        ...req.body,
        reportedBy: userId,
      };

      // Validate required fields
      if (
        !disputeData.jobPostId ||
        !disputeData.reportedAgainst ||
        !disputeData.disputeType ||
        !disputeData.title ||
        !disputeData.description
      ) {
        res.status(400).json({
          success: false,
          error:
            "All fields are required: jobPostId, reportedAgainst, disputeType, title, description",
        });
        return;
      }

      if (disputeData.reportedBy === disputeData.reportedAgainst) {
        res.status(400).json({
          success: false,
          error: "You cannot report yourself",
        });
        return;
      }

      const dispute = await DisputeService.createDispute(disputeData);

      res.status(201).json({
        success: true,
        message: "Dispute created successfully",
        data: dispute,
      });
      return;
    } catch (error) {
      console.error("Error in create dispute route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create dispute",
      });
      return;
    }
  },
);

// Get user's own disputes (dashboard)
router.get(
  "/my-disputes",
  requireNonAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const filters: DisputeFilters = {
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
        status: req.query.status as string,
        disputeType: req.query.disputeType as string,
        submittedDate: req.query.submittedDate as string,
      };

      const result = await DisputeService.getUserDisputes(userId, filters);

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
      return;
    } catch (error) {
      console.error("Error in get user disputes route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch disputes",
      });
      return;
    }
  },
);

// Get specific dispute details
router.get(
  "/:disputeId",
  requireNonAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { disputeId } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const dispute = await DisputeService.getDispute(
        disputeId,
        userId,
        userRole,
      );

      res.json({
        success: true,
        data: dispute,
      });
      return;
    } catch (error) {
      console.error("Error in get dispute route:", error);
      if (
        error instanceof Error &&
        (error.message === "Dispute not found" ||
          error.message === "Access denied")
      ) {
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
  },
);

// =============================
// DOCUMENT UPLOAD ROUTES
// =============================

// Generate presigned URL for document upload
router.post(
  "/:disputeId/upload-url",
  requireNonAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { disputeId } = req.params;
      const userId = req.user!.id;
      const { fileName, contentType } = req.body;

      // Validate required fields
      if (!fileName || !contentType) {
        res.status(400).json({
          success: false,
          error: "fileName and contentType are required",
        });
        return;
      }

      const result = await DisputeService.generateDocumentUploadUrl(
        disputeId,
        userId,
        fileName,
        contentType,
      );

      res.json({
        success: true,
        message: "Upload URL generated successfully",
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in generate upload URL route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate upload URL",
      });
      return;
    }
  },
);

// Confirm document upload after S3 upload
router.post(
  "/:disputeId/confirm-upload",
  requireNonAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { disputeId } = req.params;
      const userId = req.user!.id;

      const documentData: DisputeDocumentUpload = {
        disputeId,
        uploadedBy: userId,
        ...req.body,
      };

      // Validate required fields
      if (
        !documentData.fileName ||
        !documentData.originalFileName ||
        !documentData.contentType
      ) {
        res.status(400).json({
          success: false,
          error: "fileName, originalFileName, and contentType are required",
        });
        return;
      }

      const document = await DisputeService.confirmDocumentUpload(documentData);

      res.json({
        success: true,
        message: "Document uploaded successfully",
        data: document,
      });
      return;
    } catch (error) {
      console.error("Error in confirm upload route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to confirm document upload",
      });
      return;
    }
  },
);

// Delete document
router.delete(
  "/documents/:documentId",
  requireNonAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const result = await DisputeService.deleteDocument(
        documentId,
        userId,
        userRole,
      );

      res.json({
        success: true,
        message: "Document deleted successfully",
        data: result,
      });
      return;
    } catch (error) {
      console.error("Error in delete document route:", error);
      if (
        error instanceof Error &&
        (error.message === "Document not found" ||
          error.message === "Access denied")
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
              : "Failed to delete document",
        });
      }
      return;
    }
  },
);

// =============================
// ADMIN ROUTES
// =============================

// Get all disputes (admin only)
router.get(
  "/admin/all",
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
  },
);

// Update dispute status (admin only)
router.patch(
  "/:disputeId/status",
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
        statusData,
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
  },
);

// Get dispute statistics (admin only)
router.get(
  "/admin/stats",
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
  },
);

// Get specific dispute details (admin view with full access)
router.get(
  "/admin/:disputeId",
  requireAdminRole,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { disputeId } = req.params;
      const adminId = req.user!.id;

      const dispute = await DisputeService.getDispute(
        disputeId,
        adminId,
        "admin",
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
  },
);

export default router;
