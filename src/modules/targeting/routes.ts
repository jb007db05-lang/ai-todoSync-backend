import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import targetingController from "./controller.js";
import { requireTargetingAdmin } from "./permissions.js";

class TargetingRoutes implements Routes {
  public path = "/api/targeting";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(requireTargetingAdmin);
    this.router.get("/segments", targetingController.listSegments);
    this.router.post("/segments", targetingController.createSegment);
    this.router.patch(
      "/segments/:segmentId",
      targetingController.updateSegment,
    );
    this.router.delete(
      "/segments/:segmentId",
      targetingController.deleteSegment,
    );
    this.router.post("/evaluate", targetingController.evaluate);
  }
}

export default TargetingRoutes;
