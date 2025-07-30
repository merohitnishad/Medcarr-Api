import { db } from "../../db/index.js";
import {
  reviews,
  reviewHelpfulVotes,
  reviewStatusEnum,
} from "../../db/schemas/reviewSchema.js";
import {
  users,
  healthcareProfiles,
  individualProfiles,
  organizationProfiles,
} from "../../db/schemas/usersSchema.js";
import { jobPosts } from "../../db/schemas/jobSchema.js";
import { eq, and, desc, asc, avg, count, sql, inArray } from "drizzle-orm";
import { NotificationService } from "../notification/notificationService.js";

export interface Review {
  id: string;
  jobPostId: string;
  reviewerId: string;
  healthcareProviderId: string;
  healthcareProfileId: string;
  rating: number;
  title: string;
  reviewText: string;
  professionalismRating: number;
  punctualityRating: number;
  qualityOfCareRating: number;
  communicationRating: number;
  wouldRecommend: boolean;
  privateNotes?: string;
  healthcareResponse?: string;
  responseDate?: Date;
  status: string;
  isVerified: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Populated fields
  reviewer?: {
    id: string;
    name?: string;
    role: string;
    profileName?: string; // Individual fullName or Organization name
  };
  jobPost?: {
    id: string;
    title: string;
    jobDate: Date;
  };
  helpfulVotes?: {
    helpful: number;
    notHelpful: number;
    userVote?: boolean; // Current user's vote if applicable
  };
}

export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  categoryAverages: {
    professionalism: number;
    punctuality: number;
    qualityOfCare: number;
    communication: number;
  };
  recommendationRate: number; // Percentage who would recommend
}

export interface CreateReviewData {
  jobPostId: string;
  healthcareProviderId: string;
  rating: number;
  title: string;
  reviewText: string;
  professionalismRating: number;
  punctualityRating: number;
  qualityOfCareRating: number;
  communicationRating: number;
  wouldRecommend: boolean;
  privateNotes?: string;
  isPublic?: boolean;
}

export interface UpdateReviewData {
  rating?: number;
  title?: string;
  reviewText?: string;
  professionalismRating?: number;
  punctualityRating?: number;
  qualityOfCareRating?: number;
  communicationRating?: number;
  wouldRecommend?: boolean;
  privateNotes?: string;
  isPublic?: boolean;
}

export class ReviewService {
  // Create a new review
  static async createReview(
    reviewerId: string,
    reviewData: CreateReviewData
  ): Promise<Review> {
    try {
      // Validate job post exists and is completed
      const jobPost = await db.query.jobPosts.findFirst({
        where: and(
          eq(jobPosts.id, reviewData.jobPostId),
          eq(jobPosts.status, "completed"),
          eq(jobPosts.userId, reviewerId), // Only job poster can review
          eq(jobPosts.isDeleted, false) // Only job poster can review
        ),
      });

      if (!jobPost) {
        throw new Error("Job post not found or not completed");
      }

      // Check if review already exists
      const existingReview = await db.query.reviews.findFirst({
        where: and(
          eq(reviews.jobPostId, reviewData.jobPostId),
          eq(reviews.reviewerId, reviewerId),
          eq(reviews.isDeleted, false)
        ),
      });

      if (existingReview) {
        throw new Error("Review already exists for this job");
      }

      // Get healthcare profile ID
      const healthcareUser = await db.query.users.findFirst({
        where: and(
          eq(users.id, reviewData.healthcareProviderId),
          eq(users.role, "healthcare"),
          eq(users.isDeleted, false)
        ),
        with: {
          healthcareProfile: true,
        },
      });

      if (!healthcareUser?.healthcareProfile) {
        throw new Error("Healthcare provider not found");
      }

      // Create review
      const [createdReview] = await db
        .insert(reviews)
        .values({
          ...reviewData,
          reviewerId,
          healthcareProfileId: healthcareUser.healthcareProfile.id,
          status: "submitted",
        })
        .returning();

      // Add this after successfully creating the review and before returning
      await db
        .update(jobPosts)
        .set({
          isReviewed: true,
          updatedAt: new Date(),
        })
        .where(eq(jobPosts.id, reviewData.jobPostId));

      await NotificationService.createFromTemplate(
        "REVIEW_RECEIVED",
        reviewData.healthcareProviderId, // Notify the healthcare provider
        {
          rating: reviewData.rating.toString(),
          jobTitle: jobPost.title,
          reviewId: createdReview.id,
        },
        {
          jobPostId: reviewData.jobPostId,
          relatedUserId: reviewerId, // The job poster who left the review
          metadata: {
            reviewId: createdReview.id,
            rating: reviewData.rating,
          },
          sendEmail: true, // Send email notification for reviews
        }
      );

      return await this.getReviewById(createdReview.id);
    } catch (error) {
      console.error("Error creating review:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to create review"
      );
    }
  }

