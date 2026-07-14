import type { Request, Response, NextFunction } from "express";
import SdkIntegrationModel from "../modules/sdk-integrations/model.js";
import { AppError } from "../utils/app-error.js";
import logger from "../lib/logger.js";

/**
 * Middleware that validates the authenticated user owns the :sdkIntegrationId
 * in the route parameters and attaches the integration to req.sdkIntegration.
 *
 * Must be used AFTER authMiddleware so req.user is populated.
 */
export const requireSdkIntegrationAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const integrationId =
      req.params.sdkIntegrationId ?? req.params.integrationId;

    if (!integrationId) {
      res.status(400).json({ error: "SDK Integration ID is required" });
      return;
    }

    const integration = await SdkIntegrationModel.findOne({
      _id: integrationId,
      tenantId: userId,
    }).exec();

    if (!integration) {
      logger.warn("SDK integration access denied", { userId, integrationId });
      res.status(403).json({
        error: "Access denied: integration not found or not owned by you",
      });
      return;
    }

    // Attach to request for downstream handlers
    req.sdkIntegration = integration;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error(
      "requireSdkIntegrationAccess error",
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Internal server error" });
  }
};
