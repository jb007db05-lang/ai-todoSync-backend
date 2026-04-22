import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import AnalyticsKeyModel from "../models/analytics-key.model.js";
import { deterministicHash } from "../utils/encryption.js";
import { findUserById } from "../repositories/auth.repository.js";

/**
 * Specialized middleware for SDK authentication.
 * Validates the X-API-KEY header and resolves the owner user.
 */
export const validateSdkApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authorizationHeader = req.headers.authorization;
  const bearerToken =
    typeof authorizationHeader === "string" &&
    authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length).trim()
      : undefined;
  const apiKey =
    bearerToken ||
    (req.headers["x-api-key"] as string) ||
    (req.body && req.body.apiKey);

  if (!apiKey || typeof apiKey !== "string") {
    return res
      .status(401)
      .json({
        error: "API key is required in Authorization or X-API-KEY header",
      });
  }

  try {
    const keyHash = deterministicHash(apiKey);

    // 1. Try high-performance deterministic lookup
    let keyDoc = await AnalyticsKeyModel.findOne({ keyHash, status: "active" });
    // 2. Fallback for legacy SHA-256 keys (like the demo key)
    if (!keyDoc) {
      const demoHash = crypto.createHash("sha256").update(apiKey).digest("hex");

      // We use raw driver to bypass Mongoose setters during fallback lookup
      const rawDoc = await AnalyticsKeyModel.collection.findOne({
        $or: [{ hashedKey: demoHash }, { hashedKey: apiKey }],
        status: "active",
      } as any);

      if (rawDoc) {
        keyDoc = await AnalyticsKeyModel.findById(rawDoc._id);
      }
    }

    if (!keyDoc) {
      return res.status(401).json({ error: "Invalid or revoked API key" });
    }

    // 3. Resolve the user who owns this key
    const user = await findUserById(keyDoc.userId);
    if (!user) {
      return res.status(100).json({ error: "API key owner not found" });
    }

    // Attach identity to request
    req.user = user;
    req.analyticsKey = keyDoc;
    req.apiKeyId = keyDoc._id.toString();

    next();
  } catch (error) {
    console.error("SDK Auth Middleware Error:", error);
    res
      .status(500)
      .json({ error: "Internal rver error during authentication" });
  }
};
