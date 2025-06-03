// routes/user/individual/individualService.ts
import { db } from '../../../db/index.js';
import { users } from '../../../db/schemas/usersSchema.js';
import { eq, and } from 'drizzle-orm';

export interface User {
  id: string;
  cognitoId: string;
  email: string;
  role: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class IndividualService {
  // Get individual user's own profile
  static async getProfile(userId: string): Promise<User | null> {
    try {
      const result = await db
        .select({
          id: users.id,
          cognitoId: users.cognitoId,
          email: users.email,
          role: users.role,
          name: users.name,
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
      console.error('Error fetching individual profile:', error);
      throw new Error('Failed to fetch profile');
    }
  }

  // Update individual user's profile
  static async updateProfile(userId: string, updateData: Partial<User>): Promise<User | null> {
    try {
      // Only allow individual users to update specific fields
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
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      return result[0] || null;
    } catch (error) {
      console.error('Error updating individual profile:', error);
      throw new Error('Failed to update profile');
    }
  }

  // Get individual user's activity/history (if needed)
  // static async getUserActivity(userId: string): Promise<any[]> {
  //   try {
  //     // Note: You'll need to create a user_activities schema and import it
  //     // This is a placeholder - adjust based on your actual activity table structure
      
  //     // Example assuming you have a userActivities table schema:
  //     // import { userActivities } from '../../db/schemas/userActivitiesSchema.js';
      
  //     // const result = await db
  //     //   .select({
  //     //     activity_type: userActivities.activity_type,
  //     //     description: userActivities.description,
  //     //     created_at: userActivities.created_at,
  //     //   })
  //     //   .from(userActivities)
  //     //   .where(eq(userActivities.user_id, userId))
  //     //   .orderBy(desc(userActivities.created_at))
  //     //   .limit(50);
      
  //     // For now, returning empty array until you set up the activities schema
  //     console.log('User activity fetch - schema not implemented yet');
  //     return [];
  //   } catch (error) {
  //     console.error('Error fetching user activity:', error);
  //     throw new Error('Failed to fetch activity');
  //   }
  // }

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

  // Additional helper method to check if user exists and is individual
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
}