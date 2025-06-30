// routes/user/healthcare/index.ts
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../../middlewares/authMiddleware.js';
import { healthcareOnly } from '../../../middlewares/roleAuth.js';
import { HealthcareService, CreateHealthcareProfileData, CreateBankDetailsData } from './healthcareService.js';
import { S3Service } from "../../../utils/s3UploadService.js";


const router = Router();

// Get healthcare user's basic profile (just user table data)
router.get('/profile/basic', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const user = await HealthcareService.getBasicProfile(userId);
    
    if (!user) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return;
    }

    const sanitizedUser = HealthcareService.sanitizeUserData(user);

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

// Get healthcare user's complete profile (user + healthcare profile)
router.get('/profile', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const userWithProfile = await HealthcareService.getCompleteProfile(userId);
    
    if (!userWithProfile) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return;
    }

    // Sanitize the response
    const sanitizedData = HealthcareService.sanitizeCompleteUserData(userWithProfile);

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

// Create/Complete healthcare profile (first time setup)
router.post('/profile/complete', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const profileData: CreateHealthcareProfileData = req.body;    
    
    // Validate required fields
    const requiredFields = ['fullName', 'professionalTitle', 'postcode', 'address', 'phoneNumber', 'professionalSummary'];
    const missingFields = requiredFields.filter(field => !profileData[field as keyof CreateHealthcareProfileData]);
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
      return;
    }

    // Validate profile data
    const validationErrors = HealthcareService.validateProfileData(profileData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    // Check if profile already exists
    const existingProfile = await HealthcareService.getCompleteProfile(userId);
    if (existingProfile?.healthcareProfile) {
      res.status(409).json({ 
        success: false,
        error: 'Profile already exists. Use PUT /profile to update.' 
      });
      return;
    }

    // Validate speciality IDs if provided (additional validation in route)
    if (profileData.specialityIds && profileData.specialityIds.length > 0) {
      const validSpecialities = await HealthcareService.validateSpecialityIds(profileData.specialityIds);
      if (!validSpecialities) {
        res.status(400).json({
          success: false,
          error: 'One or more speciality IDs are invalid'
        });
        return;
      }
    }

    // Validate language IDs if provided (additional validation in route)
    if (profileData.languageIds && profileData.languageIds.length > 0) {
      const validLanguages = await HealthcareService.validateLanguageIds(profileData.languageIds);
      if (!validLanguages) {
        res.status(400).json({
          success: false,
          error: 'One or more language IDs are invalid'
        });
        return;
      }
    }

    const createdProfile = await HealthcareService.createProfile(userId, profileData);

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

// Update healthcare profile details
router.put('/profile', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const updateData: Partial<CreateHealthcareProfileData> = req.body;
    
    // Validate input
    if (!updateData || Object.keys(updateData).length === 0) {
      res.status(400).json({ 
        success: false,
        error: 'No update data provided' 
      });
      return;
    }

    // Validate profile data
    const validationErrors = HealthcareService.validateProfileData(updateData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    const updatedProfile = await HealthcareService.updateProfile(userId, updateData);
    
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
router.put('/profile/basic', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
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

    const updatedUser = await HealthcareService.updateBasicInfo(userId, updateData);
    
    if (!updatedUser) {
      res.status(404).json({ 
        success: false,
        error: 'User not found or update failed' 
      });
      return;
    }

    const sanitizedUser = HealthcareService.sanitizeUserData(updatedUser);

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
router.get('/profile/status', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const isCompleted = await HealthcareService.isProfileCompleted(userId);
    const userWithProfile = await HealthcareService.getCompleteProfile(userId);

    res.json({
      success: true,
      data: {
        profileCompleted: isCompleted,
        hasDetailedProfile: !!userWithProfile?.healthcareProfile,
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

// Get profile options (specialities and languages)
router.get('/profile/options', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [specialities, languages] = await Promise.all([
      HealthcareService.getAvailableSpecialities(),
      HealthcareService.getAvailableLanguages()
    ]);

    res.json({
      success: true,
      data: {
        specialities,
        languages
      }
    });
    return;
  } catch (error) {
    console.error('Error fetching profile options:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profile options' 
    });
    return;
  }
});

// Get specific profile by ID (only their own) - with complete profile
router.get('/profile/:userId', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.id;
    
    // Healthcare users can only access their own profile
    const hasAccess = await HealthcareService.validateUserAccess(currentUserId, userId);
    
    if (!hasAccess) {
      res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only view your own profile.' 
      });
      return;
    }

    const userWithProfile = await HealthcareService.getCompleteProfile(userId);
    
    if (!userWithProfile) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return;
    }

    const sanitizedData = HealthcareService.sanitizeCompleteUserData(userWithProfile);

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

/**
 * Generate presigned URL for image upload
 */
router.post('/presigned-url', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, fileName, contentType } = req.body;

    // Validate required fields
    if (!userId || !fileName || !contentType) {
      res.status(400).json({
        error: 'Missing required fields: userId, fileName, contentType'
      });
      return
    }

    // Validate file type
    if (!contentType.startsWith('image/')) {
      res.status(400).json({
        error: 'Only image files are allowed'
      });
      return
    }

    const result = await S3Service.generatePresignedUploadUrl(
      userId,
      fileName,
      contentType
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({
      error: 'Failed to generate upload URL',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get public URL from S3 key
 */
router.post('/public-url', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageKey } = req.body;

    if (!imageKey) {
      res.status(400).json({
        error: 'Missing imageKey'
      });
      return
    }

    const publicUrl = S3Service.getPublicUrl(imageKey);

    res.json({
      success: true,
      data: { publicUrl }
    });
  } catch (error) {
    console.error('Error getting public URL:', error);
    res.status(500).json({
      error: 'Failed to get public URL'
    });
  }
});

router.get('/profile/bank-details', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const bankDetails = await HealthcareService.getBankDetails(userId);

    res.json({
      success: true,
      data: bankDetails
    });
    return;
  } catch (error) {
    console.error('Error in get bank details route:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch bank details' 
    });
    return;
  }
});

