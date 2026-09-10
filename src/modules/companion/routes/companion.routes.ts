import { Router } from "express";
import { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import {
  getCompanionDevices,
  generateCompanionKey,
  updateCompanionDeviceHandler,
  revokeCompanionDeviceHandler,
} from "../controllers/companion.controller.js";

class CompanionRoutes implements Routes {
  public path = "/api/companion";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.use(authMiddleware);

    this.router.get("/devices", getCompanionDevices);
    this.router.post("/key", generateCompanionKey);
    this.router.patch("/devices/:deviceId", updateCompanionDeviceHandler);
    this.router.delete("/devices/:deviceId", revokeCompanionDeviceHandler);
  }
}

export default CompanionRoutes;
