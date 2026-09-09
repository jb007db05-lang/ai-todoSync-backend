import assert from "node:assert/strict";
import test from "node:test";
import crypto from "crypto";
import { SdkAuthService } from "../../services/sdkAuth.service.js";
import SdkSessionModel from "../../models/sdk-session.model.js";
import SdkNonceModel from "../../models/sdk-nonce.model.js";
import sdkIntegrationService from "../sdk-integrations/service.js";
import { deterministicHash, encrypt } from "../../utils/encryption.js";

test("SdkAuthService: authenticate generates session with valid inputs", async () => {
  const originalResolveByKeyHash = sdkIntegrationService.resolveByKeyHash;
  const originalResolveTenant = sdkIntegrationService.resolveTenant;
  const originalSessionCreate = SdkSessionModel.create;

  let createdSession: any = null;

  sdkIntegrationService.resolveByKeyHash = async (_hash) => {
    return {
      _id: "integration_123",
      status: "active",
      tenantId: "tenant_123",
      domain: "https://example.com",
      allowedOrigins: [],
    } as any;
  };

  sdkIntegrationService.resolveTenant = async (tenantId) => {
    return { _id: tenantId, name: "Tenant User" } as any;
  };

  SdkSessionModel.create = (async (doc: any) => {
    createdSession = doc;
    return doc;
  }) as any;

  try {
    const session = await SdkAuthService.authenticate(
      "sdk_test_key_123",
      "https://example.com",
    );
    assert.ok(createdSession);
    assert.ok(session);
    assert.equal(session.sessionId.length, 36); // UUID length
    assert.equal(session.sessionSecret.length, 64); // Hex 32-byte secret (restored unencrypted in return value)
    assert.equal(session.tenantId, "tenant_123");
    assert.equal(session.validatedOrigin, "https://example.com");
  } finally {
    sdkIntegrationService.resolveByKeyHash = originalResolveByKeyHash;
    sdkIntegrationService.resolveTenant = originalResolveTenant;
    SdkSessionModel.create = originalSessionCreate;
  }
});

test("SdkAuthService: verifySignature checks signature correctly", async () => {
  const originalResolveByKeyHash = sdkIntegrationService.resolveByKeyHash;
  const originalResolveTenant = sdkIntegrationService.resolveTenant;
  const originalSessionFindOne = SdkSessionModel.findOne;
  const originalNonceCreate = SdkNonceModel.create;

  const rawSecret =
    "3132333435363738393031323334353637383930313233343536373839303132";
  const encryptedSecret = encrypt(rawSecret);

  const mockSession = {
    sessionId: "session_123",
    sessionSecret: encryptedSecret,
    tenantId: "tenant_123",
    sdkKeyHash: deterministicHash("sdk_test_key_123"),
    validatedOrigin: "https://example.com",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    revoked: false,
    save: async () => {},
  };

  sdkIntegrationService.resolveByKeyHash = async (_hash) => {
    return {
      _id: "integration_123",
      status: "active",
      tenantId: "tenant_123",
      domain: "https://example.com",
    } as any;
  };

  sdkIntegrationService.resolveTenant = async (tenantId) => {
    return { _id: tenantId, name: "Tenant User" } as any;
  };

  SdkSessionModel.findOne = (async () => mockSession) as any;
  SdkNonceModel.create = (async () => ({})) as any;

  try {
    const timestamp = Date.now().toString();
    const nonce = "nonce_123";
    const body = { eventName: "test_event" };
    const bodyStr = JSON.stringify(body);
    const bodySha256 = crypto
      .createHash("sha256")
      .update(bodyStr)
      .digest("hex");
    const sigVersion = "1";
    const sdkKey = "sdk_test_key_123";

    // canonicalString = METHOD + PATH + QUERY + BODY_HASH + TIMESTAMP + NONCE + VERSION + SDK_KEY
    const canonicalString = `POST/engagement/track${bodySha256}${timestamp}${nonce}${sigVersion}${sdkKey}`;
    const signature = crypto
      .createHmac("sha256", rawSecret)
      .update(canonicalString)
      .digest("hex");

    const mockReq: any = {
      method: "POST",
      originalUrl: "/engagement/track",
      path: "/engagement/track",
      body,
      headers: {
        "x-sdk-key": sdkKey,
        "x-session-id": "session_123",
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-body-sha256": bodySha256,
        "x-signature": signature,
        "x-signature-version": sigVersion,
        origin: "https://example.com",
      },
    };

    const res = await SdkAuthService.verifySignature(mockReq);
    assert.ok(res.session);
    assert.equal(res.integration._id, "integration_123");
    assert.equal(res.user._id, "tenant_123");
  } finally {
    sdkIntegrationService.resolveByKeyHash = originalResolveByKeyHash;
    sdkIntegrationService.resolveTenant = originalResolveTenant;
    SdkSessionModel.findOne = originalSessionFindOne;
    SdkNonceModel.create = originalNonceCreate;
  }
});

