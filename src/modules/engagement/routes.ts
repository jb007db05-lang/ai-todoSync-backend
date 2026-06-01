import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import engagementController from "./controller.js";
import { requireEngagementAdmin, requireEngagementSdk } from "./permissions.js";

class EngagementRoutes implements Routes {
  public path = "/api/engagement";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post(
      "/runtime",
      requireEngagementAdmin,
      engagementController.runtime,
    );
    this.router.post(
      "/track",
      requireEngagementAdmin,
      engagementController.track,
    );
    this.router.get("/mtu", requireEngagementAdmin, engagementController.mtu);

    this.router.post(
      "/sdk/runtime",
      requireEngagementSdk,
      engagementController.runtime,
    );
    this.router.post(
      "/sdk/track",
      requireEngagementSdk,
      engagementController.track,
    );
  }
}

export default EngagementRoutes;
