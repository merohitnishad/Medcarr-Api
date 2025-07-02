// routes/user/jobPost/index.ts - Clean, simplified version
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware.js';
import { requireNonHealthCare, requireHealthcareRole, requireOrganizationRole } from '../../middlewares/roleAuth.js';
import { JobPostService, CreateJobPostData, UpdateJobPostData, JobPostFilters } from './jobPostService.js';
import multer from 'multer';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';



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
router.get('/', requireHealthcareRole, async (req: AuthenticatedRequest, res: Response) => {
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

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/csv'
    ];
    
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

// Parse bulk job file and validate data
router.post('/bulk/parse', requireOrganizationRole, upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
      return;
    }

    const file = req.file;
    let jsonData: any[] = [];

    try {
      // Parse based on file type
      if (file.mimetype.includes('csv') || file.originalname.endsWith('.csv')) {
        // Parse CSV
        const csvText = file.buffer.toString('utf-8');
        const parsed = Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim()
        });

        if (parsed.errors.length > 0) {
          res.status(400).json({
            success: false,
            error: 'CSV parsing error',
            details: parsed.errors
          });
          return;
        }

        jsonData = parsed.data;
      } else {
        // Parse Excel
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        
        if (!sheetName) {
          res.status(400).json({
            success: false,
            error: 'No sheets found in Excel file'
          });
          return;
        }

        const worksheet = workbook.Sheets[sheetName];
        jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      }

      if (jsonData.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No data found in file'
        });
        return;
      }

      if (jsonData.length > 100) {
        res.status(400).json({
          success: false,
          error: 'Maximum 100 jobs allowed per bulk upload'
        });
        return;
      }

      // Validate and parse the data
      const validationResult = await JobPostService.parseBulkJobData(jsonData);

      res.json({
        success: true,
        message: 'File parsed successfully',
        data: {
          fileName: file.originalname,
          fileSize: file.size,
          ...validationResult
        }
      });
      return;

    } catch (parseError) {
      console.error('File parsing error:', parseError);
      res.status(400).json({
        success: false,
        error: 'Failed to parse file',
        details: parseError instanceof Error ? parseError.message : 'Unknown parsing error'
      });
      return;
    }

  } catch (error) {
    console.error('Error in bulk parse route:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process file'
    });
    return;
  }
});

// Create bulk jobs from validated data
router.post('/bulk/create', requireOrganizationRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { validJobs } = req.body;

    if (!validJobs || !Array.isArray(validJobs) || validJobs.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid job data provided'
      });
      return;
    }

    if (validJobs.length > 100) {
      res.status(400).json({
        success: false,
        error: 'Maximum 100 jobs allowed per bulk upload'
      });
      return;
    }

    // Create bulk jobs
    const result = await JobPostService.createBulkJobs(userId, validJobs);

    res.json({
      success: true,
      message: `Bulk job creation completed. ${result.summary.successfulJobs} jobs created successfully.`,
      data: result
    });
    return;

  } catch (error) {
    console.error('Error in bulk create route:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create bulk jobs'
    });
    return;
  }
});