test("SdkAuthService: verifySignature fails on clock skew", async () => {
  const originalResolveByKeyHash = sdkIntegrationService.resolveByKeyHash;
  const originalResolveTenant = sdkIntegrationService.resolveTenant;
  const originalSessionFindOne = SdkSessionModel.findOne;
  const originalNonceCreate = SdkNonceModel.create;

  const rawSecret =
    "3132333435363738393031323334353637383930313233343536373839303132";
  const encryptedSecret = encrypt(rawSecret);

  const mockSession = {
    sessionId: "session_123",
    sessionSecret: encryptedSecret,
    tenantId: "tenant_123",
    sdkKeyHash: deterministicHash("sdk_test_key_123"),
    validatedOrigin: "https://example.com",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    revoked: false,
    save: async () => {},
  };

  sdkIntegrationService.resolveByKeyHash = async (_hash) => {
    return {
      _id: "integration_123",
      status: "active",
      tenantId: "tenant_123",
      domain: "https://example.com",
    } as any;
  };

  sdkIntegrationService.resolveTenant = async (tenantId) => {
    return { _id: tenantId, name: "Tenant User" } as any;
  };

  SdkSessionModel.findOne = (async () => mockSession) as any;
  SdkNonceModel.create = (async () => ({})) as any;

  try {
    // 10 minutes in the future (skew exceeds 5 minutes threshold)
    const timestamp = (Date.now() + 600000).toString();
    const nonce = "nonce_123";
    const body = { eventName: "test_event" };
    const bodyStr = JSON.stringify(body);
    const bodySha256 = crypto
      .createHash("sha256")
      .update(bodyStr)
      .digest("hex");
    const sigVersion = "1";
    const sdkKey = "sdk_test_key_123";

    const canonicalString = `POST/engagement/track${bodySha256}${timestamp}${nonce}${sigVersion}${sdkKey}`;
    const signature = crypto
      .createHmac("sha256", rawSecret)
      .update(canonicalString)
      .digest("hex");

    const mockReq: any = {
      method: "POST",
      originalUrl: "/engagement/track",
      path: "/engagement/track",
      body,
      headers: {
        "x-sdk-key": sdkKey,
        "x-session-id": "session_123",
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-body-sha256": bodySha256,
        "x-signature": signature,
        "x-signature-version": sigVersion,
        origin: "https://example.com",
      },
    };

    await assert.rejects(SdkAuthService.verifySignature(mockReq), {
      message: "Expired timestamp",
    });
  } finally {
    sdkIntegrationService.resolveByKeyHash = originalResolveByKeyHash;
    sdkIntegrationService.resolveTenant = originalResolveTenant;
    SdkSessionModel.findOne = originalSessionFindOne;
    SdkNonceModel.create = originalNonceCreate;
  }
});

