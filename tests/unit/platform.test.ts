import assert from "node:assert/strict";
import test, { after, describe } from "node:test";
import mongoose from "mongoose";
import { SdkAuthService } from "../../src/modules/sdk/services/sdkAuth.service.js";
import SdkSessionModel from "../../src/modules/sdk/models/sdk-session.model.js";
import SdkNonceModel from "../../src/modules/sdk/models/sdk-nonce.model.js";
import sdkIntegrationService, {
  validateKeyOrigin,
} from "../../src/modules/sdk-integrations/service.js";
import { deterministicHash, encrypt } from "../../src/utils/encryption.js";
import { escapeRegex } from "../../src/shared/environment.js";
import { canaryBucket } from "../../src/modules/prompt/services/prompt-resolver.service.js";
import promptDeploymentService from "../../src/modules/prompt/services/prompt-deployment.service.js";
import PromptDeploymentModel from "../../src/modules/prompt/models/prompt-deployment.model.js";
import PromptLibraryModel from "../../src/modules/prompt/models/prompt-library.model.js";
import PromptVersionModel from "../../src/modules/prompt/models/prompt-version.model.js";
import workspaceService from "../../src/modules/workspace/services/workspace.service.js";
import { SignedTransport } from "../../../analytics-sdk/src/index.js";
import {
  canaryCases,
  escapeCases,
  integrationOrigins,
  originCases,
  sequenceCases,
  signedRequestCases,
  tamperCases,
  type DeployAction,
  type TamperKind,
} from "../cases/platform.cases.js";
import { chain, stub } from "../support/stubs.js";

const restoreAll: Array<() => void> = [];
after(() => restoreAll.reverse().forEach((r) => r()));

// ============================================================ SDK signing
const KEYS = {
  live: `sdk_${"1".repeat(48)}`,
  sandbox: `sdk_test_${"2".repeat(48)}`,
};
const SECRET = "c".repeat(64);
const ORIGIN = "http://localhost:5173";

const signWithSdk = async (
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
) => {
  let captured: { url: string; init: any } | undefined;
  const undo = stub(globalThis, "fetch", (async (url: string, init: any) => {
    if (String(url).endsWith("/sdk/authenticate")) {
      return new Response(
        JSON.stringify({ sessionId: "sess-1", sessionSecret: SECRET }),
        { status: 200 },
      );
    }
    captured = { url: String(url), init };
    return new Response("{}", { status: 200 });
  }) as typeof fetch);
  try {
    await new SignedTransport(
      apiKey,
      "http://localhost:4000/api",
      5000,
    ).request(path, { method, body });
  } finally {
    undo();
  }
  const url = new URL(captured!.url);
  const headers = Object.fromEntries(
    Object.entries(captured!.init.headers as Record<string, string>).map(
      ([k, v]) => [k.toLowerCase(), v],
    ),
  );
  return {
    method: captured!.init.method,
    originalUrl: `${url.pathname}${url.search}`,
    path: url.pathname,
    headers: { ...headers, origin: ORIGIN } as Record<string, string>,
    body: captured!.init.body ? JSON.parse(String(captured!.init.body)) : {},
  };
};

interface ServerOverrides {
  sessionEnvironment?: "live" | "sandbox";
  keyEnvironment?: "live" | "sandbox";
  revoked?: boolean;
  expired?: boolean;
  replayedNonce?: boolean;
  sessionKey: string;
}

const withServer = async (o: ServerOverrides, fn: () => Promise<void>) => {
  const undo = [
    stub(SdkSessionModel, "findOne", (async () => ({
      sessionId: "sess-1",
      sessionSecret: encrypt(SECRET),
      tenantId: "tenant-1",
      sdkKeyHash: deterministicHash(o.sessionKey),
      environment: o.sessionEnvironment ?? "live",
      validatedOrigin: ORIGIN,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + (o.expired ? -1000 : 60_000)),
      revoked: o.revoked ?? false,
      save: async () => undefined,
    })) as any),
    stub(SdkNonceModel, "create", (async () => {
      if (o.replayedNonce)
        throw Object.assign(new Error("dup"), { code: 11000 });
      return {};
    }) as any),
    stub(sdkIntegrationService, "resolveKey", (async () => ({
      integration: { _id: "int-1", tenantId: "tenant-1", status: "connected" },
      environment: o.keyEnvironment ?? o.sessionEnvironment ?? "live",
    })) as any),
    stub(sdkIntegrationService, "resolveTenant", (async () => ({
      _id: "tenant-1",
    })) as any),
    stub(sdkIntegrationService, "touchConnection", (async () => null) as any),
  ];
  try {
    await fn();
  } finally {
    undo.forEach((u) => u());
  }
};

describe("SDK signing: generated requests verify on the server", () => {
  for (const c of signedRequestCases) {
    test(`${c.id} ${c.title}`, async () => {
      const key = KEYS[c.keyEnvironment];
      const req = await signWithSdk(key, c.method, c.path, c.body);
      await withServer(
        { sessionKey: key, sessionEnvironment: c.keyEnvironment },
        async () => {
          const result = await SdkAuthService.verifySignature(req as any);
          assert.equal(result.environment, c.keyEnvironment);
        },
      );
    });
  }
});

