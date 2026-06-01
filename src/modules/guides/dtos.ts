import type {
  FrequencyRules,
  GuidePriority,
  GuideStatus,
  GuideType,
  ScheduleRules,
  TargetingRuleGroup,
  TourStep,
} from "../engagement/types.js";

export interface CreateGuideDto {
  title: string;
  description?: string;
  type: GuideType;
  status?: GuideStatus;
  theme?: Record<string, unknown>;
  priority?: GuidePriority;
  targetingRules?: TargetingRuleGroup | null;
  frequencyRules?: FrequencyRules;
  scheduleRules?: ScheduleRules;
  steps?: TourStep[];
  metadata?: Record<string, unknown>;
}

export interface UpdateGuideDto extends Partial<CreateGuideDto> {}

export interface GuideQueryDto {
  status?: GuideStatus;
  type?: GuideType;
  search?: string;
}
