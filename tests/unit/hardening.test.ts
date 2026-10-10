import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { AppError } from "../../src/utils/app-error.js";
import engagementRepository from "../../src/modules/engagement/repository.js";
import { GuideExposureModel } from "../../src/modules/engagement/model.js";
import targetingService from "../../src/modules/targeting/service.js";
import {
  validateFrequencyRules,
  validateScheduleRules,
  validateTargetingRuleGroup,
} from "../../src/modules/targeting/validators.js";
import {
  normalizeTrackingEvent,
  TrackingValidationError,
} from "../../src/modules/analytics/validators/tracking.validator.js";
import trackingService, {
  timestampRejection,
} from "../../src/modules/analytics/services/tracking.service.js";
import AnalyticsEventRegistryModel from "../../src/modules/analytics/models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../../src/modules/analytics/models/analytics-log.model.js";
import AnalyticsUserModel from "../../src/modules/analytics/models/analytics-user.model.js";
import {
  decodeCursor,
  encodeCursor,
  toStreamEvent,
} from "../../src/modules/events/service.js";
import type { TargetingCondition } from "../../src/modules/engagement/types.js";
import { chain, stub } from "../support/stubs.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("Exposure status is never downgraded", () => {
  const captureUpdate = async (status?: string) => {
    let update: any;
    const undo = stub(GuideExposureModel, "findOneAndUpdate", ((
      _filter: unknown,
      u: unknown,
    ) => {
      update = u;
      return chain({ _id: "x" });
    }) as any);
    try {
      await engagementRepository.upsertExposure(
        { tenantId: "t", sdkIntegrationId: "i", guideId: "g", userId: "u" },
        { status: status as any },
      );
    } finally {
      undo();
    }
    return update;
  };

  test("re-delivery (shown) only sets status on a new exposure", async () => {
    const update = await captureUpdate("shown");
    assert.equal(update.$set.status, undefined);
    assert.equal(update.$setOnInsert.status, "shown");
  });

  for (const status of ["started", "completed", "dismissed"]) {
    test(`${status} overwrites the stored status`, async () => {
      const update = await captureUpdate(status);
      assert.equal(update.$set.status, status);
      assert.equal(update.$setOnInsert.status, undefined);
    });
  }
});

describe("Schedule time windows", () => {
  const evaluate = (scheduleRules: any, now: string) =>
    targetingService.evaluate({
      context: { tenantId: "t", now },
      scheduleRules,
    });

  const cases: Array<[string, any, string, boolean]> = [
    [
      "inside a daytime window",
      { windows: [{ start: "09:00", end: "17:00" }] },
      "2026-10-07T12:00:00Z",
      true,
    ],
    [
      "before the window",
      { windows: [{ start: "09:00", end: "17:00" }] },
      "2026-10-07T08:59:00Z",
      false,
    ],
    [
      "end is exclusive",
      { windows: [{ start: "09:00", end: "17:00" }] },
      "2026-10-07T17:00:00Z",
      false,
    ],
    [
      "weekday window on a Wednesday",
      {
        windows: [
          { start: "00:00", end: "23:59", daysOfWeek: [1, 2, 3, 4, 5] },
        ],
      },
      "2026-10-07T10:00:00Z",
      true,
    ],
    [
      "weekday window on a Sunday",
      {
        windows: [
          { start: "00:00", end: "23:59", daysOfWeek: [1, 2, 3, 4, 5] },
        ],
      },
      "2026-10-11T10:00:00Z",
      false,
    ],
    [
      "overnight window, late part",
      { windows: [{ start: "22:00", end: "06:00" }] },
      "2026-10-07T23:30:00Z",
      true,
    ],
    [
      "overnight window, early part",
      { windows: [{ start: "22:00", end: "06:00" }] },
      "2026-10-07T05:30:00Z",
      true,
    ],
    [
      "overnight window, midday",
      { windows: [{ start: "22:00", end: "06:00" }] },
      "2026-10-07T12:00:00Z",
      false,
    ],
    // 12:00 UTC is 17:30 in Kolkata.
    [
      "time zone shifts the window (inside)",
      { timezone: "Asia/Kolkata", windows: [{ start: "17:00", end: "18:00" }] },
      "2026-10-07T12:00:00Z",
      true,
    ],
    [
      "time zone shifts the window (outside)",
      { timezone: "Asia/Kolkata", windows: [{ start: "09:00", end: "10:00" }] },
      "2026-10-07T12:00:00Z",
      false,
    ],
    [
      "any of several windows",
      {
        windows: [
          { start: "01:00", end: "02:00" },
          { start: "11:00", end: "13:00" },
        ],
      },
      "2026-10-07T12:00:00Z",
      true,
    ],
  ];
  for (const [title, rules, now, eligible] of cases) {
    test(title, async () => {
      assert.equal((await evaluate(rules, now)).eligible, eligible);
    });
  }

  test("TIME_WINDOW condition evaluates its window", async () => {
    const rules = {
      id: "g",
      operator: "AND" as const,
      conditions: [
        {
          id: "c",
          type: "TIME_WINDOW" as const,
          value: { start: "09:00", end: "10:00" },
        },
      ],
    };
    const at = (now: string) =>
      targetingService.evaluate({ rules, context: { tenantId: "t", now } });
    assert.equal((await at("2026-10-07T09:30:00Z")).eligible, true);
    assert.equal((await at("2026-10-07T11:30:00Z")).eligible, false);
  });
});

