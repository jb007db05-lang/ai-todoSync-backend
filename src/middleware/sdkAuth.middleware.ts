import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { rateLimit } from "express-rate-limit";
import AnalyticsKeyModel from "../models/analytics-key.model.js";
import { deterministicHash } from "../utils/encryption.js";
import sdkIntegrationService, {
  normalizeOrigin,
  matchOrigin,
} from "../modules/sdk-integrations/service.js";
export { normalizeOrigin, matchOrigin };
import logger from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const extractRawKey = (req: Request): string | undefined => {
  const authorizationHeader = req.headers.authorization;
  const bearerToken =
    typeof authorizationHeader === "string" &&
    authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length).trim()
      : undefined;

  return (
    bearerToken ||
    (req.headers["x-api-key"] as string) ||
    (req.body && req.body.apiKey) ||
    (req.body && req.body.sdkKey)
  );
};

export const setCorsHeaders = (res: Response, origin: string): void => {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key, x-sync-api-key, x-sdk-version",
  );
};

const logSecurityEvent = (
  reason: string,
  req: Request,
  rawKey?: string,
  details?: any,
) => {
  const maskedKey = rawKey
    ? rawKey.startsWith("sdk_")
      ? `${rawKey.slice(0, 8)}...${rawKey.slice(-4)}`
      : "****"
    : "missing";
  logger.warn("Security Event: SDK Auth Failure", {
    reason,
    maskedKey,
    origin: req.headers.origin,
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    ...details,
  });
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
    const domainMatches = integration.domain && matchOrigin(parsedOrigin, integration.domain);
    const allowedMatches = (integration.allowedOrigins || []).some((o: string) =>
      matchOrigin(parsedOrigin, o),
    );

    if (domainMatches || allowedMatches) {
      return null;
    }

    return `Origin '${parsedOrigin}' is not allowed for this integration.`;
  } catch {
    return "Invalid Origin header format";
  }
};

// ---------------------------------------------------------------------------
// Strategy Pattern for Future Non-Browser SDKs
// ---------------------------------------------------------------------------

export interface SdkAuthStrategy {
  name: string;
  supports(req: Request): boolean;
  authenticate(req: Request, integration: any): Promise<string | null>;
}

export class BrowserSdkAuthStrategy implements SdkAuthStrategy {
  name = "browser";
  supports(req: Request): boolean {
    return !!req.headers.origin;
  }
  async authenticate(req: Request, integration: any): Promise<string | null> {
    const origin = req.headers.origin;
    return validateIntegrationOrigin(origin, integration);
  }
}

export class ServerSdkAuthStrategy implements SdkAuthStrategy {
  name = "server";
  supports(req: Request): boolean {
    return !req.headers.origin;
  }
  async authenticate(_req: Request, _integration: any): Promise<string | null> {
    // Server strategies bypass browser-based Origin checks.
    // In the future, this can verify signatures, API tokens, IP allowlists, etc.
    return null;
  }
}

const authStrategies: SdkAuthStrategy[] = [
  new BrowserSdkAuthStrategy(),
  new ServerSdkAuthStrategy(),
];

// ---------------------------------------------------------------------------
// Primary SDK Integration middleware (new — integration-aware)
// ---------------------------------------------------------------------------

