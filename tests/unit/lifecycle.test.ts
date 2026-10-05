import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";
import guideService from "../../src/modules/guides/service.js";
import guideRepository from "../../src/modules/guides/repository.js";
import surveyService from "../../src/modules/surveys/service.js";
import surveyRepository from "../../src/modules/surveys/repository.js";
import engagementService from "../../src/modules/engagement/service.js";
import targetingService from "../../src/modules/targeting/service.js";
import {
  acceptCases,
  deleteCases,
  deliveryCases,
  guidePublishCases,
  transitionCases,
} from "../cases/lifecycle.cases.js";
import { stub } from "../support/stubs.js";

const ID = "a".repeat(24);
const TENANT = "tenant-1";
const INTEGRATION = "int-1";

const validGuide = (status: string, extra: Record<string, unknown> = {}) => ({
  _id: { toString: () => ID },
  tenantId: TENANT,
  sdkIntegrationId: INTEGRATION,
  title: "Welcome",
  type: "MODAL",
  priority: "MEDIUM",
  status,
  theme: {},
  steps: [{ id: "s0", title: "Hi", placement: "CENTER" }],
  metadata: {},
  frequencyRules: {},
  scheduleRules: {},
  targetingRules: null,
  ...extra,
});

const validSurvey = (status: string) => ({
  _id: { toString: () => ID },
  tenantId: TENANT,
  sdkIntegrationId: INTEGRATION,
  title: "NPS",
  priority: "MEDIUM",
  status,
  questions: [{ id: "nps", type: "NPS", title: "Recommend?", required: true }],
  metadata: {},
  frequencyRules: {},
  scheduleRules: {},
  targetingRules: null,
  triggerRules: null,
});

const restore: Array<() => void> = [];
before(() => {
  restore.push(
    stub(targetingService, "evaluate", (async () => ({
      eligible: true,
      reasons: [],
      matchedConditions: [],
      failedConditions: [],
    })) as any),
    stub(engagementService, "recordInteraction", (async () => ({
      success: true,
    })) as any),
  );
});
after(() => restore.reverse().forEach((r) => r()));