// Create bank details
router.post('/profile/bank-details', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const bankData: CreateBankDetailsData = req.body;
    
    // Validate required fields
    const requiredFields = ['accountName', 'sortCode', 'accountNumber'];
    const missingFields = requiredFields.filter(field => !bankData[field as keyof CreateBankDetailsData]);
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
      return;
    }

    // Validate bank details
    const validationErrors = HealthcareService.validateBankDetails(bankData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    const createdBankDetails = await HealthcareService.createBankDetails(userId, bankData);

    res.status(201).json({
      success: true,
      message: 'Bank details created successfully',
      data: createdBankDetails
    });
    return;
  } catch (error) {
    console.error('Error in create bank details route:', error);
    
    if (error instanceof Error && error.message.includes('already exist')) {
      res.status(409).json({ 
        success: false,
        error: error.message 
      });
      return;
    }

    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create bank details' 
    });
    return;
  }
});

// Update bank details
router.put('/profile/bank-details', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const updateData: Partial<CreateBankDetailsData> = req.body;
    
    // Validate input
    if (!updateData || Object.keys(updateData).length === 0) {
      res.status(400).json({ 
        success: false,
        error: 'No update data provided' 
      });
      return;
    }

    // Validate bank details
    const validationErrors = HealthcareService.validateBankDetails(updateData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    const updatedBankDetails = await HealthcareService.updateBankDetails(userId, updateData);

    res.json({
      success: true,
      message: 'Bank details updated successfully',
      data: updatedBankDetails
    });
    return;
  } catch (error) {
    console.error('Error in update bank details route:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update bank details' 
    });
    return;
  }
});

// Delete bank details (GDPR compliance)
router.delete('/profile/bank-details', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const deleted = await HealthcareService.deleteBankDetails(userId);
    
    if (!deleted) {
      res.status(404).json({ 
        success: false,
        error: 'Bank details not found' 
      });
      return;
    }

    res.json({
      success: true,
      message: 'Bank details deleted successfully'
    });
    return;
  } catch (error) {
    console.error('Error in delete bank details route:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete bank details' 
    });
    return;
  }
});

// Get complete profile with bank details (admin/special access only)
router.get('/profile/complete-with-bank', healthcareOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const userWithProfile = await HealthcareService.getCompleteProfileWithBankDetails(userId);
    
    if (!userWithProfile) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return;
    }

    // Sanitize the response (remove cognitoId)
    const sanitizedData = HealthcareService.sanitizeCompleteUserData(userWithProfile);

    res.json({
      success: true,
      data: sanitizedData
    });
    return;
  } catch (error) {
    console.error('Error in get complete profile with bank route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch complete profile with bank details' 
    });
    return;
  }
});

export default router;