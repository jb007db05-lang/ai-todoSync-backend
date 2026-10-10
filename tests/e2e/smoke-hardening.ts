/**
 * Live checks for the Events page API, ingestion rules and the portal
 * engagement runtime. Needs a running backend + MongoDB:
 *
 *   npx tsx tests/e2e/smoke-hardening.ts
 *
 * Registers a throwaway user (`smoke-…@example.test`) and deletes everything
 * it creates except that user (there is no delete-account endpoint).
 */
import { isDeepStrictEqual } from "node:util";
import { SignedTransport } from "../../../analytics-sdk/src/index.js";

const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api").replace(
  /\/+$/,
  "",
);
const ORIGIN = "https://smoke.acme.test";
const RUN = `smoke-${Date.now().toString(36)}`;
const DAY = 86_400_000;

const nativeFetch = globalThis.fetch;
// The integration only accepts its registered domain; Node's fetch lets us
// send that Origin (the SDK handshake carries the key in the body).
globalThis.fetch = ((input: any, init: any = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  return nativeFetch(input, { ...init, headers });
}) as typeof fetch;

let token = "";
let failures = 0;
let passes = 0;

const check = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.log(`  ✗ ${name}\n      ${(error as Error).message}`);
  }
};
const expect = (cond: unknown, message: string) => {
  if (!cond) throw new Error(message);
};
const eq = (actual: unknown, expected: unknown, label: string) => {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const api = async (
  method: string,
  url: string,
  body?: unknown,
  query?: Record<string, unknown>,
) => {
  const qs = query
    ? `?${new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )}`
    : "";
  const res = await fetch(`${API}${url}${qs}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* csv or text */
  }
  return { status: res.status, body: parsed, headers: res.headers, text };
};

const okBody = (res: { status: number; body: any }, label: string) => {
  if (res.status < 200 || res.status > 299) {
    throw new Error(
      `${label}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`,
    );
  }
  return res.body;
};

let sdk: SignedTransport;
const sdkCall = async (method: string, url: string, body?: unknown) => {
  const res = await sdk.request(url, { method, body });
  if (!res) throw new Error(`SDK ${url}: network error`);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const state = {
  integrationId: "",
  guideIds: [] as string[],
  surveyIds: [] as string[],
  checklistIds: [] as string[],
};

const main = async () => {
  console.log(`Smoke run ${RUN} against ${API}`);

  // ------------------------------------------------------------ setup
  token = okBody(
    await api("POST", "/auth/register", {
      email: `${RUN}@example.test`,
      password: "Smoke-Passw0rd!",
      firstName: "Smoke",
      lastName: RUN,
    }),
    "register",
  ).data.accessToken;
  const created = okBody(
    await api("POST", "/sdk-integrations", {
      name: `Smoke ${RUN}`,
      environment: "production",
      domain: ORIGIN,
    }),
    "create integration",
  );
  state.integrationId = created.data.integration.id;
  sdk = new SignedTransport(created.data.sdkKey, API, 15_000);
  const base = `/sdk-integrations/${state.integrationId}`;

  // ------------------------------------------------------------ ingestion
  console.log("\n▶ Ingestion");
  const now = Date.now();
  await check("batch drops a stale event but keeps the rest", async () => {
    const res = await sdkCall("POST", "/batch", [
      {
        eventId: `${RUN}-1`,
        eventName: "signup",
        userId: "u1",
        properties: { plan: "pro", amount: 42 },
        context: { deviceId: "dev-1" },
        timestamp: new Date(now - 3000).toISOString(),
      },
      {
        eventId: `${RUN}-2`,
        eventName: "signup",
        userId: "u1",
        properties: { plan: "pro" },
        context: { deviceId: "dev-1" },
      },
      {
        eventId: `${RUN}-3`,
        eventName: "viewed_pricing",
        properties: { tier: "acme-gold" },
        context: { deviceId: "dev-2", page: { url: "https://smoke/pricing" } },
      },
      {
        eventId: `${RUN}-4`,
        eventName: "signup",
        userId: "u2",
        properties: { plan: "free" },
      },
      {
        eventId: `${RUN}-old`,
        eventName: "signup",
        timestamp: new Date(now - 6 * DAY).toISOString(),
      },
    ]);
    eq(res.status, 200, "status");
    eq(res.body.insertedCount, 4, "inserted");
    eq(res.body.rejectedCount, 1, "rejected");
  });
  await check(
    "retrying a batch with the same ids does not duplicate",
    async () => {
      const res = await sdkCall("POST", "/batch", [
        { eventId: `${RUN}-2`, eventName: "signup", userId: "u1" },
      ]);
      eq(res.body.insertedCount, 0, "inserted on retry");
    },
  );
  await check("an unparseable timestamp is a 400", async () => {
    const res = await sdkCall("POST", "/batch", [
      { eventId: `${RUN}-bad`, eventName: "x", timestamp: "yesterday-ish" },
    ]);
    eq(res.status, 400, "status");
  });
  await check("/import accepts historical events and marks them", async () => {
    const res = await sdkCall("POST", "/import", [
      {
        eventId: `${RUN}-hist`,
        eventName: "legacy_purchase",
        userId: "u1",
        timestamp: "2025-03-01T10:00:00Z",
      },
    ]);
    eq(res.body.insertedCount, 1, "imported");
  });
  await check("identify merges traits, and tracking keeps them", async () => {
    okBody(
      await sdkCall("POST", "/identify", {
        userId: "u1",
        traits: { plan: "pro", $email: "u1@acme.test" },
      }),
      "identify 1",
    );
    okBody(
      await sdkCall("POST", "/identify", {
        userId: "u1",
        traits: { company: "Acme" },
      }),
      "identify 2",
    );
    okBody(
      await sdkCall("POST", "/batch", [
        { eventId: `${RUN}-5`, eventName: "signup", userId: "u1" },
      ]),
      "batch after identify",
    );
    const profile = okBody(
      await api("GET", `${base}/user-profiles/u1`),
      "profile",
    ).data;
    eq(
      profile.traits,
      { plan: "pro", $email: "u1@acme.test", company: "Acme" },
      "traits",
    );
    expect(profile.identified, "identified");
  });

  // ------------------------------------------------------------ events page
  console.log("\n▶ Events page");
  await check(
    "stream lists events newest first with property split",
    async () => {
      const page = okBody(
        await api("GET", `${base}/event-stream`),
        "stream",
      ).data;
      eq(page.events.length, 6, "event count");
      const times = page.events.map((e: any) => e.receivedAt);
      expect(
        [...times].sort().reverse().join() === times.join(),
        "newest first",
      );
      const pricing = page.events.find(
        (e: any) => e.eventName === "viewed_pricing",
      );
      eq(pricing.distinctId, "dev-2", "anonymous distinct id is the device id");
      eq(pricing.properties, { tier: "acme-gold" }, "your properties");
      eq(
        pricing.defaultProperties.$current_url,
        "https://smoke/pricing",
        "default properties",
      );
      const imported = page.events.find(
        (e: any) => e.eventName === "legacy_purchase",
      );
      eq(imported.imported, true, "imported flag");
    },
  );
  await check(
    "filters: event, user, distinct id, property, search",
    async () => {
      const count = async (query: Record<string, unknown>) =>
        okBody(
          await api("GET", `${base}/event-stream`, undefined, query),
          JSON.stringify(query),
        ).data.events.length;
      eq(await count({ eventNames: "viewed_pricing" }), 1, "eventNames");
      eq(await count({ userId: "u1" }), 4, "userId");
      eq(await count({ distinctId: "dev-2" }), 1, "distinctId");
      eq(await count({ deviceId: "dev-1" }), 2, "deviceId");
      eq(
        await count({ propertyKey: "amount", propertyValue: "42" }),
        1,
        "property = value",
      );
      eq(await count({ propertyKey: "plan" }), 3, "property is set");
      eq(await count({ q: "acme-gold" }), 1, "search property value");
      eq(await count({ q: "pricing" }), 1, "search event name");
    },
  );
  await check("cursor paging and live polling", async () => {
    const first = okBody(
      await api("GET", `${base}/event-stream`, undefined, { limit: 4 }),
      "page 1",
    ).data;
    eq(first.events.length, 4, "page size");
    expect(first.hasMore && first.nextCursor, "has more");
    const second = okBody(
      await api("GET", `${base}/event-stream`, undefined, {
        limit: 4,
        before: first.nextCursor,
      }),
      "page 2",
    ).data;
    eq(second.events.length, 2, "rest");
    eq(second.hasMore, false, "no more");
    const ids = new Set(
      [...first.events, ...second.events].map((e: any) => e.id),
    );
    eq(ids.size, 6, "no overlap");
    const since = okBody(
      await api("GET", `${base}/event-stream`, undefined, {
        since: new Date(Date.now() + 60_000).toISOString(),
      }),
      "since",
    ).data;
    eq(since.events.length, 0, "nothing newer");
  });
  await check("bad input is a 400/404, not a 500", async () => {
    eq(
      (
        await api("GET", `${base}/event-stream`, undefined, {
          startDate: "31/02/2026",
        })
      ).status,
      400,
      "bad date",
    );
    eq(
      (
        await api("GET", `${base}/event-stream`, undefined, {
          before: "garbage",
        })
      ).status,
      400,
      "bad cursor",
    );
    eq(
      (
        await api("GET", `${base}/event-stream`, undefined, {
          propertyKey: "$where",
        })
      ).status,
      400,
      "unsafe key",
    );
    eq(
      (await api("GET", `/sdk-integrations/not-an-id/event-stream`)).status,
      404,
      "bad integration id",
    );
    eq(
      (await api("GET", `${base}/all-logs`, undefined, { startDate: "nope" }))
        .status,
      400,
      "legacy endpoint bad date",
    );
  });
  await check("CSV export with row count", async () => {
    const res = await api("GET", `${base}/event-stream/export`, undefined, {
      columns: "plan,amount",
    });
    eq(res.status, 200, "status");
    eq(res.headers.get("x-row-count"), "6", "row count header");
    const lines = res.text.trim().split("\r\n");
    eq(
      lines[0],
      "time,received_at,event,distinct_id,user_id,device_id,session_id,insert_id,plan,amount",
      "header row",
    );
    eq(lines.length, 7, "rows");
  });
  await check("property keys for pickers", async () => {
    const keys = okBody(
      await api("GET", `${base}/event-properties`),
      "keys",
    ).data;
    for (const k of ["plan", "amount", "tier"])
      expect(keys.eventProperties.includes(k), `event property ${k}`);
    expect(keys.defaultProperties.includes("$device_id"), "default $device_id");
  });
  let lexiconId = "";
  await check("lexicon lists events with volumes and saves edits", async () => {
    const events = okBody(await api("GET", `${base}/lexicon/events`), "lexicon")
      .data.events;
    const signup = events.find((e: any) => e.eventName === "signup");
    eq(signup.totalVolume, 4, "signup volume");
    lexiconId = signup.id;
    const saved = okBody(
      await api("PATCH", `${base}/lexicon/events/${lexiconId}`, {
        displayName: "Sign up",
        description: "Account created",
        hidden: true,
        tags: ["growth", "growth", " core "],
      }),
      "patch",
    ).data;
    eq(saved.tags, ["growth", "core"], "tags trimmed and deduplicated");
    eq(saved.hidden, true, "hidden");
    const again = okBody(
      await api("GET", `${base}/lexicon/events`),
      "lexicon again",
    ).data.events.find((e: any) => e.id === lexiconId);
    eq(again.displayName, "Sign up", "display name persisted");
  });
  await check("lexicon validation", async () => {
    eq(
      (
        await api("PATCH", `${base}/lexicon/events/${lexiconId}`, {
          displayName: "x".repeat(121),
        })
      ).status,
      400,
      "long name",
    );
    eq(
      (
        await api("PATCH", `${base}/lexicon/events/${lexiconId}`, {
          hidden: "yes",
        })
      ).status,
      400,
      "hidden type",
    );
    eq(
      (
        await api("PATCH", `${base}/lexicon/events/000000000000000000000000`, {
          hidden: true,
        })
      ).status,
      404,
      "unknown event",
    );
  });

  // ------------------------------------------------------------ portal runtime
  console.log("\n▶ Portal engagement runtime");
  const runtime = async (
    sessionId: string,
    userId = "portal-user",
    extra: Record<string, unknown> = {},
  ) =>
    okBody(
      await api("POST", "/engagement/runtime", {
        sdkIntegrationId: state.integrationId,
        sessionId,
        userId,
        url: "https://smoke/app",
        ...extra,
      }),
      "runtime",
    ).data.experiences as any[];
  const track = (body: Record<string, unknown>) =>
    api("POST", "/engagement/track", {
      sdkIntegrationId: state.integrationId,
      ...body,
    });

  const banner = okBody(
    await api("POST", `${base}/guides`, {
      title: `Banner ${RUN}`,
      type: "BANNER",
      status: "LIVE",
      steps: [{ id: "s1", title: "Hello" }],
      frequencyRules: { showOncePerSession: true },
    }),
    "create banner",
  ).data.guide;
  state.guideIds.push(banner._id);
  const has = (list: any[], id: string) => list.some((e) => e.id === id);

  await check(
    "guide_shown from the portal enforces show-once-per-session",
    async () => {
      expect(has(await runtime("s1"), banner._id), "delivered first");
      eq(
        (
          await track({
            eventName: "guide_shown",
            guideId: banner._id,
            sessionId: "s1",
            userId: "portal-user",
          })
        ).status,
        200,
        "track",
      );
      expect(
        !has(await runtime("s1"), banner._id),
        "not again in the same session",
      );
      expect(
        has(await runtime("s2", "other-user"), banner._id),
        "still shown to someone else",
      );
    },
  );
  await check(
    "a portal dismissal sticks (exposure recorded on the real integration)",
    async () => {
      expect(has(await runtime("s3", "dismisser"), banner._id), "delivered");
      okBody(
        await track({
          eventName: "guide_dismissed",
          guideId: banner._id,
          sessionId: "s3",
          userId: "dismisser",
        }),
        "dismiss",
      );
      expect(
        !has(await runtime("s3", "dismisser"), banner._id),
        "gone in that session",
      );
      expect(
        !has(await runtime("s4", "dismisser"), banner._id),
        "gone in a later session",
      );
    },
  );
  await check("a re-delivery does not undo a dismissal", async () => {
    // Runtime delivery records guide_shown; it must not reset the status.
    await runtime("s4", "dismisser", { forceShowCompleted: true });
    expect(
      !has(await runtime("s5", "dismisser"), banner._id),
      "still dismissed",
    );
  });
  await check(
    "a foreign integration id falls back to the user's own",
    async () => {
      const res = okBody(
        await api("POST", "/engagement/runtime", {
          sdkIntegrationId: "000000000000000000000000",
          sessionId: "s6",
          userId: "fresh",
        }),
        "runtime",
      ).data.experiences;
      expect(has(res, banner._id), "served from own integration");
    },
  );

  await check("schedule windows and rule validation", async () => {
    const hour = new Date().getUTCHours();
    const closed = `${String((hour + 2) % 24).padStart(2, "0")}:00`;
    const closedEnd = `${String((hour + 3) % 24).padStart(2, "0")}:00`;
    const scheduled = okBody(
      await api("POST", `${base}/guides`, {
        title: `Scheduled ${RUN}`,
        type: "BANNER",
        status: "LIVE",
        steps: [{ id: "s1", title: "Later" }],
        scheduleRules: { windows: [{ start: closed, end: closedEnd }] },
      }),
      "create scheduled",
    ).data.guide;
    state.guideIds.push(scheduled._id);
    expect(
      !has(await runtime("s7", "sched"), scheduled._id),
      "outside its window",
    );
    const bad = await api("POST", `${base}/guides`, {
      title: "bad",
      type: "BANNER",
      targetingRules: {
        operator: "AND",
        conditions: [{ type: "URL_REGEX", value: "([" }],
      },
    });
    eq(bad.status, 400, "invalid regex rejected");
    eq(
      (
        await api("POST", `${base}/guides`, {
          title: "bad",
          type: "BANNER",
          frequencyRules: { cooldownHours: -5 },
        })
      ).status,
      400,
      "negative cooldown",
    );
  });

  await check(
    "checklist items completed in the widget are saved and returned",
    async () => {
      const checklist = okBody(
        await api("POST", "/checklists", {
          title: `Checklist ${RUN}`,
          status: "LIVE",
          items: [
            { id: "i1", title: "One" },
            { id: "i2", title: "Two" },
          ],
        }),
        "create checklist",
      ).data.checklist;
      state.checklistIds.push(checklist._id);
      const find = (list: any[]) =>
        list.find((e) => e.id === `checklist:${checklist._id}`);
      const before = find(await runtime("c1", "check-user"));
      expect(before, "checklist delivered");
      eq(before.metadata.completedItemIds, [], "nothing done yet");
      okBody(
        await track({
          eventName: "step_completed",
          checklistId: checklist._id,
          stepId: "i1",
          sessionId: "c1",
          userId: "check-user",
        }),
        "tick",
      );
      const after = find(await runtime("c1", "check-user"));
      eq(after.metadata.completedItemIds, ["i1"], "progress returned");
    },
  );

  // ------------------------------------------------------------ surveys
  console.log("\n▶ Surveys");
  await check(
    "NPS ignores responses that skipped the NPS question",
    async () => {
      const survey = okBody(
        await api("POST", `${base}/surveys`, {
          title: `NPS ${RUN}`,
          status: "LIVE",
          questions: [
            { id: "nps", type: "NPS", title: "Recommend us?", required: false },
            { id: "why", type: "TEXT", title: "Why?", required: false },
          ],
        }),
        "create survey",
      ).data.survey;
      state.surveyIds.push(survey._id);
      okBody(
        await api("POST", `${base}/surveys/${survey._id}/responses`, {
          userId: "a",
          answers: { nps: 10 },
        }),
        "promoter",
      );
      okBody(
        await api("POST", `${base}/surveys/${survey._id}/responses`, {
          userId: "b",
          answers: { why: "just text" },
        }),
        "text only",
      );
      const analytics = okBody(
        await api("GET", `${base}/surveys/${survey._id}/analytics`),
        "analytics",
      ).data;
      eq(analytics.responses, 2, "responses");
      eq(analytics.nps, 100, "nps over NPS answers only");
    },
  );
  await check(
    "a survey retry with the same idempotency key is not duplicated",
    async () => {
      const id = state.surveyIds[0];
      const body = {
        userId: "c",
        answers: { nps: 3 },
        idempotencyKey: `${RUN}-key`,
      };
      okBody(
        await api("POST", `${base}/surveys/${id}/responses`, body),
        "first",
      );
      okBody(
        await api("POST", `${base}/surveys/${id}/responses`, body),
        "retry",
      );
      const analytics = okBody(
        await api("GET", `${base}/surveys/${id}/analytics`),
        "analytics",
      ).data;
      eq(analytics.responses, 3, "one new response");
    },
  );
};

const cleanup = async () => {
  if (!token) return;
  const base = `/sdk-integrations/${state.integrationId}`;
  for (const id of state.guideIds) {
    await api("POST", `${base}/guides/${id}/status/PAUSED`);
    await api("DELETE", `${base}/guides/${id}`);
  }
  for (const id of state.surveyIds) {
    await api("PATCH", `${base}/surveys/${id}`, { status: "PAUSED" });
    await api("DELETE", `${base}/surveys/${id}`);
  }
  for (const id of state.checklistIds) await api("DELETE", `/checklists/${id}`);
  if (state.integrationId) await api("DELETE", base);
};

main()
  .catch((error) => {
    failures++;
    console.error(error);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed", e));
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures > 0 ? 1 : 0);
  });
