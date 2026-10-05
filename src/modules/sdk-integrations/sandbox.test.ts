import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { SdkAuthService } from "../sdk/services/sdkAuth.service.js";
import SdkSessionModel from "../sdk/models/sdk-session.model.js";
import SdkNonceModel from "../sdk/models/sdk-nonce.model.js";
import sdkIntegrationService, { validateKeyOrigin } from "./service.js";
import { sdkIntegrationCache } from "./cache.js";
import { deterministicHash, encrypt } from "../../utils/encryption.js";
import {
  environmentFilter,
  escapeRegex,
  parseEnvironment,
  scopedApiKeyId,
  servableStatuses,
} from "../../shared/environment.js";
import { canTransition } from "../engagement/lifecycle.js";
import {
  assertSurveyPublishable,
  toAnswerRecord,
  validateSurveyAnswers,
} from "../surveys/answers.js";

// The SDK lives outside this package's rootDir, so load it at runtime only.
const SDK_SOURCE = "../../../../analytics-sdk/src/index.ts";
const { SignedTransport } = (await import(SDK_SOURCE)) as {
  SignedTransport: new (
    apiKey: string,
    baseUrl: string,
    timeoutMs: number,
  ) => {
    request(
      path: string,
      init: { method: string; body?: unknown },
    ): Promise<Response | null>;
  };
};
import type { SurveyQuestion } from "../engagement/types.js";

const stub = <T extends object, K extends keyof T>(
  target: T,
  key: K,
  impl: T[K],
): (() => void) => {
  const original = target[key];
  target[key] = impl;
  return () => {
    target[key] = original;
  };
};

describe("SDK signing: the published SDK and the server agree", () => {
  const sandboxKey = `sdk_test_${"a".repeat(48)}`;
  const sessionSecret = "f".repeat(64);
  const origin = "http://localhost:5173";

  const runSignedRequest = async (
    path: string,
    body: unknown,
    tamper?: (req: any) => void,
  ) => {
    const captured: { url?: string; init?: any } = {};
    const restoreFetch = stub(globalThis, "fetch", (async (
      url: string,
      init: any,
    ) => {
      if (String(url).endsWith("/sdk/authenticate")) {
        return new Response(
          JSON.stringify({ sessionId: "sess-1", sessionSecret }),
          { status: 200 },
        );
      }
      captured.url = String(url);
      captured.init = init;
      return new Response("{}", { status: 200 });
    }) as typeof fetch);

    try {
      const transport = new SignedTransport(
        sandboxKey,
        "http://localhost:4000/api",
        5000,
      );
      await transport.request(path, { method: "POST", body });
    } finally {
      restoreFetch();
    }

    const url = new URL(captured.url!);
    const headers = Object.fromEntries(
      Object.entries(captured.init!.headers as Record<string, string>).map(
        ([k, v]) => [k.toLowerCase(), v],
      ),
    );
    const req: any = {
      method: captured.init!.method,
      originalUrl: `${url.pathname}${url.search}`,
      path: url.pathname,
      headers: { ...headers, origin },
      body: captured.init!.body ? JSON.parse(String(captured.init!.body)) : {},
    };
    tamper?.(req);
    return req;
  };

  const withServerStubs = async (fn: () => Promise<void>) => {
    const restores = [
      stub(SdkSessionModel, "findOne", (async () => ({
        sessionId: "sess-1",
        sessionSecret: encrypt(sessionSecret),
        tenantId: "tenant-1",
        sdkKeyHash: deterministicHash(sandboxKey),
        environment: "sandbox",
        validatedOrigin: origin,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        revoked: false,
        save: async () => undefined,
      })) as any),
      stub(SdkNonceModel, "create", (async () => ({})) as any),
      stub(sdkIntegrationService, "resolveKey", (async () => ({
        integration: {
          _id: "int-1",
          tenantId: "tenant-1",
          status: "connected",
        },
        environment: "sandbox",
      })) as any),
      stub(sdkIntegrationService, "resolveTenant", (async () => ({
        _id: "tenant-1",
      })) as any),
      stub(sdkIntegrationService, "touchConnection", (async () => null) as any),
    ];
    try {
      await fn();
    } finally {
      restores.forEach((restore) => restore());
    }
  };

  test("a signed SDK request verifies and carries the sandbox environment", async () => {
    const req = await runSignedRequest("/engagement/runtime?b=2&a=1", {
      userId: "u1",
      nested: { z: 1, a: [3, { y: true, b: null }] },
      when: new Date("2026-01-01T00:00:00Z"),
    });
    await withServerStubs(async () => {
      const result = await SdkAuthService.verifySignature(req);
      assert.equal(result.environment, "sandbox");
    });
  });

  test("an empty body signs as an empty string, like the server expects", async () => {
    const req = await runSignedRequest("/track", {});
    await withServerStubs(async () => {
      const result = await SdkAuthService.verifySignature(req);
      assert.equal(result.environment, "sandbox");
    });
  });

  test("a tampered body is rejected", async () => {
    const req = await runSignedRequest("/track", { eventName: "a" }, (r) => {
      r.body.eventName = "b";
    });
    await withServerStubs(async () => {
      await assert.rejects(
        SdkAuthService.verifySignature(req),
        /Invalid body hash/,
      );
    });
  });

  test("a session issued for one key type cannot be used with the other", async () => {
    const req = await runSignedRequest("/track", { eventName: "a" });
    await withServerStubs(async () => {
      const restore = stub(sdkIntegrationService, "resolveKey", (async () => ({
        integration: {
          _id: "int-1",
          tenantId: "tenant-1",
          status: "connected",
        },
        environment: "live",
      })) as any);
      try {
        await assert.rejects(
          SdkAuthService.verifySignature(req),
          /environment mismatch/,
        );
      } finally {
        restore();
      }
    });
  });
});

