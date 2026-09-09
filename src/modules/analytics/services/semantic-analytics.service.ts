import type { PipelineStage } from "mongoose";
import { Types } from "mongoose";

import OperationalAnalyticsEventModel from "../models/operational-analytics-event.model.js";
import ProjectMemberModel from "../../project/models/project-member.model.js";
import ProjectModel from "../../project/models/project.model.js";
import TaskModel from "../../task/models/task.model.js";
import logger from "../../../lib/logger.js";
import UserModel from "../../auth/models/user.model.js";
import { toObjectId } from "../../../utils/mongo-ref.js";
import operationalAnalyticsService from "./operational-analytics.service.js";

export type MetricName =
  | "active_users"
  | "tasks_created"
  | "tasks_completed"
  | "task_completion_rate"
  | "overdue_tasks"
  | "stale_tasks"
  | "avg_completion_time"
  | "project_health_score"
  | "tasks_completed_per_user"
  | "inactive_projects";

type TimeRange =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "all_time";

interface MetricFilters {
  projectId?: string;
  userId?: string;
}

export interface MetricQueryInput {
  metric: MetricName;
  filters?: MetricFilters;
  timeRange?: TimeRange;
  dimensions?: string[];
}

interface MetricDefinition {
  name: MetricName;
  label: string;
  description: string;
  dimensions: string[];
  filters: string[];
  category?: string;
  semanticType?: "state" | "event" | "hybrid";
  owner?: string;
  grain?: string;
  unit?: string;
  allowedDrilldowns?: string[];
  freshnessPolicy?: string;
  aggregationBehavior?: string;
  stability?: "experimental" | "stable" | "deprecated";
  version?: string;
  caveats?: string[];
  explainability?: string;
  resultSchema?: Record<string, string>;
  authorizationPolicy?: {
    roles?: Array<"ADMIN" | "MEMBER">;
    aiVisible?: boolean;
    requiresProjectScope?: boolean;
  };
  cachePolicy?: {
    ttlSeconds: number;
    strategy: "live" | "short_ttl" | "rollup_ready";
  };
  operationalMeaning?: string;
  semanticExamples?: string[];
  contributionStrategy?: string;
  query: (scope: QueryScope) => Promise<unknown>;
}

interface QueryScope {
  userId: string;
  accessibleProjectIds: string[];
  filters: MetricFilters;
  timeRange: TimeRange;
  startDate?: Date;
  endDate: Date;
}

export interface DrilldownInput extends MetricQueryInput {
  drilldown?: string;
  pagination?: {
    limit?: number;
    offset?: number;
  };
  sort?: {
    field?: string;
    direction?: "asc" | "desc";
  };
}

type ProjectRole = "ADMIN" | "MEMBER";

type TaskMatch = Record<string, any>;

const timeRanges: TimeRange[] = [
  "today",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "all_time",
];

