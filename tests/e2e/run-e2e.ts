/**
 * End-to-end test run against a live backend.
 *
 * Creates a throwaway user, an SDK integration with a sandbox, hundreds of
 * guides, surveys, events, survey responses and prompts through the real API
 * (SDK traffic is signed by the real SDK code), checks every result, then
 * cleans up. Writes a JSON + Markdown report to tests/e2e/reports/.
 *
 *   npm run test:e2e
 *
 * Environment:
 *   E2E_API_URL      default http://127.0.0.1:4000/api
 *   E2E_GUIDES       default 120
 *   E2E_SURVEYS      default 60
 *   E2E_EVENTS       default 1000 (sandbox; live gets half)
 *   E2E_RESPONSES    responses per accepting survey, default 6
 *   E2E_PROMPTS      default 40
 *   E2E_KEEP_DATA=1  skip cleanup (inspect the data in the portal afterwards)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SignedTransport } from "../../../analytics-sdk/src/index.js";
import { E2E_SCENARIOS } from "../cases/e2e.cases.js";
import { pick, randomInt, seededRandom } from "../support/catalog.js";

// ============================================================ configuration
const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api").replace(
  /\/+$/,
  "",
);
const N_GUIDES = Number(process.env.E2E_GUIDES ?? 120);
const N_SURVEYS = Number(process.env.E2E_SURVEYS ?? 60);
const N_EVENTS = Number(process.env.E2E_EVENTS ?? 1000);
const N_RESPONSES = Number(process.env.E2E_RESPONSES ?? 6);
const N_PROMPTS = Number(process.env.E2E_PROMPTS ?? 40);
const KEEP_DATA = process.env.E2E_KEEP_DATA === "1";
const LIVE_ORIGIN = "https://e2e.acme.test";
const SANDBOX_ORIGIN = "http://localhost:5173";
const RUN_ID = `e2e-${Date.now().toString(36)}`;
const rand = seededRandom(Date.now() % 2 ** 31);

type Env = "live" | "sandbox";
type Status = "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED";

// ============================================================ reporting
interface CheckResult {
  id: string;
  scenario: string;
  title: string;
  ok: boolean;
  detail?: string;
  ms: number;
}

const results: CheckResult[] = [];
let currentScenario = "";
const counters = new Map<string, number>();

const scenario = (id: string) => {
  const meta = E2E_SCENARIOS.find((s) => s.id === id);
  if (!meta) throw new Error(`Unknown scenario ${id}`);
  currentScenario = id;
  console.log(`\n▶ ${id} ${meta.title}`);
};

/** Runs one check; failures are recorded, never thrown. */
const check = async (
  title: string,
  fn: () => Promise<void> | void,
): Promise<boolean> => {
  const n = (counters.get(currentScenario) ?? 0) + 1;
  counters.set(currentScenario, n);
  const id = `${currentScenario}-${String(n).padStart(4, "0")}`;
  const started = Date.now();
  try {
    await fn();
    results.push({
      id,
      scenario: currentScenario,
      title,
      ok: true,
      ms: Date.now() - started,
    });
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({
      id,
      scenario: currentScenario,
      title,
      ok: false,
      detail,
      ms: Date.now() - started,
    });
    console.log(`  ✗ ${id} ${title}\n      ${detail}`);
    return false;
  }
};

const expect = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};
const expectEqual = (
  actual: unknown,
  expected: unknown,
  label: string,
): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
};

// ============================================================ HTTP
interface ApiResponse<T = any> {
  status: number;
  body: T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Node's fetch lets us set Origin; route each SDK key to its origin.
const originByKey = new Map<string, string>();
const nativeFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any = {}) => {
  const headers = new Headers(init.headers);
  let key = headers.get("x-sdk-key") ?? undefined;
  if (!key && typeof init.body === "string") {
    try {
      key = JSON.parse(init.body).sdkKey;
    } catch {
      /* not JSON */
    }
  }
  const origin = (key && originByKey.get(key)) ?? headers.get("origin");
  if (origin) headers.set("Origin", origin);
  for (let attempt = 0; ; attempt++) {
    const response = await nativeFetch(input, { ...init, headers });
    if (response.status !== 429 || attempt >= 6) return response;
    await sleep(250 * 2 ** attempt);
  }
}) as typeof fetch;

