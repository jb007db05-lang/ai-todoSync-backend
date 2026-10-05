import { AppError } from "../../utils/app-error.js";
import type { SurveyQuestion } from "../engagement/types.js";

const MAX_TEXT_LENGTH = 5000;
const MAX_URL_LENGTH = 2048;
const MAX_CONTACT_BYTES = 2048;

const SCALE_TYPES = new Set([
  "NPS",
  "RATING_SCALE",
  "OPINION_SCALE",
  "CSAT",
  "CES",
]);
const CHOICE_TYPES = new Set(["SINGLE_CHOICE", "DROPDOWN"]);

const invalid = (question: SurveyQuestion, reason: string): never => {
  throw new AppError(
    400,
    `Answer to '${question.title}' ${reason}.`,
    "INVALID_ANSWER",
  );
};

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

const toNumber = (question: SurveyQuestion, value: unknown): number => {
  const num = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) {
    invalid(question, "must be a number");
  }
  return num as number;
};

const normalizeAnswer = (question: SurveyQuestion, value: unknown): unknown => {
  const options = (question.options ?? []).map((o) => o.trim());

  if (SCALE_TYPES.has(question.type)) {
    const num = toNumber(question, value);
    const min = question.type === "NPS" ? 0 : (question.min ?? 0);
    const max = question.type === "NPS" ? 10 : (question.max ?? 10);
    if (question.type === "NPS" && !Number.isInteger(num)) {
      invalid(question, "must be a whole number from 0 to 10");
    }
    if (num < min || num > max) {
      invalid(question, `must be between ${min} and ${max}`);
    }
    return num;
  }

  if (CHOICE_TYPES.has(question.type)) {
    if (typeof value !== "string")
      invalid(question, "must be one of the options");
    const choice = (value as string).trim();
    if (options.length > 0 && !options.includes(choice)) {
      invalid(question, "must be one of the options");
    }
    return choice;
  }

  if (question.type === "MULTI_CHOICE") {
    const values = Array.isArray(value) ? value : [value];
    const choices = values.map((v) => {
      if (typeof v !== "string") invalid(question, "must be a list of options");
      return (v as string).trim();
    });
    if (options.length > 0 && choices.some((c) => !options.includes(c))) {
      invalid(question, "contains a value that is not an option");
    }
    return [...new Set(choices)];
  }

  if (question.type === "YES_NO") {
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    if (["yes", "true", "1"].includes(text)) return true;
    if (["no", "false", "0"].includes(text)) return false;
    return invalid(question, "must be yes or no");
  }

  if (question.type === "TEXT" || question.type === "TEXTAREA") {
    if (typeof value !== "string") invalid(question, "must be text");
    const text = (value as string).trim();
    if (text.length > MAX_TEXT_LENGTH) {
      invalid(question, `must be at most ${MAX_TEXT_LENGTH} characters`);
    }
    return text;
  }

  if (question.type === "EMOJI") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length <= 32)
      return value.trim();
    return invalid(question, "must be an emoji or score");
  }

  if (question.type === "FILE_UPLOAD") {
    if (typeof value !== "string" || value.length > MAX_URL_LENGTH) {
      invalid(question, "must be a file URL");
    }
    return value;
  }

  if (question.type === "CONTACT") {
    const size = Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
    if (size > MAX_CONTACT_BYTES) invalid(question, "is too large");
    return value;
  }

  return value;
};

/** Accepts { [questionId]: value } or [{ questionId, value }] (the SDK's shape). */
export const toAnswerRecord = (raw: unknown): Record<string, unknown> => {
  const answers: Record<string, unknown> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).questionId === "string"
      ) {
        const { questionId, value } = entry as {
          questionId: string;
          value: unknown;
        };
        answers[questionId] = value;
      }
    }
  } else if (raw && typeof raw === "object") {
    Object.assign(answers, raw as Record<string, unknown>);
  }
  return answers;
};

/**
 * Validates and normalizes submitted answers against the survey's questions.
 * Unknown question ids are dropped. Required questions are enforced unless
 * the survey branches (a skipped branch legitimately leaves them empty).
 */
export const validateSurveyAnswers = (
  questions: SurveyQuestion[],
  answers: Record<string, unknown>,
): Record<string, unknown> => {
  const branching = questions.some((q) => q.branchConditions);
  const normalized: Record<string, unknown> = {};

  for (const question of questions) {
    const value = answers[question.id];
    if (isEmpty(value)) {
      if (question.required && !branching) {
        throw new AppError(
          400,
          `'${question.title}' is required.`,
          "ANSWER_REQUIRED",
        );
      }
      continue;
    }
    normalized[question.id] = normalizeAnswer(question, value);
  }

  if (Object.keys(normalized).length === 0) {
    throw new AppError(
      400,
      "Submit an answer to at least one question.",
      "INVALID_ANSWERS",
    );
  }

  return normalized;
};

/** Problems that stop a survey from going live. */
export const assertSurveyPublishable = (questions: SurveyQuestion[]): void => {
  if (questions.length === 0) {
    throw new AppError(
      400,
      "A survey needs at least one question before it can go live.",
      "SURVEY_NOT_PUBLISHABLE",
    );
  }
  const ids = new Set<string>();
  for (const q of questions) {
    if (ids.has(q.id)) {
      throw new AppError(
        400,
        `Question id '${q.id}' is used twice.`,
        "SURVEY_NOT_PUBLISHABLE",
      );
    }
    ids.add(q.id);
    if (
      (CHOICE_TYPES.has(q.type) || q.type === "MULTI_CHOICE") &&
      (q.options ?? []).filter((o) => o.trim()).length < 2
    ) {
      throw new AppError(
        400,
        `'${q.title}' needs at least two options.`,
        "SURVEY_NOT_PUBLISHABLE",
      );
    }
    if (
      SCALE_TYPES.has(q.type) &&
      q.type !== "NPS" &&
      (q.min ?? 0) >= (q.max ?? 10)
    ) {
      throw new AppError(
        400,
        `'${q.title}' needs a minimum below its maximum.`,
        "SURVEY_NOT_PUBLISHABLE",
      );
    }
  }
};