export const validateSdkIntegrationKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // Check if integration is already resolved in req.sdkIntegration (e.g. by CORS middleware)
  if (req.sdkIntegration) {
    const integration = req.sdkIntegration;

    if (integration.status === "disabled") {
      logSecurityEvent("Disabled Integration", req, extractRawKey(req), {
        id: integration._id.toString(),
      });
      res
        .status(403)
        .json({ error: "This SDK integration has been disabled." });
      return;
    }

    if (integration.status === "revoked") {
      logSecurityEvent("Revoked Integration", req, extractRawKey(req), {
        id: integration._id.toString(),
      });
      res.status(403).json({ error: "This SDK key has been revoked." });
      return;
    }

    let authError: string | null = null;
    const strategy = authStrategies.find((s) => s.supports(req));
    if (strategy) {
      authError = await strategy.authenticate(req, integration);
    }

    if (authError) {
      logSecurityEvent("Origin Mismatch", req, extractRawKey(req), {
        error: authError,
      });
      res.status(403).json({ error: authError });
      return;
    }

    if (req.headers.origin) {
      setCorsHeaders(res, req.headers.origin);
    }

    const user = await sdkIntegrationService.resolveTenant(
      integration.tenantId,
    );
    if (!user) {
      logSecurityEvent("Owner Not Found", req, extractRawKey(req));
      res.status(401).json({ error: "Integration owner not found" });
      return;
    }

    req.user = user;
    next();
    return;
  }

  const rawKey = extractRawKey(req);

  if (!rawKey || typeof rawKey !== "string") {
    logSecurityEvent("Missing Key", req);
    res.status(401).json({
      error:
        "SDK key is required in Authorization Bearer, x-api-key header, or sdkKey body field",
    });
    return;
  }

  try {
    const keyHash = deterministicHash(rawKey);
    const integration = await sdkIntegrationService.resolveByKeyHash(keyHash);

    if (!integration) {
      logSecurityEvent("Invalid Key", req, rawKey);
      res.status(401).json({ error: "Invalid or revoked SDK key" });
      return;
    }

    if (integration.status === "disabled") {
      logSecurityEvent("Disabled Integration", req, rawKey, {
        id: integration._id.toString(),
      });
      res
        .status(403)
        .json({ error: "This SDK integration has been disabled." });
      return;
    }

    if (integration.status === "revoked") {
      logSecurityEvent("Revoked Integration", req, rawKey, {
        id: integration._id.toString(),
      });
      res.status(403).json({ error: "This SDK key has been revoked." });
      return;
    }

    let authError: string | null = null;
    const strategy = authStrategies.find((s) => s.supports(req));
    if (strategy) {
      authError = await strategy.authenticate(req, integration);
    }

    if (authError) {
      logSecurityEvent("Origin Mismatch", req, rawKey, { error: authError });
      res.status(403).json({ error: authError });
      return;
    }

    if (req.headers.origin) {
      setCorsHeaders(res, req.headers.origin);
    }

    const user = await sdkIntegrationService.resolveTenant(
      integration.tenantId,
    );
    if (!user) {
      logSecurityEvent("Owner Not Found", req, rawKey);
      res.status(401).json({ error: "Integration owner not found" });
      return;
    }

    req.user = user;
    req.sdkIntegration = integration;

    void sdkIntegrationService
      .touchConnection(integration._id.toString(), {
        latestOrigin: req.headers.origin,
        sdkVersion: req.body?.sdkVersion as string | undefined,
        touchRuntime: req.path.includes("/runtime"),
        touchEvent: req.path.includes("/track"),
        touchHeartbeat: true,
      })
      .catch(() => {});

    next();
  } catch (error) {
    logger.error(
      "SDK Integration Auth Middleware Error:",
      error instanceof Error ? error : new Error(String(error)),
    );
    res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
};

// ---------------------------------------------------------------------------
// Legacy AnalyticsKey middleware (backward compat)
// ---------------------------------------------------------------------------

export const validateSdkApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const rawKey = extractRawKey(req);

  if (!rawKey || typeof rawKey !== "string") {
    res.status(401).json({
      error: "API key is required in Authorization or X-API-KEY header",
    });
    return;
  }

  try {
    const keyHash = deterministicHash(rawKey);

    let keyDoc = await AnalyticsKeyModel.findOne({ keyHash, status: "active" });

    if (!keyDoc) {
      const demoHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const rawDoc = await AnalyticsKeyModel.collection.findOne({
        $or: [{ hashedKey: demoHash }, { hashedKey: rawKey }],
        status: "active",
      } as any);

      if (rawDoc) {
        keyDoc = await AnalyticsKeyModel.findById(rawDoc._id);
      }
    }

    if (!keyDoc) {
      logSecurityEvent("Invalid Legacy Key", req, rawKey);
      res.status(401).json({ error: "Invalid or revoked API key" });
      return;
    }

    const origin = req.headers.origin;
    if (keyDoc.allowedOrigins && keyDoc.allowedOrigins.length > 0 && origin) {
      try {
        const parsedOrigin = new URL(origin).origin;
        const localhostOrigin =
          parsedOrigin.includes("localhost") ||
          parsedOrigin.includes("127.0.0.1");

        if (!localhostOrigin) {
          const isAllowed = keyDoc.allowedOrigins.some((allowed) => {
            if (allowed === "*") return true;
            const cleanAllowed = allowed.replace(/\/$/, "").trim();
            if (cleanAllowed === parsedOrigin) return true;
            if (cleanAllowed.startsWith("*.")) {
              const suffix = cleanAllowed.slice(2);
              return parsedOrigin.endsWith(suffix);
            }
            return false;
          });

          if (!isAllowed) {
            logSecurityEvent("Legacy Origin Mismatch", req, rawKey);
            res.status(403).json({
              error: `Origin '${origin}' is not allowed for this SDK Key`,
            });
            return;
          }
        }
      } catch {
        res.status(400).json({ error: "Invalid Origin header format" });
        return;
      }
    }

    const UserModel = (await import("../models/user.model.js")).default;
    const user = await UserModel.findById(keyDoc.userId);
    if (!user) {
      logSecurityEvent("Legacy Owner Not Found", req, rawKey);
      res.status(401).json({ error: "API key owner not found" });
      return;
    }

    req.user = user;
    req.analyticsKey = keyDoc;
    req.apiKeyId = keyDoc._id.toString();

    if (origin) {
      setCorsHeaders(res, origin);
    }

    next();
  } catch (error) {
    logger.error(
      "SDK Auth Middleware Error:",
      error instanceof Error ? error : new Error(String(error)),
    );
    res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
};

