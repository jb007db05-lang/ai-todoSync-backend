import { AppError } from "../../utils/app-error.js";
import type {
  TargetingCondition,
  TargetingRuleGroup,
} from "../engagement/types.js";
import type {
  CreateTargetingSegmentDto,
  EvaluateRulesDto,
  UpdateTargetingSegmentDto,
} from "./dtos.js";

const asRecord = (body: unknown): Record<string, unknown> => {
  if (typeof body !== "object" || body == null || Array.isArray(body)) {
    throw new AppError(400, "Request body must be an object", "INVALID_BODY");
  }

  return body as Record<string, unknown>;
};

export const validateTargetingRuleGroup = (
  value: unknown,
): TargetingRuleGroup => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new AppError(
      400,
      "Targeting rules must be an object",
      "INVALID_RULES",
    );
  }

  const record = value as Record<string, unknown>;
  const operator = record.operator;

  if (operator !== "AND" && operator !== "OR") {
    throw new AppError(
      400,
      "Rule group operator must be AND or OR",
      "INVALID_RULES",
    );
  }

  const conditions = Array.isArray(record.conditions)
    ? record.conditions.map((condition) => condition as TargetingCondition)
    : [];
  const groups = Array.isArray(record.groups)
    ? record.groups.map(validateTargetingRuleGroup)
    : [];

  return {
    id: typeof record.id === "string" ? record.id : `group-${Date.now()}`,
    operator,
    conditions,
    groups,
  };
};

export const validateCreateTargetingSegmentDto = (
  body: unknown,
): CreateTargetingSegmentDto => {
  const record = asRecord(body);

  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    throw new AppError(400, "Segment name is required", "INVALID_NAME");
  }

  return {
    name: record.name.trim(),
    description:
      typeof record.description === "string"
        ? record.description.trim()
        : undefined,
    rules: validateTargetingRuleGroup(record.rules),
  };
};

export const validateUpdateTargetingSegmentDto = (
  body: unknown,
): UpdateTargetingSegmentDto => {
  const record = asRecord(body);
  const dto: UpdateTargetingSegmentDto = {};

  if ("name" in record) {
    if (typeof record.name !== "string" || record.name.trim().length === 0) {
      throw new AppError(400, "Segment name is required", "INVALID_NAME");
    }

    dto.name = record.name.trim();
  }

  if ("description" in record) {
    dto.description =
      typeof record.description === "string" ? record.description.trim() : "";
  }

  if ("rules" in record) {
    dto.rules = validateTargetingRuleGroup(record.rules);
  }

  return dto;
};

export const validateEvaluateRulesDto = (body: unknown): EvaluateRulesDto => {
  const record = asRecord(body);

  return {
    tenantId: typeof record.tenantId === "string" ? record.tenantId : "",
    rules: validateTargetingRuleGroup(record.rules),
    guideId: typeof record.guideId === "string" ? record.guideId : undefined,
    userId: typeof record.userId === "string" ? record.userId : undefined,
    sessionId:
      typeof record.sessionId === "string" ? record.sessionId : undefined,
    url: typeof record.url === "string" ? record.url : undefined,
    referrer: typeof record.referrer === "string" ? record.referrer : undefined,
    role: typeof record.role === "string" ? record.role : undefined,
    plan: typeof record.plan === "string" ? record.plan : undefined,
    accountCreatedAt:
      typeof record.accountCreatedAt === "string"
        ? record.accountCreatedAt
        : undefined,
    userProperties:
      typeof record.userProperties === "object" && record.userProperties != null
        ? (record.userProperties as Record<string, unknown>)
        : undefined,
    session:
      typeof record.session === "object" && record.session != null
        ? (record.session as EvaluateRulesDto["session"])
        : undefined,
    workflow:
      typeof record.workflow === "object" && record.workflow != null
        ? (record.workflow as EvaluateRulesDto["workflow"])
        : undefined,
    now: typeof record.now === "string" ? record.now : undefined,
  };
};
