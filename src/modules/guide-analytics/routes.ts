import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import { requireSdkIntegrationAccess } from "../../middleware/sdkIntegrationAuth.middleware.js";
import guideAnalyticsController from "./controller.js";

class GuideAnalyticsRoutes implements Routes {
  public path = "/api";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get(
      "/sdk-integrations/:sdkIntegrationId/guide-analytics/summary",
      authMiddleware,
      requireSdkIntegrationAccess,
      guideAnalyticsController.summary,
    );
  }
}

export default GuideAnalyticsRoutes;
