import AnalyticsKeyModel from "../../models/analytics-key.model.js";
import trackingService from "../../services/tracking.service.js";
import engagementRepository from "./repository.js";
import type { EngagementTrackDto, RuntimeGuideDto } from "./dtos.js";
import type { EngagementEventName } from "./types.js";

const COMPLETED_EVENTS: EngagementEventName[] = [
  "guide_completed",
  "survey_completed",
];

const DISMISSED_EVENTS: EngagementEventName[] = [
  "guide_dismissed",
  "survey_abandoned",
];

class EngagementService {
  public async recordInteraction(input: {
    tenantId: string;
    actorUserId?: string;
    dto: EngagementTrackDto;
  }) {
    const experienceId =
      input.dto.guideId ?? input.dto.surveyId ?? input.dto.checklistId;
    const userId = input.dto.userId ?? input.actorUserId;

    if (input.dto.eventName === "survey_completed" && input.dto.surveyId) {
      const isAlreadyProcessed =
        input.dto.properties &&
        (input.dto.properties.responseId || input.dto.properties.isProcessed);
      if (!isAlreadyProcessed) {
        const surveyService = (await import("../surveys/service.js")).default;
        await surveyService.submitResponse(input.tenantId, input.dto.surveyId, {
          userId,
          sessionId: input.dto.sessionId,
          answers: (input.dto.properties?.answers || {}) as Record<
            string,
            unknown
          >,
          metadata: (input.dto.properties?.metadata || {}) as Record<
            string,
            unknown
          >,
        });
        return { success: true };
      }
    }

    if (experienceId) {
      await engagementRepository.upsertExposure(
        {
          tenantId: input.tenantId,
          guideId: experienceId,
          userId,
          sessionId: input.dto.sessionId,
        },
        {
          status: this.resolveExposureStatus(input.dto.eventName),
          stepId: input.dto.stepId,
          metadata: input.dto.properties,
          incrementDisplay: input.dto.eventName === "guide_shown",
        },
      );
    }

    if (userId && input.dto.eventName === "guide_shown") {
      await engagementRepository.incrementMtu({
        tenantId: input.tenantId,
        userId,
        guideId: input.dto.guideId,
        surveyId: input.dto.surveyId,
      });
    }

    await this.trackThroughExistingAnalytics(input.tenantId, {
      eventName: input.dto.eventName,
      userId,
      sessionId: input.dto.sessionId,
      payload: {
        guideId: input.dto.guideId,
        surveyId: input.dto.surveyId,
        checklistId: input.dto.checklistId,
        stepId: input.dto.stepId,
        ...(input.dto.properties ?? {}),
      },
    });

    return { success: true };
  }

  public async recordRuntimeDelivery(input: {
    tenantId: string;
    userId?: string;
    sessionId?: string;
    guides: RuntimeGuideDto[];
  }): Promise<void> {
    await Promise.all(
      input.guides.map(async (guide) => {
        const surveyId =
          typeof guide.metadata.surveyId === "string"
            ? guide.metadata.surveyId
            : undefined;
        const checklistId =
          typeof guide.metadata.checklistId === "string"
            ? guide.metadata.checklistId
            : undefined;

        await this.recordInteraction({
          tenantId: input.tenantId,
          actorUserId: input.userId,
          dto: {
            eventName: "guide_shown",
            guideId: surveyId || checklistId ? undefined : guide.id,
            surveyId,
            checklistId,
            userId: input.userId,
            sessionId: input.sessionId,
            properties: { source: "runtime_delivery", type: guide.type },
          },
        });
      }),
    );
  }

  public countMtu(tenantId: string, month: string): Promise<number> {
    return engagementRepository.countMtu(tenantId, month);
  }

  private resolveExposureStatus(eventName: EngagementEventName) {
    if (COMPLETED_EVENTS.includes(eventName)) {
      return "completed" as const;
    }

    if (DISMISSED_EVENTS.includes(eventName)) {
      return "dismissed" as const;
    }

    if (eventName === "guide_started" || eventName === "survey_started") {
      return "started" as const;
    }

    return "shown" as const;
  }

  private async trackThroughExistingAnalytics(
    tenantId: string,
    input: {
      eventName: EngagementEventName;
      userId?: string;
      sessionId?: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    const key = await AnalyticsKeyModel.findOne({
      userId: tenantId,
      status: "active",
    })
      .sort({ createdAt: -1 })
      .exec();

    if (!key) {
      return;
    }

    await trackingService.trackSingle({
      apiKeyId: key._id.toString(),
      eventName: input.eventName,
      userIdentifier: input.userId,
      sessionId: input.sessionId,
      payload: {
        ...input.payload,
        source: "engagement",
      },
    });
  }
}

export default new EngagementService();
