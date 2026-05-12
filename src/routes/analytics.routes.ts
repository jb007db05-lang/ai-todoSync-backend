import { Router } from "express";
import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { validateSdkApiKey } from "../middleware/sdkAuth.middleware.js";
import apiKeyController from "../controllers/apiKey.controller.js";
import trackingController from "../controllers/tracking.controller.js";
import analyticsDataController from "../controllers/analyticsData.controller.js";
import semanticAnalyticsController from "../controllers/semantic-analytics.controller.js";
import mcpController from "../controllers/mcp.controller.js";

class AnalyticsRoutes implements Routes {
  public path = "/api"; // Using /api as the base path for these routes
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
    this.router.post("/batch", validateSdkApiKey, trackingController.batch);
    this.router.post(
      "/identify",
      validateSdkApiKey,
      trackingController.identify,
    );
    this.router.post("/alias", validateSdkApiKey, trackingController.alias);
    this.router.post("/page", validateSdkApiKey, trackingController.page);
    this.router.post(
      "/identify-track",
      validateSdkApiKey,
      trackingController.identifyTrack,
    );
    this.router.get("/config", validateSdkApiKey, trackingController.config);

    // 3. DATA FETCHING (Protected by JWT)
    this.router.get(
      "/analytics/events",
      authMiddleware,
      analyticsDataController.getEvents,
    );
    this.router.get(
      "/analytics/events/:eventId/logs",
      authMiddleware,
      analyticsDataController.getEventLogs,
    );
    this.router.get(
      "/analytics/all-logs",
      authMiddleware,
      analyticsDataController.getAllLogs,
    );
    this.router.get(
      "/analytics/users",
      authMiddleware,
      analyticsDataController.getUsers,
    );
    this.router.get(
      "/analytics/users/:identifier/events",
      authMiddleware,
      analyticsDataController.getUserEvents,
    );

    // 4. SEMANTIC ANALYTICS (Protected by JWT, controlled metric API)
    this.router.get(
      "/analytics/metrics",
      authMiddleware,
      semanticAnalyticsController.listMetrics,
    );
    this.router.get(
      "/analytics/metrics/:metric",
      authMiddleware,
      semanticAnalyticsController.describeMetric,
    );
    this.router.post(
      "/analytics/query-metric",
      authMiddleware,
      semanticAnalyticsController.queryMetric,
    );
    this.router.post(
      "/analytics/compare-metrics",
      authMiddleware,
      semanticAnalyticsController.compareMetrics,
    );
    this.router.post(
      "/analytics/drilldown-metric",
      authMiddleware,
      semanticAnalyticsController.drilldownMetric,
    );
    this.router.post(
      "/analytics/explain-metric",
      authMiddleware,
      semanticAnalyticsController.explainMetric,
    );
    this.router.post(
      "/analytics/replay-timeline",
      authMiddleware,
      semanticAnalyticsController.replayTimeline,
    );
    this.router.get(
      "/analytics/anomalies",
      authMiddleware,
      semanticAnalyticsController.listAnomalies,
    );
    this.router.get(
      "/analytics/trends",
      authMiddleware,
      semanticAnalyticsController.trends,
    );
    this.router.get(
      "/analytics/lineage/:metric",
      authMiddleware,
      semanticAnalyticsController.lineage,
    );
    this.router.get(
      "/analytics/governance/:metric",
      authMiddleware,
      semanticAnalyticsController.governance,
    );
    this.router.post(
      "/analytics/reasoning-summary",
      authMiddleware,
      semanticAnalyticsController.reasoningSummary,
    );
    this.router.post(
      "/analytics/rollup-snapshot",
      authMiddleware,
      semanticAnalyticsController.writeRollupSnapshot,
    );
    this.router.post(
      "/analytics/dashboard-opened",
      authMiddleware,
      semanticAnalyticsController.recordDashboardOpened,
    );
    this.router.post(
      "/analytics/forecast",
      authMiddleware,
      semanticAnalyticsController.forecast,
    );
    this.router.post(
      "/analytics/simulate",
      authMiddleware,
      semanticAnalyticsController.simulate,
    );

    // 5. MCP-COMPATIBLE AI TOOL LAYER (Protected by JWT, AI-safe only)
    // AI assistants discover governed tools here, never raw DB.
    this.router.get("/mcp/tools", authMiddleware, mcpController.listTools);
    this.router.post(
      "/mcp/tools/:tool",
      authMiddleware,
      mcpController.callTool,
    );
  }
}

export default AnalyticsRoutes;
