import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  normalizeTrackingEvent,
  validateBatchBody,
} from "../../src/modules/analytics/validators/tracking.validator.js";
import trackingService from "../../src/modules/analytics/services/tracking.service.js";
import AnalyticsEventRegistryModel from "../../src/modules/analytics/models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../../src/modules/analytics/models/analytics-log.model.js";
import AnalyticsUserModel from "../../src/modules/analytics/models/analytics-user.model.js";
import {
  batchCases,
  normalizeCases,
  storageCases,
} from "../cases/events.cases.js";
import { chain, stub } from "../support/stubs.js";

describe("Event validation & normalization", () => {
  for (const c of normalizeCases) {
    test(`${c.id} ${c.title}`, () => {
      const run = () =>
        normalizeTrackingEvent(c.event as any, {
          requireEventId: c.requireEventId,
        });
      if ("error" in c.expect) {
        assert.throws(run, c.expect.error);
        return;
      }
      const out = run();
      assert.equal(out.eventName, c.expect.eventName);
      if ("userIdentifier" in c.expect)
        assert.equal(out.userIdentifier, c.expect.userIdentifier);
      if (c.expect.sessionId) assert.equal(out.sessionId, c.expect.sessionId);
      for (const [key, value] of Object.entries(c.expect.payloadSubset ?? {})) {
        assert.deepEqual(out.payload[key], value, `payload.${key}`);
      }
    });
  }
});

describe("Batch ingestion limits", () => {
  for (const c of batchCases) {
    test(`${c.id} ${c.title}`, () => {
      const run = () => validateBatchBody(c.body);
      if ("error" in c.expect) assert.throws(run, c.expect.error);
      else assert.equal(run().length, c.expect.count);
    });
  }
});

describe("Events are stored with their environment and integration", () => {
  for (const c of storageCases) {
    test(`${c.id} ${c.title}`, async () => {
      const written: any[] = [];
      const undo = [
        stub(AnalyticsEventRegistryModel, "findOne", (() =>
          chain({ _id: "ref-1" })) as any),
        stub(AnalyticsUserModel, "findOneAndUpdate", (() => chain({})) as any),
        stub(AnalyticsLogModel, "create", (async (doc: any) => {
          written.push(doc);
          return doc;
        }) as any),
        stub(AnalyticsLogModel, "bulkWrite", (async (ops: any[]) => {
          ops.forEach((op) => written.push(op.insertOne.document));
          return { insertedCount: ops.length };
        }) as any),
      ];
      try {
        const apiKeyId =
          c.environment === "sandbox" ? "int-1:sandbox" : "int-1";
        if (c.route === "track") {
          await trackingService.trackSingle({
            apiKeyId,
            sdkIntegrationId: "int-1",
            environment: c.environment,
            eventName: "signup",
            userIdentifier: "u1",
          });
        } else if (c.route === "page") {
          await trackingService.page(apiKeyId, {
            url: "https://app.acme.com/x",
            sdkIntegrationId: "int-1",
            environment: c.environment,
          });
        } else {
          const result = await trackingService.ingestBatch(
            apiKeyId,
            Array.from({ length: c.count }, (_, i) => ({
              eventName: "e",
              eventId: `id-${i}`,
              userId: `u${i}`,
            })),
            "int-1",
            c.environment,
          );
          assert.equal(result.insertedCount, c.count);
        }
        assert.equal(written.length, c.count);
        for (const doc of written) {
          assert.equal(doc.environment, c.environment);
          assert.equal(doc.sdkIntegrationId, "int-1");
          assert.equal(doc.apiKeyId, apiKeyId);
          assert.ok(doc.eventId, "every log gets an eventId");
        }
      } finally {
        undo.forEach((u) => u());
      }
    });
  }
});