// ---------------------------------------------------------------------------
// Unified SDK middleware
// ---------------------------------------------------------------------------

export const validateSdkKeyUnified = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (req.sdkIntegration) {
    const integration = req.sdkIntegration;

    if (integration.status === "disabled") {
      logSecurityEvent("Disabled Integration", req, extractRawKey(req), {
        id: integration._id.toString(),
      });
      res
        .status(403)
        .json({ error: "This SDK integration has been disabled." });
      return;
    }
    if (integration.status === "revoked") {
      logSecurityEvent("Revoked Integration", req, extractRawKey(req), {
        id: integration._id.toString(),
      });
      res.status(403).json({ error: "This SDK key has been revoked." });
      return;
    }

    let authError: string | null = null;
    const strategy = authStrategies.find((s) => s.supports(req));
    if (strategy) {
      authError = await strategy.authenticate(req, integration);
    }

    if (authError) {
      logSecurityEvent("Origin Mismatch", req, extractRawKey(req), {
        error: authError,
      });
      res.status(403).json({ error: authError });
      return;
    }

    if (req.headers.origin) {
      setCorsHeaders(res, req.headers.origin);
    }

    const user = await sdkIntegrationService.resolveTenant(
      integration.tenantId,
    );
    if (!user) {
      logSecurityEvent("Owner Not Found", req, extractRawKey(req));
      res.status(401).json({ error: "Integration owner not found" });
      return;
    }

    req.user = user;
    req.apiKeyId = integration._id.toString();

    void sdkIntegrationService
      .touchConnection(integration._id.toString(), {
        latestOrigin: req.headers.origin,
        sdkVersion: req.body?.sdkVersion as string | undefined,
        touchRuntime: req.path.includes("/runtime"),
        touchEvent: req.path.includes("/track"),
        touchHeartbeat: true,
      })
      .catch(() => {});

    next();
    return;
  }

  const rawKey = extractRawKey(req);

  if (!rawKey || typeof rawKey !== "string") {
    logSecurityEvent("Missing Key", req);
    res.status(401).json({
      error:
        "SDK key is required in Authorization Bearer, x-api-key header, or sdkKey body field",
    });
    return;
  }

  try {
    const keyHash = deterministicHash(rawKey);
    console.log("[DEBUG AUTH] Incoming rawKey:", rawKey);
    console.log("[DEBUG AUTH] Computed keyHash:", keyHash);
    const integration = await sdkIntegrationService.resolveByKeyHash(keyHash);
    console.log("[DEBUG AUTH] Found integration:", integration ? integration.name : "NONE");


    if (integration) {
      if (integration.status === "disabled") {
        logSecurityEvent("Disabled Integration", req, rawKey, {
          id: integration._id.toString(),
        });
        res
          .status(403)
          .json({ error: "This SDK integration has been disabled." });
        return;
      }
      if (integration.status === "revoked") {
        logSecurityEvent("Revoked Integration", req, rawKey, {
          id: integration._id.toString(),
        });
        res.status(403).json({ error: "This SDK key has been revoked." });
        return;
      }

      let authError: string | null = null;
      const strategy = authStrategies.find((s) => s.supports(req));
      if (strategy) {
        authError = await strategy.authenticate(req, integration);
      }

      if (authError) {
        logSecurityEvent("Origin Mismatch", req, rawKey, { error: authError });
        res.status(403).json({ error: authError });
        return;
      }

      if (req.headers.origin) {
        setCorsHeaders(res, req.headers.origin);
      }

      const user = await sdkIntegrationService.resolveTenant(
        integration.tenantId,
      );
      if (!user) {
        logSecurityEvent("Owner Not Found", req, rawKey);
        res.status(401).json({ error: "Integration owner not found" });
        return;
      }

      req.user = user;
      req.sdkIntegration = integration;
      req.apiKeyId = integration._id.toString();

      void sdkIntegrationService
        .touchConnection(integration._id.toString(), {
          latestOrigin: req.headers.origin,
          sdkVersion: req.body?.sdkVersion as string | undefined,
          touchRuntime: req.path.includes("/runtime"),
          touchEvent: req.path.includes("/track"),
          touchHeartbeat: true,
        })
        .catch(() => {});

      next();
      return;
    }

    await validateSdkApiKey(req, res, next);
  } catch (error) {
    logger.error(
      "Unified SDK Auth Error:",
      error instanceof Error ? error : new Error(String(error)),
    );
    res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
};

export const sdkRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 300, // limit each SDK Integration key/hash or IP to 300 requests/min
  keyGenerator: (req: Request) => {
    return (
      req.sdkIntegration?._id.toString() ||
      extractRawKey(req) ||
      (req as any)["ip"]
    );
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: "Too many requests. Please try again later.",
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.method === "OPTIONS", // Preflight is stateless and doesn't count
});