let token = "";
const api = async <T = any>(
  method: string,
  url: string,
  body?: unknown,
  query?: Record<string, string | number | undefined>,
): Promise<ApiResponse<T>> => {
  const qs = query
    ? `?${new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )}`
    : "";
  const response = await fetch(`${API}${url}${qs}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* plain text */
  }
  return { status: response.status, body: parsed };
};

const ok = <T>(
  res: ApiResponse<T>,
  label: string,
  expected = [200, 201],
): T => {
  if (!expected.includes(res.status)) {
    throw new Error(
      `${label}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`,
    );
  }
  return res.body;
};

/** Runs tasks with bounded concurrency (the API allows 100 req/s per IP). */
const pool = async <T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
};

// ============================================================ SDK client
/**
 * Signed SDK traffic through the real SDK transport. Sessions are rotated
 * every 200 requests to stay under the per-session rate limit.
 */
class SdkClient {
  private transport: SignedTransport;
  private used = 0;

  constructor(
    private readonly key: string,
    origin: string,
  ) {
    originByKey.set(key, origin);
    this.transport = new SignedTransport(key, API, 15_000);
  }

  async call<T = any>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    if (++this.used % 200 === 0)
      this.transport = new SignedTransport(this.key, API, 15_000);
    const response = await this.transport.request(url, { method, body });
    if (!response) throw new Error(`SDK ${method} ${url}: network error`);
    const text = await response.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* plain text */
    }
    return { status: response.status, body: parsed };
  }

  runtime(body: Record<string, unknown>) {
    return this.call("POST", "/engagement/runtime", body);
  }
}

// ============================================================ fixtures
const GUIDE_TYPES = [
  "MODAL",
  "TOUR",
  "SMART_TIP",
  "HOTSPOT",
  "BANNER",
] as const;
const SECTIONS = 5;
const statusPlan = (i: number): Status =>
  (
    [
      "LIVE",
      "LIVE",
      "DRAFT",
      "LIVE",
      "DRAFT",
      "PAUSED",
      "ARCHIVED",
      "DRAFT",
      "LIVE",
      "PAUSED",
    ] as Status[]
  )[i % 10];

const servable = (env: Env, status: Status) =>
  status === "LIVE" || (env === "sandbox" && status === "DRAFT");
const accepting = (env: Env, status: Status) =>
  servable(env, status) || status === "PAUSED";

const QUESTION_TYPES = [
  "NPS",
  "TEXT",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "RATING_SCALE",
  "YES_NO",
  "CSAT",
  "DROPDOWN",
  "TEXTAREA",
  "EMOJI",
] as const;
const OPTIONS = ["Speed", "Price", "Support", "Design"];

const makeQuestions = (i: number) => {
  const count = 3 + (i % 4);
  return Array.from({ length: count }, (_, k) => {
    const type =
      k === 0 ? "NPS" : QUESTION_TYPES[(i + k) % QUESTION_TYPES.length];
    const base: Record<string, unknown> = {
      id: `q${k}`,
      type,
      title: `${type} question ${k}`,
      required: k === 0,
    };
    if (["SINGLE_CHOICE", "MULTI_CHOICE", "DROPDOWN"].includes(type))
      base.options = OPTIONS;
    if (type === "RATING_SCALE") Object.assign(base, { min: 1, max: 5 });
    if (type === "CSAT") Object.assign(base, { min: 1, max: 5 });
    return base;
  });
};

const validAnswer = (q: any): unknown => {
  switch (q.type) {
    case "NPS":
      return randomInt(rand, 0, 10);
    case "RATING_SCALE":
    case "CSAT":
      return randomInt(rand, 1, 5);
    case "SINGLE_CHOICE":
    case "DROPDOWN":
      return pick(rand, OPTIONS);
    case "MULTI_CHOICE":
      return OPTIONS.slice(0, randomInt(rand, 1, OPTIONS.length));
    case "YES_NO":
      return rand() > 0.5 ? "yes" : "no";
    case "EMOJI":
      return pick(rand, ["😀", "😐", "😡"]);
    default:
      return `answer ${randomInt(rand, 1, 999)}`;
  }
};

interface GuideFixture {
  id: string;
  status: Status;
  section: number;
  type: string;
}
interface SurveyFixture {
  id: string;
  status: Status;
  questions: any[];
}

const state = {
  integrationId: "",
  liveKey: "",
  sandboxKey: "",
  workspaceId: "",
  guides: [] as GuideFixture[],
  surveys: [] as SurveyFixture[],
  sentEvents: {
    live: new Map<string, number>(),
    sandbox: new Map<string, number>(),
  },
  responses: {
    live: new Map<string, number[]>(),
    sandbox: new Map<string, number[]>(),
  },
  prompts: [] as string[],
};

// ============================================================ scenarios
const setup = async () => {
  scenario("E2E-SET");
  await check("register a throwaway user", async () => {
    const res = ok(
      await api("POST", "/auth/register", {
        email: `${RUN_ID}@example.test`,
        password: "E2e-Passw0rd!",
        firstName: "E2E",
        lastName: RUN_ID,
      }),
      "register",
    );
    token = res.data.accessToken;
    expect(token, "access token returned");
  });
  await check("create SDK integration", async () => {
    const res = ok(
      await api("POST", "/sdk-integrations", {
        name: `E2E ${RUN_ID}`,
        environment: "production",
        domain: LIVE_ORIGIN,
        description: "Created by tests/e2e/run-e2e.ts",
      }),
      "create integration",
    );
    state.integrationId = res.data.integration.id;
    state.liveKey = res.data.sdkKey;
    expect(
      state.liveKey.startsWith("sdk_") &&
        !state.liveKey.startsWith("sdk_test_"),
      "live key prefix",
    );
    expectEqual(
      res.data.integration.sandbox?.enabled,
      false,
      "sandbox off initially",
    );
  });
  await check("create sandbox", async () => {
    const res = ok(
      await api("POST", `/sdk-integrations/${state.integrationId}/sandbox`),
      "create sandbox",
    );
    state.sandboxKey = res.data.sandboxKey;
    expect(state.sandboxKey.startsWith("sdk_test_"), "sandbox key prefix");
    expectEqual(res.data.integration.sandbox.enabled, true, "sandbox enabled");
    expect(
      !JSON.stringify(res.data.integration).includes(state.sandboxKey),
      "raw key not in integration DTO",
    );
  });
  await check("second sandbox is refused", async () => {
    const res = await api(
      "POST",
      `/sdk-integrations/${state.integrationId}/sandbox`,
    );
    expectEqual(res.status, 409, "status");
  });
  await check("integration shows masked sandbox key", async () => {
    const res = ok(
      await api("GET", `/sdk-integrations/${state.integrationId}`),
      "get integration",
    );
    expect(
      res.data.integration.sandbox.keyMasked.startsWith("sdk_test_"),
      "masked prefix",
    );
    expect(res.data.integration.sandbox.keyMasked.includes("..."), "masked");
  });
  await check("find or create a workspace", async () => {
    let res = ok(await api("GET", "/workspaces"), "list workspaces");
    let ws = (res.workspaces ?? res.data?.workspaces ?? [])[0];
    if (!ws) {
      res = ok(
        await api("POST", "/workspaces", { name: `E2E ${RUN_ID}` }),
        "create workspace",
      );
      ws = res.workspace ?? res.data?.workspace;
    }
    state.workspaceId = ws._id ?? ws.id;
    expect(state.workspaceId, "workspace id");
  });
};

const auth = async () => {
  scenario("E2E-AUT");
  const raw = async (key: string, origin: string) =>
    nativeFetch(`${API}/sdk/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ sdkKey: key }),
    });
  for (const [label, keyName, origin, expected] of [
    ["live key from registered domain", "liveKey", LIVE_ORIGIN, 200],
    ["live key from localhost is rejected", "liveKey", SANDBOX_ORIGIN, 403],
    [
      "live key from another site is rejected",
      "liveKey",
      "https://evil.example.com",
      403,
    ],
    ["sandbox key from localhost", "sandboxKey", SANDBOX_ORIGIN, 200],
    ["sandbox key from 127.0.0.1", "sandboxKey", "http://127.0.0.1:3000", 200],
    ["sandbox key from registered domain", "sandboxKey", LIVE_ORIGIN, 200],
    [
      "sandbox key from another site is rejected",
      "sandboxKey",
      "https://evil.example.com",
      403,
    ],
  ] as const) {
    await check(label, async () => {
      const res = await raw(state[keyName], origin);
      expectEqual(res.status, expected, "status");
    });
  }
  await check("unknown key is rejected", async () => {
    const res = await raw(`sdk_${"0".repeat(48)}`, LIVE_ORIGIN);
    expectEqual(res.status, 401, "status");
  });
  await check("raw key without signature cannot call runtime", async () => {
    const res = await nativeFetch(`${API}/engagement/runtime`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: LIVE_ORIGIN,
        "X-API-KEY": state.liveKey,
      },
      body: "{}",
    });
    expectEqual(res.status, 401, "status");
  });
  for (const env of ["live", "sandbox"] as const) {
    await check(
      `signed ${env} runtime reports environment '${env}'`,
      async () => {
        const res = await sdk[env].runtime({
          userId: `${RUN_ID}-probe`,
          url: `${LIVE_ORIGIN}/`,
        });
        expectEqual(res.status, 200, "status");
        expectEqual(res.body.data.environment, env, "environment");
      },
    );
  }
};

