import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import guideAnalyticsController from "./controller.js";
import { requireGuideAnalyticsAdmin } from "./permissions.js";

class GuideAnalyticsRoutes implements Routes {
  public path = "/api/guide-analytics";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(requireGuideAnalyticsAdmin);
    this.router.get("/summary", guideAnalyticsController.summary);
  }
}

export default GuideAnalyticsRoutes;