const safeSortFields = new Set([
  "createdAt",
  "updatedAt",
  "date",
  "priority",
  "status",
]);
const maxDrilldownLimit = 50;

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class SemanticAnalyticsService {
  private readonly resultCache = new Map<
    string,
    { expiresAt: number; value: unknown; generatedAt: string }
  >();

  private readonly metricRegistry: Record<MetricName, MetricDefinition> = {
    active_users: {
      name: "active_users",
      label: "Active users",
      description: "Distinct users with operational analytics events in scope.",
      dimensions: ["projectId", "eventName"],
      filters: ["projectId", "userId", "timeRange"],
      semanticType: "event",
      unit: "users",
      resultSchema: { count: "number" },
      operationalMeaning:
        "How many people created meaningful operational events in authorized scope.",
      query: (scope) => this.queryActiveUsers(scope),
    },
    tasks_created: {
      name: "tasks_created",
      label: "Tasks created",
      description: "Tasks created in scope during the selected time range.",
      dimensions: ["projectId", "userId"],
      filters: ["projectId", "userId", "timeRange"],
      allowedDrilldowns: ["contributing_tasks"],
      resultSchema: { count: "number" },
      query: (scope) => this.countTasks(scope, "createdAt"),
    },
    tasks_completed: {
      name: "tasks_completed",
      label: "Tasks completed",
      description:
        "Tasks currently done and updated during the selected time range.",
      dimensions: ["projectId", "assignedTo", "userId"],
      filters: ["projectId", "userId", "timeRange"],
      allowedDrilldowns: ["completed_tasks"],
      semanticType: "hybrid",
      caveats: [
        "State-backed completion count uses current task status plus selected update window.",
      ],
      query: (scope) => this.countCompletedTasks(scope),
    },
    task_completion_rate: {
      name: "task_completion_rate",
      label: "Task completion rate",
      description:
        "Completed tasks divided by tasks created in the same scope.",
      dimensions: ["projectId", "userId"],
      filters: ["projectId", "userId", "timeRange"],
      allowedDrilldowns: ["completed_tasks"],
      semanticType: "hybrid",
      unit: "percent",
      resultSchema: {
        created: "number",
        completed: "number",
        boundedCompleted: "number",
        rate: "number",
        percent: "number",
      },
      operationalMeaning:
        "Bounded period completion ratio. Shows completion pressure without allowing impossible percentages.",
      contributionStrategy:
        "Completed task drilldown explains numerator contributors.",
      query: (scope) => this.queryCompletionRate(scope),
    },
    overdue_tasks: {
      name: "overdue_tasks",
      label: "Overdue tasks",
      description: "Open tasks whose due date is before today.",
      dimensions: ["projectId", "assignedTo"],
      filters: ["projectId", "userId"],
      allowedDrilldowns: ["overdue_task_entities"],
      resultSchema: { count: "number" },
      operationalMeaning:
        "Open work already past due date in authorized scope.",
      query: (scope) => this.countOverdueTasks(scope),
    },
    stale_tasks: {
      name: "stale_tasks",
      label: "Stale tasks",
      description: "Open tasks not updated for seven days or longer.",
      dimensions: ["projectId", "assignedTo", "status"],
      filters: ["projectId", "userId"],
      allowedDrilldowns: ["stale_task_entities"],
      resultSchema: { count: "number", thresholdDays: "number" },
      operationalMeaning:
        "Open work with no task record update for at least seven days; proxy for operational neglect.",
      query: (scope) => this.countStaleTasks(scope),
    },
    avg_completion_time: {
      name: "avg_completion_time",
      label: "Average completion time",
      description:
        "Average hours between task_created and task_completed events.",
      dimensions: ["projectId"],
      filters: ["projectId", "userId", "timeRange"],
      semanticType: "event",
      unit: "hours",
      caveats: [
        "Requires both task_created and task_completed events for each sampled task.",
      ],
      query: (scope) => this.queryAverageCompletionTime(scope),
    },
    project_health_score: {
      name: "project_health_score",
      label: "Project health score",
      description:
        "Composite score from completion rate, overdue work, and stale work.",
      dimensions: ["projectId"],
      filters: ["projectId", "timeRange"],
      allowedDrilldowns: ["health_signal_contributors"],
      semanticType: "hybrid",
      unit: "score",
      resultSchema: { score: "number", status: "healthy | watch | at_risk" },
      operationalMeaning:
        "Normalized execution health score from bounded completion, overdue pressure, and stale pressure.",
      contributionStrategy:
        "Drilldown returns overdue and stale task contributors that explain score penalties.",
      query: (scope) => this.queryProjectHealth(scope),
    },
    tasks_completed_per_user: {
      name: "tasks_completed_per_user",
      label: "Tasks completed per user",
      description: "Done task count grouped by assignee.",
      dimensions: ["assignedTo", "projectId"],
      filters: ["projectId", "timeRange"],
      caveats: [
        "Returns sanitized assignee identity for authorized scope only.",
      ],
      query: (scope) => this.queryTasksCompletedPerUser(scope),
    },
    inactive_projects: {
      name: "inactive_projects",
      label: "Inactive projects",
      description:
        "Accessible projects with no task updates during the selected time range.",
      dimensions: ["projectId"],
      filters: ["timeRange"],
      authorizationPolicy: { roles: ["ADMIN", "MEMBER"], aiVisible: false },
      caveats: [
        "No task updates in window; does not prove no external coordination happened.",
        "Hidden from AI-visible discovery by default.",
      ],
      query: (scope) => this.queryInactiveProjects(scope),
    },
  };

  public async listMetrics(
    userId: string,
    options?: { aiVisibleOnly?: boolean },
  ) {
    const rolesByProjectId = await this.getRolesByProjectId(userId);

    return Object.values(this.metricRegistry)
      .filter((metric) => this.canDiscoverMetric(metric, rolesByProjectId))
      .filter((metric) => {
        if (!options?.aiVisibleOnly) {
          return true;
        }

        return this.contractFor(metric).AIVisibility === "safe";
      })
      .map((metric) => this.contractFor(metric));
  }

  public async describeMetric(userId: string, metricName: string) {
    const metric = this.metricRegistry[metricName as MetricName];
    if (!metric) {
      throw new HttpError(404, "Unknown metric");
    }

    const rolesByProjectId = await this.getRolesByProjectId(userId);
    if (!this.canDiscoverMetric(metric, rolesByProjectId)) {
      throw new HttpError(404, "Unknown metric");
    }

    return {
      ...this.contractFor(metric),
      contract: {
        endpoint: "POST /api/analytics/query-metric",
        request: {
          metric: metric.name,
          filters: { projectId: "optional", userId: "optional" },
          dimensions: metric.dimensions,
          timeRange:
            "today | last_7_days | last_30_days | last_90_days | all_time",
        },
      },
    };
  }

  public async queryMetric(userId: string, input: MetricQueryInput) {
    const traceId = this.createTraceId();
    const startedAt = Date.now();
    const metric = this.validateMetricInput(input);
    const scope = await this.buildScope(userId, input, metric);
    const cacheKey = this.cacheKey(
      userId,
      metric.name,
      scope,
      input.dimensions,
    );
    const cached = this.getCached(cacheKey);

    if (cached !== undefined) {
      logger.info("Semantic metric cache hit", {
        traceId,
        metric: metric.name,
        userId,
        projectId: scope.filters.projectId ?? null,
      });

      return this.resultEnvelope(metric, scope, cached.value, {
        traceId,
        generatedAt: cached.generatedAt,
        cache: "hit",
        durationMs: Date.now() - startedAt,
      });
    }

    const value = await metric.query(scope);
    const generatedAt = new Date().toISOString();
    this.setCached(cacheKey, metric, value, generatedAt);

    logger.info("Semantic metric executed", {
      traceId,
      metric: metric.name,
      userId,
      projectId: scope.filters.projectId ?? null,
      durationMs: Date.now() - startedAt,
    });

    return this.resultEnvelope(metric, scope, value, {
      traceId,
      generatedAt,
      cache: "miss",
      durationMs: Date.now() - startedAt,
    });
  }

  public async compareMetrics(userId: string, inputs: MetricQueryInput[]) {
    if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 6) {
      throw new HttpError(400, "Compare requires between 1 and 6 metrics");
    }

    const results = await Promise.all(
      inputs.map((input) => this.queryMetric(userId, input)),
    );

    return { results, generatedAt: new Date().toISOString() };
  }

  public async drilldownMetric(userId: string, input: DrilldownInput) {
    const traceId = this.createTraceId();
    const startedAt = Date.now();
    const metric = this.validateMetricInput(input);
    const scope = await this.buildScope(userId, input, metric);
    const drilldown = input.drilldown ?? metric.allowedDrilldowns?.[0];

    if (!drilldown || !metric.allowedDrilldowns?.includes(drilldown)) {
      throw new HttpError(400, "Unsupported drilldown for metric");
    }

    const limit = this.normalizeDrilldownLimit(input.pagination?.limit);
    const offset = this.normalizeDrilldownOffset(input.pagination?.offset);
    const sort = this.normalizeDrilldownSort(input.sort);
    const result = await this.queryTaskDrilldown(metric, scope, {
      limit,
      offset,
      sort,
    });

    logger.info("Semantic drilldown executed", {
      traceId,
      metric: metric.name,
      drilldown,
      userId,
      projectId: scope.filters.projectId ?? null,
      durationMs: Date.now() - startedAt,
    });

    return {
      metric: metric.name,
      label: metric.label,
      drilldown,
      timeRange: scope.timeRange,
      filters: scope.filters,
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: offset + result.rows.length < result.total,
      },
      rows: result.rows,
      semanticContext: {
        operationalMeaning: this.contractFor(metric).operationalMeaning,
        contributionStrategy: this.contractFor(metric).contributionStrategy,
        caveats: this.contractFor(metric).caveats,
      },
      trace: {
        traceId,
        durationMs: Date.now() - startedAt,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  public async recordDashboardOpened(
    userId: string,
    projectId?: string | null,
  ) {
    operationalAnalyticsService.recordEventSafely({
      eventName: "dashboard_opened",
      entityType: "dashboard",
      entityId: projectId ?? "workspace",
      userId,
      projectId: projectId ?? null,
      metadata: { surface: "semantic_intelligence" },
    });
  }

  private contractFor(metric: MetricDefinition) {
    const semanticType =
      metric.semanticType ?? this.inferSemanticType(metric.name);
    const stability = metric.stability ?? "stable";
    const cachePolicy = metric.cachePolicy ?? {
      ttlSeconds: metric.name === "active_users" ? 30 : 60,
      strategy: "short_ttl" as const,
    };

    return {
      name: metric.name,
      label: metric.label,
      description: metric.description,
      category: metric.category ?? "operational_intelligence",
      semanticType,
      owner: metric.owner ?? "semantic-analytics",
      grain: metric.grain ?? "workspace_project_task",
      unit: metric.unit ?? "count",
      dimensions: metric.dimensions,
      allowedFilters: metric.filters,
      allowedDrilldowns: metric.allowedDrilldowns ?? [],
      freshnessPolicy: metric.freshnessPolicy ?? "live_with_short_ttl_cache",
      aggregationBehavior:
        metric.aggregationBehavior ?? "server_scoped_contract_aggregation",
      stability,
      version: metric.version ?? "1.1.0",
      caveats: metric.caveats ?? this.defaultCaveats(metric.name),
      explainability:
        metric.explainability ??
        "Result includes semantic context, trace metadata, freshness, and controlled drilldowns where supported.",
      resultSchema: metric.resultSchema ?? { value: "metric-specific object" },
      authorizationPolicy: {
        roles: metric.authorizationPolicy?.roles ?? ["ADMIN", "MEMBER"],
        requiresProjectScope:
          metric.authorizationPolicy?.requiresProjectScope ?? false,
      },
      cachePolicy,
      AIVisibility:
        metric.authorizationPolicy?.aiVisible === false ? "hidden" : "safe",
      operationalMeaning:
        metric.operationalMeaning ??
        "Indicates current operational state within the caller's authorized project/workspace scope.",
      semanticExamples: metric.semanticExamples ?? [
        `query_metric({ metric: "${metric.name}" })`,
      ],
      drilldownSupport: (metric.allowedDrilldowns?.length ?? 0) > 0,
      contributionStrategy:
        metric.contributionStrategy ??
        "Metric can explain contributing entities only through declared drilldowns.",
    };
  }

  private canDiscoverMetric(
    metric: MetricDefinition,
    rolesByProjectId: Map<string, ProjectRole>,
  ): boolean {
    const allowedRoles = metric.authorizationPolicy?.roles ?? [
      "ADMIN",
      "MEMBER",
    ];
    if (allowedRoles.includes("MEMBER")) {
      return true;
    }

    return Array.from(rolesByProjectId.values()).some((role) =>
      allowedRoles.includes(role),
    );
  }

  private async getRolesByProjectId(
    userId: string,
  ): Promise<Map<string, ProjectRole>> {
    const memberships = await ProjectMemberModel.find({ userId }).lean().exec();
    const ownedProjects = await ProjectModel.find({ userId })
      .select("_id")
      .lean()
      .exec();
    const rolesByProjectId = new Map<string, ProjectRole>(
      memberships.map((membership) => [
        membership.projectId.toString(),
        membership.role === "ADMIN" ? "ADMIN" : "MEMBER",
      ]),
    );

    ownedProjects.forEach((project) => {
      rolesByProjectId.set(project._id.toString(), "ADMIN");
    });

    return rolesByProjectId;
  }

  private inferSemanticType(
    metricName: MetricName,
  ): "state" | "event" | "hybrid" {
    if (["active_users", "avg_completion_time"].includes(metricName)) {
      return "event";
    }

    if (["project_health_score", "task_completion_rate"].includes(metricName)) {
      return "hybrid";
    }

    return "state";
  }

  private defaultCaveats(metricName: MetricName): string[] {
    if (metricName === "task_completion_rate") {
      return [
        "Uses bounded period completion ratio, so percent is capped at 100 to prevent impossible rates.",
      ];
    }

    if (metricName === "inactive_projects") {
      return [
        "Inactive means no task updates in selected window, not no human discussion outside tasks.",
      ];
    }

    return [
      "Scoped to authorized projects and declared semantic filters only.",
    ];
  }

  private async buildScope(
    userId: string,
    input: MetricQueryInput,
    metric: MetricDefinition,
  ): Promise<QueryScope> {
    const timeRange = this.normalizeTimeRange(input.timeRange);
    const { startDate, endDate } = this.resolveTimeRange(timeRange);
    const filters = this.validateFilters(metric, input.filters);
    const memberships = await ProjectMemberModel.find({ userId }).lean().exec();
    const ownedProjects = await ProjectModel.find({ userId })
      .select("_id")
      .lean()
      .exec();
    const rolesByProjectId = new Map<string, ProjectRole>(
      memberships.map((membership) => [
        membership.projectId.toString(),
        membership.role === "ADMIN" ? "ADMIN" : "MEMBER",
      ]),
    );
    const accessibleProjectIds = [
      ...new Set([
        ...memberships.map((membership) => membership.projectId.toString()),
        ...ownedProjects.map((project) => project._id.toString()),
      ]),
    ];

    ownedProjects.forEach((project) => {
      rolesByProjectId.set(project._id.toString(), "ADMIN");
    });

    if (
      filters.projectId &&
      !accessibleProjectIds.includes(filters.projectId)
    ) {
      throw new HttpError(403, "Project is outside analytics scope");
    }

    if (
      metric.authorizationPolicy?.requiresProjectScope &&
      !filters.projectId
    ) {
      throw new HttpError(400, "Metric requires a project filter");
    }

    if (metric.authorizationPolicy?.roles?.length && filters.projectId) {
      const role = rolesByProjectId.get(filters.projectId);
      if (!role || !metric.authorizationPolicy.roles.includes(role)) {
        throw new HttpError(403, "Metric is outside analytics role scope");
      }
    }

    if (filters.userId && filters.userId !== userId && !filters.projectId) {
      throw new HttpError(
        400,
        "Cross-user analytics requires a project filter",
      );
    }

    return {
      userId,
      accessibleProjectIds,
      filters,
      timeRange,
      startDate,
      endDate,
    };
  }

  private validateMetricInput(input: MetricQueryInput): MetricDefinition {
    if (input == null || typeof input !== "object") {
      throw new HttpError(400, "Semantic query body is required");
    }

    const metric = this.metricRegistry[input.metric];
    if (!metric) {
      throw new HttpError(400, "Unsupported metric");
    }

    if (input.dimensions !== undefined) {
      if (!Array.isArray(input.dimensions)) {
        throw new HttpError(400, "Dimensions must be an array");
      }

      const unsupportedDimension = input.dimensions.find(
        (dimension) =>
          typeof dimension !== "string" ||
          !metric.dimensions.includes(dimension),
      );
      if (unsupportedDimension) {
        throw new HttpError(
          400,
          `Unsupported dimension: ${String(unsupportedDimension)}`,
        );
      }
    }

    return metric;
  }

  private validateFilters(
    metric: MetricDefinition,
    filters?: MetricFilters,
  ): MetricFilters {
    if (filters === undefined) {
      return {};
    }

    if (
      filters == null ||
      typeof filters !== "object" ||
      Array.isArray(filters)
    ) {
      throw new HttpError(400, "Filters must be an object");
    }

    const normalized: MetricFilters = {};
    const filterRecord = filters as Record<string, unknown>;
    const executableFilters = metric.filters.filter(
      (filter) => filter !== "timeRange",
    );
    const unsupportedFilter = Object.keys(filterRecord).find(
      (filter) => !executableFilters.includes(filter),
    );

    if (unsupportedFilter) {
      throw new HttpError(400, `Unsupported filter: ${unsupportedFilter}`);
    }

    for (const key of ["projectId", "userId"] as const) {
      const value = filterRecord[key];
      if (value === undefined) {
        continue;
      }

      if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
        throw new HttpError(400, `Invalid ${key}`);
      }

      normalized[key] = value;
    }

    return normalized;
  }

  private normalizeTimeRange(timeRange?: TimeRange): TimeRange {
    if (timeRange === undefined) {
      return "last_30_days";
    }

    if (!timeRanges.includes(timeRange)) {
      throw new HttpError(400, "Unsupported time range");
    }

    return timeRange;
  }

  private resolveTimeRange(timeRange: TimeRange): {
    startDate?: Date;
    endDate: Date;
  } {
    const endDate = new Date();
    if (timeRange === "all_time") {
      return { endDate };
    }

    const startDate = new Date(endDate);
    if (timeRange === "today") {
      startDate.setHours(0, 0, 0, 0);
    } else if (timeRange === "last_7_days") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === "last_30_days") {
      startDate.setDate(startDate.getDate() - 30);
    } else {
      startDate.setDate(startDate.getDate() - 90);
    }

    return { startDate, endDate };
  }

  private buildTaskMatch(scope: QueryScope): TaskMatch {
    const userObjectId = toObjectId(scope.userId) ?? scope.userId;
    const projectObjectIds = scope.accessibleProjectIds
      .map((projectId) => toObjectId(projectId))
      .filter((projectId): projectId is Types.ObjectId => Boolean(projectId));

    const match: TaskMatch = scope.filters.projectId
      ? {
          projectId:
            toObjectId(scope.filters.projectId) ?? scope.filters.projectId,
        }
      : {
          $or: [
            { userId: userObjectId },
            { projectId: { $in: projectObjectIds } },
          ],
        };

    if (scope.filters.userId) {
      const scopedUser =
        toObjectId(scope.filters.userId) ?? scope.filters.userId;
      match.$and = [
        {
          $or: [{ userId: scopedUser }, { assignedTo: scopedUser }],
        },
      ];
    }

    return match;
  }

  private withDateRange(
    match: TaskMatch,
    field: "createdAt" | "updatedAt",
    scope: QueryScope,
  ) {
    if (!scope.startDate) {
      return match;
    }

    return {
      ...match,
      [field]: { $gte: scope.startDate, $lte: scope.endDate },
    };
  }

  private buildEventMatch(scope: QueryScope) {
    const match: Record<string, unknown> = scope.filters.projectId
      ? { projectId: scope.filters.projectId }
      : {
          $or: [
            { userId: scope.userId },
            { projectId: { $in: scope.accessibleProjectIds } },
          ],
        };

    if (scope.filters.userId) {
      match.userId = scope.filters.userId;
    }

    if (scope.startDate) {
      match.createdAt = { $gte: scope.startDate, $lte: scope.endDate };
    }

    return match;
  }

  private async countTasks(
    scope: QueryScope,
    dateField: "createdAt" | "updatedAt",
  ) {
    return {
      count: await TaskModel.countDocuments(
        this.withDateRange(this.buildTaskMatch(scope), dateField, scope),
      ),
    };
  }

  private async countCompletedTasks(scope: QueryScope) {
    return {
      count: await TaskModel.countDocuments({
        ...this.withDateRange(this.buildTaskMatch(scope), "updatedAt", scope),
        status: "DONE",
      }),
    };
  }

  private async queryCompletionRate(scope: QueryScope) {
    const [created, completed] = await Promise.all([
      TaskModel.countDocuments(
        this.withDateRange(this.buildTaskMatch(scope), "createdAt", scope),
      ),
      TaskModel.countDocuments({
        ...this.withDateRange(this.buildTaskMatch(scope), "updatedAt", scope),
        status: "DONE",
      }),
    ]);
    const boundedCompleted = Math.min(completed, created);
    const rate =
      created === 0 ? 0 : Number((boundedCompleted / created).toFixed(4));

    return {
      created,
      completed,
      boundedCompleted,
      rate,
      percent: Number((rate * 100).toFixed(1)),
    };
  }

  private async countOverdueTasks(scope: QueryScope) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      count: await TaskModel.countDocuments({
        ...this.buildTaskMatch(scope),
        date: { $lt: today },
        status: { $nin: ["DONE", "rolled_over"] },
      }),
    };
  }

  private async countStaleTasks(scope: QueryScope) {
    const staleBefore = new Date();
    staleBefore.setDate(staleBefore.getDate() - 7);

    return {
      count: await TaskModel.countDocuments({
        ...this.buildTaskMatch(scope),
        updatedAt: { $lte: staleBefore },
        status: { $nin: ["DONE", "rolled_over"] },
      }),
      thresholdDays: 7,
    };
  }

  private async queryActiveUsers(scope: QueryScope) {
    const users = await OperationalAnalyticsEventModel.distinct(
      "userId",
      this.buildEventMatch(scope),
    );
    return { count: users.length };
  }

  private async queryAverageCompletionTime(scope: QueryScope) {
    const match = this.buildEventMatch(scope);
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...match,
          eventName: { $in: ["task_created", "task_completed"] },
          entityType: "task",
        },
      },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: "$entityId",
          createdAt: {
            $first: {
              $cond: [
                { $eq: ["$eventName", "task_created"] },
                "$createdAt",
                null,
              ],
            },
          },
          completedAt: {
            $max: {
              $cond: [
                { $eq: ["$eventName", "task_completed"] },
                "$createdAt",
                null,
              ],
            },
          },
        },
      },
      { $match: { createdAt: { $ne: null }, completedAt: { $ne: null } } },
      {
        $project: {
          hours: {
            $divide: [
              { $subtract: ["$completedAt", "$createdAt"] },
              1000 * 60 * 60,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          averageHours: { $avg: "$hours" },
          sampleSize: { $sum: 1 },
        },
      },
    ];

    const [result] = await OperationalAnalyticsEventModel.aggregate(pipeline);
    return {
      averageHours: result?.averageHours
        ? Number(result.averageHours.toFixed(2))
        : 0,
      sampleSize: result?.sampleSize ?? 0,
    };
  }

  private async queryProjectHealth(scope: QueryScope) {
    const [completion, overdue, stale] = await Promise.all([
      this.queryCompletionRate(scope),
      this.countOverdueTasks(scope),
      this.countStaleTasks(scope),
    ]);

    const completionScore = completion.percent;
    const overduePenalty = Math.min(overdue.count * 8, 40);
    const stalePenalty = Math.min(stale.count * 4, 30);
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(completionScore - overduePenalty - stalePenalty),
      ),
    );

    return {
      score,
      inputs: {
        completionRatePercent: completion.percent,
        overdueTasks: overdue.count,
        staleTasks: stale.count,
      },
      status: score >= 75 ? "healthy" : score >= 50 ? "watch" : "at_risk",
    };
  }

  private async queryTasksCompletedPerUser(scope: QueryScope) {
    const match = {
      ...this.withDateRange(this.buildTaskMatch(scope), "updatedAt", scope),
      status: "DONE",
    };
    const rows = await TaskModel.aggregate([
      { $match: match },
      { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 25 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userId: { $toString: "$_id" },
          name: "$user.name",
          email: "$user.email",
          count: 1,
          _id: 0,
        },
      },
    ]);

    return { rows };
  }

  private async queryInactiveProjects(scope: QueryScope) {
    if (!scope.startDate) {
      return { rows: [] };
    }

    const projectIds = scope.accessibleProjectIds
      .map((projectId) => toObjectId(projectId))
      .filter((projectId): projectId is Types.ObjectId => Boolean(projectId));
    const updatedProjectIds = await TaskModel.distinct("projectId", {
      projectId: { $in: projectIds },
      updatedAt: { $gte: scope.startDate, $lte: scope.endDate },
    });
    const activeSet = new Set(
      updatedProjectIds.map((projectId) => projectId.toString()),
    );
    const inactiveIds = scope.accessibleProjectIds.filter(
      (projectId) => !activeSet.has(projectId),
    );
    const projects = await ProjectModel.find({ _id: { $in: inactiveIds } })
      .select("name updatedAt")
      .lean()
      .exec();

    return {
      rows: projects.map((project) => ({
        projectId: project._id.toString(),
        name: project.name,
        lastProjectUpdate: project.updatedAt,
      })),
    };
  }

  private async queryTaskDrilldown(
    metric: MetricDefinition,
    scope: QueryScope,
    options: {
      limit: number;
      offset: number;
      sort: { [key: string]: 1 | -1 };
    },
  ) {
    const match = this.buildDrilldownTaskMatch(metric.name, scope);
    const [rows, total] = await Promise.all([
      TaskModel.find(match)
        .sort(options.sort)
        .skip(options.offset)
        .limit(options.limit)
        .select(
          "title date status priority isBlocked projectId assignedTo updatedAt createdAt",
        )
        .lean()
        .exec(),
      TaskModel.countDocuments(match),
    ]);

    return {
      total,
      rows: rows.map((task) => ({
        entityType: "task",
        entityId: task._id.toString(),
        title: task.title,
        projectId: task.projectId?.toString() ?? null,
        assigneeId: task.assignedTo?.toString() ?? null,
        status: task.status,
        priority: task.priority,
        dueDate: task.date,
        updatedAt: task.updatedAt,
        createdAt: task.createdAt,
        reason: this.drilldownReason(metric.name),
        contribution: this.drilldownContribution(metric.name, task),
      })),
    };
  }

  private buildDrilldownTaskMatch(metricName: MetricName, scope: QueryScope) {
    const base = this.buildTaskMatch(scope);

    if (metricName === "overdue_tasks") {
      const today = new Date().toISOString().slice(0, 10);
      return {
        ...base,
        date: { $lt: today },
        status: { $nin: ["DONE", "rolled_over"] },
      };
    }

    if (metricName === "stale_tasks") {
      const staleBefore = new Date();
      staleBefore.setDate(staleBefore.getDate() - 7);
      return {
        ...base,
        updatedAt: { $lte: staleBefore },
        status: { $nin: ["DONE", "rolled_over"] },
      };
    }

    if (metricName === "project_health_score") {
      const staleBefore = new Date();
      staleBefore.setDate(staleBefore.getDate() - 7);
      const today = new Date().toISOString().slice(0, 10);
      return {
        ...base,
        status: { $nin: ["DONE", "rolled_over"] },
        $or: [{ date: { $lt: today } }, { updatedAt: { $lte: staleBefore } }],
      };
    }

    if (
      metricName === "task_completion_rate" ||
      metricName === "tasks_completed"
    ) {
      return {
        ...this.withDateRange(base, "updatedAt", scope),
        status: "DONE",
      };
    }

    return this.withDateRange(base, "createdAt", scope);
  }

  private drilldownReason(metricName: MetricName): string {
    if (metricName === "overdue_tasks") {
      return "Task is open and due date is before today.";
    }

    if (metricName === "stale_tasks") {
      return "Task is open and has not changed for at least seven days.";
    }

    if (metricName === "project_health_score") {
      return "Task contributes negative operational pressure through overdue or stale state.";
    }

    if (
      metricName === "task_completion_rate" ||
      metricName === "tasks_completed"
    ) {
      return "Task completed inside selected semantic time window.";
    }

    return `Task contributes to ${metricName.replace(/_/g, " ")}.`;
  }

  private drilldownContribution(
    metricName: MetricName,
    task: Record<string, any>,
  ): Record<string, unknown> {
    return {
      metric: metricName,
      status: task.status,
      priority: task.priority,
      isBlocked: task.isBlocked,
      dueDate: task.date,
    };
  }

  private normalizeDrilldownLimit(limit?: number): number {
    if (limit === undefined) {
      return 25;
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > maxDrilldownLimit) {
      throw new HttpError(
        400,
        `Drilldown limit must be between 1 and ${maxDrilldownLimit}`,
      );
    }

    return limit;
  }

  private normalizeDrilldownOffset(offset?: number): number {
    if (offset === undefined) {
      return 0;
    }

    if (!Number.isInteger(offset) || offset < 0 || offset > 5000) {
      throw new HttpError(400, "Drilldown offset must be between 0 and 5000");
    }

    return offset;
  }

  private normalizeDrilldownSort(sort?: {
    field?: string;
    direction?: "asc" | "desc";
  }): { [key: string]: 1 | -1 } {
    if (!sort?.field) {
      return { updatedAt: -1 };
    }

    if (!safeSortFields.has(sort.field)) {
      throw new HttpError(400, "Unsupported drilldown sort field");
    }

    return { [sort.field]: sort.direction === "asc" ? 1 : -1 };
  }

  private resultEnvelope(
    metric: MetricDefinition,
    scope: QueryScope,
    value: unknown,
    trace: {
      traceId: string;
      generatedAt: string;
      cache: "hit" | "miss";
      durationMs: number;
    },
  ) {
    const contract = this.contractFor(metric);

    return {
      metric: metric.name,
      label: metric.label,
      timeRange: scope.timeRange,
      filters: scope.filters,
      value,
      generatedAt: trace.generatedAt,
      semantic: {
        version: contract.version,
        semanticType: contract.semanticType,
        stability: contract.stability,
        freshnessPolicy: contract.freshnessPolicy,
        caveats: contract.caveats,
        explainability: contract.explainability,
        operationalMeaning: contract.operationalMeaning,
        AIVisibility: contract.AIVisibility,
      },
      cache: {
        status: trace.cache,
        policy: contract.cachePolicy,
      },
      trace: {
        traceId: trace.traceId,
        durationMs: trace.durationMs,
      },
    };
  }

  private cacheKey(
    userId: string,
    metricName: MetricName,
    scope: QueryScope,
    dimensions?: string[],
  ): string {
    return JSON.stringify({
      userId,
      metricName,
      filters: scope.filters,
      timeRange: scope.timeRange,
      dimensions: dimensions ?? [],
    });
  }

  private getCached(
    key: string,
  ): { value: unknown; generatedAt: string } | undefined {
    const cached = this.resultCache.get(key);
    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
      this.resultCache.delete(key);
      return undefined;
    }

    return { value: cached.value, generatedAt: cached.generatedAt };
  }

  private setCached(
    key: string,
    metric: MetricDefinition,
    value: unknown,
    generatedAt: string,
  ): void {
    const ttlSeconds = this.contractFor(metric).cachePolicy.ttlSeconds;
    if (ttlSeconds <= 0) {
      return;
    }

    this.resultCache.set(key, {
      value,
      generatedAt,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private createTraceId(): string {
    return `sem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  public async platformUserCount() {
    return UserModel.countDocuments();
  }
}

export default new SemanticAnalyticsService();