const guides = async () => {
  scenario("E2E-GDE");
  const created: GuideFixture[] = new Array(N_GUIDES);
  await pool(
    Array.from({ length: N_GUIDES }, (_, i) => i),
    8,
    async (i) => {
      const status = statusPlan(i);
      const type = GUIDE_TYPES[i % GUIDE_TYPES.length];
      const section = i % SECTIONS;
      await check(
        `create ${type} guide #${i + 1} and move it to ${status}`,
        async () => {
          const steps = Array.from({ length: 1 + (i % 4) }, (_, k) => ({
            id: `s${k}`,
            title: `Step ${k + 1}`,
            description: `Guide ${i + 1}, step ${k + 1}`,
            selector: `#e2e-${i}-${k}`,
            placement:
              type === "MODAL" || type === "BANNER" ? "CENTER" : "BOTTOM",
          }));
          const res = ok(
            await api(
              "POST",
              `/sdk-integrations/${state.integrationId}/guides`,
              {
                title: `${RUN_ID} guide ${i + 1}`,
                type,
                priority: pick(rand, ["LOW", "MEDIUM", "HIGH"]),
                steps,
                targetingRules: {
                  id: "root",
                  operator: "AND",
                  conditions: [
                    {
                      id: "url",
                      type: "URL_CONTAINS",
                      value: `/app/section-${section}`,
                    },
                  ],
                },
                frequencyRules: { maxDisplays: 100 },
              },
            ),
            "create guide",
          );
          const id = res.data.guide._id ?? res.data.guide.id;
          expectEqual(
            res.data.guide.status,
            "DRAFT",
            "new guides start as DRAFT",
          );
          const path =
            status === "ARCHIVED"
              ? ["ARCHIVED"]
              : status === "PAUSED"
                ? ["LIVE", "PAUSED"]
                : status === "LIVE"
                  ? ["LIVE"]
                  : [];
          for (const next of path) {
            const r = ok(
              await api(
                "POST",
                `/sdk-integrations/${state.integrationId}/guides/${id}/status/${next}`,
              ),
              `status ${next}`,
            );
            expectEqual(r.data.guide.status, next, "status after transition");
          }
          created[i] = { id, status, section, type };
        },
      );
    },
  );
  state.guides = created.filter(Boolean);

  const invalid: Record<Status, Status> = {
    DRAFT: "PAUSED",
    LIVE: "DRAFT",
    PAUSED: "PAUSED",
    ARCHIVED: "LIVE",
  };
  for (const g of state.guides
    .filter((g) => g.status !== "PAUSED")
    .slice(0, 30)) {
    await check(
      `invalid transition ${g.status} → ${invalid[g.status]} is refused`,
      async () => {
        const res = await api(
          "POST",
          `/sdk-integrations/${state.integrationId}/guides/${g.id}/status/${invalid[g.status]}`,
        );
        expectEqual(res.status, 409, "status");
      },
    );
  }
  await check("a guide with no steps cannot go live", async () => {
    const res = ok(
      await api("POST", `/sdk-integrations/${state.integrationId}/guides`, {
        title: `${RUN_ID} empty`,
        type: "MODAL",
        steps: [],
      }),
      "create",
    );
    const id = res.data.guide._id ?? res.data.guide.id;
    const live = await api(
      "POST",
      `/sdk-integrations/${state.integrationId}/guides/${id}/status/LIVE`,
    );
    expectEqual(live.status, 400, "status");
    ok(
      await api(
        "DELETE",
        `/sdk-integrations/${state.integrationId}/guides/${id}`,
      ),
      "delete draft",
    );
  });
  const live = state.guides.find((g) => g.status === "LIVE");
  if (live) {
    await check("a live guide cannot be deleted", async () => {
      const res = await api(
        "DELETE",
        `/sdk-integrations/${state.integrationId}/guides/${live.id}`,
      );
      expectEqual(res.status, 409, "status");
    });
  }
  await check("malformed guide id returns 404, not 500", async () => {
    const res = await api(
      "GET",
      `/sdk-integrations/${state.integrationId}/guides/not-an-id`,
    );
    expectEqual(res.status, 404, "status");
  });
  for (const term of [".*", "(", "[a-", "guide 1", "\\", "$^"]) {
    await check(`search "${term}" is literal and safe`, async () => {
      const res = ok(
        await api(
          "GET",
          `/sdk-integrations/${state.integrationId}/guides`,
          undefined,
          { search: term },
        ),
        "search",
      );
      expect(Array.isArray(res.data.guides), "guides array");
    });
  }
  await check(`list returns all ${state.guides.length} guides`, async () => {
    const res = ok(
      await api("GET", `/sdk-integrations/${state.integrationId}/guides`),
      "list",
    );
    const mine = res.data.guides.filter(
      (g: any) =>
        String(g.title).startsWith(RUN_ID) &&
        !String(g.title).includes("empty"),
    );
    expectEqual(mine.length, state.guides.length, "count");
  });
};

