import {
  GuideExposureModel,
  MonthlyTargetedUserModel,
  type GuideExposureStatus,
  type IGuideExposureDocument,
} from "./model.js";

interface ExposureIdentity {
  tenantId: string;
  sdkIntegrationId: string;
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
    tenantId: string,
    guideId: string,
  ): Promise<IGuideExposureDocument[]> {
    return GuideExposureModel.find({ tenantId, guideId }).exec();
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

    if (patch.status) {
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
    };

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

  public async countMtu(sdkIntegrationId: string, month: string): Promise<number> {
    return MonthlyTargetedUserModel.countDocuments({ sdkIntegrationId, month }).exec();
  }

  private buildExposureFilter(identity: ExposureIdentity) {
    return {
      sdkIntegrationId: identity.sdkIntegrationId,
      guideId: identity.guideId,
      ...(identity.userId ? { userId: identity.userId } : {}),
      ...(identity.sessionId ? { sessionId: identity.sessionId } : {}),
    };
  }
}

export default new EngagementRepository();
