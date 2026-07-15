import { AppError } from "../../utils/app-error.js";
import { ENGAGEMENT_EVENT_NAMES, type EngagementEventName } from "./types.js";
import type { EngagementTrackDto, RuntimeEvaluationDto } from "./dtos.js";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new AppError(400, "Request body must be an object", "INVALID_BODY");
  }

  return value as Record<string, unknown>;
};

const asOptionalString = (
  value: unknown,
  field: string,
): string | undefined => {
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AppError(400, `${field} must be a string`, "INVALID_FIELD");
  }

  return value;
};

export const validateRuntimeEvaluationDto = (
  body: unknown,
): RuntimeEvaluationDto => {
  const record = asRecord(body);
  const userProperties =
    typeof record.userProperties === "object" && record.userProperties != null
      ? (record.userProperties as Record<string, unknown>)
      : undefined;

  return {
    tenantId: asOptionalString(record.tenantId, "tenantId") ?? "",
    userId: asOptionalString(record.userId, "userId"),
    sessionId: asOptionalString(record.sessionId, "sessionId"),
    url: asOptionalString(record.url, "url"),
    referrer: asOptionalString(record.referrer, "referrer"),
    role: asOptionalString(record.role, "role"),
    plan: asOptionalString(record.plan, "plan"),
    accountCreatedAt:
      typeof record.accountCreatedAt === "string"
        ? record.accountCreatedAt
        : undefined,
    userProperties,
    session:
      typeof record.session === "object" && record.session != null
        ? (record.session as RuntimeEvaluationDto["session"])
        : undefined,
    workflow:
      typeof record.workflow === "object" && record.workflow != null
        ? (record.workflow as RuntimeEvaluationDto["workflow"])
        : undefined,
    now: typeof record.now === "string" ? record.now : undefined,
    eventName: asOptionalString(record.eventName, "eventName"),
    eventProperties:
      typeof record.eventProperties === "object" &&
      record.eventProperties != null
        ? (record.eventProperties as Record<string, unknown>)
        : undefined,
    forceShowCompleted:
      typeof record.forceShowCompleted === "boolean"
        ? record.forceShowCompleted
        : undefined,
  };
};

export const validateEngagementTrackDto = (
  body: unknown,
): EngagementTrackDto => {
  const record = asRecord(body);
  const eventName = asOptionalString(record.eventName, "eventName");

  if (
    eventName == null ||
    !ENGAGEMENT_EVENT_NAMES.includes(eventName as EngagementEventName)
  ) {
    throw new AppError(400, "Unsupported engagement event", "INVALID_EVENT");
  }

  return {
    eventName: eventName as EngagementEventName,
    guideId: asOptionalString(record.guideId, "guideId"),
    surveyId: asOptionalString(record.surveyId, "surveyId"),
    checklistId: asOptionalString(record.checklistId, "checklistId"),
    stepId: asOptionalString(record.stepId, "stepId"),
    sessionId: asOptionalString(record.sessionId, "sessionId"),
    userId: asOptionalString(record.userId, "userId"),
    properties:
      typeof record.properties === "object" && record.properties != null
        ? (record.properties as Record<string, unknown>)
        : {},
  };
};
