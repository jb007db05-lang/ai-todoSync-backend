import type { Request, Response } from "express";

import type { IUserDocument } from "../models/user.model.js";
import semanticAnalyticsService, {
  type DrilldownInput,
  type MetricQueryInput,
} from "../services/semantic-analytics.service.js";
import semanticOperationalIntelligenceService, {
  type IntelligenceQueryInput,
} from "../services/semantic-operational-intelligence.service.js";

type AuthenticatedRequest = Request & { user?: IUserDocument };

class SemanticAnalyticsController {
  public listMetrics = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const metrics = await semanticAnalyticsService.listMetrics(
        user._id.toString(),
        { aiVisibleOnly: req.query.aiVisible === "true" },
      );
      res.status(200).json({
        message: "Semantic metrics fetched",
        data: { metrics },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public describeMetric = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const description = await semanticAnalyticsService.describeMetric(
        user._id.toString(),
        req.params.metric as string,
      );
      res.status(200).json({ message: "Metric described", data: description });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public queryMetric = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticAnalyticsService.queryMetric(
        user._id.toString(),
        req.body as MetricQueryInput,
      );
      res.status(200).json({ message: "Metric queried", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public compareMetrics = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticAnalyticsService.compareMetrics(
        user._id.toString(),
        req.body?.metrics as MetricQueryInput[],
      );
      res.status(200).json({ message: "Metrics compared", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public drilldownMetric = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticAnalyticsService.drilldownMetric(
        user._id.toString(),
        req.body as DrilldownInput,
      );
      res
        .status(200)
        .json({ message: "Metric drilldown queried", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public recordDashboardOpened = async (
    req: AuthenticatedRequest,
    res: Response,
  ) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      await semanticAnalyticsService.recordDashboardOpened(
        user._id.toString(),
        req.body?.projectId ?? null,
      );
      res.status(202).json({ message: "Dashboard event accepted" });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public explainMetric = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticOperationalIntelligenceService.explainMetric(
        user._id.toString(),
        req.body as IntelligenceQueryInput,
      );
      res.status(200).json({ message: "Metric explained", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public replayTimeline = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result =
        await semanticOperationalIntelligenceService.replayTimeline(
          user._id.toString(),
          req.body as IntelligenceQueryInput,
        );
      res
        .status(200)
        .json({ message: "Operational timeline replayed", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public listAnomalies = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticOperationalIntelligenceService.listAnomalies(
        user._id.toString(),
        {
          filters: this.queryFilters(req),
          timeRange: req.query.timeRange as IntelligenceQueryInput["timeRange"],
        },
      );
      res
        .status(200)
        .json({ message: "Operational anomalies fetched", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public trends = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticOperationalIntelligenceService.trends(
        user._id.toString(),
        {
          filters: this.queryFilters(req),
          timeRange: req.query.timeRange as IntelligenceQueryInput["timeRange"],
        },
      );
      res
        .status(200)
        .json({ message: "Operational trends fetched", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public lineage = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticOperationalIntelligenceService.lineage(
        user._id.toString(),
        req.params.metric as string,
      );
      res
        .status(200)
        .json({ message: "Semantic lineage fetched", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public governance = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticOperationalIntelligenceService.governance(
        user._id.toString(),
        req.params.metric as string,
      );
      res
        .status(200)
        .json({ message: "Semantic governance fetched", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public reasoningSummary = async (
    req: AuthenticatedRequest,
    res: Response,
  ) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result =
        await semanticOperationalIntelligenceService.reasoningSummary(
          user._id.toString(),
          req.body as IntelligenceQueryInput,
        );
      res
        .status(200)
        .json({ message: "Operational reasoning summarized", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public forecast = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticOperationalIntelligenceService.forecast(
        user._id.toString(),
        req.body as IntelligenceQueryInput,
      );
      res
        .status(200)
        .json({ message: "Operational forecast generated", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public simulate = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result = await semanticOperationalIntelligenceService.simulate(
        user._id.toString(),
        req.body as any,
      );
      res
        .status(200)
        .json({ message: "Operational intervention simulated", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  public writeRollupSnapshot = async (
    req: AuthenticatedRequest,
    res: Response,
  ) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const result =
        await semanticOperationalIntelligenceService.writeRollupSnapshot(
          user._id.toString(),
          req.body as IntelligenceQueryInput,
        );
      res
        .status(200)
        .json({ message: "Semantic rollup snapshot written", data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private queryFilters(req: AuthenticatedRequest) {
    return {
      projectId:
        typeof req.query.projectId === "string"
          ? req.query.projectId
          : undefined,
      userId:
        typeof req.query.userId === "string" ? req.query.userId : undefined,
    };
  }

  private handleError(res: Response, error: unknown) {
    const status = (error as any).status || 500;
    res.status(status).json({ error: (error as Error).message });
  }
}

export default new SemanticAnalyticsController();