test("SdkAuthService: verifySignature fails on reused nonce", async () => {
  const originalResolveByKeyHash = sdkIntegrationService.resolveByKeyHash;
  const originalResolveTenant = sdkIntegrationService.resolveTenant;
  const originalSessionFindOne = SdkSessionModel.findOne;
  const originalNonceCreate = SdkNonceModel.create;

  const rawSecret =
    "3132333435363738393031323334353637383930313233343536373839303132";
  const encryptedSecret = encrypt(rawSecret);

  const mockSession = {
    sessionId: "session_123",
    sessionSecret: encryptedSecret,
    tenantId: "tenant_123",
    sdkKeyHash: deterministicHash("sdk_test_key_123"),
    validatedOrigin: "https://example.com",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    revoked: false,
    save: async () => {},
  };

  sdkIntegrationService.resolveByKeyHash = async (_hash) => {
    return {
      _id: "integration_123",
      status: "active",
      tenantId: "tenant_123",
      domain: "https://example.com",
    } as any;
  };

  sdkIntegrationService.resolveTenant = async (tenantId) => {
    return { _id: tenantId, name: "Tenant User" } as any;
  };

  SdkSessionModel.findOne = (async () => mockSession) as any;

  // Simulate duplicate key error in MongoDB (reused nonce)
  SdkNonceModel.create = (async () => {
    const err = new Error("Duplicate key");
    (err as any).code = 11000;
    throw err;
  }) as any;

  try {
    const timestamp = Date.now().toString();
    const nonce = "nonce_reused";
    const body = { eventName: "test_event" };
    const bodyStr = JSON.stringify(body);
    const bodySha256 = crypto
      .createHash("sha256")
      .update(bodyStr)
      .digest("hex");
    const sigVersion = "1";
    const sdkKey = "sdk_test_key_123";

    const canonicalString = `POST/engagement/track${bodySha256}${timestamp}${nonce}${sigVersion}${sdkKey}`;
    const signature = crypto
      .createHmac("sha256", rawSecret)
      .update(canonicalString)
      .digest("hex");

    const mockReq: any = {
      method: "POST",
      originalUrl: "/engagement/track",
      path: "/engagement/track",
      body,
      headers: {
        "x-sdk-key": sdkKey,
        "x-session-id": "session_123",
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-body-sha256": bodySha256,
        "x-signature": signature,
        "x-signature-version": sigVersion,
        origin: "https://example.com",
      },
    };

    await assert.rejects(SdkAuthService.verifySignature(mockReq), {
      message: "Reused nonce",
    });
  } finally {
    sdkIntegrationService.resolveByKeyHash = originalResolveByKeyHash;
    sdkIntegrationService.resolveTenant = originalResolveTenant;
    SdkSessionModel.findOne = originalSessionFindOne;
    SdkNonceModel.create = originalNonceCreate;
  }
});

test("SdkAuthService: verifySignature fails when absolute lifetime is exceeded", async () => {
  const originalResolveByKeyHash = sdkIntegrationService.resolveByKeyHash;
  const originalResolveTenant = sdkIntegrationService.resolveTenant;
  const originalSessionFindOne = SdkSessionModel.findOne;
  const originalNonceCreate = SdkNonceModel.create;

  const rawSecret =
    "3132333435363738393031323334353637383930313233343536373839303132";
  const encryptedSecret = encrypt(rawSecret);

  // Set issuedAt to 3 hours ago (exceeding the 2-hour absolute maximum lifetime)
  const mockSession = {
    sessionId: "session_123",
    sessionSecret: encryptedSecret,
    tenantId: "tenant_123",
    sdkKeyHash: deterministicHash("sdk_test_key_123"),
    validatedOrigin: "https://example.com",
    issuedAt: new Date(Date.now() - 3 * 3600 * 1000),
    expiresAt: new Date(Date.now() + 3600000),
    revoked: false,
    save: async () => {},
  };

  sdkIntegrationService.resolveByKeyHash = async (_hash) => {
    return {
      _id: "integration_123",
      status: "active",
      tenantId: "tenant_123",
      domain: "https://example.com",
    } as any;
  };

  sdkIntegrationService.resolveTenant = async (tenantId) => {
    return { _id: tenantId, name: "Tenant User" } as any;
  };

  SdkSessionModel.findOne = (async () => mockSession) as any;
  SdkNonceModel.create = (async () => ({})) as any;

  try {
    const timestamp = Date.now().toString();
    const nonce = "nonce_123";
    const body = { eventName: "test_event" };
    const bodyStr = JSON.stringify(body);
    const bodySha256 = crypto
      .createHash("sha256")
      .update(bodyStr)
      .digest("hex");
    const sigVersion = "1";
    const sdkKey = "sdk_test_key_123";

    const canonicalString = `POST/engagement/track${bodySha256}${timestamp}${nonce}${sigVersion}${sdkKey}`;
    const signature = crypto
      .createHmac("sha256", rawSecret)
      .update(canonicalString)
      .digest("hex");

    const mockReq: any = {
      method: "POST",
      originalUrl: "/engagement/track",
      path: "/engagement/track",
      body,
      headers: {
        "x-sdk-key": sdkKey,
        "x-session-id": "session_123",
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-body-sha256": bodySha256,
        "x-signature": signature,
        "x-signature-version": sigVersion,
        origin: "https://example.com",
      },
    };

    await assert.rejects(SdkAuthService.verifySignature(mockReq), {
      message: "Session expired (absolute lifetime reached)",
    });
  } finally {
    sdkIntegrationService.resolveByKeyHash = originalResolveByKeyHash;
    sdkIntegrationService.resolveTenant = originalResolveTenant;
    SdkSessionModel.findOne = originalSessionFindOne;
    SdkNonceModel.create = originalNonceCreate;
  }
});

