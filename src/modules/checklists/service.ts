import { AppError } from "../../utils/app-error.js";
import type { RuntimeGuideDto } from "../engagement/dtos.js";
import type { TargetingRuntimeContext } from "../engagement/types.js";
import engagementService from "../engagement/service.js";
import targetingService from "../targeting/service.js";
import type {
  ChecklistEventDto,
  ChecklistQueryDto,
  CreateChecklistDto,
  UpdateChecklistDto,
} from "./dtos.js";
import type { IChecklistDocument } from "./model.js";
import checklistRepository from "./repository.js";
import { isObjectId } from "../engagement/lifecycle.js";

class ChecklistService {
  public listChecklists(tenantId: string, query: ChecklistQueryDto) {
    return checklistRepository.listChecklists(tenantId, query);
  }

  public async getChecklist(tenantId: string, checklistId: string) {
    const checklist = await checklistRepository.getChecklist(
      tenantId,
      checklistId,
    );

    if (!checklist) {
      throw new AppError(404, "Checklist not found", "NOT_FOUND");
    }

    return checklist;
  }

  public createChecklist(
    tenantId: string,
    createdBy: string,
    dto: CreateChecklistDto,
  ) {
    return checklistRepository.createChecklist(tenantId, createdBy, dto);
  }

  public async updateChecklist(
    tenantId: string,
    checklistId: string,
    updatedBy: string,
    dto: UpdateChecklistDto,
  ) {
    const checklist = await checklistRepository.updateChecklist(
      tenantId,
      checklistId,
      updatedBy,
      dto,
    );

    if (!checklist) {
      throw new AppError(404, "Checklist not found", "NOT_FOUND");
    }

    return checklist;
  }

  public async deleteChecklist(tenantId: string, checklistId: string) {
    const result = await checklistRepository.deleteChecklist(
      tenantId,
      checklistId,
    );

    if (result.deletedCount === 0) {
      throw new AppError(404, "Checklist not found", "NOT_FOUND");
    }
  }

  public async applyEvent(
    tenantId: string,
    sdkIntegrationId: string,
    event: ChecklistEventDto,
  ) {
    const checklists = await checklistRepository.listLiveChecklists(tenantId);
    const updated = [];

    for (const checklist of checklists) {
      const linkedItems = checklist.items.filter(
        (item) => item.linkedEvent === event.eventName,
      );

      if (linkedItems.length === 0) {
        continue;
      }

      updated.push(
        await this.markItemsComplete(
          tenantId,
          sdkIntegrationId,
          checklist,
          linkedItems.map((item) => item.id),
          event,
        ),
      );
    }

    return updated;
  }

  /** Marks one item done when the user ticks it in the checklist widget. */
  public async completeItem(
    tenantId: string,
    sdkIntegrationId: string,
    checklistId: string,
    itemId: string,
    event: Omit<ChecklistEventDto, "eventName">,
  ) {
    const checklist = isObjectId(checklistId)
      ? await checklistRepository.getChecklist(tenantId, checklistId)
      : null;
    if (
      !checklist ||
      checklist.status !== "LIVE" ||
      !checklist.items.some((item) => item.id === itemId)
    ) {
      return null;
    }
    return this.markItemsComplete(
      tenantId,
      sdkIntegrationId,
      checklist,
      [itemId],
      {
        ...event,
        eventName: "step_completed",
      },
    );
  }

  private async markItemsComplete(
    tenantId: string,
    sdkIntegrationId: string,
    checklist: IChecklistDocument,
    itemIds: string[],
    event: ChecklistEventDto,
  ) {
    const progress = await checklistRepository.getProgress({
      tenantId,
      checklistId: checklist._id.toString(),
      userId: event.userId,
      sessionId: event.sessionId,
    });
    const wasComplete = progress?.progressPercent === 100;
    // Items removed from the checklist since must not count toward progress.
    const known = new Set(checklist.items.map((item) => item.id));
    const completed = new Set(
      (progress?.completedItemIds ?? []).filter((id) => known.has(id)),
    );
    itemIds.forEach((id) => completed.add(id));
    const next = await checklistRepository.upsertProgress({
      tenantId,
      checklist,
      event,
      completedItemIds: [...completed],
    });

    // Record the completion once, when the checklist first reaches 100%.
    if (next?.progressPercent === 100 && !wasComplete) {
      await engagementService.recordInteraction({
        tenantId,
        sdkIntegrationId,
        actorUserId: event.userId,
        dto: {
          eventName: "guide_completed",
          guideId: `checklist:${checklist._id.toString()}`,
          userId: event.userId,
          sessionId: event.sessionId,
          properties: { checklistId: checklist._id.toString() },
        },
      });
    }
    return next;
  }

  public async getEligibleChecklists(
    tenantId: string,
    context: Omit<TargetingRuntimeContext, "tenantId">,
  ): Promise<RuntimeGuideDto[]> {
    const checklists = await checklistRepository.listLiveChecklists(tenantId);
    const contextWithTenant = { ...context, tenantId };
    const evaluated = await Promise.all(
      checklists.map(async (checklist) => ({
        checklist,
        eligibility: await targetingService.evaluate({
          rules: checklist.targetingRules,
          context: contextWithTenant,
          guideId: `checklist:${checklist._id.toString()}`,
          frequencyRules: checklist.frequencyRules,
          scheduleRules: checklist.scheduleRules,
        }),
      })),
    );

    const eligible = evaluated
      .filter((entry) => entry.eligibility.eligible)
      .sort((left, right) =>
        targetingService.comparePriority(
          left.checklist.priority,
          right.checklist.priority,
        ),
      );

    // Progress lets the widget show which items the user already finished.
    return Promise.all(
      eligible.map(async (entry) => {
        const progress =
          context.userId || context.sessionId
            ? await checklistRepository.getProgress({
                tenantId,
                checklistId: entry.checklist._id.toString(),
                userId: context.userId,
                sessionId: context.sessionId,
              })
            : null;
        return this.toRuntimeDto(
          entry.checklist,
          entry.eligibility,
          progress?.completedItemIds ?? [],
        );
      }),
    );
  }

  private toRuntimeDto(
    checklist: IChecklistDocument,
    eligibility: RuntimeGuideDto["eligibility"],
    completedItemIds: string[] = [],
  ): RuntimeGuideDto {
    return {
      id: `checklist:${checklist._id.toString()}`,
      title: checklist.title,
      description: checklist.description,
      type: "CHECKLIST",
      priority: checklist.priority,
      theme: {},
      steps: checklist.items,
      targetingRules: checklist.targetingRules,
      frequencyRules: checklist.frequencyRules as Record<string, unknown>,
      scheduleRules: checklist.scheduleRules as Record<string, unknown>,
      metadata: {
        ...checklist.metadata,
        checklistId: checklist._id.toString(),
        estimatedMinutes: checklist.estimatedMinutes,
        completedItemIds,
      },
      eligibility,
    };
  }
}

export default new ChecklistService();
