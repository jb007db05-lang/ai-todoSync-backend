import { AppError } from "../../utils/app-error.js";
import {
  GUIDE_PRIORITIES,
  GUIDE_STATUSES,
  SURVEY_QUESTION_TYPES,
  type GuidePriority,
  type GuideStatus,
  type SurveyQuestion,
  type SurveyQuestionType,
} from "../engagement/types.js";
import { validateTargetingRuleGroup } from "../targeting/validators.js";
import type {
  CreateSurveyDto,
  SubmitSurveyResponseDto,
  SurveyQueryDto,
  UpdateSurveyDto,
} from "./dtos.js";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new AppError(400, "Request body must be an object", "INVALID_BODY");
  }

  return value as Record<string, unknown>;
};

const normalizeQuestions = (value: unknown): SurveyQuestion[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((question, index) => {
    const record =
      typeof question === "object" && question != null
        ? (question as Record<string, unknown>)
        : {};
    const type = SURVEY_QUESTION_TYPES.includes(
      record.type as SurveyQuestionType,
    )
      ? (record.type as SurveyQuestionType)
      : "TEXT";

    return {
      id: typeof record.id === "string" ? record.id : `question-${index + 1}`,
      type,
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : `Question ${index + 1}`,
      description:
        typeof record.description === "string" ? record.description.trim() : "",
      required: record.required === true,
      options: Array.isArray(record.options)
        ? record.options.filter(
            (option): option is string => typeof option === "string",
          )
        : [],
      min: typeof record.min === "number" ? record.min : 0,
      max:
        typeof record.max === "number" ? record.max : type === "NPS" ? 10 : 5,
      branchConditions:
        typeof record.branchConditions === "object" &&
        record.branchConditions != null
          ? validateTargetingRuleGroup(record.branchConditions)
          : null,
    };
  });
};

export const validateCreateSurveyDto = (body: unknown): CreateSurveyDto => {
  const record = asRecord(body);

  if (typeof record.title !== "string" || record.title.trim().length === 0) {
    throw new AppError(400, "Survey title is required", "INVALID_TITLE");
  }

  const questions = normalizeQuestions(record.questions);
  if (questions.length === 0) {
    throw new AppError(
      400,
      "At least one survey question is required",
      "INVALID_QUESTIONS",
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
    questions,
    targetingRules:
      typeof record.targetingRules === "object" && record.targetingRules != null
        ? validateTargetingRuleGroup(record.targetingRules)
        : null,
    triggerRules:
      typeof record.triggerRules === "object" && record.triggerRules != null
        ? validateTargetingRuleGroup(record.triggerRules)
        : null,
    frequencyRules:
      typeof record.frequencyRules === "object" && record.frequencyRules != null
        ? (record.frequencyRules as CreateSurveyDto["frequencyRules"])
        : { showOncePerSession: true },
    scheduleRules:
      typeof record.scheduleRules === "object" && record.scheduleRules != null
        ? (record.scheduleRules as CreateSurveyDto["scheduleRules"])
        : {},
    metadata:
      typeof record.metadata === "object" && record.metadata != null
        ? (record.metadata as Record<string, unknown>)
        : {},
  };
};

export const validateUpdateSurveyDto = (body: unknown): UpdateSurveyDto => {
  const record = asRecord(body);
  const dto: UpdateSurveyDto = {};

  if ("title" in record) {
    if (typeof record.title !== "string" || record.title.trim().length === 0) {
      throw new AppError(400, "Survey title is required", "INVALID_TITLE");
    }
    dto.title = record.title.trim();
  }

  if ("description" in record) {
    dto.description =
      typeof record.description === "string" ? record.description.trim() : "";
  }

  if ("status" in record) {
    if (!GUIDE_STATUSES.includes(record.status as GuideStatus)) {
      throw new AppError(400, "Survey status is invalid", "INVALID_STATUS");
    }
    dto.status = record.status as GuideStatus;
  }

  if ("priority" in record) {
    if (!GUIDE_PRIORITIES.includes(record.priority as GuidePriority)) {
      throw new AppError(400, "Survey priority is invalid", "INVALID_PRIORITY");
    }
    dto.priority = record.priority as GuidePriority;
  }

  if ("questions" in record) {
    dto.questions = normalizeQuestions(record.questions);
  }

  if ("targetingRules" in record) {
    dto.targetingRules =
      typeof record.targetingRules === "object" && record.targetingRules != null
        ? validateTargetingRuleGroup(record.targetingRules)
        : null;
  }

  if ("triggerRules" in record) {
    dto.triggerRules =
      typeof record.triggerRules === "object" && record.triggerRules != null
        ? validateTargetingRuleGroup(record.triggerRules)
        : null;
  }

  if ("frequencyRules" in record) {
    dto.frequencyRules =
      typeof record.frequencyRules === "object" && record.frequencyRules != null
        ? (record.frequencyRules as CreateSurveyDto["frequencyRules"])
        : {};
  }

  if ("scheduleRules" in record) {
    dto.scheduleRules =
      typeof record.scheduleRules === "object" && record.scheduleRules != null
        ? (record.scheduleRules as CreateSurveyDto["scheduleRules"])
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

export const validateSubmitSurveyResponseDto = (
  body: unknown,
): SubmitSurveyResponseDto => {
  const record = asRecord(body);

  if (typeof record.answers !== "object" || record.answers == null) {
    throw new AppError(400, "Survey answers are required", "INVALID_ANSWERS");
  }

  return {
    userId: typeof record.userId === "string" ? record.userId : undefined,
    sessionId:
      typeof record.sessionId === "string" ? record.sessionId : undefined,
    answers: record.answers as Record<string, unknown>,
    metadata:
      typeof record.metadata === "object" && record.metadata != null
        ? (record.metadata as Record<string, unknown>)
        : {},
  };
};

export const validateSurveyQueryDto = (
  query: Record<string, unknown>,
): SurveyQueryDto => ({
  status: GUIDE_STATUSES.includes(query.status as GuideStatus)
    ? (query.status as GuideStatus)
    : undefined,
  search: typeof query.search === "string" ? query.search.trim() : undefined,
});
