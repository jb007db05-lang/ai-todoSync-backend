import type { SurveyQuestion } from "../../src/modules/engagement/types.js";
import { describeValue, pad, type CatalogCase } from "../support/catalog.js";

/**
 * Answer validation for every survey question type: accepted values (and
 * what they normalize to) and rejected values (and why).
 */
export interface AnswerCase {
  id: string;
  question: SurveyQuestion;
  value: unknown;
  /** Normalized value stored, or an error pattern when rejected. */
  expect: { stored: unknown } | { error: RegExp };
}

const q = (
  type: SurveyQuestion["type"],
  extra: Partial<SurveyQuestion> = {},
): SurveyQuestion => ({
  id: "q1",
  type,
  title: `${type} question`,
  ...extra,
});

const OPTIONS = ["Red", "Green", "Blue", "Amber", "Teal"];

const raw: Array<Omit<AnswerCase, "id">> = [];
const ok = (question: SurveyQuestion, value: unknown, stored: unknown) =>
  raw.push({ question, value, expect: { stored } });
const bad = (question: SurveyQuestion, value: unknown, error: RegExp) =>
  raw.push({ question, value, expect: { error } });

// ---- NPS: integers 0..10, numeric strings accepted
const nps = q("NPS");
for (let score = 0; score <= 10; score++) {
  ok(nps, score, score);
  ok(nps, String(score), score);
  ok(nps, ` ${score} `, score);
}
for (const value of [-1, 11, 12, 100, -10]) bad(nps, value, /between 0 and 10/);
for (const value of [0.5, 7.5, 9.99, 3.14]) bad(nps, value, /whole number/);
for (const value of ["abc", "ten", {}, true, NaN, Infinity]) {
  bad(nps, value, /must be a number|whole number|between/);
}
// An empty list is "no answer", not a wrong number.
bad(nps, [], /at least one question/);

// ---- Numeric scales with custom ranges
const scales: Array<[SurveyQuestion["type"], number, number]> = [
  ["RATING_SCALE", 1, 5],
  ["OPINION_SCALE", 0, 10],
  ["CSAT", 1, 5],
  ["CES", 1, 7],
];
for (const [type, min, max] of scales) {
  const question = q(type, { min, max });
  for (let v = min; v <= max; v++) ok(question, v, v);
  ok(question, String(max), max);
  ok(question, (min + max) / 2, (min + max) / 2);
  bad(question, min - 1, new RegExp(`between ${min} and ${max}`));
  bad(question, max + 1, new RegExp(`between ${min} and ${max}`));
  bad(question, max + 0.5, new RegExp(`between ${min} and ${max}`));
  bad(question, "not-a-number", /must be a number/);
  bad(question, { score: 3 }, /must be a number/);
}

// ---- Single choice and dropdown: must be one of the options
for (const type of ["SINGLE_CHOICE", "DROPDOWN"] as const) {
  const question = q(type, { options: OPTIONS });
  for (const option of OPTIONS) {
    ok(question, option, option);
    ok(question, `  ${option}  `, option);
  }
  for (const value of ["red", "Purple", "Red,Green", "RED"]) {
    bad(question, value, /one of the options/);
  }
  for (const value of [1, true, ["Red"], { v: "Red" }]) {
    bad(question, value, /one of the options/);
  }
  // Without configured options any string is accepted.
  ok(q(type, { options: [] }), "Anything", "Anything");
}

// ---- Multi choice: subset of options, de-duplicated, single value wrapped
const multi = q("MULTI_CHOICE", { options: OPTIONS });
ok(multi, ["Red"], ["Red"]);
ok(multi, "Green", ["Green"]);
ok(multi, ["Red", "Blue", "Teal"], ["Red", "Blue", "Teal"]);
ok(multi, ["Red", "Red", "Blue"], ["Red", "Blue"]);
ok(multi, [" Amber ", "Teal"], ["Amber", "Teal"]);
ok(multi, OPTIONS, OPTIONS);
for (let i = 0; i < OPTIONS.length; i++) {
  ok(multi, OPTIONS.slice(0, i + 1), OPTIONS.slice(0, i + 1));
}
for (const value of [["Purple"], ["Red", "Purple"], ["red"]]) {
  bad(multi, value, /not an option/);
}
for (const value of [[1], [true], [{}]]) bad(multi, value, /list of options/);

// ---- Yes/No: booleans and common spellings
const yesNo = q("YES_NO");
for (const value of [true, "yes", "YES", "Yes", "true", "TRUE", "1", 1]) {
  ok(yesNo, value, true);
}
for (const value of [false, "no", "NO", "No", "false", "FALSE", "0", 0]) {
  ok(yesNo, value, false);
}
for (const value of ["maybe", "y", "n", "2", 2, "si"])
  bad(yesNo, value, /yes or no/);

