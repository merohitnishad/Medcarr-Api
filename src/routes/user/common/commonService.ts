// routes/user/organization/organizationService.ts
import { db } from "../../../db/index.js";
import { users } from "../../../db/schemas/usersSchema.js";
import { eq, and } from "drizzle-orm";

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

export class CommonService {
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
        .where(and(eq(users.id, userId)))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error("Error fetching basic profile:", error);
      throw new Error("Failed to fetch basic profile");
    }
  }

  // Helper method to sanitize user data
  static sanitizeUserData(user: User): Omit<User, "cognitoId"> {
    const { cognitoId, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}
