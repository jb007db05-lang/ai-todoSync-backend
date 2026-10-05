import type {
  FrequencyRules,
  ScheduleRules,
  TargetingCondition,
  TargetingRuleGroup,
  TargetingRuntimeContext,
} from "../../src/modules/engagement/types.js";
import { describeValue, pad, type CatalogCase } from "../support/catalog.js";

const DAY = 86_400_000;
const daysAgo = (days: number) =>
  new Date(Date.now() - days * DAY - DAY / 2).toISOString(); // mid-day: floor is exact

// ---------------------------------------------------------------- conditions
export interface ConditionCase {
  id: string;
  title: string;
  condition: TargetingCondition;
  context: Omit<TargetingRuntimeContext, "tenantId"> & { tenantId?: string };
  matched: boolean;
}

const conditions: Array<Omit<ConditionCase, "id">> = [];
const add = (
  title: string,
  condition: Omit<TargetingCondition, "id">,
  context: ConditionCase["context"],
  matched: boolean,
) =>
  conditions.push({
    title,
    condition: { id: "c", ...condition },
    context,
    matched,
  });

// Exact string matches.
const exact: Array<
  [TargetingCondition["type"], keyof TargetingRuntimeContext, string[]]
> = [
  [
    "URL_EQUALS",
    "url",
    [
      "https://app.acme.com/",
      "https://app.acme.com/billing",
      "https://app.acme.com/settings?tab=team",
    ],
  ],
  [
    "REFERRER_EQUALS",
    "referrer",
    ["https://google.com/", "https://news.ycombinator.com/", ""],
  ],
  ["ROLE_EQUALS", "role", ["ADMIN", "MEMBER", "OWNER", "viewer"]],
  ["PLAN_EQUALS", "plan", ["free", "pro", "enterprise", "trial"]],
  ["TENANT_EQUALS", "tenantId", ["tenant-1", "tenant-2"]],
];
for (const [type, field, values] of exact) {
  for (const value of values) {
    add(`${type} "${value}" equal`, { type, value }, { [field]: value }, true);
    add(
      `${type} "${value}" differs`,
      { type, value },
      { [field]: `${value}x` },
      false,
    );
    add(
      `${type} "${value}" case differs`,
      { type, value },
      {
        [field]:
          value.toUpperCase() === value
            ? value.toLowerCase()
            : value.toUpperCase(),
      },
      value.toUpperCase() === value.toLowerCase(),
    );
  }
  if (field !== "tenantId") {
    add(`${type} with context missing`, { type, value: "x" }, {}, false);
  }
}

// Substring matches.
const contains: Array<
  [TargetingCondition["type"], keyof TargetingRuntimeContext]
> = [
  ["URL_CONTAINS", "url"],
  ["REFERRER_CONTAINS", "referrer"],
];
for (const [type, field] of contains) {
  const actual = "https://app.acme.com/projects/42/board?view=kanban";
  for (const needle of [
    "/projects",
    "acme.com",
    "view=kanban",
    "42",
    "https://",
    actual,
  ]) {
    add(
      `${type} "${needle}" present`,
      { type, value: needle },
      { [field]: actual },
      true,
    );
  }
  for (const needle of ["/billing", "ACME", "view=list", "projects/43"]) {
    add(
      `${type} "${needle}" absent`,
      { type, value: needle },
      { [field]: actual },
      false,
    );
  }
  add(`${type} with context missing`, { type, value: "/x" }, {}, false);
}

// Regex matches, including invalid patterns.
const url = "https://app.acme.com/projects/42/board";
for (const [pattern, matched] of [
  ["^https://", true],
  ["/projects/\\d+", true],
  ["board$", true],
  ["acme\\.com/(projects|tasks)", true],
  ["^http://", false],
  ["/projects/[a-z]+/", false],
  ["billing", false],
] as const) {
  add(
    `URL_REGEX /${pattern}/`,
    { type: "URL_REGEX", value: pattern },
    { url },
    matched,
  );
}
for (const pattern of ["([", "*bad", "(?<", "[z-a]"]) {
  add(
    `URL_REGEX invalid /${pattern}/ never matches`,
    { type: "URL_REGEX", value: pattern },
    { url },
    false,
  );
}

// Numeric comparisons for every numeric attribute and operator.
type Numeric =
  | "ACCOUNT_AGE"
  | "SESSION_DURATION"
  | "SESSION_COUNT"
  | "ENGAGEMENT_SCORE";
const numericContext = (
  type: Numeric,
  actual: number,
): ConditionCase["context"] => {
  switch (type) {
    case "ACCOUNT_AGE":
      return { accountCreatedAt: daysAgo(actual) };
    case "SESSION_DURATION":
      return { session: { durationSeconds: actual } };
    case "SESSION_COUNT":
      return { session: { count: actual } };
    default:
      return { session: { engagementScore: actual } };
  }
};
const operators: Array<
  [
    TargetingCondition["operator"] | undefined,
    (a: number, e: number) => boolean,
  ]
