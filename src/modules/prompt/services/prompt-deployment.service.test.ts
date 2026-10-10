import assert from "node:assert/strict";
import test, { afterEach, beforeEach, describe } from "node:test";
import mongoose from "mongoose";
import promptDeploymentService, {
  getVersionStatus,
} from "./prompt-deployment.service.js";
import promptResolverService, {
  canaryBucket,
} from "./prompt-resolver.service.js";
import PromptDeploymentModel from "../models/prompt-deployment.model.js";
import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import accessService from "../../access/access.service.js";
import { fakeAccess } from "../../access/access.fixtures.js";
import { PROMPT_FEATURES } from "../prompt-features.js";

// Chainable stand-in for a mongoose query that resolves to `value`.
const q = (value: unknown): any => {
  const promise: any = Promise.resolve(value);
  for (const m of ["lean", "sort", "select", "session", "populate", "exec"]) {
    promise[m] = () => promise;
  }
  return promise;
};

const workspaceId = new mongoose.Types.ObjectId().toString();
const userId = new mongoose.Types.ObjectId().toString();
const rootId = new mongoose.Types.ObjectId();

interface VersionFixture {
  version: number;
  body: string;
  messages?: { role: string; content: string }[];
  variables?: { name: string; defaultValue?: string; required: boolean }[];
}

let versions: VersionFixture[];
let deployment: any;
let archived: boolean;
const originals: Array<[any, string, unknown]> = [];

const stub = (target: any, key: string, impl: unknown) => {
  originals.push([target, key, target[key]]);
  target[key] = impl;
};

beforeEach(() => {
  archived = false;
  deployment = null;
  versions = [
    { version: 1, body: "Prod instructions v1" },
    { version: 2, body: "Candidate instructions v2" },
    { version: 3, body: "Uses {{unknown_var}}" },
  ];

  stub(workspaceService, "assertMembership", async () => ({}));
  stub(accessService, "resolve", async (u: string, w: string) =>
    fakeAccess({ userId: u, workspaceId: w }),
  );
  stub(PromptLibraryModel, "findOne", () =>
    q({
      _id: rootId,
      workspaceId,
      parentId: null,
      visibility: "organization",
      createdBy: userId,
      version: 3,
      isArchived: archived,
    }),
  );
  stub(PromptLibraryModel, "exists", async () =>
    archived ? null : { _id: rootId },
  );
  stub(PromptVersionModel, "findOne", (query: any) =>
    q(
      query.version !== undefined
        ? (versions.find((v) => v.version === query.version) ?? null)
        : [...versions].sort((a, b) => b.version - a.version)[0],
    ),
  );
  stub(PromptVersionModel, "exists", async (query: any) =>
    versions.some((v) => v.version === query.version) ? { _id: 1 } : null,
  );
  stub(PromptDeploymentModel, "updateOne", async (_q: any, update: any) => {
    if (!deployment) {
      deployment = { ...update.$setOnInsert, history: [] };
    }
    return { acknowledged: true };
  });
  stub(PromptDeploymentModel, "findOne", (query: any) => {
    if (query.featureKey && query.promptId?.$ne) return q(null); // no other holder
    if (query.featureKey && deployment?.featureKey !== query.featureKey) {
      return q(null);
    }
    if (!deployment) return q(null);
    const doc = structuredClone(deployment);
    doc.save = async () => {
      const { save: _save, ...rest } = doc;
      deployment = structuredClone(rest);
    };
    return q(doc);
  });
});

afterEach(() => {
  while (originals.length) {
    const [target, key, value] = originals.pop()!;
    target[key] = value;
  }
});

