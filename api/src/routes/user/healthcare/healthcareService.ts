// routes/user/healthcare/healthcareService.ts
import { db } from "../../../db/index.js";
import { users, healthcareProfiles, healthcareProfileLanguages, healthcareProfileSpecialities, healthcareBankDetails } from "../../../db/schemas/usersSchema.js";
import {
  specialities,
  languages,
} from "../../../db/schemas/utilsSchema.js";
import { eq, and, inArray, count } from "drizzle-orm";
import { S3Service } from "../../../utils/s3UploadService.js";
import { ReviewService } from "../../review/reviewService.js";

export interface User {
  id: string;
  cognitoId: string;
  email: string;
  role: string;
  name?: string;
  profileCompleted: boolean;
  profileVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HealthcareProfile {
  id: string;
  userId: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  professionalTitle: string;
  image?: string;
  postcode: string;
  phoneNumber: string;
  nationality?: string;
  address: string;
  professionalSummary: string;
  preferredTime?: string[];
  experience?: number;
  createdAt: Date;
  updatedAt: Date;
  // Include related data
  specialities?: Array<{ id: string; name: string }>;
  languages?: Array<{ id: string; name: string; code?: string }>;
  bankDetails?: BankDetails | null;
  // ADD THESE LINES - Review statistics
  reviewStats?: {
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
    recommendationRate: number;
  };
}

export interface UserWithProfile extends User {
  healthcareProfile?: HealthcareProfile | null;
}

export interface CreateHealthcareProfileData {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  professionalTitle: string;
  imageKey?: string;
  imageUrl?: string;  
  postcode: string;
  phoneNumber: string;
  nationality: string;
  address: string;
  professionalSummary: string;
  preferredTime?: string[];
  experience?: number;
  specialityIds?: string[]; // Speciality IDs for many-to-many relation
  languageIds?: string[]; // Language IDs for many-to-many relation
}
export interface BankDetails {
  id: string;
  healthcareProfileId: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  bankName?: string | null;
  isVerified: boolean;
  encryptionKeyId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

export interface CreateBankDetailsData {
  accountName: string;
  sortCode: string;
  accountNumber: string;
  bankName?: string;
}
export interface PublicHealthcareProfile extends Omit<HealthcareProfile, 'phoneNumber' | 'address' | 'bankDetails'> {
  // Optional: Add any public-specific fields
}

export class HealthcareService {
  // Get healthcare user's basic info only
  static async getBasicProfile(userId: string): Promise<User | null> {
    try {
      const result = await db
        .select({
          id: users.id,
          cognitoId: users.cognitoId,
          email: users.email,
          role: users.role,
          name: users.name,
          profileCompleted: users.profileCompleted,
          profileVerified: users.profileVerified,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.role, "healthcare")))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error("Error fetching healthcare basic profile:", error);
      throw new Error("Failed to fetch basic profile");
    }
  }

