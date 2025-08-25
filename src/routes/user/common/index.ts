// routes/user/organization/index.ts
import { Router, Response } from "express";
import { AuthenticatedRequest } from "../../../middlewares/authMiddleware.js";
import { everyone } from "../../../middlewares/roleAuth.js";
import { CommonService } from "./commonService.js";

const router = Router();

// Get organization user's basic profile (just user table data)
router.get(
  "/getUser",
  everyone,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const user = await CommonService.getBasicProfile(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: "Profile not found",
        });
        return;
      }

      const sanitizedUser = CommonService.sanitizeUserData(user);

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

export default router;
