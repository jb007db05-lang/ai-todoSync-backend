export type GuideType =
  | "TOUR"
  | "SMART_TIP"
  | "HOTSPOT"
  | "CHECKLIST"
  | "BANNER"
  | "MODAL"
  | "SURVEY";

export type GuideStatus = "DRAFT" | "LIVE" | "PAUSED" | "ARCHIVED";
export type GuidePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type GuidePlacement =
  | "TOP"
  | "BOTTOM"
  | "LEFT"
  | "RIGHT"
  | "CENTER"
  | "AUTO";

export type SurveyQuestionType =
  | "NPS"
  | "TEXT"
  | "TEXTAREA"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "RATING_SCALE"
  | "DROPDOWN"
  | "YES_NO"
  | "CSAT"
  | "CES"
  | "EMOJI"
  | "OPINION_SCALE"
  | "FILE_UPLOAD"
  | "CONTACT";

export type NpsCategory = "PROMOTER" | "PASSIVE" | "DETRACTOR" | "NONE";

export type TargetingConditionType =
  | "URL_EQUALS"
  | "URL_CONTAINS"
  | "URL_REGEX"
  | "REFERRER_EQUALS"
  | "REFERRER_CONTAINS"
  | "ROLE_EQUALS"
  | "PLAN_EQUALS"
  | "ACCOUNT_AGE"
  | "TENANT_EQUALS"
  | "EVENT_TRIGGERED"
  | "EVENT_NOT_TRIGGERED"
  | "RAGE_CLICK_COUNT"
  | "VISITED_PAGE"
  | "COMPLETED_WORKFLOW"
  | "ABANDONED_FORM"
  | "SESSION_DURATION"
  | "SESSION_COUNT"
  | "ENGAGEMENT_SCORE"
  | "SHOW_ONCE"
  | "SHOW_EVERY_X_DAYS"
  | "COOLDOWN"
  | "TIME_WINDOW"
  | "EXIT_INTENT"
  | "IDLE_TIMEOUT";

export type TargetingOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "REGEX"
  | "IN"
  | "NOT_IN"
  | "BETWEEN";

export interface TargetingCondition {
  id: string;
  type: TargetingConditionType;
  operator?: TargetingOperator;
  value?: unknown;
  eventName?: string;
  property?: string;
  windowDays?: number;
  count?: number;
  metadata?: Record<string, unknown>;
}

export interface TargetingRuleGroup {
  id: string;
  operator: "AND" | "OR";
  conditions?: TargetingCondition[];
  groups?: TargetingRuleGroup[];
}

export interface GuideEligibilityResult {
  eligible: boolean;
  reasons: string[];
  matchedConditions: string[];
  failedConditions: string[];
}

export interface FrequencyRules {
  showOnceEver?: boolean;
  showOncePerSession?: boolean;
  everyXDays?: number;
  maxDisplays?: number;
  cooldownHours?: number;
}

export interface ScheduleRules {
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  timezone?: string;
  windows?: Array<{
    start: string;
    end: string;
    daysOfWeek?: number[];
  }>;
}

export interface TourStep {
  id: string;
  title: string;
  description?: string;
  selector?: string;
  placement: GuidePlacement;
  actionType?: "NEXT" | "CLICK" | "NAVIGATE" | "SUBMIT" | "CUSTOM";
  nextStep?: string | null;
  branchConditions?: TargetingRuleGroup | null;
  analytics?: Record<string, unknown>;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  linkedEvent?: string;
  completionConditions?: TargetingRuleGroup | null;
  completed?: boolean;
  completedAt?: Date | string | null;
  estimatedMinutes?: number;
}

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  title: string;
  description?: string;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  branchConditions?: TargetingRuleGroup | null;
}

export interface TargetingRuntimeContext {
  tenantId: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  referrer?: string;
  role?: string;
  plan?: string;
  accountCreatedAt?: string | Date;
  userProperties?: Record<string, unknown>;
  session?: {
    durationSeconds?: number;
    count?: number;
    engagementScore?: number;
  };
  workflow?: {
    completed?: string[];
  };
  now?: string | Date;
  eventName?: string;
  eventProperties?: Record<string, unknown>;
}

export type EngagementEventName =
  | "guide_shown"
  | "guide_started"
  | "guide_completed"
  | "guide_dismissed"
  | "step_viewed"
  | "step_completed"
  | "step_dropped"
  | "survey_started"
  | "survey_completed"
  | "survey_abandoned"
  | "banner_clicked"
  | "hotspot_opened";

export const GUIDE_TYPES: GuideType[] = [
  "TOUR",
  "SMART_TIP",
  "HOTSPOT",
  "CHECKLIST",
  "BANNER",
  "MODAL",
  "SURVEY",
];

export const GUIDE_STATUSES: GuideStatus[] = [
  "DRAFT",
  "LIVE",
  "PAUSED",
  "ARCHIVED",
];

export const GUIDE_PRIORITIES: GuidePriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export const GUIDE_PLACEMENTS: GuidePlacement[] = [
  "TOP",
  "BOTTOM",
  "LEFT",
  "RIGHT",
  "CENTER",
  "AUTO",
];

export const SURVEY_QUESTION_TYPES: SurveyQuestionType[] = [
  "NPS",
  "TEXT",
  "TEXTAREA",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "RATING_SCALE",
  "DROPDOWN",
  "YES_NO",
  "CSAT",
  "CES",
  "EMOJI",
  "OPINION_SCALE",
  "FILE_UPLOAD",
  "CONTACT",
];

export const ENGAGEMENT_EVENT_NAMES: EngagementEventName[] = [
  "guide_shown",
  "guide_started",
  "guide_completed",
  "guide_dismissed",
  "step_viewed",
  "step_completed",
  "step_dropped",
  "survey_started",
  "survey_completed",
  "survey_abandoned",
  "banner_clicked",
  "hotspot_opened",
];