const surveys = async () => {
  scenario("E2E-SRV");
  const created: SurveyFixture[] = new Array(N_SURVEYS);
  await pool(
    Array.from({ length: N_SURVEYS }, (_, i) => i),
    8,
    async (i) => {
      const status = statusPlan(i + 3);
      const questions = makeQuestions(i);
      await check(
        `create ${questions.length}-question survey #${i + 1} and move it to ${status}`,
        async () => {
          const res = ok(
            await api(
              "POST",
              `/sdk-integrations/${state.integrationId}/surveys`,
              {
                title: `${RUN_ID} survey ${i + 1}`,
                questions,
                // Own URL zone, so surveys never compete with the guide sections.
                targetingRules: {
                  id: "root",
                  operator: "AND",
                  conditions: [
                    {
                      id: "url",
                      type: "URL_CONTAINS",
                      value: "/app/survey-zone",
                    },
                  ],
                },
                frequencyRules: { showOncePerSession: false },
              },
            ),
            "create survey",
          );
          const id = res.data.survey._id ?? res.data.survey.id;
          const path =
            status === "ARCHIVED"
              ? ["ARCHIVED"]
              : status === "PAUSED"
                ? ["LIVE", "PAUSED"]
                : status === "LIVE"
                  ? ["LIVE"]
                  : [];
          for (const next of path) {
            const r = ok(
              await api(
                "PATCH",
                `/sdk-integrations/${state.integrationId}/surveys/${id}`,
                { status: next },
              ),
              `status ${next}`,
            );
            expectEqual(r.data.survey.status, next, "status after transition");
          }
          created[i] = { id, status, questions };
        },
      );
    },
  );
  state.surveys = created.filter(Boolean);

  await check(
    "survey with a one-option choice question cannot go live",
    async () => {
      const res = ok(
        await api("POST", `/sdk-integrations/${state.integrationId}/surveys`, {
          title: `${RUN_ID} broken`,
          questions: [
            {
              id: "p",
              type: "SINGLE_CHOICE",
              title: "Pick",
              options: ["Only"],
            },
          ],
        }),
        "create",
      );
      const id = res.data.survey._id ?? res.data.survey.id;
      const live = await api(
        "PATCH",
        `/sdk-integrations/${state.integrationId}/surveys/${id}`,
        { status: "LIVE" },
      );
      expectEqual(live.status, 400, "status");
      ok(
        await api(
          "DELETE",
          `/sdk-integrations/${state.integrationId}/surveys/${id}`,
        ),
        "delete",
      );
    },
  );
  const archived = state.surveys.find((s) => s.status === "ARCHIVED");
  if (archived) {
    await check("archived survey cannot go straight to LIVE", async () => {
      const res = await api(
        "PATCH",
        `/sdk-integrations/${state.integrationId}/surveys/${archived.id}`,
        { status: "LIVE" },
      );
      expectEqual(res.status, 409, "status");
    });
  }
};