test("SdkAuthService: verifySignature fails on unsupported signature version", async () => {
  const originalResolveByKeyHash = sdkIntegrationService.resolveByKeyHash;
  const originalResolveTenant = sdkIntegrationService.resolveTenant;
  const originalSessionFindOne = SdkSessionModel.findOne;
  const originalNonceCreate = SdkNonceModel.create;

  const rawSecret =
    "3132333435363738393031323334353637383930313233343536373839303132";
  const encryptedSecret = encrypt(rawSecret);

  const mockSession = {
    sessionId: "session_123",
    sessionSecret: encryptedSecret,
    tenantId: "tenant_123",
    sdkKeyHash: deterministicHash("sdk_test_key_123"),
    validatedOrigin: "https://example.com",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
    revoked: false,
    save: async () => {},
  };

  sdkIntegrationService.resolveByKeyHash = async (_hash) => {
    return {
      _id: "integration_123",
      status: "active",
      tenantId: "tenant_123",
      domain: "https://example.com",
    } as any;
  };

  sdkIntegrationService.resolveTenant = async (tenantId) => {
    return { _id: tenantId, name: "Tenant User" } as any;
  };

  SdkSessionModel.findOne = (async () => mockSession) as any;
  SdkNonceModel.create = (async () => ({})) as any;

  try {
    const timestamp = Date.now().toString();
    const nonce = "nonce_123";
    const body = { eventName: "test_event" };
    const bodyStr = JSON.stringify(body);
    const bodySha256 = crypto
      .createHash("sha256")
      .update(bodyStr)
      .digest("hex");
    const sigVersion = "2"; // Unsupported signature version
    const sdkKey = "sdk_test_key_123";

    const canonicalString = `POST/engagement/track${bodySha256}${timestamp}${nonce}${sigVersion}${sdkKey}`;
    const signature = crypto
      .createHmac("sha256", rawSecret)
      .update(canonicalString)
      .digest("hex");

    const mockReq: any = {
      method: "POST",
      originalUrl: "/engagement/track",
      path: "/engagement/track",
      body,
      headers: {
        "x-sdk-key": sdkKey,
        "x-session-id": "session_123",
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-body-sha256": bodySha256,
        "x-signature": signature,
        "x-signature-version": sigVersion,
        origin: "https://example.com",
      },
    };

    await assert.rejects(SdkAuthService.verifySignature(mockReq), {
      message: "Unsupported signature version",
    });
  } finally {
    sdkIntegrationService.resolveByKeyHash = originalResolveByKeyHash;
    sdkIntegrationService.resolveTenant = originalResolveTenant;
    SdkSessionModel.findOne = originalSessionFindOne;
    SdkNonceModel.create = originalNonceCreate;
  }
});
