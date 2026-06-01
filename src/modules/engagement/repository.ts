import {
  GuideExposureModel,
  MonthlyTargetedUserModel,
  type GuideExposureStatus,
  type IGuideExposureDocument,
} from "./model.js";

interface ExposureIdentity {
  tenantId: string;
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

    const update: Record<string, unknown> = {
      $set: set,
      $setOnInsert: {
        tenantId: identity.tenantId,
        guideId: identity.guideId,
        userId: identity.userId,
        sessionId: identity.sessionId,
        stepState: {},
        displayCount: 0,
      },
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
      { tenantId: input.tenantId, userId: input.userId, month },
      {
        $setOnInsert: {
          tenantId: input.tenantId,
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

  public async countMtu(tenantId: string, month: string): Promise<number> {
    return MonthlyTargetedUserModel.countDocuments({ tenantId, month }).exec();
  }

  private buildExposureFilter(identity: ExposureIdentity) {
    return {
      tenantId: identity.tenantId,
      guideId: identity.guideId,
      ...(identity.userId ? { userId: identity.userId } : {}),
      ...(identity.sessionId ? { sessionId: identity.sessionId } : {}),
    };
  }
}

export default new EngagementRepository();
