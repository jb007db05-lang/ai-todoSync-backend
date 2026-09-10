import type { PipelineStage } from "mongoose";
import { Types } from "mongoose";

import OperationalAnalyticsEventModel from "../models/operational-analytics-event.model.js";
import ProjectMemberModel from "../../project/models/project-member.model.js";
import ProjectModel from "../../project/models/project.model.js";
import SemanticGovernanceAuditModel from "../../audit/models/semantic-governance-audit.model.js";
import SemanticRollupSnapshotModel from "../models/semantic-rollup-snapshot.model.js";
import TaskModel from "../../task/models/task.model.js";

export type TimeRange =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "all_time";
export type RollupPeriod = "daily" | "weekly" | "monthly";
export type MetricScopeFilters = { projectId?: string; userId?: string };

export interface IntelligenceQueryInput {
  metric?: string;
  filters?: MetricScopeFilters;
  timeRange?: TimeRange;
  period?: RollupPeriod;
}

interface IntelligenceScope {
  userId: string;
  accessibleProjectIds: string[];
  filters: MetricScopeFilters;
  timeRange: TimeRange;
  startDate?: Date;
  endDate: Date;
}

interface Factor {
  key: string;
  label: string;
  value: number;
  weight: number;
  direction: "positive" | "negative" | "neutral";
  explanation: string;
}

export interface OperationalForecast {
  metric: string;
  horizons: Array<{
    days: number;
    projectedValue: number;
    trajectory: "improving" | "degrading" | "stable";
    confidence: number;
  }>;
  riskDrivers: Array<{
    key: string;
    label: string;
    value: number;
  }>;
  momentum: string;
  propagationRisk: number;
  generatedAt: string;
}

export interface OperationalSimulation {
  metric: string;
  intervention: {
    type:
      | "reduce_blockers"
      | "resolve_overdue"
      | "increase_throughput"
      | "stabilize_ownership";
    intensity: number;
  };
  simulatedValue: number;
  impact: number;
  confidence: number;
  explanation: string;
  generatedAt: string;
}

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

const timeRanges: TimeRange[] = [
  "today",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "all_time",
];
const rollupPeriods: RollupPeriod[] = ["daily", "weekly", "monthly"];

const advancedMetrics = [
  "workflow_bottlenecks",
  "delivery_risk",
  "execution_confidence",
  "workflow_friction",
  "coordination_overhead",
  "operational_drift",
  "project_momentum",
  "velocity_degradation",
  "blocker_pressure",
  "workflow_instability",
  "review_latency",
  "reopen_pressure",
  "escalation_frequency",
  "execution_volatility",
  "operational_anomalies",
  "throughput_decay",
  "workflow_stagnation",
  "assignment_churn",
  "dependency_pressure",
] as const;

type AdvancedMetricName = (typeof advancedMetrics)[number];

class SemanticOperationalIntelligenceService {
  private readonly metricSet = new Set<string>(advancedMetrics);

  public async explainMetric(userId: string, input: IntelligenceQueryInput) {
    const metric = this.normalizeMetric(input.metric);
    const scope = await this.buildScope(userId, input);
    const current = await this.computeMetric(metric, scope);
    const previous = await this.computeMetric(
      metric,
      this.previousScope(scope),
    );
    const factors = this.rankFactors(current.factors);
    const causalContext = this.buildCausalContext(
      metric,
      current,
      previous,
      factors,
    );
    const graph = this.buildExplainabilityGraph(metric, factors, causalContext);

    return {
      metric,
      value: current.value,
      confidence: current.confidence,
      comparison: {
        previousValue: previous.value,
        delta: Number((current.value - previous.value).toFixed(2)),
        direction: this.direction(current.value - previous.value),
      },
      factors,
      contributorWeights: this.contributorWeights(factors),
      causality: causalContext,
      dependencyAnalysis: this.dependencyAnalysis(current.counts),
      propagationAnalysis: this.propagationAnalysis(
        current.counts,
        current.openPressure,
      ),
      transitionLatencyAnalysis: this.transitionLatencyAnalysis(
        current.latency,
      ),
      eventCorrelation: this.eventCorrelation(current.counts),
      graph,
      reasoningChain: this.reasoningChain(metric, factors, causalContext),
      narrative: this.narrative(metric, current.value, factors, causalContext),
      semantic: this.semanticMetadata(metric),
      generatedAt: new Date().toISOString(),
    };
  }