> = [
  ["LESS_THAN", (a, e) => a < e],
  ["LESS_THAN_OR_EQUAL", (a, e) => a <= e],
  ["GREATER_THAN", (a, e) => a > e],
  ["GREATER_THAN_OR_EQUAL", (a, e) => a >= e],
  ["EQUALS", (a, e) => a === e],
  [undefined, (a, e) => a >= e], // default operator
];
for (const type of [
  "ACCOUNT_AGE",
  "SESSION_DURATION",
  "SESSION_COUNT",
  "ENGAGEMENT_SCORE",
] as const) {
  const expected = 10;
  for (const [operator, compare] of operators) {
    for (const actual of [5, 10, 15]) {
      add(
        `${type} ${operator ?? "(default ≥)"} ${expected} with actual ${actual}`,
        { type, operator, value: expected },
        numericContext(type, actual),
        compare(actual, expected),
      );
    }
  }
  add(`${type} unavailable in context`, { type, value: 1 }, {}, false);
}

// Completed workflows.
for (const [workflow, completed, matched] of [
  ["onboarding", ["onboarding", "billing"], true],
  ["billing", ["onboarding", "billing"], true],
  ["export", ["onboarding"], false],
  ["onboarding", [], false],
] as const) {
  add(
    `COMPLETED_WORKFLOW "${workflow}"`,
    { type: "COMPLETED_WORKFLOW", value: workflow },
    { workflow: { completed: [...completed] } },
    matched,
  );
}
add(
  "COMPLETED_WORKFLOW without workflow context",
  { type: "COMPLETED_WORKFLOW", value: "x" },
  {},
  false,
);

// Runtime signals.
for (const [type, eventName] of [
  ["EXIT_INTENT", "exit_intent"],
  ["IDLE_TIMEOUT", "idle_timeout"],
] as const) {
  add(`${type} on ${eventName}`, { type }, { eventName }, true);
  add(`${type} on another event`, { type }, { eventName: "page" }, false);
  add(`${type} with no event`, { type }, {}, false);
}

// Conditions owned by the frequency engine always pass here.
for (const type of [
  "SHOW_ONCE",
  "SHOW_EVERY_X_DAYS",
  "COOLDOWN",
  "TIME_WINDOW",
] as const) {
  add(`${type} defers to frequency engine`, { type }, {}, true);
}
add(
  "unknown condition type fails closed",
  { type: "NOT_A_TYPE" as TargetingCondition["type"] },
  { url },
  false,
);

