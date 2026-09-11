/**
 * Analytics domain MCP tools.
 * Migrates the existing semantic analytics tools from semantic-mcp-tools.service.ts
 * into the centralized registry. Delegates to existing services — zero duplication.
 */

import toolRegistry from "../../registry/tool-registry.js";
import semanticMcpToolsService from "../../../analytics/services/semantic-mcp-tools.service.js";
import type {
  MetricQueryInput,
  DrilldownInput,
} from "../../../analytics/services/semantic-analytics.service.js";
import type { IntelligenceQueryInput } from "../../../analytics/services/semantic-operational-intelligence.service.js";

const metricQuerySchema = {
  type: "object",
  additionalProperties: false,
  required: ["metric"],
  properties: {
    metric: { type: "string" },
    timeRange: {
      type: "string",
      enum: [
        "today",
        "last_7_days",
        "last_30_days",
        "last_90_days",
        "all_time",
      ],
    },
    filters: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        userId: { type: "string" },
      },
    },
    dimensions: { type: "array", items: { type: "string" } },
  },
};

toolRegistry.register({
  name: "analytics:list_metrics",
  description:
    "List all AI-visible governed semantic metrics. Returns metric names, labels, and descriptions. Use before querying to discover available metrics.",
  domain: "analytics",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId) => semanticMcpToolsService.list_metrics(userId),
});

toolRegistry.register({
  name: "analytics:describe_metric",
  description:
    "Describe one governed semantic metric: its label, unit, dimensions, caveats, and freshness policy. Use to understand a metric before querying it.",
  domain: "analytics",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["metric"],
    properties: { metric: { type: "string" } },
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) =>
    semanticMcpToolsService.describe_metric(
      userId,
      input as { metric: string },
    ),
});

toolRegistry.register({
  name: "analytics:query_metric",
  description:
    "Query one trusted semantic metric through server-side validation. Returns time-series values for the requested timeRange and filters.",
  domain: "analytics",
  inputSchema: metricQuerySchema,
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) =>
    semanticMcpToolsService.query_metric(
      userId,
      input as unknown as MetricQueryInput,
    ),
});

toolRegistry.register({
  name: "analytics:compare_metrics",
  description:
    "Query 1 to 6 trusted semantic metrics simultaneously for comparison. Returns results for each metric in the same response.",
  domain: "analytics",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["metrics"],
    properties: {
      metrics: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: metricQuerySchema,
      },
    },
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) =>
    semanticMcpToolsService.compare_metrics(
      userId,
      input as { metrics: MetricQueryInput[] },
    ),
});

toolRegistry.register({
  name: "analytics:drilldown_metric",
  description:
    "Return sanitized contributing entities for declared drilldowns of a metric. Use to find which tasks, users, or projects drive a metric value.",
  domain: "analytics",
  inputSchema: {
    ...metricQuerySchema,
    properties: {
      ...metricQuerySchema.properties,
      drilldown: { type: "string" },
      pagination: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "number", minimum: 1, maximum: 50 },
          offset: { type: "number", minimum: 0, maximum: 5000 },
        },
      },
      sort: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: {
            type: "string",
            enum: ["createdAt", "updatedAt", "date", "priority", "status"],
          },
          direction: { type: "string", enum: ["asc", "desc"] },
        },
      },
    },
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) =>
    semanticMcpToolsService.drilldown_metric(
      userId,
      input as unknown as DrilldownInput,
    ),
});

toolRegistry.register({
  name: "analytics:explain_metric",
  description:
    "Explain the causal factors contributing to an operational metric. Returns factor breakdown with weights, direction, and natural-language explanation.",
  domain: "analytics",
  inputSchema: metricQuerySchema,
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) =>
    semanticMcpToolsService.explain_metric(
      userId,
      input as IntelligenceQueryInput,
    ),
});

toolRegistry.register({
  name: "analytics:replay_operational_timeline",
  description:
    "Replay the authorized operational event timeline with causal signals for a metric. Reveals the sequence of events that produced the current metric state.",
  domain: "analytics",
  inputSchema: metricQuerySchema,
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) =>
    semanticMcpToolsService.replay_operational_timeline(
      userId,
      input as IntelligenceQueryInput,
    ),
});

toolRegistry.register({
  name: "analytics:forecast_operational_state",
  description:
    "Project future trajectory for an operational metric across 7, 14, and 30-day horizons. Returns confidence intervals and trend signals.",
  domain: "analytics",
  inputSchema: metricQuerySchema,
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) =>
    semanticMcpToolsService.forecast_operational_state(
      userId,
      input as IntelligenceQueryInput,
    ),
});

toolRegistry.register({
  name: "analytics:simulate_operational_intervention",
  description:
    "Simulate the projected impact of a specific intervention (reduce_blockers, resolve_overdue, increase_throughput, stabilize_ownership) on an operational metric. Analysis only — does not execute any changes.",
  domain: "analytics",
  inputSchema: {
    ...metricQuerySchema,
    required: [...(metricQuerySchema.required ?? []), "intervention"],
    properties: {
      ...metricQuerySchema.properties,
      intervention: {
        type: "object",
        required: ["type", "intensity"],
        properties: {
          type: {
            type: "string",
            enum: [
              "reduce_blockers",
              "resolve_overdue",
              "increase_throughput",
              "stabilize_ownership",
            ],
          },
          intensity: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
  requiredScope: "analytics:read",
  risk: "read",
  handler: async (userId, input) =>
    semanticMcpToolsService.simulate_operational_intervention(
      userId,
      input as any,
    ),
});
