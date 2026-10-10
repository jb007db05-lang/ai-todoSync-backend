import { AppError } from "../../utils/app-error.js";
import {
  TARGETING_CONDITION_TYPES,
  TARGETING_OPERATORS,
  type FrequencyRules,
  type ScheduleRules,
  type TargetingCondition,
  type TargetingConditionType,
  type TargetingOperator,
  type TargetingRuleGroup,
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

const MAX_GROUP_DEPTH = 5;
const MAX_CONDITIONS_PER_GROUP = 50;
const MAX_REGEX_LENGTH = 500;
const MAX_STRING_VALUE_LENGTH = 2000;

const invalidRules = (message: string): never => {
  throw new AppError(400, message, "INVALID_RULES");
};

const optionalNumber = (
  value: unknown,
  field: string,
  { min = 0, integer = false }: { min?: number; integer?: boolean } = {},
): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const num = typeof value === "string" ? Number(value) : value;
  if (
    typeof num !== "number" ||
    !Number.isFinite(num) ||
    num < min ||
    (integer && !Number.isInteger(num))
  ) {
    return invalidRules(
      `${field} must be ${integer ? "a whole number" : "a number"} of at least ${min}`,
    );
  }
  return num;
};

const validateCondition = (value: unknown): TargetingCondition => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return invalidRules("Each targeting condition must be an object");
  }
  const record = value as Record<string, unknown>;
  const type = record.type as TargetingConditionType;
  if (!TARGETING_CONDITION_TYPES.includes(type)) {
    return invalidRules(`Unknown targeting condition '${String(record.type)}'`);
  }
  const operator = record.operator as TargetingOperator | undefined;
  if (
    operator !== undefined &&
    operator !== null &&
    !TARGETING_OPERATORS.includes(operator)
  ) {
    return invalidRules(`Unknown targeting operator '${String(operator)}'`);
  }
  if (
    typeof record.value === "string" &&
    record.value.length > MAX_STRING_VALUE_LENGTH
  ) {
    return invalidRules(
      `Condition values must be at most ${MAX_STRING_VALUE_LENGTH} characters`,
    );
  }
  if (type === "URL_REGEX" || operator === "REGEX") {
    const pattern = String(record.value ?? "");
    if (pattern.length > MAX_REGEX_LENGTH) {
      return invalidRules(
        `Regex patterns must be at most ${MAX_REGEX_LENGTH} characters`,
      );
    }
    try {
      new RegExp(pattern);
    } catch {
      return invalidRules(`'${pattern}' is not a valid regular expression`);
    }
  }

  return {
    ...(record as unknown as TargetingCondition),
    id:
      typeof record.id === "string" && record.id
        ? record.id
        : `condition-${Math.random().toString(36).slice(2, 10)}`,
    type,
    ...(operator ? { operator } : {}),
    ...(record.windowDays !== undefined
      ? { windowDays: optionalNumber(record.windowDays, "windowDays") }
      : {}),
    ...(record.count !== undefined
      ? { count: optionalNumber(record.count, "count", { integer: true }) }
      : {}),
  };
};

