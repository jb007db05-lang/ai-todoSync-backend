import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import guideController from "./controller.js";
import { requireGuideAdmin } from "./permissions.js";

class GuideRoutes implements Routes {
  public path = "/api/guides";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(requireGuideAdmin);
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
