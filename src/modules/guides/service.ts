import { AppError } from "../../utils/app-error.js";
import engagementRepository from "../engagement/repository.js";
import type { RuntimeGuideDto } from "../engagement/dtos.js";
import type { TargetingRuntimeContext } from "../engagement/types.js";
import targetingService from "../targeting/service.js";
import type { CreateGuideDto, GuideQueryDto, UpdateGuideDto } from "./dtos.js";
import type { IGuideDocument } from "./model.js";
import guideRepository from "./repository.js";
import {
  servableStatuses,
  type DataEnvironment,
} from "../../shared/environment.js";
import { assertStatusTransition, isObjectId } from "../engagement/lifecycle.js";

class GuideService {
  public listGuides(
    tenantId: string,
    sdkIntegrationId: string,
    query: GuideQueryDto,
  ) {
    return guideRepository.listGuides(tenantId, sdkIntegrationId, query);
  }

  public async getGuide(
    tenantId: string,
    sdkIntegrationId: string,
    guideId: string,
  ) {
    const guide = isObjectId(guideId)
      ? await guideRepository.getGuide(tenantId, sdkIntegrationId, guideId)
      : null;

    if (!guide) {
      throw new AppError(404, "Guide not found", "NOT_FOUND");
    }

    return guide;
  }

  public createGuide(
    tenantId: string,
    sdkIntegrationId: string,
    createdBy: string,
    dto: CreateGuideDto,
  ) {
    const status = dto.status ?? "DRAFT";
    if (status === "LIVE") {
      this.assertPublishable({ type: dto.type, steps: dto.steps ?? [] });
    } else if (status !== "DRAFT") {
      throw new AppError(
        400,
        "New guides start as DRAFT or LIVE.",
        "INVALID_STATUS",
      );
    }
    dto = { ...dto, status };
    return guideRepository.createGuide(
      tenantId,
      sdkIntegrationId,
      createdBy,
      dto,
    );
  }

  public async updateGuide(
    tenantId: string,
    sdkIntegrationId: string,
    guideId: string,
    updatedBy: string,
    dto: UpdateGuideDto,
  ) {
    const existing = await this.getGuide(tenantId, sdkIntegrationId, guideId);
    // Status changes go through the lifecycle (transition rules + checks).
    const { status: requestedStatus, ...content } = dto;
    if (existing.status === "LIVE") {
      this.assertPublishable({
        type: content.type ?? existing.type,
        steps: content.steps ?? existing.steps,
      });
    }
    dto = content;
    const updated = await guideRepository.updateGuide(
      tenantId,
      sdkIntegrationId,
      guideId,
      updatedBy,
      dto,
      existing,
    );

    if (!updated) {
      throw new AppError(404, "Guide not found", "NOT_FOUND");
    }

    if (requestedStatus && requestedStatus !== updated.status) {
      return this.updateStatus(
        tenantId,
        sdkIntegrationId,
        guideId,
        updatedBy,
        requestedStatus,
      );
    }

    return updated;
  }

  public async updateStatus(
    tenantId: string,
    sdkIntegrationId: string,
    guideId: string,
    updatedBy: string,
    status: "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED",
  ) {
    const existing = await this.getGuide(tenantId, sdkIntegrationId, guideId);
    if (existing.status === status) return existing;
    assertStatusTransition("Guide", existing.status, status);
    if (status === "LIVE") {
      this.assertPublishable(existing);
    }

    const guide = await guideRepository.updateStatus(
      tenantId,
      sdkIntegrationId,
      guideId,
      updatedBy,
      existing.status,
      status,
    );

    if (!guide) {
      throw new AppError(
        409,
        "Guide status changed while updating. Reload and try again.",
        "STATUS_CONFLICT",
      );
    }

    return guide;
  }

  private assertPublishable(
    guide: Pick<IGuideDocument, "type" | "steps">,
  ): void {
    if (!guide.steps || guide.steps.length === 0) {
      throw new AppError(
        400,
        "A guide needs at least one step before it can go live.",
        "GUIDE_NOT_PUBLISHABLE",
      );
    }
    const ids = new Set(guide.steps.map((s) => s.id));
    const missingSelector = guide.steps.find(
      (s) =>
        ["TOUR", "SMART_TIP", "HOTSPOT"].includes(guide.type) &&
        s.placement !== "CENTER" &&
        !s.selector,
    );
    if (missingSelector) {
      throw new AppError(
        400,
        `Step '${missingSelector.title}' needs a target selector.`,
        "GUIDE_NOT_PUBLISHABLE",
      );
    }
    const brokenLink = guide.steps.find(
      (s) => s.nextStep && !ids.has(s.nextStep),
    );
    if (brokenLink) {
      throw new AppError(
        400,
        `Step '${brokenLink.title}' points to a step that does not exist.`,
        "GUIDE_NOT_PUBLISHABLE",
      );
    }
  }

