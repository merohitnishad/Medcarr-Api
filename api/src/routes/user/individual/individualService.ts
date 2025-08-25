// routes/user/individual/individualService.ts
import { NotificationService } from "../../notification/notificationService.js";
import { db } from "../../../db/index.js";
import {
  users,
  individualProfiles,
  individualProfileLanguages,
  individualProfileCareNeeds,
} from "../../../db/schemas/usersSchema.js";
import { careNeeds, languages } from "../../../db/schemas/utilsSchema.js";
import { eq, and, inArray } from "drizzle-orm";

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

export interface IndividualProfile {
  id: string;
  userId: string;
  fullName: string;
  postcode: string;
  address: string;
  aboutYou?: string;
  specialNote?: string;
  phoneNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  // Include related data
  careNeeds?: Array<{ id: string; name: string }>;
  languages?: Array<{ id: string; name: string; code?: string }>;
}

export interface UserWithProfile extends User {
  individualProfile?: IndividualProfile | null;
}

export interface CreateIndividualProfileData {
  fullName: string;
  postcode: string;
  address: string;
  phoneNumber: string;
  aboutYou?: string;
  careNeedIds?: string[]; // Changed from careNeeds string to IDs
  languageIds?: string[]; // Changed from languages string array to IDs
  specialNote?: string;
}

