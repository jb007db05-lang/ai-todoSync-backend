import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import { requireSdkIntegrationAccess } from "../../middleware/sdkIntegrationAuth.middleware.js";
import guideController from "./controller.js";

class GuideRoutes implements Routes {
  public path = "/api/sdk-integrations/:sdkIntegrationId/guides";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware, requireSdkIntegrationAccess);
    this.router.get("/", guideController.listGuides);
    this.router.post("/", guideController.createGuide);
    this.router.get("/:guideId", guideController.getGuide);
    this.router.patch("/:guideId", guideController.updateGuide);
    this.router.post("/:guideId/status/:status", guideController.updateStatus);
    this.router.delete("/:guideId", guideController.deleteGuide);
    this.router.get("/:guideId/analytics", guideController.analytics);
  }
}

export default GuideRoutes;
