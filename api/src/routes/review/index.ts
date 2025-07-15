import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware.js';
import { 
  ReviewService, 
  CreateReviewData, 
  UpdateReviewData 
} from './reviewService.js';

const router = Router();

// Create a new review for a completed job
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const reviewData: CreateReviewData = req.body;

    // Validate required fields
    const requiredFields = [
      'jobPostId', 'healthcareProviderId', 'rating', 'title', 'reviewText',
      'professionalismRating', 'punctualityRating', 'qualityOfCareRating', 
      'communicationRating', 'wouldRecommend'
    ];
    
    const missingFields = requiredFields.filter(field => 
      reviewData[field as keyof CreateReviewData] === undefined || 
      reviewData[field as keyof CreateReviewData] === null
    );
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
      return;
    }

    // Validate review data
    const validationErrors = ReviewService.validateReviewData(reviewData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    // Check if user can review this job
    const canReview = await ReviewService.canReviewJob(userId, reviewData.jobPostId);
    if (!canReview) {
      res.status(403).json({ 
        success: false,
        error: 'You cannot review this job or review already exists' 
      });
      return;
    }

    const createdReview = await ReviewService.createReview(userId, reviewData);

    res.status(201).json({
      success: true,
      message: 'Review created successfully',
      data: createdReview
    });
    return;
  } catch (error) {
    console.error('Error in create review route:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create review' 
    });
    return;
  }
});

// Get a specific review by ID
router.get('/:reviewId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reviewId } = req.params;
    const currentUserId = req.user?.id;

    const review = await ReviewService.getReviewById(reviewId, currentUserId);

    res.json({
      success: true,
      data: review
    });
    return;
  } catch (error) {
    console.error('Error in get review route:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ 
        success: false,
        error: 'Review not found' 
      });
      return;
    }
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch review' 
    });
    return;
  }
});

// Update a review (only by original reviewer within time limit)
router.put('/:reviewId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user!.id;
    const updateData: UpdateReviewData = req.body;

    // Validate input
    if (!updateData || Object.keys(updateData).length === 0) {
      res.status(400).json({ 
        success: false,
        error: 'No update data provided' 
      });
      return;
    }

    // Validate review data
    const validationErrors = ReviewService.validateReviewData(updateData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    const updatedReview = await ReviewService.updateReview(reviewId, userId, updateData);

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: updatedReview
    });
    return;
  } catch (error) {
    console.error('Error in update review route:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ 
        success: false,
        error: 'Review not found or access denied' 
      });
      return;
    }
    if (error instanceof Error && error.message.includes('no longer be edited')) {
      res.status(403).json({ 
        success: false,
        error: error.message 
      });
      return;
    }
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update review' 
    });
    return;
  }
});

// Delete a review (soft delete)
router.delete('/:reviewId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    const deleted = await ReviewService.deleteReview(reviewId, userId, isAdmin);
    
    if (!deleted) {
      res.status(404).json({ 
        success: false,
        error: 'Review not found or access denied' 
      });
      return;
    }

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
    return;
  } catch (error) {
    console.error('Error in delete review route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete review' 
    });
    return;
  }
});

// Healthcare provider responds to a review
router.post('/:reviewId/respond', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user!.id;
    const { response } = req.body;

    if (!response || typeof response !== 'string') {
      res.status(400).json({ 
        success: false,
        error: 'Response text is required' 
      });
      return;
    }

    // Only healthcare providers can respond
    if (req.user!.role !== 'healthcare') {
      res.status(403).json({ 
        success: false,
        error: 'Only healthcare providers can respond to reviews' 
      });
      return;
    }

    const updatedReview = await ReviewService.respondToReview(reviewId, userId, response);

    res.json({
      success: true,
      message: 'Response added successfully',
      data: updatedReview
    });
    return;
  } catch (error) {
    console.error('Error in respond to review route:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ 
        success: false,
        error: 'Review not found or access denied' 
      });
      return;
    }
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to respond to review' 
    });
    return;
  }
});

// Vote on review helpfulness
router.post('/:reviewId/vote', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user!.id;
    const { isHelpful } = req.body;

    if (typeof isHelpful !== 'boolean') {
      res.status(400).json({ 
        success: false,
        error: 'isHelpful must be a boolean value' 
      });
      return;
    }

    await ReviewService.voteOnReview(reviewId, userId, isHelpful);

    res.json({
      success: true,
      message: 'Vote recorded successfully'
    });
    return;
  } catch (error) {
    console.error('Error in vote on review route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to record vote' 
    });
    return;
  }
});

// Get reviews for a healthcare provider
router.get('/healthcare/:healthcareProviderId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { healthcareProviderId } = req.params;
    const currentUserId = req.user?.id;
    const { 
      page = 1, 
      limit = 10, 
      includePrivate = false 
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Only healthcare provider themselves or admin can see private reviews
    const canSeePrivate = currentUserId === healthcareProviderId || req.user?.role === 'admin';

    const result = await ReviewService.getHealthcareProviderReviews(healthcareProviderId, {
      limit: limitNum,
      offset,
      includePrivate: includePrivate === 'true' && canSeePrivate,
      currentUserId
    });

    res.json({
      success: true,
      data: {
        reviews: result.reviews,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum)
        }
      }
    });
    return;
  } catch (error) {
    console.error('Error in get healthcare provider reviews route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch reviews' 
    });
    return;
  }
});

// Get review statistics for a healthcare provider
router.get('/healthcare/:healthcareProviderId/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { healthcareProviderId } = req.params;

    const stats = await ReviewService.getReviewStats(healthcareProviderId);

    res.json({
      success: true,
      data: stats
    });
    return;
  } catch (error) {
    console.error('Error in get review stats route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch review statistics' 
    });
    return;
  }
});

// Get reviews by a specific reviewer (individual/organization)
router.get('/reviewer/:reviewerId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reviewerId } = req.params;
    const currentUserId = req.user!.id;
    const { page = 1, limit = 10 } = req.query;

    // Users can only see their own reviews unless admin
    if (currentUserId !== reviewerId && req.user!.role !== 'admin') {
      res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only view your own reviews.' 
      });
      return;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const result = await ReviewService.getReviewsByReviewer(reviewerId, {
      limit: limitNum,
      offset
    });

    res.json({
      success: true,
      data: {
        reviews: result.reviews,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum)
        }
      }
    });
    return;
  } catch (error) {
    console.error('Error in get reviewer reviews route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch reviews' 
    });
    return;
  }
});

// Check if user can review a specific job
router.get('/can-review/:jobPostId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobPostId } = req.params;
    const userId = req.user!.id;

    const canReview = await ReviewService.canReviewJob(userId, jobPostId);

    res.json({
      success: true,
      data: { canReview }
    });
    return;
  } catch (error) {
    console.error('Error in can review route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check review eligibility' 
    });
    return;
  }
});

export default router;