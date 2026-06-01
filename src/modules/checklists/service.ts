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

  public async applyEvent(tenantId: string, event: ChecklistEventDto) {
    const checklists = await checklistRepository.listLiveChecklists(tenantId);
    const updated = [];

    for (const checklist of checklists) {
      const linkedItems = checklist.items.filter(
        (item) => item.linkedEvent === event.eventName,
      );

      if (linkedItems.length === 0) {
        continue;
      }

      const progress = await checklistRepository.getProgress({
        tenantId,
        checklistId: checklist._id.toString(),
        userId: event.userId,
        sessionId: event.sessionId,
      });
      const completed = new Set(progress?.completedItemIds ?? []);
      linkedItems.forEach((item) => completed.add(item.id));
      const next = await checklistRepository.upsertProgress({
        tenantId,
        checklist,
        event,
        completedItemIds: [...completed],
      });
      updated.push(next);

      if (next?.progressPercent === 100) {
        await engagementService.recordInteraction({
          tenantId,
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
    }

    return updated;
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

    return evaluated
      .filter((entry) => entry.eligibility.eligible)
      .sort((left, right) =>
        targetingService.comparePriority(
          left.checklist.priority,
          right.checklist.priority,
        ),
      )
      .map((entry) => this.toRuntimeDto(entry.checklist, entry.eligibility));
  }

  private toRuntimeDto(
    checklist: IChecklistDocument,
    eligibility: RuntimeGuideDto["eligibility"],
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
      },
      eligibility,
    };
  }
}

export default new ChecklistService();
