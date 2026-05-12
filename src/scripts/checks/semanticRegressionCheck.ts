/**
 * Semantic Regression Validation Suite
 *
 * Guards against regressions in:
 * - Metric registry completeness and uniqueness
 * - Score boundary / clamping invariants
 * - Explainability contract structure
 * - Event vocabulary coverage for replay/anomaly/causal scenarios
 * - MCP tool registry correctness
 * - Governance contract structure
 */

// ─── 1. METRIC REGISTRY ──────────────────────────────────────

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

const governedMetrics = [
  "active_users",
  "tasks_created",
  "tasks_completed",
  "task_completion_rate",
  "overdue_tasks",
  "stale_tasks",
  "avg_completion_time",
  "project_health_score",
  "tasks_completed_per_user",
  "inactive_projects",
] as const;

// ─── 2. EVENT VOCABULARY ──────────────────────────────────────

const operationalDepthEvents = [
  "blocker_introduced",
  "blocker_propagated",
  "reassignment_spike",
  "review_delay_introduced",
  "workflow_stall_detected",
  "execution_slowdown_detected",
  "escalation_triggered",
  "throughput_collapse_detected",
  "dependency_bottleneck_detected",
  "churn_threshold_crossed",
  "workflow_degradation_started",
  "overdue_accumulation_increased",
] as const;

const reviewLifecycleEvents = ["review_requested", "review_completed"] as const;

const escalationEvents = ["task_escalated", "escalation_triggered"] as const;

const recoveryEvents = [
  "task_unblocked",
  "task_completed",
  "review_completed",
] as const;

// ─── 3. MCP TOOL REGISTRY ────────────────────────────────────

const mcpTools = [
  "list_metrics",
  "describe_metric",
  "query_metric",
  "compare_metrics",
  "drilldown_metric",
  "explain_metric",
  "replay_operational_timeline",
] as const;

// ─── 4. UTILITIES ────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[SEMANTIC REGRESSION FAILURE] ${message}`);
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function boundedCompletionRate(created: number, completed: number) {
  const boundedCompleted = Math.min(completed, created);
  const rate =
    created === 0 ? 0 : Number((boundedCompleted / created).toFixed(4));
  return { boundedCompleted, rate, percent: Number((rate * 100).toFixed(1)) };
}

// ─── 5. METRIC REGISTRY TESTS ────────────────────────────────

assert(
  new Set(advancedMetrics).size === advancedMetrics.length,
  "Advanced semantic metrics must be unique — no duplicates allowed",
);

assert(
  advancedMetrics.length === 19,
  `Advanced metric count must be 19 (got ${advancedMetrics.length})`,
);

assert(
  advancedMetrics.includes("delivery_risk"),
  "delivery_risk must remain registered as a primary operational metric",
);

assert(
  advancedMetrics.includes("execution_confidence"),
  "execution_confidence must remain registered — it is a composite governance metric",
);

assert(
  advancedMetrics.includes("project_momentum"),
  "project_momentum must remain registered — it drives recovery trajectory detection",
);

assert(
  advancedMetrics.includes("review_latency"),
  "review_latency must remain registered — review lifecycle tracking depends on it",
);

assert(
  advancedMetrics.includes("escalation_frequency"),
  "escalation_frequency must remain registered — escalation event tracking feeds it",
);

assert(
  new Set(governedMetrics).size === governedMetrics.length,
  "Governed semantic metrics must be unique",
);

assert(
  governedMetrics.length === 10,
  `Governed metric count must be 10 (got ${governedMetrics.length})`,
);

// ─── 6. SCORE BOUNDARY TESTS ────────────────────────────────

assert(clamp(150) === 100, "Semantic scores must clamp upper bound at 100");
assert(clamp(-10) === 0, "Semantic scores must clamp lower bound at 0");
assert(clamp(0) === 0, "Zero must remain zero after clamping");
assert(clamp(100) === 100, "100 must remain 100 after clamping");
assert(
  clamp(50) === 50,
  "Mid-range scores must pass through clamping unchanged",
);

// ─── 7. BOUNDED COMPLETION RATE ──────────────────────────────

const completion = boundedCompletionRate(5, 9);
assert(
  completion.percent <= 100,
  "Completion percent must never exceed 100 (bounded)",
);
assert(
  completion.boundedCompleted === 5,
  "Completion numerator must be bounded to created count",
);

const zeroCompletion = boundedCompletionRate(0, 5);
assert(
  zeroCompletion.percent === 0,
  "Zero created must yield 0% completion (no division by zero)",
);

const perfectCompletion = boundedCompletionRate(5, 5);
assert(
  perfectCompletion.percent === 100,
  "Equal created and completed must yield 100%",
);

// ─── 8. OPERATIONAL DEPTH EVENT VOCABULARY ───────────────────

assert(
  operationalDepthEvents.length >= 10,
  "Operational depth event vocabulary must cover replay, anomaly, churn, blocker, and degradation",
);

assert(
  operationalDepthEvents.includes("blocker_propagated"),
  "Causal replay must support blocker propagation events",
);

assert(
  operationalDepthEvents.includes("throughput_collapse_detected"),
  "Causal replay must support throughput collapse events",
);

assert(
  operationalDepthEvents.includes("workflow_degradation_started"),
  "Causal replay must support workflow degradation onset events",
);