const validateGroup = (value: unknown, depth: number): TargetingRuleGroup => {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new AppError(
      400,
      "Targeting rules must be an object",
      "INVALID_RULES",
    );
  }
  if (depth > MAX_GROUP_DEPTH) {
    return invalidRules(
      `Rule groups can be nested at most ${MAX_GROUP_DEPTH} levels deep`,
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

  const rawConditions = Array.isArray(record.conditions)
    ? record.conditions
    : [];
  if (rawConditions.length > MAX_CONDITIONS_PER_GROUP) {
    return invalidRules(
      `A rule group can hold at most ${MAX_CONDITIONS_PER_GROUP} conditions`,
    );
  }
  const conditions = rawConditions.map(validateCondition);
  const groups = Array.isArray(record.groups)
    ? record.groups.map((group) => validateGroup(group, depth + 1))
    : [];

  return {
    id: typeof record.id === "string" ? record.id : `group-${Date.now()}`,
    operator,
    conditions,
    groups,
  };
};

export const validateTargetingRuleGroup = (
  value: unknown,
): TargetingRuleGroup => validateGroup(value, 1);

/** Frequency caps: all optional, numbers must be non-negative. */
export const validateFrequencyRules = (value: unknown): FrequencyRules => {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    return invalidRules("frequencyRules must be an object");
  }
  const record = value as Record<string, unknown>;
  const rules: FrequencyRules = {};
  for (const flag of ["showOnceEver", "showOncePerSession"] as const) {
    if (record[flag] !== undefined && record[flag] !== null) {
      if (typeof record[flag] !== "boolean") {
        return invalidRules(`${flag} must be true or false`);
      }
      rules[flag] = record[flag] as boolean;
    }
  }
  const everyXDays = optionalNumber(record.everyXDays, "everyXDays");
  const maxDisplays = optionalNumber(record.maxDisplays, "maxDisplays", {
    min: 1,
    integer: true,
  });
  const cooldownHours = optionalNumber(record.cooldownHours, "cooldownHours");
  if (everyXDays !== undefined) rules.everyXDays = everyXDays;
  if (maxDisplays !== undefined) rules.maxDisplays = maxDisplays;
  if (cooldownHours !== undefined) rules.cooldownHours = cooldownHours;
  return rules;
};

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

/** Schedule: optional start/end dates plus recurring daily windows. */
export const validateScheduleRules = (value: unknown): ScheduleRules => {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    return invalidRules("scheduleRules must be an object");
  }
  const record = value as Record<string, unknown>;
  const toDate = (raw: unknown, field: string): Date | null => {
    if (raw === undefined || raw === null || raw === "") return null;
    const date =
      raw instanceof Date
        ? raw
        : typeof raw === "string" || typeof raw === "number"
          ? new Date(raw)
          : null;
    if (!date || Number.isNaN(date.getTime())) {
      return invalidRules(`${field} must be a valid date`);
    }
    return date;
  };
  const startsAt = toDate(record.startsAt, "startsAt");
  const endsAt = toDate(record.endsAt, "endsAt");
  if (startsAt && endsAt && startsAt >= endsAt) {
    return invalidRules("The schedule must end after it starts");
  }

  let timezone: string | undefined;
  if (record.timezone !== undefined && record.timezone !== null) {
    if (
      typeof record.timezone !== "string" ||
      !isValidTimeZone(record.timezone)
    ) {
      return invalidRules(
        `'${String(record.timezone)}' is not a valid time zone`,
      );
    }
    timezone = record.timezone;
  }

  let windows: ScheduleRules["windows"];
  if (record.windows !== undefined && record.windows !== null) {
    if (!Array.isArray(record.windows) || record.windows.length > 20) {
      return invalidRules("windows must be a list of at most 20 time windows");
    }
    windows = record.windows.map((raw) => {
      const w = (raw ?? {}) as Record<string, unknown>;
      if (
        typeof w.start !== "string" ||
        typeof w.end !== "string" ||
        !TIME_OF_DAY.test(w.start) ||
        !TIME_OF_DAY.test(w.end)
      ) {
        return invalidRules("Time windows need start and end times as HH:MM");
      }
      let daysOfWeek: number[] | undefined;
      if (w.daysOfWeek !== undefined && w.daysOfWeek !== null) {
        if (
          !Array.isArray(w.daysOfWeek) ||
          w.daysOfWeek.some(
            (d) =>
              typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6,
          )
        ) {
          return invalidRules(
            "daysOfWeek must list days from 0 (Sun) to 6 (Sat)",
          );
        }
        daysOfWeek = [...new Set(w.daysOfWeek as number[])].sort();
      }
      return {
        start: w.start,
        end: w.end,
        ...(daysOfWeek ? { daysOfWeek } : {}),
      };
    });
  }

  return {
    ...(startsAt ? { startsAt: startsAt.toISOString() } : {}),
    ...(endsAt ? { endsAt: endsAt.toISOString() } : {}),
    ...(timezone ? { timezone } : {}),
    ...(windows ? { windows } : {}),
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