describe("Explicit targeting operators", () => {
  const match = async (
    condition: Omit<TargetingCondition, "id">,
    context: any,
  ) =>
    (
      await targetingService.evaluate({
        rules: {
          id: "g",
          operator: "AND",
          conditions: [{ id: "c", ...condition }],
        },
        context: { tenantId: "t", ...context },
      })
    ).eligible;

  const cases: Array<[string, Omit<TargetingCondition, "id">, any, boolean]> = [
    [
      "PLAN NOT_EQUALS differs",
      { type: "PLAN_EQUALS", operator: "NOT_EQUALS", value: "free" },
      { plan: "pro" },
      true,
    ],
    [
      "PLAN NOT_EQUALS same",
      { type: "PLAN_EQUALS", operator: "NOT_EQUALS", value: "free" },
      { plan: "free" },
      false,
    ],
    [
      "ROLE IN list",
      { type: "ROLE_EQUALS", operator: "IN", value: ["ADMIN", "OWNER"] },
      { role: "OWNER" },
      true,
    ],
    [
      "ROLE IN comma list",
      { type: "ROLE_EQUALS", operator: "IN", value: "ADMIN, OWNER" },
      { role: "MEMBER" },
      false,
    ],
    [
      "ROLE NOT_IN",
      { type: "ROLE_EQUALS", operator: "NOT_IN", value: ["ADMIN"] },
      { role: "MEMBER" },
      true,
    ],
    [
      "URL NOT_CONTAINS",
      { type: "URL_CONTAINS", operator: "NOT_CONTAINS", value: "/billing" },
      { url: "https://a/b" },
      true,
    ],
    [
      "URL_EQUALS with REGEX",
      { type: "URL_EQUALS", operator: "REGEX", value: "^https://app" },
      { url: "https://app/x" },
      true,
    ],
    [
      "SESSION_COUNT BETWEEN inside",
      { type: "SESSION_COUNT", operator: "BETWEEN", value: [3, 5] },
      { session: { count: 4 } },
      true,
    ],
    [
      "SESSION_COUNT BETWEEN outside",
      { type: "SESSION_COUNT", operator: "BETWEEN", value: "3,5" },
      { session: { count: 6 } },
      false,
    ],
    [
      "SESSION_COUNT NOT_EQUALS",
      { type: "SESSION_COUNT", operator: "NOT_EQUALS", value: 3 },
      { session: { count: 4 } },
      true,
    ],
  ];
  for (const [title, condition, context, expected] of cases) {
    test(title, async () =>
      assert.equal(await match(condition, context), expected),
    );
  }
});