describe("Prompt deployments: production & canary lifecycle", () => {
  test("production pin, canary start/update, promote, abort", async () => {
    const pid = rootId.toString();

    let view = await promptDeploymentService.setProduction(
      workspaceId,
      userId,
      pid,
      1,
    );
    assert.equal(view.productionVersion, 1);
    assert.equal(view.canary, null);

    view = await promptDeploymentService.startCanary(
      workspaceId,
      userId,
      pid,
      2,
      10,
    );
    assert.deepEqual(
      { v: view.canary?.version, p: view.canary?.percentage },
      { v: 2, p: 10 },
    );

    view = await promptDeploymentService.startCanary(
      workspaceId,
      userId,
      pid,
      2,
      50,
    );
    assert.equal(view.canary?.percentage, 50);
    assert.equal(view.history[0].action, "update-canary");

    view = await promptDeploymentService.promoteCanary(
      workspaceId,
      userId,
      pid,
    );
    assert.equal(view.productionVersion, 2);
    assert.equal(view.canary, null);

    // Rollback is just deploying an older version.
    view = await promptDeploymentService.setProduction(
      workspaceId,
      userId,
      pid,
      1,
    );
    assert.equal(view.productionVersion, 1);

    await promptDeploymentService.startCanary(workspaceId, userId, pid, 2, 5);
    view = await promptDeploymentService.abortCanary(workspaceId, userId, pid);
    assert.equal(view.canary, null);
    assert.equal(view.productionVersion, 1);

    assert.deepEqual(
      view.history.map((h) => h.action),
      [
        "abort-canary",
        "start-canary",
        "set-production",
        "promote-canary",
        "update-canary",
        "start-canary",
        "set-production",
      ],
    );
  });

  test("one production per prompt: the replaced version moves to staging", async () => {
    const pid = rootId.toString();
    versions.push({ version: 4, body: "v4 instructions" });

    // New prompts start with v1 in production and nothing in staging.
    let view = await promptDeploymentService.getDeployment(
      workspaceId,
      userId,
      pid,
    );
    deployment = {
      workspaceId,
      promptId: pid,
      featureKey: null,
      productionVersion: 1,
      stagingVersion: null,
      canary: null,
      history: [],
    };

    // Option 1: direct production.
    view = await promptDeploymentService.deploy(workspaceId, userId, pid, {
      version: 2,
      strategy: "direct",
    });
    assert.deepEqual(
      { prod: view.productionVersion, staging: view.stagingVersion },
      { prod: 2, staging: 1 },
    );

    // Option 2: canary production. Production and staging stay put until promotion.
    view = await promptDeploymentService.deploy(workspaceId, userId, pid, {
      version: 4,
      strategy: "canary",
      percentage: 20,
    });
    assert.deepEqual(
      {
        prod: view.productionVersion,
        staging: view.stagingVersion,
        canary: view.canary?.version,
      },
      { prod: 2, staging: 1, canary: 4 },
    );
    assert.equal(getVersionStatus(view, 4), "canary");
    assert.equal(getVersionStatus(view, 3), "draft");

    view = await promptDeploymentService.promoteCanary(
      workspaceId,
      userId,
      pid,
    );
    assert.deepEqual(
      { prod: view.productionVersion, staging: view.stagingVersion },
      { prod: 4, staging: 2 },
    );

    // Rollback swaps production and staging, and stops a running canary.
    await promptDeploymentService.startCanary(workspaceId, userId, pid, 1, 10);
    view = await promptDeploymentService.rollback(workspaceId, userId, pid);
    assert.deepEqual(
      {
        prod: view.productionVersion,
        staging: view.stagingVersion,
        canary: view.canary,
      },
      { prod: 2, staging: 4, canary: null },
    );
    assert.deepEqual(
      view.history.slice(0, 2).map((h) => h.action),
      ["rollback", "abort-canary"],
    );

    // Exactly one version is production at any time.
    const statuses = [1, 2, 3, 4].map((v) => getVersionStatus(view, v));
    assert.equal(statuses.filter((st) => st === "production").length, 1);
    assert.deepEqual(statuses, ["draft", "production", "draft", "staging"]);
  });

  test("rejects invalid deploy requests", async () => {
    const pid = rootId.toString();
    await assert.rejects(
      promptDeploymentService.rollback(workspaceId, userId, pid),
      /no version is in staging/,
    );
    await promptDeploymentService.setProduction(workspaceId, userId, pid, 2);
    await assert.rejects(
      promptDeploymentService.setProduction(workspaceId, userId, pid, 2),
      /already the production version/,
    );
    await assert.rejects(
      promptDeploymentService.deploy(workspaceId, userId, pid, {
        version: 1,
        strategy: "blue-green",
      }),
      /strategy must be 'direct' or 'canary'/,
    );
  });

  test("rejects invalid canary requests", async () => {
    const pid = rootId.toString();
    await promptDeploymentService.setProduction(workspaceId, userId, pid, 1);

    await assert.rejects(
      promptDeploymentService.startCanary(workspaceId, userId, pid, 1, 10),
      /already the production version/,
    );
    await assert.rejects(
      promptDeploymentService.startCanary(workspaceId, userId, pid, 2, 100),
      /between 1 and 99/,
    );
    await assert.rejects(
      promptDeploymentService.startCanary(workspaceId, userId, pid, 9, 10),
      /Version 9 not found/,
    );
    await assert.rejects(
      promptDeploymentService.promoteCanary(workspaceId, userId, pid),
      /No canary is running/,
    );
  });

  test("deploying the canary version to production completes the canary", async () => {
    const pid = rootId.toString();
    await promptDeploymentService.setProduction(workspaceId, userId, pid, 1);
    await promptDeploymentService.startCanary(workspaceId, userId, pid, 2, 20);
    const view = await promptDeploymentService.setProduction(
      workspaceId,
      userId,
      pid,
      2,
    );
    assert.equal(view.productionVersion, 2);
    assert.equal(view.canary, null);
  });

  test("feature binding rejects versions with variables the feature cannot supply", async () => {
    const pid = rootId.toString();
    // No deployment record yet: production defaults to the latest version, v3.
    await assert.rejects(
      promptDeploymentService.bindFeature(
        workspaceId,
        userId,
        pid,
        "task-breakdown",
      ),
      /does not supply: unknown_var/,
    );

    // A default value makes the variable resolvable.
    versions[2].variables = [
      { name: "unknown_var", defaultValue: "x", required: true },
    ];
    const view = await promptDeploymentService.bindFeature(
      workspaceId,
      userId,
      pid,
      "task-breakdown",
    );
    assert.equal(view.featureKey, "task-breakdown");

    await assert.rejects(
      promptDeploymentService.bindFeature(workspaceId, userId, pid, "nope"),
      /featureKey must be null or one of/,
    );
  });

  test("only workspace owners/admins can deploy", async () => {
    stub(
      workspaceService,
      "assertMembership",
      async (_u: string, _w: string, roles?: string[]) => {
        if (roles) throw Object.assign(new Error("forbidden"), { status: 403 });
        return {};
      },
    );
    await assert.rejects(
      promptDeploymentService.setProduction(
        workspaceId,
        userId,
        rootId.toString(),
        1,
      ),
      /forbidden/,
    );
  });
});

