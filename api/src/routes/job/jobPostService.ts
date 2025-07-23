// jobPostService.ts - Clean, simplified version
import { healthcareProfiles, users } from "../../db/schemas/usersSchema.js";
import { db } from "../../db/index.js";
import {
  jobPosts,
  jobPostCareNeeds,
  jobPostLanguages,
  jobPostPreferences,
} from "../../db/schemas/jobSchema.js";
import { jobApplications } from "../../db/schemas/jobApplicationSchema.js"; // Add this import
import {
  careNeeds,
  languages,
  preferences,
} from "../../db/schemas/utilsSchema.js";
import {
  eq,
  and,
  desc,
  count,
  asc,
  gte,
  ne,
  lt,
  inArray,
  or,
  notInArray,
  lte,
} from "drizzle-orm";

export interface CreateJobPostData {
  age: number;
  relationship?: string;
  gender: "male" | "female";
  title: string;
  postcode: string;
  address: string;
  jobDate: string; // "2025-07-13"
  startTime: string;
  endTime: string;
  shiftLength: number;
  overview: string;
  caregiverGender: "male" | "female";
  type: "oneDay" | "weekly";
  isRecurring?: boolean;
  recurringData?: {
    frequency: "weekly";
    selectedDays: string[];
    endDate: string;
  };
  paymentType: "hourly" | "fixed";
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
  type?: ("oneDay" | "weekly")[];
  paymentType?: ("hourly" | "fixed")[];
  caregiverGender?: ("male" | "female")[];
  minPaymentCost?: number;
  maxPaymentCost?: number;
  startDate?: string;
  shiftLengthRanges?: Array<{min?: number, max?: number}>;
  careNeedIds?: string[];
  languageIds?: string[];
  preferenceIds?: string[];
}

export interface RepostJobData {
  jobDate: string;
  startTime: string;
  endTime: string;
  shiftLength: number;
}

export interface BulkJobData {
  age: number;
  gender: "male" | "female";
  title: string;
  postcode: string;
  address: string;
  jobDate: string;
  startTime: string;
  endTime: string;
  shiftLength: number;
  overview: string;
  caregiverGender: "male" | "female";
  paymentType: "hourly" | "fixed";
  paymentCost: number;
  careNeeds?: string; // Comma-separated care need names
  languages?: string; // Comma-separated language names
  preferences?: string; // Comma-separated preference names
  rowNumber?: number; // For tracking which row this came from
}

export interface BulkJobValidationResult {
  valid: BulkJobData[];
  invalid: Array<{
    row: number;
    data: Partial<BulkJobData>;
    errors: string[];
  }>;
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
  };
}

