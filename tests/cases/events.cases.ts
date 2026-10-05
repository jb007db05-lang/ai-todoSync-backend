import {
  describeValue,
  pad,
  pick,
  randomInt,
  randomString,
  seededRandom,
  type CatalogCase,
} from "../support/catalog.js";

// ---------------------------------------------------------------- single event normalization
export interface NormalizeCase {
  id: string;
  title: string;
  event: Record<string, unknown>;
  requireEventId: boolean;
  expect:
    | {
        eventName: string;
        userIdentifier?: string;
        sessionId?: string;
        payloadSubset?: Record<string, unknown>;
      }
    | { error: RegExp };
}

const normalize: Array<Omit<NormalizeCase, "id">> = [];
const okEvent = (
  title: string,
  event: Record<string, unknown>,
  expect: Exclude<NormalizeCase["expect"], { error: RegExp }>,
  requireEventId = false,
) => normalize.push({ title, event, requireEventId, expect });
const badEvent = (
  title: string,
  event: unknown,
  error: RegExp,
  requireEventId = false,
) =>
  normalize.push({
    title,
    event: event as Record<string, unknown>,
    requireEventId,
    expect: { error },
  });

okEvent(
  "minimal event",
  { eventName: "signup" },
  {
    eventName: "signup",
    payloadSubset: { type: "track", properties: {}, context: {} },
  },
);
okEvent(
  "event name trimmed",
  { eventName: "  checkout  " },
  { eventName: "checkout" },
);
okEvent(
  "userId maps to userIdentifier",
  { eventName: "a", userId: "u1" },
  { eventName: "a", userIdentifier: "u1" },
);
okEvent(
  "userIdentifier wins over userId",
  { eventName: "a", userId: "u1", userIdentifier: "u2" },
  { eventName: "a", userIdentifier: "u2" },
);
okEvent(
  "blank userId ignored",
  { eventName: "a", userId: "   " },
  { eventName: "a", userIdentifier: undefined },
);
okEvent(
  "sessionId kept",
  { eventName: "a", sessionId: "s-1" },
  { eventName: "a", sessionId: "s-1" },
);
okEvent(
  "properties kept",
  { eventName: "a", properties: { plan: "pro", amount: 99 } },
  {
    eventName: "a",
    payloadSubset: { properties: { plan: "pro", amount: 99 } },
  },
);
okEvent(
  "payload fields merged",
  { eventName: "a", payload: { source: "web" } },
  { eventName: "a", payloadSubset: { source: "web" } },
);
okEvent(
  "context kept",
  { eventName: "a", context: { page: { url: "/x" } } },
  { eventName: "a", payloadSubset: { context: { page: { url: "/x" } } } },
);
okEvent(
  "custom type kept",
  { eventName: "page", type: "page" },
  { eventName: "page", payloadSubset: { type: "page" } },
);
okEvent(
  "numeric timestamp normalized",
  { eventName: "a", timestamp: Date.UTC(2026, 0, 2) },
  { eventName: "a", payloadSubset: { timestamp: "2026-01-02T00:00:00.000Z" } },
);
okEvent(
  "string timestamp normalized",
  { eventName: "a", timestamp: "2026-03-04T05:06:07Z" },
  { eventName: "a", payloadSubset: { timestamp: "2026-03-04T05:06:07.000Z" } },
);
okEvent(
  "non-object properties dropped",
  { eventName: "a", properties: "nope" },
  { eventName: "a", payloadSubset: { properties: {} } },
);
okEvent(
  "eventId present when required",
  { eventName: "a", eventId: "e-1" },
  { eventName: "a" },
  true,
);
okEvent(
  "unicode event name",
  { eventName: "café_✓_漢字" },
  { eventName: "café_✓_漢字" },
);
okEvent(
  "payload just under 32 KB",
  { eventName: "a", properties: { blob: "x".repeat(32_000) } },
  { eventName: "a" },
);

badEvent("missing event name", {}, /eventName is required/);
badEvent("empty event name", { eventName: "" }, /eventName is required/);
badEvent(
  "whitespace event name",
  { eventName: "   " },
  /eventName is required/,
);
badEvent("numeric event name", { eventName: 42 }, /eventName is required/);
badEvent("array is not an event", ["a"], /must be an object/);
badEvent("null is not an event", null, /must be an object/);
badEvent(
  "eventId missing when required",
  { eventName: "a" },
  /eventId is required/,
  true,
);
badEvent(
  "payload over 32 KB",
  { eventName: "a", properties: { blob: "x".repeat(33_000) } },
  /Payload too large/,
);
badEvent(
  "huge context over 32 KB",
  { eventName: "a", context: { blob: "y".repeat(40_000) } },
  /Payload too large/,
);