// ---- Text and textarea: trimmed, max 5000 characters
for (const type of ["TEXT", "TEXTAREA"] as const) {
  const question = q(type);
  ok(question, "Great product", "Great product");
  ok(question, "  padded  ", "padded");
  ok(question, "Ünïcödé ✓ 漢字 😀", "Ünïcödé ✓ 漢字 😀");
  ok(question, "<script>alert(1)</script>", "<script>alert(1)</script>");
  ok(question, "x".repeat(5000), "x".repeat(5000));
  ok(question, "line1\nline2", "line1\nline2");
  bad(question, "x".repeat(5001), /at most 5000/);
  bad(question, "y".repeat(20000), /at most 5000/);
  for (const value of [42, true, ["text"], { text: "a" }]) {
    bad(question, value, /must be text/);
  }
}

// ---- Emoji: short string or numeric score
const emoji = q("EMOJI");
for (const value of ["😀", "😐", "😡", "🙂", "happy", "5"])
  ok(emoji, value, value);
for (const value of [1, 3, 5]) ok(emoji, value, value);
bad(emoji, "x".repeat(33), /emoji or score/);
bad(emoji, { e: "😀" }, /emoji or score/);

// ---- File upload: URL string up to 2048 characters
const file = q("FILE_UPLOAD");
ok(file, "https://cdn.example.com/a.png", "https://cdn.example.com/a.png");
ok(
  file,
  `https://cdn.example.com/${"a".repeat(2000)}`,
  `https://cdn.example.com/${"a".repeat(2000)}`,
);
bad(file, `https://cdn.example.com/${"a".repeat(2100)}`, /file URL/);
bad(file, 12345, /file URL/);

// ---- Contact: object or string up to 2 KB
const contact = q("CONTACT");
ok(contact, { email: "a@b.co" }, { email: "a@b.co" });
ok(
  contact,
  { name: "Ada", phone: "+44 20 0000 0000" },
  { name: "Ada", phone: "+44 20 0000 0000" },
);
ok(contact, "a@b.co", "a@b.co");
bad(contact, { note: "z".repeat(3000) }, /too large/);

export const answerCases: AnswerCase[] = raw.map((c, i) => ({
  id: `SRV-ANS-${pad(i + 1)}`,
  ...c,
}));

/** Whole-survey rules: required questions, unknown ids, branching, empty submissions. */
export interface SubmissionCase {
  id: string;
  title: string;
  questions: SurveyQuestion[];
  answers: Record<string, unknown>;
  expect: { stored: Record<string, unknown> } | { error: RegExp };
}

const base: SurveyQuestion[] = [
  { id: "nps", type: "NPS", title: "Recommend", required: true },
  { id: "why", type: "TEXT", title: "Why" },
  {
    id: "plan",
    type: "SINGLE_CHOICE",
    title: "Plan",
    options: ["Free", "Pro"],
    required: true,
  },
];

const submissions: Array<Omit<SubmissionCase, "id">> = [
  {
    title: "all answered",
    questions: base,
    answers: { nps: 9, why: "fast", plan: "Pro" },
    expect: { stored: { nps: 9, why: "fast", plan: "Pro" } },
  },
  {
    title: "optional skipped",
    questions: base,
    answers: { nps: 2, plan: "Free" },
    expect: { stored: { nps: 2, plan: "Free" } },
  },
  {
    title: "required missing",
    questions: base,
    answers: { why: "x", plan: "Pro" },
    expect: { error: /'Recommend' is required/ },
  },
  {
    title: "second required missing",
    questions: base,
    answers: { nps: 5 },
    expect: { error: /'Plan' is required/ },
  },
  {
    title: "required empty string",
    questions: base,
    answers: { nps: 5, plan: "  " },
    expect: { error: /'Plan' is required/ },
  },
  {
    title: "required null",
    questions: base,
    answers: { nps: null, plan: "Pro" },
    expect: { error: /'Recommend' is required/ },
  },
  {
    title: "unknown ids dropped",
    questions: base,
    answers: { nps: 7, plan: "Pro", hacker: "x", __proto__x: 1 },
    expect: { stored: { nps: 7, plan: "Pro" } },
  },
  {
    title: "nothing answered",
    questions: [{ id: "why", type: "TEXT", title: "Why" }],
    answers: {},
    expect: { error: /at least one question/ },
  },
  {
    title: "only unknown ids",
    questions: [{ id: "why", type: "TEXT", title: "Why" }],
    answers: { other: "x" },
    expect: { error: /at least one question/ },
  },
  {
    title: "branching survey skips required",
    questions: [
      { id: "nps", type: "NPS", title: "Recommend", required: true },
      {
        id: "detail",
        type: "TEXT",
        title: "Detail",
        required: true,
        branchConditions: { id: "b", operator: "AND", conditions: [] },
      },
    ],
    answers: { nps: 3 },
    expect: { stored: { nps: 3 } },
  },
  {
    title: "empty array for required multi choice",
    questions: [
      {
        id: "m",
        type: "MULTI_CHOICE",
        title: "Pick",
        options: ["A", "B"],
        required: true,
      },
    ],
    answers: { m: [] },
    expect: { error: /'Pick' is required/ },
  },
];

