// routes/admin/adminService.ts
import { db } from "../../db/index.js";
import {
  users,
  individualProfiles,
  organizationProfiles,
  healthcareProfiles,
  healthcareProfileLanguages,
  healthcareProfileSpecialities,
} from "../../db/schemas/usersSchema.js";
import {
  jobPosts,
  jobPostCareNeeds,
  jobPostLanguages,
  jobPostPreferences,
} from "../../db/schemas/jobSchema.js";
import { jobApplications } from "../../db/schemas/jobApplicationSchema.js";
import { disputes } from "../../db/schemas/disputeSchema.js";
import { notifications } from "../../db/schemas/notificationSchema.js";
import { conversations, messages } from "../../db/schemas/messageSchema.js";
import {
  specialities,
  languages,
  careNeeds,
  preferences,
} from "../../db/schemas/utilsSchema.js";
import {
  eq,
  and,
  count,
  desc,
  asc,
  or,
  inArray,
  like,
  gte,
  lte,
} from "drizzle-orm";
import { NotificationService } from "../notification/notificationService.js";
import { ReviewService } from "../review/reviewService.js";

export interface AdminUser {
  id: string;
  cognitoId: string;
  email: string;
  role: string;
  name?: string;
  profileCompleted: boolean;
  profileVerified: boolean;
  dbsVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRequest {
  id: string;
  email: string;
  name?: string;
  role: string;
  profileCompleted: boolean;
  profileVerified: boolean;
  dbsVerified: boolean;
  createdAt: Date;
  profile?: any;
}

export interface DisputeListItem {
  id: string;
  disputeNumber: string;
  disputeType: string;
  title: string;
  status: string;
  reportedByUser: { id: string; name: string; email: string };
  reportedAgainstUser: { id: string; name: string; email: string };
  jobPost: { id: string; title: string };
  reportedAt: Date;
  assignedToAdmin?: { id: string; name: string };
}

export interface UpdateDisputeStatusData {
  status: "in_review" | "resolved" | "dismissed";
  adminNotes?: string;
  resolutionDescription?: string;
  assignedToAdmin?: string;
}

export interface UserWithJobs {
  id: string;
  email: string;
  name?: string;
  role: string;
  profileCompleted: boolean;
  profileVerified: boolean;
  dbsVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  profile?: any;
  jobPosts?: any[];
  jobApplications?: any[];
}

export interface UserFilters {
  page?: number;
  limit?: number;
  searchTerm?: string;
  isActive?: boolean;
  createdAt?: string; // Date filter
  postcode?: string;
}

export interface JobFilters {
  page?: number;
  limit?: number;
  status?: string;
  searchTerm?: string;
  postcode?: string;
  createdAt?: string; // Date filter
  shiftType?: string;
}

export class AdminService {
  // Validate admin access
  static async validateAdminAccess(userId: string): Promise<boolean> {
    try {
      const admin = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.role, "admin")),
        columns: { id: true, role: true },
      });

      return !!admin;
    } catch (error) {
      console.error("Error validating admin access:", error);
      return false;
    }
  }

  // ==================== USER REQUESTS ====================

  // Get users with pending verification requests
  static async getUserRequests(
    options: {
      page?: number;
      limit?: number;
      role?: string;
      searchTerm?: string;
    } = {}
  ): Promise<{ requests: UserRequest[]; pagination: any }> {
    try {
      const { page = 1, limit = 20, role, searchTerm } = options;
      const offset = (page - 1) * limit;

      // Build where conditions for user requests
      const whereConditions = [
        eq(users.profileCompleted, true),
        or(eq(users.profileVerified, false), eq(users.dbsVerified, false)),
        eq(users.isActive, true),
        eq(users.isDeleted, false),
      ];

      if (role && role !== "all") {
        whereConditions.push(eq(users.role, role as any));
      }

      if (searchTerm) {
        whereConditions.push(
          or(
            like(users.email, `%${searchTerm}%`),
            like(users.name, `%${searchTerm}%`)
          )
        );
      }

      const [userRequests, totalCount] = await Promise.all([
        db.query.users.findMany({
          where: and(...whereConditions),
          columns: {
            id: true,
            email: true,
            name: true,
            role: true,
            profileCompleted: true,
            profileVerified: true,
            dbsVerified: true,
            createdAt: true,
            cognitoId: false, // Exclude sensitive data
          },
          with: {
            individualProfile: {
              columns: {
                fullName: true,
                postcode: true,
                phoneNumber: true,
                aboutYou: true,
              },
            },
            organizationProfile: {
              columns: {
                organizationName: true,
                organizationType: true,
                postcode: true,
                phoneNumber: true,
                overview: true,
              },
            },
            healthcareProfile: {
              columns: {
                fullName: true,
                professionalTitle: true,
                postcode: true,
                phoneNumber: true,
                professionalSummary: true,
                experience: true,
              },
              with: {
                specialitiesRelation: {
                  with: { speciality: true },
                },
              },
            },
          },
          limit,
          offset,
          orderBy: [desc(users.createdAt)],
        }),
        db
          .select({ count: count() })
          .from(users)
          .where(and(...whereConditions))
          .then((result) => result[0].count),
      ]);

      // Transform data
      const transformedRequests: UserRequest[] = userRequests.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        role: user.role,
        profileCompleted: user.profileCompleted,
        profileVerified: user.profileVerified,
        dbsVerified: user.dbsVerified,
        createdAt: user.createdAt,
        profile:
          user.individualProfile ||
          user.organizationProfile ||
          user.healthcareProfile ||
          null,
      }));

      const totalPages = Math.ceil(totalCount / limit);

      return {
        requests: transformedRequests,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching user requests:", error);
      throw new Error("Failed to fetch user requests");
    }
  }

  // Verify user's DBS
  static async verifyUserDBS(
    adminId: string,
    userId: string
  ): Promise<AdminUser> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      // Update user DBS verification
      const [updatedUser] = await db
        .update(users)
        .set({
          dbsVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          cognitoId: users.cognitoId,
          email: users.email,
          role: users.role,
          name: users.name,
          profileCompleted: users.profileCompleted,
          profileVerified: users.profileVerified,
          dbsVerified: users.dbsVerified,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      if (!updatedUser) {
        throw new Error("User not found");
      }

      // Create notification for user
      try {
        await NotificationService.createNotification({
          userId: userId,
          type: "system_announcement",
          priority: "normal",
          title: "DBS Verification Approved",
          message:
            "Your DBS verification has been approved by our admin team. You can now access all platform features.",
          actionUrl: "/profile",
          actionLabel: "View Profile",
          sendEmail: true,
        });
      } catch (notificationError) {
        console.warn(
          "Failed to create DBS verification notification:",
          notificationError
        );
      }

      return updatedUser;
    } catch (error) {
      console.error("Error verifying user DBS:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to verify DBS"
      );
    }
  }

  // Verify user's profile
  static async verifyUserProfile(
    adminId: string,
    userId: string
  ): Promise<AdminUser> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      // Update user profile verification
      const [updatedUser] = await db
        .update(users)
        .set({
          profileVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          cognitoId: users.cognitoId,
          email: users.email,
          role: users.role,
          name: users.name,
          profileCompleted: users.profileCompleted,
          profileVerified: users.profileVerified,
          dbsVerified: users.dbsVerified,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      if (!updatedUser) {
        throw new Error("User not found");
      }

      // Create notification for user
      try {
        await NotificationService.createNotification({
          userId: userId,
          type: "system_announcement",
          priority: "normal",
          title: "Profile Verification Approved",
          message:
            "Your profile has been verified by our admin team. You now have full access to the platform.",
          actionUrl: "/profile",
          actionLabel: "View Profile",
          sendEmail: true,
        });
      } catch (notificationError) {
        console.warn(
          "Failed to create profile verification notification:",
          notificationError
        );
      }

      return updatedUser;
    } catch (error) {
      console.error("Error verifying user profile:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to verify profile"
      );
    }
  }

  // ==================== USERS MANAGEMENT ====================

  // Get individuals with job details

  static async getIndividuals(
    options: UserFilters = {}
  ): Promise<{ users: UserWithJobs[]; pagination: any }> {
    try {
      const {
        page = 1,
        limit = 20,
        searchTerm,
        isActive,
        createdAt,
        postcode,
      } = options;
      const offset = (page - 1) * limit;

      const whereConditions = [
        eq(users.role, "individual"),
        eq(users.isDeleted, false),
      ];

      // ADD NEW FILTERS
      if (isActive !== undefined) {
        whereConditions.push(eq(users.isActive, isActive));
      } else {
        whereConditions.push(eq(users.isActive, true)); // Default behavior
      }

      if (createdAt) {
        const filterDate = new Date(createdAt);
        const dayStart = new Date(filterDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(filterDate);
        dayEnd.setHours(23, 59, 59, 999);

        whereConditions.push(gte(users.createdAt, dayStart));
        whereConditions.push(lte(users.createdAt, dayEnd));
      }

      //   if (searchTerm) {
      //     whereConditions.push(
      //       or(
      //         like(users.email, `%${searchTerm}%`),
      //         like(users.name, `%${searchTerm}%`)
      //       )
      //     );
      //   }

      // Add postcode filter for individualProfile
      if (postcode) {
        whereConditions.push(eq(individualProfiles.postcode, postcode)); // Default behavior
      }

      // Get results with postcode filtering
      let individuals = await db.query.users.findMany({
        where: and(...whereConditions),
        columns: {
          id: true,
          email: true,
          name: true,
          role: true,
          profileCompleted: true,
          profileVerified: true,
          dbsVerified: true,
          isActive: true,
          createdAt: true,
          cognitoId: false,
        },
        with: {
          individualProfile: {
            with: {
              careNeedsRelation: { with: { careNeed: true } },
              languagesRelation: { with: { language: true } },
            },
          },
        },
        orderBy: [desc(users.createdAt)],
      });

      // Filter by postcode if provided
      if (postcode) {
        individuals = individuals.filter((user) =>
          user.individualProfile?.postcode
            ?.toLowerCase()
            .includes(postcode.toLowerCase())
        );
      }

      // Apply pagination after filtering
      const filteredTotal = individuals.length;
      const paginatedResults = individuals.slice(offset, offset + limit);

      // Transform results
      const transformedUsers: UserWithJobs[] = paginatedResults.map((user) => {
        const baseUser: UserWithJobs = {
          id: user.id,
          email: user.email,
          name: user.name || undefined,
          role: user.role,
          profileCompleted: user.profileCompleted,
          profileVerified: user.profileVerified,
          dbsVerified: user.dbsVerified,
          isActive: user.isActive,
          createdAt: user.createdAt,
          profile: null,
        };

        if (user.individualProfile) {
          const { careNeedsRelation, languagesRelation, ...restProfile } =
            user.individualProfile;
          const transformedProfile = {
            ...restProfile,
            careNeeds: (careNeedsRelation ?? []).map((cn) => ({
              id: cn.careNeed.id,
              name: cn.careNeed.name,
            })),
            languages: (languagesRelation ?? []).map((lang) => ({
              id: lang.language.id,
              name: lang.language.name,
            })),
          };
          baseUser.profile = transformedProfile;
        }

        return baseUser;
      });

      const totalPages = Math.ceil(filteredTotal / limit);

      return {
        users: transformedUsers,
        pagination: {
          page,
          limit,
          total: filteredTotal,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching individuals:", error);
      throw new Error("Failed to fetch individuals");
    }
  }

  // Modify getOrganizations method
  static async getOrganizations(
    options: UserFilters = {}
  ): Promise<{ users: UserWithJobs[]; pagination: any }> {
    try {
      const {
        page = 1,
        limit = 20,
        searchTerm,
        isActive,
        createdAt,
        postcode,
      } = options;
      const offset = (page - 1) * limit;

      const whereConditions = [
        eq(users.role, "organization"),
        eq(users.isDeleted, false),
      ];

      // ADD NEW FILTERS
      if (isActive !== undefined) {
        whereConditions.push(eq(users.isActive, isActive));
      } else {
        whereConditions.push(eq(users.isActive, true)); // Default behavior
      }

      if (createdAt) {
        const filterDate = new Date(createdAt);
        const dayStart = new Date(filterDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(filterDate);
        dayEnd.setHours(23, 59, 59, 999);

        whereConditions.push(gte(users.createdAt, dayStart));
        whereConditions.push(lte(users.createdAt, dayEnd));
      }

      //   if (searchTerm) {
      //     whereConditions.push(
      //       or(
      //         like(users.email, `%${searchTerm}%`),
      //         like(users.name, `%${searchTerm}%`)
      //       )
      //     );
      //   }

      // Filter by postcode if provided
      if (postcode) {
        whereConditions.push(eq(organizationProfiles.postcode, postcode));
      }

      // Get results
      let organizations = await db.query.users.findMany({
        where: and(...whereConditions),
        columns: {
          id: true,
          email: true,
          name: true,
          role: true,
          profileCompleted: true,
          profileVerified: true,
          dbsVerified: true,
          isActive: true,
          createdAt: true,
          cognitoId: false,
        },
        with: {
          organizationProfile: true,
        },
        orderBy: [desc(users.createdAt)],
      });

      // Apply pagination after filtering
      const filteredTotal = organizations.length;
      const paginatedResults = organizations.slice(offset, offset + limit);

      const transformedUsers: UserWithJobs[] = paginatedResults.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        role: user.role,
        profileCompleted: user.profileCompleted,
        profileVerified: user.profileVerified,
        dbsVerified: user.dbsVerified,
        isActive: user.isActive,
        createdAt: user.createdAt,
        profile: user.organizationProfile,
      }));

      const totalPages = Math.ceil(filteredTotal / limit);

      return {
        users: transformedUsers,
        pagination: {
          page,
          limit,
          total: filteredTotal,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching organizations:", error);
      throw new Error("Failed to fetch organizations");
    }
  }

  // Modify getHealthcareProviders method
  static async getHealthcareProviders(
    options: UserFilters = {}
  ): Promise<{ users: UserWithJobs[]; pagination: any }> {
    try {
      const {
        page = 1,
        limit = 20,
        searchTerm,
        isActive,
        createdAt,
        postcode,
      } = options;
      const offset = (page - 1) * limit;

      const whereConditions = [
        eq(users.role, "healthcare"),
        eq(users.isDeleted, false),
      ];

      // ADD NEW FILTERS
      if (isActive !== undefined) {
        whereConditions.push(eq(users.isActive, isActive));
      } else {
        whereConditions.push(eq(users.isActive, true)); // Default behavior
      }

      if (createdAt) {
        const filterDate = new Date(createdAt);
        const dayStart = new Date(filterDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(filterDate);
        dayEnd.setHours(23, 59, 59, 999);

        whereConditions.push(gte(users.createdAt, dayStart));
        whereConditions.push(lte(users.createdAt, dayEnd));
      }

      //   if (searchTerm) {
      //     whereConditions.push(
      //       or(
      //         like(users.email, `%${searchTerm}%`),
      //         like(users.name, `%${searchTerm}%`)
      //       )
      //     );
      //   }

      // Filter by postcode if provided
      if (postcode) {
        whereConditions.push(eq(healthcareProfiles.postcode, postcode));
      }

      // Get results
      let healthcareProviders = await db.query.users.findMany({
        where: and(...whereConditions),
        columns: {
          id: true,
          email: true,
          name: true,
          role: true,
          profileCompleted: true,
          profileVerified: true,
          dbsVerified: true,
          isActive: true,
          createdAt: true,
          cognitoId: false,
        },
        with: {
          healthcareProfile: {
            with: {
              specialitiesRelation: { with: { speciality: true } },
              languagesRelation: { with: { language: true } },
            },
          },
        },
        orderBy: [desc(users.createdAt)],
      });

      // Apply pagination after filtering
      const filteredTotal = healthcareProviders.length;
      const paginatedResults = healthcareProviders.slice(
        offset,
        offset + limit
      );

      const transformedUsers: UserWithJobs[] = await Promise.all(
        paginatedResults.map(async (user) => {
          const baseUser: UserWithJobs = {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            role: user.role,
            profileCompleted: user.profileCompleted,
            profileVerified: user.profileVerified,
            dbsVerified: user.dbsVerified,
            isActive: user.isActive,
            createdAt: user.createdAt,
            profile: null,
          };

          if (user.healthcareProfile) {
            const { specialitiesRelation, languagesRelation, ...restProfile } =
              user.healthcareProfile;
            const transformedProfile = {
              ...restProfile,
              specialities: (specialitiesRelation ?? []).map((sp) => ({
                id: sp.speciality.id,
                name: sp.speciality.name,
              })),
              languages: (languagesRelation ?? []).map((lang) => ({
                id: lang.language.id,
                name: lang.language.name,
              })),
            };

            try {
              const reviewStats = await ReviewService.getReviewStats(user.id);
              (transformedProfile as any).reviewStats = reviewStats;
            } catch (error) {
              console.warn(
                `Failed to fetch review stats for user ${user.id}:`,
                error
              );
            }

            baseUser.profile = transformedProfile;
          }

          return baseUser;
        })
      );

      const totalPages = Math.ceil(filteredTotal / limit);

      return {
        users: transformedUsers,
        pagination: {
          page,
          limit,
          total: filteredTotal,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching healthcare providers:", error);
      throw new Error("Failed to fetch healthcare providers");
    }
  }

  // ==================== NEW JOB MANAGEMENT METHODS ====================

  // NEW: Get all jobs with applicants (admin view of all platform jobs)
  static async getAllJobsWithApplicants(
    adminId: string,
    options: JobFilters = {}
  ): Promise<{ jobs: any[]; pagination: any }> {
    try {
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      const {
        page = 1,
        limit = 20,
        status,
        searchTerm,
        postcode,
        createdAt,
        shiftType,
      } = options;
      const offset = (page - 1) * limit;

      const whereConditions = [eq(jobPosts.isDeleted, false)];

      if (status && status !== "all") {
        whereConditions.push(eq(jobPosts.status, status as any));
      }

      // ADD NEW FILTERS
      if (postcode) {
        whereConditions.push(like(jobPosts.postcode, `%${postcode}%`));
      }

      if (createdAt) {
        const filterDate = new Date(createdAt);
        const dayStart = new Date(filterDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(filterDate);
        dayEnd.setHours(23, 59, 59, 999);

        whereConditions.push(gte(jobPosts.createdAt, dayStart));
        whereConditions.push(lte(jobPosts.createdAt, dayEnd));
      }

      if (shiftType && shiftType !== "all") {
        whereConditions.push(eq(jobPosts.shiftType, shiftType as any));
      }

      //   if (searchTerm) {
      //     whereConditions.push(
      //       or(
      //         like(jobPosts.title, `%${searchTerm}%`),
      //         like(jobPosts.postcode, `%${searchTerm}%`)
      //       )
      //     );
      //   }

      const [allJobs, totalCount] = await Promise.all([
        db.query.jobPosts.findMany({
          where: and(...whereConditions),
          with: {
            user: {
              columns: { id: true, name: true, email: true, role: true },
            },
            careNeedsRelation: { with: { careNeed: true } },
            languagesRelation: { with: { language: true } },
            preferencesRelation: { with: { preference: true } },
            completedApplication: {
              with: {
                healthcareUser: {
                  columns: { id: true, name: true, email: true },
                },
              },
            },
          },
          limit,
          offset,
          orderBy: [desc(jobPosts.createdAt)],
        }),
        db
          .select({ count: count() })
          .from(jobPosts)
          .where(and(...whereConditions))
          .then((result) => result[0].count),
      ]);

      // Get applicant counts
      const jobIds = allJobs.map((job) => job.id);
      let applicantCountMap = new Map<string, number>();

      if (jobIds.length > 0) {
        const applicantCounts = await db
          .select({
            jobPostId: jobApplications.jobPostId,
            count: count(),
          })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.isDeleted, false),
              inArray(jobApplications.jobPostId, jobIds)
            )
          )
          .groupBy(jobApplications.jobPostId);

        applicantCountMap = new Map(
          applicantCounts.map((item) => [item.jobPostId, item.count])
        );
      }

      const jobsWithApplicants = allJobs.map((job) => ({
        ...job,
        applicantsCount: applicantCountMap.get(job.id) || 0,
        completedBy: job.completedApplication?.[0]?.healthcareUser || null,
      }));

      const totalPages = Math.ceil(totalCount / limit);

      return {
        jobs: jobsWithApplicants,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching all jobs:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch jobs"
      );
    }
  }

  // Modify getJobsForJobPoster method
  static async getJobsForJobPoster(
    adminId: string,
    jobPosterId: string,
    options: JobFilters = {}
  ): Promise<{ jobs: any[]; pagination: any }> {
    try {
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      const {
        page = 1,
        limit = 20,
        status,
        postcode,
        createdAt,
        shiftType,
      } = options;
      const offset = (page - 1) * limit;

      const whereConditions = [
        eq(jobPosts.userId, jobPosterId),
        eq(jobPosts.isDeleted, false),
      ];

      if (status && status !== "all") {
        whereConditions.push(eq(jobPosts.status, status as any));
      }

      // ADD NEW FILTERS
      if (postcode) {
        whereConditions.push(like(jobPosts.postcode, `%${postcode}%`));
      }

      if (createdAt) {
        const filterDate = new Date(createdAt);
        const dayStart = new Date(filterDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(filterDate);
        dayEnd.setHours(23, 59, 59, 999);

        whereConditions.push(gte(jobPosts.createdAt, dayStart));
        whereConditions.push(lte(jobPosts.createdAt, dayEnd));
      }

      if (shiftType && shiftType !== "all") {
        whereConditions.push(eq(jobPosts.shiftType, shiftType as any));
      }

      // Rest of the method remains the same...
      const [userJobs, totalCount] = await Promise.all([
        db.query.jobPosts.findMany({
          where: and(...whereConditions),
          with: {
            user: {
              columns: { id: true, name: true, email: true, role: true },
            },
            careNeedsRelation: { with: { careNeed: true } },
            languagesRelation: { with: { language: true } },
            preferencesRelation: { with: { preference: true } },
            completedApplication: {
              with: {
                healthcareUser: {
                  columns: { id: true, name: true, email: true },
                  with: { healthcareProfile: true },
                },
              },
            },
          },
          limit,
          offset,
          orderBy: [desc(jobPosts.createdAt)],
        }),
        db
          .select({ count: count() })
          .from(jobPosts)
          .where(and(...whereConditions))
          .then((result) => result[0].count),
      ]);

      // Get detailed applicants for each job
      const jobIds = userJobs.map((job) => job.id);
      let applicationsByJob: Record<string, any[]> = {};

      if (jobIds.length > 0) {
        const applications = await db
          .select({
            jobPostId: jobApplications.jobPostId,
            healthcareUserId: jobApplications.healthcareUserId,
            healthcareUserName: users.name,
            healthcareUserEmail: users.email,
            healthcareUserImage: healthcareProfiles.image,
            status: jobApplications.status,
            createdAt: jobApplications.createdAt,
          })
          .from(jobApplications)
          .innerJoin(users, eq(jobApplications.healthcareUserId, users.id))
          .innerJoin(
            healthcareProfiles,
            eq(users.id, healthcareProfiles.userId)
          )
          .where(
            and(
              eq(jobApplications.isDeleted, false),
              inArray(jobApplications.jobPostId, jobIds)
            )
          )
          .orderBy(desc(jobApplications.createdAt));

        applicationsByJob = applications.reduce((acc, app) => {
          if (!acc[app.jobPostId]) {
            acc[app.jobPostId] = [];
          }
          acc[app.jobPostId].push({
            id: app.healthcareUserId,
            name: app.healthcareUserName,
            email: app.healthcareUserEmail,
            image:
              app.healthcareUserImage ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                app.healthcareUserName
              )}&background=random`,
            status: app.status,
            appliedAt: app.createdAt,
          });
          return acc;
        }, {} as Record<string, any[]>);
      }

      const jobsWithApplicants = userJobs.map((job) => ({
        ...job,
        applicants: applicationsByJob[job.id] || [],
        totalApplications: applicationsByJob[job.id]?.length || 0,
        completedBy: job.completedApplication?.[0]?.healthcareUser || null,
      }));

      const totalPages = Math.ceil(totalCount / limit);

      return {
        jobs: jobsWithApplicants,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching jobs for job poster:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch jobs"
      );
    }
  }

  // Modify getAppliedJobsForHealthcare method
  static async getAppliedJobsForHealthcare(
    adminId: string,
    healthcareUserId: string,
    options: JobFilters = {}
  ): Promise<{ applications: any[]; pagination: any }> {
    try {
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      const {
        page = 1,
        limit = 20,
        status,
        postcode,
        createdAt,
        shiftType,
      } = options;
      const offset = (page - 1) * limit;

      const whereConditions = [
        eq(jobApplications.healthcareUserId, healthcareUserId),
        eq(jobApplications.isDeleted, false),
      ];

      if (status && status !== "all") {
        whereConditions.push(eq(jobApplications.status, status as any));
      }

      // Get all applications first, then filter by job properties
      let applications = await db.query.jobApplications.findMany({
        where: and(...whereConditions),
        with: {
          jobPost: {
            with: {
              user: {
                columns: { id: true, name: true, email: true, role: true },
              },
              careNeedsRelation: { with: { careNeed: true } },
              languagesRelation: { with: { language: true } },
              preferencesRelation: { with: { preference: true } },
            },
          },
          healthcareUser: {
            columns: { id: true, name: true, email: true },
            with: { healthcareProfile: true },
          },
        },
        orderBy: [desc(jobApplications.createdAt)],
      });

      // Filter by job properties
      if (postcode) {
        applications = applications.filter((app) =>
          app.jobPost.postcode.toLowerCase().includes(postcode.toLowerCase())
        );
      }

      if (createdAt) {
        const filterDate = new Date(createdAt);
        const dayStart = new Date(filterDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(filterDate);
        dayEnd.setHours(23, 59, 59, 999);

        applications = applications.filter((app) => {
          const appCreatedAt = new Date(app.jobPost.createdAt);
          return appCreatedAt >= dayStart && appCreatedAt <= dayEnd;
        });
      }

      if (shiftType && shiftType !== "all") {
        applications = applications.filter(
          (app) => app.jobPost.shiftType === shiftType
        );
      }

      // Apply pagination
      const filteredTotal = applications.length;
      const paginatedResults = applications.slice(offset, offset + limit);

      const totalPages = Math.ceil(filteredTotal / limit);

      return {
        applications: paginatedResults,
        pagination: {
          page,
          limit,
          total: filteredTotal,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching applied jobs for healthcare:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch applications"
      );
    }
  }

  // NEW: Get reviews for specific healthcare provider (delegates to ReviewService)
  static async getReviewsForHealthcare(
    adminId: string,
    healthcareUserId: string,
    options: {
      page?: number;
      limit?: number;
      includePrivate?: boolean;
    } = {}
  ): Promise<{ reviews: any[]; total: number; pagination: any }> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      const { page = 1, limit = 20, includePrivate = true } = options;
      const offset = (page - 1) * limit;

      // Import ReviewService here to avoid circular dependencies
      const { ReviewService } = await import("../review/reviewService.js");

      const result = await ReviewService.getHealthcareProviderReviews(
        healthcareUserId,
        {
          limit,
          offset,
          includePrivate, // Admin can see private reviews
          currentUserId: adminId,
        }
      );

      const totalPages = Math.ceil(result.total / limit);

      return {
        reviews: result.reviews,
        total: result.total,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching reviews for healthcare:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch reviews"
      );
    }
  }

  // ==================== DISPUTES MANAGEMENT ====================

  // Get all disputes
  static async getDisputes(
    options: {
      page?: number;
      limit?: number;
      status?: string;
      searchTerm?: string;
    } = {}
  ): Promise<{ disputes: DisputeListItem[]; pagination: any }> {
    try {
      const { page = 1, limit = 20, status, searchTerm } = options;
      const offset = (page - 1) * limit;

      const whereConditions = [eq(disputes.isDeleted, false)];

      if (status && status !== "all") {
        whereConditions.push(eq(disputes.status, status as any));
      }

      //   if (searchTerm) {
      //     whereConditions.push(
      //       or(
      //         like(disputes.disputeNumber, `%${searchTerm}%`),
      //         like(disputes.title, `%${searchTerm}%`)
      //       )
      //     );
      //   }

      const [disputesList, totalCount] = await Promise.all([
        db.query.disputes.findMany({
          where: and(...whereConditions),
          with: {
            reportedByUser: {
              columns: {
                id: true,
                name: true,
                email: true,
              },
            },
            reportedAgainstUser: {
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
              },
            },
            assignedAdmin: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
          limit,
          offset,
          orderBy: [desc(disputes.reportedAt)],
        }),
        db
          .select({ count: count() })
          .from(disputes)
          .where(and(...whereConditions))
          .then((result) => result[0].count),
      ]);

      const transformedDisputes: DisputeListItem[] = disputesList.map(
        (dispute) => ({
          id: dispute.id,
          disputeNumber: dispute.disputeNumber,
          disputeType: dispute.disputeType,
          title: dispute.title,
          status: dispute.status,
          reportedByUser: {
            id: dispute.reportedByUser.id,
            name: dispute.reportedByUser.name || "Unknown",
            email: dispute.reportedByUser.email,
          },
          reportedAgainstUser: {
            id: dispute.reportedAgainstUser.id,
            name: dispute.reportedAgainstUser.name || "Unknown",
            email: dispute.reportedAgainstUser.email,
          },
          jobPost: {
            id: dispute.jobPost.id,
            title: dispute.jobPost.title,
          },
          reportedAt: dispute.reportedAt,
          assignedToAdmin: dispute.assignedAdmin
            ? {
                id: dispute.assignedAdmin.id,
                name: dispute.assignedAdmin.name || "Unknown",
              }
            : undefined,
        })
      );

      const totalPages = Math.ceil(totalCount / limit);

      return {
        disputes: transformedDisputes,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching disputes:", error);
      throw new Error("Failed to fetch disputes");
    }
  }

  // Update dispute status (copied from existing code)
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
      notificationPromises.push(
        NotificationService.createFromTemplate(
          "DISPUTE_STATUS_UPDATED",
          dispute.reportedAgainst,
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

      try {
        await Promise.all(notificationPromises);
      } catch (notificationError) {
        console.error("Failed to create notifications:", notificationError);
        // Continue without failing the status update
      }

      return updatedDispute;
    });
  }

  // Get dispute conversation messages
  static async getDisputeConversation(
    adminId: string,
    disputeId: string
  ): Promise<any> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      // Get dispute with job application
      const dispute = await db.query.disputes.findFirst({
        where: and(eq(disputes.id, disputeId), eq(disputes.isDeleted, false)),
        with: {
          jobPost: {
            with: {
              completedApplication: {
                where: eq(jobApplications.status, "accepted"),
                with: {
                  conversation: {
                    with: {
                      messages: {
                        with: {
                          sender: {
                            columns: {
                              id: true,
                              name: true,
                              email: true,
                              role: true,
                            },
                          },
                        },
                        orderBy: [asc(messages.createdAt)],
                      },
                      jobPoster: {
                        columns: {
                          id: true,
                          name: true,
                          email: true,
                        },
                      },
                      healthcareUser: {
                        columns: {
                          id: true,
                          name: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!dispute) {
        throw new Error("Dispute not found");
      }

      // Find the conversation related to this dispute
      const jobApplication = dispute.jobPost.completedApplication?.[0];
      const conversation = jobApplication?.conversation;

      if (!conversation) {
        return {
          dispute: {
            id: dispute.id,
            disputeNumber: dispute.disputeNumber,
            title: dispute.title,
            status: dispute.status,
          },
          conversation: null,
          messages: [],
        };
      }

      return {
        dispute: {
          id: dispute.id,
          disputeNumber: dispute.disputeNumber,
          title: dispute.title,
          status: dispute.status,
        },
        conversation: {
          id: conversation.id,
          jobPoster: conversation.jobPoster,
          healthcareUser: conversation.healthcareUser,
          createdAt: conversation.createdAt,
        },
        messages: conversation.messages.map((message) => ({
          id: message.id,
          content: message.content,
          messageType: message.messageType,
          sender: message.sender,
          createdAt: message.createdAt,
          readAt: message.readAt,
        })),
      };
    } catch (error) {
      console.error("Error fetching dispute conversation:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch conversation"
      );
    }
  }

  // ==================== NOTIFICATIONS ====================

  // Get admin notifications
  static async getAdminNotifications(
    adminId: string,
    options: {
      page?: number;
      limit?: number;
      isRead?: boolean;
      type?: string;
    } = {}
  ): Promise<{ data: any[]; pagination: any }> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      const { page = 1, limit = 50, isRead, type } = options;
      const offset = (page - 1) * limit;

      const whereConditions = [eq(notifications.userId, adminId)];

      if (isRead !== undefined) {
        whereConditions.push(eq(notifications.isRead, isRead));
      }

      if (type && type !== "all") {
        whereConditions.push(eq(notifications.type, type as any));
      }

      const [adminNotifications, totalCount] = await Promise.all([
        db.query.notifications.findMany({
          where: and(...whereConditions),
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
                title: true,
              },
            },
          },
          limit,
          offset,
          orderBy: [desc(notifications.createdAt)],
        }),
        db
          .select({ count: count() })
          .from(notifications)
          .where(and(...whereConditions))
          .then((result) => result[0].count),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: adminNotifications,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      console.error("Error fetching admin notifications:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to fetch notifications"
      );
    }
  }

  // Mark notification as read
  static async markNotificationAsRead(
    adminId: string,
    notificationId: string
  ): Promise<boolean> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

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
            eq(notifications.userId, adminId)
          )
        )
        .returning({ id: notifications.id });

      return !!updatedNotification;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      throw new Error("Failed to mark notification as read");
    }
  }

  // Mark all notifications as read
  static async markAllNotificationsAsRead(adminId: string): Promise<number> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      const updatedNotifications = await db
        .update(notifications)
        .set({
          isRead: true,
          readAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notifications.userId, adminId),
            eq(notifications.isRead, false)
          )
        )
        .returning({ id: notifications.id });

      return updatedNotifications.length;
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      throw new Error("Failed to mark all notifications as read");
    }
  }

  // ==================== DASHBOARD STATS ====================

  // Get admin dashboard statistics
  static async getDashboardStats(adminId: string): Promise<any> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      const [
        totalUsers,
        pendingVerifications,
        totalJobPosts,
        activeDisputes,
        totalApplications,
        unreadNotifications,
      ] = await Promise.all([
        // Total users
        db
          .select({ count: count() })
          .from(users)
          .where(and(eq(users.isActive, true), eq(users.isDeleted, false)))
          .then((result) => result[0].count),

        // Pending verifications
        db
          .select({ count: count() })
          .from(users)
          .where(
            and(
              eq(users.profileCompleted, true),
              or(
                eq(users.profileVerified, false),
                eq(users.dbsVerified, false)
              ),
              eq(users.isActive, true),
              eq(users.isDeleted, false)
            )
          )
          .then((result) => result[0].count),

        // Total job posts
        db
          .select({ count: count() })
          .from(jobPosts)
          .where(
            and(eq(jobPosts.isActive, true), eq(jobPosts.isDeleted, false))
          )
          .then((result) => result[0].count),

        // Active disputes
        db
          .select({ count: count() })
          .from(disputes)
          .where(
            and(
              inArray(disputes.status, ["open", "in_review"]),
              eq(disputes.isDeleted, false)
            )
          )
          .then((result) => result[0].count),

        // Total applications
        db
          .select({ count: count() })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.isActive, true),
              eq(jobApplications.isDeleted, false)
            )
          )
          .then((result) => result[0].count),

        // Unread admin notifications
        db
          .select({ count: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, adminId),
              eq(notifications.isRead, false),
              eq(notifications.isActive, true)
            )
          )
          .then((result) => result[0].count),
      ]);

      return {
        totalUsers,
        pendingVerifications,
        totalJobPosts,
        activeDisputes,
        totalApplications,
        unreadNotifications,
      };
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      throw new Error("Failed to fetch dashboard statistics");
    }
  }

  // Get user role distribution
  static async getUserRoleDistribution(adminId: string): Promise<any> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      const roleDistribution = await db
        .select({
          role: users.role,
          count: count(),
        })
        .from(users)
        .where(and(eq(users.isActive, true), eq(users.isDeleted, false)))
        .groupBy(users.role);

      return roleDistribution;
    } catch (error) {
      console.error("Error fetching user role distribution:", error);
      throw new Error("Failed to fetch user role distribution");
    }
  }

  // Get recent activity
  static async getRecentActivity(
    adminId: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      // Validate admin access
      const isAdmin = await this.validateAdminAccess(adminId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      // Get recent activities from different tables
      const [recentUsers, recentJobPosts, recentDisputes, recentApplications] =
        await Promise.all([
          // Recent user registrations
          db.query.users.findMany({
            where: and(eq(users.isActive, true), eq(users.isDeleted, false)),
            columns: {
              id: true,
              email: true,
              name: true,
              role: true,
              createdAt: true,
            },
            limit: 5,
            orderBy: [desc(users.createdAt)],
          }),

          // Recent job posts
          db.query.jobPosts.findMany({
            where: and(
              eq(jobPosts.isActive, true),
              eq(jobPosts.isDeleted, false)
            ),
            columns: {
              id: true,
              title: true,
              createdAt: true,
            },
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            limit: 5,
            orderBy: [desc(jobPosts.createdAt)],
          }),

          // Recent disputes
          db.query.disputes.findMany({
            where: eq(disputes.isDeleted, false),
            columns: {
              id: true,
              disputeNumber: true,
              title: true,
              status: true,
              reportedAt: true,
            },
            limit: 5,
            orderBy: [desc(disputes.reportedAt)],
          }),

          // Recent applications
          db.query.jobApplications.findMany({
            where: and(
              eq(jobApplications.isActive, true),
              eq(jobApplications.isDeleted, false)
            ),
            columns: {
              id: true,
              status: true,
              createdAt: true,
            },
            with: {
              jobPost: {
                columns: {
                  id: true,
                  title: true,
                },
              },
              healthcareUser: {
                columns: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            limit: 5,
            orderBy: [desc(jobApplications.createdAt)],
          }),
        ]);

      // Combine and format activities
      const activities = [
        ...recentUsers.map((user) => ({
          type: "user_registration",
          id: user.id,
          title: `New ${user.role} registered`,
          description: `${user.name || user.email} joined the platform`,
          timestamp: user.createdAt,
          relatedEntity: {
            type: "user",
            id: user.id,
            name: user.name || user.email,
          },
        })),
        ...recentJobPosts.map((job) => ({
          type: "job_posted",
          id: job.id,
          title: "New job posted",
          description: `${job.user.name || job.user.email} posted "${
            job.title
          }"`,
          timestamp: job.createdAt,
          relatedEntity: { type: "job", id: job.id, name: job.title },
        })),
        ...recentDisputes.map((dispute) => ({
          type: "dispute_created",
          id: dispute.id,
          title: "New dispute created",
          description: `Dispute ${dispute.disputeNumber}: ${dispute.title}`,
          timestamp: dispute.reportedAt,
          relatedEntity: {
            type: "dispute",
            id: dispute.id,
            name: dispute.disputeNumber,
          },
        })),
        ...recentApplications.map((app) => ({
          type: "application_submitted",
          id: app.id,
          title: "New job application",
          description: `${
            app.healthcareUser.name || app.healthcareUser.email
          } applied for "${app.jobPost.title}"`,
          timestamp: app.createdAt,
          relatedEntity: {
            type: "application",
            id: app.id,
            name: app.jobPost.title,
          },
        })),
      ];

      // Sort by timestamp and return limited results
      return activities
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, limit);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      throw new Error("Failed to fetch recent activity");
    }
  }

  // ==================== UTILITY METHODS ====================

  // Sanitize admin user data
  static sanitizeAdminData(user: AdminUser): Omit<AdminUser, "cognitoId"> {
    const { cognitoId, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // Get admin user info
  static async getAdminInfo(adminId: string): Promise<AdminUser | null> {
    try {
      const admin = await db.query.users.findFirst({
        where: and(eq(users.id, adminId), eq(users.role, "admin")),
        columns: {
          id: true,
          cognitoId: true,
          email: true,
          role: true,
          name: true,
          profileCompleted: true,
          profileVerified: true,
          dbsVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return admin || null;
    } catch (error) {
      console.error("Error fetching admin info:", error);
      return null;
    }
  }
}