describe("Rule validation", () => {
  const rejects = (fn: () => unknown) =>
    assert.throws(
      fn,
      (e: unknown) => e instanceof AppError && e.status === 400,
    );

  test("unknown condition type is rejected", () =>
    rejects(() =>
      validateTargetingRuleGroup({
        operator: "AND",
        conditions: [{ type: "NOPE" }],
      }),
    ));
  test("unknown operator is rejected", () =>
    rejects(() =>
      validateTargetingRuleGroup({
        operator: "AND",
        conditions: [{ type: "PLAN_EQUALS", operator: "LIKE", value: "x" }],
      }),
    ));
  test("invalid regex is rejected at save time", () =>
    rejects(() =>
      validateTargetingRuleGroup({
        operator: "AND",
        conditions: [{ type: "URL_REGEX", value: "([" }],
      }),
    ));
  test("nesting deeper than 5 levels is rejected", () => {
    let group: any = { operator: "AND" };
    for (let i = 0; i < 6; i += 1) group = { operator: "AND", groups: [group] };
    rejects(() => validateTargetingRuleGroup(group));
  });
  test("valid rules keep their shape", () => {
    const out = validateTargetingRuleGroup({
      id: "root",
      operator: "OR",
      conditions: [
        { id: "c1", type: "URL_CONTAINS", value: "/x", eventName: "/x" },
      ],
    });
    assert.equal(out.conditions?.[0].type, "URL_CONTAINS");
    assert.equal(out.conditions?.[0].value, "/x");
  });

  test("frequency numbers must be non-negative", () =>
    rejects(() => validateFrequencyRules({ cooldownHours: -1 })));
  test("maxDisplays must be a whole number ≥ 1", () =>
    rejects(() => validateFrequencyRules({ maxDisplays: 0 })));
  test("frequency flags must be booleans", () =>
    rejects(() => validateFrequencyRules({ showOnceEver: "yes" })));
  test("valid frequency rules pass", () =>
    assert.deepEqual(
      validateFrequencyRules({
        showOncePerSession: true,
        cooldownHours: "24",
        maxDisplays: 5,
      }),
      { showOncePerSession: true, cooldownHours: 24, maxDisplays: 5 },
    ));

  test("schedule must end after it starts", () =>
    rejects(() =>
      validateScheduleRules({ startsAt: "2026-10-10", endsAt: "2026-10-01" }),
    ));
  test("schedule dates must parse", () =>
    rejects(() => validateScheduleRules({ startsAt: "not a date" })));
  test("time zone must exist", () =>
    rejects(() => validateScheduleRules({ timezone: "Mars/Olympus" })));
  test("window times must be HH:MM", () =>
    rejects(() =>
      validateScheduleRules({ windows: [{ start: "9am", end: "17:00" }] }),
    ));
  test("window days must be 0–6", () =>
    rejects(() =>
      validateScheduleRules({
        windows: [{ start: "09:00", end: "17:00", daysOfWeek: [7] }],
      }),
    ));
});

describe("Event ingestion", () => {
  test("an unparseable timestamp is a 400, not a crash", () =>
    assert.throws(
      () =>
        normalizeTrackingEvent(
          { eventName: "a", timestamp: "soon" },
          { requireEventId: false },
        ),
      TrackingValidationError,
    ));
  test("event names are bounded", () =>
    assert.throws(
      () =>
        normalizeTrackingEvent(
          { eventName: "x".repeat(256) },
          { requireEventId: false },
        ),
      TrackingValidationError,
    ));
  test("$insert_id is used as the dedup id", () => {
    const out = normalizeTrackingEvent(
      { eventName: "a", properties: { $insert_id: "ins-1" } },
      { requireEventId: true },
    );
    assert.equal(out.eventId, "ins-1");
  });

  const now = Date.UTC(2026, 9, 10, 12);
  const iso = (offset: number) => new Date(now + offset).toISOString();
  const windowCases: Array<[string, string | undefined, boolean, boolean]> = [
    ["no timestamp", undefined, false, true],
    ["a minute ago", iso(-60_000), false, true],
    ["4 days ago", iso(-4 * DAY), false, true],
    ["6 days ago (live)", iso(-6 * DAY), false, false],
    ["6 days ago (import)", iso(-6 * DAY), true, true],
    ["30 minutes ahead", iso(30 * 60_000), false, true],
    ["2 hours ahead", iso(2 * HOUR), false, false],
    ["2 hours ahead (import)", iso(2 * HOUR), true, false],
    ["1970 (import)", "1970-06-01T00:00:00.000Z", true, false],
  ];
  for (const [title, timestamp, imported, accepted] of windowCases) {
    test(`time window: ${title}`, () =>
      assert.equal(
        timestampRejection(timestamp, { imported, now }) === null,
        accepted,
      ));
  }

  const withStubs = async (
    fn: (calls: { user: any[]; logs: any[] }) => Promise<void>,
  ) => {
    const calls = { user: [] as any[], logs: [] as any[] };
    const undo = [
      stub(AnalyticsEventRegistryModel, "findOne", (() =>
        chain({ _id: "ref-1" })) as any),
      stub(AnalyticsUserModel, "findOneAndUpdate", ((
        filter: unknown,
        update: unknown,
      ) => {
        calls.user.push(update);
        return chain({ userIdentifier: "u1" });
      }) as any),
      stub(AnalyticsLogModel, "bulkWrite", (async (ops: any[]) => {
        ops.forEach((op) => calls.logs.push(op.insertOne.document));
        return { insertedCount: ops.length };
      }) as any),
    ];
    try {
      await fn(calls);
    } finally {
      undo.forEach((u) => u());
    }
  };

  test("a batch never overwrites profile traits", () =>
    withStubs(async (calls) => {
      await trackingService.ingestBatch(
        "int-1",
        [{ eventName: "e", eventId: "1", userId: "u1" }],
        "int-1",
      );
      assert.equal(calls.user.length, 1);
      assert.equal(calls.user[0].$set, undefined, "no $set on the profile");
      assert.deepEqual(calls.user[0].$setOnInsert.metadata, {});
    }));

  test("stale events are dropped one by one and reported", () =>
    withStubs(async (calls) => {
      const result = await trackingService.ingestBatch(
        "int-1",
        [
          { eventName: "fresh", eventId: "1" },
          {
            eventName: "stale",
            eventId: "2",
            timestamp: new Date(Date.now() - 10 * DAY).toISOString(),
          },
        ],
        "int-1",
      );
      assert.equal(result.insertedCount, 1);
      assert.equal(result.rejectedCount, 1);
      assert.equal(result.rejected[0].eventId, "2");
      assert.equal(calls.logs.length, 1);
      assert.equal(
        calls.logs[0].eventName,
        "fresh",
        "logs store their event name",
      );
    }));

  test("imports accept old events and mark them", () =>
    withStubs(async (calls) => {
      const result = await trackingService.ingestBatch(
        "int-1",
        [{ eventName: "old", eventId: "1", timestamp: "2025-01-01T00:00:00Z" }],
        "int-1",
        "live",
        { imported: true },
      );
      assert.equal(result.insertedCount, 1);
      assert.equal(calls.logs[0].payload.$import, true);
    }));

  test("identify merges traits instead of replacing them", () =>
    withStubs(async (calls) => {
      await trackingService.identify("int-1", "u1", {
        $email: "a@b.c",
        plan: "pro",
      });
      const pipeline = calls.user[0];
      assert.ok(Array.isArray(pipeline), "uses an update pipeline");
      const merge = pipeline[0].$set.metadata.$mergeObjects;
      assert.deepEqual(merge[1], {
        $literal: { $email: "a@b.c", plan: "pro" },
      });
    }));
});