export class IndividualService {
  // Get individual user's basic info only
  static async getBasicProfile(userId: string): Promise<User> {
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
        .where(and(eq(users.id, userId), eq(users.role, "individual")))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error("Error fetching individual basic profile:", error);
      throw new Error("Failed to fetch basic profile");
    }
  }

  // Get individual user with complete profile using relations
  static async getCompleteProfile(
    userId: string
  ): Promise<UserWithProfile | null> {
    try {
      const result = await db.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.role, "individual")),
        with: {
          individualProfile: {
            with: {
              careNeedsRelation: {
                with: { careNeed: true },
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
      if (result.individualProfile) {
        // pull out the relations plus the raw aboutYou/specialNote
        const {
          careNeedsRelation,
          languagesRelation,
          aboutYou: aboutYouRaw,
          specialNote: specialNoteRaw,
          // everything else (id, fullName, address, createdAt, etc.)
          ...restProfile
        } = result.individualProfile;

        const transformedProfile: IndividualProfile = {
          // copy across id, userId, fullName, postcode, address, createdAt, updatedAt, isDeleted
          ...restProfile,

          // normalize database nulls to undefined for optional text fields
          aboutYou: aboutYouRaw ?? undefined,
          specialNote: specialNoteRaw ?? undefined,

          // build your arrays as before
          careNeeds: (careNeedsRelation ?? []).map((cn) => ({
            id: cn.careNeed.id,
            name: cn.careNeed.name,
          })),

          languages: (languagesRelation ?? []).map((lang) => ({
            id: lang.language.id,
            name: lang.language.name,
          })),
        };

        return {
          ...result,
          individualProfile: transformedProfile,
        };
      }

      return result as UserWithProfile;
    } catch (error) {
      console.error("Error fetching individual complete profile:", error);
      throw new Error("Failed to fetch complete profile");
    }
  }

  // Helper method to validate care need IDs
  static async validateCareNeedIds(careNeedIds: string[]): Promise<boolean> {
    if (!careNeedIds || careNeedIds.length === 0) return true;

    try {
      const existingCareNeeds = await db
        .select({ id: careNeeds.id })
        .from(careNeeds)
        .where(
          and(
            inArray(careNeeds.id, careNeedIds),
            eq(careNeeds.isDeleted, false)
          )
        );

      return existingCareNeeds.length === careNeedIds.length;
    } catch (error) {
      console.error("Error validating care need IDs:", error);
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

  // Create individual profile (profile completion)
  static async createProfile(
    userId: string,
    profileData: CreateIndividualProfileData
  ): Promise<IndividualProfile> {
    try {
      // First verify user exists and is individual
      const user = await this.getBasicProfile(userId);
      if (!user) {
        throw new Error("User not found or not an individual");
      }

      // Validate care need IDs if provided
      if (profileData.careNeedIds && profileData.careNeedIds.length > 0) {
        const validCareNeeds = await this.validateCareNeedIds(
          profileData.careNeedIds
        );
        if (!validCareNeeds) {
          throw new Error("One or more care need IDs are invalid");
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
        // Create the profile (without the many-to-many fields)
        const { careNeedIds, languageIds, ...profileDataWithoutManyToMany } =
          profileData;

        const [createdProfile] = await tx
          .insert(individualProfiles)
          .values({
            userId,
            ...profileDataWithoutManyToMany,
          })
          .returning();

        if (!createdProfile) {
          throw new Error("Failed to create profile");
        }

        // Create care need associations
        if (careNeedIds && careNeedIds.length > 0) {
          const careNeedAssociations = careNeedIds.map((careNeedId) => ({
            individualProfileId: createdProfile.id,
            careNeedId,
          }));

          await tx
            .insert(individualProfileCareNeeds)
            .values(careNeedAssociations);
        }

        // Create language associations
        if (languageIds && languageIds.length > 0) {
          const languageAssociations = languageIds.map((languageId) => ({
            individualProfileId: createdProfile.id,
            languageId,
          }));

          await tx
            .insert(individualProfileLanguages)
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

      try {
        const adminUser = await db.query.users.findFirst({
          where: eq(users.role, "admin"),
          columns: { id: true },
        });

        if (adminUser) {
          await NotificationService.createFromTemplate(
            "PROFILE_COMPLETED",
            adminUser.id,
            {
              userName: user.name || "no name",
              userRole: "individual",
            },
            {
              relatedUserId: userId,
              sendEmail: true,
              metadata: {
                profileType: "individual",
              },
            }
          );
        }
      } catch (notificationError) {
        console.error(
          "Failed to create admin notification:",
          notificationError
        );
        // Continue without failing the profile creation
      }

      // Fetch and return the complete profile with relations
      const completeProfile = await this.getCompleteProfile(userId);
      return completeProfile?.individualProfile!;
    } catch (error) {
      console.error("Error creating individual profile:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to create profile"
      );
    }
  }

  // Update individual profile
  static async updateProfile(
    userId: string,
    profileData: Partial<CreateIndividualProfileData>
  ): Promise<IndividualProfile> {
    try {
      // Verify user exists and has a profile
      const userWithProfile = await this.getCompleteProfile(userId);
      if (!userWithProfile || !userWithProfile.individualProfile) {
        throw new Error("User not found or profile does not exist");
      }

      const profileId = userWithProfile.individualProfile.id;

      // Validate care need IDs if provided
      if (profileData.careNeedIds && profileData.careNeedIds.length > 0) {
        const validCareNeeds = await this.validateCareNeedIds(
          profileData.careNeedIds
        );
        if (!validCareNeeds) {
          throw new Error("One or more care need IDs are invalid");
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
        // Update the profile (without the many-to-many fields)
        const { careNeedIds, languageIds, ...profileDataWithoutManyToMany } =
          profileData;

        if (Object.keys(profileDataWithoutManyToMany).length > 0) {
          await tx
            .update(individualProfiles)
            .set({
              ...profileDataWithoutManyToMany,
              updatedAt: new Date(),
            })
            .where(eq(individualProfiles.id, profileId));
        }

        // Update care need associations if provided
        if (careNeedIds !== undefined) {
          // Remove existing associations
          await tx
            .delete(individualProfileCareNeeds)
            .where(
              eq(individualProfileCareNeeds.individualProfileId, profileId)
            );

          // Add new associations
          if (careNeedIds.length > 0) {
            const careNeedAssociations = careNeedIds.map((careNeedId) => ({
              individualProfileId: profileId,
              careNeedId,
            }));

            await tx
              .insert(individualProfileCareNeeds)
              .values(careNeedAssociations);
          }
        }

        // Update language associations if provided
        if (languageIds !== undefined) {
          // Remove existing associations
          await tx
            .delete(individualProfileLanguages)
            .where(
              eq(individualProfileLanguages.individualProfileId, profileId)
            );

          // Add new associations
          if (languageIds.length > 0) {
            const languageAssociations = languageIds.map((languageId) => ({
              individualProfileId: profileId,
              languageId,
            }));

            await tx
              .insert(individualProfileLanguages)
              .values(languageAssociations);
          }
        }
      });

      // Fetch and return the updated profile with relations
      const updatedProfile = await this.getCompleteProfile(userId);
      return updatedProfile?.individualProfile!;
    } catch (error) {
      console.error("Error updating individual profile:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to update profile"
      );
    }
  }

  // Update basic user info (name, etc.)
  static async updateBasicInfo(
    userId: string,
    updateData: Partial<Pick<User, "name">>
  ): Promise<User> {
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
        .where(and(eq(users.id, userId), eq(users.role, "individual")))
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
      console.error("Error updating individual basic info:", error);
      throw new Error("Failed to update basic info");
    }
  }

  // Get all available care needs
  static async getAvailableCareNeeds() {
    try {
      return await db
        .select({
          id: careNeeds.id,
          name: careNeeds.name,
        })
        .from(careNeeds)
        .where(eq(careNeeds.isDeleted, false))
        .orderBy(careNeeds.name);
    } catch (error) {
      console.error("Error fetching care needs:", error);
      throw new Error("Failed to fetch care needs");
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

  // Validate individual user permissions
  static async validateUserAccess(
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    try {
      // Individual users can only access their own data
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

  // Check if user exists and is individual
  static async checkUserExists(userId: string): Promise<boolean> {
    try {
      const result = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.role, "individual")))
        .limit(1);

      return result.length > 0;
    } catch (error) {
      console.error("Error checking user existence:", error);
      return false;
    }
  }

  // Validate profile data
  static validateProfileData(
    data: Partial<CreateIndividualProfileData>
  ): string[] {
    const errors: string[] = [];

    if (
      data.fullName !== undefined &&
      (!data.fullName || data.fullName.trim().length < 2)
    ) {
      errors.push("Full name must be at least 2 characters long");
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

    if (data.careNeedIds !== undefined && Array.isArray(data.careNeedIds)) {
      if (data.careNeedIds.some((id) => !id || typeof id !== "string")) {
        errors.push("All care need IDs must be valid strings");
      }
    }

    if (data.languageIds !== undefined && Array.isArray(data.languageIds)) {
      if (data.languageIds.some((id) => !id || typeof id !== "string")) {
        errors.push("All language IDs must be valid strings");
      }
    }

    return errors;
  }
}