  public async forecast(
    userId: string,
    input: IntelligenceQueryInput,
  ): Promise<OperationalForecast> {
    const metric = this.normalizeMetric(input.metric);
    const scope = await this.buildScope(userId, input);
    const current = await this.computeMetric(metric, scope);
    const previous = await this.computeMetric(
      metric,
      this.previousScope(scope),
    );

    const velocity = this.degradationVelocity(
      metric,
      current.value - previous.value,
      current.confidence / 10,
    );
    const drift = current.value > 50 ? 1.2 : 0.9;

    return {
      metric,
      horizons: [7, 14, 30].map((days) => {
        const factor = 1 + (velocity / 100) * (days / 7) * drift;
        const projectedValue = this.clamp(current.value * factor);
        return {
          days,
          projectedValue,
          trajectory:
            projectedValue > current.value
              ? "degrading"
              : projectedValue < current.value
                ? "improving"
                : "stable",
          confidence: this.clamp(current.confidence - (days / 30) * 15),
        };
      }),
      riskDrivers: this.rankFactors(current.factors)
        .slice(0, 3)
        .map((f) => ({
          key: f.key,
          label: f.label,
          value: f.value,
        })),
      momentum:
        this.momentumScore(
          metric,
          current.value,
          current.value - previous.value,
        ) > 60
          ? "positive"
          : "stagnant",
      propagationRisk: this.clamp(
        current.value * 0.8 + (current.counts.task_blocked || 0) * 2,
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  public async simulate(
    userId: string,
    input: {
      metric: string;
      filters: MetricScopeFilters;
      timeRange: TimeRange;
      intervention: OperationalSimulation["intervention"];
    },
  ): Promise<OperationalSimulation> {
    const metric = this.normalizeMetric(input.metric);
    const scope = await this.buildScope(userId, input);
    const current = await this.computeMetric(metric, scope);

    let impactFactor = 0.15;
    let explanation = "General process optimization model.";

    switch (input.intervention.type) {
      case "reduce_blockers":
        impactFactor = 0.25;
        explanation =
          "Resolving active blockers reduces immediate propagation risk across dependency chains.";
        break;
      case "resolve_overdue":
        impactFactor = 0.2;
        explanation =
          "Clearing overdue accumulation restores velocity stability and reduces operational debt.";
        break;
      case "increase_throughput":
        impactFactor = 0.18;
        explanation =
          "Boosting completion rates counteracts inflow pressure and improves delivery momentum.";
        break;
      case "stabilize_ownership":
        impactFactor = 0.12;
        explanation =
          "Fixing assignment churn reduces coordination overhead and improves focus depth.";
        break;
    }

    const impact = Number(
      (current.value * impactFactor * input.intervention.intensity).toFixed(2),
    );
    const simulatedValue = this.clamp(current.value - impact);

    return {
      metric,
      intervention: input.intervention,
      simulatedValue,
      impact,
      confidence: this.clamp(current.confidence - 5),
      explanation,
      generatedAt: new Date().toISOString(),
    };
  }

  public async replayTimeline(userId: string, input: IntelligenceQueryInput) {
    const scope = await this.buildScope(userId, input);
    const events = await OperationalAnalyticsEventModel.find(
      this.buildEventMatch(scope),
    )
      .sort({ createdAt: 1 })
      .limit(300)
      .lean()
      .exec();

    const rows = events.map((event) => this.toReplayEvent(event));
    const derivedRows = this.deriveReplaySignals(rows);
    const narrativeRows = [...rows, ...derivedRows].sort(
      (a, b) =>
        new Date(a.occurredAt as string).getTime() -
        new Date(b.occurredAt as string).getTime(),
    );
    const causalChains = this.buildReplayChains(narrativeRows);

    return {
      timeRange: scope.timeRange,
      filters: scope.filters,
      events: narrativeRows,
      causalChains,
      narrative: this.replayNarrative(causalChains, narrativeRows),
      propagationGraph: this.replayPropagationGraph(causalChains),
      confidence: this.replayConfidence(narrativeRows, causalChains.length),
      summary: {
        eventCount: narrativeRows.length,
        sourceEventCount: rows.length,
        derivedSignalCount: derivedRows.length,
        firstEventAt: narrativeRows[0]?.occurredAt ?? null,
        lastEventAt:
          narrativeRows[narrativeRows.length - 1]?.occurredAt ?? null,
        topSignals: this.topSignals(
          narrativeRows.map((row) => row.eventName as string),
        ),
        replayMode: "causal_operational_narrative",
      },
      generatedAt: new Date().toISOString(),
    };
  }

  public async listAnomalies(userId: string, input: IntelligenceQueryInput) {
    const scope = await this.buildScope(userId, input);
    const metrics: AdvancedMetricName[] = [
      "workflow_bottlenecks",
      "velocity_degradation",
      "blocker_pressure",
      "assignment_churn",
      "reopen_pressure",
      "workflow_stagnation",
      "escalation_frequency",
      "dependency_pressure",
      "execution_volatility",
      "review_latency",
    ];
    const rows = await Promise.all(
      metrics.map(async (metric) => {
        const current = await this.computeMetric(metric, scope);
        const previous = await this.computeMetric(
          metric,
          this.previousScope(scope),
        );
        const deviation = current.value - previous.value;
        const baseline = Math.max(Math.abs(previous.value), 1);
        const score = Math.min(
          100,
          Math.round((Math.abs(deviation) / baseline) * 100),
        );

        return {
          metric,
          category: this.anomalyCategory(metric),
          score,
          severity: score >= 75 ? "high" : score >= 40 ? "medium" : "low",
          confidence: current.confidence,
          currentValue: current.value,
          baselineValue: previous.value,
          deviation: Number(deviation.toFixed(2)),
          explanation: this.anomalyExplanation(metric, deviation),
          factors: this.rankFactors(current.factors).slice(0, 5),
          timeline: this.anomalyTimeline(scope, metric, deviation),
          operationalImpact: this.operationalImpact(metric, score, current),
          causality: this.buildCausalContext(
            metric,
            current,
            previous,
            this.rankFactors(current.factors),
          ),
          historicalComparison: {
            baseline: "previous equivalent semantic window",
            previousValue: previous.value,
            currentValue: current.value,
            delta: Number(deviation.toFixed(2)),
          },
          affectedWorkflows: this.affectedWorkflows(metric, current.counts),
          propagationAnalysis: this.propagationAnalysis(
            current.counts,
            current.openPressure,
          ),
          mitigationHints: this.mitigationHints(metric, current),
          replaySupport: {
            metric,
            timeRange: scope.timeRange,
            filters: scope.filters,
          },
        };
      }),
    );

    return {
      anomalies: rows.filter((row) => row.score >= 25),
      baseline: "previous equivalent semantic window",
      generatedAt: new Date().toISOString(),
    };
  }

  public async trends(userId: string, input: IntelligenceQueryInput) {
    const scope = await this.buildScope(userId, input);
    const metrics: AdvancedMetricName[] = [
      "project_momentum",
      "delivery_risk",
      "workflow_friction",
      "execution_confidence",
      "throughput_decay",
      "blocker_pressure",
    ];
    const rows = await Promise.all(
      metrics.map(async (metric) => {
        const current = await this.computeMetric(metric, scope);
        const previousScope = this.previousScope(scope);
        const previous = await this.computeMetric(metric, previousScope);
        const baseline = await this.computeMetric(
          metric,
          this.previousScope(previousScope),
        );
        const delta = Number((current.value - previous.value).toFixed(2));
        const previousDelta = Number(
          (previous.value - baseline.value).toFixed(2),
        );
        const acceleration = Number((delta - previousDelta).toFixed(2));
        const volatility = Number(
          Math.min(100, Math.abs(delta) + Math.abs(previousDelta)).toFixed(2),
        );
        const factors = this.rankFactors(current.factors);
        return {
          metric,
          currentValue: current.value,
          previousValue: previous.value,
          baselineValue: baseline.value,
          delta,
          direction: this.direction(delta),
          acceleration,
          degradationVelocity: this.degradationVelocity(
            metric,
            delta,
            acceleration,
          ),
          momentumScore: this.momentumScore(metric, current.value, delta),
          directionalConfidence: this.directionalConfidence(
            delta,
            volatility,
            current.confidence,
          ),
          confidence: current.confidence,
          volatility,
          stabilization: Math.abs(delta) <= 3 && volatility <= 10,
          recoveryTrajectory: this.recoveryTrajectory(
            metric,
            delta,
            acceleration,
          ),
          sustainedDegradation: delta > 5 && previousDelta > 5,
          baselineComparison: {
            baseline: "rolling two-window historical comparison",
            previousDelta,
            acceleration,
          },
          contributors: factors.slice(0, 4),
          causality: this.buildCausalContext(
            metric,
            current,
            previous,
            factors,
          ),
          operationalImpact: this.trendImpact(metric, delta, acceleration),
          interpretation: this.trendInterpretation(
            metric,
            delta,
            acceleration,
            factors,
          ),
        };
      }),
    );

    return { trends: rows, generatedAt: new Date().toISOString() };
  }

  public async lineage(userId: string, metricName: string) {
    await this.assertAnyAnalyticsScope(userId);
    const metric = this.normalizeMetric(metricName);
    return {
      metric,
      lineage: this.lineageFor(metric),
      relationships: this.metricRelationships(metric),
      sourceSignals: this.lineageFor(metric).sourceEvents.map((eventName) => ({
        eventName,
        semanticMeaning: this.eventMeaning(eventName),
        contribution: this.eventCausalSignals(eventName),
      })),
      semanticVersion: "2.0.0",
      compatibility: "backward_compatible",
      maturityLevel: this.semanticMaturity(metric),
      replayCapabilities: this.replayCapabilities(metric),
      generatedAt: new Date().toISOString(),
    };
  }

  public async governance(userId: string, metricName: string) {
    await this.assertAnyAnalyticsScope(userId);
    const metric = this.normalizeMetric(metricName);
    const audits = await SemanticGovernanceAuditModel.find({ metric })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();

    return {
      metric,
      lifecycleState: "active",
      owner: "semantic-analytics",
      version: "2.0.0",
      compatibility: "backward_compatible",
      deprecation: null,
      semanticMaturityLevel: this.semanticMaturity(metric),
      freshnessPolicy:
        "live semantic events plus authorized task-state pressure",
      aiVisibility: "safe",
      explainabilitySupport: {
        causalChains: true,
        contributorWeights: true,
        propagationAnalysis: true,
        replayCorrelation: true,
      },
      caveats: this.semanticMetadata(metric).caveats,
      governedAsset: {
        type: "semantic_operational_intelligence_metric",
        owner: "semantic-analytics",
        contractVersion: "2.0.0",
      },
      lineage: this.lineageFor(metric),
      relationships: this.metricRelationships(metric),
      auditTrail: audits.map((audit) => ({
        version: audit.version,
        changeType: audit.changeType,
        compatibility: audit.compatibility,
        summary: audit.summary,
        createdAt: audit.createdAt,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  public async reasoningSummary(userId: string, input: IntelligenceQueryInput) {
    const scope = await this.buildScope(userId, input);
    const [risk, confidence, friction, momentum, anomalies] = await Promise.all(
      [
        this.computeMetric("delivery_risk", scope),
        this.computeMetric("execution_confidence", scope),
        this.computeMetric("workflow_friction", scope),
        this.computeMetric("project_momentum", scope),
        this.listAnomalies(userId, input),
      ],
    );

    const factors = this.rankFactors([
      ...risk.factors,
      ...confidence.factors,
      ...friction.factors,
      ...momentum.factors,
    ]).slice(0, 5);

    return {
      status:
        risk.value >= 70 || confidence.value < 40
          ? "at_risk"
          : risk.value >= 40
            ? "watch"
            : "stable",
      scores: {
        deliveryRisk: risk.value,
        executionConfidence: confidence.value,
        workflowFriction: friction.value,
        projectMomentum: momentum.value,
      },
      narrative: this.summaryNarrative(risk.value, confidence.value, factors),
      causalNarrative: this.summaryCausalNarrative(
        risk,
        confidence,
        friction,
        momentum,
        factors,
      ),
      confidence: this.metricConfidence(
        {
          ...risk.counts,
          ...confidence.counts,
          ...friction.counts,
          ...momentum.counts,
        },
        risk.latency.sampleSize + confidence.latency.sampleSize,
      ),
      topFactors: factors,
      anomalies: anomalies.anomalies.slice(0, 3),
      propagationAnalysis: this.propagationAnalysis(
        risk.counts,
        risk.openPressure,
      ),
      timelineContext: {
        timeRange: scope.timeRange,
        baseline: "previous equivalent semantic window",
        sourceEventCount: Object.values(risk.counts).reduce(
          (sum, count) => sum + count,
          0,
        ),
      },
      semanticInterpretation: {
        deliveryRisk: this.semanticScoreInterpretation(
          "delivery_risk",
          risk.value,
        ),
        executionConfidence: this.semanticScoreInterpretation(
          "execution_confidence",
          confidence.value,
        ),
        workflowFriction: this.semanticScoreInterpretation(
          "workflow_friction",
          friction.value,
        ),
        projectMomentum: this.semanticScoreInterpretation(
          "project_momentum",
          momentum.value,
        ),
      },
      recommendations: this.reasoningRecommendations(
        risk,
        confidence,
        friction,
        momentum,
      ),
      traceability: {
        sourceMetrics: [
          "delivery_risk",
          "execution_confidence",
          "workflow_friction",
          "project_momentum",
        ],
        sourceEvents: this.lineageFor("delivery_risk").sourceEvents,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  public async writeRollupSnapshot(
    userId: string,
    input: IntelligenceQueryInput,
  ) {
    const scope = await this.buildScope(userId, input);
    const period = this.normalizeRollupPeriod(input.period);
    const { bucketStart, bucketEnd } = this.rollupBucket(period, scope.endDate);
    const eventCounts = await this.eventCounts(scope);
    const metrics = {
      deliveryRisk: (await this.computeMetric("delivery_risk", scope)).value,
      executionConfidence: (
        await this.computeMetric("execution_confidence", scope)
      ).value,
      workflowFriction: (await this.computeMetric("workflow_friction", scope))
        .value,
      projectMomentum: (await this.computeMetric("project_momentum", scope))
        .value,
    };
    const latestEvent = await OperationalAnalyticsEventModel.findOne(
      this.buildEventMatch(scope),
    )
      .sort({ createdAt: -1 })
      .select("createdAt")
      .lean()
      .exec();

    const scopeId = scope.filters.projectId ?? scope.userId;
    const snapshot = await SemanticRollupSnapshotModel.findOneAndUpdate(
      {
        scopeType: scope.filters.projectId ? "project" : "workspace",
        scopeId,
        period,
        bucketStart,
      },
      {
        scopeType: scope.filters.projectId ? "project" : "workspace",
        scopeId,
        period,
        bucketStart,
        bucketEnd,
        metrics,
        eventCounts,
        freshness: {
          computedAt: new Date(),
          sourceEventMaxCreatedAt: latestEvent?.createdAt ?? null,
          status: "fresh",
        },
        semanticVersion: "2.0.0",
      },
      { upsert: true, new: true },
    )
      .lean()
      .exec();

    return {
      snapshotId: snapshot._id.toString(),
      scopeType: snapshot.scopeType,
      scopeId: snapshot.scopeId,
      period,
      bucketStart,
      bucketEnd,
      metrics,
      eventCounts,
      freshness: snapshot.freshness,
      generatedAt: new Date().toISOString(),
    };
  }

  public async writeScheduledRollupSnapshots() {
    const periods: RollupPeriod[] = ["daily", "weekly", "monthly"];
    const projectOwners = await ProjectModel.find()
      .select("_id userId")
      .lean()
      .exec();
    const memberAdmins = await ProjectMemberModel.find({ role: "ADMIN" })
      .select("projectId userId")
      .lean()
      .exec();
    const userIds = new Set<string>();
    const projectScopes = new Map<string, string>();

    projectOwners.forEach((project) => {
      const userId = project.userId.toString();
      const projectId = project._id.toString();
      userIds.add(userId);
      projectScopes.set(projectId, userId);
    });

    memberAdmins.forEach((membership) => {
      const userId = membership.userId.toString();
      const projectId = membership.projectId.toString();
      userIds.add(userId);
      if (!projectScopes.has(projectId)) {
        projectScopes.set(projectId, userId);
      }
    });

    let written = 0;
    const failures: Array<{ scope: string; message: string }> = [];

    for (const userId of userIds) {
      for (const period of periods) {
        try {
          await this.writeRollupSnapshot(userId, {
            timeRange: "today",
            period,
          });
          written += 1;
        } catch (error) {
          failures.push({
            scope: `workspace:${userId}:${period}`,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    for (const [projectId, userId] of projectScopes) {
      for (const period of periods) {
        try {
          await this.writeRollupSnapshot(userId, {
            filters: { projectId },
            timeRange: "today",
            period,
          });
          written += 1;
        } catch (error) {
          failures.push({
            scope: `project:${projectId}:${period}`,
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    return {
      written,
      failed: failures.length,
      failures: failures.slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }

  private async computeMetric(
    metric: AdvancedMetricName,
    scope: IntelligenceScope,
  ) {
    const counts = await this.eventCounts(scope);
    const latency = await this.transitionLatency(scope);
    const openPressure = await this.openTaskPressure(scope);
    const completed = counts.task_completed ?? 0;
    const created = counts.task_created ?? 0;
    const blockers =
      (counts.task_blocked ?? 0) + (counts.dependency_blocked ?? 0);
    const reopens = counts.task_reopened ?? 0;
    const assignments = counts.task_assigned ?? 0;
    const statusChanges =
      (counts.task_status_changed ?? 0) + (counts.workflow_stage_changed ?? 0);
    const dueChanges = counts.task_due_date_changed ?? 0;
    const priorityChanges = counts.task_priority_changed ?? 0;
    const escalations = counts.task_escalated ?? 0;
    const reviews =
      (counts.review_requested ?? 0) + (counts.review_completed ?? 0);

    const factors: Factor[] = [
      this.factor("blockers", "Blocker pressure", blockers, 1.4, "negative"),
      this.factor("reopens", "Reopen pressure", reopens, 1.2, "negative"),
      this.factor(
        "assignment_churn",
        "Assignment churn",
        assignments,
        0.8,
        "negative",
      ),
      this.factor(
        "status_changes",
        "Workflow transitions",
        statusChanges,
        0.45,
        "neutral",
      ),
      this.factor("due_changes", "Due-date churn", dueChanges, 0.9, "negative"),
      this.factor(
        "priority_changes",
        "Priority churn",
        priorityChanges,
        0.65,
        "negative",
      ),
      this.factor("escalations", "Escalations", escalations, 1.5, "negative"),
      this.factor("completed", "Completed work", completed, 1.1, "positive"),
      this.factor("created", "New work", created, 0.45, "neutral"),
      this.factor(
        "transition_latency",
        "Transition latency hours",
        latency.averageHours,
        0.35,
        "negative",
      ),
      this.factor(
        "open_pressure",
        "Open overdue/stale pressure",
        openPressure.pressure,
        1,
        "negative",
      ),
      this.factor("review_events", "Review activity", reviews, 0.4, "neutral"),
    ];

    const risk = this.clamp(
      blockers * 10 +
        reopens * 8 +
        assignments * 3 +
        dueChanges * 5 +
        priorityChanges * 4 +
        escalations * 12 +
        latency.averageHours / 3 +
        openPressure.pressure * 6 -
        completed * 2,
    );
    const friction = this.clamp(
      statusChanges * 2 +
        blockers * 9 +
        reopens * 7 +
        assignments * 4 +
        dueChanges * 4 +
        priorityChanges * 3,
    );
    const momentum = this.clamp(
      50 +
        completed * 8 +
        (counts.task_started ?? 0) * 4 -
        blockers * 8 -
        reopens * 6 -
        openPressure.pressure * 5,
    );
    const confidence = this.clamp(100 - risk);

    const values: Record<AdvancedMetricName, number> = {
      workflow_bottlenecks: this.clamp(
        blockers * 15 + latency.averageHours / 2,
      ),
      delivery_risk: risk,
      execution_confidence: confidence,
      workflow_friction: friction,
      coordination_overhead: this.clamp(
        assignments * 8 + reviews * 3 + statusChanges,
      ),
      operational_drift: this.clamp(
        friction + openPressure.pressure * 5 - completed * 2,
      ),
      project_momentum: momentum,
      velocity_degradation: this.clamp(
        Math.max(created - completed, 0) * 8 + blockers * 6,
      ),
      blocker_pressure: this.clamp(blockers * 18 + openPressure.blocked * 8),
      workflow_instability: this.clamp(
        statusChanges * 3 + reopens * 10 + priorityChanges * 4,
      ),
      review_latency: this.clamp(latency.reviewAverageHours),
      reopen_pressure: this.clamp(reopens * 20),
      escalation_frequency: this.clamp(escalations * 25),
      execution_volatility: this.clamp(
        statusChanges * 2 +
          dueChanges * 5 +
          priorityChanges * 4 +
          assignments * 3,
      ),
      operational_anomalies: this.clamp(risk + friction / 2),
      throughput_decay: this.clamp(Math.max(created - completed, 0) * 12),
      workflow_stagnation: this.clamp(
        openPressure.stale * 14 + latency.averageHours / 2,
      ),
      assignment_churn: this.clamp(assignments * 16),
      dependency_pressure: this.clamp(
        (counts.dependency_blocked ?? 0) * 25 + blockers * 8,
      ),
    };

    return {
      value: Math.round(values[metric]),
      confidence: this.metricConfidence(counts, latency.sampleSize),
      factors,
      counts,
      latency,
      openPressure,
    };
  }

  private async buildScope(
    userId: string,
    input: IntelligenceQueryInput,
  ): Promise<IntelligenceScope> {
    const timeRange = this.normalizeTimeRange(input.timeRange);
    const filters = this.validateFilters(input.filters);
    const { startDate, endDate } = this.resolveTimeRange(timeRange);
    const memberships = await ProjectMemberModel.find({ userId }).lean().exec();
    const ownedProjects = await ProjectModel.find({ userId })
      .select("_id")
      .lean()
      .exec();
    const accessibleProjectIds = [
      ...new Set([
        ...memberships.map((membership) => membership.projectId.toString()),
        ...ownedProjects.map((project) => project._id.toString()),
      ]),
    ];

    if (
      filters.projectId &&
      !accessibleProjectIds.includes(filters.projectId)
    ) {
      throw new HttpError(403, "Project is outside analytics scope");
    }

    if (filters.userId && filters.userId !== userId && !filters.projectId) {
      throw new HttpError(
        400,
        "Cross-user intelligence requires project scope",
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

  private buildEventMatch(scope: IntelligenceScope) {
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

  private async eventCounts(
    scope: IntelligenceScope,
  ): Promise<Record<string, number>> {
    const rows = await OperationalAnalyticsEventModel.aggregate([
      { $match: this.buildEventMatch(scope) },
      { $group: { _id: "$eventName", count: { $sum: 1 } } },
    ]);

    return Object.fromEntries(
      rows.map((row: { _id: string; count: number }) => [row._id, row.count]),
    );
  }

  private async transitionLatency(scope: IntelligenceScope) {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...this.buildEventMatch(scope),
          eventName: {
            $in: [
              "task_started",
              "task_completed",
              "review_requested",
              "review_completed",
            ],
          },
          entityType: { $in: ["task", "workflow"] },
        },
      },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: "$entityId",
          startedAt: {
            $min: {
              $cond: [
                { $eq: ["$eventName", "task_started"] },
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
          reviewRequestedAt: {
            $min: {
              $cond: [
                { $eq: ["$eventName", "review_requested"] },
                "$createdAt",
                null,
              ],
            },
          },
          reviewCompletedAt: {
            $max: {
              $cond: [
                { $eq: ["$eventName", "review_completed"] },
                "$createdAt",
                null,
              ],
            },
          },
        },
      },
      {
        $project: {
          hours: {
            $cond: [
              { $and: ["$startedAt", "$completedAt"] },
              {
                $divide: [
                  { $subtract: ["$completedAt", "$startedAt"] },
                  3600000,
                ],
              },
              null,
            ],
          },
          reviewHours: {
            $cond: [
              { $and: ["$reviewRequestedAt", "$reviewCompletedAt"] },
              {
                $divide: [
                  { $subtract: ["$reviewCompletedAt", "$reviewRequestedAt"] },
                  3600000,
                ],
              },
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          averageHours: { $avg: "$hours" },
          reviewAverageHours: { $avg: "$reviewHours" },
          sampleSize: {
            $sum: { $cond: [{ $ne: ["$hours", null] }, 1, 0] },
          },
        },
      },
    ];
    const [row] = await OperationalAnalyticsEventModel.aggregate(pipeline);
    return {
      averageHours: Number((row?.averageHours ?? 0).toFixed(2)),
      reviewAverageHours: Number((row?.reviewAverageHours ?? 0).toFixed(2)),
      sampleSize: row?.sampleSize ?? 0,
    };
  }

  private async openTaskPressure(scope: IntelligenceScope) {
    const projectObjectIds = scope.accessibleProjectIds
      .map((projectId) => new Types.ObjectId(projectId))
      .filter(Boolean);
    const base: Record<string, unknown> = scope.filters.projectId
      ? { projectId: new Types.ObjectId(scope.filters.projectId) }
      : {
          $or: [
            { userId: new Types.ObjectId(scope.userId) },
            { projectId: { $in: projectObjectIds } },
          ],
        };
    const staleBefore = new Date();
    staleBefore.setDate(staleBefore.getDate() - 7);
    const today = new Date().toISOString().slice(0, 10);
    const [blocked, stale, overdue] = await Promise.all([
      TaskModel.countDocuments({ ...base, isBlocked: true }),
      TaskModel.countDocuments({
        ...base,
        updatedAt: { $lte: staleBefore },
        status: { $nin: ["DONE", "rolled_over"] },
      }),
      TaskModel.countDocuments({
        ...base,
        date: { $lt: today },
        status: { $nin: ["DONE", "rolled_over"] },
      }),
    ]);

    return { blocked, stale, overdue, pressure: blocked + stale + overdue };
  }

  private previousScope(scope: IntelligenceScope): IntelligenceScope {
    if (!scope.startDate) {
      return scope;
    }

    const duration = scope.endDate.getTime() - scope.startDate.getTime();
    return {
      ...scope,
      endDate: new Date(scope.startDate.getTime()),
      startDate: new Date(scope.startDate.getTime() - duration),
    };
  }

  private normalizeMetric(metric?: string): AdvancedMetricName {
    if (!metric || !this.metricSet.has(metric)) {
      throw new HttpError(400, "Unsupported operational intelligence metric");
    }

    return metric as AdvancedMetricName;
  }

  private validateFilters(filters?: MetricScopeFilters): MetricScopeFilters {
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

    const normalized: MetricScopeFilters = {};
    for (const key of ["projectId", "userId"] as const) {
      const value = filters[key];
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

  private normalizeRollupPeriod(period?: RollupPeriod): RollupPeriod {
    if (period === undefined) {
      return "daily";
    }

    if (!rollupPeriods.includes(period)) {
      throw new HttpError(400, "Unsupported rollup period");
    }

    return period;
  }

  private rollupBucket(period: RollupPeriod, anchor: Date) {
    const bucketStart = new Date(anchor);
    bucketStart.setHours(0, 0, 0, 0);

    if (period === "weekly") {
      const day = bucketStart.getDay();
      bucketStart.setDate(bucketStart.getDate() - day);
    }

    if (period === "monthly") {
      bucketStart.setDate(1);
    }

    const bucketEnd = new Date(bucketStart);
    if (period === "daily") {
      bucketEnd.setDate(bucketEnd.getDate() + 1);
    } else if (period === "weekly") {
      bucketEnd.setDate(bucketEnd.getDate() + 7);
    } else {
      bucketEnd.setMonth(bucketEnd.getMonth() + 1);
    }

    return { bucketStart, bucketEnd };
  }

  private resolveTimeRange(timeRange: TimeRange) {
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

  private factor(
    key: string,
    label: string,
    value: number,
    weight: number,
    direction: Factor["direction"],
  ): Factor {
    return {
      key,
      label,
      value: Number(value.toFixed(2)),
      weight,
      direction,
      explanation: `${label} contributed ${Number((value * weight).toFixed(2))} weighted points.`,
    };
  }

  private rankFactors(factors: Factor[]): Factor[] {
    return [...factors].sort(
      (a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight),
    );
  }

  private buildExplainabilityGraph(
    metric: string,
    factors: Factor[],
    causalContext?: Record<string, unknown>,
  ) {
    const propagation = causalContext?.propagation as
      | Array<{ from: string; to: string; mechanism: string; impact: number }>
      | undefined;

    return {
      nodes: [
        {
          id: metric,
          type: "metric",
          label: metric.replace(/_/g, " "),
          confidence: causalContext?.confidence,
        },
        ...factors.slice(0, 6).map((factor) => ({
          id: factor.key,
          type: "factor",
          label: factor.label,
          direction: factor.direction,
          value: factor.value,
          weightedContribution: Number(
            (factor.value * factor.weight).toFixed(2),
          ),
        })),
        ...(propagation ?? []).map((edge) => ({
          id: `${edge.from}_${edge.to}`,
          type: "causal_transition",
          label: edge.mechanism,
          impact: edge.impact,
        })),
      ],
      edges: [
        ...factors.slice(0, 6).map((factor) => ({
          from: factor.key,
          to: metric,
          weight: factor.weight,
          direction: factor.direction,
          explanation: factor.explanation,
        })),
        ...(propagation ?? []).map((edge) => ({
          from: edge.from,
          to: edge.to,
          weight: edge.impact,
          direction: "causal",
          explanation: edge.mechanism,
        })),
      ],
    };
  }

  private semanticMetadata(metric: string) {
    return {
      version: "2.0.0",
      semanticType: "event_derived_operational_intelligence",
      AIVisibility: "safe",
      caveats: [
        "Scores use semantic event history plus authorized current-state pressure where operationally justified.",
        "Baseline comparisons use previous equivalent time window.",
      ],
      lineage: this.lineageFor(metric),
    };
  }

  private lineageFor(metric: string) {
    const sourceEventsByMetric: Record<string, string[]> = {
      delivery_risk: [
        "task_blocked",
        "dependency_blocked",
        "task_reopened",
        "task_due_date_changed",
        "task_escalated",
      ],
      execution_confidence: [
        "task_completed",
        "task_blocked",
        "task_reopened",
        "task_started",
      ],
      workflow_friction: [
        "task_status_changed",
        "workflow_stage_changed",
        "task_reopened",
        "task_assigned",
      ],
      project_momentum: ["task_started", "task_completed", "task_created"],
    };

    return {
      sourceMetrics: metric === "execution_confidence" ? ["delivery_risk"] : [],
      sourceEvents: sourceEventsByMetric[metric] ?? [
        "task_created",
        "task_completed",
        "task_status_changed",
        "task_blocked",
        "task_reopened",
      ],
      sourceCollections: ["OperationalAnalyticsEvent", "Task"],
      transformation:
        "Authorized semantic event replay -> factor extraction -> weighted operational score -> explainability graph.",
      reasoningOutputs: this.reasoningOutputsFor(metric),
      contributorMetrics: this.contributorMetricsFor(metric),
      semanticCaveats: this.semanticMetadataShallow().caveats,
    };
  }

  private reasoningChain(
    metric: string,
    factors: Factor[],
    causalContext?: Record<string, unknown>,
  ): string[] {
    const primary = factors[0];
    const secondary = factors[1];
    return [
      `Read authorized operational events for ${metric}.`,
      "Extract workflow transitions, blocker/reopen pressure, ownership churn, and state pressure.",
      `Rank contributors by weighted semantic impact; primary contributor is ${primary?.label ?? "none"}.`,
      `Correlate ${primary?.label ?? "primary factor"} with ${secondary?.label ?? "secondary factor"} to infer propagation path.`,
      `Compare current value with previous semantic window; delta is ${(causalContext?.delta as number | undefined) ?? 0}.`,
      `Produce AI-safe causal explanation with confidence ${(causalContext?.confidence as number | undefined) ?? 0}/100.`,
    ];
  }

  private narrative(
    metric: string,
    value: number,
    factors: Factor[],
    causalContext?: Record<string, unknown>,
  ): string {
    const top = factors.slice(0, 3).map((factor) => factor.label.toLowerCase());
    const delta = Number(causalContext?.delta ?? 0);
    const pattern = String(
      causalContext?.primaryPattern ?? "operational pressure",
    );
    return `${metric.replace(/_/g, " ")} is ${value}/100 because ${pattern} ${delta >= 0 ? "increased" : "improved"} through ${top.join(", ") || "no material factors"}, creating downstream pressure on delivery confidence and workflow stability.`;
  }

  private summaryNarrative(
    risk: number,
    confidence: number,
    factors: Factor[],
  ): string {
    const top = factors.slice(0, 3).map((factor) => factor.label.toLowerCase());
    return `Delivery risk ${risk}/100 and execution confidence ${confidence}/100. Main causal signals: ${top.join(", ") || "none"}.`;
  }

  private anomalyExplanation(metric: string, deviation: number): string {
    const direction = deviation >= 0 ? "increased" : "decreased";
    return `${metric.replace(/_/g, " ")} ${direction} against previous semantic baseline because workflow pressure, transition latency, or contributor imbalance changed materially.`;
  }

  private trendInterpretation(
    metric: string,
    delta: number,
    acceleration: number,
    factors: Factor[],
  ): string {
    if (delta === 0) {
      return `${metric.replace(/_/g, " ")} is stable against previous window.`;
    }

    const top = factors[0]?.label.toLowerCase() ?? "semantic contributor mix";
    return `${metric.replace(/_/g, " ")} ${delta > 0 ? "rose" : "fell"} by ${Math.abs(delta)} points with ${Math.abs(acceleration)} acceleration, mainly from ${top}.`;
  }

  private topSignals(eventNames: string[]) {
    const counts = eventNames.reduce<Record<string, number>>(
      (acc, eventName) => {
        acc[eventName] = (acc[eventName] ?? 0) + 1;
        return acc;
      },
      {},
    );

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([eventName, count]) => ({ eventName, count }));
  }

  private eventCausalSignals(eventName: string): string[] {
    if (eventName.includes("blocked"))
      return ["delivery_risk", "workflow_friction"];
    if (eventName.includes("reopened"))
      return ["reopen_pressure", "execution_confidence"];
    if (eventName.includes("assigned"))
      return ["assignment_churn", "coordination_overhead"];
    if (eventName.includes("completed"))
      return ["project_momentum", "execution_confidence"];
    return ["operational_timeline"];
  }

  private toReplayEvent(event: any) {
    const impact =
      event.metadata?.operationalImpact ?? this.eventImpact(event.eventName);
    return {
      eventId: event._id.toString(),
      eventName: event.eventName,
      entityType: event.entityType,
      entityId: event.entityId,
      projectId: event.projectId ?? null,
      actorUserId: event.userId,
      occurredAt: event.createdAt,
      semanticMeaning:
        typeof event.metadata?.semanticMeaning === "string"
          ? event.metadata.semanticMeaning
          : this.eventMeaning(event.eventName),
      transition: (event.metadata?.transition ?? {
        before:
          event.metadata?.previousStatus ??
          event.metadata?.previousStage ??
          null,
        after: event.metadata?.nextStatus ?? event.metadata?.nextStage ?? null,
      }) as unknown,
      workflowContext: event.metadata?.workflowContext ?? {},
      timelineContext: event.metadata?.timelineContext ?? {},
      contributorMetadata: event.metadata?.contributorMetadata ?? {},
      operationalImpact: impact,
      semanticTags:
        event.metadata?.semanticTags ??
        this.semanticTagsForEvent(event.eventName),
      causality: event.metadata?.causality ?? {
        causalRole: this.causalRoleForEvent(event.eventName),
        downstreamMetrics: this.eventCausalSignals(event.eventName),
      },
      causalSignals: this.eventCausalSignals(event.eventName),
    };
  }

  private deriveReplaySignals(rows: Array<Record<string, any>>) {
    if (rows.length === 0) return [];
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.eventName] = (acc[row.eventName] ?? 0) + 1;
      return acc;
    }, {});
    const lastAt = rows[rows.length - 1]?.occurredAt ?? new Date();
    const projectId = rows.find((row) => row.projectId)?.projectId ?? null;
    const derived: Array<Record<string, any>> = [];
    const push = (
      eventName: string,
      semanticMeaning: string,
      impact: number,
      contributors: string[],
    ) => {
      derived.push({
        eventId: `derived:${eventName}:${derived.length}`,
        eventName,
        entityType: "workflow",
        entityId: projectId ?? "workspace",
        projectId,
        actorUserId: "semantic-intelligence",
        occurredAt: lastAt,
        semanticMeaning,
        transition: null,
        workflowContext: { derivedFrom: contributors },
        timelineContext: {
          narrativeRole: "derived_signal",
          replayPriority: impact >= 75 ? "high" : "normal",
          replayCategory: ["causal_replay", "semantic_derivation"],
        },
        contributorMetadata: { contributors },
        operationalImpact: {
          score: impact,
          severity: impact >= 75 ? "high" : "medium",
          polarity: "negative",
          confidence: this.clamp(45 + contributors.length * 10),
        },
        semanticTags: [
          "derived_signal",
          "causal_replay",
          "operational_intelligence",
        ],
        causality: {
          source: "semantic_replay_derivation",
          causalRole: "derived_signal",
          downstreamMetrics: [
            "delivery_risk",
            "execution_confidence",
            "workflow_friction",
          ],
        },
        causalSignals: ["delivery_risk", "workflow_friction"],
      });
    };

    const blockers =
      (counts.task_blocked ?? 0) + (counts.dependency_blocked ?? 0);
    const completed = counts.task_completed ?? 0;
    const created = counts.task_created ?? 0;
    const reassignment =
      (counts.task_assigned ?? 0) + (counts.task_unassigned ?? 0);
    const reviewDelay = Math.max(
      (counts.review_requested ?? 0) - (counts.review_completed ?? 0),
      0,
    );
    const churn =
      reassignment +
      (counts.task_priority_changed ?? 0) +
      (counts.task_due_date_changed ?? 0);

    if (blockers > 0) {
      push(
        "blocker_introduced",
        "Blocker pressure entered workflow and raised delivery risk.",
        78,
        ["task_blocked", "dependency_blocked"],
      );
    }
    if (blockers >= 2) {
      push(
        "blocker_propagated",
        "Multiple blocker signals indicate downstream propagation risk.",
        88,
        ["task_blocked", "dependency_blocked"],
      );
    }
    if (reassignment >= 3) {
      push(
        "reassignment_spike",
        "Ownership churn crossed stability threshold and increased coordination overhead.",
        76,
        ["task_assigned", "task_unassigned"],
      );
    }
    if (reviewDelay > 0) {
      push(
        "review_delay_introduced",
        "Open review demand exceeded review completion throughput.",
        72,
        ["review_requested", "review_completed"],
      );
    }
    if (created - completed >= 4) {
      push(
        "throughput_collapse_detected",
        "Task inflow materially exceeded completion throughput.",
        86,
        ["task_created", "task_completed"],
      );
    }
    if (churn >= 4) {
      push(
        "churn_threshold_crossed",
        "Priority, due-date, or ownership churn crossed operational stability threshold.",
        74,
        ["task_assigned", "task_priority_changed", "task_due_date_changed"],
      );
    }

    return derived;
  }

  private buildReplayChains(rows: Array<Record<string, any>>) {
    const has = (eventName: string) =>
      rows.some((row) => row.eventName === eventName);
    const chains: Array<Record<string, unknown>> = [];
    const add = (
      id: string,
      stages: string[],
      meaning: string,
      confidence: number,
    ) => {
      const presentStages = stages.filter(has);
      if (presentStages.length >= 2) {
        chains.push({
          id,
          stages: presentStages,
          meaning,
          confidence,
          impact: this.clamp(presentStages.length * 18 + confidence / 3),
        });
      }
    };

    add(
      "blocker_to_delivery_risk",
      [
        "blocker_introduced",
        "blocker_propagated",
        "workflow_stall_detected",
        "throughput_collapse_detected",
      ],
      "Blocker pressure propagated into delivery risk.",
      82,
    );
    add(
      "churn_to_review_latency",
      [
        "reassignment_spike",
        "review_delay_introduced",
        "churn_threshold_crossed",
      ],
      "Ownership churn increased review and coordination latency.",
      76,
    );
    add(
      "inflow_to_confidence_drop",
      [
        "task_created",
        "throughput_collapse_detected",
        "overdue_accumulation_increased",
      ],
      "Work inflow exceeded completion and degraded confidence.",
      74,
    );

    return chains;
  }

  private replayNarrative(
    chains: Array<Record<string, unknown>>,
    rows: Array<Record<string, any>>,
  ): string {
    if (chains.length > 0) {
      return chains.map((chain) => chain.meaning).join(" ");
    }

    const top = this.topSignals(rows.map((row) => row.eventName)).slice(0, 3);
    return `Operational state evolved through ${top.map((signal) => signal.eventName.replace(/_/g, " ")).join(", ") || "low-volume semantic events"}.`;
  }

  private replayPropagationGraph(chains: Array<Record<string, any>>) {
    const nodes = new Map<string, Record<string, unknown>>();
    const edges: Array<Record<string, unknown>> = [];
    chains.forEach((chain) => {
      chain.stages.forEach((stage: string, index: number) => {
        nodes.set(stage, {
          id: stage,
          label: stage.replace(/_/g, " "),
          type: "replay_stage",
        });
        const next = chain.stages[index + 1];
        if (next) {
          edges.push({
            from: stage,
            to: next,
            chainId: chain.id,
            confidence: chain.confidence,
            impact: chain.impact,
          });
        }
      });
    });

    return { nodes: [...nodes.values()], edges };
  }

  private replayConfidence(
    rows: Array<Record<string, any>>,
    chainCount: number,
  ): number {
    return this.clamp(35 + rows.length * 2 + chainCount * 15);
  }

  private buildCausalContext(
    metric: AdvancedMetricName | string,
    current: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    previous: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    factors: Factor[],
  ) {
    const delta = Number((current.value - previous.value).toFixed(2));
    const primary = factors[0];
    const secondary = factors[1];

    return {
      metric,
      delta,
      confidence: current.confidence,
      primaryPattern: primary?.label ?? "operational pressure",
      causalSummary: `${metric.replace(/_/g, " ")} changed by ${delta} points as ${primary?.label.toLowerCase() ?? "operational pressure"} interacted with ${secondary?.label.toLowerCase() ?? "baseline workflow state"}.`,
      propagation: this.causalPropagationEdges(primary, secondary),
      contributors: this.contributorWeights(factors).slice(0, 5),
      baseline: {
        currentValue: current.value,
        previousValue: previous.value,
        delta,
      },
      workflowEffects: {
        transitionLatencyHours: current.latency.averageHours,
        reviewLatencyHours: current.latency.reviewAverageHours,
        blockedOpenWork: current.openPressure.blocked,
        staleOpenWork: current.openPressure.stale,
        overdueOpenWork: current.openPressure.overdue,
      },
    };
  }

  private causalPropagationEdges(primary?: Factor, secondary?: Factor) {
    if (!primary) return [];
    return [
      {
        from: primary.key,
        to: secondary?.key ?? "delivery_risk",
        mechanism: `${primary.label} created downstream pressure on ${secondary?.label ?? "delivery risk"}.`,
        impact: Number(Math.abs(primary.value * primary.weight).toFixed(2)),
      },
      {
        from: secondary?.key ?? primary.key,
        to: "execution_confidence",
        mechanism: "Accumulated workflow pressure reduced confidence score.",
        impact: secondary
          ? Number(Math.abs(secondary.value * secondary.weight).toFixed(2))
          : 10,
      },
    ];
  }

  private contributorWeights(factors: Factor[]) {
    const total = factors.reduce(
      (sum, factor) => sum + Math.abs(factor.value * factor.weight),
      0,
    );
    return factors.map((factor) => ({
      ...factor,
      weightedContribution: Number((factor.value * factor.weight).toFixed(2)),
      contributionShare:
        total === 0
          ? 0
          : Number(
              ((Math.abs(factor.value * factor.weight) / total) * 100).toFixed(
                1,
              ),
            ),
    }));
  }

  private dependencyAnalysis(counts: Record<string, number>) {
    const dependencyBlocks = counts.dependency_blocked ?? 0;
    const taskBlocks = counts.task_blocked ?? 0;
    return {
      dependencyBlocks,
      taskBlocks,
      bottleneckLikelihood: this.clamp(dependencyBlocks * 25 + taskBlocks * 10),
      interpretation:
        dependencyBlocks > 0
          ? "Dependency pressure is directly contributing to delivery risk."
          : "No explicit dependency bottleneck event in current window.",
    };
  }

  private propagationAnalysis(
    counts: Record<string, number>,
    openPressure: {
      blocked: number;
      stale: number;
      overdue: number;
      pressure: number;
    },
  ) {
    const blockerEvents =
      (counts.task_blocked ?? 0) + (counts.dependency_blocked ?? 0);
    const churnEvents =
      (counts.task_assigned ?? 0) +
      (counts.task_unassigned ?? 0) +
      (counts.task_priority_changed ?? 0) +
      (counts.task_due_date_changed ?? 0);
    return {
      blockerPropagationScore: this.clamp(
        blockerEvents * 18 + openPressure.blocked * 12,
      ),
      churnPropagationScore: this.clamp(churnEvents * 10),
      overduePropagationScore: this.clamp(
        openPressure.overdue * 15 + openPressure.stale * 8,
      ),
      affectedSignals: [
        blockerEvents > 0 ? "blocker cascade risk" : null,
        churnEvents > 2 ? "coordination churn risk" : null,
        openPressure.overdue > 0 ? "overdue accumulation" : null,
      ].filter(Boolean),
      interpretation:
        blockerEvents + churnEvents + openPressure.pressure > 0
          ? "Operational pressure has propagation paths across blockers, churn, or stale work."
          : "No material propagation path detected.",
    };
  }

  private transitionLatencyAnalysis(latency: {
    averageHours: number;
    reviewAverageHours: number;
    sampleSize: number;
  }) {
    return {
      averageHours: latency.averageHours,
      reviewAverageHours: latency.reviewAverageHours,
      sampleSize: latency.sampleSize,
      latencyRisk: this.clamp(
        latency.averageHours / 2 + latency.reviewAverageHours,
      ),
      interpretation:
        latency.sampleSize === 0
          ? "Insufficient transition samples for latency confidence."
          : "Transition latency contributes to workflow stagnation and review pressure.",
    };
  }

  private eventCorrelation(counts: Record<string, number>) {
    const pairs = [
      ["task_blocked", "task_reopened"],
      ["task_assigned", "review_requested"],
      ["task_created", "task_completed"],
      ["task_escalated", "task_due_date_changed"],
    ] as const;
    return pairs.map(([left, right]) => ({
      signals: [left, right],
      leftCount: counts[left] ?? 0,
      rightCount: counts[right] ?? 0,
      strength: this.clamp(
        Math.min(counts[left] ?? 0, counts[right] ?? 0) * 25,
      ),
      interpretation: `${left.replace(/_/g, " ")} and ${right.replace(/_/g, " ")} overlap as causal contributors when both are present.`,
    }));
  }

  private semanticMetadataShallow() {
    return {
      caveats: [
        "Scores use semantic event history plus authorized current-state pressure where operationally justified.",
        "Baseline comparisons use previous equivalent time window.",
      ],
    };
  }

  private reasoningOutputsFor(metric: string) {
    if (metric === "delivery_risk") {
      return [
        "reasoning_summary",
        "anomalies",
        "replay_timeline",
        "explain_metric",
      ];
    }
    if (metric === "project_momentum") {
      return ["trends", "reasoning_summary", "explain_metric"];
    }
    return ["explain_metric", "trends", "governance"];
  }

  private contributorMetricsFor(metric: string) {
    const map: Record<string, string[]> = {
      delivery_risk: [
        "blocker_pressure",
        "throughput_decay",
        "review_latency",
        "assignment_churn",
      ],
      execution_confidence: [
        "delivery_risk",
        "project_momentum",
        "workflow_stagnation",
      ],
      workflow_friction: [
        "assignment_churn",
        "reopen_pressure",
        "dependency_pressure",
      ],
      project_momentum: ["throughput_decay", "execution_confidence"],
    };
    return map[metric] ?? ["delivery_risk", "workflow_friction"];
  }

  private metricRelationships(metric: string) {
    return {
      metric,
      sourceSignals: this.lineageFor(metric).sourceEvents,
      contributorMetrics: this.contributorMetricsFor(metric),
      reasoningOutputs: this.reasoningOutputsFor(metric),
      relationship:
        "Metric -> source signals -> operational events -> causal factors -> reasoning outputs.",
    };
  }

  private semanticMaturity(metric: string) {
    return [
      "delivery_risk",
      "execution_confidence",
      "workflow_friction",
    ].includes(metric)
      ? "causal_explainable"
      : "governed_semantic";
  }

  private replayCapabilities(metric: string) {
    return {
      causalChains: true,
      operationalNarrative: true,
      propagationGraph: [
        "delivery_risk",
        "workflow_friction",
        "blocker_pressure",
      ].includes(metric),
      confidenceScoring: true,
    };
  }

  private eventMeaning(eventName: string): string {
    return `${eventName.replace(/_/g, " ")} contributes to semantic operational state.`;
  }

  private semanticTagsForEvent(eventName: string) {
    return [
      "operational_event",
      ...this.eventCausalSignals(eventName),
      eventName.includes("blocked") ? "blocker" : "workflow",
    ];
  }

  private causalRoleForEvent(eventName: string) {
    if (eventName.includes("blocked") || eventName.includes("created"))
      return "cause";
    if (eventName.includes("changed") || eventName.includes("assigned"))
      return "propagation";
    if (eventName.includes("completed") || eventName.includes("unblocked"))
      return "recovery";
    return "contributor";
  }

  private eventImpact(eventName: string) {
    const score = eventName.includes("blocked")
      ? 80
      : eventName.includes("reopened") || eventName.includes("escalated")
        ? 75
        : eventName.includes("completed")
          ? 25
          : 45;
    return {
      score,
      severity: score >= 75 ? "high" : score >= 50 ? "medium" : "low",
      confidence: 65,
    };
  }

  private anomalyCategory(metric: AdvancedMetricName) {
    const map: Record<AdvancedMetricName, string> = {
      workflow_bottlenecks: "dependency_instability",
      delivery_risk: "workflow_collapse",
      execution_confidence: "execution_volatility",
      workflow_friction: "operational_drift",
      coordination_overhead: "assignment_churn_spike",
      operational_drift: "operational_drift",
      project_momentum: "throughput_decay",
      velocity_degradation: "throughput_decay",
      blocker_pressure: "blocker_cascade",
      workflow_instability: "execution_volatility",
      review_latency: "review_stagnation",
      reopen_pressure: "execution_volatility",
      escalation_frequency: "escalation_storm",
      execution_volatility: "execution_volatility",
      operational_anomalies: "operational_drift",
      throughput_decay: "throughput_decay",
      workflow_stagnation: "review_stagnation",
      assignment_churn: "assignment_churn_spike",
      dependency_pressure: "dependency_instability",
    };
    return map[metric];
  }

  private anomalyTimeline(
    scope: IntelligenceScope,
    metric: AdvancedMetricName,
    deviation: number,
  ) {
    return {
      windowStart: scope.startDate ?? null,
      windowEnd: scope.endDate,
      detectedAt: new Date().toISOString(),
      phase: deviation >= 0 ? "degradation" : "recovery",
      metric,
    };
  }

  private operationalImpact(
    metric: AdvancedMetricName,
    score: number,
    current: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
  ) {
    return {
      score,
      priority: score >= 75 ? "urgent" : score >= 40 ? "watch" : "monitor",
      deliveryRiskContribution:
        metric === "delivery_risk" ? current.value : Math.round(score / 2),
      affectedAreas: this.affectedWorkflows(metric, current.counts),
    };
  }

  private affectedWorkflows(
    metric: AdvancedMetricName,
    counts: Record<string, number>,
  ) {
    return [
      (counts.review_requested ?? 0) > (counts.review_completed ?? 0)
        ? "review"
        : null,
      (counts.task_blocked ?? 0) + (counts.dependency_blocked ?? 0) > 0
        ? "blocked_work"
        : null,
      (counts.task_assigned ?? 0) > 2 ? "ownership_coordination" : null,
      metric.includes("throughput") || metric.includes("velocity")
        ? "delivery_throughput"
        : null,
    ].filter(Boolean);
  }

  private mitigationHints(
    metric: AdvancedMetricName,
    current: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
  ) {
    const hints: string[] = [];
    if (
      (current.counts.task_blocked ?? 0) +
        (current.counts.dependency_blocked ?? 0) >
      0
    ) {
      hints.push(
        "Prioritize blocker removal and inspect dependent tasks first.",
      );
    }
    if (
      (current.counts.review_requested ?? 0) >
      (current.counts.review_completed ?? 0)
    ) {
      hints.push("Reduce review queue latency before adding more inflow.");
    }
    if ((current.counts.task_assigned ?? 0) > 2) {
      hints.push("Stabilize ownership to reduce coordination overhead.");
    }
    if (current.openPressure.overdue > 0) {
      hints.push(
        "Triage overdue accumulation and separate stale work from active commitments.",
      );
    }
    return hints.length > 0
      ? hints
      : [`Monitor ${metric.replace(/_/g, " ")} for sustained movement.`];
  }

  private degradationVelocity(
    metric: AdvancedMetricName,
    delta: number,
    acceleration: number,
  ) {
    const riskMetric = !["execution_confidence", "project_momentum"].includes(
      metric,
    );
    const signed = riskMetric
      ? delta + acceleration / 2
      : -delta - acceleration / 2;
    return this.clamp(signed);
  }

  private momentumScore(
    metric: AdvancedMetricName,
    value: number,
    delta: number,
  ) {
    if (metric === "project_momentum" || metric === "execution_confidence") {
      return this.clamp(value + delta);
    }
    return this.clamp(100 - value - delta);
  }

  private directionalConfidence(
    delta: number,
    volatility: number,
    confidence: number,
  ) {
    return this.clamp(
      confidence - Math.max(0, 12 - Math.abs(delta)) - volatility / 5,
    );
  }

  private recoveryTrajectory(
    metric: AdvancedMetricName,
    delta: number,
    acceleration: number,
  ) {
    const positiveMetric = [
      "execution_confidence",
      "project_momentum",
    ].includes(metric);
    const recovering = positiveMetric
      ? delta > 0 && acceleration >= 0
      : delta < 0 && acceleration <= 0;
    if (recovering) return "recovering";
    const degrading = positiveMetric ? delta < 0 : delta > 0;
    return degrading ? "degrading" : "stable";
  }

  private trendImpact(
    metric: AdvancedMetricName,
    delta: number,
    acceleration: number,
  ) {
    return {
      impactScore: this.clamp(Math.abs(delta) * 2 + Math.abs(acceleration)),
      operationalMeaning:
        this.recoveryTrajectory(metric, delta, acceleration) === "degrading"
          ? "Trend is increasing operational risk."
          : "Trend is stable or improving operational state.",
    };
  }

  private summaryCausalNarrative(
    risk: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    confidence: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    friction: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    momentum: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    factors: Factor[],
  ) {
    const inflow = risk.counts.task_created ?? 0;
    const completion = risk.counts.task_completed ?? 0;
    const blockerCount =
      (risk.counts.task_blocked ?? 0) + (risk.counts.dependency_blocked ?? 0);
    return `Operational state is shaped by inflow/completion balance (${inflow}/${completion}), blocker propagation (${blockerCount}), workflow friction (${friction.value}/100), and momentum (${momentum.value}/100). Top causal factor: ${factors[0]?.label ?? "none"}. Confidence remains ${confidence.value}/100.`;
  }

  private semanticScoreInterpretation(metric: string, value: number) {
    if (metric === "execution_confidence" || metric === "project_momentum") {
      return value >= 70 ? "healthy" : value >= 40 ? "fragile" : "degraded";
    }
    return value >= 70 ? "high_pressure" : value >= 40 ? "watch" : "stable";
  }

  private reasoningRecommendations(
    risk: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    confidence: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    friction: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
    momentum: Awaited<
      ReturnType<SemanticOperationalIntelligenceService["computeMetric"]>
    >,
  ) {
    const recommendations: string[] = [];
    if (risk.value >= 60)
      recommendations.push(
        "Resolve blocker and overdue pressure before expanding scope.",
      );
    if (confidence.value < 50)
      recommendations.push(
        "Rebuild execution confidence through smaller completion batches.",
      );
    if (friction.value >= 50)
      recommendations.push("Reduce assignment, due-date, and priority churn.");
    if (momentum.value < 45)
      recommendations.push(
        "Focus on throughput recovery and stalled-work clearance.",
      );
    return recommendations;
  }

  private metricConfidence(
    counts: Record<string, number>,
    latencySamples: number,
  ): number {
    const eventCount = Object.values(counts).reduce(
      (sum, count) => sum + count,
      0,
    );
    return this.clamp(35 + eventCount * 3 + latencySamples * 5);
  }

  private direction(delta: number): "up" | "down" | "flat" {
    if (delta > 0) return "up";
    if (delta < 0) return "down";
    return "flat";
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, Number(value.toFixed(2))));
  }

  private async assertAnyAnalyticsScope(userId: string) {
    const [membership, project] = await Promise.all([
      ProjectMemberModel.exists({ userId }),
      ProjectModel.exists({ userId }),
    ]);

    if (!membership && !project) {
      throw new HttpError(403, "No analytics scope available");
    }
  }
}

export default new SemanticOperationalIntelligenceService();