const delivery = async () => {
  scenario("E2E-DLV");
  const items = [
    ...state.guides.map((g) => ({
      kind: "guide" as const,
      id: g.id,
      tourId: g.id,
      status: g.status,
    })),
    ...state.surveys.map((s) => ({
      kind: "survey" as const,
      id: s.id,
      tourId: `survey:${s.id}`,
      status: s.status,
    })),
  ];
  const jobs = items.flatMap((item) =>
    (["live", "sandbox"] as const).map((env) => ({ item, env })),
  );
  await pool(jobs, 6, async ({ item, env }, i) => {
    const expected = servable(env, item.status);
    await check(
      `${item.kind} ${item.id.slice(-6)} (${item.status}) via ${env} key is ${expected ? "delivered" : "not delivered"} (manual trigger)`,
      async () => {
        const res = await sdk[env].runtime({
          userId: `${RUN_ID}-dlv-${i}`,
          sessionId: `${RUN_ID}-dlv-${i}`,
          eventName: "manual_tour",
          eventProperties: { tourId: item.tourId },
          url: `${LIVE_ORIGIN}/nowhere`,
        });
        expectEqual(res.status, 200, "status");
        const ids: string[] = res.body.data.experiences.map((e: any) => e.id);
        expectEqual(
          ids.includes(item.tourId),
          expected,
          `delivered ${item.tourId} (got [${ids.join(", ")}])`,
        );
      },
    );
  });

  for (const env of ["live", "sandbox"] as const) {
    for (let section = 0; section < SECTIONS; section++) {
      await check(
        `URL targeting /app/section-${section} via ${env} only returns matching, servable guides`,
        async () => {
          const res = await sdk[env].runtime({
            userId: `${RUN_ID}-url-${env}-${section}`,
            url: `${LIVE_ORIGIN}/app/section-${section}`,
          });
          expectEqual(res.status, 200, "status");
          const byId = new Map(state.guides.map((g) => [g.id, g]));
          const delivered = res.body.data.experiences.filter((e: any) =>
            byId.has(e.id),
          );
          expect(
            delivered.length > 0 ||
              !state.guides.some(
                (g) => g.section === section && servable(env, g.status),
              ),
            "something delivered",
          );
          for (const e of delivered) {
            const g = byId.get(e.id)!;
            expectEqual(g.section, section, `guide ${e.id} section`);
            expect(
              servable(env, g.status),
              `guide ${e.id} (${g.status}) must not be served to ${env}`,
            );
          }
        },
      );
    }
  }
};

const events = async () => {
  scenario("E2E-EVT");
  const NAMES = Array.from({ length: 10 }, (_, i) => `${RUN_ID}_evt_${i}`);
  for (const env of ["sandbox", "live"] as const) {
    const total = env === "sandbox" ? N_EVENTS : Math.floor(N_EVENTS / 2);
    const all = Array.from({ length: total }, (_, i) => ({
      eventId: `${RUN_ID}-${env}-${i}`,
      eventName: NAMES[i % NAMES.length],
      userId: `${RUN_ID}-user-${i % 37}`,
      sessionId: `${RUN_ID}-session-${i % 11}`,
      properties: {
        index: i,
        plan: pick(rand, ["free", "pro", "enterprise"]),
        amount: randomInt(rand, 1, 500),
      },
      timestamp: new Date().toISOString(),
    }));
    all.forEach((e) =>
      state.sentEvents[env].set(
        e.eventName,
        (state.sentEvents[env].get(e.eventName) ?? 0) + 1,
      ),
    );
    const batches = Array.from(
      { length: Math.ceil(all.length / 100) },
      (_, b) => all.slice(b * 100, b * 100 + 100),
    );
    await pool(batches, 3, async (batch, b) => {
      await check(
        `${env}: batch ${b + 1}/${batches.length} (${batch.length} events) accepted`,
        async () => {
          const res = await sdk[env].call("POST", "/batch", batch);
          expectEqual(res.status, 200, "status");
          expectEqual(res.body.insertedCount, batch.length, "inserted");
        },
      );
    });
    await check(
      `${env}: resending a batch does not duplicate events`,
      async () => {
        const res = await sdk[env].call("POST", "/batch", all.slice(0, 50));
        expectEqual(res.status, 200, "status");
        expectEqual(res.body.insertedCount, 0, "inserted on resend");
      },
    );
  }
  for (const env of ["sandbox", "live"] as const) {
    await check(`${env}: single /track event`, async () => {
      const res = await sdk[env].call("POST", "/track", {
        eventName: `${RUN_ID}_single`,
        payload: { ok: true },
        sessionId: "s1",
      });
      expectEqual(res.status, 200, "status");
    });
    await check(`${env}: /page view`, async () => {
      const res = await sdk[env].call("POST", "/page", {
        url: `${LIVE_ORIGIN}/pricing`,
        title: "Pricing",
        userId: `${RUN_ID}-pager`,
      });
      expectEqual(res.status, 200, "status");
    });
    await check(`${env}: /identify`, async () => {
      const res = await sdk[env].call("POST", "/identify", {
        userId: `${RUN_ID}-identified`,
        traits: { plan: "pro" },
      });
      expectEqual(res.status, 200, "status");
    });
    await check(`${env}: batch of 101 is rejected`, async () => {
      const res = await sdk[env].call(
        "POST",
        "/batch",
        Array.from({ length: 101 }, (_, i) => ({
          eventName: "x",
          eventId: `${RUN_ID}-big-${env}-${i}`,
        })),
      );
      expectEqual(res.status, 400, "status");
    });
    await check(`${env}: event over 32 KB is rejected`, async () => {
      const res = await sdk[env].call("POST", "/track", {
        eventName: "huge",
        payload: { blob: "x".repeat(33_000) },
      });
      expectEqual(res.status, 400, "status");
    });
    await check(`${env}: event without a name is rejected`, async () => {
      const res = await sdk[env].call("POST", "/track", { payload: {} });
      expectEqual(res.status, 400, "status");
    });
  }
  for (const env of ["sandbox", "live"] as const) {
    await check(
      `${env}: dashboard event counts match what was sent`,
      async () => {
        const res = ok(
          await api("GET", "/analytics/events", undefined, {
            sdkIntegrationId: state.integrationId,
            environment: env,
            eventNames: NAMES.join(","),
          }),
          "events",
        );
        const counts = Object.fromEntries(
          (res as any[]).map((e) => [e.eventName, e.count]),
        );
        for (const name of NAMES) {
          expectEqual(
            counts[name] ?? 0,
            state.sentEvents[env].get(name) ?? 0,
            `${env} ${name}`,
          );
        }
      },
    );
    await check(`${env}: raw log list total matches`, async () => {
      const res = ok(
        await api("GET", "/analytics/all-logs", undefined, {
          sdkIntegrationId: state.integrationId,
          environment: env,
          eventNames: NAMES.join(","),
          limit: 1,
        }),
        "all-logs",
      );
      const expected = [...state.sentEvents[env].values()].reduce(
        (a, b) => a + b,
        0,
      );
      expectEqual(res.data.total, expected, "total");
    });
  }
};