// Generated: N-question surveys with every question answered.
for (let n = 2; n <= 40; n++) {
  const questions: SurveyQuestion[] = Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    type: i % 3 === 0 ? "NPS" : i % 3 === 1 ? "TEXT" : "YES_NO",
    title: `Question ${i}`,
    required: i % 2 === 0,
  }));
  const answers: Record<string, unknown> = {};
  const stored: Record<string, unknown> = {};
  questions.forEach((question, i) => {
    if (question.type === "NPS") {
      answers[question.id] = String(i % 11);
      stored[question.id] = i % 11;
    } else if (question.type === "TEXT") {
      answers[question.id] = ` answer ${i} `;
      stored[question.id] = `answer ${i}`;
    } else {
      answers[question.id] = i % 2 === 0 ? "yes" : "no";
      stored[question.id] = i % 2 === 0;
    }
  });
  submissions.push({
    title: `${n}-question survey fully answered`,
    questions,
    answers,
    expect: { stored },
  });
}

export const submissionCases: SubmissionCase[] = submissions.map((c, i) => ({
  id: `SRV-SUB-${pad(i + 1)}`,
  ...c,
}));

/** Publishing rules: what stops a survey from going live. */
export interface PublishCase {
  id: string;
  title: string;
  questions: SurveyQuestion[];
  publishable: boolean;
  error?: RegExp;
}

const publish: Array<Omit<PublishCase, "id">> = [
  {
    title: "no questions",
    questions: [],
    publishable: false,
    error: /at least one question/,
  },
  {
    title: "duplicate ids",
    questions: [
      { id: "a", type: "TEXT", title: "A" },
      { id: "a", type: "TEXT", title: "B" },
    ],
    publishable: false,
    error: /used twice/,
  },
  {
    title: "NPS only",
    questions: [{ id: "a", type: "NPS", title: "A" }],
    publishable: true,
  },
  {
    title: "rating with min >= max",
    questions: [{ id: "a", type: "RATING_SCALE", title: "A", min: 5, max: 5 }],
    publishable: false,
    error: /minimum below its maximum/,
  },
  {
    title: "rating with min > max",
    questions: [{ id: "a", type: "CSAT", title: "A", min: 7, max: 1 }],
    publishable: false,
    error: /minimum below its maximum/,
  },
];
for (const type of ["SINGLE_CHOICE", "DROPDOWN", "MULTI_CHOICE"] as const) {
  publish.push({
    title: `${type} with no options`,
    questions: [{ id: "a", type, title: "A", options: [] }],
    publishable: false,
    error: /at least two options/,
  });
  publish.push({
    title: `${type} with one option`,
    questions: [{ id: "a", type, title: "A", options: ["Only"] }],
    publishable: false,
    error: /at least two options/,
  });
  publish.push({
    title: `${type} with blank options`,
    questions: [{ id: "a", type, title: "A", options: [" ", "X"] }],
    publishable: false,
    error: /at least two options/,
  });
  for (let n = 2; n <= 6; n++) {
    publish.push({
      title: `${type} with ${n} options`,
      questions: [{ id: "a", type, title: "A", options: OPTIONS.slice(0, n) }],
      publishable: true,
    });
  }
}
for (const type of [
  "TEXT",
  "TEXTAREA",
  "YES_NO",
  "EMOJI",
  "FILE_UPLOAD",
  "CONTACT",
  "NPS",
] as const) {
  publish.push({
    title: `single ${type} question`,
    questions: [{ id: "a", type, title: "A" }],
    publishable: true,
  });
}

export const publishCases: PublishCase[] = publish.map((c, i) => ({
  id: `SRV-PUB-${pad(i + 1)}`,
  ...c,
}));

const FILE = "tests/unit/survey-answers.test.ts";

export const catalog = (): CatalogCase[] => [
  ...answerCases.map((c) => ({
    id: c.id,
    module: "Surveys",
    feature: "Answer validation",
    title: `${c.question.type}${c.question.min !== undefined ? ` [${c.question.min}-${c.question.max}]` : ""} answer ${describeValue(c.value).slice(0, 60)}`,
    preconditions: `Survey with one ${c.question.type} question${c.question.options?.length ? ` (options: ${c.question.options.join(", ")})` : ""}`,
    steps: `Submit answer ${describeValue(c.value).slice(0, 120)}`,
    expected:
      "stored" in c.expect
        ? `Accepted; stored as ${describeValue(c.expect.stored).slice(0, 120)}`
        : `Rejected with 400 (${c.expect.error.source})`,
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...submissionCases.map((c) => ({
    id: c.id,
    module: "Surveys",
    feature: "Response submission rules",
    title: c.title,
    preconditions: `Survey with ${c.questions.length} question(s)`,
    steps: `Submit answers ${describeValue(c.answers).slice(0, 120)}`,
    expected:
      "stored" in c.expect
        ? "Accepted; only known questions stored, values normalized"
        : `Rejected with 400 (${c.expect.error.source})`,
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...publishCases.map((c) => ({
    id: c.id,
    module: "Surveys",
    feature: "Publishing rules",
    title: c.title,
    preconditions: "Draft survey",
    steps: "Set the survey status to LIVE",
    expected: c.publishable
      ? "Survey goes live"
      : `Rejected with 400 (${c.error?.source})`,
    level: "unit" as const,
    automatedBy: FILE,
  })),
];