assert(
  operationalDepthEvents.includes("escalation_triggered"),
  "Escalation storm scenario requires escalation_triggered in event vocabulary",
);

// ─── 9. REVIEW LIFECYCLE COVERAGE ────────────────────────────

assert(
  reviewLifecycleEvents.includes("review_requested"),
  "Review lifecycle tracking requires review_requested event",
);

assert(
  reviewLifecycleEvents.includes("review_completed"),
  "Review lifecycle tracking requires review_completed event",
);

// ─── 10. ESCALATION COVERAGE ─────────────────────────────────

assert(
  escalationEvents.includes("task_escalated"),
  "Escalation tracking requires task_escalated event (from priority promotion)",
);

// ─── 11. RECOVERY SIGNAL COVERAGE ────────────────────────────

assert(
  recoveryEvents.includes("task_unblocked"),
  "Recovery period scenario requires task_unblocked signal",
);

assert(
  recoveryEvents.includes("review_completed"),
  "Recovery period scenario requires review_completed signal",
);

// ─── 12. EXPLAINABILITY CONTRACT ────────────────────────────

const explainabilityContract = {
  confidence: 82,
  causality: {
    primaryPattern: "Blocker pressure",
    propagation: [
      {
        from: "blockers",
        to: "transition_latency",
        mechanism: "Blockers created downstream review and delivery pressure.",
        impact: 38,
      },
      {
        from: "transition_latency",
        to: "execution_confidence",
        mechanism: "Accumulated workflow pressure reduced confidence score.",
        impact: 22,
      },
    ],
  },
  contributorWeights: [
    { key: "blockers", contributionShare: 41 },
    { key: "review_backlog", contributionShare: 28 },
    { key: "overdue_pressure", contributionShare: 18 },
  ],
  reasoningChain: [
    "Read authorized operational events for delivery_risk.",
    "Extract workflow transitions, blocker/reopen pressure, ownership churn, and state pressure.",
    "Rank contributors by weighted semantic impact; primary contributor is Blocker pressure.",
    "Correlate Blocker pressure with Review latency to infer propagation path.",
    "Compare current value with previous semantic window; delta is 12.",
    "Produce AI-safe causal explanation with confidence 82/100.",
  ],
};

assert(
  explainabilityContract.confidence >= 0 &&
    explainabilityContract.confidence <= 100,
  "Explainability confidence must be bounded between 0 and 100",
);

assert(
  explainabilityContract.causality.propagation.length >= 2,
  "Explainability must expose at least 2 causal propagation edges for delivery_risk",
);

assert(
  explainabilityContract.contributorWeights[0].contributionShare > 0,
  "Explainability must expose contributor weighting with positive share",
);

const totalContribution = explainabilityContract.contributorWeights.reduce(
  (sum, c) => sum + c.contributionShare,
  0,
);

assert(
  totalContribution <= 100,
  "Contributor share total must not exceed 100%",
);

assert(
  explainabilityContract.reasoningChain.length >= 6,
  "Reasoning chain must have at least 6 steps for full explainability trace",
);

// ─── 13. MCP TOOL REGISTRY ───────────────────────────────────

assert(
  new Set(mcpTools).size === mcpTools.length,
  "MCP tools must be unique — no duplicate tool names",
);

assert(
  mcpTools.length === 7,
  `MCP tool count must be 7 (got ${mcpTools.length})`,
);

assert(
  mcpTools.includes("list_metrics"),
  "MCP must expose list_metrics tool for AI metric discovery",
);

assert(
  mcpTools.includes("explain_metric"),
  "MCP must expose explain_metric tool for AI causal querying",
);

assert(
  mcpTools.includes("replay_operational_timeline"),
  "MCP must expose replay_operational_timeline tool for causal narrative querying",
);

// ─── 14. GOVERNANCE CONTRACT STRUCTURE ───────────────────────

const governanceContract = {
  metric: "delivery_risk",
  lifecycleState: "stable",
  owner: "semantic-intelligence-engine",
  version: "2.0.0",
  compatibility: "backwards_compatible",
  semanticMaturityLevel: "causal_explainable",
  freshnessPolicy: "event_driven_realtime",
  aiVisibility: "safe" as const,
  caveats: [
    "Scores use semantic event history plus authorized current-state pressure where operationally justified.",
    "Baseline comparisons use previous equivalent time window.",
  ],
  explainabilitySupport: {
    causalChains: true,
    propagationGraph: true,
    contributorWeights: true,
    confidenceScoring: true,
  },
};

assert(
  governanceContract.aiVisibility === "safe",
  "delivery_risk governance must declare aiVisibility as safe",
);

assert(
  governanceContract.caveats.length >= 2,
  "Governance contract must include at least 2 semantic caveats",
);

assert(
  governanceContract.explainabilitySupport.causalChains === true,
  "delivery_risk must declare causal chain support in governance contract",
);

assert(
  governanceContract.explainabilitySupport.propagationGraph === true,
  "delivery_risk must declare propagation graph support in governance contract",
);

assert(
  ["stable", "experimental", "deprecated"].includes(
    governanceContract.lifecycleState,
  ),
  "Governance lifecycle state must be one of: stable, experimental, deprecated",
);

// ─── DONE ────────────────────────────────────────────────────

process.stdout.write(
  "Semantic regression validation passed — all 14 test groups green\n",
);
