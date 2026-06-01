import type { Request, Response, NextFunction } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import { validateSdkApiKey } from "../../middleware/sdkAuth.middleware.js";
import { AppError } from "../../utils/app-error.js";

export const getTenantIdFromRequest = (req: Request): string => {
  const userId = req.user?._id?.toString();

  if (!userId) {
    throw new AppError(401, "Authentication required", "AUTH_REQUIRED");
  }

  return userId;
};

export const requireEngagementAdmin = authMiddleware;

export const requireEngagementSdk = validateSdkApiKey;

export const optionalEngagementAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const hasSdkKey =
    typeof req.headers.authorization === "string" ||
    typeof req.headers["x-api-key"] === "string" ||
    (typeof req.body === "object" && req.body != null && "apiKey" in req.body);

  if (hasSdkKey) {
    await validateSdkApiKey(req, res, next);
    return;
  }

  await authMiddleware(req, res, next);
};
