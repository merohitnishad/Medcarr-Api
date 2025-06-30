// jobPostService.ts - Clean, simplified version
import { db } from "../../db/index.js";
import { 
  jobPosts, 
  jobPostCareNeeds, 
  jobPostLanguages, 
  jobPostPreferences,
} from '../../db/schemas/jobSchema.js';
import { users } from '../../db/schemas/usersSchema.js';
import { careNeeds, languages, preferences } from '../../db/schemas/utilsSchema.js';
import { eq, and, desc, count, asc, or, isNotNull } from 'drizzle-orm';

export interface CreateJobPostData {
  age: number;
  relationship?: string;
  gender: 'male' | 'female';
  title: string;
  postcode: string;
  address: string;
  jobDate: string; // "2025-07-13"
  startTime: string;
  endTime: string;
  shiftLength: number;
  overview: string;
  caregiverGender: 'male' | 'female';
  type: 'oneDay' | 'weekly';
  isRecurring?: boolean;
  recurringData?: {
    frequency: 'weekly';
    selectedDays: string[];
    endDate: string;
  };
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
  // Create job post (single or recurring)
  static async createJobPost(userId: string, data: CreateJobPostData) {
    return await db.transaction(async (tx) => {
      if (data.isRecurring && data.recurringData) {
        return await this.createRecurringJobs(tx, userId, data);
      } else {
        return await this.createSingleJob(tx, userId, data);
      }
    });
  }

