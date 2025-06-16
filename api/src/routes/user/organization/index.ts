// routes/user/organization/index.ts
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../../middlewares/authMiddleware.js';
import { organizationOnly } from '../../../middlewares/roleAuth.js';
import { OrganizationService, CreateOrganizationProfileData } from './organizationService.js';

const router = Router();

// Get organization user's basic profile (just user table data)
router.get('/profile/basic', organizationOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const user = await OrganizationService.getBasicProfile(userId);
    
    if (!user) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return;
    }

    const sanitizedUser = OrganizationService.sanitizeUserData(user);

    res.json({
      success: true,
      data: sanitizedUser
    });
    return;
  } catch (error) {
    console.error('Error in get basic profile route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch basic profile' 
    });
    return;
  }
});

// Get organization user's complete profile (user + organization profile)
router.get('/profile', organizationOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const userWithProfile = await OrganizationService.getCompleteProfile(userId);
    
    if (!userWithProfile) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return;
    }

    // Sanitize the response
    const sanitizedData = OrganizationService.sanitizeCompleteUserData(userWithProfile);

    res.json({
      success: true,
      data: sanitizedData
    });
    return;
  } catch (error) {
    console.error('Error in get profile route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profile' 
    });
    return;
  }
});

// Create/Complete organization profile (first time setup)
router.post('/profile/complete', organizationOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const profileData: CreateOrganizationProfileData = req.body;    
    
    // Validate required fields
    const requiredFields = ['organizationName', 'organizationType', 'postcode', 'address', 'phoneNumber'];
    const missingFields = requiredFields.filter(field => !profileData[field as keyof CreateOrganizationProfileData]);
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
      return;
    }

    // Validate profile data
    const validationErrors = OrganizationService.validateProfileData(profileData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    // Check if profile already exists
    const existingProfile = await OrganizationService.getCompleteProfile(userId);
    if (existingProfile?.organizationProfile) {
      res.status(409).json({ 
        success: false,
        error: 'Profile already exists. Use PUT /profile to update.' 
      });
      return;
    }

    const createdProfile = await OrganizationService.createProfile(userId, profileData);

    res.status(201).json({
      success: true,
      message: 'Profile completed successfully',
      data: createdProfile
    });
    return;
  } catch (error) {
    console.error('Error in create profile route:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete profile' 
    });
    return;
  }
});

// Update organization profile details
router.put('/profile', organizationOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const updateData: Partial<CreateOrganizationProfileData> = req.body;
    
    // Validate input
    if (!updateData || Object.keys(updateData).length === 0) {
      res.status(400).json({ 
        success: false,
        error: 'No update data provided' 
      });
      return;
    }

    // Validate profile data
    const validationErrors = OrganizationService.validateProfileData(updateData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    const updatedProfile = await OrganizationService.updateProfile(userId, updateData);
    
    if (!updatedProfile) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found or update failed' 
      });
      return;
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile
    });
    return;
  } catch (error) {
    console.error('Error in update profile route:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile' 
    });
    return;
  }
});

// Update basic user info (name, etc.)
router.put('/profile/basic', organizationOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const updateData = req.body;
    
    // Validate input
    if (!updateData || Object.keys(updateData).length === 0) {
      res.status(400).json({ 
        success: false,
        error: 'No update data provided' 
      });
      return;
    }

    const updatedUser = await OrganizationService.updateBasicInfo(userId, updateData);
    
    if (!updatedUser) {
      res.status(404).json({ 
        success: false,
        error: 'User not found or update failed' 
      });
      return;
    }

    const sanitizedUser = OrganizationService.sanitizeUserData(updatedUser);

    res.json({
      success: true,
      message: 'Basic info updated successfully',
      data: sanitizedUser
    });
    return;
  } catch (error) {
    console.error('Error in update basic info route:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update basic info' 
    });
    return;
  }
});

// Check profile completion status
router.get('/profile/status', organizationOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const isCompleted = await OrganizationService.isProfileCompleted(userId);
    const userWithProfile = await OrganizationService.getCompleteProfile(userId);

    res.json({
      success: true,
      data: {
        profileCompleted: isCompleted,
        hasDetailedProfile: !!userWithProfile?.organizationProfile,
        nextStep: isCompleted ? null : 'complete_profile'
      }
    });
    return;
  } catch (error) {
    console.error('Error in profile status route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check profile status' 
    });
    return;
  }
});

// Get specific profile by ID (only their own) - with complete profile
router.get('/profile/:userId', organizationOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    console.log('userId', userId);
    const currentUserId = req.user!.id;
    
    // Organization users can only access their own profile
    const hasAccess = await OrganizationService.validateUserAccess(currentUserId, userId);
    
    if (!hasAccess) {
      res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only view your own profile.' 
      });
      return;
    }

    const userWithProfile = await OrganizationService.getCompleteProfile(userId);
    
    if (!userWithProfile) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return;
    }

    const sanitizedData = OrganizationService.sanitizeCompleteUserData(userWithProfile);

    res.json({
      success: true,
      data: sanitizedData
    });
    return;
  } catch (error) {
    console.error('Error in get profile by ID route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profile' 
    });
    return;
  }
});

export default router;