describe("Sandbox keys", () => {
  test("resolveKey tells live and sandbox keys apart", async () => {
    const integration = {
      _id: { toString: () => "int-1" },
      sdkKeyHash: deterministicHash("sdk_live"),
      sandboxKeyHash: deterministicHash("sdk_test_x"),
    } as any;
    sdkIntegrationCache.setIntegration(integration);
    try {
      const live = await sdkIntegrationService.resolveKey(
        deterministicHash("sdk_live"),
      );
      const sandbox = await sdkIntegrationService.resolveKey(
        deterministicHash("sdk_test_x"),
      );
      assert.equal(live?.environment, "live");
      assert.equal(sandbox?.environment, "sandbox");
    } finally {
      sdkIntegrationCache.invalidate("int-1");
    }
  });

  test("sandbox keys also work from localhost; live keys do not", () => {
    const integration = { domain: "https://app.acme.com", allowedOrigins: [] };
    assert.equal(
      validateKeyOrigin("http://localhost:3000", integration, "sandbox"),
      null,
    );
    assert.match(
      validateKeyOrigin("http://localhost:3000", integration, "live") ?? "",
      /not allowed/,
    );
    assert.equal(
      validateKeyOrigin("https://app.acme.com", integration, "live"),
      null,
    );
  });

  test("environment helpers isolate data and content", () => {
    assert.deepEqual(environmentFilter("sandbox"), { environment: "sandbox" });
    // Records written before environments existed count as live.
    assert.deepEqual(environmentFilter("live"), {
      environment: { $ne: "sandbox" },
    });
    assert.deepEqual(servableStatuses("live"), ["LIVE"]);
    assert.deepEqual(servableStatuses("sandbox"), ["LIVE", "DRAFT"]);
    assert.equal(scopedApiKeyId("int-1", "sandbox"), "int-1:sandbox");
    assert.equal(scopedApiKeyId("int-1", "live"), "int-1");
    assert.equal(parseEnvironment(undefined), "live");
    assert.throws(
      () => parseEnvironment("prod"),
      /must be 'live' or 'sandbox'/,
    );
    assert.equal(new RegExp(escapeRegex("a.b(")).test("a.b("), true);
  });
});

describe("Guide and survey lifecycle", () => {
  test("status transitions", () => {
    assert.equal(canTransition("DRAFT", "LIVE"), true);
    assert.equal(canTransition("LIVE", "PAUSED"), true);
    assert.equal(canTransition("PAUSED", "LIVE"), true);
    assert.equal(canTransition("ARCHIVED", "DRAFT"), true);
    assert.equal(canTransition("ARCHIVED", "LIVE"), false);
    assert.equal(canTransition("LIVE", "DRAFT"), false);
  });

  const questions: SurveyQuestion[] = [
    { id: "nps", type: "NPS", title: "Recommend?", required: true },
    {
      id: "plan",
      type: "SINGLE_CHOICE",
      title: "Plan",
      options: ["Free", "Pro"],
    },
    {
      id: "features",
      type: "MULTI_CHOICE",
      title: "Features",
      options: ["A", "B", "C"],
    },
    { id: "ok", type: "YES_NO", title: "OK?" },
    { id: "why", type: "TEXT", title: "Why" },
  ];

  test("valid answers are normalized; unknown ids are dropped", () => {
    const normalized = validateSurveyAnswers(questions, {
      nps: "9",
      plan: "Pro",
      features: ["A", "A", "C"],
      ok: "yes",
      why: "  great  ",
      injected: "ignored",
    });
    assert.deepEqual(normalized, {
      nps: 9,
      plan: "Pro",
      features: ["A", "C"],
      ok: true,
      why: "great",
    });
  });

  test("invalid answers are rejected", () => {
    assert.throws(
      () => validateSurveyAnswers(questions, { plan: "Pro" }),
      /'Recommend\?' is required/,
    );
    assert.throws(
      () => validateSurveyAnswers(questions, { nps: 11 }),
      /between 0 and 10/,
    );
    assert.throws(
      () => validateSurveyAnswers(questions, { nps: 7.5 }),
      /whole number/,
    );
    assert.throws(
      () => validateSurveyAnswers(questions, { nps: 5, plan: "Enterprise" }),
      /one of the options/,
    );
    assert.throws(
      () => validateSurveyAnswers(questions, { nps: 5, features: ["Z"] }),
      /not an option/,
    );
  });

  test("required questions are not enforced when the survey branches", () => {
    const branching: SurveyQuestion[] = [
      { ...questions[0] },
      {
        id: "follow",
        type: "TEXT",
        title: "Follow-up",
        required: true,
        branchConditions: { operator: "AND", conditions: [] } as any,
      },
    ];
    assert.deepEqual(validateSurveyAnswers(branching, { nps: 3 }), { nps: 3 });
  });

  test("the SDK's array answer shape is accepted", () => {
    assert.deepEqual(
      toAnswerRecord([
        { questionId: "nps", value: 8, questionTitle: "x" },
        { bogus: true },
      ]),
      { nps: 8 },
    );
  });

  test("surveys need valid questions to go live", () => {
    assert.throws(() => assertSurveyPublishable([]), /at least one question/);
    assert.throws(
      () =>
        assertSurveyPublishable([
          { id: "p", type: "SINGLE_CHOICE", title: "Pick", options: ["Only"] },
        ]),
      /at least two options/,
    );
    assert.doesNotThrow(() => assertSurveyPublishable(questions));
  });
});
