import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import engagementController from "./controller.js";
import { requireEngagementAdmin, requireEngagementSdk, optionalEngagementAuth } from "./permissions.js";
import { sdkRateLimiter } from "../../middleware/sdkAuth.middleware.js";

class EngagementRoutes implements Routes {
  public path = "/api/engagement";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post(
      "/runtime",
      optionalEngagementAuth,
      engagementController.runtime,
    );
    this.router.post(
      "/track",
      optionalEngagementAuth,
      engagementController.track,
    );
    this.router.get("/mtu", requireEngagementAdmin, engagementController.mtu);

    this.router.post(
      "/sdk/runtime",
      requireEngagementSdk,
      sdkRateLimiter,
      engagementController.runtime,
    );
    this.router.post(
      "/sdk/track",
      requireEngagementSdk,
      sdkRateLimiter,
      engagementController.track,
    );
  }
}

export default EngagementRoutes;
