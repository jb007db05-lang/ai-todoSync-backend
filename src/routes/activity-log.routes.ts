import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { isProjectMember } from "../middleware/project-access.middleware.js";
import activityLogController from "../controllers/activity-log.controller.js";

class ActivityLogRoutes implements Routes {
  public path = "/api/projects/:projectId/activities";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.get("/", isProjectMember, activityLogController.getActivities);
    this.router.get(
      "/retention-policy",
      isProjectMember,
      activityLogController.getRetentionPolicy,
    );
    this.router.patch(
      "/retention-policy",
      isProjectMember,
      activityLogController.updateRetentionPolicy,
    );
    this.router.get(
      "/verify-chain",
      isProjectMember,
      activityLogController.verifyAuditChain,
    );
  }
}

export default ActivityLogRoutes;