describe("Event stream mapping", () => {
  const log = {
    _id: "64b7f0c2a1b2c3d4e5f60718" as any,
    eventId: "evt-1",
    userIdentifier: "user-9",
    sessionId: "sess-1",
    createdAt: new Date("2026-10-10T10:00:02.000Z"),
    payload: {
      plan: "pro",
      properties: { button: "signup" },
      context: {
        page: { url: "https://app/x", title: "X" },
        library: { name: "events-sdk", version: "1.0.11" },
        deviceId: "dev-1",
        locale: "en-US",
      },
      type: "track",
      timestamp: "2026-10-10T10:00:00.000Z",
    },
  };

  test("splits your properties from default properties", () => {
    const event = toStreamEvent(log, "signup_clicked");
    assert.deepEqual(event.properties, { plan: "pro", button: "signup" });
    assert.equal(event.defaultProperties.$current_url, "https://app/x");
    assert.equal(event.defaultProperties.$lib_version, "1.0.11");
    assert.equal(event.defaultProperties.$device_id, "dev-1");
    assert.equal(event.defaultProperties.mp_processing_time_ms, 2000);
  });

  test("identities and times", () => {
    const event = toStreamEvent(log, "signup_clicked");
    assert.equal(event.distinctId, "user-9");
    assert.equal(event.deviceId, "dev-1");
    assert.equal(event.time, "2026-10-10T10:00:00.000Z");
    assert.equal(event.receivedAt, "2026-10-10T10:00:02.000Z");
    assert.equal(event.imported, false);
  });

  test("anonymous events use the device id as distinct id", () => {
    const event = toStreamEvent({ ...log, userIdentifier: undefined }, "e");
    assert.equal(event.distinctId, "dev-1");
    assert.equal(event.userId, null);
  });

  test("cursors round-trip and reject garbage", () => {
    const cursor = encodeCursor({ createdAt: log.createdAt, _id: log._id });
    const decoded = decodeCursor(cursor);
    assert.equal(decoded.createdAt.getTime(), log.createdAt.getTime());
    assert.equal(decoded.id.toString(), String(log._id));
    assert.throws(() => decodeCursor("not-a-cursor"), AppError);
  });
});
