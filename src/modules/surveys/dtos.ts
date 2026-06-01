import type {
  FrequencyRules,
  GuidePriority,
  GuideStatus,
  ScheduleRules,
  SurveyQuestion,
  TargetingRuleGroup,
} from "../engagement/types.js";

export interface CreateSurveyDto {
  title: string;
  description?: string;
  status?: GuideStatus;
  priority?: GuidePriority;
  questions: SurveyQuestion[];
  targetingRules?: TargetingRuleGroup | null;
  triggerRules?: TargetingRuleGroup | null;
  frequencyRules?: FrequencyRules;
  scheduleRules?: ScheduleRules;
  metadata?: Record<string, unknown>;
}

export interface UpdateSurveyDto extends Partial<CreateSurveyDto> {}

export interface SubmitSurveyResponseDto {
  userId?: string;
  sessionId?: string;
  answers: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SurveyQueryDto {
  status?: GuideStatus;
  search?: string;
}