describe("SDK signing: tampering and replay are rejected", () => {
  const SIGNED_HEADERS = [
    "x-sdk-key",
    "x-session-id",
    "x-timestamp",
    "x-nonce",
    "x-body-sha256",
    "x-signature",
    "x-signature-version",
  ];
  const tamper = (
    kind: TamperKind,
    variant: number,
    req: any,
    overrides: ServerOverrides,
  ) => {
    switch (kind) {
      case "body-changed":
        req.body.amount = variant + 1000;
        break;
      case "body-field-added":
        req.body[`extra${variant}`] = true;
        break;
      case "path-changed":
        req.originalUrl = `/api/other-${variant}`;
        break;
      case "query-added":
        req.originalUrl += `?injected=${variant}`;
        break;
      case "method-changed":
        req.method = ["PUT", "PATCH", "DELETE", "GET", "PUT", "PATCH", "GET"][
          variant
        ];
        break;
      case "timestamp-skewed":
        req.headers["x-timestamp"] = String(
          Date.now() + (variant % 2 ? 1 : -1) * (6 + variant) * 60_000,
        );
        break;
      case "signature-altered": {
        const sig: string = req.headers["x-signature"];
        const i = variant * 7;
        req.headers["x-signature"] =
          sig.slice(0, i) + (sig[i] === "a" ? "b" : "a") + sig.slice(i + 1);
        break;
      }
      case "key-swapped":
        req.headers["x-sdk-key"] = `sdk_${String(variant).repeat(48)}`;
        break;
      case "version-unsupported":
        req.headers["x-signature-version"] = String(variant + 2);
        break;
      case "header-missing":
        delete req.headers[SIGNED_HEADERS[variant]];
        break;
      case "session-revoked":
        overrides.revoked = true;
        break;
      case "session-expired":
        overrides.expired = true;
        break;
      case "origin-mismatch":
        req.headers.origin = `https://evil-${variant}.example.com`;
        break;
      case "nonce-replayed":
        overrides.replayedNonce = true;
        break;
      case "environment-mismatch":
        overrides.keyEnvironment = "live";
        break;
    }
  };

  for (const c of tamperCases) {
    test(`${c.id} ${c.kind} #${c.variant + 1}`, async () => {
      const key = KEYS.sandbox;
      const req = await signWithSdk(key, "POST", "/engagement/track", {
        amount: c.variant,
        eventName: "guide_shown",
      });
      const overrides: ServerOverrides = {
        sessionKey: key,
        sessionEnvironment: "sandbox",
      };
      tamper(c.kind, c.variant, req, overrides);
      await withServer(overrides, async () => {
        await assert.rejects(
          SdkAuthService.verifySignature(req as any),
          c.error,
        );
      });
    });
  }
});

// ============================================================ origins and escaping
describe("Origin rules for live and sandbox keys", () => {
  for (const c of originCases) {
    test(`${c.id} ${c.environment} ← ${c.origin}`, () => {
      const error = validateKeyOrigin(
        c.origin,
        integrationOrigins,
        c.environment,
      );
      assert.equal(error === null, c.allowed, error ?? "allowed");
    });
  }
});

describe("Search input is matched literally", () => {
  for (const c of escapeCases) {
    test(`${c.id} ${JSON.stringify(c.input).slice(0, 30)}`, () => {
      const re = new RegExp(escapeRegex(c.input), "i");
      assert.ok(re.test(`prefix ${c.input} suffix`));
      // A literal pattern only matches the literal text.
      assert.equal(
        re.test(c.input.length > 1 ? c.input.slice(1) : "§"),
        c.input.length > 1 &&
          c.input.slice(1).toLowerCase().includes(c.input.toLowerCase()),
      );
    });
  }
});

// ============================================================ canary
describe("Canary traffic split", () => {
  const USERS = Array.from({ length: 4000 }, (_, i) => `user-${i}`);
  const ROOT = new mongoose.Types.ObjectId().toString();
  for (const c of canaryCases) {
    test(`${c.id} ${c.percentage}% of users`, () => {
      let inCanary = 0;
      for (const user of USERS) {
        const bucket = canaryBucket(ROOT, 3, user);
        assert.equal(canaryBucket(ROOT, 3, user), bucket, "sticky per user");
        if (bucket < c.percentage) inCanary++;
      }
      const share = (inCanary / USERS.length) * 100;
      assert.ok(
        Math.abs(share - c.percentage) <= 3,
        `canary share ${share.toFixed(2)}% vs ${c.percentage}%`,
      );
    });
  }
});

// ============================================================ deployment invariants
interface ModelState {
  versions: number;
  production: number;
  staging: number | null;
  canary: { version: number; percentage: number } | null;
}