export interface BulkJobCreateResult {
  successful: Array<{
    row: number;
    jobId: string;
    title: string;
  }>;
  failed: Array<{
    row: number;
    data: BulkJobData;
    error: string;
  }>;
  summary: {
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
  };
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
  private static async createSingleJob(
    tx: any,
    userId: string,
    data: CreateJobPostData
  ) {
    const jobDateTime = `${data.jobDate}-${data.startTime}`;

    const existingJob = await tx
      .select({ id: jobPosts.id })
      .from(jobPosts)
      .where(
        and(
          eq(jobPosts.userId, userId),
          eq(jobPosts.jobDate, new Date(data.jobDate)),
          eq(jobPosts.startTime, data.startTime),
          eq(jobPosts.isDeleted, false)
        )
      )
      .limit(1);

    if (existingJob.length > 0) {
      throw new Error("A job already exists for this date and time");
    }
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
  private static async createRecurringJobs(
    tx: any,
    userId: string,
    data: CreateJobPostData
  ) {
    const { frequency, selectedDays, endDate } = data.recurringData!;

    // Generate individual job instances
    const jobInstances = this.generateRecurringJobDates(
      new Date(data.jobDate),
      new Date(endDate),
      selectedDays
    );

    // Add the start date to the instances for validation
    const allJobDates = [new Date(data.jobDate), ...jobInstances];

    // Check for existing jobs with same date and time
    const existingJobs = await tx
      .select({
        jobDate: jobPosts.jobDate,
        startTime: jobPosts.startTime,
      })
      .from(jobPosts)
      .where(
        and(
          eq(jobPosts.userId, userId),
          eq(jobPosts.startTime, data.startTime),
          eq(jobPosts.isDeleted, false)
        )
      );

    const existingJobTimes = new Set(
      existingJobs.map(
        (job: any) => `${job.jobDate.toISOString().split("T")[0]}-${job.startTime}`
      )
    );

    // Check for conflicts
    const conflicts = allJobDates.filter((date) => {
      const dateTimeStr = `${date.toISOString().split("T")[0]}-${
        data.startTime
      }`;
      return existingJobTimes.has(dateTimeStr);
    });

    if (conflicts.length > 0) {
      const conflictDates = conflicts.map(
        (date) => date.toISOString().split("T")[0]
      );
      throw new Error(
        `Jobs already exist for the following dates at ${
          data.startTime
        }: ${conflictDates.join(", ")}`
      );
    }

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
          endDate,
        }),
      })
      .returning();

    await this.addJobRelations(tx, parentJob.id, data);

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
      count: createdJobs.length + 1,
    };
  }

  // Generate recurring job dates
  private static generateRecurringJobDates(
    startDate: Date,
    endDate: Date,
    selectedDays: string[]
  ): Date[] {
    const dayMap: { [key: string]: number } = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const targetDays = selectedDays.map((day) => dayMap[day.toLowerCase()]);
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
  private static async addJobRelations(
    tx: any,
    jobPostId: string,
    data: CreateJobPostData
  ) {
    if (data.careNeedIds && data.careNeedIds.length > 0) {
      await tx.insert(jobPostCareNeeds).values(
        data.careNeedIds.map((careNeedId) => ({
          jobPostId,
          careNeedId,
        }))
      );
    }

    if (data.languageIds && data.languageIds.length > 0) {
      await tx.insert(jobPostLanguages).values(
        data.languageIds.map((languageId) => ({
          jobPostId,
          languageId,
        }))
      );
    }

    if (data.preferenceIds && data.preferenceIds.length > 0) {
      await tx.insert(jobPostPreferences).values(
        data.preferenceIds.map((preferenceId) => ({
          jobPostId,
          preferenceId,
        }))
      );
    }
  }

  // Get a single job post
  static async getJobPost(jobPostId: string) {
    const result = await db.query.jobPosts.findFirst({
      where: and(eq(jobPosts.id, jobPostId), eq(jobPosts.isDeleted, false)),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        careNeedsRelation: {
          with: {
            careNeed: true,
          },
        },
        languagesRelation: {
          with: {
            language: true,
          },
        },
        preferencesRelation: {
          with: {
            preference: true,
          },
        },
      },
    });

    return result;
  }

  // Get all job posts - show all individual jobs (excluding parent templates)
  static async getAllJobPosts(filters: JobPostFilters = {}, userId?: string) {
    const {
      page = 1,
      limit = 10,
      postcode,
      type,
      paymentType,
      caregiverGender,
      minPaymentCost,
      maxPaymentCost,
      startDate,
      shiftLengthRanges,
      careNeedIds,
      languageIds,
      preferenceIds,
    } = filters;
    
    const offset = (page - 1) * limit;
  
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const conditions = [
      eq(jobPosts.isDeleted, false),
      eq(jobPosts.status, "open"),
      gte(jobPosts.jobDate, today),
    ];
  
    // Basic filters - use inArray for array filters
    if (postcode) conditions.push(eq(jobPosts.postcode, postcode));
    if (type && type.length > 0) conditions.push(inArray(jobPosts.type, type));
    if (paymentType && paymentType.length > 0) conditions.push(inArray(jobPosts.paymentType, paymentType));
    if (caregiverGender && caregiverGender.length > 0) conditions.push(inArray(jobPosts.caregiverGender, caregiverGender));
    
    // Payment cost filters
    if (minPaymentCost !== undefined) conditions.push(gte(jobPosts.paymentCost, minPaymentCost));
    if (maxPaymentCost !== undefined) conditions.push(lte(jobPosts.paymentCost, maxPaymentCost));
    
    // Date filter
    if (startDate) {
      const filterDate = new Date(startDate);
      
      // Start of the selected day (00:00:00)
      const dayStart = new Date(filterDate);
      dayStart.setHours(0, 0, 0, 0);
      
      // End of the selected day (23:59:59.999)
      const dayEnd = new Date(filterDate);
      dayEnd.setHours(23, 59, 59, 999);
      
      // Add conditions for jobs within this day only
      conditions.push(gte(jobPosts.jobDate, dayStart));
      conditions.push(lte(jobPosts.jobDate, dayEnd));
    }
  
    // Shift length filters
    if (shiftLengthRanges && shiftLengthRanges.length > 0) {
      const shiftConditions: any[] = [];
      
      for (const range of shiftLengthRanges) {
        if (range.min !== undefined && range.max !== undefined) {
          const condition = and(gte(jobPosts.shiftLength, range.min), lte(jobPosts.shiftLength, range.max));
          if (condition) shiftConditions.push(condition);
        } else if (range.min !== undefined) {
          shiftConditions.push(gte(jobPosts.shiftLength, range.min));
        } else if (range.max !== undefined) {
          shiftConditions.push(lte(jobPosts.shiftLength, range.max));
        }
      }
      
      if (shiftConditions.length > 0) {
        const orCondition = or(...shiftConditions);
        if (orCondition) conditions.push(orCondition);
      }
    }

    // Get total count
    const [totalCount] = await db
      .select({ count: count() })
      .from(jobPosts)
      .where(and(...conditions));
  
    let results = await db.query.jobPosts.findMany({
      where: and(...conditions),
      with: {
        user: {
          columns: { id: true, name: true, role: true },
        },
        careNeedsRelation: { with: { careNeed: true } },
        languagesRelation: { with: { language: true } },
        preferencesRelation: { with: { preference: true } },
      },
      orderBy: [asc(jobPosts.jobDate), asc(jobPosts.startTime)],
    });
  
    // Apply relationship filters after initial query
    if (careNeedIds && careNeedIds.length > 0) {
      results = results.filter(job => 
        job.careNeedsRelation.some(rel => careNeedIds.includes(rel.careNeed.id))
      );
    }
  
    if (languageIds && languageIds.length > 0) {
      results = results.filter(job => 
        job.languagesRelation.some(rel => languageIds.includes(rel.language.id))
      );
    }
  
    if (preferenceIds && preferenceIds.length > 0) {
      results = results.filter(job => 
        job.preferencesRelation.some(rel => preferenceIds.includes(rel.preference.id))
      );
    }
  
    // Update total count after relationship filtering
    const filteredTotal = results.length;
  
    // If userId is provided (healthcare user), check application status and handle distance
    if (userId) {
      // Get user's applications for all these jobs in one query
      const jobIds = results.map((job) => job.id);
      let appliedJobIds = new Set<string>();
  
      if (jobIds.length > 0) {
        const userApplications = await db
          .select({ jobPostId: jobApplications.jobPostId })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.healthcareUserId, userId),
              eq(jobApplications.isDeleted, false),
              inArray(jobApplications.jobPostId, jobIds)
            )
          );
  
        appliedJobIds = new Set(userApplications.map((app) => app.jobPostId));
      }
  
      const userPostcode = await this.getHealthcareProfilePostcode(userId);
  
      if (userPostcode) {
        const resultsWithDistanceAndStatus = [];
  
        for (const job of results) {
          const distance = await this.calculateDistanceWithUnits(
            userPostcode,
            job.postcode
          );
          resultsWithDistanceAndStatus.push({
            ...job,
            distance: distance,
            applied: appliedJobIds.has(job.id), // Add applied status
          });
        }
  
        resultsWithDistanceAndStatus.sort(
          (a, b) => a.distance.km - b.distance.km
        );
        results = resultsWithDistanceAndStatus.slice(offset, offset + limit);
      } else {
        // Add applied status even without postcode
        results = results.slice(offset, offset + limit).map((job) => ({
          ...job,
          applied: appliedJobIds.has(job.id),
        }));
      }
    } else {
      results = results.slice(offset, offset + limit);
    }
  
    return {
      data: results,
      pagination: {
        page,
        limit,
        total: filteredTotal, // Use filtered total instead of original count
        totalPages: Math.ceil(filteredTotal / limit),
        hasNext: page < Math.ceil(filteredTotal / limit),
        hasPrev: page > 1,
      },
    };
  }

  // Get user's job posts
  static async getUserJobPosts(userId: string, filters: JobPostFilters = {}) {
    const { page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const conditions = [
      eq(jobPosts.userId, userId),
      eq(jobPosts.isDeleted, false),
      or(eq(jobPosts.status, "open"), eq(jobPosts.status, "approved")),
      gte(jobPosts.jobDate, today),
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
        preferencesRelation: { with: { preference: true } },
      },
      orderBy: [asc(jobPosts.jobDate), asc(jobPosts.startTime)],
      limit,
      offset,
    });

    // Get job applications for all jobs with healthcare user details
    const jobIds = results.map((job) => job.id);

    if (jobIds.length > 0) {
      const applications = await db
        .select({
          jobPostId: jobApplications.jobPostId,
          healthcareUserId: jobApplications.healthcareUserId,
          healthcareUserName: users.name,
          healthcareUserImage: healthcareProfiles.image,
          status: jobApplications.status,
        })
        .from(jobApplications)
        .innerJoin(users, eq(jobApplications.healthcareUserId, users.id))
        .innerJoin(healthcareProfiles, eq(users.id, healthcareProfiles.userId))
        .where(
          and(
            eq(jobApplications.isDeleted, false)
            // Use 'in' operator with jobIds array
            // Note: You'll need to import 'inArray' from drizzle-orm
            // import { eq, and, desc, count, asc, gte, ne, lt, inArray } from 'drizzle-orm';
            // inArray(jobApplications.jobPostId, jobIds)
          )
        );

      // Group applications by job
      const applicationsByJob = applications.reduce((acc, app) => {
        if (!acc[app.jobPostId]) {
          acc[app.jobPostId] = [];
        }
        acc[app.jobPostId].push({
          id: app.healthcareUserId,
          name: app.healthcareUserName,
          image:
            app.healthcareUserImage ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              app.healthcareUserName
            )}&background=random`,
          status: app.status,
        });
        return acc;
      }, {} as Record<string, any[]>);

      // Add applicants and totalApplications to each job
      const resultsWithApplications = results.map((job) => ({
        ...job,
        applicants: applicationsByJob[job.id] || [],
        totalApplications: applicationsByJob[job.id]?.length || 0,
      }));

      return {
        data: resultsWithApplications,
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

    // If no jobs, return original results with empty applicants
    const resultsWithApplications = results.map((job) => ({
      ...job,
      applicants: [],
      totalApplications: 0,
    }));

    return {
      data: resultsWithApplications,
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

  static async getUserPastJobPosts(
    userId: string,
    filters: JobPostFilters = {}
  ) {
    const { page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today

    const conditions = [
      eq(jobPosts.userId, userId),
      eq(jobPosts.isDeleted, false),
      notInArray(jobPosts.status, ["open", "approved"]), // Status not in ['open', 'approved']
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
        preferencesRelation: { with: { preference: true } },
      },
      orderBy: [desc(jobPosts.jobDate), desc(jobPosts.startTime)], // Most recent first
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

  static async getUserExpiredJobPosts(
    userId: string,
    filters: JobPostFilters = {}
  ) {
    const { page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today

    const conditions = [
      eq(jobPosts.userId, userId),
      eq(jobPosts.isDeleted, false),
      eq(jobPosts.status, "open"), // Status not equal to open
      lt(jobPosts.jobDate, today), // Job date is before today
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
        preferencesRelation: { with: { preference: true } },
      },
      orderBy: [desc(jobPosts.jobDate), desc(jobPosts.startTime)], // Most recent first
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

  // Update any job post (single, parent template, or child job) - same logic for all
  static async updateJobPost(
    jobPostId: string,
    userId: string,
    data: UpdateJobPostData
  ) {
    return await db.transaction(async (tx) => {
      // Verify ownership
      const existingJobPost = await tx.query.jobPosts.findFirst({
        where: and(
          eq(jobPosts.id, jobPostId),
          eq(jobPosts.userId, userId),
          eq(jobPosts.isDeleted, false)
        ),
      });

      if (!existingJobPost) {
        throw new Error("Job post not found or access denied");
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
        await tx
          .delete(jobPostCareNeeds)
          .where(eq(jobPostCareNeeds.jobPostId, jobPostId));
        if (data.careNeedIds.length > 0) {
          await tx.insert(jobPostCareNeeds).values(
            data.careNeedIds.map((careNeedId) => ({
              jobPostId,
              careNeedId,
            }))
          );
        }
      }

      if (data.languageIds !== undefined) {
        await tx
          .delete(jobPostLanguages)
          .where(eq(jobPostLanguages.jobPostId, jobPostId));
        if (data.languageIds.length > 0) {
          await tx.insert(jobPostLanguages).values(
            data.languageIds.map((languageId) => ({
              jobPostId,
              languageId,
            }))
          );
        }
      }

      if (data.preferenceIds !== undefined) {
        await tx
          .delete(jobPostPreferences)
          .where(eq(jobPostPreferences.jobPostId, jobPostId));
        if (data.preferenceIds.length > 0) {
          await tx.insert(jobPostPreferences).values(
            data.preferenceIds.map((preferenceId) => ({
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
        status: "closed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobPosts.id, jobPostId),
          eq(jobPosts.userId, userId),
          eq(jobPosts.isDeleted, false)
        )
      )
      .returning();

    if (!updatedJobPost) {
      throw new Error("Job post not found or access denied");
    }

    return updatedJobPost;
  }

  // Repost expired job
  static async repostExpiredJob(
    jobPostId: string,
    userId: string,
    repostData: RepostJobData
  ) {
    return await db.transaction(async (tx) => {
      // Get the original job post
      const originalJob = await tx.query.jobPosts.findFirst({
        where: and(
          eq(jobPosts.id, jobPostId),
          eq(jobPosts.userId, userId),
          eq(jobPosts.isDeleted, false)
        ),
        with: {
          careNeedsRelation: { with: { careNeed: true } },
          languagesRelation: { with: { language: true } },
          preferencesRelation: { with: { preference: true } },
        },
      });
  
      if (!originalJob) {
        throw new Error("Job post not found or access denied");
      }
  
      // Verify job is expired (job date is in the past and status is open)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const jobDate = new Date(originalJob.jobDate);
      
      if (jobDate >= today || originalJob.status !== "open") {
        throw new Error("Job is not expired");
      }
  
      // Check if job with new date and time already exists
      const existingJob = await tx
        .select({ id: jobPosts.id })
        .from(jobPosts)
        .where(
          and(
            eq(jobPosts.userId, userId),
            eq(jobPosts.jobDate, new Date(repostData.jobDate)),
            eq(jobPosts.startTime, repostData.startTime),
            eq(jobPosts.isDeleted, false)
          )
        )
        .limit(1);
  
      if (existingJob.length > 0) {
        throw new Error("A job already exists for this date and time");
      }
  
      // Create new job post with updated date/time
      const [newJobPost] = await tx
        .insert(jobPosts)
        .values({
          userId,
          age: originalJob.age,
          relationship: originalJob.relationship,
          gender: originalJob.gender,
          title: originalJob.title,
          postcode: originalJob.postcode,
          address: originalJob.address,
          jobDate: new Date(repostData.jobDate),
          startTime: repostData.startTime,
          endTime: repostData.endTime,
          shiftLength: repostData.shiftLength,
          overview: originalJob.overview,
          caregiverGender: originalJob.caregiverGender,
          type: originalJob.type,
          paymentType: originalJob.paymentType,
          paymentCost: originalJob.paymentCost,
          isRecurring: false, // Reposted jobs are always single jobs
        })
        .returning();
  
      // Copy care needs, languages, and preferences
      if (originalJob.careNeedsRelation.length > 0) {
        await tx.insert(jobPostCareNeeds).values(
          originalJob.careNeedsRelation.map((rel) => ({
            jobPostId: newJobPost.id,
            careNeedId: rel.careNeedId,
          }))
        );
      }
  
      if (originalJob.languagesRelation.length > 0) {
        await tx.insert(jobPostLanguages).values(
          originalJob.languagesRelation.map((rel) => ({
            jobPostId: newJobPost.id,
            languageId: rel.languageId,
          }))
        );
      }
  
      if (originalJob.preferencesRelation.length > 0) {
        await tx.insert(jobPostPreferences).values(
          originalJob.preferencesRelation.map((rel) => ({
            jobPostId: newJobPost.id,
            preferenceId: rel.preferenceId,
          }))
        );
      }
  
      // Update original job status to closed
      await tx
        .update(jobPosts)
        .set({
          status: "closed",
          updatedAt: new Date(),
        })
        .where(eq(jobPosts.id, jobPostId));
  
      // Update all job applications for the original job to closed status
      await tx
        .update(jobApplications)
        .set({
          status: "closed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobApplications.jobPostId, jobPostId),
            eq(jobApplications.isDeleted, false)
          )
        );
  
      return {
        originalJobId: jobPostId,
        newJob: newJobPost,
        message: "Expired job reposted successfully"
      };
    });
  }
  
  // Repost past job
  static async repostPastJob(
    jobPostId: string,
    userId: string,
    repostData: RepostJobData
  ) {
    return await db.transaction(async (tx) => {
      // Get the original job post
      const originalJob = await tx.query.jobPosts.findFirst({
        where: and(
          eq(jobPosts.id, jobPostId),
          eq(jobPosts.userId, userId),
          eq(jobPosts.isDeleted, false)
        ),
        with: {
          careNeedsRelation: { with: { careNeed: true } },
          languagesRelation: { with: { language: true } },
          preferencesRelation: { with: { preference: true } },
        },
      });
  
      if (!originalJob) {
        throw new Error("Job post not found or access denied");
      }
  
      // Verify job is a past job (status not in ['open', 'approved'])
      if (originalJob.status === "open" || originalJob.status === "approved") {
        throw new Error("Job is not a past job");
      }
  
      // Check if job with new date and time already exists
      const existingJob = await tx
        .select({ id: jobPosts.id })
        .from(jobPosts)
        .where(
          and(
            eq(jobPosts.userId, userId),
            eq(jobPosts.jobDate, new Date(repostData.jobDate)),
            eq(jobPosts.startTime, repostData.startTime),
            eq(jobPosts.isDeleted, false)
          )
        )
        .limit(1);
  
      if (existingJob.length > 0) {
        throw new Error("A job already exists for this date and time");
      }
  
      // Create new job post with updated date/time
      const [newJobPost] = await tx
        .insert(jobPosts)
        .values({
          userId,
          age: originalJob.age,
          relationship: originalJob.relationship,
          gender: originalJob.gender,
          title: originalJob.title,
          postcode: originalJob.postcode,
          address: originalJob.address,
          jobDate: new Date(repostData.jobDate),
          startTime: repostData.startTime,
          endTime: repostData.endTime,
          shiftLength: repostData.shiftLength,
          overview: originalJob.overview,
          caregiverGender: originalJob.caregiverGender,
          type: originalJob.type,
          paymentType: originalJob.paymentType,
          paymentCost: originalJob.paymentCost,
          isRecurring: false, // Reposted jobs are always single jobs
        })
        .returning();
  
      // Copy care needs, languages, and preferences
      if (originalJob.careNeedsRelation.length > 0) {
        await tx.insert(jobPostCareNeeds).values(
          originalJob.careNeedsRelation.map((rel) => ({
            jobPostId: newJobPost.id,
            careNeedId: rel.careNeedId,
          }))
        );
      }
  
      if (originalJob.languagesRelation.length > 0) {
        await tx.insert(jobPostLanguages).values(
          originalJob.languagesRelation.map((rel) => ({
            jobPostId: newJobPost.id,
            languageId: rel.languageId,
          }))
        );
      }
  
      if (originalJob.preferencesRelation.length > 0) {
        await tx.insert(jobPostPreferences).values(
          originalJob.preferencesRelation.map((rel) => ({
            jobPostId: newJobPost.id,
            preferenceId: rel.preferenceId,
          }))
        );
      }
  
      // Update all job applications for the original job to closed status
      await tx
        .update(jobApplications)
        .set({
          status: "closed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobApplications.jobPostId, jobPostId),
            eq(jobApplications.isDeleted, false)
          )
        );
  
      return {
        originalJobId: jobPostId,
        newJob: newJobPost,
        message: "Past job reposted successfully"
      };
    });
  }

  // Validation and helper methods (keep existing ones)
  static validateJobPostData(data: Partial<CreateJobPostData>): string[] {
    const errors: string[] = [];

    if (data.age && (data.age < 0 || data.age > 120)) {
      errors.push("Age must be between 0 and 120");
    }

    if (data.title && data.title.trim().length < 5) {
      errors.push("Title must be at least 5 characters long");
    }

    if (data.postcode && !/^[A-Z0-9\s-]{3,10}$/i.test(data.postcode)) {
      errors.push("Invalid postcode format");
    }

    if (data.address && data.address.trim().length < 10) {
      errors.push("Address must be at least 10 characters long");
    }

    if (data.overview && data.overview.trim().length < 20) {
      errors.push("Overview must be at least 20 characters long");
    }

    if (data.shiftLength && (data.shiftLength < 1 || data.shiftLength > 24)) {
      errors.push("Shift length must be between 1 and 24 hours");
    }

    if (data.paymentCost && data.paymentCost < 0) {
      errors.push("Payment cost must be positive");
    }

    if (data.startTime && data.endTime && data.startTime >= data.endTime) {
      errors.push("End time must be after start time");
    }

    return errors;
  }

  // Keep existing validation methods
  static async validateCareNeedIds(careNeedIds: string[]): Promise<boolean> {
    const validCareNeeds = await db
      .select({ id: careNeeds.id })
      .from(careNeeds)
      .where(eq(careNeeds.isDeleted, false));

    const validIds = validCareNeeds.map((cn) => cn.id);
    return careNeedIds.every((id) => validIds.includes(id));
  }

  static async validateLanguageIds(languageIds: string[]): Promise<boolean> {
    const validLanguages = await db
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.isDeleted, false));

    const validIds = validLanguages.map((l) => l.id);
    return languageIds.every((id) => validIds.includes(id));
  }

  static async validatePreferenceIds(
    preferenceIds: string[]
  ): Promise<boolean> {
    const validPreferences = await db
      .select({ id: preferences.id })
      .from(preferences)
      .where(eq(preferences.isDeleted, false));

    const validIds = validPreferences.map((p) => p.id);
    return preferenceIds.every((id) => validIds.includes(id));
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

  static async validateUserAccess(
    currentUserId: string,
    jobPostId: string
  ): Promise<boolean> {
    const jobPost = await db.query.jobPosts.findFirst({
      where: and(eq(jobPosts.id, jobPostId), eq(jobPosts.isDeleted, false)),
      columns: {
        userId: true,
      },
    });

    return jobPost?.userId === currentUserId;
  }

  static sanitizeJobPostData(jobPost: any) {
    const { isDeleted, ...sanitized } = jobPost;

    if (jobPost.careNeedsRelation) {
      sanitized.careNeeds = jobPost.careNeedsRelation.map(
        (rel: any) => rel.careNeed
      );
      delete sanitized.careNeedsRelation;
    }

    if (jobPost.languagesRelation) {
      sanitized.languages = jobPost.languagesRelation.map(
        (rel: any) => rel.language
      );
      delete sanitized.languagesRelation;
    }

    if (jobPost.preferencesRelation) {
      sanitized.preferences = jobPost.preferencesRelation.map(
        (rel: any) => rel.preference
      );
      delete sanitized.preferencesRelation;
    }

    return sanitized;
  }

  // Improved validation with better error messages
  static async parseBulkJobData(
    fileData: any[],
    userId: string
  ): Promise<BulkJobValidationResult> {
    const valid: BulkJobData[] = [];
    const invalid: Array<{
      row: number;
      data: Partial<BulkJobData>;
      errors: string[];
    }> = [];

    // Get all available options for validation
    const [
      availableCareNeeds,
      availableLanguages,
      availablePreferences,
      existingJobs,
    ] = await Promise.all([
      this.getAvailableCareNeeds(),
      this.getAvailableLanguages(),
      this.getAvailablePreferences(),

      db
        .select({
          jobDate: jobPosts.jobDate,
          startTime: jobPosts.startTime,
        })
        .from(jobPosts)
        .where(and(eq(jobPosts.userId, userId), eq(jobPosts.isDeleted, false))),
    ]);

    const existingJobTimes = new Set(
      existingJobs.map(
        (job) => `${job.jobDate.toISOString().split("T")[0]}-${job.startTime}`
      )
    );

    // Track datetime combinations within the current bulk upload
    const currentBulkJobTimes = new Set<string>();

    const careNeedMap = new Map(
      availableCareNeeds.map((cn) => [cn.name.toLowerCase(), cn.id])
    );
    const languageMap = new Map(
      availableLanguages.map((l) => [l.name.toLowerCase(), l.id])
    );
    const preferenceMap = new Map(
      availablePreferences.map((p) => [p.name.toLowerCase(), p.id])
    );

    // Create arrays of available names for better error messages
    const availableCareNeedNames = availableCareNeeds.map((cn) => cn.name);
    const availableLanguageNames = availableLanguages.map((l) => l.name);
    const availablePreferenceNames = availablePreferences.map((p) => p.name);

    for (let i = 0; i < fileData.length; i++) {
      const row = fileData[i];
      const rowNumber = i + 2; // +2 because arrays are 0-indexed and we skip header
      const errors: string[] = [];

      // Parse the row data
      const jobData: Partial<BulkJobData> = {
        age: this.parseNumber(row.age),
        gender: this.parseGender(row.gender),
        title: this.parseString(row.title),
        postcode: this.parseString(row.postcode),
        address: this.parseString(row.address),
        jobDate: this.parseDate(row.jobDate || row.job_date),
        startTime: this.parseTime(row.startTime || row.start_time),
        endTime: this.parseTime(row.endTime || row.end_time),
        shiftLength: this.parseNumber(row.shiftLength || row.shift_length),
        overview: this.parseString(row.overview),
        caregiverGender: this.parseGender(
          row.caregiverGender || row.caregiver_gender
        ),
        paymentType: this.parsePaymentType(row.paymentType || row.payment_type),
        paymentCost: this.parseNumber(row.paymentCost || row.payment_cost),
        careNeeds: this.parseString(row.careNeeds || row.care_needs),
        languages: this.parseString(row.languages),
        preferences: this.parseString(row.preferences),
        rowNumber,
      };

      // Validate required fields
      if (!jobData.age) errors.push("Age is required");
      if (!jobData.gender) errors.push("Gender is required");
      if (!jobData.title) errors.push("Title is required");
      if (!jobData.postcode) errors.push("Postcode is required");
      if (!jobData.address) errors.push("Address is required");
      if (!jobData.jobDate) errors.push("Job date is required");
      if (!jobData.startTime) errors.push("Start time is required");
      if (!jobData.endTime) errors.push("End time is required");
      if (!jobData.shiftLength) errors.push("Shift length is required");
      if (!jobData.overview) errors.push("Overview is required");
      if (!jobData.caregiverGender) errors.push("Caregiver gender is required");
      if (!jobData.paymentType) errors.push("Payment type is required");
      if (!jobData.paymentCost) errors.push("Payment cost is required");

      // Validate data quality
      // Add validation for duplicate job datetime after parsing jobDate and startTime
      if (jobData.jobDate && jobData.startTime) {
        const jobDateTime = `${jobData.jobDate}-${jobData.startTime}`;

        // Check against existing jobs in database
        if (existingJobTimes.has(jobDateTime)) {
          errors.push("A job already exists for this date and time");
        }

        // Check against other jobs in current bulk upload
        if (currentBulkJobTimes.has(jobDateTime)) {
          errors.push("Duplicate job date and time found within this upload");
        } else {
          currentBulkJobTimes.add(jobDateTime);
        }
      }

      if (jobData.age && (jobData.age < 0 || jobData.age > 120)) {
        errors.push("Age must be between 0 and 120");
      }

      if (jobData.title && jobData.title.trim().length < 5) {
        errors.push("Title must be at least 5 characters long");
      }

      if (jobData.overview && jobData.overview.trim().length < 20) {
        errors.push("Overview must be at least 20 characters long");
      }

      if (
        jobData.shiftLength &&
        (jobData.shiftLength < 1 || jobData.shiftLength > 24)
      ) {
        errors.push("Shift length must be between 1 and 24 hours");
      }

      if (jobData.paymentCost && jobData.paymentCost < 0) {
        errors.push("Payment cost must be positive");
      }

      // Validate postcode format and existence
      if (jobData.postcode) {
        const postcodeValidation = await this.validatePostcode(
          jobData.postcode
        );
        if (!postcodeValidation.isValid) {
          errors.push(postcodeValidation.error as string);
        } else {
          // Update the postcode with the correctly formatted version
          jobData.postcode = postcodeValidation.formattedPostcode;
        }
      }

      // Validate job date is in future
      if (jobData.jobDate) {
        const jobDate = new Date(jobData.jobDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (jobDate < today) {
          errors.push("Job date must be in the future");
        }
      }

      // Validate recurring job data
      if (
        jobData.startTime &&
        jobData.endTime &&
        jobData.startTime >= jobData.endTime
      ) {
        errors.push("End time must be after start time");
      }

      // Validate and convert care needs, languages, preferences with better error messages
      // if (jobData.relationship === undefined && row.relationship) {
      //   const availableRelationships = ['Mother', 'Father', 'Myself', 'Grandmother', 'Grandfather', 'Spouse', 'Friend', 'Other'];
      //   errors.push(`Invalid relationship: [${row.relationship}]. Available options: [${availableRelationships.join(', ')}]`);
      // }

      if (jobData.gender === undefined && row.gender) {
        const availableGenders = ["male", "female"];
        errors.push(
          `Invalid gender: [${
            row.gender
          }]. Available options: [${availableGenders.join(", ")}]`
        );
      }

      // Add validation for caregiver gender
      if (
        jobData.caregiverGender === undefined &&
        (row.caregiverGender || row.caregiver_gender)
      ) {
        const availableGenders = ["male", "female"];
        const inputValue = row.caregiverGender || row.caregiver_gender;
        errors.push(
          `Invalid caregiver gender: [${inputValue}]. Available options: [${availableGenders.join(
            ", "
          )}]`
        );
      }

      // Add validation for payment type
      if (
        jobData.paymentType === undefined &&
        (row.paymentType || row.payment_type)
      ) {
        const availablePaymentTypes = ["hourly", "fixed"];
        const inputValue = row.paymentType || row.payment_type;
        errors.push(
          `Invalid payment type: [${inputValue}]. Available options: [${availablePaymentTypes.join(
            ", "
          )}]`
        );
      }

      if (jobData.careNeeds) {
        const careNeedNames = jobData.careNeeds
          .split(",")
          .map((name) => name.trim());
        const invalidCareNeeds = careNeedNames.filter(
          (name) => !careNeedMap.has(name.toLowerCase())
        );
        if (invalidCareNeeds.length > 0) {
          errors.push(
            `Invalid care needs: [${invalidCareNeeds.join(
              ", "
            )}]. Available options: [${availableCareNeedNames.join(", ")}]`
          );
        }
      }

      if (jobData.languages) {
        const languageNames = jobData.languages
          .split(",")
          .map((name) => name.trim());
        const invalidLanguages = languageNames.filter(
          (name) => !languageMap.has(name.toLowerCase())
        );
        if (invalidLanguages.length > 0) {
          errors.push(
            `Invalid languages: [${invalidLanguages.join(
              ", "
            )}]. Available options: [${availableLanguageNames.join(", ")}]`
          );
        }
      }

      if (jobData.preferences) {
        const preferenceNames = jobData.preferences
          .split(",")
          .map((name) => name.trim());
        const invalidPreferences = preferenceNames.filter(
          (name) => !preferenceMap.has(name.toLowerCase())
        );
        if (invalidPreferences.length > 0) {
          errors.push(
            `Invalid preferences: [${invalidPreferences.join(
              ", "
            )}]. Available options: [${availablePreferenceNames.join(", ")}]`
          );
        }
      }

      if (errors.length === 0) {
        valid.push(jobData as BulkJobData);
      } else {
        invalid.push({ row: rowNumber, data: jobData, errors });
      }
    }

    return {
      valid,
      invalid,
      summary: {
        totalRows: fileData.length,
        validRows: valid.length,
        invalidRows: invalid.length,
      },
    };
  }

  // Create bulk jobs using existing createJobPost method
  static async createBulkJobs(
    userId: string,
    validJobData: BulkJobData[]
  ): Promise<BulkJobCreateResult> {
    const successful: Array<{ row: number; jobId: string; title: string }> = [];
    const failed: Array<{ row: number; data: BulkJobData; error: string }> = [];

    // Get mapping data once
    const [availableCareNeeds, availableLanguages, availablePreferences] =
      await Promise.all([
        this.getAvailableCareNeeds(),
        this.getAvailableLanguages(),
        this.getAvailablePreferences(),
      ]);

    const careNeedMap = new Map(
      availableCareNeeds.map((cn) => [cn.name.toLowerCase(), cn.id])
    );
    const languageMap = new Map(
      availableLanguages.map((l) => [l.name.toLowerCase(), l.id])
    );
    const preferenceMap = new Map(
      availablePreferences.map((p) => [p.name.toLowerCase(), p.id])
    );

    for (const jobData of validJobData) {
      try {
        // Convert bulk job data to create job data format
        const createJobData: CreateJobPostData = {
          age: jobData.age,
          relationship: "Organization",
          gender: jobData.gender,
          title: jobData.title,
          postcode: jobData.postcode,
          address: jobData.address,
          jobDate: jobData.jobDate,
          startTime: jobData.startTime,
          endTime: jobData.endTime,
          shiftLength: jobData.shiftLength,
          overview: jobData.overview,
          caregiverGender: jobData.caregiverGender,
          type: "oneDay",
          paymentType: jobData.paymentType,
          paymentCost: jobData.paymentCost,
          isRecurring: false, // Bulk jobs are always single jobs
        };

        // Convert care needs, languages, preferences to IDs
        if (jobData.careNeeds) {
          const careNeedNames = jobData.careNeeds
            .split(",")
            .map((name) => name.trim().toLowerCase());
          createJobData.careNeedIds = careNeedNames
            .map((name) => careNeedMap.get(name))
            .filter((id) => id) as string[];
        }

        if (jobData.languages) {
          const languageNames = jobData.languages
            .split(",")
            .map((name) => name.trim().toLowerCase());
          createJobData.languageIds = languageNames
            .map((name) => languageMap.get(name))
            .filter((id) => id) as string[];
        }

        if (jobData.preferences) {
          const preferenceNames = jobData.preferences
            .split(",")
            .map((name) => name.trim().toLowerCase());
          createJobData.preferenceIds = preferenceNames
            .map((name) => preferenceMap.get(name))
            .filter((id) => id) as string[];
        }

        // Use existing createJobPost method for single job creation
        const result = await this.createJobPost(userId, createJobData);
        // Handle different return structures from createJobPost
        let jobId = "";
        if ("job" in result && result.job) {
          jobId = result.job.id;
        } else if ("parentJob" in result && result.parentJob) {
          jobId = result.parentJob.id;
        }

        successful.push({
          row: jobData.rowNumber || 0,
          jobId: jobId,
          title: jobData.title,
        });
      } catch (error) {
        failed.push({
          row: jobData.rowNumber || 0,
          data: jobData,
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }

    return {
      successful,
      failed,
      summary: {
        totalJobs: validJobData.length,
        successfulJobs: successful.length,
        failedJobs: failed.length,
      },
    };
  }

  // Helper parsing methods
  private static parseString(value: any): string | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    return String(value).trim();
  }

  private static parseNumber(value: any): number | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }

  private static parseBoolean(value: any): boolean {
    if (value === null || value === undefined || value === "") return false;
    if (typeof value === "boolean") return value;
    const str = String(value).toLowerCase();
    return str === "true" || str === "yes" || str === "1";
  }

  private static parseRelationship(value: any): string | undefined {
    if (!value) return undefined;
    const relationship = String(value).trim();
    const validRelationships = [
      "Mother",
      "Father",
      "Myself",
      "Grandmother",
      "Grandfather",
      "Spouse",
      "Friend",
      "Other",
    ];

    // Case insensitive match
    const match = validRelationships.find(
      (valid) => valid.toLowerCase() === relationship.toLowerCase()
    );

    return match; // Returns the properly cased version or undefined
  }

  private static parseGender(value: any): "male" | "female" | undefined {
    if (!value) return undefined;
    const gender = String(value).toLowerCase().trim();
    if (gender === "male" || gender === "m") return "male";
    if (gender === "female" || gender === "f") return "female";
    return undefined;
  }

  private static parsePaymentType(value: any): "hourly" | "fixed" | undefined {
    if (!value) return undefined;
    const type = String(value).toLowerCase().trim();
    if (type === "hourly") return "hourly";
    if (type === "fixed") return "fixed";
    return undefined;
  }

  private static parseDate(value: any): string | undefined {
    if (!value) return undefined;
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return undefined;
      return date.toISOString().split("T")[0]; // Return YYYY-MM-DD format
    } catch {
      return undefined;
    }
  }

  private static parseTime(value: any): string | undefined {
    if (!value) return undefined;
    const timeStr = String(value).trim();

    // Handle different time formats
    const timeRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i;
    const match = timeStr.match(timeRegex);

    if (!match) return undefined;

    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const ampm = match[4];

    if (minutes >= 60) return undefined;

    if (ampm) {
      if (ampm.toUpperCase() === "PM" && hours !== 12) hours += 12;
      if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;
    }

    if (hours >= 24) return undefined;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  private static async getHealthcareProfilePostcode(
    userId: string
  ): Promise<string | null> {
    try {
      const healthcareProfile = await db.query.healthcareProfiles.findFirst({
        where: eq(healthcareProfiles.userId, userId),
        columns: { postcode: true },
      });

      return healthcareProfile?.postcode || null;
    } catch (error) {
      console.error("Error fetching healthcare profile postcode:", error);
      return null;
    }
  }

  // Distance calculation using postcodes.io (Free UK postcode API)
  private static async calculateDistance(
    postcode1: string,
    postcode2: string
  ): Promise<number> {
    try {
      // Get coordinates for both postcodes
      const [coord1, coord2] = await Promise.all([
        this.getPostcodeCoordinates(postcode1),
        this.getPostcodeCoordinates(postcode2),
      ]);

      if (!coord1 || !coord2) {
        return 999; // Return high distance for invalid postcodes
      }

      // Calculate distance using Haversine formula
      const distance = this.calculateHaversineDistance(
        coord1.latitude,
        coord1.longitude,
        coord2.latitude,
        coord2.longitude
      );

      return Math.round(distance * 10) / 10; // Round to 1 decimal place
    } catch (error) {
      console.error("Error calculating distance:", error);
      return 999;
    }
  }

  // Alternative: Return both km and miles
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

  private static async validatePostcode(postcode: string): Promise<{
    isValid: boolean;
    formattedPostcode?: string;
    error?: string;
  }> {
    try {
      // Remove spaces and convert to uppercase for initial formatting
      const cleanPostcode = postcode.replace(/\s+/g, "").toUpperCase();

      // Basic UK postcode format validation (regex)
      const postcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

      if (!postcodeRegex.test(cleanPostcode)) {
        return {
          isValid: false,
          error: `Invalid postcode format: [${postcode}]. Please use valid UK postcode format (e.g., SW1A 1AA, M1 1AA)`,
        };
      }

      // Format postcode properly (add space in the right place)
      const formattedPostcode =
        cleanPostcode.slice(0, -3) + " " + cleanPostcode.slice(-3);

      // Validate with postcodes.io API
      const response = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(
          formattedPostcode
        )}`
      );

      if (response.status === 404) {
        return {
          isValid: false,
          error: `Postcode not found: [${postcode}]. Please check if the postcode exists and is spelled correctly`,
        };
      }

      if (!response.ok) {
        // If API is down, fall back to format validation only
        console.warn(
          `Postcodes.io API error (${response.status}), falling back to format validation`
        );
        return {
          isValid: true,
          formattedPostcode: formattedPostcode,
        };
      }

      const data = await response.json();

      if (data.status === 200 && data.result) {
        return {
          isValid: true,
          formattedPostcode: data.result.postcode, // Use the API's formatted version
        };
      } else {
        return {
          isValid: false,
          error: `Invalid postcode: [${postcode}]. Postcode validation failed`,
        };
      }
    } catch (error) {
      console.error("Postcode validation error:", error);

      // If API call fails, fall back to basic format validation
      const cleanPostcode = postcode.replace(/\s+/g, "").toUpperCase();
      const postcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

      if (postcodeRegex.test(cleanPostcode)) {
        const formattedPostcode =
          cleanPostcode.slice(0, -3) + " " + cleanPostcode.slice(-3);
        return {
          isValid: true,
          formattedPostcode: formattedPostcode,
        };
      } else {
        return {
          isValid: false,
          error: `Invalid postcode format: [${postcode}]. Please use valid UK postcode format (e.g., SW1A 1AA, M1 1AA)`,
        };
      }
    }
  }
}
