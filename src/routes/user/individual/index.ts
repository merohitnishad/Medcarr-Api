// routes/user/individual/index.ts
import { Router, Response } from "express";
import { AuthenticatedRequest } from "../../../middlewares/authMiddleware.js";
import { individualOnly } from "../../../middlewares/roleAuth.js";
import {
  IndividualService,
  CreateIndividualProfileData,
} from "./individualService.js";

const router = Router();

// Get individual user's basic profile (just user table data)
router.get(
  "/profile/basic",
  individualOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const user = await IndividualService.getBasicProfile(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: "Profile not found",
        });
        return;
      }

      const sanitizedUser = IndividualService.sanitizeUserData(user);

      res.json({
        success: true,
        data: sanitizedUser,
      });
      return;
    } catch (error) {
      console.error("Error in get basic profile route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch basic profile",
      });
      return;
    }
  },
);

// Get individual user's complete profile (user + individual profile)
router.get(
  "/profile",
  individualOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const userWithProfile =
        await IndividualService.getCompleteProfile(userId);

      if (!userWithProfile) {
        res.status(404).json({
          success: false,
          error: "Profile not found",
        });
        return;
      }

      // Sanitize the response
      const sanitizedData =
        IndividualService.sanitizeCompleteUserData(userWithProfile);

      res.json({
        success: true,
        data: sanitizedData,
      });
      return;
    } catch (error) {
      console.error("Error in get profile route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch profile",
      });
      return;
    }
  },
);

// Create/Complete individual profile (first time setup)
router.post(
  "/profile/complete",
  individualOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const profileData: CreateIndividualProfileData = req.body;
      // Validate required fields
      const requiredFields = ["fullName", "postcode", "address"];
      const missingFields = requiredFields.filter(
        (field) => !profileData[field as keyof CreateIndividualProfileData],
      );

      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          error: `Missing required fields: ${missingFields.join(", ")}`,
        });
        return;
      }

      // Validate profile data
      const validationErrors =
        IndividualService.validateProfileData(profileData);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: validationErrors,
        });
        return;
      }

      // Check if profile already exists
      const existingProfile =
        await IndividualService.getCompleteProfile(userId);
      if (existingProfile?.individualProfile) {
        res.status(409).json({
          success: false,
          error: "Profile already exists. Use PUT /profile to update.",
        });
        return;
      }

      // Validate care need IDs if provided (additional validation in route)
      if (profileData.careNeedIds && profileData.careNeedIds.length > 0) {
        const validCareNeeds = await IndividualService.validateCareNeedIds(
          profileData.careNeedIds,
        );
        if (!validCareNeeds) {
          res.status(400).json({
            success: false,
            error: "One or more care need IDs are invalid",
          });
          return;
        }
      }

      // Validate language IDs if provided (additional validation in route)
      if (profileData.languageIds && profileData.languageIds.length > 0) {
        const validLanguages = await IndividualService.validateLanguageIds(
          profileData.languageIds,
        );
        if (!validLanguages) {
          res.status(400).json({
            success: false,
            error: "One or more language IDs are invalid",
          });
          return;
        }
      }

      const createdProfile = await IndividualService.createProfile(
        userId,
        profileData,
      );

      res.status(201).json({
        success: true,
        message: "Profile completed successfully",
        data: createdProfile,
      });
      return;
    } catch (error) {
      console.error("Error in create profile route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to complete profile",
      });
      return;
    }
  },
);

// Update individual profile details
router.put(
  "/profile",
  individualOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const updateData: Partial<CreateIndividualProfileData> = req.body;

      // Validate input
      if (!updateData || Object.keys(updateData).length === 0) {
        res.status(400).json({
          success: false,
          error: "No update data provided",
        });
        return;
      }

      // Validate profile data
      const validationErrors =
        IndividualService.validateProfileData(updateData);
      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: validationErrors,
        });
        return;
      }

      const updatedProfile = await IndividualService.updateProfile(
        userId,
        updateData,
      );

      if (!updatedProfile) {
        res.status(404).json({
          success: false,
          error: "Profile not found or update failed",
        });
        return;
      }

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: updatedProfile,
      });
      return;
    } catch (error) {
      console.error("Error in update profile route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update profile",
      });
      return;
    }
  },
);

// Update basic user info (name, etc.)
router.put(
  "/profile/basic",
  individualOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const updateData = req.body;

      // Validate input
      if (!updateData || Object.keys(updateData).length === 0) {
        res.status(400).json({
          success: false,
          error: "No update data provided",
        });
        return;
      }

      const updatedUser = await IndividualService.updateBasicInfo(
        userId,
        updateData,
      );

      if (!updatedUser) {
        res.status(404).json({
          success: false,
          error: "User not found or update failed",
        });
        return;
      }

      const sanitizedUser = IndividualService.sanitizeUserData(updatedUser);

      res.json({
        success: true,
        message: "Basic info updated successfully",
        data: sanitizedUser,
      });
      return;
    } catch (error) {
      console.error("Error in update basic info route:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update basic info",
      });
      return;
    }
  },
);

// Check profile completion status
router.get(
  "/profile/status",
  individualOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const isCompleted = await IndividualService.isProfileCompleted(userId);
      const userWithProfile =
        await IndividualService.getCompleteProfile(userId);

      res.json({
        success: true,
        data: {
          profileCompleted: isCompleted,
          hasDetailedProfile: !!userWithProfile?.individualProfile,
          nextStep: isCompleted ? null : "complete_profile",
        },
      });
      return;
    } catch (error) {
      console.error("Error in profile status route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to check profile status",
      });
      return;
    }
  },
);

router.get(
  "/profile/options",
  individualOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [careNeeds, languages] = await Promise.all([
        IndividualService.getAvailableCareNeeds(),
        IndividualService.getAvailableLanguages(),
      ]);

      res.json({
        success: true,
        data: {
          careNeeds,
          languages,
        },
      });
      return;
    } catch (error) {
      console.error("Error fetching profile options:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch profile options",
      });
      return;
    }
  },
);

// Get specific profile by ID (only their own) - with complete profile
router.get(
  "/profile/:userId",
  individualOnly,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.params;
      console.log("userId", userId);
      const currentUserId = req.user!.id;

      // Individual users can only access their own profile
      const hasAccess = await IndividualService.validateUserAccess(
        currentUserId,
        userId,
      );

      if (!hasAccess) {
        res.status(403).json({
          success: false,
          error: "Access denied. You can only view your own profile.",
        });
        return;
      }

      const userWithProfile =
        await IndividualService.getCompleteProfile(userId);

      if (!userWithProfile) {
        res.status(404).json({
          success: false,
          error: "Profile not found",
        });
        return;
      }

      const sanitizedData =
        IndividualService.sanitizeCompleteUserData(userWithProfile);

      res.json({
        success: true,
        data: sanitizedData,
      });
      return;
    } catch (error) {
      console.error("Error in get profile by ID route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch profile",
      });
      return;
    }
  },
);

export default router;
