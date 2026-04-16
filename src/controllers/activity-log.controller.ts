import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth.js";
import activityLogService from "../services/activity-log.service.js";
import type { EntityType } from "../models/activity-log.model.js";

class ActivityLogController {
  public getActivities = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const projectId =
        typeof req.params.projectId === "string" ? req.params.projectId : "";
      const limitStr =
        typeof req.query.limit === "string" ? req.query.limit : undefined;
      const pageStr =
        typeof req.query.page === "string" ? req.query.page : undefined;
      const entityTypeStr =
        typeof req.query.entityType === "string"
          ? req.query.entityType
          : undefined;

      const result = await activityLogService.getProjectActivities(projectId, {
        limit: limitStr ? parseInt(limitStr, 10) : 50,
        page: pageStr ? parseInt(pageStr, 10) : 1,
        entityType: entityTypeStr as EntityType | undefined,
      });

      res.json(result);
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

const activityLogController = new ActivityLogController();
export default activityLogController;