const responses = async () => {
  scenario("E2E-RSP");
  const jobs = state.surveys.flatMap((s) =>
    (["live", "sandbox"] as const).flatMap((env) =>
      Array.from(
        { length: accepting(env, s.status) ? N_RESPONSES : 1 },
        (_, r) => ({ s, env, r }),
      ),
    ),
  );
  await pool(jobs, 6, async ({ s, env, r }) => {
    const expected = accepting(env, s.status);
    await check(
      `${env} response #${r + 1} to ${s.status} survey is ${expected ? "stored" : "refused"}`,
      async () => {
        const answers = s.questions.map((q) => ({
          questionId: q.id,
          value: validAnswer(q),
        }));
        const res = await sdk[env].call("POST", "/engagement/track", {
          eventName: "survey_completed",
          surveyId: s.id,
          userId: `${RUN_ID}-resp-${r}`,
          sessionId: `${RUN_ID}-resp-${s.id}-${r}`,
          properties: {
            answers,
            idempotencyKey: `${RUN_ID}-${env}-${s.id}-${r}`,
          },
        });
        if (expected) {
          expectEqual(res.status, 200, "status");
          const nps = answers[0].value as number;
          const list = state.responses[env].get(s.id) ?? [];
          list.push(nps);
          state.responses[env].set(s.id, list);
        } else {
          expectEqual(res.status, 409, "status");
        }
      },
    );
  });

  const target = state.surveys.find((s) => s.status === "LIVE");
  if (target) {
    await check(
      "retrying with the same idempotency key does not duplicate",
      async () => {
        const before = state.responses.live.get(target.id)?.length ?? 0;
        for (let i = 0; i < 3; i++) {
          const res = await sdk.live.call("POST", "/engagement/track", {
            eventName: "survey_completed",
            surveyId: target.id,
            properties: {
              answers: { q0: 5 },
              idempotencyKey: `${RUN_ID}-live-${target.id}-0`,
            },
          });
          expectEqual(res.status, 200, "status");
        }
        const list = ok(
          await api(
            "GET",
            `/sdk-integrations/${state.integrationId}/surveys/${target.id}/responses`,
            undefined,
            { environment: "live", limit: 200 },
          ),
          "list",
        );
        expectEqual(list.data.total, before, "response count");
      },
    );
    for (const [label, answers] of [
      ["NPS of 11", { q0: 11 }],
      ["NPS of 7.5", { q0: 7.5 }],
      ["missing required NPS", { q1: "x" }],
      ["non-numeric NPS", { q0: "ten" }],
    ] as const) {
      await check(`invalid answer (${label}) is rejected`, async () => {
        const res = await sdk.live.call("POST", "/engagement/track", {
          eventName: "survey_completed",
          surveyId: target.id,
          properties: { answers },
        });
        expectEqual(res.status, 400, "status");
      });
    }
  }

  for (const env of ["live", "sandbox"] as const) {
    for (const s of state.surveys.filter((x) => accepting(env, x.status))) {
      await check(
        `${env}: survey ${s.id.slice(-6)} shows ${state.responses[env].get(s.id)?.length ?? 0} responses and the right NPS`,
        async () => {
          const scores = state.responses[env].get(s.id) ?? [];
          const list = ok(
            await api(
              "GET",
              `/sdk-integrations/${state.integrationId}/surveys/${s.id}/responses`,
              undefined,
              { environment: env, limit: 200 },
            ),
            "list",
          );
          expectEqual(list.data.total, scores.length, "responses");
          const analytics = ok(
            await api(
              "GET",
              `/sdk-integrations/${state.integrationId}/surveys/${s.id}/analytics`,
              undefined,
              { environment: env },
            ),
            "analytics",
          );
          const promoters = scores.filter((v) => v >= 9).length;
          const detractors = scores.filter((v) => v <= 6).length;
          const nps = scores.length
            ? ((promoters - detractors) / scores.length) * 100
            : 0;
          expectEqual(
            analytics.data.responses,
            scores.length,
            "analytics responses",
          );
          expect(
            Math.abs(analytics.data.nps - nps) < 1e-9,
            `NPS ${analytics.data.nps} vs ${nps}`,
          );
        },
      );
    }
  }
};

const analyticsSummary = async () => {
  scenario("E2E-ANL");
  for (const env of ["live", "sandbox"] as const) {
    await check(`${env}: engagement summary totals`, async () => {
      const res = ok(
        await api(
          "GET",
          `/sdk-integrations/${state.integrationId}/guide-analytics/summary`,
          undefined,
          { environment: env },
        ),
        "summary",
      );
      const expected = [...state.responses[env].values()].reduce(
        (a, b) => a + b.length,
        0,
      );
      expectEqual(res.data.environment, env, "environment");
      expectEqual(res.data.surveys.responses, expected, "survey responses");
      if (env === "sandbox") expectEqual(res.data.mtu.users, 0, "sandbox MTU");
    });
  }
};

