import type { Request, Response } from "express";

import type { IUserDocument } from "../models/user.model.js";
import semanticMcpToolsService from "../services/semantic-mcp-tools.service.js";
import type { MetricQueryInput } from "../services/semantic-analytics.service.js";
import type { IntelligenceQueryInput } from "../services/semantic-operational-intelligence.service.js";

type AuthenticatedRequest = Request & { user?: IUserDocument };

// The set of tools that are safe to call through the HTTP endpoint.
// All must have aiSafe: true in the tool registry.
const AI_SAFE_TOOLS = new Set([
  "list_metrics",
  "describe_metric",
  "query_metric",
  "compare_metrics",
  "drilldown_metric",
  "explain_metric",
  "replay_operational_timeline",
]);

class McpController {
  public listTools = async (_req: Request, res: Response) => {
    const tools = semanticMcpToolsService.listTools();
    res.status(200).json({
      message: "MCP tool manifest",
      data: {
        tools: tools.filter((tool) => tool.aiSafe),
        protocolVersion: "2024-11-05",
        serverName: "task-manager-semantic-intelligence",
        semanticLayer: "governed",
        note: "All tools route through server-side semantic validation and authorization. Raw DB access is not exposed.",
      },
    });
  };

  public callTool = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const toolName = req.params.tool as string;
      if (!AI_SAFE_TOOLS.has(toolName)) {
        res.status(404).json({ error: "Tool not found or not AI-safe" });
        return;
      }

      const userId = user._id.toString();
      const input = req.body ?? {};
      let result: unknown;

      switch (toolName) {
        case "list_metrics":
          result = await semanticMcpToolsService.list_metrics(userId);
          break;
        case "describe_metric":
          result = await semanticMcpToolsService.describe_metric(
            userId,
            input as { metric: string },
          );
          break;
        case "query_metric":
          result = await semanticMcpToolsService.query_metric(
            userId,
            input as MetricQueryInput,
          );
          break;
        case "compare_metrics":
          result = await semanticMcpToolsService.compare_metrics(
            userId,
            input as { metrics: MetricQueryInput[] },
          );
          break;
        case "drilldown_metric":
          result = await semanticMcpToolsService.drilldown_metric(
            userId,
            input as any,
          );
          break;
        case "explain_metric":
          result = await semanticMcpToolsService.explain_metric(
            userId,
            input as IntelligenceQueryInput,
          );
          break;
        case "replay_operational_timeline":
          result = await semanticMcpToolsService.replay_operational_timeline(
            userId,
            input as IntelligenceQueryInput,
          );
          break;
        default:
          res.status(404).json({ error: "Tool not found" });
          return;
      }

      res.status(200).json({
        message: "MCP tool result",
        tool: toolName,
        data: result,
        semanticLayer: "governed",
        aiSafe: true,
      });
    } catch (error) {
      const status = (error as any).status ?? 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new McpController();
