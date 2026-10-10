import {
  GuideExposureModel,
  MonthlyTargetedUserModel,
  type GuideExposureStatus,
  type IGuideExposureDocument,
} from "./model.js";
import {
  environmentFilter,
  type DataEnvironment,
} from "../../shared/environment.js";

interface ExposureIdentity {
  tenantId: string;
  sdkIntegrationId: string;
  environment?: DataEnvironment;
  guideId: string;
  userId?: string;
  sessionId?: string;
}

interface ExposurePatch {
  status?: GuideExposureStatus;
  stepId?: string;
  metadata?: Record<string, unknown>;
  incrementDisplay?: boolean;
}

class EngagementRepository {
  public findExposure(
    identity: ExposureIdentity,
  ): Promise<IGuideExposureDocument | null> {
    return GuideExposureModel.findOne(
      this.buildExposureFilter(identity),
    ).exec();
  }

  public findExposuresForGuide(
    sdkIntegrationId: string,
    guideId: string,
    environment: DataEnvironment = "live",
  ): Promise<IGuideExposureDocument[]> {
    return GuideExposureModel.find({
      sdkIntegrationId,
      guideId,
      ...environmentFilter(environment),
    }).exec();
  }

  /** Exposure totals for one guide, computed in the database. */
  public async summarizeExposuresForGuide(
    sdkIntegrationId: string,
    guideId: string,
    environment: DataEnvironment = "live",
  ): Promise<{
    exposures: number;
    impressions: number;
    completed: number;
    dismissed: number;
  }> {
    const [row] = await GuideExposureModel.aggregate<{
      exposures: number;
      impressions: number;
      completed: number;
      dismissed: number;
    }>([
      {
        $match: {
          sdkIntegrationId,
          guideId,
          ...environmentFilter(environment),
        },
      },
      {
        $group: {
          _id: null,
          exposures: { $sum: 1 },
          impressions: { $sum: { $ifNull: ["$displayCount", 0] } },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          dismissed: {
            $sum: { $cond: [{ $eq: ["$status", "dismissed"] }, 1, 0] },
          },
        },
      },
    ]).exec();
    return row ?? { exposures: 0, impressions: 0, completed: 0, dismissed: 0 };
  }

  public async upsertExposure(
    identity: ExposureIdentity,
    patch: ExposurePatch,
  ): Promise<IGuideExposureDocument> {
    const now = new Date();
    const set: Record<string, unknown> = {
      lastInteractionAt: now,
      metadata: patch.metadata ?? {},
    };

    // "shown" only describes a new exposure. Re-delivering a guide must not
    // reset progress (started) or outcomes (completed/dismissed): those drive
    // frequency caps and the orchestrator's active-experience lock.
    if (patch.status && patch.status !== "shown") {
      set.status = patch.status;
    }

    if (patch.stepId !== undefined) {
      set.currentStepId = patch.stepId;
    }

    if (patch.status === "started") {
      set.startedAt = now;
    }

    if (patch.status === "completed") {
      set.completedAt = now;
    }

    if (patch.status === "dismissed") {
      set.dismissedAt = now;
    }

    if (patch.incrementDisplay) {
      set.lastShownAt = now;
    }

    const setOnInsert: Record<string, unknown> = {
      tenantId: identity.tenantId,
      sdkIntegrationId: identity.sdkIntegrationId,
      guideId: identity.guideId,
      userId: identity.userId,
      sessionId: identity.sessionId,
      stepState: {},
      ...(patch.status === "shown" || !patch.status ? { status: "shown" } : {}),
    };
    // Sandbox exposures get their environment from the equality filter.
    if ((identity.environment ?? "live") === "live") {
      setOnInsert.environment = "live";
    }

    if (!patch.incrementDisplay) {
      setOnInsert.displayCount = 0;
    }

    const update: Record<string, unknown> = {
      $set: set,
      $setOnInsert: setOnInsert,
    };

    if (patch.incrementDisplay) {
      update.$inc = { displayCount: 1 };
    }

    const exposure = await GuideExposureModel.findOneAndUpdate(
      this.buildExposureFilter(identity),
      update,
      { upsert: true, new: true },
    ).exec();

    if (!exposure) {
      throw new Error("Exposure upsert failed");
    }

    return exposure;
  }

  public async incrementMtu(input: {
    tenantId: string;
    sdkIntegrationId: string;
    userId: string;
    guideId?: string;
    surveyId?: string;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    const month = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    const addToSet: Record<string, string> = {};

    if (input.guideId) {
      addToSet.guideIds = input.guideId;
    }

    if (input.surveyId) {
      addToSet.surveyIds = input.surveyId;
    }

    await MonthlyTargetedUserModel.findOneAndUpdate(
      { sdkIntegrationId: input.sdkIntegrationId, userId: input.userId, month },
      {
        $setOnInsert: {
          tenantId: input.tenantId,
          sdkIntegrationId: input.sdkIntegrationId,
          userId: input.userId,
          month,
          firstExposedAt: now,
        },
        $set: { lastExposedAt: now },
        $inc: { exposureCount: 1 },
        ...(Object.keys(addToSet).length > 0 ? { $addToSet: addToSet } : {}),
      },
      { upsert: true },
    ).exec();
  }

  public async countMtu(
    sdkIntegrationId: string,
    month: string,
  ): Promise<number> {
    return MonthlyTargetedUserModel.countDocuments({
      sdkIntegrationId,
      month,
    }).exec();
  }

  private buildExposureFilter(identity: ExposureIdentity) {
    return {
      sdkIntegrationId: identity.sdkIntegrationId,
      guideId: identity.guideId,
      ...environmentFilter(identity.environment),
      ...(identity.userId ? { userId: identity.userId } : {}),
      ...(identity.sessionId ? { sessionId: identity.sessionId } : {}),
    };
  }
}

export default new EngagementRepository();