const sandboxLifecycle = async () => {
  scenario("E2E-SBX");
  const count = async (env: Env) =>
    ok(
      await api("GET", "/analytics/all-logs", undefined, {
        sdkIntegrationId: state.integrationId,
        environment: env,
        limit: 1,
      }),
      "all-logs",
    ).data.total as number;
  const liveBefore = await count("live");
  await check("reset sandbox deletes sandbox data only", async () => {
    const res = ok(
      await api(
        "POST",
        `/sdk-integrations/${state.integrationId}/sandbox/reset`,
      ),
      "reset",
    );
    expect(res.data.purged.events > 0, "events purged");
    expectEqual(await count("sandbox"), 0, "sandbox events after reset");
    expectEqual(await count("live"), liveBefore, "live events unchanged");
  });
  await check("sandbox survey responses are gone after reset", async () => {
    const s = state.surveys.find((x) => accepting("sandbox", x.status));
    if (!s) return;
    const list = ok(
      await api(
        "GET",
        `/sdk-integrations/${state.integrationId}/surveys/${s.id}/responses`,
        undefined,
        { environment: "sandbox" },
      ),
      "list",
    );
    expectEqual(list.data.total, 0, "sandbox responses");
  });
  await check("sandbox key keeps working after reset", async () => {
    const res = await sdk.sandbox.call("POST", "/track", {
      eventName: `${RUN_ID}_after_reset`,
    });
    expectEqual(res.status, 200, "status");
  });
  let newKey = "";
  await check("regenerating the sandbox key revokes the old one", async () => {
    const res = ok(
      await api(
        "POST",
        `/sdk-integrations/${state.integrationId}/sandbox/regenerate-key`,
      ),
      "regenerate",
    );
    newKey = res.data.sandboxKey;
    expect(newKey !== state.sandboxKey, "new key differs");
    const old = await nativeFetch(`${API}/sdk/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: SANDBOX_ORIGIN },
      body: JSON.stringify({ sdkKey: state.sandboxKey }),
    });
    expectEqual(old.status, 401, "old key");
    const fresh = new SdkClient(newKey, SANDBOX_ORIGIN);
    expectEqual(
      (await fresh.call("POST", "/track", { eventName: `${RUN_ID}_new_key` }))
        .status,
      200,
      "new key",
    );
  });
  await check(
    "deleting the sandbox disables its key and leaves live data",
    async () => {
      ok(
        await api("DELETE", `/sdk-integrations/${state.integrationId}/sandbox`),
        "delete sandbox",
      );
      const res = await nativeFetch(`${API}/sdk/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: SANDBOX_ORIGIN },
        body: JSON.stringify({ sdkKey: newKey }),
      });
      expectEqual(res.status, 401, "deleted key");
      expectEqual(await count("live"), liveBefore, "live events unchanged");
      const integration = ok(
        await api("GET", `/sdk-integrations/${state.integrationId}`),
        "get",
      );
      expectEqual(
        integration.data.integration.sandbox.enabled,
        false,
        "sandbox disabled",
      );
    },
  );
};

const prompts = async () => {
  scenario("E2E-PRM");
  const base = `/workspaces/${state.workspaceId}/prompts`;
  await check("feature registry lists 9 AI features", async () => {
    const res = ok(await api("GET", `${base}/features`), "features");
    expectEqual(res.data.length, 9, "features");
  });
  await pool(
    Array.from({ length: N_PROMPTS }, (_, i) => i),
    4,
    async (i) => {
      await check(
        `prompt #${i + 1}: versions, direct deploy, canary, promote, rollback`,
        async () => {
          const created = ok(
            await api("POST", base, {
              name: `${RUN_ID} prompt ${i + 1}`,
              body: `You are assistant ${i}. v1`,
            }),
            "create",
          );
          let id = created.data._id;
          state.prompts.push(id);
          const versions = 3 + (i % 3);
          for (let v = 2; v <= versions; v++) {
            const updated = ok(
              await api("PATCH", `${base}/${id}`, {
                body: `You are assistant ${i}. v${v}`,
                changeNote: `v${v}`,
              }),
              `edit v${v}`,
            );
            id = updated.data._id;
          }
          let dep = ok(
            await api("GET", `${base}/${id}/deployment`),
            "deployment",
          ).data;
          expectEqual(
            [dep.productionVersion, dep.stagingVersion, dep.latestVersion],
            [1, null, versions],
            "editing never deploys",
          );

          dep = ok(
            await api("POST", `${base}/${id}/deployment/deploy`, {
              version: 2,
              strategy: "direct",
            }),
            "direct",
          ).data;
          expectEqual(
            [dep.productionVersion, dep.stagingVersion],
            [2, 1],
            "direct: previous production → staging",
          );

          const pct = 1 + ((i * 7) % 99);
          dep = ok(
            await api("POST", `${base}/${id}/deployment/deploy`, {
              version: versions,
              strategy: "canary",
              percentage: pct,
            }),
            "canary",
          ).data;
          expectEqual(
            [
              dep.productionVersion,
              dep.stagingVersion,
              dep.canary?.version,
              dep.canary?.percentage,
            ],
            [2, 1, versions, pct],
            "canary leaves production alone",
          );

          const statuses = ok(
            await api("GET", `${base}/${id}/versions`),
            "versions",
          ).data.map((v: any) => v.status);
          expectEqual(
            statuses.filter((s: string) => s === "production").length,
            1,
            "exactly one production",
          );

          dep = ok(
            await api("POST", `${base}/${id}/deployment/canary/promote`),
            "promote",
          ).data;
          expectEqual(
            [dep.productionVersion, dep.stagingVersion, dep.canary],
            [versions, 2, null],
            "promote",
          );

          dep = ok(
            await api("POST", `${base}/${id}/deployment/rollback`),
            "rollback",
          ).data;
          expectEqual(
            [dep.productionVersion, dep.stagingVersion],
            [2, versions],
            "rollback swaps",
          );

          const bad = await api("POST", `${base}/${id}/deployment/deploy`, {
            version: versions,
            strategy: "canary",
            percentage: 100,
          });
          expectEqual(bad.status, 400, "100% canary rejected");
          const same = await api("POST", `${base}/${id}/deployment/deploy`, {
            version: 2,
            strategy: "direct",
          });
          expectEqual(same.status, 400, "redeploying production rejected");
        },
      );
    },
  );
};

