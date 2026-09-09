import semanticAnalyticsService, {
  type DrilldownInput,
  type MetricQueryInput,
} from "./semantic-analytics.service.js";
import semanticOperationalIntelligenceService, {
  type IntelligenceQueryInput,
  type TimeRange,
  type MetricScopeFilters,
  type OperationalSimulation,
} from "./semantic-operational-intelligence.service.js";

type ToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  aiSafe: boolean;
};

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
    dimensions: {
      type: "array",
      items: { type: "string" },
    },
  },
};

class SemanticMcpToolsService {
  public listTools(): ToolSchema[] {
    return [
      {
        name: "list_metrics",
        description: "List AI-visible governed semantic metrics only.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        outputSchema: {
          type: "object",
          properties: { metrics: { type: "array" } },
        },
        aiSafe: true,
      },
      {
        name: "describe_metric",
        description: "Describe one governed semantic metric contract.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["metric"],
          properties: { metric: { type: "string" } },
        },
        outputSchema: { type: "object" },
        aiSafe: true,
      },
      {
        name: "query_metric",
        description:
          "Query one trusted semantic metric through server validation.",
        inputSchema: metricQuerySchema,
        outputSchema: { type: "object" },
        aiSafe: true,
      },
      {
        name: "compare_metrics",
        description:
          "Query 1 to 6 trusted semantic metrics through server validation.",
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
        outputSchema: { type: "object" },
        aiSafe: true,
      },
      {
        name: "drilldown_metric",
        description:
          "Return sanitized contributing entities for declared drilldowns.",
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
                  enum: [
                    "createdAt",
                    "updatedAt",
                    "date",
                    "priority",
                    "status",
                  ],
                },
                direction: { type: "string", enum: ["asc", "desc"] },
              },
            },
          },
        },
        outputSchema: { type: "object" },
        aiSafe: true,
      },
      {
        name: "explain_metric",
        description:
          "Explain causal semantic factors for an operational metric.",
        inputSchema: metricQuerySchema,
        outputSchema: { type: "object" },
        aiSafe: true,
      },
      {
        name: "replay_operational_timeline",
        description:
          "Replay authorized operational event timeline with causal signals.",
        inputSchema: metricQuerySchema,
        outputSchema: { type: "object" },
        aiSafe: true,
      },
      {
        name: "forecast_operational_state",
        description:
          "Project future trajectory for an operational metric across 7, 14, and 30-day horizons.",
        inputSchema: metricQuerySchema,
        outputSchema: { type: "object" },
        aiSafe: true,
      },
      {
        name: "simulate_operational_intervention",
        description:
          "Simulate impact of specific interventions (reduce_blockers, etc) on an operational metric.",
        inputSchema: {
          ...metricQuerySchema,
          required: [...metricQuerySchema.required, "intervention"],
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
        outputSchema: { type: "object" },
        aiSafe: true,
      },
    ];
  }

  public async list_metrics(userId: string) {
    return {
      metrics: await semanticAnalyticsService.listMetrics(userId, {
        aiVisibleOnly: true,
      }),
    };
  }

  public async describe_metric(userId: string, input: { metric: string }) {
    return semanticAnalyticsService.describeMetric(userId, input.metric);
  }

  public async query_metric(userId: string, input: MetricQueryInput) {
    return semanticAnalyticsService.queryMetric(userId, input);
  }

  public async compare_metrics(
    userId: string,
    input: { metrics: MetricQueryInput[] },
  ) {
    return semanticAnalyticsService.compareMetrics(userId, input.metrics);
  }

  public async drilldown_metric(userId: string, input: DrilldownInput) {
    return semanticAnalyticsService.drilldownMetric(userId, input);
  }

  public async explain_metric(userId: string, input: IntelligenceQueryInput) {
    return semanticOperationalIntelligenceService.explainMetric(userId, input);
  }

  public async replay_operational_timeline(
    userId: string,
    input: IntelligenceQueryInput,
  ) {
    return semanticOperationalIntelligenceService.replayTimeline(userId, input);
  }

  public async forecast_operational_state(
    userId: string,
    input: IntelligenceQueryInput,
  ) {
    return semanticOperationalIntelligenceService.forecast(userId, input);
  }

  public async simulate_operational_intervention(
    userId: string,
    input: {
      metric: string;
      filters: MetricScopeFilters;
      timeRange: TimeRange;
      intervention: OperationalSimulation["intervention"];
    },
  ) {
    return semanticOperationalIntelligenceService.simulate(userId, input);
  }
}

export default new SemanticMcpToolsService();
