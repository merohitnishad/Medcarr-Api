// routes/jobApplication/index.ts - Unified job application routes for all user types
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware.js';
import { requireHealthcareRole, requireNonAdmin, requireNonHealthCare } from '../../middlewares/roleAuth.js';
import { 
  JobApplicationService, 
  CreateApplicationData,
  UpdateApplicationStatusData,
  CancelApplicationData,
  CheckinData,
  CheckoutData,
  CompleteJobData,
  ReportData,
  ApplicationFilters 
} from './jobApplicationService.js';

const router = Router();

// =============================
// HEALTHCARE WORKER ROUTES
// =============================

// Apply for a job
router.post('/apply', requireHealthcareRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const healthcareUserId = req.user!.id;
    const applicationData: CreateApplicationData = {
      ...req.body,
      healthcareUserId
    };

    // Validate required fields
    if (!applicationData.jobPostId) {
      res.status(400).json({
        success: false,
        error: 'Job post ID is required'
      });
      return;
    }

    const application = await JobApplicationService.applyForJob(applicationData);

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: application
    });
    return;
  } catch (error) {
    console.error('Error in apply for job route:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit application'
    });
    return;
  }
});

// Get healthcare worker's applications
router.get('/my-applications', requireHealthcareRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const healthcareUserId = req.user!.id;
    const filters: ApplicationFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      status: req.query.status as string,
    };

    const result = await JobApplicationService.getHealthcareApplications(healthcareUserId, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get my applications route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch applications'
    });
    return;
  }
});

// Check in to job (Healthcare only)
router.patch('/:applicationId/checkin', requireHealthcareRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const healthcareUserId = req.user!.id;
    const checkinData: CheckinData = req.body;

    // Validate required fields
    if (!checkinData.checkinLocation) {
      res.status(400).json({
        success: false,
        error: 'Check-in location is required'
      });
      return;
    }

    const updatedApplication = await JobApplicationService.checkinToJob(
      applicationId,
      healthcareUserId,
      checkinData
    );

    res.json({
      success: true,
      message: 'Checked in successfully',
      data: updatedApplication
    });
    return;
  } catch (error) {
    console.error('Error in checkin route:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check in'
    });
    return;
  }
});

// Check out from job (Healthcare only)
router.patch('/:applicationId/checkout', requireHealthcareRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const healthcareUserId = req.user!.id;
    const checkoutData: CheckoutData = req.body;

    // Validate required fields
    if (!checkoutData.checkoutLocation) {
      res.status(400).json({
        success: false,
        error: 'Check-out location is required'
      });
      return;
    }

    const updatedApplication = await JobApplicationService.checkoutFromJob(
      applicationId,
      healthcareUserId,
      checkoutData
    );

    res.json({
      success: true,
      message: 'Checked out successfully',
      data: updatedApplication
    });
    return;
  } catch (error) {
    console.error('Error in checkout route:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check out'
    });
    return;
  }
});

// Get healthcare worker statistics
router.get('/healthcare/stats', requireHealthcareRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const stats = await JobApplicationService.getApplicationStats(userId, 'healthcare');

    res.json({
      success: true,
      data: stats
    });
    return;
  } catch (error) {
    console.error('Error in get healthcare stats route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch application statistics'
    });
    return;
  }
});

// =============================
// JOB POSTER ROUTES
// =============================

// Get applications for a specific job
router.get('/my-job/:jobPostId', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobPostId } = req.params;
    const userId = req.user!.id;
    const filters: ApplicationFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      status: req.query.status as string,
    };

    const result = await JobApplicationService.getJobApplications(jobPostId, userId, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get job applications route:', error);
    if (error instanceof Error && error.message === 'Job post not found or access denied') {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch applications'
      });
    }
    return;
  }
});

// Get all applications for all my jobs (dashboard view)
router.get('/my-jobs/applications', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const filters: ApplicationFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      status: req.query.status as string,
    };

    const result = await JobApplicationService.getAllUserJobApplications(userId, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get all my job applications route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch applications'
    });
    return;
  }
});

