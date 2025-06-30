// routes/user/jobPost/index.ts
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware.js';
import { requireNonHealthCare } from '../../middlewares/roleAuth.js';
import { JobPostService, CreateJobPostData, UpdateJobPostData, JobPostFilters } from './jobPostService.js';

const router = Router();

// Create a new job post
router.post('/createJob', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const jobPostData: CreateJobPostData = req.body;

    // Validate required fields
    const requiredFields = [ 'age', 'gender', 'title', 'postcode', 'address', 'startTime', 'endTime', 'shiftLength', 'overview', 'caregiverGender', 'type', 'paymentType', 'paymentCost'];
    const missingFields = requiredFields.filter(field => !jobPostData[field as keyof CreateJobPostData]);
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
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

    const createdJobPost = await JobPostService.createJobPost(userId, jobPostData);

    res.status(201).json({
      success: true,
      message: 'Job post created successfully',
      data: createdJobPost
    });
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

// Get a specific job post by ID
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

// Get all job posts with pagination and filters
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

// Get current user's job posts
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

// Update a job post
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

// Close a job post (change status to closed)
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
    }
    else {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to close job post' 
      });
    }
    return;
  }
});

export default router;
