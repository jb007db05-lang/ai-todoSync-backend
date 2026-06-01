import { AppError } from "../../utils/app-error.js";
import {
  GUIDE_PRIORITIES,
  GUIDE_STATUSES,
  type ChecklistItem,
  type GuidePriority,
  type GuideStatus,
} from "../engagement/types.js";
import { validateTargetingRuleGroup } from "../targeting/validators.js";
import type {
  ChecklistEventDto,
  ChecklistQueryDto,
  CreateChecklistDto,
  UpdateChecklistDto,
} from "./dtos.js";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new AppError(400, "Request body must be an object", "INVALID_BODY");
  }

  return value as Record<string, unknown>;
};

const normalizeItems = (value: unknown): ChecklistItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const record =
      typeof item === "object" && item != null
        ? (item as Record<string, unknown>)
        : {};
    return {
      id: typeof record.id === "string" ? record.id : `item-${index + 1}`,
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : `Checklist item ${index + 1}`,
      description:
        typeof record.description === "string" ? record.description.trim() : "",
      linkedEvent:
        typeof record.linkedEvent === "string" ? record.linkedEvent : "",
      completionConditions:
        typeof record.completionConditions === "object" &&
        record.completionConditions != null
          ? validateTargetingRuleGroup(record.completionConditions)
          : null,
      completed: record.completed === true,
      completedAt:
        typeof record.completedAt === "string" ? record.completedAt : null,
      estimatedMinutes:
        typeof record.estimatedMinutes === "number"
          ? record.estimatedMinutes
          : 5,
    };
  });
};

export const validateCreateChecklistDto = (
  body: unknown,
): CreateChecklistDto => {
  const record = asRecord(body);

  if (typeof record.title !== "string" || record.title.trim().length === 0) {
    throw new AppError(400, "Checklist title is required", "INVALID_TITLE");
  }

  const items = normalizeItems(record.items);
  if (items.length === 0) {
    throw new AppError(
      400,
      "At least one checklist item is required",
      "INVALID_ITEMS",
    );
  }

  return {
    title: record.title.trim(),
    description:
      typeof record.description === "string"
        ? record.description.trim()
        : undefined,
    status: GUIDE_STATUSES.includes(record.status as GuideStatus)
      ? (record.status as GuideStatus)
      : "DRAFT",
    priority: GUIDE_PRIORITIES.includes(record.priority as GuidePriority)
      ? (record.priority as GuidePriority)
      : "MEDIUM",
    items,
    targetingRules:
      typeof record.targetingRules === "object" && record.targetingRules != null
        ? validateTargetingRuleGroup(record.targetingRules)
        : null,
    frequencyRules:
      typeof record.frequencyRules === "object" && record.frequencyRules != null
        ? (record.frequencyRules as CreateChecklistDto["frequencyRules"])
        : {},
    scheduleRules:
      typeof record.scheduleRules === "object" && record.scheduleRules != null
        ? (record.scheduleRules as CreateChecklistDto["scheduleRules"])
        : {},
    estimatedMinutes:
      typeof record.estimatedMinutes === "number"
        ? record.estimatedMinutes
        : items.reduce((sum, item) => sum + (item.estimatedMinutes ?? 0), 0),
    metadata:
      typeof record.metadata === "object" && record.metadata != null
        ? (record.metadata as Record<string, unknown>)
        : {},
  };
};

export const validateUpdateChecklistDto = (
  body: unknown,
): UpdateChecklistDto => {
  const record = asRecord(body);
  const dto: UpdateChecklistDto = {};

  if ("title" in record) {
    if (typeof record.title !== "string" || record.title.trim().length === 0) {
      throw new AppError(400, "Checklist title is required", "INVALID_TITLE");
    }
    dto.title = record.title.trim();
  }

  if ("description" in record) {
    dto.description =
      typeof record.description === "string" ? record.description.trim() : "";
  }

  if ("status" in record) {
    if (!GUIDE_STATUSES.includes(record.status as GuideStatus)) {
      throw new AppError(400, "Checklist status is invalid", "INVALID_STATUS");
    }
    dto.status = record.status as GuideStatus;
  }

  if ("priority" in record) {
    if (!GUIDE_PRIORITIES.includes(record.priority as GuidePriority)) {
      throw new AppError(
        400,
        "Checklist priority is invalid",
        "INVALID_PRIORITY",
      );
    }
    dto.priority = record.priority as GuidePriority;
  }

  if ("items" in record) {
    dto.items = normalizeItems(record.items);
  }

  if ("targetingRules" in record) {
    dto.targetingRules =
      typeof record.targetingRules === "object" && record.targetingRules != null
        ? validateTargetingRuleGroup(record.targetingRules)
        : null;
  }

  if ("frequencyRules" in record) {
    dto.frequencyRules =
      typeof record.frequencyRules === "object" && record.frequencyRules != null
        ? (record.frequencyRules as CreateChecklistDto["frequencyRules"])
        : {};
  }

  if ("scheduleRules" in record) {
    dto.scheduleRules =
      typeof record.scheduleRules === "object" && record.scheduleRules != null
        ? (record.scheduleRules as CreateChecklistDto["scheduleRules"])
        : {};
  }

  if ("metadata" in record) {
    dto.metadata =
      typeof record.metadata === "object" && record.metadata != null
        ? (record.metadata as Record<string, unknown>)
        : {};
  }

  return dto;
};

export const validateChecklistQueryDto = (
  query: Record<string, unknown>,
): ChecklistQueryDto => ({
  status: GUIDE_STATUSES.includes(query.status as GuideStatus)
    ? (query.status as GuideStatus)
    : undefined,
  search: typeof query.search === "string" ? query.search.trim() : undefined,
});

export const validateChecklistEventDto = (body: unknown): ChecklistEventDto => {
  const record = asRecord(body);

  if (
    typeof record.eventName !== "string" ||
    record.eventName.trim().length === 0
  ) {
    throw new AppError(400, "eventName is required", "INVALID_EVENT");
  }

  return {
    eventName: record.eventName.trim(),
    userId: typeof record.userId === "string" ? record.userId : undefined,
    sessionId:
      typeof record.sessionId === "string" ? record.sessionId : undefined,
    properties:
      typeof record.properties === "object" && record.properties != null
        ? (record.properties as Record<string, unknown>)
        : {},
  };
};