/** Reference model of the deployment rules, written independently of the service. */
const applyModel = (s: ModelState, a: DeployAction): ModelState | "error" => {
  const exists = (v: number) => v >= 1 && v <= s.versions;
  switch (a.op) {
    case "edit":
      return { ...s, versions: s.versions + 1 };
    case "direct":
      if (!exists(a.version) || a.version === s.production) return "error";
      return {
        ...s,
        staging: s.production,
        production: a.version,
        canary: s.canary?.version === a.version ? null : s.canary,
      };
    case "canary":
      if (
        !Number.isInteger(a.percentage) ||
        a.percentage < 1 ||
        a.percentage > 99
      )
        return "error";
      if (a.version === s.production || !exists(a.version)) return "error";
      return { ...s, canary: { version: a.version, percentage: a.percentage } };
    case "promote":
      if (!s.canary) return "error";
      return {
        ...s,
        staging: s.production,
        production: s.canary.version,
        canary: null,
      };
    case "abort":
      if (!s.canary) return "error";
      return { ...s, canary: null };
    case "rollback":
      if (s.staging === null) return "error";
      return {
        ...s,
        production: s.staging,
        staging: s.production,
        canary: null,
      };
  }
};

describe("Prompt deployment: random action sequences keep the invariants", () => {
  const WS = new mongoose.Types.ObjectId().toString();
  const USER = new mongoose.Types.ObjectId().toString();
  const ROOT = new mongoose.Types.ObjectId();

  for (const c of sequenceCases) {
    test(`${c.id} ${c.actions.length} actions`, async () => {
      let versions = 4;
      let stored: any = {
        workspaceId: WS,
        promptId: ROOT.toString(),
        featureKey: null,
        productionVersion: 1,
        stagingVersion: null,
        canary: null,
        history: [],
      };
      const undo = [
        stub(workspaceService, "assertMembership", (async () => ({})) as any),
        stub(PromptLibraryModel, "findOne", (() =>
          chain({
            _id: ROOT,
            workspaceId: WS,
            parentId: null,
            visibility: "organization",
            createdBy: USER,
            version: versions,
            isArchived: false,
          })) as any),
        stub(PromptVersionModel, "findOne", ((q: any) =>
          chain(
            q.version === undefined
              ? { version: versions }
              : q.version <= versions
                ? { version: q.version, body: "x" }
                : null,
          )) as any),
        stub(PromptVersionModel, "exists", (async (q: any) =>
          q.version >= 1 && q.version <= versions ? { _id: 1 } : null) as any),
        stub(PromptDeploymentModel, "updateOne", (async () => ({
          acknowledged: true,
        })) as any),
        stub(PromptDeploymentModel, "findOne", (() => {
          const doc = structuredClone(stored);
          doc.save = async () => {
            const { save: _s, ...rest } = doc;
            stored = structuredClone(rest);
          };
          return chain(doc);
        }) as any),
      ];
      try {
        let model: ModelState = {
          versions,
          production: 1,
          staging: null,
          canary: null,
        };
        for (const [step, action] of c.actions.entries()) {
          const expected = applyModel(model, action);
          let outcome: "ok" | "error" = "ok";
          try {
            const pid = ROOT.toString();
            if (action.op === "edit") versions++;
            else if (action.op === "direct")
              await promptDeploymentService.deploy(WS, USER, pid, {
                version: action.version,
                strategy: "direct",
              });
            else if (action.op === "canary")
              await promptDeploymentService.deploy(WS, USER, pid, {
                version: action.version,
                strategy: "canary",
                percentage: action.percentage,
              });
            else if (action.op === "promote")
              await promptDeploymentService.promoteCanary(WS, USER, pid);
            else if (action.op === "abort")
              await promptDeploymentService.abortCanary(WS, USER, pid);
            else await promptDeploymentService.rollback(WS, USER, pid);
          } catch {
            outcome = "error";
          }

          const where = `step ${step + 1} (${JSON.stringify(action)})`;
          assert.equal(outcome, expected === "error" ? "error" : "ok", where);
          if (expected !== "error") model = expected;

          // Service state matches the model…
          assert.equal(
            stored.productionVersion,
            model.production,
            `${where}: production`,
          );
          assert.equal(
            stored.stagingVersion ?? null,
            model.staging,
            `${where}: staging`,
          );
          assert.deepEqual(
            stored.canary
              ? {
                  version: stored.canary.version,
                  percentage: stored.canary.percentage,
                }
              : null,
            model.canary,
            `${where}: canary`,
          );
          // …and the invariants hold.
          assert.notEqual(
            stored.stagingVersion,
            stored.productionVersion,
            `${where}: staging is never production`,
          );
          if (stored.canary) {
            assert.notEqual(
              stored.canary.version,
              stored.productionVersion,
              `${where}: canary is never production`,
            );
            assert.ok(
              stored.canary.percentage >= 1 && stored.canary.percentage <= 99,
              `${where}: canary %`,
            );
          }
        }
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});
