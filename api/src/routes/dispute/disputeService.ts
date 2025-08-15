// services/disputeService.ts
import { db } from "../../db/index.js";
import { disputes, disputeDocuments } from "../../db/schemas/disputeSchema.js";
import { jobPosts } from "../../db/schemas/jobSchema.js";
import { users } from "../../db/schemas/usersSchema.js";
import { eq, and, desc, count, or, inArray, gte, lte } from "drizzle-orm";
import { S3Service } from "../../utils/s3UploadService.js";
import { NotificationService } from "../notification/notificationService.js";

export interface CreateDisputeData {
  jobPostId: string;
  reportedBy: string;
  reportedAgainst: string;
  disputeType: string;
  title: string;
  description: string;
}

export interface UpdateDisputeStatusData {
  status: "in_review" | "resolved" | "dismissed";
  adminNotes?: string;
  resolutionDescription?: string;
  assignedToAdmin?: string;
}

export interface DisputeFilters {
  page?: number;
  limit?: number;
  status?: string;
  disputeType?: string;
  userId?: string;
  submittedDate?: string;
}

export interface DisputeDocumentUpload {
  disputeId: string;
  fileName: string;
  originalFileName: string;
  contentType: string;
  uploadedBy: string;
}

export class DisputeService {
  // Generate unique dispute number
  private static generateDisputeNumber(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const random = Math.floor(Math.random() * 9999)
      .toString()
      .padStart(4, "0");

    return `DSP-${year}${month}${day}-${random}`;
  }

  // Create a new dispute
  static async createDispute(data: CreateDisputeData) {
    return await db.transaction(async (tx) => {
      // Validate job post exists and users are involved
      const jobPost = await tx.query.jobPosts.findFirst({
        where: and(
          eq(jobPosts.id, data.jobPostId),
          eq(jobPosts.isDeleted, false)
        ),
        with: {
          user: {
            columns: { id: true, name: true, role: true },
          },
        },
      });

      if (!jobPost) {
        throw new Error("Job post not found or no longer available");
      }

      // Validate that reporter is involved in the job
      const isJobPoster = jobPost.userId === data.reportedBy;
      const isHealthcareWorker = jobPost.userId === data.reportedAgainst;

      if (!isJobPoster && !isHealthcareWorker) {
        throw new Error(
          "You can only report disputes for jobs you are involved in"
        );
      }

      // Validate that reported against user exists
      const reportedAgainstUser = await tx.query.users.findFirst({
        where: eq(users.id, data.reportedAgainst),
        columns: { id: true, name: true, role: true },
      });

      if (!reportedAgainstUser) {
        throw new Error("Reported user not found");
      }

      // Check for existing open dispute between same users for same job
      const existingDispute = await tx.query.disputes.findFirst({
        where: and(
          eq(disputes.jobPostId, data.jobPostId),
          eq(disputes.reportedBy, data.reportedBy),
          eq(disputes.reportedAgainst, data.reportedAgainst),
          eq(disputes.status, "open"),
          eq(disputes.isDeleted, false)
        ),
      });

      if (existingDispute) {
        throw new Error(
          "You already have an open dispute against this user for this job"
        );
      }

      // Generate unique dispute number
      let disputeNumber: string;
      let isUnique = false;
      let attempts = 0;

      do {
        disputeNumber = this.generateDisputeNumber();
        const existing = await tx.query.disputes.findFirst({
          where: eq(disputes.disputeNumber, disputeNumber),
        });
        isUnique = !existing;
        attempts++;
      } while (!isUnique && attempts < 10);

      if (!isUnique) {
        throw new Error("Unable to generate unique dispute number");
      }

      // Create dispute
      const [dispute] = await tx
        .insert(disputes)
        .values({
          disputeNumber: disputeNumber!,
          jobPostId: data.jobPostId,
          reportedBy: data.reportedBy,
          reportedAgainst: data.reportedAgainst,
          disputeType: data.disputeType as any,
          title: data.title,
          description: data.description,
          status: "open",
        })
        .returning();


      // Create notification for admins (you might want to implement admin notification logic)
      try {
        // Find first admin user
        const adminUser = await tx.query.users.findFirst({
          where: eq(users.role, "admin"),
          columns: { id: true }
        });
      
        if (adminUser) {
          await NotificationService.createFromTemplate(
            "DISPUTE_CREATED",
            adminUser.id, // Use the found admin user ID
            {
              disputeNumber: dispute.disputeNumber,
              jobTitle: jobPost.title,
              reporterName: data.reportedBy,
            },
            {
              disputeId: dispute.id,
              jobPostId: data.jobPostId,
              relatedUserId: data.reportedBy,
              sendEmail: true,
              metadata: {
                disputeType: data.disputeType,
              }
            }
          );
        }
      } catch (notificationError) {
        console.error("Failed to create admin notification:", notificationError);
        // Continue without failing the dispute creation
      }

      return dispute;
    });
  }

