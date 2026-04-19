import { Router } from "express";
import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import analyticsController from "../controllers/analytics.controller.js";

class AnalyticsRoutes implements Routes {
  public path = "/api/analytics";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Public ingestion route (Uses X-API-Key)
    this.router.post("/events", analyticsController.ingestEvent);

    // Protected dashboard & management routes (Uses JWT)
    this.router.get("/keys", authMiddleware, analyticsController.listKeys);
    this.router.post("/keys", authMiddleware, analyticsController.generateKey);
    this.router.patch(
      "/keys/:id/revoke",
      authMiddleware,
      analyticsController.revokeKey,
    );
    this.router.patch(
      "/keys/:id/regenerate",
      authMiddleware,
      analyticsController.regenerateKey,
    );
    this.router.get("/stats", authMiddleware, analyticsController.getStats);
    this.router.get("/events", authMiddleware, analyticsController.listEvents);
  }
}

export default AnalyticsRoutes;
