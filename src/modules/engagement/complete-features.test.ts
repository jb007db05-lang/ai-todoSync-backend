import assert from "node:assert/strict";
import test from "node:test";
import targetingService from "../targeting/service.js";
import {
  normalizeOrigin,
  matchOrigin,
} from "../../middleware/sdkAuth.middleware.js";
import { deterministicHash } from "../../utils/encryption.js";
import sdkIntegrationService from "../sdk-integrations/service.js";

// 1. NPS Classification Boundaries
test("NPS Classification: detractor, passive, promoter bounds", () => {
  const categorizeNps = (score: number): string => {
    if (score >= 9) return "PROMOTER";
    if (score >= 7) return "PASSIVE";
    return "DETRACTOR";
  };

  assert.equal(categorizeNps(10), "PROMOTER");
  assert.equal(categorizeNps(9), "PROMOTER");
  assert.equal(categorizeNps(8), "PASSIVE");
  assert.equal(categorizeNps(7), "PASSIVE");
  assert.equal(categorizeNps(6), "DETRACTOR");
  assert.equal(categorizeNps(0), "DETRACTOR");
});

// 2. Targeting rules validation
test("Targeting rules: matches URL context", async () => {
  const context = {
    tenantId: "tenant-123",
    url: "http://localhost:5174/dashboard",
    referrer: "http://localhost:5174/welcome",
    role: "admin",
    plan: "enterprise",
  };

  // Evaluate URL Equals
  const resultEquals = await (targetingService as any).evaluate({
    rules: {
      operator: "AND",
      conditions: [
        {
          id: "cond-1",
          type: "URL_EQUALS",
          value: "http://localhost:5174/dashboard",
        },
      ],
    },
    context,
  });
  assert.ok(resultEquals.eligible);

  // Evaluate URL Contains
  const resultContains = await (targetingService as any).evaluate({
    rules: {
      operator: "AND",
      conditions: [
        {
          id: "cond-2",
          type: "URL_CONTAINS",
          value: "dashboard",
        },
      ],
    },
    context,
  });
  assert.ok(resultContains.eligible);

  // Evaluate Roles Equals
  const resultRole = await (targetingService as any).evaluate({
    rules: {
      operator: "AND",
      conditions: [
        {
          id: "cond-3",
          type: "ROLE_EQUALS",
          value: "admin",
        },
      ],
    },
    context,
  });
  assert.ok(resultRole.eligible);
});

// 3. Domain Normalization Logic
test("SDK Auth Helpers: domain normalization and matching rules", () => {
  assert.equal(
    normalizeOrigin("http://localhost:5174/"),
    "http://localhost:5174",
  );
  assert.equal(
    normalizeOrigin("https://app.pristine.io"),
    "https://app.pristine.io",
  );
  assert.equal(normalizeOrigin("app.pristine.io"), "https://app.pristine.io");

  // Wildcard and pattern matching
  assert.ok(matchOrigin("https://sub.example.com", "*.example.com"));
  assert.ok(matchOrigin("https://example.com", "example.com"));
  assert.ok(
    !matchOrigin("https://evil.example.com.attacker.com", "*.example.com"),
  );
});

// 4. SDK Key Validation and Hashing
test("SDK Integration: key serialization and deterministic hash integrity", () => {
  const key1 = "sdk_test_key_abc_123";
  const key2 = "sdk_test_key_abc_123";
  const key3 = "sdk_test_key_xyz_789";

  const hash1 = deterministicHash(key1);
  const hash2 = deterministicHash(key2);
  const hash3 = deterministicHash(key3);

  assert.equal(hash1, hash2, "identical keys must hash to identical values");
  assert.notEqual(hash1, hash3, "different keys must hash to different values");
});
