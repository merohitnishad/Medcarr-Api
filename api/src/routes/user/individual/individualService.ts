// routes/user/individual/individualService.ts
import { db } from '../../../db/index.js';
import { users, individualProfiles } from '../../../db/schemas/usersSchema.js';
import { eq, and } from 'drizzle-orm';

export interface User {
  id: string;
  cognitoId: string;
  email: string;
  role: string;
  name?: string;
  profileCompleted: boolean;
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
  careNeeds?: string;
  languages?: string[];
  specialNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithProfile extends User {
  individualProfile?: IndividualProfile | null;
}

export interface CreateIndividualProfileData {
  fullName: string;
  postcode: string;
  address: string;
  aboutYou?: string;
  careNeeds?: string;
  languages?: string[];
  specialNote?: string;
}

export class IndividualService {
  // Get individual user's basic info only
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
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.role, 'individual')
          )
        )
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error fetching individual basic profile:', error);
      throw new Error('Failed to fetch basic profile');
    }
  }

  // Get individual user with complete profile using relations
  static async getCompleteProfile(userId: string): Promise<UserWithProfile | void> {
    try {
      const result = await db.query.users.findFirst({
        where: and(
          eq(users.id, userId),
          eq(users.role, 'individual')
        ),
        with: {
          individualProfile: true,
        }
      });

      result || null;
    } catch (error) {
      console.error('Error fetching individual complete profile:', error);
      throw new Error('Failed to fetch complete profile');
    }
  }

  // Create individual profile (profile completion)
  static async createProfile(userId: string, profileData: CreateIndividualProfileData): Promise<IndividualProfile | void> {
    try {
      // First verify user exists and is individual
      const user = await this.getBasicProfile(userId);
      if (!user) {
        throw new Error('User not found or not an individual');
      }

      // Create the profile
      const result = await db
        .insert(individualProfiles)
        .values({
          userId,
          ...profileData,
        })
        .returning();

      if (!result[0]) {
        throw new Error('Failed to create profile');
      }

      // Update user profile completion status
      await db
        .update(users)
        .set({ 
          profileCompleted: true,
          updatedAt: new Date() 
        })
        .where(eq(users.id, userId));

      result[0];
    } catch (error) {
      console.error('Error creating individual profile:', error);
      throw new Error('Failed to create profile');
    }
  }

  // Update individual profile
  static async updateProfile(userId: string, profileData: Partial<CreateIndividualProfileData>): Promise<IndividualProfile | void > {
    try {
      // Verify user exists and has a profile
      const userWithProfile = await this.getCompleteProfile(userId);
      if (!userWithProfile || !userWithProfile.individualProfile) {
        throw new Error('User not found or profile does not exist');
      }

      // Update the profile
      const result = await db
        .update(individualProfiles)
        .set({
          ...profileData,
          updatedAt: new Date(),
        })
        .where(eq(individualProfiles.userId, userId))
        .returning();

      result[0] || null;
    } catch (error) {
      console.error('Error updating individual profile:', error);
      throw new Error('Failed to update profile');
    }
  }

  // Update basic user info (name, etc.)
  static async updateBasicInfo(userId: string, updateData: Partial<Pick<User, 'name'>>): Promise<User | void> {
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
            eq(users.role, 'individual')
          )
        )
        .returning({
          id: users.id,
          cognitoId: users.cognitoId,
          email: users.email,
          role: users.role,
          name: users.name,
          profileCompleted: users.profileCompleted,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      result[0] || null;
      return
    } catch (error) {
      console.error('Error updating individual basic info:', error);
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

  // Validate individual user permissions
  static async validateUserAccess(userId: string, targetUserId: string): Promise<boolean> {
    try {
      // Individual users can only access their own data
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

  // Check if user exists and is individual
  static async checkUserExists(userId: string): Promise<boolean> {
    try {
      const result = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.role, 'individual')
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
  static validateProfileData(data: Partial<CreateIndividualProfileData>): string[] {
    const errors: string[] = [];
    
    if (data.fullName !== undefined && (!data.fullName || data.fullName.trim().length < 2)) {
      errors.push('Full name must be at least 2 characters long');
    }
    
    if (data.postcode !== undefined && (!data.postcode || data.postcode.trim().length < 3)) {
      errors.push('Postcode must be at least 3 characters long');
    }
    
    if (data.address !== undefined && (!data.address || data.address.trim().length < 10)) {
      errors.push('Address must be at least 10 characters long');
    }
    
    if (data.languages !== undefined && Array.isArray(data.languages)) {
      if (data.languages.some(lang => !lang || lang.trim().length < 2)) {
        errors.push('All languages must be at least 2 characters long');
      }
    }
    
    return errors;
  }
}