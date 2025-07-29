// services/jobApplicationService.ts
import { db } from "../../db/index.js";
import { jobApplications } from "../../db/schemas/jobApplicationSchema.js";
import { jobPosts } from "../../db/schemas/jobSchema.js";
import { healthcareProfiles, users } from "../../db/schemas/usersSchema.js";
import { eq, and, desc, count, asc, ne, or, inArray } from "drizzle-orm";
import { NotificationService } from "../notification/notificationService.js";

export interface CreateApplicationData {
  jobPostId: string;
  healthcareUserId: string;
  applicationMessage?: string;
}

export interface UpdateApplicationStatusData {
  status: "accepted" | "rejected";
  responseMessage?: string;
}

export interface CancelApplicationData {
  cancellationReason: string;
  cancellationMessage?: string;
}

export interface CheckinData {
  checkinLocation: string;
}

export interface CheckoutData {
  checkoutLocation: string;
}

export interface CompleteJobData {
  completionNotes?: string;
}

export interface ReportData {
  reportReason: string;
  reportMessage: string;
}

export interface ApplicationFilters {
  page?: number;
  limit?: number;
  status?: string;
  jobPostId?: string;
}

export class JobApplicationService {
  // Apply for a job
  static async applyForJob(data: CreateApplicationData) {
    // Step 1: Create the application in a transaction
    const result = await db.transaction(async (tx) => {
      // Check if job post exists and is active
      const jobPost = await tx.query.jobPosts.findFirst({
        where: and(
          eq(jobPosts.id, data.jobPostId),
          eq(jobPosts.status, "open"),
          eq(jobPosts.isDeleted, false)
        ),
        with: {
          user: {
            columns: { id: true, name: true, email: true },
          },
        },
      });

      if (!jobPost) {
        throw new Error("Job post not found or no longer available");
      }

      // Check if job date is in the future
      const jobDate = new Date(jobPost.jobDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (jobDate < today) {
        throw new Error("Cannot apply for past jobs");
      }

      // Check if user already applied
      const existingApplication = await tx.query.jobApplications.findFirst({
        where: and(
          eq(jobApplications.jobPostId, data.jobPostId),
          eq(jobApplications.healthcareUserId, data.healthcareUserId),
          eq(jobApplications.isDeleted, false)
        ),
      });

      if (existingApplication) {
        throw new Error("You have already applied for this job");
      }

      // Check if job already has an accepted application
      const acceptedApplication = await tx.query.jobApplications.findFirst({
        where: and(
          eq(jobApplications.jobPostId, data.jobPostId),
          eq(jobApplications.status, "accepted"),
          eq(jobApplications.isDeleted, false)
        ),
      });

      if (acceptedApplication) {
        throw new Error("This job already has an accepted applicant");
      }

      // Get healthcare user details
      const healthcareUser = await tx.query.users.findFirst({
        where: eq(users.id, data.healthcareUserId),
        columns: { id: true, name: true, email: true, role: true },
      });

      if (!healthcareUser || healthcareUser.role !== "healthcare") {
        throw new Error("Invalid healthcare user");
      }

      // Create application
      const [application] = await tx
        .insert(jobApplications)
        .values({
          jobPostId: data.jobPostId,
          healthcareUserId: data.healthcareUserId,
          applicationMessage: data.applicationMessage,
          status: "pending",
        })
        .returning();

      // IMPORTANT: Check if application was created successfully
      if (!application || !application.id) {
        throw new Error("Failed to create application");
      }

      // Return all the data needed for notification
      return {
        application,
        jobPost,
        healthcareUser,
      };
    });

    // Step 2: Create notification OUTSIDE the transaction (after commit)
    try {
      // Verify the application exists before creating notification
      const verifyApplication = await db.query.jobApplications.findFirst({
        where: eq(jobApplications.id, result.application.id),
        columns: { id: true },
      });

      if (!verifyApplication) {
        console.error("Application not found after transaction commit!");
        throw new Error("Application verification failed");
      }

      await NotificationService.createFromTemplate(
        "JOB_APPLICATION_RECEIVED",
        result.jobPost.userId,
        {
          jobTitle: result.jobPost.title,
          jobPostId: result.jobPost.id,
          applicantName: result.healthcareUser.name,
        },
        {
          jobPostId: result.jobPost.id,
          jobApplicationId: result.application.id,
          relatedUserId: result.healthcareUser.id,
          sendEmail: true,
        }
      );
    } catch (notificationError) {
      console.error("Failed to create notification:", notificationError);
      // Don't fail the application creation if notification fails
      // The application is still valid even if notification fails
    }

    return result.application;
  }

  // Get applications for a specific job (for job posters)
  static async getJobApplications(
    jobPostId: string,
    userId: string,
    filters: ApplicationFilters = {}
  ) {
    const { page = 1, limit = 10, status } = filters;
    const offset = (page - 1) * limit;

    // Verify job ownership
    const jobPost = await db.query.jobPosts.findFirst({
      where: and(
        eq(jobPosts.id, jobPostId),
        eq(jobPosts.userId, userId),
        eq(jobPosts.isDeleted, false)
      ),
    });

    if (!jobPost) {
      throw new Error("Job post not found or access denied");
    }

    const conditions = [
      eq(jobApplications.jobPostId, jobPostId),
      eq(jobApplications.isDeleted, false),
    ];

    if (status) {
      conditions.push(eq(jobApplications.status, status as any));
    }

    const [totalCount] = await db
      .select({ count: count() })
      .from(jobApplications)
      .where(and(...conditions));

    const results = await db.query.jobApplications.findMany({
      where: and(...conditions),
      with: {
        healthcareUser: {
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
            jobDate: true,
            postcode: true,
            status: true // Add postcode to calculate distance
          },
        },
      },
      orderBy: [desc(jobApplications.createdAt)],
      limit,
      offset,
    });

    // Get healthcare profile data separately for each application
    const resultsWithDistance = [];
    for (const application of results) {
      const healthcareProfile = await db.query.healthcareProfiles.findFirst({
        where: eq(healthcareProfiles.userId, application.healthcareUser.id),
        with: {
          specialitiesRelation: {
            with: {
              speciality: true,
            },
          },
          languagesRelation: {
            with: {
              language: true,
            },
          },
        },
      });

      let distance = { km: 999, miles: 999 };
      if (healthcareProfile?.postcode && application.jobPost.postcode) {
        distance = await this.calculateDistanceWithUnits(
          application.jobPost.postcode,
          healthcareProfile.postcode
        );
      }

      // Transform the data
      const transformedApplication = {
        ...application,
        healthcareUser: {
          ...application.healthcareUser,
          healthcareProfile: healthcareProfile
            ? {
                fullName: healthcareProfile.fullName,
                nationality: healthcareProfile.nationality,
                dateOfBirth: healthcareProfile.dateOfBirth,
                experience: healthcareProfile.experience,
                image: healthcareProfile.image,
                postcode: healthcareProfile.postcode,
                gender: healthcareProfile.gender,
                preferred_time: healthcareProfile.preferredTime,
                professionalTitle: healthcareProfile.professionalTitle,
                specialities:
                  healthcareProfile.specialitiesRelation?.map(
                    (rel) => rel.speciality
                  ) || [],
                languages:
                  healthcareProfile.languagesRelation?.map(
                    (rel) => rel.language
                  ) || [],
                distance: distance,
              }
            : null,
        },
      };

      resultsWithDistance.push(transformedApplication);
    }

    return {
      data: resultsWithDistance,
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

  // Get healthcare worker's applications
  static async getHealthcareApplications(
    healthcareUserId: string,
    filters: ApplicationFilters = {}
  ) {
    const { page = 1, limit = 10, status } = filters;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(jobApplications.healthcareUserId, healthcareUserId),
      eq(jobApplications.isDeleted, false),
    ];

    if (status) {
      conditions.push(eq(jobApplications.status, status as any));
    }

    const [totalCount] = await db
      .select({ count: count() })
      .from(jobApplications)
      .where(and(...conditions));

    const results = await db.query.jobApplications.findMany({
      where: and(...conditions),
      with: {
        jobPost: {
          columns: {
            id: true,
            title: true,
            type: true,
            jobDate: true,
            startTime: true,
            endTime: true,
            address: true,
            postcode: true,
            paymentType: true,
            paymentCost: true,
          },
          with: {
            user: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [desc(jobApplications.createdAt)],
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

  // Accept or reject application
  // Updated updateApplicationStatus method - Remove auto-rejection logic
  static async updateApplicationStatus(
    applicationId: string,
    userId: string,
    data: UpdateApplicationStatusData
  ) {
    return await db.transaction(async (tx) => {
      // Get application with job post details
      const application = await tx.query.jobApplications.findFirst({
        where: and(
          eq(jobApplications.id, applicationId),
          eq(jobApplications.isDeleted, false)
        ),
        with: {
          jobPost: {
            with: {
              user: {
                columns: { id: true, name: true },
              },
            },
          },
          healthcareUser: {
            columns: { id: true, name: true, email: true },
          },
        },
      });
  
      if (!application) {
        throw new Error("Application not found");
      }
  
      // Verify job ownership
      if (application.jobPost.userId !== userId) {
        throw new Error("Access denied");
      }
  
      // Check if job post is already approved
      if (application.jobPost.status === "approved") {
        throw new Error("Job post has already been approved and cannot be modified");
      }
  
      // Check if application is still pending
      if (application.status !== "pending") {
        throw new Error("Application has already been processed");
      }
  
      // Update the application
      const [updatedApplication] = await tx
        .update(jobApplications)
        .set({
          status: data.status,
          respondedAt: new Date(),
          responseMessage: data.responseMessage,
          updatedAt: new Date(),
        })
        .where(eq(jobApplications.id, applicationId))
        .returning();
  
      // Only process acceptance logic if the application was accepted
      if (data.status === "accepted") {
        // Update job post status
        await tx
          .update(jobPosts)
          .set({
            status: "approved",
            updatedAt: new Date(),
          })
          .where(eq(jobPosts.id, application.jobPostId));
  
        // Find all other applications by the same healthcare user that are pending or accepted
        const conflictingApplications = await tx.query.jobApplications.findMany(
          {
            where: and(
              eq(
                jobApplications.healthcareUserId,
                application.healthcareUserId
              ),
              ne(jobApplications.id, applicationId), // Exclude current application
              eq(jobApplications.isDeleted, false),
              inArray(jobApplications.status, ["pending"])
            ),
            with: {
              jobPost: {
                columns: {
                  id: true,
                  title: true,
                  jobDate: true,
                  startTime: true,
                  endTime: true,
                },
              },
            },
          }
        );
  
        // Get current job timing for comparison
        const currentJob = application.jobPost;
        const currentStartDateTime = new Date(
          `${currentJob.jobDate.toISOString().split("T")[0]}T${
            currentJob.startTime
          }`
        );
        const currentEndDateTime = new Date(
          `${currentJob.jobDate.toISOString().split("T")[0]}T${
            currentJob.endTime
          }`
        );
  
        // Filter applications that have time conflicts
        const conflictingIds: string[] = [];
        const conflictingJobTitles: string[] = [];
  
        conflictingApplications.forEach((conflictApp) => {
          const conflictJob = conflictApp.jobPost;
          const conflictStartDateTime = new Date(
            `${conflictJob.jobDate.toISOString().split("T")[0]}T${
              conflictJob.startTime
            }`
          );
          const conflictEndDateTime = new Date(
            `${conflictJob.jobDate.toISOString().split("T")[0]}T${
              conflictJob.endTime
            }`
          );
  
          // Check for time overlap
          const hasTimeConflict =
            currentStartDateTime < conflictEndDateTime &&
            currentEndDateTime > conflictStartDateTime;
  
          if (hasTimeConflict) {
            conflictingIds.push(conflictApp.id);
            conflictingJobTitles.push(conflictJob.title);
          }
        });
  
        // Update conflicting applications to 'not-available'
        if (conflictingIds.length > 0) {
          await tx
            .update(jobApplications)
            .set({
              status: "not-available",
              respondedAt: new Date(),
              responseMessage: `This application is no longer available due to a scheduling conflict with your accepted position: "${currentJob.title}"`,
              updatedAt: new Date(),
            })
            .where(inArray(jobApplications.id, conflictingIds));
        }
      }
  
      // Create notification for healthcare worker about the main application
      const templateKey =
        data.status === "accepted"
          ? "APPLICATION_ACCEPTED"
          : "APPLICATION_REJECTED";
      await NotificationService.createFromTemplate(
        templateKey,
        application.healthcareUserId,
        {
          jobTitle: application.jobPost.title,
          applicationId: application.id,
          jobPostId: application.jobPostId,
        },
        {
          jobPostId: application.jobPostId,
          jobApplicationId: application.id,
          relatedUserId: application.jobPost.userId,
          sendEmail: true,
        }
      );
  
      return updatedApplication;
    });
  }

  // Cancel application (by healthcare worker or job poster)
  static async cancelApplication(
    applicationId: string,
    userId: string,
    data: CancelApplicationData
  ) {
    return await db.transaction(async (tx) => {
      const application = await tx.query.jobApplications.findFirst({
        where: and(
          eq(jobApplications.id, applicationId),
          eq(jobApplications.isDeleted, false)
        ),
        with: {
          jobPost: {
            with: {
              user: { columns: { id: true, name: true } },
            },
          },
          healthcareUser: {
            columns: { id: true, name: true },
          },
        },
      });

      if (!application) {
        throw new Error("Application not found");
      }

      // Check if user has permission to cancel
      const isHealthcareWorker = application.healthcareUserId === userId;
      const isJobPoster = application.jobPost.userId === userId;

      if (!isHealthcareWorker && !isJobPoster) {
        throw new Error("Access denied");
      }

      // Can only cancel pending or accepted applications
      if (!["pending", "accepted"].includes(application.status)) {
        throw new Error("Application cannot be cancelled at this stage");
      }

      // Update application
      const [updatedApplication] = await tx
        .update(jobApplications)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: data.cancellationReason as any,
          cancellationMessage: data.cancellationMessage,
          cancelledBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(jobApplications.id, applicationId))
        .returning();

      // If this was an accepted application that was cancelled before check-in, reopen the job
      if (application.status === "accepted") {
        // Check if there are other pending applications
        const pendingApplications = await tx.query.jobApplications.findMany({
          where: and(
            eq(jobApplications.jobPostId, application.jobPostId),
            eq(jobApplications.status, "pending"),
            eq(jobApplications.isDeleted, false)
          ),
        });

        // Only reopen if there are pending applications waiting
        // if (pendingApplications.length > 0) {
          await tx
            .update(jobPosts)
            .set({
              status: "open",
              updatedAt: new Date(),
            })
            .where(eq(jobPosts.id, application.jobPostId));
        // }
      }

      // Create notification for the other party
      const notificationUserId = isHealthcareWorker
        ? application.jobPost.userId
        : application.healthcareUserId;

      await NotificationService.createFromTemplate(
        "APPLICATION_CANCELLED",
        notificationUserId,
        {
          jobTitle: application.jobPost.title,
          applicationId: application.id,
          jobPostId: application.jobPostId,
        },
        {
          jobPostId: application.jobPostId,
          jobApplicationId: application.id,
          relatedUserId: userId,
          sendEmail: true,
          metadata: {
            cancellationReason: data.cancellationReason,
            cancelledBy: isHealthcareWorker ? "healthcare" : "poster",
          },
        }
      );

      return updatedApplication;
    });
  }

  // Check in to job
  static async checkinToJob(
    applicationId: string,
    healthcareUserId: string,
    data: CheckinData
  ) {
    return await db.transaction(async (tx) => {
      const application = await tx.query.jobApplications.findFirst({
        where: and(
          eq(jobApplications.id, applicationId),
          eq(jobApplications.healthcareUserId, healthcareUserId),
          eq(jobApplications.status, "accepted"),
          eq(jobApplications.isDeleted, false)
        ),
        with: {
          jobPost: {
            with: {
              user: { columns: { id: true, name: true } },
            },
          },
        },
      });

      if (!application) {
        throw new Error("Application not found or not accepted");
      }

      // Check if already checked in
      if (application.checkedInAt) {
        throw new Error("Already checked in");
      }

      // Check if it's the job date
      const jobDate = new Date(application.jobPost.jobDate);
      const today = new Date();
      jobDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      if (jobDate.getTime() !== today.getTime()) {
        throw new Error("Can only check in on the job date");
      }

      // NOW reject all other applications since healthcare worker has actually shown up
      await tx
        .update(jobApplications)
        .set({
          status: "rejected",
          respondedAt: new Date(),
          responseMessage: "Selected candidate has started the job",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobApplications.jobPostId, application.jobPostId),
            or(
              eq(jobApplications.status, "pending"),
              and(
                eq(jobApplications.status, "accepted"),
                ne(jobApplications.id, applicationId)
              )
            )
          )
        );

      // Update the checking-in application
      const [updatedApplication] = await tx
        .update(jobApplications)
        .set({
          checkedInAt: new Date(),
          checkinLocation: data.checkinLocation,
          updatedAt: new Date(),
        })
        .where(eq(jobApplications.id, applicationId))
        .returning();

      // Notify job poster
      await NotificationService.createFromTemplate(
        "JOB_STARTED",
        application.jobPost.userId,
        {
          jobTitle: application.jobPost.title,
          jobPostId: application.jobPostId,
        },
        {
          jobPostId: application.jobPostId,
          jobApplicationId: application.id,
          relatedUserId: healthcareUserId,
          sendEmail: true,
        }
      );

      return updatedApplication;
    });
  }

  // Check out from job
  static async checkoutFromJob(
    applicationId: string,
    healthcareUserId: string,
    data: CheckoutData
  ) {
    const application = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.id, applicationId),
        eq(jobApplications.healthcareUserId, healthcareUserId),
        eq(jobApplications.status, "accepted"),
        eq(jobApplications.isDeleted, false)
      ),
      with: {
        jobPost: true,
      },
    });

    if (!application) {
      throw new Error("Application not found or not accepted");
    }

    if (!application.checkedInAt) {
      throw new Error("Must check in before checking out");
    }

    if (application.checkedOutAt) {
      throw new Error("Already checked out");
    }

    const [updatedApplication] = await db
      .update(jobApplications)
      .set({
        checkedOutAt: new Date(),
        checkoutLocation: data.checkoutLocation,
        updatedAt: new Date(),
      })
      .where(eq(jobApplications.id, applicationId))
      .returning();

    return updatedApplication;
  }

  // Complete job (by job poster)
  static async completeJob(
    applicationId: string,
    userId: string,
    data: CompleteJobData
  ) {
    return await db.transaction(async (tx) => {
      const application = await tx.query.jobApplications.findFirst({
        where: and(
          eq(jobApplications.id, applicationId),
          eq(jobApplications.isDeleted, false)
        ),
        with: {
          jobPost: {
            with: {
              user: { columns: { id: true, name: true } },
            },
          },
          healthcareUser: {
            columns: { id: true, name: true },
          },
        },
      });

      if (!application) {
        throw new Error("Application not found");
      }

      if (application.jobPost.userId !== userId) {
        throw new Error("Access denied");
      }

      if (application.status !== "accepted") {
        throw new Error("Job is not in progress");
      }

      // if (!application.checkedOutAt) {
      //   throw new Error('Healthcare worker must check out first');
      // }

      if (application.completedAt) {
        throw new Error("Job already completed");
      }

      // Update application
      const [updatedApplication] = await tx
        .update(jobApplications)
        .set({
          status: "completed",
          completedAt: new Date(),
          completedBy: userId,
          completionNotes: data.completionNotes,
          updatedAt: new Date(),
        })
        .where(eq(jobApplications.id, applicationId))
        .returning();

      // Update job post status
      await tx
        .update(jobPosts)
        .set({
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(jobPosts.id, application.jobPostId));

      // Notify healthcare worker
      await NotificationService.createFromTemplate(
        "JOB_COMPLETED",
        application.healthcareUserId,
        {
          jobTitle: application.jobPost.title,
          applicationId: application.id,
        },
        {
          jobPostId: application.jobPostId,
          jobApplicationId: application.id,
          relatedUserId: userId,
          sendEmail: true,
        }
      );

      return updatedApplication;
    });
  }

  // Report healthcare worker or job poster
  static async reportUser(
    applicationId: string,
    reportedBy: string,
    data: ReportData
  ) {
    const application = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.id, applicationId),
        eq(jobApplications.isDeleted, false)
      ),
      with: {
        jobPost: {
          with: {
            user: { columns: { id: true, name: true } },
          },
        },
        healthcareUser: {
          columns: { id: true, name: true },
        },
      },
    });

    if (!application) {
      throw new Error("Application not found");
    }

    // Check if user is involved in this application
    const isHealthcareWorker = application.healthcareUserId === reportedBy;
    const isJobPoster = application.jobPost.userId === reportedBy;

    if (!isHealthcareWorker && !isJobPoster) {
      throw new Error("Access denied");
    }

    const [updatedApplication] = await db
      .update(jobApplications)
      .set({
        reportedAt: new Date(),
        reportReason: data.reportReason,
        reportMessage: data.reportMessage,
        reportedBy: reportedBy,
        updatedAt: new Date(),
      })
      .where(eq(jobApplications.id, applicationId))
      .returning();

    // Create notification for admin (assuming there's an admin user or system)
    // You would need to implement admin notification logic here
    await NotificationService.createFromTemplate(
      "REPORT_SUBMITTED",
      "admin-user-id", // Replace with actual admin user ID
      {
        jobTitle: application.jobPost.title,
        applicationId: application.id,
      },
      {
        jobPostId: application.jobPostId,
        jobApplicationId: application.id,
        relatedUserId: reportedBy,
        sendEmail: true,
        metadata: {
          reportReason: data.reportReason,
          reportedUserType: isHealthcareWorker ? "healthcare" : "poster",
        },
      }
    );

    return updatedApplication;
  }

  // Get single application details
  static async getApplication(applicationId: string, userId: string) {
    const application = await db.query.jobApplications.findFirst({
      where: and(
        eq(jobApplications.id, applicationId),
        eq(jobApplications.isDeleted, false)
      ),
      with: {
        jobPost: {
          with: {
            user: {
              columns: { id: true, name: true, email: true },
            },
          },
        },
        healthcareUser: {
          columns: { id: true, name: true, email: true },
          with: {
            healthcareProfile: {
              columns: {
                fullName: true,
                nationality: true,
                dateOfBirth: true,
                experience: true,
              },
            },
          },
        },
        cancelledByUser: {
          columns: { id: true, name: true, role: true },
        },
        completedByUser: {
          columns: { id: true, name: true, role: true },
        },
      },
    });

    if (!application) {
      throw new Error("Application not found");
    }

    // Check if user has access to this application
    const hasAccess =
      application.healthcareUserId === userId ||
      application.jobPost.userId === userId;

    if (!hasAccess) {
      throw new Error("Access denied");
    }

    return application;
  }

  // Additional methods to add to JobApplicationService

  static async getAllUserJobApplications(
    userId: string,
    filters: ApplicationFilters = {}
  ) {
    const { page = 1, limit = 10, status } = filters;
    const offset = (page - 1) * limit;

    // First get all job post IDs for this user
    const userJobPosts = await db
      .select({ id: jobPosts.id })
      .from(jobPosts)
      .where(and(eq(jobPosts.userId, userId), eq(jobPosts.isDeleted, false)));

    const jobPostIds = userJobPosts.map((job) => job.id);

    if (jobPostIds.length === 0) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    const conditions = [eq(jobApplications.isDeleted, false)];

    // Add job post ID filter using inArray instead of or
    conditions.push(inArray(jobApplications.jobPostId, jobPostIds));

    if (status) {
      conditions.push(eq(jobApplications.status, status as any));
    }

    const [totalCount] = await db
      .select({ count: count() })
      .from(jobApplications)
      .where(and(...conditions));

    const results = await db.query.jobApplications.findMany({
      where: and(...conditions),
      with: {
        healthcareUser: {
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
            jobDate: true,
            startTime: true,
            endTime: true,
            status: true
          },
        },
      },
      orderBy: [desc(jobApplications.createdAt)],
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

  // Get application statistics for dashboard
  static async getApplicationStats(
    userId: string,
    role: "healthcare" | "poster"
  ) {
    if (role === "healthcare") {
      // Stats for healthcare worker
      const [
        totalApplications,
        pendingApplications,
        acceptedApplications,
        completedApplications,
      ] = await Promise.all([
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.healthcareUserId, userId),
              eq(jobApplications.isDeleted, false)
            )
          ),
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.healthcareUserId, userId),
              eq(jobApplications.status, "pending"),
              eq(jobApplications.isDeleted, false)
            )
          ),
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.healthcareUserId, userId),
              eq(jobApplications.status, "accepted"),
              eq(jobApplications.isDeleted, false)
            )
          ),
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.healthcareUserId, userId),
              eq(jobApplications.status, "completed"),
              eq(jobApplications.isDeleted, false)
            )
          ),
      ]);

      return {
        total: totalApplications[0].count,
        pending: pendingApplications[0].count,
        accepted: acceptedApplications[0].count,
        completed: completedApplications[0].count,
      };
    } else {
      // Stats for job poster - get applications across all their jobs
      const userJobPosts = await db
        .select({ id: jobPosts.id })
        .from(jobPosts)
        .where(and(eq(jobPosts.userId, userId), eq(jobPosts.isDeleted, false)));

      const jobPostIds = userJobPosts.map((job) => job.id);

      if (jobPostIds.length === 0) {
        return {
          total: 0,
          pending: 0,
          accepted: 0,
          completed: 0,
        };
      }

      const [
        totalApplications,
        pendingApplications,
        acceptedApplications,
        completedApplications,
      ] = await Promise.all([
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              inArray(jobApplications.jobPostId, jobPostIds),
              eq(jobApplications.isDeleted, false)
            )
          ),
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              inArray(jobApplications.jobPostId, jobPostIds),
              eq(jobApplications.status, "pending"),
              eq(jobApplications.isDeleted, false)
            )
          ),
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              inArray(jobApplications.jobPostId, jobPostIds),
              eq(jobApplications.status, "accepted"),
              eq(jobApplications.isDeleted, false)
            )
          ),
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              inArray(jobApplications.jobPostId, jobPostIds),
              eq(jobApplications.status, "completed"),
              eq(jobApplications.isDeleted, false)
            )
          ),
      ]);

      return {
        total: totalApplications[0].count,
        pending: pendingApplications[0].count,
        accepted: acceptedApplications[0].count,
        completed: completedApplications[0].count,
      };
    }
  }

  private static async calculateDistanceWithUnits(
    postcode1: string,
    postcode2: string
  ): Promise<{ km: number; miles: number }> {
    try {
      const [coord1, coord2] = await Promise.all([
        this.getPostcodeCoordinates(postcode1),
        this.getPostcodeCoordinates(postcode2),
      ]);

      if (!coord1 || !coord2) {
        return { km: 999, miles: 999 };
      }

      const distanceKm = this.calculateHaversineDistance(
        coord1.latitude,
        coord1.longitude,
        coord2.latitude,
        coord2.longitude,
        6371 // Earth's radius in km
      );

      const distanceMiles = this.calculateHaversineDistance(
        coord1.latitude,
        coord1.longitude,
        coord2.latitude,
        coord2.longitude,
        3959 // Earth's radius in miles
      );

      return {
        km: Math.round(distanceKm * 10) / 10,
        miles: Math.round(distanceMiles * 10) / 10,
      };
    } catch (error) {
      console.error("Error calculating distance:", error);
      return { km: 999, miles: 999 };
    }
  }

  // Get coordinates from postcodes.io
  private static async getPostcodeCoordinates(
    postcode: string
  ): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const cleanPostcode = postcode.replace(/\s+/g, "").toUpperCase();
      const response = await fetch(
        `https://api.postcodes.io/postcodes/${cleanPostcode}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.result) {
        return {
          latitude: data.result.latitude,
          longitude: data.result.longitude,
        };
      }
      return null;
    } catch (error) {
      console.error("Error fetching postcode coordinates:", error);
      return null;
    }
  }

  // Updated Haversine formula to accept radius parameter
  private static calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
    earthRadius: number = 6371
  ): number {
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