export const conditionCases: ConditionCase[] = conditions.map((c, i) => ({
  id: `TGT-CND-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- groups
export interface GroupCase {
  id: string;
  title: string;
  rules: TargetingRuleGroup;
  context: Omit<TargetingRuntimeContext, "tenantId">;
  eligible: boolean;
}

const groups: Array<Omit<GroupCase, "id">> = [];
const leaf = (id: string, pass: boolean): TargetingCondition => ({
  id,
  type: "ROLE_EQUALS",
  value: pass ? "ADMIN" : "NOBODY",
});
const ctx = { role: "ADMIN" };

groups.push({
  title: "empty AND group",
  rules: { id: "g", operator: "AND" },
  context: ctx,
  eligible: true,
});
groups.push({
  title: "empty OR group",
  rules: { id: "g", operator: "OR", conditions: [] },
  context: ctx,
  eligible: true,
});

// Every combination of 1-4 conditions under AND and OR.
for (let n = 1; n <= 4; n++) {
  for (let mask = 0; mask < 1 << n; mask++) {
    const bits = Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i)));
    for (const operator of ["AND", "OR"] as const) {
      groups.push({
        title: `${operator} of [${bits.map((b) => (b ? "T" : "F")).join(",")}]`,
        rules: {
          id: "g",
          operator,
          conditions: bits.map((b, i) => leaf(`c${i}`, b)),
        },
        context: ctx,
        eligible: operator === "AND" ? bits.every(Boolean) : bits.some(Boolean),
      });
    }
  }
}

// Nested: outer(AND|OR) of [condition, inner(AND|OR) of two conditions].
for (const outer of ["AND", "OR"] as const) {
  for (const inner of ["AND", "OR"] as const) {
    for (let mask = 0; mask < 8; mask++) {
      const [a, b, c] = [0, 1, 2].map((i) => Boolean(mask & (1 << i)));
      const innerResult = inner === "AND" ? b && c : b || c;
      groups.push({
        title: `${outer}(${a ? "T" : "F"}, ${inner}(${b ? "T" : "F"},${c ? "T" : "F"}))`,
        rules: {
          id: "outer",
          operator: outer,
          conditions: [leaf("a", a)],
          groups: [
            {
              id: "inner",
              operator: inner,
              conditions: [leaf("b", b), leaf("c", c)],
            },
          ],
        },
        context: ctx,
        eligible: outer === "AND" ? a && innerResult : a || innerResult,
      });
    }
  }
}

// Deep nesting: 5 levels of AND, failing at each depth.
for (let failAt = -1; failAt < 5; failAt++) {
  let rules: TargetingRuleGroup = {
    id: "l5",
    operator: "AND",
    conditions: [leaf("d5", failAt !== 5)],
  };
  for (let level = 4; level >= 0; level--) {
    rules = {
      id: `l${level}`,
      operator: "AND",
      conditions: [leaf(`d${level}`, failAt !== level)],
      groups: [rules],
    };
  }
  groups.push({
    title:
      failAt < 0
        ? "5-level AND all pass"
        : `5-level AND fails at depth ${failAt}`,
    rules,
    context: ctx,
    eligible: failAt < 0,
  });
}

export const groupCases: GroupCase[] = groups.map((c, i) => ({
  id: `TGT-GRP-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- schedule
export interface ScheduleCase {
  id: string;
  title: string;
  schedule: ScheduleRules;
  eligible: boolean;
}

const now = Date.now();
const iso = (offsetDays: number) =>
  new Date(now + offsetDays * DAY).toISOString();
const schedules: Array<Omit<ScheduleCase, "id">> = [
  { title: "no schedule", schedule: {}, eligible: true },
];
for (const start of [-30, -1, 1, 30, null] as const) {
  for (const end of [-30, -1, 1, 30, null] as const) {
    const startsAt = start === null ? null : iso(start);
    const endsAt = end === null ? null : iso(end);
    const started = start === null || start < 0;
    const notEnded = end === null || end > 0;
    schedules.push({
      title: `starts ${start ?? "—"}d, ends ${end ?? "—"}d`,
      schedule: { startsAt, endsAt },
      eligible: started && notEnded,
    });
  }
}
schedules.push({
  title: "invalid dates are ignored",
  schedule: { startsAt: "not-a-date", endsAt: "also-bad" },
  eligible: true,
});

export const scheduleCases: ScheduleCase[] = schedules.map((c, i) => ({
  id: `TGT-SCH-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- behavior (event counts)
export interface BehaviorCase {
  id: string;
  title: string;
  condition: TargetingCondition;
  /** Events the user has fired (count returned by the store). */
  storedCount: number;
  matched: boolean;
}

const behavior: Array<Omit<BehaviorCase, "id">> = [];
for (const threshold of [1, 2, 3, 5, 10]) {
  for (const stored of [0, threshold - 1, threshold, threshold + 4]) {
    if (stored < 0) continue;
    behavior.push({
      title: `EVENT_TRIGGERED ≥${threshold} with ${stored} events`,
      condition: {
        id: "b",
        type: "EVENT_TRIGGERED",
        eventName: "checkout_started",
        count: threshold,
      },
      storedCount: stored,
      matched: stored >= threshold,
    });
  }
}
for (const stored of [0, 1, 7]) {
  behavior.push({
    title: `EVENT_NOT_TRIGGERED with ${stored} events`,
    condition: {
      id: "b",
      type: "EVENT_NOT_TRIGGERED",
      eventName: "upgrade_clicked",
    },
    storedCount: stored,
    matched: stored === 0,
  });
}
for (const [type, stored, threshold] of [
  ["RAGE_CLICK_COUNT", 3, 3],
  ["RAGE_CLICK_COUNT", 2, 3],
  ["VISITED_PAGE", 1, 1],
  ["VISITED_PAGE", 0, 1],
  ["ABANDONED_FORM", 1, 1],
  ["ABANDONED_FORM", 0, 1],
] as const) {
  behavior.push({
    title: `${type} ≥${threshold} with ${stored}`,
    condition: { id: "b", type, count: threshold },
    storedCount: stored,
    matched: stored >= threshold,
  });
}

export const behaviorCases: BehaviorCase[] = behavior.map((c, i) => ({
  id: `TGT-BEH-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- frequency caps
export interface ExposureFixture {
  status: "shown" | "started" | "completed" | "dismissed" | "abandoned";
  displayCount: number;
  hoursAgo: number;
  sameSession: boolean;
}

export interface FrequencyCase {
  id: string;
  title: string;
  rules: FrequencyRules;
  exposures: ExposureFixture[];
  forceShowCompleted?: boolean;
  eligible: boolean;
}

const frequency: Array<Omit<FrequencyCase, "id">> = [];
const shown = (
  displayCount: number,
  hoursAgo: number,
  sameSession = false,
): ExposureFixture => ({
  status: "shown",
  displayCount,
  hoursAgo,
  sameSession,
});

frequency.push({
  title: "first exposure",
  rules: { showOnceEver: true },
  exposures: [],
  eligible: true,
});
for (const status of ["completed", "dismissed", "abandoned"] as const) {
  frequency.push({
    title: `previously ${status}`,
    rules: {},
    exposures: [{ status, displayCount: 1, hoursAgo: 1, sameSession: false }],
    eligible: false,
  });
  frequency.push({
    title: `previously ${status}, forced`,
    rules: {},
    exposures: [{ status, displayCount: 1, hoursAgo: 1, sameSession: false }],
    forceShowCompleted: true,
    eligible: true,
  });
}
for (const count of [1, 2, 5]) {
  frequency.push({
    title: `showOnceEver after ${count} display(s)`,
    rules: { showOnceEver: true },
    exposures: [shown(count, 48)],
    eligible: false,
  });
}
frequency.push({
  title: "showOncePerSession, shown this session",
  rules: { showOncePerSession: true },
  exposures: [shown(1, 0.1, true)],
  eligible: false,
});
frequency.push({
  title: "showOncePerSession, shown in another session",
  rules: { showOncePerSession: true },
  exposures: [shown(1, 30)],
  eligible: true,
});
for (const max of [1, 3, 5]) {
  for (const count of [max - 1, max, max + 2]) {
    frequency.push({
      title: `maxDisplays ${max} with ${count} shown`,
      rules: { maxDisplays: max },
      exposures: [shown(count, 200)],
      eligible: count < max,
    });
  }
}
for (const days of [1, 3, 7]) {
  for (const hoursAgo of [days * 24 - 2, days * 24 + 2]) {
    frequency.push({
      title: `everyXDays ${days}, last shown ${hoursAgo}h ago`,
      rules: { everyXDays: days },
      exposures: [shown(1, hoursAgo)],
      eligible: hoursAgo >= days * 24,
    });
  }
}
for (const hours of [1, 6, 24]) {
  for (const hoursAgo of [hours - 0.5, hours + 0.5]) {
    frequency.push({
      title: `cooldown ${hours}h, last shown ${hoursAgo}h ago`,
      rules: { cooldownHours: hours },
      exposures: [shown(1, hoursAgo)],
      eligible: hoursAgo >= hours,
    });
  }
}

export const frequencyCases: FrequencyCase[] = frequency.map((c, i) => ({
  id: `TGT-FRQ-${pad(i + 1)}`,
  ...c,
}));

const FILE = "tests/unit/targeting.test.ts";

export const catalog = (): CatalogCase[] => [
  ...conditionCases.map((c) => ({
    id: c.id,
    module: "Targeting",
    feature: `Condition ${c.condition.type}`,
    title: c.title,
    preconditions: `Guide targeted with ${c.condition.type}${c.condition.operator ? ` ${c.condition.operator}` : ""} ${describeValue(c.condition.value ?? "")}`,
    steps: `Request runtime with context ${describeValue(c.context).slice(0, 120)}`,
    expected: c.matched
      ? "Condition matches; guide eligible"
      : "Condition fails; guide not delivered",
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...groupCases.map((c) => ({
    id: c.id,
    module: "Targeting",
    feature: "Rule groups (AND/OR, nesting)",
    title: c.title,
    preconditions: "Guide with grouped targeting rules",
    steps: "Evaluate rules for a user",
    expected: c.eligible ? "Eligible" : "Not eligible",
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...scheduleCases.map((c) => ({
    id: c.id,
    module: "Targeting",
    feature: "Schedule window",
    title: c.title,
    preconditions: `Guide scheduled ${describeValue(c.schedule)}`,
    steps: "Evaluate eligibility now",
    expected: c.eligible ? "Eligible" : "Not eligible (outside schedule)",
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...behaviorCases.map((c) => ({
    id: c.id,
    module: "Targeting",
    feature: "Behavioral conditions (event history)",
    title: c.title,
    preconditions: `User has ${c.storedCount} matching events in this integration and environment`,
    steps: `Evaluate ${c.condition.type}`,
    expected: c.matched ? "Matches" : "Does not match",
    level: "service" as const,
    automatedBy: FILE,
  })),
  ...frequencyCases.map((c) => ({
    id: c.id,
    module: "Targeting",
    feature: "Frequency caps",
    title: c.title,
    preconditions: `Rules ${describeValue(c.rules)}; prior exposures ${describeValue(c.exposures)}`,
    steps: `Request runtime${c.forceShowCompleted ? " with forceShowCompleted" : ""}`,
    expected: c.eligible ? "Delivered" : "Suppressed by frequency cap",
    level: "service" as const,
    automatedBy: FILE,
  })),
];
