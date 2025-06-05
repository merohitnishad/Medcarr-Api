// routes/user/individual/index.ts
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../../middlewares/authMiddleware.js';
import { individualOnly, requireIndividualRole } from '../../../middlewares/roleAuth.js';
import { IndividualService } from './individualService.js';

const router = Router();

// Get individual user's own profile
router.get('/profile', individualOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const user = await IndividualService.getProfile(userId);
    
    if (!user) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return
    }

    const sanitizedUser = IndividualService.sanitizeUserData(user);

    res.json({
      success: true,
      data: sanitizedUser
    });
    return
  } catch (error) {
    console.error('Error in get profile route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profile' 
    });
    return
  }
});

// Update individual user's profile
router.put('/profile', individualOnly, async (req: AuthenticatedRequest, res: Response) => {
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

    const updatedUser = await IndividualService.updateProfile(userId, updateData);
    
    if (!updatedUser) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found or update failed' 
      });
      return;
    }

    const sanitizedUser = IndividualService.sanitizeUserData(updatedUser);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: sanitizedUser
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

// Get individual user's activity/history
// router.get('/activity', individualOnly, async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const userId = req.user!.id;
    
//     const activities = await IndividualService.getUserActivity(userId);

//     res.json({
//       success: true,
//       data: activities,
//       count: activities.length
//     });
//   } catch (error) {
//     console.error('Error in get activity route:', error);
//     res.status(500).json({ 
//       success: false,
//       error: 'Failed to fetch activity' 
//     });
//   }
// });

// Get specific profile by ID (only their own)
router.get('/profile/:userId', individualOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.id;
    
    // Individual users can only access their own profile
    const hasAccess = await IndividualService.validateUserAccess(currentUserId, userId);
    
    if (!hasAccess) {
      res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only view your own profile.' 
      });
      return;
    }

    const user = await IndividualService.getProfile(userId);
    
    if (!user) {
      res.status(404).json({ 
        success: false,
        error: 'Profile not found' 
      });
      return;
    }

    const sanitizedUser = IndividualService.sanitizeUserData(user);

    res.json({
      success: true,
      data: sanitizedUser
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