import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    boolean,
    index,
    text,
    integer,
    pgEnum,
  } from "drizzle-orm/pg-core";
  import { relations } from "drizzle-orm";
  import { createInsertSchema } from "drizzle-zod";
  import { users, healthcareProfiles } from "./usersSchema";
  import { jobPosts } from "./jobSchema";
  
  // Enums for review
  export const reviewStatusEnum = pgEnum("review_status", [
    "pending",
    "submitted", 
    "responded"
  ]);
  
  // Reviews Table
  export const reviews = pgTable(
    "reviews",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      jobPostId: uuid("job_post_id")
        .notNull()
        .references(() => jobPosts.id, { onDelete: "cascade" }),
      reviewerId: uuid("reviewer_id") // Individual or Organization user who posts the review
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      healthcareProviderId: uuid("healthcare_provider_id") // Healthcare professional being reviewed
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      healthcareProfileId: uuid("healthcare_profile_id") // Direct reference to healthcare profile
        .notNull()
        .references(() => healthcareProfiles.id, { onDelete: "cascade" }),
      
      // Review Content
      rating: integer("rating").notNull(), // 1-5 stars
      title: varchar("title", { length: 255 }).notNull(),
      reviewText: text("review_text").notNull(),
      
      // Specific Rating Categories (1-5 each)
      professionalismRating: integer("professionalism_rating").notNull(),
      punctualityRating: integer("punctuality_rating").notNull(),
      qualityOfCareRating: integer("quality_of_care_rating").notNull(),
      communicationRating: integer("communication_rating").notNull(),
      
      // Optional feedback
      wouldRecommend: boolean("would_recommend").notNull(),
      privateNotes: text("private_notes"), // Only visible to admin/healthcare provider
      
      // Response from healthcare provider
      healthcareResponse: text("healthcare_response"),
      responseDate: timestamp("response_date"),
      
      // Status and metadata
      status: reviewStatusEnum("status").default("submitted").notNull(),
      isVerified: boolean("is_verified").default(false).notNull(), // Admin verification
      isPublic: boolean("is_public").default(true).notNull(), // Can be made private
      isDeleted: boolean("is_deleted").default(false).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
      jobPostIdIdx: index("reviews_job_post_id_idx").on(table.jobPostId),
      reviewerIdIdx: index("reviews_reviewer_id_idx").on(table.reviewerId),
      healthcareProviderIdIdx: index("reviews_healthcare_provider_id_idx").on(table.healthcareProviderId),
      healthcareProfileIdIdx: index("reviews_healthcare_profile_id_idx").on(table.healthcareProfileId),
      ratingIdx: index("reviews_rating_idx").on(table.rating),
      statusIdx: index("reviews_status_idx").on(table.status),
      createdAtIdx: index("reviews_created_at_idx").on(table.createdAt),
      
      // Unique constraint: one review per job post per reviewer
      uniqueJobReview: index("unique_job_review").on(table.jobPostId, table.reviewerId),
    })
  );
  
  // Review Helpful Votes (for community feedback)
  export const reviewHelpfulVotes = pgTable(
    "review_helpful_votes",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      reviewId: uuid("review_id")
        .notNull()
        .references(() => reviews.id, { onDelete: "cascade" }),
      userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      isHelpful: boolean("is_helpful").notNull(), // true for helpful, false for not helpful
      createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
      reviewIdIdx: index("review_helpful_votes_review_id_idx").on(table.reviewId),
      userIdIdx: index("review_helpful_votes_user_id_idx").on(table.userId),
      
      // Unique constraint: one vote per user per review
      uniqueUserReviewVote: index("unique_user_review_vote").on(table.reviewId, table.userId),
    })
  );
  
  // Relations
  export const reviewsRelations = relations(reviews, ({ one, many }) => ({
    jobPost: one(jobPosts, {
      fields: [reviews.jobPostId],
      references: [jobPosts.id],
    }),
    reviewer: one(users, {
      fields: [reviews.reviewerId],
      references: [users.id],
      relationName: "reviewsAsReviewer"
    }),
    healthcareProvider: one(users, {
      fields: [reviews.healthcareProviderId],
      references: [users.id],
      relationName: "reviewsAsProvider"
    }),
    healthcareProfile: one(healthcareProfiles, {
      fields: [reviews.healthcareProfileId],
      references: [healthcareProfiles.id],
    }),
    helpfulVotes: many(reviewHelpfulVotes),
  }));
  
  export const reviewHelpfulVotesRelations = relations(reviewHelpfulVotes, ({ one }) => ({
    review: one(reviews, {
      fields: [reviewHelpfulVotes.reviewId],
      references: [reviews.id],
    }),
    user: one(users, {
      fields: [reviewHelpfulVotes.userId],
      references: [users.id],
    }),
  }));
  
  // Update existing relations to include reviews
//   export const usersRelationsWithReviews = relations(users, ({ one, many }) => ({
//     // ... existing relations from your schema
//     reviewsAsReviewer: many(reviews, { relationName: "reviewsAsReviewer" }),
//     reviewsAsProvider: many(reviews, { relationName: "reviewsAsProvider" }),
//     reviewHelpfulVotes: many(reviewHelpfulVotes),
//   }));
  
//   export const healthcareProfilesRelationsWithReviews = relations(healthcareProfiles, ({ one, many }) => ({
//     // ... existing relations from your schema
//     reviews: many(reviews),
//   }));
  
//   export const jobPostsRelationsWithReviews = relations(jobPosts, ({ one, many }) => ({
//     // ... existing relations from your schema
//     reviews: many(reviews),
//   }));
  
  // Zod Schemas for validation
  export const createReviewSchema = createInsertSchema(reviews).omit({
    id: true,
    healthcareResponse: true,
    responseDate: true,
    status: true,
    isVerified: true,
    isDeleted: true,
    createdAt: true,
    updatedAt: true,
  });
  
  export const updateReviewSchema = createInsertSchema(reviews).omit({
    id: true,
    jobPostId: true,
    reviewerId: true,
    healthcareProviderId: true,
    healthcareProfileId: true,
    status: true,
    isVerified: true,
    isDeleted: true,
    createdAt: true,
    updatedAt: true,
  }).partial();
  
//   export const healthcareResponseSchema = createInsertSchema(reviews).pick({
//     healthcareResponse: true,
//   }).extend({
//     healthcareResponse: createInsertSchema(reviews).shape.healthcareResponse.min(10, "Response must be at least 10 characters")
//   });
  
  export const createReviewHelpfulVoteSchema = createInsertSchema(reviewHelpfulVotes).omit({
    id: true,
    createdAt: true,
  });