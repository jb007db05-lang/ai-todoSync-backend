import { Router } from "express";
import { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import {
  validateSdkKeyUnified,
  sdkAuthHandshakeLimiter,
} from "../../../middleware/sdkAuth.middleware.js";
import { requireSdkIntegrationAccess } from "../../../middleware/sdkIntegrationAuth.middleware.js";
import apiKeyController from "../../../modules/auth/controllers/apiKey.controller.js";
import trackingController from "../../../modules/analytics/controllers/tracking.controller.js";
import analyticsDataController from "../../../modules/analytics/controllers/analyticsData.controller.js";
import semanticAnalyticsController from "../../../modules/analytics/controllers/semantic-analytics.controller.js";
import mcpController from "../../../modules/ai/controllers/mcp.controller.js";
import sdkAuthController from "../../../modules/sdk/controllers/sdkAuth.controller.js";
import {
  requirePermission,
  workspaceContext,
} from "../../access/access.middleware.js";

// Insights: workspace-scoped and permission-gated. Clients that send no
// X-Workspace-Id (MCP tools, older apps) use their default workspace.
const insightsView = [
  authMiddleware,
  workspaceContext({ fallbackToDefault: true }),
  requirePermission("intelligence.view"),
];
const insightsAnalyze = [
  ...insightsView.slice(0, 2),
  requirePermission("intelligence.view", "intelligence.analyze"),
];

class AnalyticsRoutes implements Routes {
  public path = "/api"; // Using /api as the base path for these routes
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // 0. SDK AUTHENTICATION & SESSION MANAGEMENT
    this.router.post(
      "/sdk/authenticate",
      sdkAuthHandshakeLimiter,
      sdkAuthController.authenticate,
    );
    this.router.post(
      "/sdk/session/renew",
      validateSdkKeyUnified,
      sdkAuthController.renew,
    );
    this.router.post(
      "/sdk/session/revoke",
      validateSdkKeyUnified,
      sdkAuthController.revoke,
    );

    // 1. API KEY MANAGEMENT (Protected by JWT)
    this.router.post("/keys", authMiddleware, apiKeyController.createKey);
    this.router.get("/keys", authMiddleware, apiKeyController.listKeys);
    this.router.delete("/keys/:id", authMiddleware, apiKeyController.deleteKey);

    // 2. EVENT TRACKING (Protected by Dedicated SDK API Key validation)
    this.router.post("/track", validateSdkKeyUnified, trackingController.track);
    this.router.post("/batch", validateSdkKeyUnified, trackingController.batch);
    this.router.post(
      "/import",
      validateSdkKeyUnified,
      trackingController.importEvents,
    );
    this.router.post(
      "/identify",
      validateSdkKeyUnified,
      trackingController.identify,
    );
    this.router.post("/alias", validateSdkKeyUnified, trackingController.alias);
    this.router.post("/page", validateSdkKeyUnified, trackingController.page);
    this.router.post(
      "/identify-track",
      validateSdkKeyUnified,
      trackingController.identifyTrack,
    );
    this.router.get(
      "/config",
      validateSdkKeyUnified,
      trackingController.config,
    );

    // 3. DATA FETCHING — Legacy (apiKeyId-scoped, kept for backward compat)
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

    // 3b. DATA FETCHING — SDK Integration scoped (new architecture)
    this.router.get(
      "/sdk-integrations/:sdkIntegrationId/events",
      authMiddleware,
      requireSdkIntegrationAccess,
      analyticsDataController.getScopedEvents,
    );
    this.router.get(
      "/sdk-integrations/:sdkIntegrationId/events/:eventId/logs",
      authMiddleware,
      requireSdkIntegrationAccess,
      analyticsDataController.getScopedEventLogs,
    );
    this.router.get(
      "/sdk-integrations/:sdkIntegrationId/all-logs",
      authMiddleware,
      requireSdkIntegrationAccess,
      analyticsDataController.getScopedAllLogs,
    );
    this.router.get(
      "/sdk-integrations/:sdkIntegrationId/users",
      authMiddleware,
      requireSdkIntegrationAccess,
      analyticsDataController.getScopedUsers,
    );

    // 4. INSIGHTS (task, hours and prompt usage overview)
    this.router.get(
      "/analytics/insights",
      ...insightsView,
      semanticAnalyticsController.insights,
    );

    // 4b. SEMANTIC METRICS (Protected by JWT, controlled metric API)
    this.router.get(
      "/analytics/metrics",
      ...insightsView,
      semanticAnalyticsController.listMetrics,
    );
    this.router.get(
      "/analytics/metrics/:metric",
      ...insightsView,
      semanticAnalyticsController.describeMetric,
    );
    this.router.post(
      "/analytics/query-metric",
      ...insightsView,
      semanticAnalyticsController.queryMetric,
    );
    this.router.post(
      "/analytics/compare-metrics",
      ...insightsView,
      semanticAnalyticsController.compareMetrics,
    );
    this.router.post(
      "/analytics/drilldown-metric",
      ...insightsAnalyze,
      semanticAnalyticsController.drilldownMetric,
    );
    this.router.post(
      "/analytics/explain-metric",
      ...insightsAnalyze,
      semanticAnalyticsController.explainMetric,
    );
    this.router.post(
      "/analytics/replay-timeline",
      ...insightsAnalyze,
      semanticAnalyticsController.replayTimeline,
    );
    this.router.get(
      "/analytics/anomalies",
      ...insightsView,
      semanticAnalyticsController.listAnomalies,
    );
    this.router.get(
      "/analytics/trends",
      ...insightsView,
      semanticAnalyticsController.trends,
    );
    this.router.get(
      "/analytics/lineage/:metric",
      ...insightsView,
      semanticAnalyticsController.lineage,
    );
    this.router.get(
      "/analytics/governance/:metric",
      ...insightsView,
      semanticAnalyticsController.governance,
    );
    this.router.post(
      "/analytics/reasoning-summary",
      ...insightsView,
      semanticAnalyticsController.reasoningSummary,
    );
    this.router.post(
      "/analytics/rollup-snapshot",
      ...insightsAnalyze,
      semanticAnalyticsController.writeRollupSnapshot,
    );
    this.router.post(
      "/analytics/dashboard-opened",
      ...insightsView,
      semanticAnalyticsController.recordDashboardOpened,
    );
    this.router.post(
      "/analytics/forecast",
      ...insightsAnalyze,
      semanticAnalyticsController.forecast,
    );
    this.router.post(
      "/analytics/simulate",
      ...insightsAnalyze,
      semanticAnalyticsController.simulate,
    );
    this.router.get(
      "/analytics/projects/:projectId/report",
      ...insightsView,
      semanticAnalyticsController.getProjectReport,
    );

    // 5. MCP-COMPATIBLE AI TOOL LAYER (Protected by JWT, AI-safe only)
    // AI assistants discover governed tools here, never raw DB.
    this.router.get("/mcp/tools", ...insightsView, mcpController.listTools);
    this.router.post(
      "/mcp/tools/:tool",
      ...insightsView,
      mcpController.callTool,
    );
  }
}

export default AnalyticsRoutes;
