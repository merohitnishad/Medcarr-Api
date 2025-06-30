// routes/user/jobPost/index.ts - Clean, simplified version
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware.js';
import { requireNonHealthCare } from '../../middlewares/roleAuth.js';
import { JobPostService, CreateJobPostData, UpdateJobPostData, JobPostFilters } from './jobPostService.js';

const router = Router();

// Create a new job post (single or recurring)
router.post('/createJob', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const jobPostData: CreateJobPostData = req.body;

    // Validate required fields
    const requiredFields = [
      'age', 'gender', 'title', 'postcode', 'address', 
      'jobDate', 'startTime', 'endTime', 'shiftLength', 
      'overview', 'caregiverGender', 'type', 'paymentType', 'paymentCost'
    ];
    
    const missingFields = requiredFields.filter(field => 
      !jobPostData[field as keyof CreateJobPostData]
    );
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
      return;
    }

    // Additional validation for recurring jobs
    if (jobPostData.isRecurring) {
      if (!jobPostData.recurringData) {
        res.status(400).json({
          success: false,
          error: 'Recurring data is required for recurring jobs'
        });
        return;
      }

      const { selectedDays, endDate } = jobPostData.recurringData;
      
      if (!selectedDays || selectedDays.length === 0) {
        res.status(400).json({
          success: false,
          error: 'At least one day must be selected for recurring jobs'
        });
        return;
      }

      if (!endDate || new Date(endDate) <= new Date(jobPostData.jobDate)) {
        res.status(400).json({
          success: false,
          error: 'End date must be after the start date'
        });
        return;
      }

      // Validate that job date is one of the selected days
      const jobDate = new Date(jobPostData.jobDate);
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const jobDayName = dayNames[jobDate.getDay()];
      
      if (!selectedDays.includes(jobDayName)) {
        res.status(400).json({
          success: false,
          error: `Job date (${jobDayName}) must be one of the selected recurring days`
        });
        return;
      }
    }

    // Validate job date is in the future
    const jobDate = new Date(jobPostData.jobDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (jobDate < today) {
      res.status(400).json({
        success: false,
        error: 'Job date must be in the future'
      });
      return;
    }

    // Validate job post data
    const validationErrors = JobPostService.validateJobPostData(jobPostData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    // Validate care need IDs if provided
    if (jobPostData.careNeedIds && jobPostData.careNeedIds.length > 0) {
      const validCareNeeds = await JobPostService.validateCareNeedIds(jobPostData.careNeedIds);
      if (!validCareNeeds) {
        res.status(400).json({
          success: false,
          error: 'One or more care need IDs are invalid'
        });
        return;
      }
    }

    // Validate language IDs if provided
    if (jobPostData.languageIds && jobPostData.languageIds.length > 0) {
      const validLanguages = await JobPostService.validateLanguageIds(jobPostData.languageIds);
      if (!validLanguages) {
        res.status(400).json({
          success: false,
          error: 'One or more language IDs are invalid'
        });
        return;
      }
    }

    // Validate preference IDs if provided
    if (jobPostData.preferenceIds && jobPostData.preferenceIds.length > 0) {
      const validPreferences = await JobPostService.validatePreferenceIds(jobPostData.preferenceIds);
      if (!validPreferences) {
        res.status(400).json({
          success: false,
          error: 'One or more preference IDs are invalid'
        });
        return;
      }
    }

    const result = await JobPostService.createJobPost(userId, jobPostData);

    if (jobPostData.isRecurring) {
      res.status(201).json({
        success: true,
        message: `Recurring job posts created successfully. ${result.count} jobs created.`,
        data: result
      });
    } else {
      res.status(201).json({
        success: true,
        message: 'Job post created successfully',
        data: result
      });
    }
    return;
  } catch (error) {
    console.error('Error in create job post route:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create job post' 
    });
    return;
  }
});

// Get dropdown options for job creation
router.get('/options', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [careNeeds, languages, preferences] = await Promise.all([
      JobPostService.getAvailableCareNeeds(),
      JobPostService.getAvailableLanguages(),
      JobPostService.getAvailablePreferences()
    ]);

    res.json({
      success: true,
      data: {
        careNeeds,
        languages,
        preferences
      }
    });
    return;
  } catch (error) {
    console.error('Error fetching job options:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch job options' 
    });
    return;
  }
});

// Get all job posts with pagination and filters (shows individual jobs only)
router.get('/', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filters: JobPostFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      postcode: req.query.postcode as string,
      type: req.query.type as 'oneDay' | 'weekly',
      paymentType: req.query.paymentType as 'hourly' | 'fixed',
      caregiverGender: req.query.caregiverGender as 'male' | 'female',
    };

    // Remove undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key as keyof JobPostFilters] === undefined) {
        delete filters[key as keyof JobPostFilters];
      }
    });

    const result = await JobPostService.getAllJobPosts(filters);

    // Sanitize all job posts
    const sanitizedData = result.data.map((jobPost: any) => JobPostService.sanitizeJobPostData(jobPost));

    res.json({
      success: true,
      data: sanitizedData,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get all job posts route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch job posts' 
    });
    return;
  }
});

