import assert from "node:assert/strict";
import test, { after, describe } from "node:test";
import targetingService from "../../src/modules/targeting/service.js";
import { GuideExposureModel } from "../../src/modules/engagement/model.js";
import AnalyticsEventRegistryModel from "../../src/modules/analytics/models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../../src/modules/analytics/models/analytics-log.model.js";
import AnalyticsKeyModel from "../../src/modules/analytics/models/analytics-key.model.js";
import {
  behaviorCases,
  conditionCases,
  frequencyCases,
  groupCases,
  scheduleCases,
} from "../cases/targeting.cases.js";
import { chain, stub } from "../support/stubs.js";

const restore: Array<() => void> = [];
after(() => restore.reverse().forEach((r) => r()));

describe("Targeting: single conditions", () => {
  for (const c of conditionCases) {
    test(`${c.id} ${c.title}`, async () => {
      const result = await targetingService.evaluate({
        rules: { id: "root", operator: "AND", conditions: [c.condition] },
        context: { tenantId: "tenant-1", ...c.context },
      });
      assert.equal(result.eligible, c.matched);
    });
  }
});

describe("Targeting: rule groups", () => {
  for (const c of groupCases) {
    test(`${c.id} ${c.title}`, async () => {
      const result = await targetingService.evaluate({
        rules: c.rules,
        context: { tenantId: "tenant-1", ...c.context },
      });
      assert.equal(result.eligible, c.eligible);
    });
  }
});

describe("Targeting: schedule", () => {
  for (const c of scheduleCases) {
    test(`${c.id} ${c.title}`, async () => {
      const result = await targetingService.evaluate({
        rules: null,
        context: { tenantId: "tenant-1" },
        scheduleRules: c.schedule,
      });
      assert.equal(result.eligible, c.eligible);
      if (!c.eligible) assert.deepEqual(result.failedConditions, ["schedule"]);
    });
  }
});

describe("Targeting: behavioral conditions are scoped to the integration and environment", () => {
  for (const c of behaviorCases) {
    for (const environment of ["live", "sandbox"] as const) {
      test(`${c.id} [${environment}] ${c.title}`, async () => {
        const seen: { registry?: any; logs?: any } = {};
        const undo = [
          stub(AnalyticsEventRegistryModel, "find", ((filter: any) => {
            seen.registry = filter;
            return chain([{ _id: "ref-1" }]);
          }) as any),
          stub(AnalyticsLogModel, "countDocuments", ((filter: any) => {
            seen.logs = filter;
            return chain(c.storedCount);
          }) as any),
          stub(AnalyticsKeyModel, "find", (() => {
            throw new Error("legacy keys must not be used for SDK traffic");
          }) as any),
        ];
        try {
          const result = await targetingService.evaluate({
            rules: { id: "root", operator: "AND", conditions: [c.condition] },
            context: {
              tenantId: "tenant-1",
              sdkIntegrationId: "int-1",
              environment,
              userId: "user-1",
            },
          });
          assert.equal(result.eligible, c.matched);
          assert.equal(seen.registry.sdkIntegrationId, "int-1");
          assert.equal(seen.logs.sdkIntegrationId, "int-1");
          assert.equal(seen.logs.userIdentifier, "user-1");
          assert.deepEqual(
            seen.logs.environment,
            environment === "sandbox" ? "sandbox" : { $ne: "sandbox" },
          );
        } finally {
          undo.forEach((u) => u());
        }
      });
    }
  }
});

describe("Targeting: frequency caps", () => {
  const HOUR = 3_600_000;
  for (const c of frequencyCases) {
    test(`${c.id} ${c.title}`, async () => {
      const now = Date.now();
      const docs = c.exposures.map((e) => ({
        status: e.status,
        displayCount: e.displayCount,
        lastShownAt: new Date(now - e.hoursAgo * HOUR),
        updatedAt: new Date(now - e.hoursAgo * HOUR),
        sessionId: e.sameSession ? "session-1" : "older-session",
      }));
      const latest = [...docs].sort(
        (a, b) => b.lastShownAt.getTime() - a.lastShownAt.getTime(),
      )[0];
      const filters: any[] = [];
      const undo = [
        stub(GuideExposureModel, "findOne", ((filter: any) => {
          filters.push(filter);
          const match = filter.sessionId
            ? docs.find((d) => d.sessionId === filter.sessionId)
            : latest;
          return chain(match ?? null);
        }) as any),
        stub(GuideExposureModel, "find", (() => chain(docs)) as any),
      ];
      try {
        const result = await targetingService.evaluate({
          rules: null,
          guideId: "guide-1",
          frequencyRules: c.rules,
          context: {
            tenantId: "tenant-1",
            sdkIntegrationId: "int-1",
            environment: "live",
            userId: "user-1",
            sessionId: "session-1",
            forceShowCompleted: c.forceShowCompleted,
          },
        });
        assert.equal(result.eligible, c.eligible, result.reasons.join("; "));
        // Live frequency never reads sandbox exposures.
        assert.ok(filters.every((f) => f.environment?.$ne === "sandbox"));
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});