// Generated: random but valid events.
const rand = seededRandom(20261006);
const NAMES = [
  "page",
  "signup",
  "login",
  "checkout_started",
  "checkout_completed",
  "guide_shown",
  "survey_completed",
  "feature_used",
  "export_csv",
  "invite_sent",
];
for (let i = 0; i < 150; i++) {
  const name = pick(rand, NAMES);
  const user = rand() > 0.3 ? `user-${randomInt(rand, 1, 500)}` : undefined;
  const props: Record<string, unknown> = {};
  for (let k = 0; k < randomInt(rand, 0, 6); k++) {
    props[`p${k}`] =
      rand() > 0.5
        ? randomInt(rand, -1000, 1000)
        : randomString(rand, randomInt(rand, 0, 40));
  }
  okEvent(
    `generated event #${i + 1} (${name})`,
    {
      eventName: name,
      userId: user,
      sessionId: `s-${randomInt(rand, 1, 50)}`,
      properties: props,
    },
    {
      eventName: name,
      userIdentifier: user,
      payloadSubset: { properties: props },
    },
  );
}

export const normalizeCases: NormalizeCase[] = normalize.map((c, i) => ({
  id: `EVT-NRM-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- batch bodies
export interface BatchCase {
  id: string;
  title: string;
  body: unknown;
  expect: { count: number } | { error: RegExp };
}

const batch: Array<Omit<BatchCase, "id">> = [];
const ev = (i: number) => ({ eventName: "e", eventId: `id-${i}` });
for (const n of [1, 2, 10, 50, 99, 100]) {
  batch.push({
    title: `array of ${n}`,
    body: Array.from({ length: n }, (_, i) => ev(i)),
    expect: { count: n },
  });
  batch.push({
    title: `{events} wrapper of ${n}`,
    body: { apiKey: "k", events: Array.from({ length: n }, (_, i) => ev(i)) },
    expect: { count: n },
  });
}
batch.push({ title: "single object", body: ev(1), expect: { count: 1 } });
batch.push({
  title: "empty array",
  body: [],
  expect: { error: /at least one event/ },
});
batch.push({
  title: "empty events wrapper",
  body: { events: [] },
  expect: { error: /at least one event/ },
});
batch.push({
  title: "101 events",
  body: Array.from({ length: 101 }, (_, i) => ev(i)),
  expect: { error: /Batch size limit/ },
});
batch.push({
  title: "wrapper with 150 events",
  body: { events: Array.from({ length: 150 }, (_, i) => ev(i)) },
  expect: { error: /Batch size limit/ },
});
batch.push({
  title: "over 256 KB",
  body: Array.from({ length: 20 }, (_, i) => ({
    ...ev(i),
    properties: { blob: "z".repeat(15_000) },
  })),
  expect: { error: /Batch payload too large/ },
});
batch.push({
  title: "string body",
  body: "events",
  expect: { error: /must be an event or array/ },
});
batch.push({
  title: "numeric body",
  body: 7,
  expect: { error: /must be an event or array/ },
});

export const batchCases: BatchCase[] = batch.map((c, i) => ({
  id: `EVT-BAT-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- storage by environment
export interface StorageCase {
  id: string;
  title: string;
  environment: "live" | "sandbox";
  route: "track" | "batch" | "page";
  count: number;
}
const storage: Array<Omit<StorageCase, "id">> = [];
for (const environment of ["live", "sandbox"] as const) {
  for (const route of ["track", "batch", "page"] as const) {
    for (const count of route === "batch" ? [1, 5, 25, 100] : [1]) {
      storage.push({
        title: `${route} (${count}) stored as ${environment}`,
        environment,
        route,
        count,
      });
    }
  }
}
export const storageCases: StorageCase[] = storage.map((c, i) => ({
  id: `EVT-STO-${pad(i + 1)}`,
  ...c,
}));

const FILE = "tests/unit/events.test.ts";

export const catalog = (): CatalogCase[] => [
  ...normalizeCases.map((c) => ({
    id: c.id,
    module: "Event tracking",
    feature: "Event validation & normalization",
    title: c.title,
    preconditions: c.requireEventId
      ? "Event inside a multi-event batch (eventId required)"
      : "Single event",
    steps: `Send event ${describeValue(c.event).slice(0, 120)}`,
    expected:
      "error" in c.expect
        ? `Rejected with 400 (${c.expect.error.source})`
        : `Accepted as '${c.expect.eventName}'`,
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...batchCases.map((c) => ({
    id: c.id,
    module: "Event tracking",
    feature: "Batch ingestion limits",
    title: c.title,
    preconditions: "Authenticated SDK session",
    steps: "POST /api/batch with the body",
    expected:
      "error" in c.expect
        ? `Rejected with 400 (${c.expect.error.source})`
        : `${c.expect.count} event(s) accepted`,
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...storageCases.map((c) => ({
    id: c.id,
    module: "Event tracking",
    feature: "Live/sandbox storage",
    title: c.title,
    preconditions: `SDK session from the ${c.environment} key`,
    steps: `Send ${c.count} event(s) via /api/${c.route}`,
    expected: `Every stored log has environment '${c.environment}' and the integration id`,
    level: "service" as const,
    automatedBy: FILE,
  })),
];