// Get current user's job posts (shows individual jobs only)
router.get('/my/posts', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const filters: JobPostFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
    };

    const result = await JobPostService.getUserJobPosts(userId, filters);

    // Sanitize all job posts
    const sanitizedData = result.data.map((jobPost: any) => JobPostService.sanitizeJobPostData(jobPost));

    res.json({
      success: true,
      data: sanitizedData,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get user job posts route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch your job posts' 
    });
    return;
  }
});

// Get a specific job post by ID (single, child, or parent - all treated the same)
router.get('/:jobPostId', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobPostId } = req.params;
    
    const jobPost = await JobPostService.getJobPost(jobPostId);
    
    if (!jobPost) {
      res.status(404).json({ 
        success: false,
        error: 'Job post not found' 
      });
      return;
    }

    const sanitizedData = JobPostService.sanitizeJobPostData(jobPost);

    res.json({
      success: true,
      data: sanitizedData
    });
    return;
  } catch (error) {
    console.error('Error in get job post route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch job post' 
    });
    return;
  }
});

// Update ANY job post (single, child, or parent - same logic for all)
router.put('/:jobPostId', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobPostId } = req.params;
    const userId = req.user!.id;
    const updateData: UpdateJobPostData = req.body;
    
    // Validate input
    if (!updateData || Object.keys(updateData).length === 0) {
      res.status(400).json({ 
        success: false,
        error: 'No update data provided' 
      });
      return;
    }

    // Validate job post data
    const validationErrors = JobPostService.validateJobPostData(updateData);
    if (validationErrors.length > 0) {
      res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    // Validate job date is in the future if provided
    if (updateData.jobDate) {
      const jobDate = new Date(updateData.jobDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (jobDate < today) {
        res.status(400).json({
          success: false,
          error: 'Job date must be in the future'
        });
        return;
      }
    }

    // Validate care need IDs if provided
    if (updateData.careNeedIds && updateData.careNeedIds.length > 0) {
      const validCareNeeds = await JobPostService.validateCareNeedIds(updateData.careNeedIds);
      if (!validCareNeeds) {
        res.status(400).json({
          success: false,
          error: 'One or more care need IDs are invalid'
        });
        return;
      }
    }

    // Validate language IDs if provided
    if (updateData.languageIds && updateData.languageIds.length > 0) {
      const validLanguages = await JobPostService.validateLanguageIds(updateData.languageIds);
      if (!validLanguages) {
        res.status(400).json({
          success: false,
          error: 'One or more language IDs are invalid'
        });
        return;
      }
    }

    // Validate preference IDs if provided
    if (updateData.preferenceIds && updateData.preferenceIds.length > 0) {
      const validPreferences = await JobPostService.validatePreferenceIds(updateData.preferenceIds);
      if (!validPreferences) {
        res.status(400).json({
          success: false,
          error: 'One or more preference IDs are invalid'
        });
        return;
      }
    }

    const updatedJobPost = await JobPostService.updateJobPost(jobPostId, userId, updateData);

    res.json({
      success: true,
      message: 'Job post updated successfully',
      data: updatedJobPost
    });
    return;
  } catch (error) {
    console.error('Error in update job post route:', error);
    if (error instanceof Error && error.message === 'Job post not found or access denied') {
      res.status(404).json({ 
        success: false,
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update job post' 
      });
    }
    return;
  }
});

// Close ANY job post (single, child, or parent - same logic for all)
router.patch('/:jobPostId/close', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobPostId } = req.params;
    const userId = req.user!.id;

    const updatedJobPost = await JobPostService.closeJobPost(jobPostId, userId);

    res.json({
      success: true,
      message: 'Job post closed successfully',
      data: updatedJobPost
    });
    return;
  } catch (error) {
    console.error('Error in close job post route:', error);
    if (error instanceof Error && error.message === 'Job post not found or access denied') {
      res.status(404).json({ 
        success: false,
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to close job post' 
      });
    }
    return;
  }
});

// Delete ANY job post (single, child, or parent - same logic for all)
router.delete('/:jobPostId', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobPostId } = req.params;
    const userId = req.user!.id;

    // Soft delete by setting isDeleted = true
    const deletedJobPost = await JobPostService.updateJobPost(jobPostId, userId, { 
      isDeleted: true 
    } as any);

    res.json({
      success: true,
      message: 'Job post deleted successfully',
      data: deletedJobPost
    });
    return;
  } catch (error) {
    console.error('Error in delete job post route:', error);
    if (error instanceof Error && error.message === 'Job post not found or access denied') {
      res.status(404).json({ 
        success: false,
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete job post' 
      });
    }
    return;
  }
});

export default router;