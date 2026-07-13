import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import env from "../../config/env.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import { validateSdkKeyUnified } from "../../middleware/sdkAuth.middleware.js";
import { AppError } from "../../utils/app-error.js";

export const getTenantIdFromRequest = (req: Request): string => {
  const userId = req.user?._id?.toString();

  if (!userId) {
    throw new AppError(401, "Authentication required", "AUTH_REQUIRED");
  }

  return userId;
};

export const requireEngagementAdmin = authMiddleware;

export const requireEngagementSdk = validateSdkKeyUnified;

// Helper to determine if a bearer token is a valid user JWT
const isUserJwt = (token: string): boolean => {
  try {
    jwt.verify(token, env.JWT_SECRET);
    return true;
  } catch {
    return false;
  }
};

export const optionalEngagementAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authorizationHeader = req.headers.authorization;
  const bearerToken =
    typeof authorizationHeader === "string" &&
    authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length).trim()
      : undefined;

  // If the request carries a bearer token that is verified as a valid user JWT,
  // we bypass SDK validation and route directly to standard user authentication.
  if (bearerToken && isUserJwt(bearerToken)) {
    await authMiddleware(req, res, next);
    return;
  }

  const hasSdkKey =
    typeof authorizationHeader === "string" ||
    typeof req.headers["x-api-key"] === "string" ||
    (typeof req.body === "object" && req.body != null && ("apiKey" in req.body || "sdkKey" in req.body));

  if (hasSdkKey) {
    await validateSdkKeyUnified(req, res, next);
    return;
  }

  await authMiddleware(req, res, next);
};