const cleanup = async () => {
  scenario("E2E-CLN");
  if (KEEP_DATA) {
    console.log("  (E2E_KEEP_DATA=1: data kept)");
    return;
  }
  await pool(state.guides, 8, async (g) => {
    await check(`remove guide ${g.id.slice(-6)}`, async () => {
      if (g.status === "LIVE")
        ok(
          await api(
            "POST",
            `/sdk-integrations/${state.integrationId}/guides/${g.id}/status/PAUSED`,
          ),
          "pause",
        );
      ok(
        await api(
          "DELETE",
          `/sdk-integrations/${state.integrationId}/guides/${g.id}`,
        ),
        "delete",
      );
    });
  });
  await pool(state.surveys, 8, async (s) => {
    await check(`remove survey ${s.id.slice(-6)}`, async () => {
      if (s.status === "LIVE")
        ok(
          await api(
            "PATCH",
            `/sdk-integrations/${state.integrationId}/surveys/${s.id}`,
            { status: "PAUSED" },
          ),
          "pause",
        );
      ok(
        await api(
          "DELETE",
          `/sdk-integrations/${state.integrationId}/surveys/${s.id}`,
        ),
        "delete",
      );
    });
  });
  await pool(state.prompts, 4, async (id) => {
    await check(`archive prompt ${id.slice(-6)}`, async () => {
      ok(
        await api("DELETE", `/workspaces/${state.workspaceId}/prompts/${id}`),
        "archive",
      );
    });
  });
  await check("delete integration", async () => {
    ok(
      await api("DELETE", `/sdk-integrations/${state.integrationId}`),
      "delete integration",
    );
  });
};

// ============================================================ run
let sdk: Record<Env, SdkClient>;

const main = async () => {
  const started = Date.now();
  console.log(`E2E run ${RUN_ID} against ${API}`);
  const health = await nativeFetch(API.replace(/\/api$/, "/health")).catch(
    () => null,
  );
  if (!health) {
    console.error(
      `Backend not reachable at ${API}. Start it first (npm run dev).`,
    );
    process.exit(2);
  }

  await setup();
  if (!state.integrationId || !state.sandboxKey)
    throw new Error("Setup failed; see report");
  sdk = {
    live: new SdkClient(state.liveKey, LIVE_ORIGIN),
    sandbox: new SdkClient(state.sandboxKey, SANDBOX_ORIGIN),
  };

  for (const step of [
    auth,
    guides,
    surveys,
    delivery,
    events,
    responses,
    analyticsSummary,
    sandboxLifecycle,
    prompts,
  ]) {
    try {
      await step();
    } catch (error) {
      await check(`scenario aborted`, () => {
        throw error;
      });
    }
  }
  await cleanup();

  // ---- report
  const failed = results.filter((r) => !r.ok);
  const byScenario = E2E_SCENARIOS.map((s) => {
    const rows = results.filter((r) => r.scenario === s.id);
    return {
      ...s,
      total: rows.length,
      passed: rows.filter((r) => r.ok).length,
    };
  });
  const dir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "reports",
  );
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary = {
    runId: RUN_ID,
    api: API,
    startedAt: new Date(started).toISOString(),
    durationSeconds: Math.round((Date.now() - started) / 1000),
    config: {
      N_GUIDES,
      N_SURVEYS,
      N_EVENTS,
      N_RESPONSES,
      N_PROMPTS,
      KEEP_DATA,
    },
    totals: {
      checks: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
    },
    scenarios: byScenario.map(({ id, title, total, passed }) => ({
      id,
      title,
      total,
      passed,
    })),
  };
  fs.writeFileSync(
    path.join(dir, `e2e-${stamp}.json`),
    JSON.stringify({ ...summary, results }, null, 2),
  );
  const md = [
    `# E2E report ${RUN_ID}`,
    "",
    `${summary.totals.passed}/${summary.totals.checks} checks passed in ${summary.durationSeconds}s against \`${API}\`.`,
    "",
    "| Scenario | Checks | Passed |",
    "| --- | --- | --- |",
    ...byScenario.map(
      (s) => `| ${s.id} ${s.title} | ${s.total} | ${s.passed} |`,
    ),
    "",
    failed.length ? "## Failures\n" : "No failures.",
    ...failed.map((f) => `- **${f.id}** ${f.title}: ${f.detail}`),
  ].join("\n");
  fs.writeFileSync(path.join(dir, `e2e-${stamp}.md`), md);

  console.log(
    `\n${summary.totals.passed}/${summary.totals.checks} checks passed in ${summary.durationSeconds}s`,
  );
  for (const s of byScenario)
    console.log(
      `  ${s.passed === s.total ? "✓" : "✗"} ${s.id} ${s.title}: ${s.passed}/${s.total}`,
    );
  console.log(`Report: tests/e2e/reports/e2e-${stamp}.md`);
  process.exit(failed.length ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