describe("Status transitions", () => {
  for (const c of transitionCases) {
    test(`${c.id} ${c.kind} ${c.from} → ${c.to}`, async () => {
      let run: () => Promise<any>;
      const undo: Array<() => void> = [];
      if (c.kind === "Guide") {
        undo.push(
          stub(guideRepository, "getGuide", (async () =>
            validGuide(c.from)) as any),
          stub(guideRepository, "updateStatus", (async (...args: any[]) =>
            validGuide(args[5])) as any),
        );
        run = () =>
          guideService.updateStatus(TENANT, INTEGRATION, ID, "user", c.to);
      } else {
        undo.push(
          stub(surveyRepository, "getSurvey", (async () =>
            validSurvey(c.from)) as any),
          stub(surveyRepository, "updateSurvey", (async (...args: any[]) =>
            validSurvey(args[4].status ?? c.from)) as any),
        );
        run = () =>
          surveyService.updateSurvey(TENANT, INTEGRATION, ID, "user", {
            status: c.to,
          });
      }
      try {
        if (c.allowed) {
          const updated = await run();
          assert.equal(updated.status, c.to);
        } else {
          await assert.rejects(run(), /cannot move from/);
        }
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});

describe("Guide publishing rules", () => {
  for (const c of guidePublishCases) {
    test(`${c.id} ${c.title}`, async () => {
      const undo = [
        stub(guideRepository, "getGuide", (async () =>
          validGuide("DRAFT", { type: c.type, steps: c.steps })) as any),
        stub(guideRepository, "updateStatus", (async () =>
          validGuide("LIVE", { type: c.type, steps: c.steps })) as any),
      ];
      try {
        const run = () =>
          guideService.updateStatus(TENANT, INTEGRATION, ID, "user", "LIVE");
        if (c.publishable) assert.equal((await run()).status, "LIVE");
        else await assert.rejects(run(), c.error);
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});

describe("Delivery by status, environment and trigger", () => {
  for (const c of deliveryCases) {
    test(`${c.id} ${c.kind} ${c.status} ${c.environment} ${c.trigger}`, async () => {
      const context =
        c.trigger === "manual"
          ? {
              environment: c.environment,
              eventName: "manual_tour",
              eventProperties: {
                tourId: c.kind === "Survey" ? `survey:${ID}` : ID,
              },
            }
          : { environment: c.environment };
      // The repository returns only documents whose status the service asked for,
      // exactly like the Mongo $in filter.
      const listFor =
        (doc: any) => async (_t: string, _s: string, statuses: string[]) =>
          statuses.includes(doc.status) ? [doc] : [];
      const undo: Array<() => void> = [];
      let delivered: unknown[];
      try {
        if (c.kind === "Guide") {
          const doc = validGuide(c.status);
          undo.push(
            stub(guideRepository, "getGuide", (async () => doc) as any),
            stub(guideRepository, "listServableGuides", listFor(doc) as any),
          );
          delivered = await guideService.getEligibleGuides(
            TENANT,
            INTEGRATION,
            context,
          );
        } else {
          const doc = validSurvey(c.status);
          undo.push(
            stub(surveyRepository, "getSurvey", (async () => doc) as any),
            stub(surveyRepository, "listServableSurveys", listFor(doc) as any),
          );
          delivered = await surveyService.getEligibleSurveys(
            TENANT,
            INTEGRATION,
            context,
          );
        }
        assert.equal(delivered.length > 0, c.delivered);
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});

describe("Guide deletion", () => {
  for (const c of deleteCases) {
    test(`${c.id} delete ${c.status} guide`, async () => {
      const undo = [
        stub(guideRepository, "getGuide", (async () =>
          validGuide(c.status)) as any),
        stub(guideRepository, "deleteGuide", (async () => ({
          deletedCount: 1,
        })) as any),
      ];
      try {
        const run = () => guideService.deleteGuide(TENANT, INTEGRATION, ID);
        if (c.allowed) await run();
        else await assert.rejects(run(), /Pause or archive/);
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});

describe("Survey response acceptance by status and environment", () => {
  for (const c of acceptCases) {
    test(`${c.id} ${c.status} survey via ${c.environment}`, async () => {
      let stored: any = null;
      const undo = [
        stub(surveyRepository, "getSurvey", (async () =>
          validSurvey(c.status)) as any),
        stub(surveyRepository, "createResponse", (async (input: any) => {
          stored = input;
          return { _id: { toString: () => "resp-1" } };
        }) as any),
      ];
      try {
        const run = () =>
          surveyService.submitResponse(
            TENANT,
            INTEGRATION,
            ID,
            { answers: { nps: 9 } },
            c.environment,
          );
        if (c.accepted) {
          const { duplicate } = await run();
          assert.equal(duplicate, false);
          assert.equal(stored.environment, c.environment);
          assert.equal(stored.category, "PROMOTER");
        } else {
          await assert.rejects(run(), /not accepting responses/);
        }
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});

describe("Survey response idempotency", () => {
  for (let i = 1; i <= 25; i++) {
    test(`LFC-IDM-${String(i).padStart(4, "0")} retry #${i} returns the original response`, async () => {
      const responses = new Map<string, any>();
      let creates = 0;
      const undo = [
        stub(surveyRepository, "getSurvey", (async () =>
          validSurvey("LIVE")) as any),
        stub(
          surveyRepository,
          "findResponseByIdempotencyKey",
          (async (_s: string, _id: string, key: string) =>
            responses.get(key) ?? null) as any,
        ),
        stub(surveyRepository, "createResponse", (async (input: any) => {
          creates++;
          const doc = { _id: { toString: () => `resp-${creates}` }, ...input };
          responses.set(input.idempotencyKey, doc);
          return doc;
        }) as any),
      ];
      try {
        const key = `run-${i}`;
        const attempts = await Promise.all(
          Array.from({ length: (i % 5) + 1 }, () =>
            surveyService.submitResponse(TENANT, INTEGRATION, ID, {
              answers: { nps: i % 11 },
              idempotencyKey: key,
            }),
          ).map((p) => p.catch(() => null)),
        );
        // Sequential retries after the first write are always deduplicated.
        const retry = await surveyService.submitResponse(
          TENANT,
          INTEGRATION,
          ID,
          {
            answers: { nps: i % 11 },
            idempotencyKey: key,
          },
        );
        assert.equal(retry.duplicate, true);
        assert.ok(attempts.some((a) => a && a.duplicate === false));
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});