  public async deleteGuide(
    tenantId: string,
    sdkIntegrationId: string,
    guideId: string,
  ) {
    const existing = await this.getGuide(tenantId, sdkIntegrationId, guideId);
    if (existing.status === "LIVE") {
      throw new AppError(
        409,
        "Pause or archive a live guide before deleting it.",
        "GUIDE_LIVE",
      );
    }
    const result = await guideRepository.deleteGuide(
      tenantId,
      sdkIntegrationId,
      guideId,
    );

    if (result.deletedCount === 0) {
      throw new AppError(404, "Guide not found", "NOT_FOUND");
    }
  }

  public async getEligibleGuides(
    tenantId: string,
    sdkIntegrationId: string,
    context: Omit<TargetingRuntimeContext, "tenantId">,
  ): Promise<RuntimeGuideDto[]> {
    const environment = context.environment ?? "live";
    const statuses = servableStatuses(environment);
    const manualTourId = context.eventProperties?.tourId;
    if (
      context.eventName === "manual_tour" &&
      typeof manualTourId === "string" &&
      isObjectId(manualTourId)
    ) {
      const guide = await guideRepository.getGuide(
        tenantId,
        sdkIntegrationId,
        manualTourId,
      );
      // Manual triggers obey the same status rules as automatic delivery.
      if (guide && statuses.includes(guide.status)) {
        return [
          this.toRuntimeDto(guide, {
            reasons: ["Manual tour trigger"],
            matchedConditions: [],
            failedConditions: [],
          }),
        ];
      }
    }

    const guides = await guideRepository.listServableGuides(
      tenantId,
      sdkIntegrationId,
      statuses,
    );
    const contextWithTenant = { ...context, tenantId };
    const evaluated = await Promise.all(
      guides.map(async (guide) => {
        const eligibility = await targetingService.evaluate({
          rules: guide.targetingRules,
          context: contextWithTenant,
          guideId: guide._id.toString(),
          frequencyRules: guide.frequencyRules,
          scheduleRules: guide.scheduleRules,
        });
        return { guide, eligibility };
      }),
    );

    return evaluated
      .filter((entry) => entry.eligibility.eligible)
      .sort((left, right) =>
        targetingService.comparePriority(
          left.guide.priority,
          right.guide.priority,
        ),
      )
      .map((entry) => this.toRuntimeDto(entry.guide, entry.eligibility))
      .slice(0, 5);
  }

  public async getGuideExposureSummary(
    tenantId: string,
    sdkIntegrationId: string,
    guideId: string,
    environment: DataEnvironment = "live",
  ) {
    await this.getGuide(tenantId, sdkIntegrationId, guideId);
    const exposures = await engagementRepository.findExposuresForGuide(
      sdkIntegrationId,
      guideId,
      environment,
    );
    const total = exposures.length;
    const completed = exposures.filter(
      (exposure) => exposure.status === "completed",
    ).length;
    const dismissed = exposures.filter(
      (exposure) => exposure.status === "dismissed",
    ).length;
    const impressions = exposures.reduce(
      (sum, exposure) => sum + exposure.displayCount,
      0,
    );

    return {
      guideId,
      environment,
      impressions,
      uniqueUsers: total,
      completions: completed,
      dismissals: dismissed,
      completionRate: total > 0 ? completed / total : 0,
      dismissalRate: total > 0 ? dismissed / total : 0,
    };
  }

  private toRuntimeDto(
    guide: IGuideDocument,
    eligibility: RuntimeGuideDto["eligibility"],
  ): RuntimeGuideDto {
    return {
      id: guide._id.toString(),
      title: guide.title,
      description: guide.description,
      type: guide.type,
      priority: guide.priority,
      theme: guide.theme,
      steps: guide.steps,
      targetingRules: guide.targetingRules,
      frequencyRules: guide.frequencyRules as Record<string, unknown>,
      scheduleRules: guide.scheduleRules as Record<string, unknown>,
      metadata: { ...guide.metadata, status: guide.status },
      eligibility,
    };
  }
}

export default new GuideService();
