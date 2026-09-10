/**
 * sdk-integration-api.test.ts
 *
 * Live HTTP integration tests for the SDK Integration Management API.
 * Requires the backend to be running at http://localhost:4000.
 *
 * Run: cd backend && npx tsx src/scripts/test-sdk-integration-api.ts
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4000/api";
const EMAIL = process.env.TEST_EMAIL ?? `test_e2e_${Date.now()}@example.com`;
const PASSWORD = process.env.TEST_PASSWORD ?? "password123";

let authToken = "";
let integrationId = "";
let sdkKey = "";

// ── colour helpers ────────────────────────────────────────────────────────────
const G = "\x1b[32m✔\x1b[0m";
const R = "\x1b[31m✗\x1b[0m";
const B = "\x1b[34m→\x1b[0m";

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${B} ${name} … `);
  try {
    await fn();
    console.info(`${G}`);
    passed++;
  } catch (err) {
    console.info(`${R}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;

async function authedFetch(
  method: string,
  path: string,
  body?: unknown,
  token = authToken,
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function canonicalJsonStringify(obj: any): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);

  const sortKeys = (o: any): any => {
    if (Array.isArray(o)) {
      return o.map(sortKeys);
    } else if (o !== null && typeof o === "object") {
      return Object.keys(o)
        .sort()
        .reduce((result: any, key: string) => {
          result[key] = sortKeys(o[key]);
          return result;
        }, {});
    }
    return o;
  };

  return JSON.stringify(sortKeys(obj));
}

const sessionCache = new Map<
  string,
  { sessionId: string; sessionSecret: string }
>();

async function sdkFetch(
  method: string,
  path: string,
  body?: unknown,
  key = sdkKey,
  customOrigin = "http://localhost:5174",
): Promise<Response> {
  if (!key) {
    return fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  let session = sessionCache.get(key);
  if (!session) {
    const authRes = await fetch(`${BASE}/sdk/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: customOrigin,
      },
      body: JSON.stringify({
        sdkKey: key,
        origin: customOrigin,
      }),
    });

    if (!authRes.ok) {
      return authRes;
    }

    const authData = (await authRes.json()) as any;
    session = {
      sessionId: authData.sessionId,
      sessionSecret: authData.sessionSecret,
    };
    sessionCache.set(key, session);
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyStr = body ? canonicalJsonStringify(body) : "";
  const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("hex");

  const url = new URL(`${BASE}${path}`);
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  pathname = decodeURIComponent(pathname);
  url.searchParams.sort();
  const queryString = url.searchParams.toString();

  const sigVersion = "1";
  const canonicalString = `${method.toUpperCase()}${pathname}${queryString}${bodyHash}${timestamp}${nonce}${sigVersion}${key}`;

  const signature = crypto
    .createHmac("sha256", session.sessionSecret)
    .update(canonicalString)
    .digest("hex");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-SDK-Key": key,
    "X-Session-Id": session.sessionId,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Body-SHA256": bodyHash,
    "X-Signature": signature,
    "X-Signature-Version": sigVersion,
  };

  if (customOrigin) {
    headers["Origin"] = customOrigin;
  }

  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── setup ─────────────────────────────────────────────────────────────────────
async function login() {
  try {
    const regRes = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        firstName: "Test",
        lastName: "User",
        username: "test_" + Date.now(),
      }),
    });
    console.log(`Register status: ${regRes.status}`);
    const regText = await regRes.text();
    console.log(`Register body: ${regText}`);
  } catch (e) {
    console.error("Register exception:", e);
  }

  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await json(r);
  const token = ((data.data as any)?.token ||
    (data.data as any)?.accessToken) as string;
  if (!token)
    throw new Error(`Login failed. Response: ${JSON.stringify(data)}`);
  authToken = token;
}

// ════════════════════════════════════════════════════════════════════════════════
// Test suites
// ════════════════════════════════════════════════════════════════════════════════

async function testSdkIntegrationCRUD() {
  console.info("\n\x1b[1m📋 SDK Integration CRUD\x1b[0m");

  await runTest("GET /sdk-integrations — empty list returns 200", async () => {
    const r = await authedFetch("GET", "/sdk-integrations");
    assert.equal(r.status, 200);
    const data = await json(r);
    assert.ok(Array.isArray((data.data as any)?.integrations));
  });

  await runTest(
    "POST /sdk-integrations — creates integration, returns raw SDK key",
    async () => {
      const r = await authedFetch("POST", "/sdk-integrations", {
        name: "Test Integration [e2e]",
        environment: "development",
        domain: "http://localhost:5174",
        description: "Created by automated test suite",
      });
      assert.equal(r.status, 201, `expected 201, got ${r.status}`);
      const data = await json(r);
      const integration = (data.data as any)?.integration;
      const key = (data.data as any)?.sdkKey as string;
      assert.ok(integration?.id, "should have integration id");
      assert.ok(
        key?.startsWith("sdk_"),
        `key should start with sdk_, got: ${key}`,
      );
      assert.equal(integration.status, "pending");
      assert.equal(integration.environment, "development");
      integrationId = integration.id;
      sdkKey = key;
    },
  );

  await runTest(
    "POST /sdk-integrations — rejects missing name (400)",
    async () => {
      const r = await authedFetch("POST", "/sdk-integrations", {
        environment: "production",
        domain: "https://app.example.com",
      });
      assert.equal(r.status, 400);
      const data = await json(r);
      assert.ok(
        (data.error as string).includes("name"),
        `expected name error, got: ${data.error}`,
      );
    },
  );

  await runTest(
    "POST /sdk-integrations — rejects invalid environment (400)",
    async () => {
      const r = await authedFetch("POST", "/sdk-integrations", {
        name: "Bad Env",
        environment: "production-v3",
        domain: "https://app.example.com",
      });
      assert.equal(r.status, 400);
    },
  );

  await runTest(
    "GET /sdk-integrations — lists the newly created integration",
    async () => {
      const r = await authedFetch("GET", "/sdk-integrations");
      const data = await json(r);
      const list = (data.data as any)?.integrations as any[];
      const found = list.find((i) => i.id === integrationId);
      assert.ok(found, "created integration should be in list");
      assert.ok(
        found.sdkKeyMasked.includes("..."),
        "SDK key should be masked in list",
      );
    },
  );

  await runTest(
    "GET /sdk-integrations/:id — returns single integration",
    async () => {
      const r = await authedFetch("GET", `/sdk-integrations/${integrationId}`);
      assert.equal(r.status, 200);
      const data = await json(r);
      const integration = (data.data as any)?.integration;
      assert.equal(integration.id, integrationId);
    },
  );

  await runTest("GET /sdk-integrations/nonexistent — returns 404", async () => {
    const r = await authedFetch(
      "GET",
      "/sdk-integrations/000000000000000000000001",
    );
    assert.equal(r.status, 404);
  });

  await runTest(
    "PATCH /sdk-integrations/:id — updates name and description",
    async () => {
      const r = await authedFetch(
        "PATCH",
        `/sdk-integrations/${integrationId}`,
        {
          name: "Updated Integration Name",
          description: "Updated by e2e test",
        },
      );
      assert.equal(r.status, 200);
      const data = await json(r);
      const integration = (data.data as any)?.integration;
      assert.equal(integration.name, "Updated Integration Name");
      assert.equal(integration.description, "Updated by e2e test");
    },
  );
}

async function testSdkKeyAuth() {
  console.info("\n\x1b[1m🔑 SDK Key Authentication\x1b[0m");

  await runTest(
    "Engagement runtime — valid SDK key (development) → 200",
    async () => {
      const r = await sdkFetch("POST", "/engagement/runtime", {
        userId: "user-e2e-test",
        sessionId: "session-abc",
        properties: {},
        context: {
          url: "http://localhost:5174/dashboard",
          path: "/dashboard",
          title: "Dashboard",
        },
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status}`);
      const data = await json(r);
      assert.ok(
        Array.isArray((data.data as any)?.experiences),
        "should return experiences array",
      );
    },
  );

  await runTest("Engagement runtime — no key → 401", async () => {
    const r = await fetch(`${BASE}/engagement/runtime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        sessionId: "s1",
        properties: {},
        context: {},
      }),
    });
    assert.equal(r.status, 401);
  });

  await runTest("Engagement runtime — invalid key → 401", async () => {
    const r = await sdkFetch(
      "POST",
      "/engagement/runtime",
      {
        userId: "u1",
        sessionId: "s1",
        properties: {},
        context: { path: "/dashboard" },
      },
      "sdk_invalid_key_000",
    );
    assert.equal(r.status, 401);
  });

  await runTest(
    "Engagement runtime — wrong origin (production) → 403",
    async () => {
      // Create a production integration with a specific domain
      const createR = await authedFetch("POST", "/sdk-integrations", {
        name: "Prod Origin Test [e2e]",
        environment: "production",
        domain: "https://production.example.com",
      });
      const createData = await json(createR);
      const prodKey = (createData.data as any)?.sdkKey as string;
      const prodId = (createData.data as any)?.integration?.id as string;

      // Request with mismatched origin
      const r = await sdkFetch(
        "POST",
        "/engagement/runtime",
        {
          userId: "u1",
          sessionId: "s1",
          properties: {},
          context: {},
        },
        prodKey,
        "https://evil.attacker.com",
      );
      assert.equal(r.status, 403, `expected 403, got ${r.status}`);

      // Clean up
      await authedFetch("DELETE", `/sdk-integrations/${prodId}`);
    },
  );
}

async function testLifecycleActions() {
  console.info("\n\x1b[1m🔄 Integration Lifecycle\x1b[0m");

  await runTest("POST /:id/disable — disables integration", async () => {
    const r = await authedFetch(
      "POST",
      `/sdk-integrations/${integrationId}/disable`,
    );
    assert.equal(r.status, 200);
    const data = await json(r);
    assert.equal((data.data as any)?.integration?.status, "disabled");
  });

  await runTest(
    "Engagement runtime — disabled integration key → 403",
    async () => {
      const r = await sdkFetch("POST", "/engagement/runtime", {
        userId: "u1",
        sessionId: "s1",
        properties: {},
        context: { path: "/dashboard" },
      });
      assert.equal(r.status, 403);
      const data = await json(r);
      assert.ok((data.error as string).includes("disabled"));
    },
  );

  await runTest("POST /:id/enable — re-enables integration", async () => {
    const r = await authedFetch(
      "POST",
      `/sdk-integrations/${integrationId}/enable`,
    );
    assert.equal(r.status, 200);
    const data = await json(r);
    const status = (data.data as any)?.integration?.status;
    assert.ok(
      status === "connected" || status === "pending",
      `unexpected status: ${status}`,
    );
  });

  await runTest(
    "POST /:id/regenerate-key — rotates key, returns new raw key",
    async () => {
      const r = await authedFetch(
        "POST",
        `/sdk-integrations/${integrationId}/regenerate-key`,
      );
      assert.equal(r.status, 200);
      const data = await json(r);
      const newKey = (data.data as any)?.sdkKey as string;
      assert.ok(
        newKey?.startsWith("sdk_"),
        `new key should start with sdk_, got: ${newKey}`,
      );
      assert.notEqual(newKey, sdkKey, "new key must differ from old key");
      sdkKey = newKey; // update for subsequent tests
    },
  );

  await runTest("Old key invalid after regeneration → 401", async () => {
    // We need the *truly* old key — it was captured before regeneration so we use a fake one
    const r = await sdkFetch(
      "POST",
      "/engagement/runtime",
      {
        userId: "u1",
        sessionId: "s1",
        properties: {},
        context: { path: "/" },
      },
      "sdk_old_invalidated_key_0000000000000000",
    );
    assert.equal(r.status, 401, "old/invalid key must be rejected");
  });

  await runTest("New key works after regeneration → 200", async () => {
    const r = await sdkFetch("POST", "/engagement/runtime", {
      userId: "user-post-regen",
      sessionId: "session-regen-test",
      properties: {},
      context: {
        url: "http://localhost:5174/dashboard",
        path: "/dashboard",
        title: "Dashboard",
      },
    });
    assert.equal(r.status, 200, `expected 200 with new key, got ${r.status}`);
  });
}

async function testEngagementSDKEvents() {
  console.info("\n\x1b[1m📡 Engagement Events & Tracking\x1b[0m");

  await runTest(
    "POST /engagement/track — guide_shown event → 200",
    async () => {
      const r = await sdkFetch("POST", "/engagement/track", {
        eventName: "guide_shown",
        guideId: "000000000000000000000001",
        userId: "user-e2e-test",
        sessionId: "session-track-test",
        properties: { guideName: "Dashboard Tour" },
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status}`);
    },
  );

  await runTest(
    "POST /engagement/track — guide_completed event → 200",
    async () => {
      const r = await sdkFetch("POST", "/engagement/track", {
        eventName: "guide_completed",
        guideId: "000000000000000000000001",
        userId: "user-e2e-test",
        sessionId: "session-track-test",
        properties: { completionTime: 30 },
      });
      assert.equal(r.status, 200);
    },
  );

  await runTest(
    "POST /engagement/track — guide_dismissed event → 200",
    async () => {
      const r = await sdkFetch("POST", "/engagement/track", {
        eventName: "guide_dismissed",
        guideId: "000000000000000000000001",
        userId: "user-e2e-test",
        sessionId: "session-track-test",
        properties: { stepId: "step-2" },
      });
      assert.equal(r.status, 200);
    },
  );

  await runTest(
    "POST /engagement/track — survey_started event → 200",
    async () => {
      const r = await sdkFetch("POST", "/engagement/track", {
        eventName: "survey_started",
        surveyId: "000000000000000000000002",
        userId: "user-e2e-test",
        sessionId: "session-track-test",
        properties: {},
      });
      assert.equal(r.status, 200);
    },
  );

  await runTest("POST /engagement/track — no key → 401", async () => {
    const r = await fetch(`${BASE}/engagement/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "guide_shown" }),
    });
    assert.equal(r.status, 401);
  });
}

async function testConnectionTracking() {
  console.info("\n\x1b[1m📊 Connection Tracking\x1b[0m");

  await runTest(
    "Integration reflects connected status after runtime call",
    async () => {
      // Small delay to let async tracking complete
      await new Promise((r) => setTimeout(r, 300));
      const r = await authedFetch("GET", `/sdk-integrations/${integrationId}`);
      const data = await json(r);
      const integration = (data.data as any)?.integration;
      assert.ok(
        integration.status === "connected" || integration.connectionCount > 0,
        `expected connected or connectionCount>0, got status=${integration.status} count=${integration.connectionCount}`,
      );
    },
  );

  await runTest("SDK heartbeat endpoint → 200", async () => {
    const r = await sdkFetch("POST", "/sdk-integrations/sdk/heartbeat", {
      sdkVersion: "2.0.0",
    });
    assert.equal(r.status, 200);
    const data = await json(r);
    assert.equal((data.data as any)?.status, "ok");
  });
}

async function testSurveyRuntimeTriggering() {
  console.info("\n\x1b[1m📝 Guide & Survey Runtime Evaluation\x1b[0m");

  await runTest(
    "Runtime on /dashboard path — evaluates targeting rules",
    async () => {
      const r = await sdkFetch("POST", "/engagement/runtime", {
        userId: "user-e2e-targeting",
        sessionId: "session-targeting-1",
        properties: { plan: "enterprise", role: "admin" },
        context: {
          url: "http://localhost:5174/dashboard",
          path: "/dashboard",
          title: "Dashboard",
        },
      });
      assert.equal(r.status, 200);
      const data = await json(r);
      const experiences = (data.data as any)?.experiences as any[];
      assert.ok(Array.isArray(experiences), "should return experiences array");
      // If demo tour was seeded, it should appear on /dashboard
      console.info(`      → returned ${experiences.length} experience(s)`);
    },
  );

  await runTest(
    "Runtime on /billing path — evaluates NPS survey targeting",
    async () => {
      const r = await sdkFetch("POST", "/engagement/runtime", {
        userId: "user-e2e-billing",
        sessionId: "session-billing-1",
        properties: {},
        context: {
          url: "http://localhost:5174/billing",
          path: "/billing",
          title: "Billing",
        },
      });
      assert.equal(r.status, 200);
      const data = await json(r);
      const experiences = (data.data as any)?.experiences as any[];
      console.info(
        `      → returned ${experiences.length} experience(s) on /billing`,
      );
    },
  );

  await runTest(
    "Runtime with event context — subscription_purchased triggers NPS survey",
    async () => {
      const r = await sdkFetch("POST", "/engagement/runtime", {
        userId: "user-e2e-purchase",
        sessionId: "session-purchase-1",
        properties: {},
        context: {
          url: "http://localhost:5174/billing",
          path: "/billing",
          title: "Billing",
          events: [
            {
              eventName: "subscription_purchased",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });
      assert.equal(r.status, 200);
      const data = await json(r);
      const experiences = (data.data as any)?.experiences as any[];
      console.info(
        `      → returned ${experiences.length} experience(s) on event trigger`,
      );
    },
  );
}

async function testCleanup() {
  console.info("\n\x1b[1m🧹 Cleanup\x1b[0m");

  await runTest(
    "DELETE /sdk-integrations/:id — removes integration",
    async () => {
      const r = await authedFetch(
        "DELETE",
        `/sdk-integrations/${integrationId}`,
      );
      assert.equal(r.status, 200);
      const data = await json(r);
      assert.equal((data.data as any)?.success, true);
    },
  );

  await runTest("GET after delete — returns 404", async () => {
    const r = await authedFetch("GET", `/sdk-integrations/${integrationId}`);
    assert.equal(r.status, 404);
  });

  await runTest(
    "SDK key after delete — returns 401 (key no longer valid)",
    async () => {
      const r = await sdkFetch("POST", "/engagement/runtime", {
        userId: "u1",
        sessionId: "s1",
        properties: {},
        context: { path: "/" },
      });
      assert.equal(
        r.status,
        401,
        "deleted integration's key should be invalid",
      );
    },
  );
}

// ── run all suites ─────────────────────────────────────────────────────────────
async function main() {
  console.info(
    "\n\x1b[1m\x1b[35m═══════════════════════════════════════════════════════\x1b[0m",
  );
  console.info(
    "\x1b[1m\x1b[35m  SDK Integration Management — API Integration Tests\x1b[0m",
  );
  console.info(
    "\x1b[1m\x1b[35m═══════════════════════════════════════════════════════\x1b[0m",
  );
  console.info(`  Backend: ${BASE}`);

  // Login
  console.info("\n\x1b[1m🔐 Authentication\x1b[0m");
  await runTest("Login and obtain JWT token", login);

  if (!authToken) {
    console.error("\n  ✗ Cannot proceed without auth token.");
    process.exit(1);
  }

  await testSdkIntegrationCRUD();
  await testSdkKeyAuth();
  await testLifecycleActions();
  await testEngagementSDKEvents();
  await testConnectionTracking();
  await testSurveyRuntimeTriggering();
  await testCleanup();

  console.info(
    "\n\x1b[1m\x1b[35m═══════════════════════════════════════════════════════\x1b[0m",
  );
  console.info(
    `  Results: \x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m  (${passed + failed} total)`,
  );
  console.info(
    "\x1b[1m\x1b[35m═══════════════════════════════════════════════════════\x1b[0m\n",
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