describe("Prompt resolver: what the AI features actually use", () => {
  const bind = (extra: Record<string, unknown> = {}) => {
    deployment = {
      workspaceId,
      promptId: rootId.toString(),
      featureKey: "project-chat",
      productionVersion: 1,
      canary: null,
      history: [],
      ...extra,
    };
  };

  test("falls back to the built-in prompt without a workspace or binding", async () => {
    const values = { project_knowledge: "KB" };
    const expected = PROMPT_FEATURES["project-chat"].defaultTemplate.replace(
      "{{project_knowledge}}",
      "KB",
    );

    const noScope = await promptResolverService.resolve(
      "project-chat",
      undefined,
      values,
    );
    assert.equal(noScope.source, "default");
    assert.equal(noScope.content, expected);

    const unbound = await promptResolverService.resolve(
      "project-chat",
      { workspaceId, userId },
      values,
    );
    assert.equal(unbound.source, "default");
  });

  test("serves the production version and renders feature variables", async () => {
    versions[0].body = "Custom chat prompt. KB: {{project_knowledge}}";
    bind();
    const resolved = await promptResolverService.resolve(
      "project-chat",
      { workspaceId, userId },
      { project_knowledge: "facts" },
    );
    assert.equal(resolved.source, "production");
    assert.equal(resolved.version, 1);
    assert.equal(resolved.content, "Custom chat prompt. KB: facts");
  });

  test("uses system/developer message blocks when the prompt has them", async () => {
    versions[0].messages = [
      { role: "system", content: "System part" },
      { role: "user", content: "User part" },
    ];
    bind();
    const resolved = await promptResolverService.resolve("project-chat", {
      workspaceId,
      userId,
    });
    assert.equal(resolved.content, "System part");
  });

  test("routes roughly canary% of users to the canary, sticky per user", async () => {
    bind({ canary: { version: 2, percentage: 25, startedAt: new Date() } });
    const users = Array.from({ length: 2000 }, () =>
      new mongoose.Types.ObjectId().toString(),
    );

    let canaryHits = 0;
    for (const uid of users.slice(0, 400)) {
      const first = await promptResolverService.resolve("project-chat", {
        workspaceId,
        userId: uid,
      });
      const second = await promptResolverService.resolve("project-chat", {
        workspaceId,
        userId: uid,
      });
      assert.equal(first.source, second.source, "assignment must be sticky");
      assert.equal(
        first.version,
        first.source === "canary" ? 2 : 1,
        "canary users get the canary version",
      );
      if (first.source === "canary") canaryHits++;
    }
    assert.ok(canaryHits > 0 && canaryHits < 400);

    const bucketed = users.filter(
      (uid) => canaryBucket(rootId.toString(), 2, uid) < 25,
    ).length;
    const share = bucketed / users.length;
    assert.ok(share > 0.2 && share < 0.3, `canary share was ${share}`);
  });

  test("archived or unrenderable prompts fall back to the built-in prompt", async () => {
    bind();
    archived = true;
    const archivedResult = await promptResolverService.resolve("project-chat", {
      workspaceId,
      userId,
    });
    assert.equal(archivedResult.source, "default");

    archived = false;
    bind({ productionVersion: 3 }); // references {{unknown_var}}
    const unresolved = await promptResolverService.resolve("project-chat", {
      workspaceId,
      userId,
    });
    assert.equal(unresolved.source, "default");
  });

  test("non-members never get another workspace's prompt", async () => {
    bind();
    stub(workspaceService, "assertMembership", async () => {
      throw new Error("not a member");
    });
    const resolved = await promptResolverService.resolve("project-chat", {
      workspaceId,
      userId,
    });
    assert.equal(resolved.source, "default");
  });
});
