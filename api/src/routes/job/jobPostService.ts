// jobPostService.ts
import { db } from "../../db/index.js";
import { 
  jobPosts, 
  jobPostCareNeeds, 
  jobPostLanguages, 
  jobPostPreferences,
} from '../../db/schemas/jobSchema.js';
import { users } from '../../db/schemas/usersSchema.js';
import { careNeeds,languages,preferences  } from '../../db/schemas/utilsSchema.js';
import { eq, and, desc, count, asc } from 'drizzle-orm';

export interface CreateJobPostData {
  age: number;
  relationship?: string;
  gender: 'male' | 'female';
  title: string;
  postcode: string;
  address: string;
  startTime: string;
  endTime: string;
  shiftLength: number;
  overview: string;
  caregiverGender: 'male' | 'female';
  type: 'oneDay' | 'weekly';
  startWeek?: Date;
  endWeek?: Date;
  recurringWeekday?: string[];
  paymentType: 'hourly' | 'fixed';
  paymentCost: number;
  careNeedIds?: string[];
  languageIds?: string[];
  preferenceIds?: string[];
}

export interface UpdateJobPostData extends Partial<CreateJobPostData> {}

export interface JobPostFilters {
  page?: number;
  limit?: number;
  postcode?: string;
  type?: 'oneDay' | 'weekly';
  paymentType?: 'hourly' | 'fixed';
  caregiverGender?: 'male' | 'female';
}

export class JobPostService {
  // Create a new job post with relations
  static async createJobPost(userId: string, data: CreateJobPostData) {
    return await db.transaction(async (tx) => {
      // Create the main job post
      const [jobPost] = await tx
        .insert(jobPosts)
        .values({
          userId,
          age: data.age,
          relationship: data.relationship,
          gender: data.gender,
          title: data.title,
          postcode: data.postcode,
          address: data.address,
          startTime: data.startTime,
          endTime: data.endTime,
          shiftLength: data.shiftLength,
          overview: data.overview,
          caregiverGender: data.caregiverGender,
          type: data.type,
          startWeek: data.startWeek,
          endWeek: data.endWeek,
          recurringWeekday: data.recurringWeekday,
          paymentType: data.paymentType,
          paymentCost: data.paymentCost,
        })
        .returning();

      // Add care needs if provided
      if (data.careNeedIds && data.careNeedIds.length > 0) {
        await tx.insert(jobPostCareNeeds).values(
          data.careNeedIds.map(careNeedId => ({
            jobPostId: jobPost.id,
            careNeedId,
          }))
        );
      }

      // Add languages if provided
      if (data.languageIds && data.languageIds.length > 0) {
        await tx.insert(jobPostLanguages).values(
          data.languageIds.map(languageId => ({
            jobPostId: jobPost.id,
            languageId,
          }))
        );
      }

      // Add preferences if provided
      if (data.preferenceIds && data.preferenceIds.length > 0) {
        await tx.insert(jobPostPreferences).values(
          data.preferenceIds.map(preferenceId => ({
            jobPostId: jobPost.id,
            preferenceId,
          }))
        );
      }

      return jobPost;
    });
  }

