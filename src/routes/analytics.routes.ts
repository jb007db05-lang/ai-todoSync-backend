import { Router } from "express";
import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { validateSdkApiKey } from "../middleware/sdkAuth.middleware.js";
import apiKeyController from "../controllers/apiKey.controller.js";
import trackingController from "../controllers/tracking.controller.js";
import analyticsDataController from "../controllers/analyticsData.controller.js";

class AnalyticsRoutes implements Routes {
  public path = "/api/events"; // Using /api as the base path for these routes
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 1. API KEY MANAGEMENT (Protected by JWT)
    this.router.post("/keys", authMiddleware, apiKeyController.createKey);
    this.router.get("/keys", authMiddleware, apiKeyController.listKeys);
    this.router.delete("/keys/:id", authMiddleware, apiKeyController.deleteKey);

    // 2. EVENT TRACKING (Protected by Dedicated SDK API Key validation)
    this.router.post("/track", validateSdkApiKey, trackingController.track);
    this.router.post("/identify-track", validateSdkApiKey, trackingController.identifyTrack);

    // 3. DATA FETCHING (Protected by JWT)
    this.router.get("/analytics/events", authMiddleware, analyticsDataController.getEvents);
    this.router.get("/analytics/events/:eventId/logs", authMiddleware, analyticsDataController.getEventLogs);
    this.router.get("/analytics/users", authMiddleware, analyticsDataController.getUsers);
    this.router.get("/analytics/users/:identifier/events", authMiddleware, analyticsDataController.getUserEvents);
  }
}

export default AnalyticsRoutes;