// Get bulk job template
router.get('/bulk/template', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const format = req.query.format as string || 'csv';

    // Get available options for reference
    const [careNeeds, languages, preferences] = await Promise.all([
      JobPostService.getAvailableCareNeeds(),
      JobPostService.getAvailableLanguages(),
      JobPostService.getAvailablePreferences()
    ]);

    // Sample data with all required fields
    const sampleData = [
      {
        age: 75,
        relationship: 'Mother',
        gender: 'female',
        title: 'Daily Care for Elderly Mother',
        postcode: 'SW1A 1AA',
        address: '123 Main Street, London',
        jobDate: '2025-07-15',
        startTime: '09:00',
        endTime: '17:00',
        shiftLength: 8,
        overview: 'Looking for a caring and experienced caregiver to help with daily activities for my elderly mother. She needs assistance with personal care, meal preparation, and companionship.',
        caregiverGender: 'female',
        type: 'oneDay',
        paymentType: 'hourly',
        paymentCost: 2000, // in cents
        careNeeds: 'Personal Care,Companionship',
        languages: 'English',
        preferences: 'Non-smoker,Pet-friendly'
      },
      {
        age: 82,
        relationship: 'Father',
        gender: 'male',
        title: 'Weekly Care for Father with Dementia',
        postcode: 'M1 1AA',
        address: '456 Oak Avenue, Manchester',
        jobDate: '2025-07-20',
        startTime: '10:00',
        endTime: '14:00',
        shiftLength: 4,
        overview: 'Seeking a patient and understanding caregiver for my father who has early-stage dementia. Need help with medication reminders, light housekeeping, and social interaction.',
        caregiverGender: 'male',
        type: 'oneDay',
        paymentType: 'fixed',
        paymentCost: 8000, // in cents
        careNeeds: 'Dementia Care,Medication Management',
        languages: 'English,Spanish',
        preferences: 'Non-smoker'
      }
    ];

    if (format === 'xlsx') {
      // Create Excel file
      const workbook = XLSX.utils.book_new();
      
      // Create sample data sheet
      const sampleSheet = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(workbook, sampleSheet, 'Sample Jobs');
      
            // Create comprehensive reference sheet with all options
            const referenceData = [
              { category: 'RELATIONSHIP OPTIONS', value: '', description: 'Choose from the following relationship options:' },
              { category: '', value: 'Mother', description: 'Care for my mother' },
              { category: '', value: 'Father', description: 'Care for my father' },
              { category: '', value: 'Myself', description: 'Care for myself' },
              { category: '', value: 'Grandmother', description: 'Care for my grandmother' },
              { category: '', value: 'Grandfather', description: 'Care for my grandfather' },
              { category: '', value: 'Spouse', description: 'Care for my spouse/partner' },
              { category: '', value: 'Other', description: 'Other family member or friend' },
              
              { category: 'GENDER OPTIONS', value: '', description: 'Choose from the following gender options:' },
              { category: '', value: 'male', description: 'Male' },
              { category: '', value: 'female', description: 'Female' },
              
              { category: 'PAYMENT TYPE OPTIONS', value: '', description: 'Choose from the following payment types:' },
              { category: '', value: 'hourly', description: 'Pay per hour worked' },
              { category: '', value: 'fixed', description: 'Fixed amount for the entire job' },
              
              { category: 'AVAILABLE CARE NEEDS', value: '', description: 'Use these exact names, comma-separated:' },
              ...careNeeds.map(cn => ({ category: '', value: cn.name, description: `ID: ${cn.id}` })),
              { category: '', value: '', description: '' },
              
              { category: 'AVAILABLE LANGUAGES', value: '', description: 'Use these exact names, comma-separated:' },
              ...languages.map(l => ({ category: '', value: l.name, description: `ID: ${l.id}` })),
              { category: '', value: '', description: '' },
              
              { category: 'AVAILABLE PREFERENCES', value: '', description: 'Use these exact names, comma-separated:' },
              ...preferences.map(p => ({ category: '', value: p.name, description: `ID: ${p.id}` })),
              { category: '', value: '', description: '' },
            ];
      
      const referenceSheet = XLSX.utils.json_to_sheet(referenceData);
      XLSX.utils.book_append_sheet(workbook, referenceSheet, 'Reference Guide');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=bulk_job_template.xlsx');
      res.send(buffer);
      return;
    } else {
      // Create CSV with helpful header comments
      const csvHeader = [
        '# Bulk Job Upload Template',
        '# Field Descriptions:',
        '# age: Age of person receiving care (0-120, required)',
        '# relationship: Your relationship (Mother, Father, Myself, Grandmother, Grandfather, Spouse, Other)',
        '# gender: Gender of person receiving care (male, female, required)',
        '# title: Job title/summary (minimum 5 characters, required)',
        '# postcode: Postcode where care needed (required)',
        '# address: Full address (minimum 10 characters, required)',
        '# jobDate: Date needed (YYYY-MM-DD format, future dates only, required)',
        '# startTime: Start time (HH:MM 24-hour format, required)',
        '# endTime: End time (HH:MM 24-hour format, required)',
        '# shiftLength: Duration in hours (1-24, must match start/end time, required)',
        '# overview: Detailed description (minimum 20 characters, required)',
        '# caregiverGender: Preferred caregiver gender (male, female, required)',
        '# type: Always "oneDay" for bulk uploads (required)',
        '# paymentType: hourly or fixed (required)',
        '# paymentCost: Amount in pence - £20.00 = 2000 (required)',
        '# careNeeds: Comma-separated care needs (optional)',
        '# languages: Comma-separated languages (optional)',
        '# preferences: Comma-separated preferences (optional)',
        '#',
        '# Example relationships: Mother, Father, Myself, Grandmother, Grandfather, Spouse, Other',
        '# Example care needs: Personal Care, Companionship, Dementia Care, Medication Management',
        '# Example languages: English, Spanish, French, German',
        '# Example preferences: Non-smoker, Pet-friendly, Experience with seniors',
        '#'
      ].join('\n') + '\n';
      
      const csv = Papa.unparse(sampleData);
      const csvWithHeader = csvHeader + csv;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=bulk_job_template.csv');
      res.send(csvWithHeader);
      return;
    }

  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate template'
    });
    return;
  }
});

// Get available options for bulk job creation (care needs, languages, preferences)
router.get('/bulk/options', requireOrganizationRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [careNeeds, languages, preferences] = await Promise.all([
      JobPostService.getAvailableCareNeeds(),
      JobPostService.getAvailableLanguages(),
      JobPostService.getAvailablePreferences()
    ]);

    res.json({
      success: true,
      data: {
        careNeeds: careNeeds.map(cn => cn.name),
        languages: languages.map(l => l.name),
        preferences: preferences.map(p => p.name),
        genderOptions: ['male', 'female'],
        jobTypeOptions: ['oneDay', 'weekly'],
        paymentTypeOptions: ['hourly', 'fixed']
      }
    });
    return;

  } catch (error) {
    console.error('Error fetching bulk options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch options'
    });
    return;
  }
});

export default router;