// Accept or reject application (Job poster only)
router.patch('/:applicationId/status', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user!.id;
    const statusData: UpdateApplicationStatusData = req.body;

    // Validate required fields
    if (!statusData.status || !['accepted', 'rejected'].includes(statusData.status)) {
      res.status(400).json({
        success: false,
        error: 'Valid status (accepted or rejected) is required'
      });
      return;
    }

    const updatedApplication = await JobApplicationService.updateApplicationStatus(
      applicationId,
      userId,
      statusData
    );

    res.json({
      success: true,
      message: `Application ${statusData.status} successfully`,
      data: updatedApplication
    });
    return;
  } catch (error) {
    console.error('Error in update application status route:', error);
    if (error instanceof Error && (error.message === 'Application not found' || error.message === 'Access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update application status'
      });
    }
    return;
  }
});

// Mark job as complete (Job poster only)
router.patch('/:applicationId/complete', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user!.id;
    const completeData: CompleteJobData = req.body;

    const updatedApplication = await JobApplicationService.completeJob(
      applicationId,
      userId,
      completeData
    );

    res.json({
      success: true,
      message: 'Job marked as complete successfully',
      data: updatedApplication
    });
    return;
  } catch (error) {
    console.error('Error in complete job route:', error);
    if (error instanceof Error && (error.message === 'Application not found' || error.message === 'Access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete job'
      });
    }
    return;
  }
});

// Get job poster statistics
router.get('/poster/stats', requireNonHealthCare, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const stats = await JobApplicationService.getApplicationStats(userId, 'poster');

    res.json({
      success: true,
      data: stats
    });
    return;
  } catch (error) {
    console.error('Error in get poster stats route:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch application statistics'
    });
    return;
  }
});

// =============================
// SHARED ROUTES (Both user types)
// =============================


// Get applications for a specific job
router.get('/job/:jobPostId/:jobPosterId', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobPostId, jobPoserId } = req.params;
    const userId = req.user!.id;
    const filters: ApplicationFilters = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      status: req.query.status as string,
    };

    const result = await JobApplicationService.getJobApplications(jobPostId, jobPoserId, filters);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
    return;
  } catch (error) {
    console.error('Error in get job applications route:', error);
    if (error instanceof Error && error.message === 'Job post not found or access denied') {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch applications'
      });
    }
    return;
  }
});

// Get specific application details
router.get('/:applicationId',requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user!.id;

    const application = await JobApplicationService.getApplication(applicationId, userId);

    res.json({
      success: true,
      data: application
    });
    return;
  } catch (error) {
    console.error('Error in get application route:', error);
    if (error instanceof Error && (error.message === 'Application not found' || error.message === 'Access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch application'
      });
    }
    return;
  }
});

// Cancel application (Both user types)
router.patch('/:applicationId/cancel',requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user!.id;
    const cancelData: CancelApplicationData = req.body;

    // Validate required fields
    if (!cancelData.cancellationReason) {
      res.status(400).json({
        success: false,
        error: 'Cancellation reason is required'
      });
      return;
    }

    const updatedApplication = await JobApplicationService.cancelApplication(
      applicationId,
      userId,
      cancelData
    );

    res.json({
      success: true,
      message: 'Application cancelled successfully',
      data: updatedApplication
    });
    return;
  } catch (error) {
    console.error('Error in cancel application route:', error);
    if (error instanceof Error && (error.message === 'Application not found' || error.message === 'Access denied')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel application'
      });
    }
    return;
  }
});

// Report user (Both user types)
router.post('/:applicationId/report', requireNonAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const reportedBy = req.user!.id;
    const reportData: ReportData = req.body;

    // Validate required fields
    if (!reportData.reportReason || !reportData.reportMessage) {
      res.status(400).json({
        success: false,
        error: 'Report reason and message are required'
      });
      return;
    }

    const updatedApplication = await JobApplicationService.reportUser(
      applicationId,
      reportedBy,
      reportData
    );

    res.json({
      success: true,
      message: 'Report submitted successfully',
      data: updatedApplication
    });
    return;
  } catch (error) {
    console.error('Error in report route:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit report'
    });
    return;
  }
});

export default router;