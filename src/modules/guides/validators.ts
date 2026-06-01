import { AppError } from "../../utils/app-error.js";
import {
  GUIDE_PRIORITIES,
  GUIDE_STATUSES,
  GUIDE_TYPES,
  type GuidePriority,
  type GuideStatus,
  type GuideType,
  type TourStep,
} from "../engagement/types.js";
import { validateTargetingRuleGroup } from "../targeting/validators.js";
import type { CreateGuideDto, GuideQueryDto, UpdateGuideDto } from "./dtos.js";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new AppError(400, "Request body must be an object", "INVALID_BODY");
  }

  return value as Record<string, unknown>;
};

const normalizeSteps = (value: unknown): TourStep[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((step, index) => {
    const record =
      typeof step === "object" && step != null
        ? (step as Record<string, unknown>)
        : {};
    return {
      id: typeof record.id === "string" ? record.id : `step-${index + 1}`,
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : `Step ${index + 1}`,
      description:
        typeof record.description === "string" ? record.description.trim() : "",
      selector: typeof record.selector === "string" ? record.selector : "",
      placement:
        record.placement === "TOP" ||
        record.placement === "BOTTOM" ||
        record.placement === "LEFT" ||
        record.placement === "RIGHT" ||
        record.placement === "AUTO" ||
        record.placement === "CENTER"
          ? record.placement
          : "CENTER",
      actionType:
        record.actionType === "CLICK" ||
        record.actionType === "NAVIGATE" ||
        record.actionType === "SUBMIT" ||
        record.actionType === "CUSTOM"
          ? record.actionType
          : "NEXT",
      nextStep: typeof record.nextStep === "string" ? record.nextStep : null,
      branchConditions:
        typeof record.branchConditions === "object" &&
        record.branchConditions != null
          ? validateTargetingRuleGroup(record.branchConditions)
          : null,
      analytics:
        typeof record.analytics === "object" && record.analytics != null
          ? (record.analytics as Record<string, unknown>)
          : {},
    };
  });
};

export const validateCreateGuideDto = (body: unknown): CreateGuideDto => {
  const record = asRecord(body);

  if (typeof record.title !== "string" || record.title.trim().length === 0) {
    throw new AppError(400, "Guide title is required", "INVALID_TITLE");
  }

  if (!GUIDE_TYPES.includes(record.type as GuideType)) {
    throw new AppError(400, "Guide type is invalid", "INVALID_TYPE");
  }

  return {
    title: record.title.trim(),
    description:
      typeof record.description === "string"
        ? record.description.trim()
        : undefined,
    type: record.type as GuideType,
    status: GUIDE_STATUSES.includes(record.status as GuideStatus)
      ? (record.status as GuideStatus)
      : "DRAFT",
    theme:
      typeof record.theme === "object" && record.theme != null
        ? (record.theme as Record<string, unknown>)
        : {},
    priority: GUIDE_PRIORITIES.includes(record.priority as GuidePriority)
      ? (record.priority as GuidePriority)
      : "MEDIUM",
    targetingRules:
      typeof record.targetingRules === "object" && record.targetingRules != null
        ? validateTargetingRuleGroup(record.targetingRules)
        : null,
    frequencyRules:
      typeof record.frequencyRules === "object" && record.frequencyRules != null
        ? (record.frequencyRules as CreateGuideDto["frequencyRules"])
        : { showOncePerSession: true },
    scheduleRules:
      typeof record.scheduleRules === "object" && record.scheduleRules != null
        ? (record.scheduleRules as CreateGuideDto["scheduleRules"])
        : {},
    steps: normalizeSteps(record.steps),
    metadata:
      typeof record.metadata === "object" && record.metadata != null
        ? (record.metadata as Record<string, unknown>)
        : {},
  };
};

export const validateUpdateGuideDto = (body: unknown): UpdateGuideDto => {
  const record = asRecord(body);
  const dto: UpdateGuideDto = {};

  if ("title" in record) {
    if (typeof record.title !== "string" || record.title.trim().length === 0) {
      throw new AppError(400, "Guide title is required", "INVALID_TITLE");
    }
    dto.title = record.title.trim();
  }

  if ("description" in record) {
    dto.description =
      typeof record.description === "string" ? record.description.trim() : "";
  }

  if ("type" in record) {
    if (!GUIDE_TYPES.includes(record.type as GuideType)) {
      throw new AppError(400, "Guide type is invalid", "INVALID_TYPE");
    }
    dto.type = record.type as GuideType;
  }

  if ("status" in record) {
    if (!GUIDE_STATUSES.includes(record.status as GuideStatus)) {
      throw new AppError(400, "Guide status is invalid", "INVALID_STATUS");
    }
    dto.status = record.status as GuideStatus;
  }

  if ("priority" in record) {
    if (!GUIDE_PRIORITIES.includes(record.priority as GuidePriority)) {
      throw new AppError(400, "Guide priority is invalid", "INVALID_PRIORITY");
    }
    dto.priority = record.priority as GuidePriority;
  }

  if ("theme" in record) {
    dto.theme =
      typeof record.theme === "object" && record.theme != null
        ? (record.theme as Record<string, unknown>)
        : {};
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
        ? (record.frequencyRules as CreateGuideDto["frequencyRules"])
        : {};
  }

  if ("scheduleRules" in record) {
    dto.scheduleRules =
      typeof record.scheduleRules === "object" && record.scheduleRules != null
        ? (record.scheduleRules as CreateGuideDto["scheduleRules"])
        : {};
  }

  if ("steps" in record) {
    dto.steps = normalizeSteps(record.steps);
  }

  if ("metadata" in record) {
    dto.metadata =
      typeof record.metadata === "object" && record.metadata != null
        ? (record.metadata as Record<string, unknown>)
        : {};
  }

  return dto;
};

export const validateGuideQueryDto = (
  query: Record<string, unknown>,
): GuideQueryDto => ({
  status: GUIDE_STATUSES.includes(query.status as GuideStatus)
    ? (query.status as GuideStatus)
    : undefined,
  type: GUIDE_TYPES.includes(query.type as GuideType)
    ? (query.type as GuideType)
    : undefined,
  search: typeof query.search === "string" ? query.search.trim() : undefined,
});