  // Get review by ID with full details
  static async getReviewById(
    reviewId: string,
    currentUserId?: string
  ): Promise<Review> {
    try {
      const result = await db.query.reviews.findFirst({
        where: and(eq(reviews.id, reviewId), eq(reviews.isDeleted, false)),
        with: {
          reviewer: {
            with: {
              individualProfile: true,
              organizationProfile: true,
            },
          },
          jobPost: true,
          helpfulVotes: true,
        },
      });

      if (!result) {
        throw new Error("Review not found");
      }

      return this.transformReviewData(result, currentUserId);
    } catch (error) {
      console.error("Error fetching review:", error);
      throw new Error("Failed to fetch review");
    }
  }

  // Get reviews for a healthcare provider
  static async getHealthcareProviderReviews(
    healthcareProviderId: string,
    options: {
      limit?: number;
      offset?: number;
      includePrivate?: boolean;
      currentUserId?: string;
    } = {}
  ): Promise<{ reviews: Review[]; total: number }> {
    try {
      const {
        limit = 10,
        offset = 0,
        includePrivate = false,
        currentUserId,
      } = options;

      const whereConditions = [
        eq(reviews.healthcareProviderId, healthcareProviderId),
        eq(reviews.isDeleted, false),
      ];

      if (!includePrivate) {
        whereConditions.push(eq(reviews.isPublic, true));
      }

      const [reviewResults, totalCount] = await Promise.all([
        db.query.reviews.findMany({
          where: and(...whereConditions),
          with: {
            reviewer: {
              with: {
                individualProfile: true,
                organizationProfile: true,
              },
            },
            jobPost: true,
            helpfulVotes: true,
          },
          orderBy: [desc(reviews.createdAt)],
          limit,
          offset,
        }),
        db
          .select({ count: count() })
          .from(reviews)
          .where(and(...whereConditions))
          .then((result) => result[0].count),
      ]);

      const transformedReviews = reviewResults.map((review) =>
        this.transformReviewData(review, currentUserId)
      );

      return {
        reviews: transformedReviews,
        total: totalCount,
      };
    } catch (error) {
      console.error("Error fetching healthcare provider reviews:", error);
      throw new Error("Failed to fetch reviews");
    }
  }

  // Get reviews by a specific reviewer (individual/organization)
  static async getReviewsByReviewer(
    reviewerId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ reviews: Review[]; total: number }> {
    try {
      const { limit = 10, offset = 0 } = options;

      const [reviewResults, totalCount] = await Promise.all([
        db.query.reviews.findMany({
          where: and(
            eq(reviews.reviewerId, reviewerId),
            eq(reviews.isDeleted, false)
          ),
          with: {
            healthcareProvider: {
              with: {
                healthcareProfile: true,
              },
            },
            jobPost: true,
            helpfulVotes: true,
          },
          orderBy: [desc(reviews.createdAt)],
          limit,
          offset,
        }),
        db
          .select({ count: count() })
          .from(reviews)
          .where(
            and(
              eq(reviews.reviewerId, reviewerId),
              eq(reviews.isDeleted, false)
            )
          )
          .then((result) => result[0].count),
      ]);

      const transformedReviews = reviewResults.map((review) =>
        this.transformReviewData(review, reviewerId)
      );

      return {
        reviews: transformedReviews,
        total: totalCount,
      };
    } catch (error) {
      console.error("Error fetching reviewer's reviews:", error);
      throw new Error("Failed to fetch reviews");
    }
  }

