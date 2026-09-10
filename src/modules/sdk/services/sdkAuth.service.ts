import crypto from "crypto";
import { Request } from "express";
import SdkSessionModel, {
  ISdkSessionDocument,
} from "../../../modules/sdk/models/sdk-session.model.js";
import SdkNonceModel from "../models/sdk-nonce.model.js";
import sdkIntegrationService, {
  normalizeOrigin,
  matchOrigin,
} from "../../sdk-integrations/service.js";
import {
  deterministicHash,
  encrypt,
  decrypt,
} from "../../../utils/encryption.js";
import { sdkAuthConfig } from "../../../config/sdkAuth.config.js";
import logger from "../../../lib/logger.js";
import { AppError } from "../../../utils/app-error.js";

// Helper to mask key for logging
const maskKey = (key?: string): string => {
  if (!key) return "missing";
  if (key.startsWith("sdk_")) {
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  }
  return "****";
};

/**
 * Validates that the request's Origin matches the integration's registered domain or allowed origins list.
 */
export const validateIntegrationOrigin = (
  origin: string | undefined,
  integration: any,
): string | null => {
  if (!origin) {
    return "Origin header is required";
  }

  try {
    const parsedOrigin = normalizeOrigin(origin);
    const domainMatches =
      integration.domain && matchOrigin(parsedOrigin, integration.domain);
    const allowedMatches = (integration.allowedOrigins || []).some(
      (o: string) => matchOrigin(parsedOrigin, o),
    );

    if (domainMatches || allowedMatches) {
      return null;
    }

    return `Origin '${parsedOrigin}' is not allowed for this integration.`;
  } catch {
    return "Invalid Origin header format";
  }
};

// Deterministic JSON stringifier to avoid key ordering issues
export const canonicalJsonStringify = (obj: any): string => {
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
};

export class SdkAuthService {
  /**
   * Phase 1: Authentication Handshake
   * Validates the public SDK key and origin, then generates a cryptographically secure session.
   */
  static async authenticate(
    sdkKey: string,
    origin: string | undefined,
  ): Promise<ISdkSessionDocument> {
    if (!sdkKey) {
      logger.warn("SDK Auth Handshake Failure: Missing SDK Key");
      throw new AppError(400, "SDK key is required", "SDK_KEY_REQUIRED");
    }

    if (!origin) {
      logger.warn("SDK Auth Handshake Failure: Missing Origin Header");
      throw new AppError(400, "Origin header is required", "ORIGIN_REQUIRED");
    }

    const keyHash = deterministicHash(sdkKey);
    const integration = await sdkIntegrationService.resolveByKeyHash(keyHash);

    if (!integration) {
      logger.warn("SDK Auth Handshake Failure: Invalid Key", {
        maskedKey: maskKey(sdkKey),
      });
      throw new AppError(401, "Invalid or revoked SDK key", "INVALID_SDK_KEY");
    }

    if (integration.status === "disabled") {
      logger.warn("SDK Auth Handshake Failure: Disabled Integration", {
        integrationId: integration._id.toString(),
      });
      throw new AppError(
        403,
        "This SDK integration has been disabled.",
        "SDK_DISABLED",
      );
    }

    if (integration.status === "revoked") {
      logger.warn("SDK Auth Handshake Failure: Revoked Integration", {
        integrationId: integration._id.toString(),
      });
      throw new AppError(403, "This SDK key has been revoked.", "SDK_REVOKED");
    }

    // Validate Origin matches whitelist
    const originError = validateIntegrationOrigin(origin, integration);
    if (originError) {
      logger.warn("SDK Auth Handshake Failure: Invalid Origin", {
        origin,
        allowedOrigins: integration.allowedOrigins,
        domain: integration.domain,
        error: originError,
      });
      throw new AppError(403, originError, "ORIGIN_NOT_ALLOWED");
    }

    // Resolve tenant user
    const tenant = await sdkIntegrationService.resolveTenant(
      integration.tenantId,
    );
    if (!tenant) {
      logger.warn("SDK Auth Handshake Failure: Tenant Not Found", {
        tenantId: integration.tenantId,
      });
      throw new Error("Integration owner not found");
    }

    const normalizedOriginVal = normalizeOrigin(origin);

    // Generate Session Details
    const sessionId = crypto.randomUUID();
    const sessionSecret = crypto.randomBytes(32).toString("hex"); // 256-bit cryptographically secure secret
    const encryptedSecret = encrypt(sessionSecret);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sdkAuthConfig.sessionLifetimeMs);

    const session = await SdkSessionModel.create({
      sessionId,
      sessionSecret: encryptedSecret,
      tenantId: integration.tenantId,
      sdkKeyHash: keyHash,
      validatedOrigin: normalizedOriginVal,
      issuedAt: now,
      expiresAt,
      revoked: false,
    });

    logger.info("SDK Auth Handshake Success", {
      sessionId,
      tenantId: integration.tenantId,
      expiresAt,
    });

    // Asynchronously touch connection tracking
    void sdkIntegrationService
      .touchConnection(integration._id.toString(), {
        latestOrigin: origin,
        touchHeartbeat: true,
      })
      .catch(() => {});

