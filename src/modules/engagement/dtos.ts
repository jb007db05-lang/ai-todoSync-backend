import type { EngagementEventName, TargetingRuntimeContext } from "./types.js";

export interface RuntimeEvaluationDto extends TargetingRuntimeContext {
  eventName?: string;
  eventProperties?: Record<string, unknown>;
}

export interface EngagementTrackDto {
  eventName: EngagementEventName;
  guideId?: string;
  surveyId?: string;
  checklistId?: string;
  stepId?: string;
  sessionId?: string;
  userId?: string;
  properties?: Record<string, unknown>;
}

export interface RuntimeGuideDto {
  id: string;
  title: string;
  description?: string;
  type: string;
  priority: string;
  theme: Record<string, unknown>;
  steps: unknown[];
  targetingRules: unknown;
  frequencyRules: Record<string, unknown>;
  scheduleRules: Record<string, unknown>;
  metadata: Record<string, unknown>;
  eligibility: {
    reasons: string[];
    matchedConditions: string[];
    failedConditions: string[];
  };
}