  // Get dispute by ID with access control
  static async getDispute(disputeId: string, userId: string, userRole: string) {
    const dispute = await db.query.disputes.findFirst({
      where: and(eq(disputes.id, disputeId), eq(disputes.isDeleted, false)),
      with: {
        jobPost: {
          columns: {
            id: true,
            title: true,
            jobDate: true,
            address: true,
          },
        },
        reportedByUser: {
          columns: { id: true, name: true, role: true },
        },
        reportedAgainstUser: {
          columns: { id: true, name: true, role: true },
        },
        assignedAdmin: {
          columns: { id: true, name: true },
        },
        documents: {
          where: eq(disputeDocuments.isDeleted, false),
          with: {
            uploadedByUser: {
              columns: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!dispute) {
      throw new Error("Dispute not found");
    }

    // Access control: only involved parties and admins can view
    const hasAccess =
      dispute.reportedBy === userId ||
      dispute.reportedAgainst === userId ||
      userRole === "admin";

    if (!hasAccess) {
      throw new Error("Access denied");
    }

    return dispute;
  }

  // Get user's disputes (for dashboard)
  static async getUserDisputes(userId: string, filters: DisputeFilters = {}) {
    const {
      page = 1,
      limit = 10,
      status,
      disputeType,
      submittedDate,
    } = filters;
    const offset = (page - 1) * limit;

    const conditions = [
      or(
        eq(disputes.reportedBy, userId)
        // eq(disputes.reportedAgainst, userId)
      ),
      eq(disputes.isDeleted, false),
    ];

    if (status) {
      conditions.push(eq(disputes.status, status as any));
    }

    if (disputeType) {
      conditions.push(eq(disputes.disputeType, disputeType as any));
    }

    if (submittedDate) {
      const filterDate = new Date(submittedDate);
      const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999));
      conditions.push(
        and(
          gte(disputes.reportedAt, startOfDay),
          lte(disputes.reportedAt, endOfDay)
        )
      );
    }

    const [totalCount] = await db
      .select({ count: count() })
      .from(disputes)
      .where(and(...conditions));

    const results = await db.query.disputes.findMany({
      where: and(...conditions),
      with: {
        jobPost: {
          columns: {
            id: true,
            title: true,
            jobDate: true,
          },
        },
        reportedByUser: {
          columns: { id: true, name: true, role: true },
        },
        reportedAgainstUser: {
          columns: { id: true, name: true, role: true },
        },
        documents: {
          where: eq(disputeDocuments.isDeleted, false),
          columns: { id: true, fileName: true, uploadedAt: true },
        },
      },
      orderBy: [desc(disputes.createdAt)],
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

  // Get all disputes (for admin)
  static async getAllDisputes(filters: DisputeFilters = {}) {
    const { page = 1, limit = 10, status, disputeType } = filters;
    const offset = (page - 1) * limit;

    const conditions = [eq(disputes.isDeleted, false)];

    if (status) {
      conditions.push(eq(disputes.status, status as any));
    }

    if (disputeType) {
      conditions.push(eq(disputes.disputeType, disputeType as any));
    }

    const [totalCount] = await db
      .select({ count: count() })
      .from(disputes)
      .where(and(...conditions));

    const results = await db.query.disputes.findMany({
      where: and(...conditions),
      with: {
        jobPost: {
          columns: {
            id: true,
            title: true,
            jobDate: true,
          },
        },
        reportedByUser: {
          columns: { id: true, name: true, role: true },
        },
        reportedAgainstUser: {
          columns: { id: true, name: true, role: true },
        },
        assignedAdmin: {
          columns: { id: true, name: true },
        },
        documents: {
          where: eq(disputeDocuments.isDeleted, false),
          columns: { id: true, fileName: true, uploadedAt: true },
        },
      },
      orderBy: [desc(disputes.createdAt)],
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

  // Update dispute status (admin only)
  static async updateDisputeStatus(
    disputeId: string,
    adminId: string,
    data: UpdateDisputeStatusData
  ) {
    return await db.transaction(async (tx) => {
      // Verify admin role
      const admin = await tx.query.users.findFirst({
        where: eq(users.id, adminId),
        columns: { id: true, role: true },
      });

      if (!admin || admin.role !== "admin") {
        throw new Error("Access denied: Admin role required");
      }

      // Get dispute
      const dispute = await tx.query.disputes.findFirst({
        where: and(eq(disputes.id, disputeId), eq(disputes.isDeleted, false)),
        with: {
          reportedByUser: {
            columns: { id: true, name: true },
          },
          reportedAgainstUser: {
            columns: { id: true, name: true },
          },
          jobPost: {
            columns: { id: true, title: true },
          },
        },
      });

      if (!dispute) {
        throw new Error("Dispute not found");
      }

      // Prepare update data
      const updateData: any = {
        status: data.status,
        updatedAt: new Date(),
      };

      if (data.adminNotes) {
        updateData.adminNotes = data.adminNotes;
      }

      if (data.assignedToAdmin) {
        updateData.assignedToAdmin = data.assignedToAdmin;
      }

      // Set timestamps based on status
      if (data.status === "in_review" && dispute.status === "open") {
        updateData.reviewStartedAt = new Date();
        updateData.assignedToAdmin = adminId;
      }

      if (data.status === "resolved" || data.status === "dismissed") {
        updateData.resolvedAt = new Date();
        updateData.resolutionDescription = data.resolutionDescription;
      }

      // Update dispute
      const [updatedDispute] = await tx
        .update(disputes)
        .set(updateData)
        .where(eq(disputes.id, disputeId))
        .returning();

      // Create notifications for involved parties
      const notificationPromises = [];

      // Notify reporter
      notificationPromises.push(
        NotificationService.createFromTemplate(
          "DISPUTE_STATUS_UPDATED",
          dispute.reportedBy,
          {
            disputeNumber: dispute.disputeNumber,
            newStatus: data.status,
            jobTitle: dispute.jobPost.title,
          },
          {
            disputeId: dispute.id,
            jobPostId: dispute.jobPostId,
            relatedUserId: adminId,
            sendEmail: true,
            metadata: {
              oldStatus: dispute.status,
              newStatus: data.status,
            },
          }
        )
      );

      // Notify reported against user
      // notificationPromises.push(
      //   NotificationService.createFromTemplate(
      //     "DISPUTE_STATUS_UPDATED",
      //     dispute.reportedAgainst,
      //     {
      //       disputeNumber: dispute.disputeNumber,
      //       newStatus: data.status,
      //       jobTitle: dispute.jobPost.title,
      //     },
      //     {
      //       disputeId: dispute.id,
      //       jobPostId: dispute.jobPostId,
      //       relatedUserId: adminId,
      //       sendEmail: true,
      //       metadata: {
      //         oldStatus: dispute.status,
      //         newStatus: data.status,
      //       }
      //     }
      //   )
      // );

      try {
        await Promise.all(notificationPromises);
      } catch (notificationError) {
        console.error("Failed to create notifications:", notificationError);
        // Continue without failing the status update
      }

      return updatedDispute;
    });
  }

  // Generate presigned URL for document upload
  static async generateDocumentUploadUrl(
    disputeId: string,
    userId: string,
    fileName: string,
    contentType: string
  ) {
    // Verify dispute exists and user has access
    const dispute = await db.query.disputes.findFirst({
      where: and(eq(disputes.id, disputeId), eq(disputes.isDeleted, false)),
      columns: {
        id: true,
        reportedBy: true,
        reportedAgainst: true,
        status: true,
      },
    });

    if (!dispute) {
      throw new Error("Dispute not found");
    }

    // Check access
    const hasAccess =
      dispute.reportedBy === userId || dispute.reportedAgainst === userId;

    if (!hasAccess) {
      throw new Error("Access denied");
    }

    // Check if dispute is still open (can't upload to resolved disputes)
    if (dispute.status === "resolved" || dispute.status === "dismissed") {
      throw new Error("Cannot upload documents to resolved disputes");
    }

    // Check how many documents user has already uploaded
    const existingDocs = await db.query.disputeDocuments.findMany({
      where: and(
        eq(disputeDocuments.disputeId, disputeId),
        eq(disputeDocuments.uploadedBy, userId),
        eq(disputeDocuments.isDeleted, false)
      ),
    });

    if (existingDocs.length >= 2) {
      throw new Error("Maximum 2 documents allowed per user per dispute");
    }

    // Validate file type and generate presigned URL
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowedTypes.includes(contentType)) {
      throw new Error(
        "File type not allowed. Supported: JPG, PNG, WebP, PDF, DOC, DOCX"
      );
    }

    try {
      const result = await S3Service.generateDisputeDocumentUploadUrl(
        userId,
        disputeId,
        fileName,
        contentType,
        3600 // 1 hour expiration
      );

      return {
        ...result,
        disputeId: disputeId,
        maxDocuments: 2,
        currentDocuments: existingDocs.length,
      };
    } catch (error) {
      console.error(
        "Error generating presigned URL for dispute document:",
        error
      );
      throw new Error("Failed to generate upload URL");
    }
  }

  // Confirm document upload after successful S3 upload
  static async confirmDocumentUpload(data: DisputeDocumentUpload) {
    // Verify dispute and access
    const dispute = await db.query.disputes.findFirst({
      where: and(
        eq(disputes.id, data.disputeId),
        eq(disputes.isDeleted, false)
      ),
      columns: { id: true, reportedBy: true, reportedAgainst: true },
    });

    if (!dispute) {
      throw new Error("Dispute not found");
    }

    const hasAccess =
      dispute.reportedBy === data.uploadedBy ||
      dispute.reportedAgainst === data.uploadedBy;

    if (!hasAccess) {
      throw new Error("Access denied");
    }

    // Generate S3 URL from key
    const s3Url = S3Service.getPublicUrl(data.fileName); // Assuming fileName is actually the S3 key

    // Save document record
    const [document] = await db
      .insert(disputeDocuments)
      .values({
        disputeId: data.disputeId,
        fileName: data.fileName,
        originalFileName: data.originalFileName,
        s3Key: data.fileName, // This should be the S3 key
        s3Url: s3Url,
        fileSize: "Unknown", // You might want to add file size to the input
        contentType: data.contentType,
        uploadedBy: data.uploadedBy,
      })
      .returning();

    return document;
  }

  // Delete document
  static async deleteDocument(
    documentId: string,
    userId: string,
    userRole: string
  ) {
    const document = await db.query.disputeDocuments.findFirst({
      where: and(
        eq(disputeDocuments.id, documentId),
        eq(disputeDocuments.isDeleted, false)
      ),
      with: {
        dispute: {
          columns: { id: true, status: true },
        },
      },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    // Only uploader or admin can delete
    const canDelete = document.uploadedBy === userId || userRole === "admin";

    if (!canDelete) {
      throw new Error("Access denied");
    }

    // Can't delete from resolved disputes
    if (
      document.dispute.status === "resolved" ||
      document.dispute.status === "dismissed"
    ) {
      throw new Error("Cannot delete documents from resolved disputes");
    }

    // Soft delete the document record
    await db
      .update(disputeDocuments)
      .set({
        isDeleted: true,
      })
      .where(eq(disputeDocuments.id, documentId));

    // Delete from S3
    try {
      await S3Service.deleteFile(document.s3Key);
    } catch (error) {
      console.error("Failed to delete file from S3:", error);
      // Continue even if S3 deletion fails
    }

    return { success: true };
  }

  // Get dispute statistics (for admin dashboard)
  static async getDisputeStats() {
    const [totalDisputes, openDisputes, inReviewDisputes, resolvedDisputes] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(disputes)
          .where(eq(disputes.isDeleted, false)),
        db
          .select({ count: count() })
          .from(disputes)
          .where(
            and(eq(disputes.status, "open"), eq(disputes.isDeleted, false))
          ),
        db
          .select({ count: count() })
          .from(disputes)
          .where(
            and(eq(disputes.status, "in_review"), eq(disputes.isDeleted, false))
          ),
        db
          .select({ count: count() })
          .from(disputes)
          .where(
            and(eq(disputes.status, "resolved"), eq(disputes.isDeleted, false))
          ),
      ]);

    return {
      total: totalDisputes[0].count,
      open: openDisputes[0].count,
      inReview: inReviewDisputes[0].count,
      resolved: resolvedDisputes[0].count,
    };
  }
}