  // Get healthcare user with complete profile using relations
  static async getCompleteProfile(
    userId: string,
    includeReviews: boolean = false
  ): Promise<UserWithProfile | null> {
    try {
      const result = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.role, "healthcare")),
        with: {
          healthcareProfile: {
            with: {
              specialitiesRelation: {
                with: { speciality: true },
              },
              languagesRelation: {
                with: { language: true },
              },
            },
          },
        },
      });

      if (!result) return null;

      // Transform the data to match our interface
      if (result.healthcareProfile) {
        const {
          specialitiesRelation,
          languagesRelation,
          image: imageRaw,
          preferredTime: preferredTimeRaw,
          experience: experienceRaw,
          ...restProfile
        } = result.healthcareProfile;

        const transformedProfile: HealthcareProfile = {
          ...restProfile,
          image: imageRaw ?? undefined,
          preferredTime: preferredTimeRaw ?? undefined,
          experience: experienceRaw ?? undefined,
          specialities: (specialitiesRelation ?? []).map((sp) => ({
            id: sp.speciality.id,
            name: sp.speciality.name,
          })),
          languages: (languagesRelation ?? []).map((lang) => ({
            id: lang.language.id,
            name: lang.language.name,
          })),
        };

        // Include review statistics if requested
        if (includeReviews) {
          try {
            const reviewStats = await ReviewService.getReviewStats(userId);
            transformedProfile.reviewStats = reviewStats;
          } catch (error) {
            console.warn("Failed to fetch review stats:", error);
            // Continue without review stats rather than failing
          }
        }

        return {
          ...result,
          healthcareProfile: transformedProfile,
        };
      }

      return result as UserWithProfile;
    } catch (error) {
      console.error("Error fetching healthcare complete profile:", error);
      throw new Error("Failed to fetch complete profile");
    }
  }

  static async getCompleteProfileWithReviews(
    userId: string
  ): Promise<UserWithProfile | null> {
    try {
      const userWithProfile = await this.getCompleteProfile(userId);
      if (!userWithProfile?.healthcareProfile) {
        return userWithProfile;
      }

      // Get review statistics
      const reviewStats = await ReviewService.getReviewStats(userId);
      
      return {
        ...userWithProfile,
        healthcareProfile: {
          ...userWithProfile.healthcareProfile,
          reviewStats,
        },
      };
    } catch (error) {
      console.error("Error fetching complete profile with reviews:", error);
      throw new Error("Failed to fetch complete profile with reviews");
    }
  }

  // Helper method to validate speciality IDs
  static async validateSpecialityIds(
    specialityIds: string[]
  ): Promise<boolean> {
    if (!specialityIds || specialityIds.length === 0) return true;

    try {
      const existingSpecialities = await db
        .select({ id: specialities.id })
        .from(specialities)
        .where(
          and(
            inArray(specialities.id, specialityIds),
            eq(specialities.isDeleted, false)
          )
        );

      return existingSpecialities.length === specialityIds.length;
    } catch (error) {
      console.error("Error validating speciality IDs:", error);
      return false;
    }
  }

  // Helper method to validate language IDs
  static async validateLanguageIds(languageIds: string[]): Promise<boolean> {
    if (!languageIds || languageIds.length === 0) return true;

    try {
      const existingLanguages = await db
        .select({ id: languages.id })
        .from(languages)
        .where(
          and(
            inArray(languages.id, languageIds),
            eq(languages.isDeleted, false)
          )
        );

      return existingLanguages.length === languageIds.length;
    } catch (error) {
      console.error("Error validating language IDs:", error);
      return false;
    }
  }

  // Create healthcare profile (profile completion)
  static async createProfile(
    userId: string,
    profileData: CreateHealthcareProfileData
  ): Promise<HealthcareProfile> {
    try {
      // First verify user exists and is healthcare
      const user = await this.getBasicProfile(userId);
      if (!user) {
        throw new Error("User not found or not a healthcare professional");
      }

      // Validate speciality IDs if provided
      if (profileData.specialityIds && profileData.specialityIds.length > 0) {
        const validSpecialities = await this.validateSpecialityIds(
          profileData.specialityIds
        );
        if (!validSpecialities) {
          throw new Error("One or more speciality IDs are invalid");
        }
      }

      // Validate language IDs if provided
      if (profileData.languageIds && profileData.languageIds.length > 0) {
        const validLanguages = await this.validateLanguageIds(
          profileData.languageIds
        );
        if (!validLanguages) {
          throw new Error("One or more language IDs are invalid");
        }
      }

      // Start transaction
      const result = await db.transaction(async (tx) => {
        // Create the profile (without the many-to-many fields and imageFile)
        const {
          specialityIds,
          languageIds,
          imageKey,
          ...profileDataWithoutManyToMany
        } = profileData;

        const [createdProfile] = await tx
          .insert(healthcareProfiles)
          .values({
            userId,
            ...profileDataWithoutManyToMany,
            dateOfBirth: profileData.dateOfBirth, // Convert string to Date
            gender: profileData.gender as "male" | "female", 
            image: profileData.imageUrl, // Set the uploaded image URL
          })
          .returning();

        if (!createdProfile) {
          throw new Error("Failed to create profile");
        }

        // Create speciality associations
        if (specialityIds && specialityIds.length > 0) {
          const specialityAssociations = specialityIds.map((specialityId) => ({
            healthcareProfileId: createdProfile.id,
            specialityId,
          }));

          await tx
            .insert(healthcareProfileSpecialities)
            .values(specialityAssociations);
        }

        // Create language associations
        if (languageIds && languageIds.length > 0) {
          const languageAssociations = languageIds.map((languageId) => ({
            healthcareProfileId: createdProfile.id,
            languageId,
          }));

          await tx
            .insert(healthcareProfileLanguages)
            .values(languageAssociations);
        }

        // Update user profile completion status
        await tx
          .update(users)
          .set({
            profileCompleted: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        return createdProfile;
      });

      // Fetch and return the complete profile with relations
      const completeProfile = await this.getCompleteProfile(userId);
      return completeProfile?.healthcareProfile!;
    } catch (error) {
      console.error("Error creating healthcare profile:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to create profile"
      );
    }
  }

  // Update healthcare profile
  static async updateProfile(
    userId: string,
    profileData: Partial<CreateHealthcareProfileData>
  ): Promise<HealthcareProfile> {
    try {
      // Verify user exists and has a profile
      const userWithProfile = await this.getCompleteProfile(userId);
      if (!userWithProfile || !userWithProfile.healthcareProfile) {
        throw new Error("User not found or profile does not exist");
      }
  
      const profileId = userWithProfile.healthcareProfile.id;
  
      // Validate speciality IDs if provided
      if (profileData.specialityIds && profileData.specialityIds.length > 0) {
        const validSpecialities = await this.validateSpecialityIds(
          profileData.specialityIds
        );
        if (!validSpecialities) {
          throw new Error("One or more speciality IDs are invalid");
        }
      }
  
      // Validate language IDs if provided
      if (profileData.languageIds && profileData.languageIds.length > 0) {
        const validLanguages = await this.validateLanguageIds(
          profileData.languageIds
        );
        if (!validLanguages) {
          throw new Error("One or more language IDs are invalid");
        }
      }
  
      // Start transaction
      await db.transaction(async (tx) => {
        // Update the profile (without the many-to-many fields and imageFile)
        const {
          specialityIds,
          languageIds,
          imageKey,
          ...profileDataWithoutManyToMany
        } = profileData;
  
        const updateData: any = {
          ...profileDataWithoutManyToMany,
          updatedAt: new Date(),
        };

        if (profileData.gender) {
          updateData.gender = profileData.gender as "male" | "female";
        }
  
        // Add image URL to update data if provided
        if (profileData.imageUrl) {
          updateData.image = profileData.imageUrl;
        }
  
        if (Object.keys(updateData).length > 1) {
          // More than just updatedAt
          await tx
            .update(healthcareProfiles)
            .set(updateData)
            .where(eq(healthcareProfiles.id, profileId));
        }
  
        // Update speciality associations if provided
        if (specialityIds !== undefined) {
          // Remove existing associations
          await tx
            .delete(healthcareProfileSpecialities)
            .where(
              eq(healthcareProfileSpecialities.healthcareProfileId, profileId)
            );
  
          // Add new associations
          if (specialityIds.length > 0) {
            const specialityAssociations = specialityIds.map(
              (specialityId) => ({
                healthcareProfileId: profileId,
                specialityId,
              })
            );
  
            await tx
              .insert(healthcareProfileSpecialities)
              .values(specialityAssociations);
          }
        }
  
        // Update language associations if provided
        if (languageIds !== undefined) {
          // Remove existing associations
          await tx
            .delete(healthcareProfileLanguages)
            .where(
              eq(healthcareProfileLanguages.healthcareProfileId, profileId)
            );
  
          // Add new associations
          if (languageIds.length > 0) {
            const languageAssociations = languageIds.map((languageId) => ({
              healthcareProfileId: profileId,
              languageId,
            }));
  
            await tx
              .insert(healthcareProfileLanguages)
              .values(languageAssociations);
          }
        }
      });
  
      // Fetch and return the updated profile with relations
      const updatedProfile = await this.getCompleteProfile(userId);
      return updatedProfile?.healthcareProfile!;
    } catch (error) {
      console.error("Error updating healthcare profile:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to update profile"
      );
    }
  }

  static async deleteProfileImage(userId: string): Promise<HealthcareProfile> {
    try {
      // Verify user exists and has a profile
      const userWithProfile = await this.getCompleteProfile(userId);
      if (!userWithProfile || !userWithProfile.healthcareProfile) {
        throw new Error("User not found or profile does not exist");
      }

      const profileId = userWithProfile.healthcareProfile.id;
      const existingImageUrl = userWithProfile.healthcareProfile.image;

      // Delete image from S3 if exists
      if (existingImageUrl) {
        try {
          const key = this.extractKeyFromUrl(existingImageUrl);
          if (key) {
            await S3Service.deleteFile(key);
          }
        } catch (error) {
          console.warn("Failed to delete image from S3:", error);
          // Continue with database update even if S3 deletion fails
        }
      }

      // Update profile to remove image URL
      await db
        .update(healthcareProfiles)
        .set({
          image: null,
          updatedAt: new Date(),
        })
        .where(eq(healthcareProfiles.id, profileId));

      // Fetch and return the updated profile
      const updatedProfile = await this.getCompleteProfile(userId);
      return updatedProfile?.healthcareProfile!;
    } catch (error) {
      console.error("Error deleting profile image:", error);
      throw new Error("Failed to delete profile image");
    }
  }

  private static extractKeyFromUrl(url: string): string | null {
    try {
      const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
      const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

      // Handle CloudFront URLs
      if (CLOUDFRONT_DOMAIN && url.includes(CLOUDFRONT_DOMAIN)) {
        return url.split(`https://${CLOUDFRONT_DOMAIN}/`)[1] || null;
      }

      // Handle direct S3 URLs
      const s3Pattern = new RegExp(
        `https://${BUCKET_NAME}\\.s3\\.[^/]+\\.amazonaws\\.com/(.+)`
      );
      const match = url.match(s3Pattern);
      return match ? match[1] : null;
    } catch (error) {
      console.warn("Failed to extract key from URL:", url);
      return null;
    }
  }

  // Update basic user info (name, etc.)
  static async updateBasicInfo(
    userId: string,
    updateData: Partial<Pick<User, "name">>
  ): Promise<User | null> {
    try {
      const allowedFields = ["name"] as const;

      // Filter and prepare update data
      const filteredData: Partial<Pick<User, "name">> = {};

      allowedFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          filteredData[field] = updateData[field];
        }
      });

      if (Object.keys(filteredData).length === 0) {
        throw new Error("No valid fields to update");
      }

      // Perform the update
      const result = await db
        .update(users)
        .set({
          ...filteredData,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), eq(users.role, "healthcare")))
        .returning({
          id: users.id,
          cognitoId: users.cognitoId,
          email: users.email,
          role: users.role,
          name: users.name,
          profileCompleted: users.profileCompleted,
          profileVerified: users.profileVerified,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      return result[0] || null;
    } catch (error) {
      console.error("Error updating healthcare basic info:", error);
      throw new Error("Failed to update basic info");
    }
  }

  // Get all available specialities
  static async getAvailableSpecialities() {
    try {
      return await db
        .select({
          id: specialities.id,
          name: specialities.name,
        })
        .from(specialities)
        .where(eq(specialities.isDeleted, false))
        .orderBy(specialities.name);
    } catch (error) {
      console.error("Error fetching specialities:", error);
      throw new Error("Failed to fetch specialities");
    }
  }

  // Get all available languages
  static async getAvailableLanguages() {
    try {
      return await db
        .select({
          id: languages.id,
          name: languages.name,
        })
        .from(languages)
        .where(eq(languages.isDeleted, false))
        .orderBy(languages.name);
    } catch (error) {
      console.error("Error fetching languages:", error);
      throw new Error("Failed to fetch languages");
    }
  }

  // Check if profile is completed
  static async isProfileCompleted(userId: string): Promise<boolean> {
    try {
      const user = await this.getBasicProfile(userId);
      return user?.profileCompleted || false;
    } catch (error) {
      console.error("Error checking profile completion:", error);
      return false;
    }
  }

  // Validate healthcare user permissions
  static async validateUserAccess(
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    try {
      // Healthcare users can only access their own data
      return userId === targetUserId;
    } catch (error) {
      console.error("Error validating user access:", error);
      return false;
    }
  }

  // Helper method to sanitize user data
  static sanitizeUserData(user: User): Omit<User, "cognitoId"> {
    const { cognitoId, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // Helper method to sanitize complete user with profile data
  static sanitizeCompleteUserData(
    userWithProfile: UserWithProfile
  ): Omit<UserWithProfile, "cognitoId"> {
    const { cognitoId, ...sanitizedData } = userWithProfile;
    return sanitizedData;
  }

  // Check if user exists and is healthcare
  static async checkUserExists(userId: string): Promise<boolean> {
    try {
      const result = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.role, "healthcare")))
        .limit(1);

      return result.length > 0;
    } catch (error) {
      console.error("Error checking user existence:", error);
      return false;
    }
  }

  // Validate profile data
  static validateProfileData(
    data: Partial<CreateHealthcareProfileData>
  ): string[] {
    const errors: string[] = [];

    if (
      data.fullName !== undefined &&
      (!data.fullName || data.fullName.trim().length < 2)
    ) {
      errors.push("Full name must be at least 2 characters long");
    }

    if (
      data.professionalTitle !== undefined &&
      (!data.professionalTitle || data.professionalTitle.trim().length < 2)
    ) {
      errors.push("Professional title must be at least 2 characters long");
    }

    if (
      data.postcode !== undefined &&
      (!data.postcode || data.postcode.trim().length < 3)
    ) {
      errors.push("Postcode must be at least 3 characters long");
    }

    if (
      data.address !== undefined &&
      (!data.address || data.address.trim().length < 10)
    ) {
      errors.push("Address must be at least 10 characters long");
    }

    if (
      data.phoneNumber !== undefined &&
      (!data.phoneNumber || data.phoneNumber.trim().length < 10)
    ) {
      errors.push("Phone number must be at least 10 characters long");
    }

    if (
      data.professionalSummary !== undefined &&
      (!data.professionalSummary || data.professionalSummary.trim().length < 20)
    ) {
      errors.push("Professional summary must be at least 20 characters long");
    }

    if (
      data.experience !== undefined &&
      data.experience !== null &&
      (data.experience < 0 || data.experience > 50)
    ) {
      errors.push("Experience must be between 0 and 50 years");
    }

    if (data.specialityIds !== undefined) {
      if (
        !Array.isArray(data.specialityIds) ||
        data.specialityIds.some((id) => !id || typeof id !== "string")
      ) {
        errors.push("All speciality IDs must be valid strings");
      }
    }

    if (data.languageIds !== undefined) {
      if (
        !Array.isArray(data.languageIds) ||
        data.languageIds.some((id) => !id || typeof id !== "string")
      ) {
        errors.push("All language IDs must be valid strings");
      }
    }

    if (data.preferredTime !== undefined) {
      if (
        !Array.isArray(data.preferredTime) ||
        data.preferredTime.some((time) => !time || typeof time !== "string")
      ) {
        errors.push("All preferred times must be valid strings");
      }
    }

    // if (data.image !== undefined && data.image) {
    //   // Simple URL pattern; adjust or replace with a more robust validator if needed
    //   const urlPattern = /^(https?:\/\/)[\w.-]+\.[a-z]{2,}(\S*)$/i;
    //   if (!urlPattern.test(data.image)) {
    //     errors.push('Image URL must be a valid URL');
    //   }
    // }

    return errors;
  }

    // Get bank details (separate method for security)
    static async getBankDetails(userId: string): Promise<BankDetails | null> {
      try {
        const userWithProfile = await this.getCompleteProfile(userId);
        if (!userWithProfile?.healthcareProfile) {
          throw new Error("Healthcare profile not found");
        }
  
        const result = await db.query.healthcareBankDetails.findFirst({
          where: and(
            eq(healthcareBankDetails.healthcareProfileId, userWithProfile.healthcareProfile.id),
            eq(healthcareBankDetails.isDeleted, false)
          ),
        });
  
        return result || null;
      } catch (error) {
        console.error("Error fetching bank details:", error);
        throw new Error("Failed to fetch bank details");
      }
    }
  
    // Create bank details
    static async createBankDetails(
      userId: string,
      bankData: CreateBankDetailsData
    ): Promise<BankDetails> {
      try {
        const userWithProfile = await this.getCompleteProfile(userId);
        if (!userWithProfile?.healthcareProfile) {
          throw new Error("Healthcare profile not found");
        }
  
        // Check if bank details already exist
        const existingBankDetails = await this.getBankDetails(userId);
        if (existingBankDetails) {
          throw new Error("Bank details already exist. Use update method instead.");
        }
  
        // Validate bank details
        const validationErrors = this.validateBankDetails(bankData);
        if (validationErrors.length > 0) {
          throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
        }
  
        const [createdBankDetails] = await db
          .insert(healthcareBankDetails)
          .values({
            healthcareProfileId: userWithProfile.healthcareProfile.id,
            ...bankData,
          })
          .returning();
  
        return createdBankDetails;
      } catch (error) {
        console.error("Error creating bank details:", error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to create bank details"
        );
      }
    }
  
    // Update bank details
    static async updateBankDetails(
      userId: string,
      bankData: Partial<CreateBankDetailsData>
    ): Promise<BankDetails> {
      try {
        const existingBankDetails = await this.getBankDetails(userId);
        if (!existingBankDetails) {
          throw new Error("Bank details not found");
        }
  
        // Validate bank details
        const validationErrors = this.validateBankDetails(bankData);
        if (validationErrors.length > 0) {
          throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
        }
  
        const [updatedBankDetails] = await db
          .update(healthcareBankDetails)
          .set({
            ...bankData,
            updatedAt: new Date(),
          })
          .where(eq(healthcareBankDetails.id, existingBankDetails.id))
          .returning();
  
        return updatedBankDetails;
      } catch (error) {
        console.error("Error updating bank details:", error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to update bank details"
        );
      }
    }
  
    // Delete bank details (GDPR compliance)
    static async deleteBankDetails(userId: string): Promise<boolean> {
      try {
        const existingBankDetails = await this.getBankDetails(userId);
        if (!existingBankDetails) {
          return false;
        }
  
        await db
          .update(healthcareBankDetails)
          .set({
            isDeleted: true,
            updatedAt: new Date(),
          })
          .where(eq(healthcareBankDetails.id, existingBankDetails.id));
  
        return true;
      } catch (error) {
        console.error("Error deleting bank details:", error);
        throw new Error("Failed to delete bank details");
      }
    }
  
    // Validate bank details
    static validateBankDetails(data: Partial<CreateBankDetailsData>): string[] {
      const errors: string[] = [];
  
      if (data.accountName !== undefined) {
        if (!data.accountName || data.accountName.trim().length < 2) {
          errors.push("Account name must be at least 2 characters long");
        }
      }
  
      if (data.sortCode !== undefined) {
        if (!data.sortCode) {
          errors.push("Sort code is required");
        } else {
          // UK sort code validation (XX-XX-XX format, 6 digits)
          const sortCodePattern = /^\d{2}-\d{2}-\d{2}$/;
          const cleanSortCode = data.sortCode.replace(/\D/g, '');
          
          if (cleanSortCode.length !== 6) {
            errors.push("Sort code must be 6 digits");
          } else if (!sortCodePattern.test(data.sortCode) && data.sortCode.length !== 6) {
            errors.push("Sort code must be in XX-XX-XX format or 6 digits");
          }
        }
      }
  
      if (data.accountNumber !== undefined) {
        if (!data.accountNumber) {
          errors.push("Account number is required");
        } else {
          // UK account number validation (8 digits)
          const cleanAccountNumber = data.accountNumber.replace(/\D/g, '');
          if (cleanAccountNumber.length !== 8) {
            errors.push("Account number must be exactly 8 digits");
          }
        }
      }
  
      if (data.bankName !== undefined && data.bankName) {
        if (data.bankName.trim().length < 2) {
          errors.push("Bank name must be at least 2 characters long");
        }
      }
  
      return errors;
    }
  
    // Update getCompleteProfile to include bank details when specifically requested
    static async getCompleteProfileWithBankDetails(
      userId: string
    ): Promise<UserWithProfile | null> {
      try {
        const userWithProfile = await this.getCompleteProfile(userId);
        if (!userWithProfile?.healthcareProfile) {
          return userWithProfile;
        }
  
        const bankDetails = await this.getBankDetails(userId);
        
        return {
          ...userWithProfile,
          healthcareProfile: {
            ...userWithProfile.healthcareProfile,
            bankDetails,
          },
        };
      } catch (error) {
        console.error("Error fetching complete profile with bank details:", error);
        throw new Error("Failed to fetch complete profile with bank details");
      }
    }

    static async getHealthcareProvidersWithReviews(options: {
      limit?: number;
      offset?: number;
      postcode?: string;
      specialityIds?: string[];
      minRating?: number;
    } = {}): Promise<{ providers: UserWithProfile[]; total: number }> {
      try {
        const { limit = 10, offset = 0, postcode, specialityIds, minRating } = options;
  
        // Build where conditions
        const whereConditions = [
          eq(users.role, "healthcare"),
          eq(users.isActive, true),
          eq(users.isDeleted, false),
          eq(users.profileCompleted, true),
        ];
  
        if (postcode) {
          whereConditions.push(eq(healthcareProfiles.postcode, postcode));
        }
  
        // Get healthcare providers
        let query = db.query.users.findMany({
          where: and(...whereConditions),
          with: {
            healthcareProfile: {
              with: {
                specialitiesRelation: {
                  with: { speciality: true },
                },
                languagesRelation: {
                  with: { language: true },
                },
              },
            },
          },
          limit,
          offset,
        });
  
        const [providers, totalCount] = await Promise.all([
          query,
          db
            .select({ count: count() })
            .from(users)
            .innerJoin(healthcareProfiles, eq(users.id, healthcareProfiles.userId))
            .where(and(...whereConditions))
            .then(result => result[0].count)
        ]);
  
        // Transform and add review stats
        const transformedProviders = await Promise.all(
          providers.map(async (provider: any) => {
            if (!provider.healthcareProfile) return provider;
  
            const {
              specialitiesRelation,
              languagesRelation,
              image: imageRaw,
              preferredTime: preferredTimeRaw,
              experience: experienceRaw,
              ...restProfile
            } = provider.healthcareProfile;
  
            let reviewStats;
            try {
              reviewStats = await ReviewService.getReviewStats(provider.id);
            } catch (error) {
              console.warn(`Failed to get review stats for provider ${provider.id}:`, error);
              reviewStats = {
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
  
            // Filter by minimum rating if specified
            if (minRating && reviewStats.averageRating < minRating) {
              return null;
            }
  
            const transformedProfile: HealthcareProfile = {
              ...restProfile,
              image: imageRaw ?? undefined,
              preferredTime: preferredTimeRaw ?? undefined,
              experience: experienceRaw ?? undefined,
              specialities: (specialitiesRelation ?? []).map((sp: any) => ({
                id: sp.speciality.id,
                name: sp.speciality.name,
              })),
              languages: (languagesRelation ?? []).map((lang: any) => ({
                id: lang.language.id,
                name: lang.language.name,
              })),
              reviewStats,
            };
  
            return {
              ...provider,
              healthcareProfile: transformedProfile,
            };
          })
        );
  
        // Filter out null results (providers that didn't meet rating criteria)
        const filteredProviders = transformedProviders.filter(p => p !== null) as UserWithProfile[];
  
        return {
          providers: filteredProviders,
          total: totalCount
        };
      } catch (error) {
        console.error("Error fetching healthcare providers with reviews:", error);
        throw new Error("Failed to fetch healthcare providers");
      }
    }
  
}
