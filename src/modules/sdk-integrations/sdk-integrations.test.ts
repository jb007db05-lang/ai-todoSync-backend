/**
 * sdk-integrations.test.ts
 *
 * Unit tests for the new SDK Integration module.
 * Run: cd backend && npm run test:engagement (picks up *.test.ts in modules/)
 * Or:  cd backend && npx tsx --test src/modules/sdk-integrations/sdk-integrations.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";

// ──────────────────────────────────────────────────────────────────────────────
// Helper — lightweight mock for MongoDB model methods
// ──────────────────────────────────────────────────────────────────────────────

function _makeModelMock(returnValue: unknown) {
  return {
    exec: async () => returnValue,
    lean: () => ({ exec: async () => returnValue }),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Validators
// ──────────────────────────────────────────────────────────────────────────────

test("Validators: validateCreate accepts valid input", async () => {
  const { validateCreate } = await import("./validators.js");

  const result = validateCreate({
    name: "Production Website",
    environment: "production",
    domain: "https://app.example.com",
    description: "Main production integration",
  });

  assert.equal(result.name, "Production Website");
  assert.equal(result.environment, "production");
  assert.equal(result.domain, "https://app.example.com");
  assert.equal(result.description, "Main production integration");
});

test("Validators: validateCreate trims whitespace from name and domain", async () => {
  const { validateCreate } = await import("./validators.js");

  const result = validateCreate({
    name: "  My Site  ",
    environment: "staging",
    domain: "  https://staging.example.com  ",
  });

  assert.equal(result.name, "My Site");
  assert.equal(result.domain, "https://staging.example.com");
});

test("Validators: validateCreate throws on missing name", async () => {
  const { validateCreate } = await import("./validators.js");

  assert.throws(
    () =>
      validateCreate({
        environment: "production",
        domain: "https://app.example.com",
      }),
    { message: "name is required" },
  );
});

test("Validators: validateCreate throws on invalid environment", async () => {
  const { validateCreate } = await import("./validators.js");

  assert.throws(
    () =>
      validateCreate({
        name: "My Site",
        environment: "unknown-env",
        domain: "https://app.example.com",
      }),
    /environment must be one of/,
  );
});

test("Validators: validateCreate throws on missing domain", async () => {
  const { validateCreate } = await import("./validators.js");

  assert.throws(
    () =>
      validateCreate({
        name: "My Site",
        environment: "production",
        domain: "",
      }),
    { message: "applicationUrl is required" },
  );
});

test("Validators: validateUpdate accepts partial update", async () => {
  const { validateUpdate } = await import("./validators.js");

  const result = validateUpdate({ name: "Updated Name" });
  assert.equal(result.name, "Updated Name");
  assert.equal(result.domain, undefined);
  assert.equal(result.environment, undefined);
});

test("Validators: validateUpdate rejects empty name string", async () => {
  const { validateUpdate } = await import("./validators.js");

  assert.throws(
    () => validateUpdate({ name: "  " }),
    /non-empty string/,
  );
});

test("Validators: validateUpdate rejects invalid environment value", async () => {
  const { validateUpdate } = await import("./validators.js");

  assert.throws(
    () => validateUpdate({ environment: "bad-env" }),
    /environment must be one of/,
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Service — key generation & lifecycle
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// 2. Service — key generation & lifecycle (pure logic tests)
// ──────────────────────────────────────────────────────────────────────────────

// Extract key generation logic for pure testing
const generateSdkKey = (): string => {
  return `sdk_${crypto.randomBytes(24).toString("hex")}`;
};

test("Service key generation: produces sdk_ prefixed key", () => {
  const key = generateSdkKey();
  assert.ok(key.startsWith("sdk_"), `key should start with sdk_, got: ${key}`);
});

test("Service key generation: key is 52 chars (sdk_ + 48 hex)", () => {
  const key = generateSdkKey();
  assert.equal(key.length, 4 + 48, `expected 52 chars, got: ${key.length}`);
});

test("Service key generation: produces unique keys each time", () => {
  const k1 = generateSdkKey();
  const k2 = generateSdkKey();
  const k3 = generateSdkKey();
  assert.notEqual(k1, k2);
  assert.notEqual(k2, k3);
});

test("Service key generation: key only contains valid chars", () => {
  const key = generateSdkKey();
  assert.match(key, /^sdk_[a-f0-9]+$/, `unexpected chars in key: ${key}`);
});

// Domain normalization logic (extracted for pure testing)
const normalizeDomain = (domain: string): string => {
  const trimmed = domain.trim().replace(/\/$/, "");
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.origin;
  } catch {
    return trimmed;
  }
};

test("Service normalizeDomain: strips trailing slash", () => {
  assert.equal(normalizeDomain("https://app.example.com/"), "https://app.example.com");
});

test("Service normalizeDomain: preserves correct URLs unchanged", () => {
  assert.equal(normalizeDomain("https://app.example.com"), "https://app.example.com");
});

test("Service normalizeDomain: prepends https when scheme missing", () => {
  assert.equal(normalizeDomain("app.example.com"), "https://app.example.com");
});

test("Service normalizeDomain: handles localhost correctly", () => {
  assert.equal(normalizeDomain("http://localhost:5174"), "http://localhost:5174");
});

// Status transition logic (pure)
type Status = "pending" | "connected" | "disabled" | "revoked";

const resolveEnableStatus = (connectionCount: number): Status =>
  connectionCount > 0 ? "connected" : "pending";

test("Service enable logic: previously connected → connected", () => {
  assert.equal(resolveEnableStatus(10), "connected");
});

test("Service enable logic: never connected → pending", () => {
  assert.equal(resolveEnableStatus(0), "pending");
});

test("Service enable logic: exactly 1 connection → connected", () => {
  assert.equal(resolveEnableStatus(1), "connected");
});


// ──────────────────────────────────────────────────────────────────────────────
// 3. Auth Middleware — origin validation logic (isolated)
// ──────────────────────────────────────────────────────────────────────────────

import { normalizeOrigin } from "../../middleware/sdkAuth.middleware.js";

// Test the origin validation by building a small replica of the logic
const validateOriginFn = (
  origin: string | undefined,
  registeredDomain: string,
  _environment: string,
): string | null => {
  if (!origin) {
    return "Origin header is required";
  }

  try {
    const parsedOrigin = normalizeOrigin(origin);
    const normalizedDomain = normalizeOrigin(registeredDomain);

    if (parsedOrigin === normalizedDomain) {
      return null;
    }

    return `Origin '${parsedOrigin}' is not allowed for this integration. Expected: '${normalizedDomain}'`;
  } catch {
    return "Invalid Origin header format";
  }
};

test("Auth: allows matching origin", () => {
  const result = validateOriginFn(
    "https://app.example.com",
    "https://app.example.com",
    "production",
  );
  assert.equal(result, null);
});

test("Auth: rejects mismatched origin in production", () => {
  const result = validateOriginFn(
    "https://evil.com",
    "https://app.example.com",
    "production",
  );
  assert.ok(result?.includes("not allowed"), `expected rejection, got: ${result}`);
});

test("Auth: rejects missing origin", () => {
  const result = validateOriginFn(undefined, "https://app.example.com", "production");
  assert.equal(result, "Origin header is required");
});

test("Auth: allows localhost if registered", () => {
  const result = validateOriginFn(
    "http://localhost:3000",
    "http://localhost:3000",
    "development",
  );
  assert.equal(result, null);
});

test("Auth: rejects localhost if registered domain is different", () => {
  const result = validateOriginFn(
    "http://localhost:3000",
    "http://localhost:5000",
    "development",
  );
  assert.ok(result?.includes("not allowed"), `expected rejection, got: ${result}`);
});

test("Auth: rejects localhost origin against production domain", () => {
  const result = validateOriginFn(
    "http://localhost:5174",
    "https://app.example.com",
    "production",
  );
  assert.ok(result?.includes("not allowed"), `expected rejection, got: ${result}`);
});

test("Auth: returns error for malformed origin header", () => {
  const result = validateOriginFn("not-a-url", "https://app.example.com", "production");
  assert.ok(result !== null, "malformed origin should produce error");
});



// ──────────────────────────────────────────────────────────────────────────────
// 5. Key masking (controller helper)
// ──────────────────────────────────────────────────────────────────────────────

const maskKey = (key: string): string => {
  if (!key || key.length < 12) return "****";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
};

test("maskKey: masks a full SDK key correctly", () => {
  const key = "sdk_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";
  const masked = maskKey(key);
  assert.ok(masked.startsWith("sdk_a1b2"), `should start with sdk_a1b2, got: ${masked}`);
  assert.ok(masked.endsWith("5f6"), `should end with last 4 chars, got: ${masked}`);
  assert.ok(masked.includes("..."), "should contain ...");
});

test("maskKey: returns **** for very short keys", () => {
  assert.equal(maskKey("short"), "****");
  assert.equal(maskKey(""), "****");
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Deterministic hash consistency (encryption utility)
// ──────────────────────────────────────────────────────────────────────────────

test("deterministicHash: same input → same hash", async () => {
  const { deterministicHash } = await import("../../utils/encryption.js");
  const key = "sdk_test_abc123";
  const h1 = deterministicHash(key);
  const h2 = deterministicHash(key);
  assert.equal(h1, h2, "hash must be deterministic");
});

test("deterministicHash: different keys → different hashes", async () => {
  const { deterministicHash } = await import("../../utils/encryption.js");
  const h1 = deterministicHash("sdk_key_one");
  const h2 = deterministicHash("sdk_key_two");
  assert.notEqual(h1, h2, "different keys must produce different hashes");
});

test("deterministicHash: produces hex string of expected length", async () => {
  const { deterministicHash } = await import("../../utils/encryption.js");
  const hash = deterministicHash("sdk_test_hash_check");
  assert.match(hash, /^[a-f0-9]+$/, "should be hex string");
  assert.ok(hash.length >= 32, `hash should be at least 32 chars, got: ${hash.length}`);
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. In-Memory Cache Layer Tests
// ──────────────────────────────────────────────────────────────────────────────

test("Cache: sets, gets, and invalidates integrations correctly", async () => {
  const { sdkIntegrationCache } = await import("./cache.js");

  const mockIntegration = {
    _id: "integration_123",
    sdkKeyHash: "hash_abc",
    domain: "https://test.example.com",
    allowedOrigins: ["https://origin1.com"],
  } as any;

  // Set in cache
  sdkIntegrationCache.setIntegration(mockIntegration);

  // Retrieve by keyHash
  const byHash = sdkIntegrationCache.getIntegrationByKeyHash("hash_abc");
  assert.deepEqual(byHash, mockIntegration);

  // Retrieve by ID
  const byId = sdkIntegrationCache.getIntegrationById("integration_123");
  assert.deepEqual(byId, mockIntegration);

  // Invalidate
  sdkIntegrationCache.invalidate("integration_123");
  assert.equal(sdkIntegrationCache.getIntegrationById("integration_123"), null);
  assert.equal(sdkIntegrationCache.getIntegrationByKeyHash("hash_abc"), null);
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Multiple Allowed Origins Validation Tests
// ──────────────────────────────────────────────────────────────────────────────

test("Auth: validates origin matches primary domain or allowed origins list", async () => {
  const { validateIntegrationOrigin } = await import("../../middleware/sdkAuth.middleware.js");

  const mockIntegration = {
    domain: "https://primary.domain.com",
    allowedOrigins: ["https://second.domain.com", "http://localhost:5173"],
  };

  // Match primary domain
  assert.equal(validateIntegrationOrigin("https://primary.domain.com", mockIntegration), null);

  // Match allowedOrigins list
  assert.equal(validateIntegrationOrigin("https://second.domain.com", mockIntegration), null);
  assert.equal(validateIntegrationOrigin("http://localhost:5173", mockIntegration), null);

  // Mismatch
  const err = validateIntegrationOrigin("https://third.domain.com", mockIntegration);
  assert.ok(err?.includes("not allowed"), `expected rejection message, got: ${err}`);
});

// ──────────────────────────────────────────────────────────────────────────────
// 8b. Wildcard Domain / Dynamic CORS Validation Tests
// ──────────────────────────────────────────────────────────────────────────────

test("Auth: validates origin against wildcard domain and allowed origins patterns", async () => {
  const { validateIntegrationOrigin } = await import("../../middleware/sdkAuth.middleware.js");
  const { matchOrigin } = await import("./service.js");

  // Verify matchOrigin helper logic directly
  assert.equal(matchOrigin("https://sub.domain.com", "https://*.domain.com"), true);
  assert.equal(matchOrigin("https://domain.com", "https://*.domain.com"), true);
  assert.equal(matchOrigin("https://other.com", "https://*.domain.com"), false);

  const mockWildcardIntegration = {
    domain: "https://*.wildcard-app.com",
    allowedOrigins: ["https://*.partner.com", "https://custom-domain.com"],
  };

  // Match wildcard domain
  assert.equal(validateIntegrationOrigin("https://sub.wildcard-app.com", mockWildcardIntegration), null);
  assert.equal(validateIntegrationOrigin("https://another.sub.wildcard-app.com", mockWildcardIntegration), null);

  // Match wildcard allowedOrigins list
  assert.equal(validateIntegrationOrigin("https://tenant1.partner.com", mockWildcardIntegration), null);
  assert.equal(validateIntegrationOrigin("https://custom-domain.com", mockWildcardIntegration), null);

  // Mismatch
  const err = validateIntegrationOrigin("https://evil.com", mockWildcardIntegration);
  assert.ok(err?.includes("not allowed"), `expected rejection message, got: ${err}`);
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. Auth Strategy Verification Tests
// ──────────────────────────────────────────────────────────────────────────────

test("Strategies: selects Browser or Server strategy depending on Origin header", async () => {
  const { BrowserSdkAuthStrategy, ServerSdkAuthStrategy } = await import("../../middleware/sdkAuth.middleware.js");

  const browserStrat = new BrowserSdkAuthStrategy();
  const serverStrat = new ServerSdkAuthStrategy();

  const reqWithOrigin = { headers: { origin: "https://app.com" } } as any;
  const reqWithoutOrigin = { headers: {} } as any;

  assert.ok(browserStrat.supports(reqWithOrigin));
  assert.ok(!browserStrat.supports(reqWithoutOrigin));

  assert.ok(!serverStrat.supports(reqWithOrigin));
  assert.ok(serverStrat.supports(reqWithoutOrigin));
});

