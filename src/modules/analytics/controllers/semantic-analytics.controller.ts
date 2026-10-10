import type { Request, Response } from "express";

import semanticAnalyticsService, {
  type DrilldownInput,
  type MetricQueryInput,
} from "../services/semantic-analytics.service.js";
import semanticOperationalIntelligenceService, {
  type IntelligenceQueryInput,
} from "../services/semantic-operational-intelligence.service.js";
import insightsService from "../services/insights.service.js";
import semanticIntelligenceService from "../../ai/services/semantic-intelligence.service.js";
import projectService from "../../project/services/project.service.js";
import { getWorkspaceAccess } from "../../access/access.middleware.js";

/**
 * Insights API. Routes run after authMiddleware + workspaceContext, and every
 * query is limited to the projects the caller can open in the active
 * workspace. Errors go to the global error middleware.
 */

const userIdOf = (req: Request) => req.user!._id.toString();
const workspaceIdOf = (req: Request) => getWorkspaceAccess(req).workspaceId;
const str = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;

/** Request body scoped to the active workspace. */
const scoped = <T extends object>(req: Request): T => ({
  ...((req.body ?? {}) as T),
  workspaceId: workspaceIdOf(req),
});

const queryInput = (req: Request): IntelligenceQueryInput => ({
  filters: {
    projectId: str(req.query.projectId),
    userId: str(req.query.userId),
  },
  timeRange: req.query.timeRange as IntelligenceQueryInput["timeRange"],
  workspaceId: workspaceIdOf(req),
});

const ops = semanticOperationalIntelligenceService;

class SemanticAnalyticsController {
  /** The Insights page: tasks, hours and prompt usage in one response. */
  public insights = async (req: Request, res: Response) => {
    res.json({
      data: await insightsService.overview(getWorkspaceAccess(req), {
        timeRange: str(req.query.timeRange),
        projectId: str(req.query.projectId),
      }),
    });
  };

  public listMetrics = async (req: Request, res: Response) => {
    const metrics = await semanticAnalyticsService.listMetrics(userIdOf(req), {
      aiVisibleOnly: req.query.aiVisible === "true",
      workspaceId: workspaceIdOf(req),
    });
    res.json({ message: "Semantic metrics fetched", data: { metrics } });
  };

  public describeMetric = async (req: Request, res: Response) => {
    const data = await semanticAnalyticsService.describeMetric(
      userIdOf(req),
      String(req.params.metric),
      workspaceIdOf(req),
    );
    res.json({ message: "Metric described", data });
  };

  public queryMetric = async (req: Request, res: Response) => {
    const data = await semanticAnalyticsService.queryMetric(
      userIdOf(req),
      scoped<MetricQueryInput>(req),
    );
    res.json({ message: "Metric queried", data });
  };

  public compareMetrics = async (req: Request, res: Response) => {
    const metrics = Array.isArray(req.body?.metrics)
      ? (req.body.metrics as MetricQueryInput[])
      : [];
    const data = await semanticAnalyticsService.compareMetrics(
      userIdOf(req),
      metrics.map((m) => ({ ...m, workspaceId: workspaceIdOf(req) })),
    );
    res.json({ message: "Metrics compared", data });
  };

  public drilldownMetric = async (req: Request, res: Response) => {
    const data = await semanticAnalyticsService.drilldownMetric(
      userIdOf(req),
      scoped<DrilldownInput>(req),
    );
    res.json({ message: "Metric drilldown queried", data });
  };

  public recordDashboardOpened = async (req: Request, res: Response) => {
    await semanticAnalyticsService.recordDashboardOpened(
      userIdOf(req),
      req.body?.projectId ?? null,
    );
    res.status(202).json({ message: "Dashboard event accepted" });
  };

  public explainMetric = async (req: Request, res: Response) => {
    res.json({
      message: "Metric explained",
      data: await ops.explainMetric(userIdOf(req), scoped(req)),
    });
  };

  public replayTimeline = async (req: Request, res: Response) => {
    res.json({
      message: "Timeline replayed",
      data: await ops.replayTimeline(userIdOf(req), scoped(req)),
    });
  };

  public listAnomalies = async (req: Request, res: Response) => {
    res.json({
      message: "Anomalies fetched",
      data: await ops.listAnomalies(userIdOf(req), queryInput(req)),
    });
  };

  public trends = async (req: Request, res: Response) => {
    res.json({
      message: "Trends fetched",
      data: await ops.trends(userIdOf(req), queryInput(req)),
    });
  };

  public lineage = async (req: Request, res: Response) => {
    const data = await ops.lineage(
      userIdOf(req),
      String(req.params.metric),
      workspaceIdOf(req),
    );
    res.json({ message: "Metric lineage fetched", data });
  };

  public governance = async (req: Request, res: Response) => {
    const data = await ops.governance(
      userIdOf(req),
      String(req.params.metric),
      workspaceIdOf(req),
    );
    res.json({ message: "Metric governance fetched", data });
  };

  public reasoningSummary = async (req: Request, res: Response) => {
    res.json({
      message: "Summary generated",
      data: await ops.reasoningSummary(userIdOf(req), scoped(req)),
    });
  };

  public forecast = async (req: Request, res: Response) => {
    res.json({
      message: "Forecast generated",
      data: await ops.forecast(userIdOf(req), scoped(req)),
    });
  };

  public simulate = async (req: Request, res: Response) => {
    res.json({
      message: "Intervention simulated",
      data: await ops.simulate(userIdOf(req), scoped(req)),
    });
  };

  public writeRollupSnapshot = async (req: Request, res: Response) => {
    res.json({
      message: "Rollup snapshot written",
      data: await ops.writeRollupSnapshot(userIdOf(req), scoped(req)),
    });
  };

  public getProjectReport = async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    // The report reads project data: the caller must be able to open the project.
    await projectService.getProjectAccess(userIdOf(req), projectId);
    const report = await semanticIntelligenceService.generateReport(projectId);
    res.json({ message: "Project report generated", report });
  };
}

export default new SemanticAnalyticsController();