  // Update a review (only by reviewer within time limit)
  static async updateReview(
    reviewId: string,
    reviewerId: string,
    updateData: UpdateReviewData
  ): Promise<Review> {
    try {
      const existingReview = await db.query.reviews.findFirst({
        where: and(
          eq(reviews.id, reviewId),
          eq(reviews.reviewerId, reviewerId),
          eq(reviews.isDeleted, false)
        ),
      });

      if (!existingReview) {
        throw new Error("Review not found or access denied");
      }

      // Check if review can still be edited (e.g., within 24 hours)
      const hoursSinceCreated =
        (Date.now() - existingReview.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCreated > 24) {
        throw new Error("Review can no longer be edited");
      }

      await db
        .update(reviews)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, reviewId));

      return await this.getReviewById(reviewId);
    } catch (error) {
      console.error("Error updating review:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to update review"
      );
    }
  }

  // Healthcare provider responds to review
  static async respondToReview(
    reviewId: string,
    healthcareProviderId: string,
    response: string
  ): Promise<Review> {
    try {
      const existingReview = await db.query.reviews.findFirst({
        where: and(
          eq(reviews.id, reviewId),
          eq(reviews.healthcareProviderId, healthcareProviderId),
          eq(reviews.isDeleted, false)
        ),
      });

      if (!existingReview) {
        throw new Error("Review not found or access denied");
      }

      if (response.trim().length < 10) {
        throw new Error("Response must be at least 10 characters long");
      }

      await db
        .update(reviews)
        .set({
          healthcareResponse: response,
          responseDate: new Date(),
          status: "responded",
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, reviewId));

      return await this.getReviewById(reviewId);
    } catch (error) {
      console.error("Error responding to review:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to respond to review"
      );
    }
  }

  // Get review statistics for a healthcare provider
  static async getReviewStats(
    healthcareProviderId: string
  ): Promise<ReviewStats> {
    try {
      const reviewsData = await db
        .select({
          rating: reviews.rating,
          professionalismRating: reviews.professionalismRating,
          punctualityRating: reviews.punctualityRating,
          qualityOfCareRating: reviews.qualityOfCareRating,
          communicationRating: reviews.communicationRating,
          wouldRecommend: reviews.wouldRecommend,
        })
        .from(reviews)
        .where(
          and(
            eq(reviews.healthcareProviderId, healthcareProviderId),
            eq(reviews.isDeleted, false),
            eq(reviews.isPublic, true)
          )
        );

      if (reviewsData.length === 0) {
        return {
          totalReviews: 0,
          averageRating: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          categoryAverages: {
            professionalism: 0,
            punctuality: 0,
            qualityOfCare: 0,
            communication: 0,
          },
          recommendationRate: 0,
        };
      }

      // Calculate statistics
      const totalReviews = reviewsData.length;
      const averageRating =
        reviewsData.reduce((sum, r) => sum + r.rating, 0) / totalReviews;

      const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      reviewsData.forEach((r) => {
        ratingDistribution[r.rating as keyof typeof ratingDistribution]++;
      });

      const categoryAverages = {
        professionalism:
          reviewsData.reduce((sum, r) => sum + r.professionalismRating, 0) /
          totalReviews,
        punctuality:
          reviewsData.reduce((sum, r) => sum + r.punctualityRating, 0) /
          totalReviews,
        qualityOfCare:
          reviewsData.reduce((sum, r) => sum + r.qualityOfCareRating, 0) /
          totalReviews,
        communication:
          reviewsData.reduce((sum, r) => sum + r.communicationRating, 0) /
          totalReviews,
      };

      const recommendationRate =
        (reviewsData.filter((r) => r.wouldRecommend).length / totalReviews) *
        100;

      return {
        totalReviews,
        averageRating: Math.round(averageRating * 100) / 100,
        ratingDistribution,
        categoryAverages: {
          professionalism:
            Math.round(categoryAverages.professionalism * 100) / 100,
          punctuality: Math.round(categoryAverages.punctuality * 100) / 100,
          qualityOfCare: Math.round(categoryAverages.qualityOfCare * 100) / 100,
          communication: Math.round(categoryAverages.communication * 100) / 100,
        },
        recommendationRate: Math.round(recommendationRate * 100) / 100,
      };
    } catch (error) {
      console.error("Error calculating review stats:", error);
      throw new Error("Failed to calculate review statistics");
    }
  }

  // Vote on review helpfulness
  static async voteOnReview(
    reviewId: string,
    userId: string,
    isHelpful: boolean
  ): Promise<void> {
    try {
      // Check if user already voted
      const existingVote = await db.query.reviewHelpfulVotes.findFirst({
        where: and(
          eq(reviewHelpfulVotes.reviewId, reviewId),
          eq(reviewHelpfulVotes.userId, userId)
        ),
      });

      if (existingVote) {
        // Update existing vote
        await db
          .update(reviewHelpfulVotes)
          .set({ isHelpful })
          .where(eq(reviewHelpfulVotes.id, existingVote.id));
      } else {
        // Create new vote
        await db.insert(reviewHelpfulVotes).values({
          reviewId,
          userId,
          isHelpful,
        });
      }
    } catch (error) {
      console.error("Error voting on review:", error);
      throw new Error("Failed to vote on review");
    }
  }

  // Check if user can review a job
  static async canReviewJob(
    userId: string,
    jobPostId: string
  ): Promise<boolean> {
    try {
      const jobPost = await db.query.jobPosts.findFirst({
        where: and(
          eq(jobPosts.id, jobPostId),
          eq(jobPosts.userId, userId),
          eq(jobPosts.status, "completed")
        ),
      });

      if (!jobPost) return false;

      const existingReview = await db.query.reviews.findFirst({
        where: and(
          eq(reviews.jobPostId, jobPostId),
          eq(reviews.reviewerId, userId)
        ),
      });

      return !existingReview;
    } catch (error) {
      console.error("Error checking review eligibility:", error);
      return false;
    }
  }

  // Delete review (soft delete)
  static async deleteReview(
    reviewId: string,
    userId: string,
    isAdmin = false
  ): Promise<boolean> {
    try {
      const whereCondition = isAdmin
        ? eq(reviews.id, reviewId)
        : and(eq(reviews.id, reviewId), eq(reviews.reviewerId, userId));
  
      // First, get the review to find the associated jobPostId
      const reviewToDelete = await db
        .select({ jobPostId: reviews.jobPostId })
        .from(reviews)
        .where(whereCondition)
        .limit(1);
  
      if (reviewToDelete.length === 0) {
        return false; // Review not found or user doesn't have permission
      }
  
      const jobPostId = reviewToDelete[0].jobPostId;
  
      // Use a transaction to ensure both operations succeed or fail together
      const result = await db.transaction(async (tx) => {
        // Delete the review (soft delete)
        const deletedReview = await tx
          .update(reviews)
          .set({
            isDeleted: true,
            updatedAt: new Date(),
          })
          .where(whereCondition)
          .returning({ id: reviews.id });
  
        if (deletedReview.length === 0) {
          throw new Error("Failed to delete review");
        }
  
        // Update the job post's isReviewed to false
        await tx
          .update(jobPosts) // assuming your job posts table is named 'jobPosts'
          .set({
            isReviewed: false,
            updatedAt: new Date(),
          })
          .where(eq(jobPosts.id, jobPostId));
  
        return deletedReview;
      });
  
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting review:", error);
      throw new Error("Failed to delete review");
    }
  }
  // Validate review data
  static validateReviewData(
    data: CreateReviewData | UpdateReviewData
  ): string[] {
    const errors: string[] = [];

    if ("rating" in data && data.rating !== undefined) {
      if (data.rating < 1 || data.rating > 5) {
        errors.push("Overall rating must be between 1 and 5");
      }
    }

    if ("title" in data && data.title !== undefined) {
      if (!data.title || data.title.trim().length < 5) {
        errors.push("Title must be at least 5 characters long");
      }
      if (data.title.length > 255) {
        errors.push("Title must be less than 255 characters");
      }
    }

    if ("reviewText" in data && data.reviewText !== undefined) {
      if (!data.reviewText || data.reviewText.trim().length < 20) {
        errors.push("Review text must be at least 20 characters long");
      }
    }

    const categoryRatings = [
      "professionalismRating",
      "punctualityRating",
      "qualityOfCareRating",
      "communicationRating",
    ] as const;

    categoryRatings.forEach((rating) => {
      if (rating in data && data[rating] !== undefined) {
        if (data[rating]! < 1 || data[rating]! > 5) {
          errors.push(
            `${rating.replace("Rating", "")} rating must be between 1 and 5`
          );
        }
      }
    });

    return errors;
  }

  // Transform raw database data to Review interface
  private static transformReviewData(
    rawData: any,
    currentUserId?: string
  ): Review {
    const review: Review = {
      id: rawData.id,
      jobPostId: rawData.jobPostId,
      reviewerId: rawData.reviewerId,
      healthcareProviderId: rawData.healthcareProviderId,
      healthcareProfileId: rawData.healthcareProfileId,
      rating: rawData.rating,
      title: rawData.title,
      reviewText: rawData.reviewText,
      professionalismRating: rawData.professionalismRating,
      punctualityRating: rawData.punctualityRating,
      qualityOfCareRating: rawData.qualityOfCareRating,
      communicationRating: rawData.communicationRating,
      wouldRecommend: rawData.wouldRecommend,
      privateNotes: rawData.privateNotes,
      healthcareResponse: rawData.healthcareResponse,
      responseDate: rawData.responseDate,
      status: rawData.status,
      isVerified: rawData.isVerified,
      isPublic: rawData.isPublic,
      createdAt: rawData.createdAt,
      updatedAt: rawData.updatedAt,
    };

    // Add reviewer info
    if (rawData.reviewer) {
      const profileName =
        rawData.reviewer.individualProfile?.fullName ||
        rawData.reviewer.organizationProfile?.organizationName ||
        rawData.reviewer.name;

      review.reviewer = {
        id: rawData.reviewer.id,
        name: rawData.reviewer.name,
        role: rawData.reviewer.role,
        profileName,
      };
    }

    // Add job post info
    if (rawData.jobPost) {
      review.jobPost = {
        id: rawData.jobPost.id,
        title: rawData.jobPost.title,
        jobDate: rawData.jobPost.jobDate,
      };
    }

    // Calculate helpful votes
    if (rawData.helpfulVotes) {
      const helpfulCount = rawData.helpfulVotes.filter(
        (vote: any) => vote.isHelpful
      ).length;
      const notHelpfulCount = rawData.helpfulVotes.filter(
        (vote: any) => !vote.isHelpful
      ).length;
      const userVote = currentUserId
        ? rawData.helpfulVotes.find(
            (vote: any) => vote.userId === currentUserId
          )?.isHelpful
        : undefined;

      review.helpfulVotes = {
        helpful: helpfulCount,
        notHelpful: notHelpfulCount,
        userVote,
      };
    }

    return review;
  }
}