    // Restore unencrypted session secret so it can be returned to the client
    session.sessionSecret = sessionSecret;

    return session;
  }

  /**
   * Phase 5: Session Renewal
   * Extends the session expiration if valid.
   */
  static async renewSession(sessionId: string): Promise<ISdkSessionDocument> {
    const session = await SdkSessionModel.findOne({ sessionId });
    if (!session) {
      logger.warn("SDK Session Renewal Failure: Session Not Found", {
        sessionId,
      });
      throw new Error("Session does not exist");
    }

    if (session.revoked) {
      logger.warn("SDK Session Renewal Failure: Session Revoked", {
        sessionId,
      });
      throw new Error("Session revoked");
    }

    if (session.expiresAt.getTime() < Date.now()) {
      logger.warn("SDK Session Renewal Failure: Session Expired", {
        sessionId,
      });
      throw new Error("Session expired");
    }

    session.expiresAt = new Date(Date.now() + sdkAuthConfig.sessionLifetimeMs);
    await session.save();

    logger.info("SDK Session Renewed", {
      sessionId,
      expiresAt: session.expiresAt,
    });
    return session;
  }

  /**
   * Phase 5: Session Revocation
   */
  static async revokeSession(sessionId: string): Promise<void> {
    const session = await SdkSessionModel.findOne({ sessionId });
    if (session) {
      session.revoked = true;
      await session.save();
      logger.info("SDK Session Revoked", { sessionId });
    }
  }

  /**
   * Phase 3 & 4: Signature and Replay Verification
   */
  static async verifySignature(
    req: Request,
  ): Promise<{ session: ISdkSessionDocument; integration: any; user: any }> {
    const sdkKey = req.headers["x-sdk-key"] as string;
    const sessionId = req.headers["x-session-id"] as string;
    const timestampStr = req.headers["x-timestamp"] as string;
    const nonce = req.headers["x-nonce"] as string;
    const bodySha256 = req.headers["x-body-sha256"] as string;
    const signature = req.headers["x-signature"] as string;
    const sigVersion = req.headers["x-signature-version"] as string;

    if (
      !sdkKey ||
      !sessionId ||
      !timestampStr ||
      !nonce ||
      !bodySha256 ||
      !signature ||
      !sigVersion
    ) {
      logger.warn(
        "SDK Auth Verification Failure: Missing cryptographic headers",
      );
      throw new Error("Missing cryptographic headers");
    }

    // 1. Verify signature version
    if (sigVersion !== "1") {
      logger.warn(
        "SDK Auth Verification Failure: Unsupported signature version",
        { sessionId, sigVersion },
      );
      throw new Error("Unsupported signature version");
    }

    // 2. Retrieve and validate the session
    const session = await SdkSessionModel.findOne({ sessionId });
    if (!session) {
      logger.warn("SDK Auth Verification Failure: Session not found", {
        sessionId,
      });
      throw new Error("Session does not exist");
    }

    if (session.revoked) {
      logger.warn("SDK Auth Verification Failure: Session revoked", {
        sessionId,
      });
      throw new Error("Session revoked");
    }

    // Enforce absolute maximum session lifetime
    if (
      session.issuedAt.getTime() + sdkAuthConfig.maxSessionLifetimeMs <
      Date.now()
    ) {
      logger.warn(
        "SDK Auth Verification Failure: Session absolute lifetime exceeded",
        { sessionId },
      );
      throw new Error("Session expired (absolute lifetime reached)");
    }

    if (session.expiresAt.getTime() < Date.now()) {
      logger.warn("SDK Auth Verification Failure: Session expired", {
        sessionId,
      });
      throw new Error("Session expired");
    }

    // Enforce validated origin binding (if Origin is present)
    if (req.headers.origin) {
      const requestOrigin = normalizeOrigin(req.headers.origin);
      if (session.validatedOrigin !== requestOrigin) {
        logger.warn("SDK Auth Verification Failure: Session origin mismatch", {
          sessionId,
          sessionOrigin: session.validatedOrigin,
          requestOrigin,
        });
        throw new Error("Invalid origin");
      }
    }

    // Verify key hash matches session
    const keyHash = deterministicHash(sdkKey);
    if (session.sdkKeyHash !== keyHash) {
      logger.warn(
        "SDK Auth Verification Failure: SDK Key mismatch for session",
        { sessionId },
      );
      throw new Error("SDK mismatch");
    }

    // 3. Retrieve and validate integration
    const integration = await sdkIntegrationService.resolveByKeyHash(keyHash);
    if (!integration) {
      logger.warn(
        "SDK Auth Verification Failure: Integration not found for SDK key",
        { sessionId },
      );
      throw new Error("Invalid or revoked SDK key");
    }

    if (integration.status === "disabled") {
      logger.warn("SDK Auth Verification Failure: Disabled integration", {
        sessionId,
      });
      throw new AppError(
        403,
        "This SDK integration has been disabled.",
        "SDK_DISABLED",
      );
    }

    if (integration.status === "revoked") {
      logger.warn("SDK Auth Verification Failure: Revoked integration", {
        sessionId,
      });
      throw new AppError(403, "This SDK key has been revoked.", "SDK_REVOKED");
    }

    if (integration.tenantId !== session.tenantId) {
      logger.warn("SDK Auth Verification Failure: Tenant ID mismatch", {
        sessionId,
      });
      throw new Error("tenant mismatch");
    }

    // 4. Verify timestamp skew
    const reqTimestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    if (
      isNaN(reqTimestamp) ||
      Math.abs(now - reqTimestamp) > sdkAuthConfig.allowedClockSkewMs
    ) {
      logger.warn("SDK Auth Verification Failure: Clock skew exceeded", {
        sessionId,
        reqTimestamp,
        now,
        skewMs: Math.abs(now - reqTimestamp),
      });
      throw new Error("Expired timestamp");
    }

    // 5. Verify nonce for replay protection
    try {
      await SdkNonceModel.create({
        nonce,
        expiresAt: new Date(now + sdkAuthConfig.maxNonceLifetimeMs),
      });
    } catch (err: any) {
      if (err.code === 11000) {
        logger.warn("SDK Auth Verification Failure: Replay attack detected", {
          sessionId,
          nonce,
        });
        throw new Error("Reused nonce");
      }
      throw err;
    }

    // 6. Verify body hash match
    let bodyStr = "";
    if (req.body && Object.keys(req.body).length > 0) {
      bodyStr = canonicalJsonStringify(req.body);
    }
    const computedBodyHash = crypto
      .createHash("sha256")
      .update(bodyStr)
      .digest("hex");
    if (computedBodyHash !== bodySha256) {
      logger.warn("SDK Auth Verification Failure: Body hash mismatch", {
        sessionId,
        computedBodyHash,
        bodySha256,
      });
      throw new Error("Invalid body hash");
    }

    // 7. Verify HMAC signature matches
    const method = req.method.toUpperCase();
    const urlParts = req.originalUrl.split("?");
    let path = urlParts[0];
    // Strip trailing slash except if path is exactly "/"
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    path = decodeURIComponent(path);

    let query = "";
    if (urlParts.length > 1) {
      const searchParams = new URLSearchParams(urlParts[1]);
      searchParams.sort();
      query = searchParams.toString();
    }

    const canonicalString = `${method}${path}${query}${bodySha256}${timestampStr}${nonce}${sigVersion}${sdkKey}`;
    const decryptedSecret = decrypt(session.sessionSecret);
    const computedSignature = crypto
      .createHmac(sdkAuthConfig.hmacAlgorithm, decryptedSecret)
      .update(canonicalString)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const compBuf = Buffer.from(computedSignature, "hex");

    if (
      sigBuf.length !== compBuf.length ||
      !crypto.timingSafeEqual(sigBuf, compBuf)
    ) {
      logger.warn("SDK Auth Verification Failure: HMAC signature mismatch", {
        sessionId,
      });
      throw new Error("Invalid signature");
    }

    // 8. Resolve Tenant User
    const user = await sdkIntegrationService.resolveTenant(
      integration.tenantId,
    );
    if (!user) {
      logger.warn("SDK Auth Verification Failure: Tenant owner not found", {
        sessionId,
      });
      throw new Error("Integration owner not found");
    }

    // 9. Sliding renewal: update expiration, capped by absolute maximum lifetime
    const newExpiresAt = new Date(Date.now() + sdkAuthConfig.sessionLifetimeMs);
    const absoluteLimit = new Date(
      session.issuedAt.getTime() + sdkAuthConfig.maxSessionLifetimeMs,
    );
    session.expiresAt =
      newExpiresAt > absoluteLimit ? absoluteLimit : newExpiresAt;
    await session.save();

    logger.info("SDK Request Authenticated & Signature Verified", {
      sessionId,
      path,
    });

    // Touch connection tracking
    void sdkIntegrationService
      .touchConnection(integration._id.toString(), {
        latestOrigin: req.headers.origin as string | undefined,
        touchRuntime: req.path.includes("/runtime"),
        touchEvent: req.path.includes("/track"),
        touchHeartbeat: true,
      })
      .catch(() => {});

    return { session, integration, user };
  }

  /**
   * Periodic cleanup job for old expired sessions/nonces.
   */
  static async runCleanupJob(): Promise<{
    deletedSessions: number;
    deletedNonces: number;
  }> {
    const now = new Date();
    const sessionRes = await SdkSessionModel.deleteMany({
      expiresAt: { $lt: now },
    });
    const nonceRes = await SdkNonceModel.deleteMany({
      expiresAt: { $lt: now },
    });

    if (sessionRes.deletedCount > 0 || nonceRes.deletedCount > 0) {
      logger.info("SDK Auth Cleanup Job Run", {
        deletedSessions: sessionRes.deletedCount,
        deletedNonces: nonceRes.deletedCount,
      });
    }

    return {
      deletedSessions: sessionRes.deletedCount || 0,
      deletedNonces: nonceRes.deletedCount || 0,
    };
  }
}