  // Get a single job post with all relations
  static async getJobPost(jobPostId: string) {
    const result = await db.query.jobPosts.findFirst({
      where: and(
        eq(jobPosts.id, jobPostId),
        eq(jobPosts.isDeleted, false)
      ),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
          }
        },
        careNeedsRelation: {
          with: {
            careNeed: true
          }
        },
        languagesRelation: {
          with: {
            language: true
          }
        },
        preferencesRelation: {
          with: {
            preference: true
          }
        }
      }
    });

    return result;
  }

  // Get all job posts with pagination and filters
  static async getAllJobPosts(filters: JobPostFilters = {}) {
    const { page = 1, limit = 10, postcode, type, paymentType, caregiverGender } = filters;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [
      eq(jobPosts.isDeleted, false),
      eq(jobPosts.status, 'open'),
    ];

    if (postcode) {
      conditions.push(eq(jobPosts.postcode, postcode));
    }
    if (type) {
      conditions.push(eq(jobPosts.type, type));
    }
    if (paymentType) {
      conditions.push(eq(jobPosts.paymentType, paymentType));
    }
    if (caregiverGender) {
      conditions.push(eq(jobPosts.caregiverGender, caregiverGender));
    }

    // Get total count
    const [totalCount] = await db
      .select({ count: count() })
      .from(jobPosts)
      .where(and(...conditions));

    // Get paginated results
    const results = await db.query.jobPosts.findMany({
      where: and(...conditions),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            role: true,
          }
        },
        careNeedsRelation: {
          with: {
            careNeed: true
          }
        },
        languagesRelation: {
          with: {
            language: true
          }
        },
        preferencesRelation: {
          with: {
            preference: true
          }
        }
      },
      orderBy: [desc(jobPosts.createdAt)],
      limit,
      offset
    });

    return {
      data: results,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
        hasNext: page < Math.ceil(totalCount.count / limit),
        hasPrev: page > 1
      }
    };
  }

  // Get user's job posts
  static async getUserJobPosts(userId: string, filters: JobPostFilters = {}) {
    const { page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(jobPosts.userId, userId),
      eq(jobPosts.isDeleted, false)
    ];

    // Get total count
    const [totalCount] = await db
      .select({ count: count() })
      .from(jobPosts)
      .where(and(...conditions));

    // Get paginated results
    const results = await db.query.jobPosts.findMany({
      where: and(...conditions),
      with: {
        careNeedsRelation: {
          with: {
            careNeed: true
          }
        },
        languagesRelation: {
          with: {
            language: true
          }
        },
        preferencesRelation: {
          with: {
            preference: true
          }
        }
      },
      orderBy: [desc(jobPosts.createdAt)],
      limit,
      offset
    });

    return {
      data: results,
      pagination: {
        page,
        limit,
        total: totalCount.count,
        totalPages: Math.ceil(totalCount.count / limit),
        hasNext: page < Math.ceil(totalCount.count / limit),
        hasPrev: page > 1
      }
    };
  }

  // Update job post
  static async updateJobPost(jobPostId: string, userId: string, data: UpdateJobPostData) {
    return await db.transaction(async (tx) => {
      // Verify ownership
      const existingJobPost = await tx.query.jobPosts.findFirst({
        where: and(
          eq(jobPosts.id, jobPostId),
          eq(jobPosts.userId, userId),
          eq(jobPosts.isDeleted, false)
        )
      });

      if (!existingJobPost) {
        throw new Error('Job post not found or access denied');
      }

      // Update main job post
      const [updatedJobPost] = await tx
        .update(jobPosts)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(jobPosts.id, jobPostId))
        .returning();

      // Update relations if provided
      if (data.careNeedIds !== undefined) {
        // Delete existing relations
        await tx.delete(jobPostCareNeeds).where(eq(jobPostCareNeeds.jobPostId, jobPostId));
        
        // Add new relations
        if (data.careNeedIds.length > 0) {
          await tx.insert(jobPostCareNeeds).values(
            data.careNeedIds.map(careNeedId => ({
              jobPostId,
              careNeedId,
            }))
          );
        }
      }

      if (data.languageIds !== undefined) {
        // Delete existing relations
        await tx.delete(jobPostLanguages).where(eq(jobPostLanguages.jobPostId, jobPostId));
        
        // Add new relations
        if (data.languageIds.length > 0) {
          await tx.insert(jobPostLanguages).values(
            data.languageIds.map(languageId => ({
              jobPostId,
              languageId,
            }))
          );
        }
      }

      if (data.preferenceIds !== undefined) {
        // Delete existing relations
        await tx.delete(jobPostPreferences).where(eq(jobPostPreferences.jobPostId, jobPostId));
        
        // Add new relations
        if (data.preferenceIds.length > 0) {
          await tx.insert(jobPostPreferences).values(
            data.preferenceIds.map(preferenceId => ({
              jobPostId,
              preferenceId,
            }))
          );
        }
      }

      return updatedJobPost;
    });
  }

  // Close job post (change status to closed)
  static async closeJobPost(jobPostId: string, userId: string) {
    const [updatedJobPost] = await db
      .update(jobPosts)
      .set({
        status: 'closed',
        updatedAt: new Date(),
      })
      .where(and(
        eq(jobPosts.id, jobPostId),
        eq(jobPosts.userId, userId),
        eq(jobPosts.isDeleted, false)
      ))
      .returning();

    if (!updatedJobPost) {
      throw new Error('Job post not found or access denied');
    }

    return updatedJobPost;
  }

  // Validation helpers
  static validateJobPostData(data: Partial<CreateJobPostData>): string[] {
    const errors: string[] = [];

    if (data.age && (data.age < 0 || data.age > 120)) {
      errors.push('Age must be between 0 and 120');
    }

    if (data.title && data.title.trim().length < 5) {
      errors.push('Title must be at least 5 characters long');
    }

    if (data.postcode && !/^[A-Z0-9\s-]{3,10}$/i.test(data.postcode)) {
      errors.push('Invalid postcode format');
    }

    if (data.address && data.address.trim().length < 10) {
      errors.push('Address must be at least 10 characters long');
    }

    if (data.overview && data.overview.trim().length < 20) {
      errors.push('Overview must be at least 20 characters long');
    }

    if (data.shiftLength && (data.shiftLength < 1 || data.shiftLength > 24)) {
      errors.push('Shift length must be between 1 and 24 hours');
    }

    if (data.paymentCost && data.paymentCost < 0) {
      errors.push('Payment cost must be positive');
    }

    if (data.startTime && data.endTime && data.startTime >= data.endTime) {
      errors.push('End time must be after start time');
    }

    if (data.type === 'weekly' && data.startWeek && data.endWeek && data.startWeek >= data.endWeek) {
      errors.push('End week must be after start week');
    }

    return errors;
  }

  // Validate care need IDs
  static async validateCareNeedIds(careNeedIds: string[]): Promise<boolean> {
    const validCareNeeds = await db
      .select({ id: careNeeds.id })
      .from(careNeeds)
      .where(and(
        eq(careNeeds.isDeleted, false)
      ));

    const validIds = validCareNeeds.map(cn => cn.id);
    return careNeedIds.every(id => validIds.includes(id));
  }

  // Validate language IDs
  static async validateLanguageIds(languageIds: string[]): Promise<boolean> {
    const validLanguages = await db
      .select({ id: languages.id })
      .from(languages)
      .where(and(
        eq(languages.isDeleted, false)
      ));

    const validIds = validLanguages.map(l => l.id);
    return languageIds.every(id => validIds.includes(id));
  }

  // Validate preference IDs
  static async validatePreferenceIds(preferenceIds: string[]): Promise<boolean> {
    const validPreferences = await db
      .select({ id: preferences.id })
      .from(preferences)
      .where(and(
        eq(preferences.isDeleted, false)
      ));

    const validIds = validPreferences.map(p => p.id);
    return preferenceIds.every(id => validIds.includes(id));
  }

  // Get available options for dropdowns
  static async getAvailableCareNeeds() {
    return await db
      .select({ id: careNeeds.id, name: careNeeds.name })
      .from(careNeeds)
      .where(eq(careNeeds.isDeleted, false))
      .orderBy(asc(careNeeds.name));
  }

  static async getAvailableLanguages() {
    return await db
      .select({ id: languages.id, name: languages.name })
      .from(languages)
      .where(eq(languages.isDeleted, false))
      .orderBy(asc(languages.name));
  }

  static async getAvailablePreferences() {
    return await db
      .select({ id: preferences.id, name: preferences.name })
      .from(preferences)
      .where(eq(preferences.isDeleted, false))
      .orderBy(asc(preferences.name));
  }

  // Check if user can access job post
  static async validateUserAccess(currentUserId: string, jobPostId: string): Promise<boolean> {
    const jobPost = await db.query.jobPosts.findFirst({
      where: and(
        eq(jobPosts.id, jobPostId),
        eq(jobPosts.isDeleted, false)
      ),
      columns: {
        userId: true
      }
    });

    return jobPost?.userId === currentUserId;
  }

  // Sanitize job post data for response
  static sanitizeJobPostData(jobPost: any) {
    const { isDeleted, ...sanitized } = jobPost;
    
    // Transform care needs
    if (jobPost.careNeedsRelation) {
      sanitized.careNeeds = jobPost.careNeedsRelation.map((rel: any) => rel.careNeed);
      delete sanitized.careNeedsRelation;
    }

    // Transform languages
    if (jobPost.languagesRelation) {
      sanitized.languages = jobPost.languagesRelation.map((rel: any) => rel.language);
      delete sanitized.languagesRelation;
    }

    // Transform preferences
    if (jobPost.preferencesRelation) {
      sanitized.preferences = jobPost.preferencesRelation.map((rel: any) => rel.preference);
      delete sanitized.preferencesRelation;
    }

    return sanitized;
  }
}