import ActivityLogModel, {
  type IActivityLog,
  type EntityType,
  type ActionType,
  type IFieldChange,
} from "../models/activity-log.model.js";
import logger from "../lib/logger.js";

interface LogActivityParams {
  projectId: string;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  action: ActionType;
  userId: string;
  userName: string;
  changes?: IFieldChange[];
  description: string;
}

interface GetActivitiesOptions {
  limit?: number;
  page?: number;
  entityType?: EntityType;
}

class ActivityLogService {
  async logActivity(params: LogActivityParams): Promise<void> {
    try {
      await ActivityLogModel.create({
        projectId: params.projectId,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        action: params.action,
        userId: params.userId,
        userName: params.userName,
        changes: params.changes ?? [],
        description: params.description,
      });
    } catch (error) {
      // Don't throw — activity logging should never break the main flow
      logger.error("Failed to log activity", error as Error);
    }
  }

  async getProjectActivities(
    projectId: string,
    options: GetActivitiesOptions = {},
  ) {
    const { limit = 50, page = 1, entityType } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { projectId };
    if (entityType) {
      filter.entityType = entityType;
    }

    const [activities, total] = await Promise.all([
      ActivityLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLogModel.countDocuments(filter),
    ]);

    return {
      activities: activities.map((a) => ({
        id: a._id.toString(),
        projectId: a.projectId,
        entityType: a.entityType,
        entityId: a.entityId,
        entityName: a.entityName,
        action: a.action,
        userId: a.userId,
        userName: a.userName,
        changes: a.changes,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}

const activityLogService = new ActivityLogService();
export default activityLogService;