  // Create a single job
  private static async createSingleJob(tx: any, userId: string, data: CreateJobPostData) {
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
        jobDate: new Date(data.jobDate),
        startTime: data.startTime,
        endTime: data.endTime,
        shiftLength: data.shiftLength,
        overview: data.overview,
        caregiverGender: data.caregiverGender,
        type: data.type,
        paymentType: data.paymentType,
        paymentCost: data.paymentCost,
        isRecurring: false,
      })
      .returning();

    await this.addJobRelations(tx, jobPost.id, data);
    return { job: jobPost, count: 1 };
  }

  // Create recurring jobs
  private static async createRecurringJobs(tx: any, userId: string, data: CreateJobPostData) {
    const { frequency, selectedDays, endDate } = data.recurringData!;
    
    // Create parent job (template)
    const [parentJob] = await tx
      .insert(jobPosts)
      .values({
        userId,
        age: data.age,
        relationship: data.relationship,
        gender: data.gender,
        title: data.title,
        postcode: data.postcode,
        address: data.address,
        jobDate: new Date(data.jobDate),
        startTime: data.startTime,
        endTime: data.endTime,
        shiftLength: data.shiftLength,
        overview: data.overview,
        caregiverGender: data.caregiverGender,
        type: data.type,
        paymentType: data.paymentType,
        paymentCost: data.paymentCost,
        isRecurring: true,
        recurringPattern: JSON.stringify({
          frequency,
          days: selectedDays,
          endDate
        }),
      })
      .returning();

    await this.addJobRelations(tx, parentJob.id, data);

    // Generate individual job instances
    const jobInstances = this.generateRecurringJobDates(
      new Date(data.jobDate),
      new Date(endDate),
      selectedDays
    );

    const createdJobs = [];
    
    for (const jobDate of jobInstances) {
      const [childJob] = await tx
        .insert(jobPosts)
        .values({
          userId,
          parentJobId: parentJob.id,
          age: data.age,
          relationship: data.relationship,
          gender: data.gender,
          title: data.title,
          postcode: data.postcode,
          address: data.address,
          jobDate,
          startTime: data.startTime,
          endTime: data.endTime,
          shiftLength: data.shiftLength,
          overview: data.overview,
          caregiverGender: data.caregiverGender,
          type: data.type,
          paymentType: data.paymentType,
          paymentCost: data.paymentCost,
          isRecurring: false,
        })
        .returning();

      await this.addJobRelations(tx, childJob.id, data);
      createdJobs.push(childJob);
    }

    return { 
      parentJob, 
      childJobs: createdJobs, 
      count: createdJobs.length + 1 
    };
  }

  // Generate recurring job dates
  private static generateRecurringJobDates(
    startDate: Date,
    endDate: Date,
    selectedDays: string[]
  ): Date[] {
    const dayMap: { [key: string]: number } = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };

    const targetDays = selectedDays.map(day => dayMap[day.toLowerCase()]);
    const dates: Date[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      if (targetDays.includes(current.getDay()) && current > startDate) {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  // Helper to add job relations
  private static async addJobRelations(tx: any, jobPostId: string, data: CreateJobPostData) {
    if (data.careNeedIds && data.careNeedIds.length > 0) {
      await tx.insert(jobPostCareNeeds).values(
        data.careNeedIds.map(careNeedId => ({
          jobPostId,
          careNeedId,
        }))
      );
    }

    if (data.languageIds && data.languageIds.length > 0) {
      await tx.insert(jobPostLanguages).values(
        data.languageIds.map(languageId => ({
          jobPostId,
          languageId,
        }))
      );
    }

    if (data.preferenceIds && data.preferenceIds.length > 0) {
      await tx.insert(jobPostPreferences).values(
        data.preferenceIds.map(preferenceId => ({
          jobPostId,
          preferenceId,
        }))
      );
    }
  }

  // Get a single job post
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

  // Get all job posts - show all individual jobs (excluding parent templates)
  static async getAllJobPosts(filters: JobPostFilters = {}) {
    const { page = 1, limit = 10, postcode, type, paymentType, caregiverGender } = filters;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(jobPosts.isDeleted, false),
      eq(jobPosts.status, 'open'),
      // Show single jobs and child jobs, but not parent templates
      or(
        eq(jobPosts.isRecurring, false),
        and(eq(jobPosts.isRecurring, true), isNotNull(jobPosts.parentJobId))
      )
    ];

    if (postcode) conditions.push(eq(jobPosts.postcode, postcode));
    if (type) conditions.push(eq(jobPosts.type, type));
    if (paymentType) conditions.push(eq(jobPosts.paymentType, paymentType));
    if (caregiverGender) conditions.push(eq(jobPosts.caregiverGender, caregiverGender));

    const [totalCount] = await db
      .select({ count: count() })
      .from(jobPosts)
      .where(and(...conditions));

    const results = await db.query.jobPosts.findMany({
      where: and(...conditions),
      with: {
        user: {
          columns: { id: true, name: true, role: true }
        },
        careNeedsRelation: { with: { careNeed: true } },
        languagesRelation: { with: { language: true } },
        preferencesRelation: { with: { preference: true } }
      },
      orderBy: [asc(jobPosts.jobDate), asc(jobPosts.startTime)],
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
      eq(jobPosts.isDeleted, false),
      // Show single jobs and child jobs, but not parent templates
      or(
        eq(jobPosts.isRecurring, false),
        and(eq(jobPosts.isRecurring, true), isNotNull(jobPosts.parentJobId))
      )
    ];

    const [totalCount] = await db
      .select({ count: count() })
      .from(jobPosts)
      .where(and(...conditions));

    const results = await db.query.jobPosts.findMany({
      where: and(...conditions),
      with: {
        careNeedsRelation: { with: { careNeed: true } },
        languagesRelation: { with: { language: true } },
        preferencesRelation: { with: { preference: true } }
      },
      orderBy: [asc(jobPosts.jobDate), asc(jobPosts.startTime)],
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

  // Update any job post (single, parent template, or child job) - same logic for all
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

      // Prepare update data with proper type conversion
      const updateData: any = { ...data, updatedAt: new Date() };
      
      // Convert jobDate string to Date object if provided
      if (data.jobDate) {
        updateData.jobDate = new Date(data.jobDate);
      }
      
      // Remove fields that shouldn't be updated directly
      delete updateData.careNeedIds;
      delete updateData.languageIds;
      delete updateData.preferenceIds;
      delete updateData.isRecurring;
      delete updateData.recurringData;

      // Update main job post
      const [updatedJobPost] = await tx
        .update(jobPosts)
        .set(updateData)
        .where(eq(jobPosts.id, jobPostId))
        .returning();

      // Update relations if provided
      if (data.careNeedIds !== undefined) {
        await tx.delete(jobPostCareNeeds).where(eq(jobPostCareNeeds.jobPostId, jobPostId));
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
        await tx.delete(jobPostLanguages).where(eq(jobPostLanguages.jobPostId, jobPostId));
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
        await tx.delete(jobPostPreferences).where(eq(jobPostPreferences.jobPostId, jobPostId));
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

  // Close job post
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

  // Validation and helper methods (keep existing ones)
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

    return errors;
  }

  // Keep existing validation methods
  static async validateCareNeedIds(careNeedIds: string[]): Promise<boolean> {
    const validCareNeeds = await db
      .select({ id: careNeeds.id })
      .from(careNeeds)
      .where(eq(careNeeds.isDeleted, false));

    const validIds = validCareNeeds.map(cn => cn.id);
    return careNeedIds.every(id => validIds.includes(id));
  }

  static async validateLanguageIds(languageIds: string[]): Promise<boolean> {
    const validLanguages = await db
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.isDeleted, false));

    const validIds = validLanguages.map(l => l.id);
    return languageIds.every(id => validIds.includes(id));
  }

  static async validatePreferenceIds(preferenceIds: string[]): Promise<boolean> {
    const validPreferences = await db
      .select({ id: preferences.id })
      .from(preferences)
      .where(eq(preferences.isDeleted, false));

    const validIds = validPreferences.map(p => p.id);
    return preferenceIds.every(id => validIds.includes(id));
  }

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

  static sanitizeJobPostData(jobPost: any) {
    const { isDeleted, ...sanitized } = jobPost;
    
    if (jobPost.careNeedsRelation) {
      sanitized.careNeeds = jobPost.careNeedsRelation.map((rel: any) => rel.careNeed);
      delete sanitized.careNeedsRelation;
    }

    if (jobPost.languagesRelation) {
      sanitized.languages = jobPost.languagesRelation.map((rel: any) => rel.language);
      delete sanitized.languagesRelation;
    }

    if (jobPost.preferencesRelation) {
      sanitized.preferences = jobPost.preferencesRelation.map((rel: any) => rel.preference);
      delete sanitized.preferencesRelation;
    }

    return sanitized;
  }
}