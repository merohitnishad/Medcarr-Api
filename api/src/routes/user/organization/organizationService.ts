// routes/user/organization/organizationService.ts
import { db } from '../../../db/index.js';
import { 
  users, 
  organizationProfiles,
} from '../../../db/schemas/usersSchema.js';
import { eq, and } from 'drizzle-orm';

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

export interface OrganizationProfile {
  id: string;
  userId: string;
  organizationName: string;
  organizationType: string;
  postcode: string;
  phoneNumber: string;
  address: string;
  overview?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithProfile extends User {
  organizationProfile?: OrganizationProfile | null;
}

export interface CreateOrganizationProfileData {
  organizationName: string;
  organizationType: string;
  postcode: string;
  phoneNumber: string;
  address: string;
  overview?: string;
}

export class OrganizationService {
  // Get organization user's basic info only
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
        .where(
          and(
            eq(users.id, userId),
            eq(users.role, 'organization')
          )
        )
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error fetching organization basic profile:', error);
      throw new Error('Failed to fetch basic profile');
    }
  }

  // Get organization user with complete profile using relations
  static async getCompleteProfile(userId: string): Promise<UserWithProfile | null> {
    try {
      const result = await db.query.users.findFirst({
        where: and(
          eq(users.id, userId),
          eq(users.role, 'organization')
        ),
        with: {
          organizationProfile: true
        }
      });

      if (!result) return null;

      // Transform the data to match our interface
      if (result.organizationProfile) {
        const {
          overview: overviewRaw,
          ...restProfile
        } = result.organizationProfile;
      
        const transformedProfile: OrganizationProfile = {
          ...restProfile,
          overview: overviewRaw ?? undefined,
        };
      
        return {
          ...result,
          organizationProfile: transformedProfile,
        };
      }

      return result as UserWithProfile;
    } catch (error) {
      console.error('Error fetching organization complete profile:', error);
      throw new Error('Failed to fetch complete profile');
    }
  }

  // Create organization profile (profile completion)
  static async createProfile(userId: string, profileData: CreateOrganizationProfileData): Promise<OrganizationProfile> {
    try {
      // First verify user exists and is organization
      const user = await this.getBasicProfile(userId);
      if (!user) {
        throw new Error('User not found or not an organization');
      }

      // Start transaction
      const result = await db.transaction(async (tx) => {
        // Create the profile
        const [createdProfile] = await tx
          .insert(organizationProfiles)
          .values({
            userId,
            ...profileData,
          })
          .returning();

        if (!createdProfile) {
          throw new Error('Failed to create profile');
        }

        // Update user profile completion status
        await tx
          .update(users)
          .set({ 
            profileCompleted: true,
            updatedAt: new Date() 
          })
          .where(eq(users.id, userId));

        return createdProfile;
      });

      // Transform the result to match our interface
      return {
        ...result,
        overview: result.overview ?? undefined,
      };
    } catch (error) {
      console.error('Error creating organization profile:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create profile');
    }
  }

  // Update organization profile
  static async updateProfile(userId: string, profileData: Partial<CreateOrganizationProfileData>): Promise<OrganizationProfile> {
    try {
      // Verify user exists and has a profile
      const userWithProfile = await this.getCompleteProfile(userId);
      if (!userWithProfile || !userWithProfile.organizationProfile) {
        throw new Error('User not found or profile does not exist');
      }

      const profileId = userWithProfile.organizationProfile.id;

      // Update the profile
      const [updatedProfile] = await db
        .update(organizationProfiles)
        .set({
          ...profileData,
          updatedAt: new Date(),
        })
        .where(eq(organizationProfiles.id, profileId))
        .returning();

      if (!updatedProfile) {
        throw new Error('Failed to update profile');
      }

      // Transform the result to match our interface
      return {
        ...updatedProfile,
        overview: updatedProfile.overview ?? undefined,
      };
    } catch (error) {
      console.error('Error updating organization profile:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to update profile');
    }
  }

  // Update basic user info (name, etc.)
  static async updateBasicInfo(userId: string, updateData: Partial<Pick<User, 'name'>>): Promise<User | null> {
    try {
      const allowedFields = ['name'] as const;
      
      // Filter and prepare update data
      const filteredData: Partial<Pick<User, 'name'>> = {};
      
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          filteredData[field] = updateData[field];
        }
      });

      if (Object.keys(filteredData).length === 0) {
        throw new Error('No valid fields to update');
      }

      // Perform the update
      const result = await db
        .update(users)
        .set({
          ...filteredData,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(users.id, userId),
            eq(users.role, 'organization')
          )
        )
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
      console.error('Error updating organization basic info:', error);
      throw new Error('Failed to update basic info');
    }
  }

  // Check if profile is completed
  static async isProfileCompleted(userId: string): Promise<boolean> {
    try {
      const user = await this.getBasicProfile(userId);
      return user?.profileCompleted || false;
    } catch (error) {
      console.error('Error checking profile completion:', error);
      return false;
    }
  }

  // Validate organization user permissions
  static async validateUserAccess(userId: string, targetUserId: string): Promise<boolean> {
    try {
      // Organization users can only access their own data
      return userId === targetUserId;
    } catch (error) {
      console.error('Error validating user access:', error);
      return false;
    }
  }

  // Helper method to sanitize user data
  static sanitizeUserData(user: User): Omit<User, 'cognitoId'> {
    const { cognitoId, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // Helper method to sanitize complete user with profile data
  static sanitizeCompleteUserData(userWithProfile: UserWithProfile): Omit<UserWithProfile, 'cognitoId'> {
    const { cognitoId, ...sanitizedData } = userWithProfile;
    return sanitizedData;
  }

  // Check if user exists and is organization
  static async checkUserExists(userId: string): Promise<boolean> {
    try {
      const result = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.role, 'organization')
          )
        )
        .limit(1);

      return result.length > 0;
    } catch (error) {
      console.error('Error checking user existence:', error);
      return false;
    }
  }

  // Validate profile data
  static validateProfileData(data: Partial<CreateOrganizationProfileData>): string[] {
    const errors: string[] = [];
    
    if (data.organizationName !== undefined && (!data.organizationName || data.organizationName.trim().length < 2)) {
      errors.push('Organization name must be at least 2 characters long');
    }
    
    if (data.organizationType !== undefined && (!data.organizationType || data.organizationType.trim().length < 2)) {
      errors.push('Organization type must be at least 2 characters long');
    }
    
    if (data.postcode !== undefined && (!data.postcode || data.postcode.trim().length < 3)) {
      errors.push('Postcode must be at least 3 characters long');
    }
    
    if (data.address !== undefined && (!data.address || data.address.trim().length < 10)) {
      errors.push('Address must be at least 10 characters long');
    }
    
    if (data.phoneNumber !== undefined && (!data.phoneNumber || data.phoneNumber.trim().length < 10)) {
      errors.push('Phone number must be at least 10 characters long');
    }
    
    if (data.overview !== undefined && data.overview && data.overview.trim().length < 10) {
      errors.push('Overview must be at least 10 characters long when provided');
    }
    
    return errors;
  }
}