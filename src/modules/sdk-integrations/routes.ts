import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import { validateSdkIntegrationKey } from "../../middleware/sdkAuth.middleware.js";
import sdkIntegrationController from "./controller.js";

class SdkIntegrationRoutes implements Routes {
  public path = "/api/sdk-integrations";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // ---- Admin portal routes (JWT auth) ----
    this.router.get("/", authMiddleware, sdkIntegrationController.list);
    this.router.get("/:id", authMiddleware, sdkIntegrationController.getOne);
    this.router.post("/", authMiddleware, sdkIntegrationController.create);
    this.router.patch("/:id", authMiddleware, sdkIntegrationController.update);
    this.router.delete("/:id", authMiddleware, sdkIntegrationController.delete);

    // Lifecycle actions
    this.router.post(
      "/:id/regenerate-key",
      authMiddleware,
      sdkIntegrationController.regenerateKey,
    );
    this.router.post(
      "/:id/disable",
      authMiddleware,
      sdkIntegrationController.disable,
    );
    this.router.post(
      "/:id/enable",
      authMiddleware,
      sdkIntegrationController.enable,
    );

    // ---- SDK-side routes (SDK key auth) ----
    this.router.post(
      "/sdk/heartbeat",
      validateSdkIntegrationKey,
      sdkIntegrationController.heartbeat,
    );
  }
}

export default SdkIntegrationRoutes;
